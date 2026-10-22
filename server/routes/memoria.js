// THE BOLD BRAIN — MEMÓRIA DE DECISÕES ("Por que fazemos dessa forma?"), RADAR DE AUTOMAÇÕES e
// PREFERÊNCIAS DE NOTIFICAÇÃO da pessoa. Montado dentro de `business` (já exige usuário interno).
// Regras: nada é apagado (decisões mudam de estado; editar uma decisão CONFIRMADA cria nova versão e a anterior vira SUBSTITUÍDA);
// confirmar é sempre ato humano com permissão; o Radar é determinístico (sem IA), só sugere — aprovar registra a decisão
// e NUNCA cria ou liga uma automação.
import { Router } from 'express';
import { db, one, all, insert, update, uid, now, nowMs, parseJSON, tx } from '../db.js';
import { requirePerm } from '../lib/auth.js';
import { can, canAccessClient, assertClient, scopeSQL, HttpError } from '../lib/permissions.js';
import { log, bus } from '../lib/core.js';
import { prefsFor, savePrefs } from '../services/notification-prefs.js';

db.exec(`
CREATE TABLE IF NOT EXISTS brain_decisions (
  id TEXT PRIMARY KEY, root_id TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  decision TEXT NOT NULL, context TEXT, reason TEXT, owner_id TEXT REFERENCES users(id), participants TEXT NOT NULL DEFAULT '[]',
  decided_at TEXT, origin TEXT NOT NULL DEFAULT 'manual', -- manual | reuniao | chat | cliente | outro
  origin_ref TEXT, client_id TEXT, content_id TEXT, meeting_id TEXT,
  area TEXT, -- estrategia | equipe | financeiro | operacao | regra
  consequence TEXT, valid_until TEXT, links TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'rascunho', -- rascunho | sugerida | confirmada | revogada | substituida
  replaced_by TEXT, replaces TEXT, status_note TEXT, confirmed_by TEXT, confirmed_at TEXT,
  created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_brain_decisions_root ON brain_decisions(root_id, version);
CREATE INDEX IF NOT EXISTS ix_brain_decisions_client ON brain_decisions(client_id, status);
CREATE TRIGGER IF NOT EXISTS brain_decisions_no_delete BEFORE DELETE ON brain_decisions BEGIN SELECT RAISE(ABORT, 'decisões nunca são apagadas'); END;
-- Histórico de versões / eventos de cada decisão (append-only): retrato completo a cada mudança
CREATE TABLE IF NOT EXISTS brain_decision_versions (
  id TEXT PRIMARY KEY, decision_id TEXT NOT NULL, root_id TEXT NOT NULL, version INTEGER NOT NULL,
  event TEXT NOT NULL, status TEXT NOT NULL, snapshot TEXT NOT NULL, note TEXT, actor_id TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_brain_decision_versions ON brain_decision_versions(root_id, created_at);
CREATE TRIGGER IF NOT EXISTS brain_decision_versions_no_update BEFORE UPDATE ON brain_decision_versions BEGIN SELECT RAISE(ABORT, 'histórico de decisões é append-only'); END;
CREATE TRIGGER IF NOT EXISTS brain_decision_versions_no_delete BEFORE DELETE ON brain_decision_versions BEGIN SELECT RAISE(ABORT, 'histórico de decisões é append-only'); END;
-- Radar de Automações: um registro por padrão (chave idempotente = ação|entidade); a decisão humana sobrevive à nova detecção
CREATE TABLE IF NOT EXISTS automation_suggestions (
  id TEXT PRIMARY KEY, pattern_key TEXT NOT NULL UNIQUE, action TEXT NOT NULL, entity_type TEXT,
  occurrences INTEGER NOT NULL DEFAULT 0, people INTEGER NOT NULL DEFAULT 0, per_week REAL NOT NULL DEFAULT 0,
  peak_occurrences INTEGER NOT NULL DEFAULT 0, examples TEXT NOT NULL DEFAULT '[]', process TEXT,
  first_seen_at TEXT, last_seen_at TEXT, detected_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sugerida', -- sugerida | em_revisao | aprovada_regra | descartada
  decision_note TEXT, decided_by TEXT, decided_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS automation_suggestions_no_delete BEFORE DELETE ON automation_suggestions BEGIN SELECT RAISE(ABORT, 'sugestões nunca são apagadas'); END;
`);

export const memoria = Router();

// ═════════════ MEMÓRIA DE DECISÕES ═════════════
export const DECISION_STATUSES = [
  { key: 'rascunho', label: 'Rascunho' }, { key: 'sugerida', label: 'Sugerida' }, { key: 'confirmada', label: 'Confirmada' },
  { key: 'revogada', label: 'Revogada' }, { key: 'substituida', label: 'Substituída' },
];
export const DECISION_ORIGINS = [
  { key: 'manual', label: 'Manual' }, { key: 'reuniao', label: 'Reunião' }, { key: 'chat', label: 'Chat' }, { key: 'cliente', label: 'Cliente' }, { key: 'outro', label: 'Outro' },
];
export const DECISION_AREAS = [
  { key: 'estrategia', label: 'Estratégia' }, { key: 'equipe', label: 'Equipe' }, { key: 'financeiro', label: 'Financeiro' }, { key: 'operacao', label: 'Operação' }, { key: 'regra', label: 'Regra' },
];
const keys = (l) => l.map((x) => x.key);
// Transições permitidas por estado (SUBSTITUÍDA só acontece editando uma CONFIRMADA)
const NEXT = { rascunho: ['sugerida', 'confirmada', 'revogada'], sugerida: ['rascunho', 'confirmada', 'revogada'], confirmada: ['revogada'], revogada: [], substituida: [] };

export const canWriteDecision = (u) => can(u, 'brain', 'create') || can(u, 'brain', 'edit');
export const canConfirmDecision = (u) => u?.role_key === 'ceo' || can(u, 'brain', 'edit');

const FIELDS = ['decision', 'context', 'reason', 'owner_id', 'participants', 'decided_at', 'origin', 'origin_ref', 'client_id', 'content_id', 'meeting_id', 'area', 'consequence', 'valid_until', 'links'];
const txt = (v, max = 4000) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
// Datas de decisão/validade são dias no fuso da operação (America/Sao_Paulo), guardadas como AAAA-MM-DD
const spDay = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const today = () => spDay(new Date(nowMs()));
const dateOnly = (v, label) => {
  if (v == null || v === '') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !Number.isNaN(new Date(`${v}T12:00:00Z`).getTime())) return String(v);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new HttpError(422, `${label}: data inválida.`);
  return spDay(d);
};

// Valida e normaliza o corpo (tudo que vem da tela). Vínculos precisam existir e estar no escopo de quem grava.
function clean(user, b, base = {}) {
  const v = { ...base };
  for (const f of FIELDS) if (b[f] !== undefined) v[f] = b[f];
  const out = {
    decision: txt(v.decision, 1000), context: txt(v.context), reason: txt(v.reason), consequence: txt(v.consequence), origin_ref: txt(v.origin_ref, 500),
    owner_id: txt(v.owner_id, 80), client_id: txt(v.client_id, 80), content_id: txt(v.content_id, 80), meeting_id: txt(v.meeting_id, 80),
    origin: v.origin || 'manual', area: txt(v.area, 40),
    decided_at: dateOnly(v.decided_at, 'Data da decisão'), valid_until: dateOnly(v.valid_until, 'Validade'),
  };
  if (!out.decision) throw new HttpError(422, 'Descreva a decisão.');
  if (!keys(DECISION_ORIGINS).includes(out.origin)) throw new HttpError(422, 'Origem inválida.');
  if (out.area && !keys(DECISION_AREAS).includes(out.area)) throw new HttpError(422, 'Área inválida.');
  if (out.area === 'financeiro' && !can(user, 'financeiro', 'view')) throw new HttpError(403, 'Decisões da área financeira exigem acesso ao Financeiro.');
  if (out.owner_id && !one("SELECT 1 FROM users WHERE id=? AND role_key<>'cliente'", out.owner_id)) throw new HttpError(422, 'Responsável inválido.');
  const parts = Array.isArray(v.participants) ? v.participants : parseJSON(v.participants, []);
  out.participants = JSON.stringify([...new Set((parts || []).map(String))].slice(0, 30).filter((id) => one("SELECT 1 FROM users WHERE id=? AND role_key<>'cliente'", id)));
  const links = Array.isArray(v.links) ? v.links : parseJSON(v.links, []);
  const ls = (links || []).map((l) => String(l).trim()).filter(Boolean).slice(0, 10);
  for (const l of ls) if (!/^https?:\/\/\S+$/i.test(l) || l.length > 500) throw new HttpError(422, `Link inválido (use http:// ou https://): ${l.slice(0, 60)}`);
  out.links = JSON.stringify(ls);
  if (out.client_id) { if (!one('SELECT 1 FROM clients WHERE id=?', out.client_id)) throw new HttpError(422, 'Cliente não encontrado.'); assertClient(user, out.client_id); }
  if (out.content_id) {
    const c = one('SELECT client_id FROM contents WHERE id=?', out.content_id);
    if (!c) throw new HttpError(422, 'Conteúdo não encontrado.');
    assertClient(user, c.client_id);
    out.client_id ||= c.client_id;
  }
  if (out.meeting_id) {
    const m = one('SELECT client_id FROM meetings WHERE id=?', out.meeting_id);
    if (!m) throw new HttpError(422, 'Reunião não encontrada.');
    if (m.client_id) { assertClient(user, m.client_id); out.client_id ||= m.client_id; }
  }
  return out;
}

const nameOf = (id) => (id ? one('SELECT name FROM users WHERE id=?', id)?.name || null : null);
export function decisionDTO(d) {
  const participants = parseJSON(d.participants, []);
  return {
    ...d, participants, participant_names: participants.map(nameOf).filter(Boolean), links: parseJSON(d.links, []),
    owner_name: nameOf(d.owner_id), created_by_name: nameOf(d.created_by), confirmed_by_name: nameOf(d.confirmed_by),
    client_name: d.client_id ? one('SELECT name FROM clients WHERE id=?', d.client_id)?.name || null : null,
    content_label: d.content_id ? (() => { const c = one('SELECT number, title FROM contents WHERE id=?', d.content_id); return c ? `#${c.number} ${c.title}` : null; })() : null,
    meeting_label: d.meeting_id ? one('SELECT title FROM meetings WHERE id=?', d.meeting_id)?.title || null : null,
    expired: !!(d.valid_until && d.status === 'confirmada' && d.valid_until < today()),
  };
}
function snapshot(d, event, actor, note = null) {
  insert('brain_decision_versions', { id: uid('bdv_'), decision_id: d.id, root_id: d.root_id, version: d.version, event, status: d.status, snapshot: JSON.stringify(d), note, actor_id: actor || null, created_at: now() });
}
// Quem pode ver uma decisão: cliente vinculado no escopo; área financeira só com acesso ao Financeiro
function visible(user, d) {
  if (d.client_id && !canAccessClient(user, d.client_id)) return false;
  if (d.area === 'financeiro' && !can(user, 'financeiro', 'view')) return false;
  return true;
}
function decisionOr404(req) {
  const d = one('SELECT * FROM brain_decisions WHERE id=?', req.params.id);
  if (!d || !visible(req.user, d)) throw new HttpError(404, 'Decisão não encontrada.');
  return d;
}

// Cria uma decisão (usado pela tela e pelo registro vindo de reunião)
export function createDecision(user, body, { status = 'rascunho', event = 'criada' } = {}) {
  const v = clean(user, body);
  if (status === 'confirmada' && !canConfirmDecision(user)) throw new HttpError(403, 'Confirmar uma decisão exige permissão de edição do Brain (ou CEO).');
  const id = uid('bd_'), ts = now();
  const row = tx(() => {
    const d = insert('brain_decisions', { id, root_id: id, version: 1, ...v, owner_id: v.owner_id || user.id, decided_at: v.decided_at || today(), status,
      confirmed_by: status === 'confirmada' ? user.id : null, confirmed_at: status === 'confirmada' ? ts : null, created_by: user.id, created_at: ts, updated_at: ts }) && one('SELECT * FROM brain_decisions WHERE id=?', id);
    snapshot(d, event, user.id);
    return d;
  });
  log({ actor: user.id, action: 'brain.decisao_criada', entity: 'brain_decision', id, client: row.client_id, summary: `Decisão registrada (${status}): ${row.decision.slice(0, 120)}` });
  return row;
}

memoria.get('/brain/decisions', requirePerm('brain', 'view'), (req, res) => {
  const u = req.user;
  const sc = scopeSQL(u, 'd.client_id');
  const base = [`(d.client_id IS NULL OR ${sc.sql})`];
  const bp = [...sc.params];
  if (!can(u, 'financeiro', 'view')) base.push("COALESCE(d.area,'')<>'financeiro'");
  const where = [...base], p = [...bp];
  const { q, client_id, area, status } = req.query;
  if (q?.trim()) { where.push('(d.decision LIKE ? OR d.context LIKE ? OR d.reason LIKE ? OR d.consequence LIKE ?)'); const l = `%${String(q).trim()}%`; p.push(l, l, l, l); }
  if (client_id) { where.push('d.client_id=?'); p.push(String(client_id)); }
  if (area) { where.push('d.area=?'); p.push(String(area)); }
  if (status && status !== 'todas') { where.push('d.status=?'); p.push(String(status)); } else if (!status) where.push("d.status<>'substituida'");
  const items = all(`SELECT d.* FROM brain_decisions d WHERE ${where.join(' AND ')} ORDER BY CASE d.status WHEN 'sugerida' THEN 0 WHEN 'rascunho' THEN 1 WHEN 'confirmada' THEN 2 ELSE 3 END, COALESCE(d.decided_at, d.created_at) DESC LIMIT 300`, ...p).map(decisionDTO);
  const counts = Object.fromEntries(all(`SELECT d.status, COUNT(*) n FROM brain_decisions d WHERE ${base.join(' AND ')} GROUP BY d.status`, ...bp).map((r) => [r.status, r.n]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  res.json({
    state: total ? 'ativo' : 'dados_insuficientes', total, counts, items,
    statuses: DECISION_STATUSES, origins: DECISION_ORIGINS, areas: DECISION_AREAS.filter((a) => a.key !== 'financeiro' || can(u, 'financeiro', 'view')),
    can: { write: canWriteDecision(u), confirm: canConfirmDecision(u) },
    people: all("SELECT id, name FROM users WHERE active=1 AND role_key<>'cliente' ORDER BY name"),
  });
});
memoria.get('/brain/decisions/:id', requirePerm('brain', 'view'), (req, res) => {
  const d = decisionOr404(req);
  res.json({
    ...decisionDTO(d),
    versions: all('SELECT id, version, status, decision, replaced_by, created_at, updated_at FROM brain_decisions WHERE root_id=? ORDER BY version DESC', d.root_id),
    history: all('SELECT v.id, v.decision_id, v.version, v.event, v.status, v.note, v.created_at, u.name actor_name FROM brain_decision_versions v LEFT JOIN users u ON u.id=v.actor_id WHERE v.root_id=? ORDER BY v.created_at DESC, v.rowid DESC', d.root_id),
  });
});
memoria.post('/brain/decisions', requirePerm('brain', 'view'), (req, res) => {
  if (!canWriteDecision(req.user)) throw new HttpError(403, 'Sem permissão para registrar decisões.');
  const status = ['rascunho', 'sugerida', 'confirmada'].includes(req.body?.status) ? req.body.status : 'rascunho';
  res.json(decisionDTO(createDecision(req.user, req.body || {}, { status })));
});
// Editar: rascunho/sugerida mudam no lugar (com retrato no histórico); CONFIRMADA vira nova versão e a anterior fica SUBSTITUÍDA
memoria.put('/brain/decisions/:id', requirePerm('brain', 'view'), (req, res) => {
  const u = req.user;
  if (!canWriteDecision(u)) throw new HttpError(403, 'Sem permissão para editar decisões.');
  const d = decisionOr404(req);
  if (['revogada', 'substituida'].includes(d.status)) throw new HttpError(409, `Decisão ${d.status === 'revogada' ? 'revogada' : 'substituída'} não pode ser editada.`);
  const v = clean(u, req.body || {}, d);
  const note = txt(req.body?.note, 500);
  if (d.status !== 'confirmada') {
    const row = tx(() => { const r = update('brain_decisions', { id: d.id }, { ...v, updated_at: now() }) || one('SELECT * FROM brain_decisions WHERE id=?', d.id); snapshot(r, 'editada', u.id, note); return r; });
    log({ actor: u.id, action: 'brain.decisao_editada', entity: 'brain_decision', id: d.id, client: row.client_id, summary: `Decisão editada (${row.status}): ${row.decision.slice(0, 120)}` });
    return res.json(decisionDTO(one('SELECT * FROM brain_decisions WHERE id=?', d.id)));
  }
  if (!canConfirmDecision(u)) throw new HttpError(403, 'Alterar uma decisão confirmada exige permissão de edição do Brain (ou CEO).');
  const ts = now(), id = uid('bd_');
  const row = tx(() => {
    const nv = insert('brain_decisions', { id, root_id: d.root_id, version: d.version + 1, ...v, owner_id: v.owner_id || d.owner_id, status: 'confirmada', replaces: d.id,
      confirmed_by: u.id, confirmed_at: ts, created_by: u.id, created_at: ts, updated_at: ts }) && one('SELECT * FROM brain_decisions WHERE id=?', id);
    update('brain_decisions', { id: d.id }, { status: 'substituida', replaced_by: id, status_note: note || `Substituída pela versão ${nv.version}`, updated_at: ts });
    snapshot(one('SELECT * FROM brain_decisions WHERE id=?', d.id), 'substituida', u.id, note);
    snapshot(nv, 'nova_versao', u.id, note);
    return nv;
  });
  log({ actor: u.id, action: 'brain.decisao_versionada', entity: 'brain_decision', id, client: row.client_id, before: d.id, after: id, summary: `Decisão confirmada alterada → V${row.version} (V${d.version} substituída): ${row.decision.slice(0, 100)}` });
  res.json(decisionDTO(row));
});
memoria.post('/brain/decisions/:id/status', requirePerm('brain', 'view'), (req, res) => {
  const u = req.user;
  if (!canWriteDecision(u)) throw new HttpError(403, 'Sem permissão para alterar decisões.');
  const d = decisionOr404(req);
  const to = String(req.body?.status || '');
  const note = txt(req.body?.note, 1000);
  if (!(NEXT[d.status] || []).includes(to)) throw new HttpError(409, `Transição inválida: ${d.status} → ${to || '—'}.`);
  if ((to === 'confirmada' || d.status === 'confirmada') && !canConfirmDecision(u)) throw new HttpError(403, 'Confirmar ou revogar uma decisão confirmada exige permissão de edição do Brain (ou CEO).');
  if (to === 'revogada' && !note) throw new HttpError(422, 'Informe o motivo da revogação.');
  const ts = now();
  const patch = { status: to, status_note: note, updated_at: ts, ...(to === 'confirmada' ? { confirmed_by: u.id, confirmed_at: ts } : {}) };
  tx(() => { update('brain_decisions', { id: d.id }, patch); snapshot(one('SELECT * FROM brain_decisions WHERE id=?', d.id), to, u.id, note); });
  log({ actor: u.id, action: 'brain.decisao_status', entity: 'brain_decision', id: d.id, client: d.client_id, before: d.status, after: to, summary: `Decisão ${d.status} → ${to}: ${d.decision.slice(0, 100)}${note ? ` (${note.slice(0, 80)})` : ''}` });
  res.json(decisionDTO(one('SELECT * FROM brain_decisions WHERE id=?', d.id)));
});

// Reunião → Memória: quando o resumo interno é aplicado (confirmação humana item a item), as DECISÕES confirmadas
// entram na memória com origem "reunião". CONFIRMADA só se quem aplicou pode confirmar no Brain; senão fica SUGERIDA.
export function registerMeetingDecisions(meetingId, actorId) {
  const actor = actorId && one('SELECT * FROM users WHERE id=?', actorId);
  const m = one('SELECT * FROM meetings WHERE id=?', meetingId);
  if (!actor || !m) return 0;
  let n = 0;
  for (const it of all("SELECT * FROM meeting_items WHERE meeting_id=? AND kind='decisao' AND confirmed=1 ORDER BY created_at", m.id)) {
    const ref = `meeting_item:${it.id}`;
    if (one('SELECT 1 FROM brain_decisions WHERE origin_ref=?', ref)) continue;
    const confirm = canConfirmDecision(actor);
    try {
      createDecision(actor, { decision: it.body, context: `Reunião “${m.title}” (${new Date(m.starts_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })})`, origin: 'reuniao', origin_ref: ref, meeting_id: m.id, client_id: m.client_id, owner_id: it.owner_id || actor.id, decided_at: m.starts_at },
        { status: confirm ? 'confirmada' : 'sugerida', event: 'registrada_da_reuniao' });
      n++;
    } catch { /* sem escopo/dado inválido: não registra, nada quebra */ }
  }
  return n;
}
bus.on('activity', (row) => {
  if (row?.action !== 'reuniao.resumo_interno_aplicado' || !row.entity_id) return;
  try { registerMeetingDecisions(row.entity_id, row.actor_id); } catch { /* nunca derruba o fluxo da reunião */ }
});

// ═════════════ RADAR DE AUTOMAÇÕES ═════════════
export const RADAR_THRESHOLD = 5; // ocorrências mínimas na janela para virar sugestão
export const RADAR_WINDOW_DAYS = 30;
export const RADAR_STATUSES = [
  { key: 'sugerida', label: 'Sugerida' }, { key: 'em_revisao', label: 'Em revisão' }, { key: 'aprovada_regra', label: 'Aprovada para virar regra' }, { key: 'descartada', label: 'Descartada' },
];
const RADAR_NEXT = { sugerida: ['em_revisao', 'aprovada_regra', 'descartada'], em_revisao: ['sugerida', 'aprovada_regra', 'descartada'], aprovada_regra: ['em_revisao'], descartada: ['em_revisao'] };
// Ações que não são trabalho operacional repetível: login, visualização, sistema, IA, migração, o próprio radar e preferências
const IGNORED = [/^auth\./, /^view$/, /\.view$/, /^ia\./, /^migracao\./, /^radar\./, /^notificacoes\./, /^acesso\.revelado$/];
export const ignoredAction = (a) => IGNORED.some((r) => r.test(a));
const PROCESS = {
  conteudo: 'Produção de conteúdo', etapa: 'Produção de conteúdo', legenda: 'Produção de conteúdo', versao: 'Produção de conteúdo', midia: 'Produção de conteúdo', tema: 'Planejamento editorial',
  ajuste: 'Revisão e ajustes', comentario: 'Revisão e ajustes', revisao: 'Revisão e ajustes', tarefa: 'Tarefas', reuniao: 'Reuniões', cliente: 'Clientes', onboarding: 'Onboarding',
  solicitacao: 'Solicitações do cliente', decisao: 'Decisões pedidas ao cliente', pergunta: 'Perguntas ao cliente', material: 'Materiais do cliente', crm: 'Comercial (CRM)', financeiro: 'Financeiro',
  usuario: 'Equipe e acessos', equipe: 'Equipe e acessos', role: 'Equipe e acessos', divisao: 'Divisão de clientes', brain: 'The Bold Brain', pendencia: 'Pendências', chat: 'Comunicação', canal: 'Comunicação',
  integracao: 'Integrações', configuracao: 'Configurações', processo: 'Processos', automacao: 'Automações', pulso: 'Área do cliente', satisfacao: 'Área do cliente', insight: 'Insights', legado: 'Itens herdados',
};
export const processOf = (action) => PROCESS[String(action).split('.')[0]] || 'Processo não mapeado';
const keyOf = (action, entity) => `${action}|${entity || ''}`;

// Detector determinístico: conta ações MANUAIS de pessoas na janela e grava/atualiza uma sugestão por padrão.
// Idempotente: rodar de novo só atualiza números; o estado decidido por uma pessoa nunca é sobrescrito.
export function detectPatterns() {
  const since = new Date(nowMs() - RADAR_WINDOW_DAYS * 864e5).toISOString();
  const ts = now();
  const rows = all(`SELECT action, entity_type, COUNT(*) n, COUNT(DISTINCT actor_id) people, MIN(created_at) first_at, MAX(created_at) last_at FROM activity_logs
    WHERE actor_kind='usuario' AND origin='manual' AND actor_id IS NOT NULL AND created_at>=? GROUP BY action, entity_type`, since).filter((r) => !ignoredAction(r.action));
  const current = new Map(rows.map((r) => [keyOf(r.action, r.entity_type), r]));
  const examplesFor = (r) => JSON.stringify(all(`SELECT summary, client_id, created_at FROM activity_logs WHERE actor_kind='usuario' AND origin='manual' AND action=? AND entity_type=? AND created_at>=? ORDER BY created_at DESC LIMIT 5`, r.action, r.entity_type, since));
  let created = 0;
  tx(() => {
    for (const r of rows) {
      if (r.n < RADAR_THRESHOLD) continue;
      const k = keyOf(r.action, r.entity_type);
      const stats = { occurrences: r.n, people: r.people, per_week: Math.round((r.n / (RADAR_WINDOW_DAYS / 7)) * 10) / 10, examples: examplesFor(r), process: processOf(r.action), first_seen_at: r.first_at, last_seen_at: r.last_at, detected_at: ts, updated_at: ts };
      const ex = one('SELECT * FROM automation_suggestions WHERE pattern_key=?', k);
      if (ex) update('automation_suggestions', { id: ex.id }, { ...stats, peak_occurrences: Math.max(ex.peak_occurrences, r.n) });
      else { insert('automation_suggestions', { id: uid('as_'), pattern_key: k, action: r.action, entity_type: r.entity_type, ...stats, peak_occurrences: r.n, status: 'sugerida', created_at: ts }); created++; }
    }
    // Padrões já registrados que saíram da janela: números da janela atual (podem ficar abaixo do limiar), estado preservado
    for (const s of all('SELECT * FROM automation_suggestions')) {
      if (current.get(s.pattern_key)?.n >= RADAR_THRESHOLD) continue;
      const r = current.get(s.pattern_key);
      update('automation_suggestions', { id: s.id }, { occurrences: r?.n || 0, people: r?.people || 0, per_week: r ? Math.round((r.n / (RADAR_WINDOW_DAYS / 7)) * 10) / 10 : 0, detected_at: ts });
    }
  });
  if (created) log({ kind: 'sistema', action: 'radar.sugestoes_detectadas', entity: 'automation_suggestion', summary: `Radar de Automações: ${created} novo(s) padrão(ões) manual(is) repetido(s) (≥ ${RADAR_THRESHOLD} em ${RADAR_WINDOW_DAYS} dias)` });
  return created;
}
const canDecideRadar = (u) => u?.role_key === 'ceo' || can(u, 'automacoes', 'admin');
const suggestionDTO = (user) => (s) => ({
  ...s, active: s.occurrences >= RADAR_THRESHOLD, decided_by_name: nameOf(s.decided_by),
  // exemplos só de clientes que a pessoa pode ver (os números são agregados)
  examples: parseJSON(s.examples, []).filter((e) => !e.client_id || canAccessClient(user, e.client_id)).slice(0, 3).map((e) => ({ summary: e.summary, created_at: e.created_at })),
});

memoria.get('/brain/radar', requirePerm('automacoes', 'view'), (req, res) => {
  detectPatterns();
  const items = all("SELECT * FROM automation_suggestions ORDER BY CASE status WHEN 'sugerida' THEN 0 WHEN 'em_revisao' THEN 1 WHEN 'aprovada_regra' THEN 2 ELSE 3 END, occurrences DESC").map(suggestionDTO(req.user));
  res.json({ state: items.length ? 'ativo' : 'dados_insuficientes', threshold: RADAR_THRESHOLD, window_days: RADAR_WINDOW_DAYS, statuses: RADAR_STATUSES, items, can_decide: canDecideRadar(req.user) });
});
memoria.post('/brain/radar/:id/status', requirePerm('automacoes', 'view'), (req, res) => {
  if (!canDecideRadar(req.user)) throw new HttpError(403, 'Só quem administra Automações (ou a CEO) decide sobre sugestões do Radar.');
  const s = one('SELECT * FROM automation_suggestions WHERE id=?', req.params.id);
  if (!s) throw new HttpError(404, 'Sugestão não encontrada.');
  const to = String(req.body?.status || '');
  const note = txt(req.body?.note, 1000);
  if (!(RADAR_NEXT[s.status] || []).includes(to)) throw new HttpError(409, `Transição inválida: ${s.status} → ${to || '—'}.`);
  if (['aprovada_regra', 'descartada'].includes(to) && !note) throw new HttpError(422, 'Registre uma nota explicando a decisão.');
  // Só registra a decisão. Nenhuma automação é criada, ligada ou alterada aqui.
  update('automation_suggestions', { id: s.id }, { status: to, decision_note: note, decided_by: req.user.id, decided_at: now(), updated_at: now() });
  log({ actor: req.user.id, action: 'radar.decisao', entity: 'automation_suggestion', id: s.id, before: s.status, after: to, summary: `Radar de Automações · ${s.action}: ${s.status} → ${to}${note ? ` (${note.slice(0, 100)})` : ''}` });
  res.json(suggestionDTO(req.user)(one('SELECT * FROM automation_suggestions WHERE id=?', s.id)));
});

// ═════════════ PREFERÊNCIAS DE NOTIFICAÇÃO (só a própria pessoa, só equipe interna) ═════════════
memoria.get('/me/notification-prefs', (req, res) => res.json(prefsFor(req.user.id)));
memoria.put('/me/notification-prefs', (req, res) => {
  const changed = savePrefs(req.user.id, req.body || {});
  if (changed.length) log({ actor: req.user.id, action: 'notificacoes.preferencias', entity: 'user', id: req.user.id, summary: `Preferências de notificação alteradas: ${changed.join(' · ').slice(0, 400)}` });
  res.json(prefsFor(req.user.id));
});
