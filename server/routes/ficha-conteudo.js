// FICHA DO CONTEÚDO — a estrutura real do card do CR EDITORIAL (Notion): data, tipo, estratégia, objetivo, referência,
// responsáveis por função, corpo em blocos (capa, cards, roteiro, briefing) e etapas de aprovação separadas
// (tema · texto · legenda · arte · revisão interna · aprovação formal do cliente). Nada é inventado: campo vazio fica vazio,
// e o que veio do Notion fica marcado como Notion (marcação do Notion nunca vira aprovação da plataforma — regra 14).
import { Router } from 'express';
import { one, all, insert, update, run, uid, now, tx, parseJSON } from '../db.js';
import { requireInternal, requirePerm } from '../lib/auth.js';
import { can, assertClient, HttpError } from '../lib/permissions.js';
import { log } from '../lib/core.js';

export const fichaConteudo = Router();
export const ROLES = { responsavel: 'Responsável geral', estrategista: 'Estrategista', copywriter: 'Copywriter', designer: 'Designer', editor_video: 'Editor de vídeo', aprovador: 'Responsável pela aprovação' };
// Seções sugeridas por formato (só sugestão de estrutura; nenhuma é obrigatória)
export const SECTIONS_BY_FORMAT = {
  carrossel: [['capa', 'Capa'], ['card', 'Card 2'], ['referencias', 'Referências']],
  reel: [['roteiro', 'Roteiro'], ['referencias', 'Referências']],
  video: [['roteiro', 'Roteiro'], ['referencias', 'Referências']],
  estatico: [['briefing', 'Briefing'], ['referencias', 'Referências']],
  foto: [['briefing', 'Briefing'], ['referencias', 'Referências']],
  stories: [['roteiro', 'Sequência'], ['referencias', 'Referências']],
};
const STEPS = { texto: 'Texto / roteiro', legenda: 'Legenda', arte: 'Arte' };
const canReview = (u) => can(u, 'revisao', 'approve') || can(u, 'conteudos', 'approve');
const content = (req) => { const c = one('SELECT * FROM contents WHERE id=?', req.params.id); if (!c) throw new HttpError(404, 'Conteúdo não encontrado.'); assertClient(req.user, c.client_id); return c; };

export function fichaOf(c, user) {
  const people = Object.fromEntries(all('SELECT p.*, u.name FROM content_people p LEFT JOIN users u ON u.id=p.user_id WHERE p.content_id=?', c.id).map((p) => [p.role, p]));
  const sections = all('SELECT s.*, u.name updated_by_name FROM content_sections s LEFT JOIN users u ON u.id=s.updated_by WHERE s.content_id=? ORDER BY s.position, s.updated_at', c.id);
  const last = (step) => one('SELECT k.*, u.name actor FROM content_checks k LEFT JOIN users u ON u.id=k.actor_id WHERE k.content_id=? AND k.step=? ORDER BY k.created_at DESC LIMIT 1', c.id, step);
  const tema = one("SELECT a.created_at, a.decision, u.name FROM approvals a JOIN users u ON u.id=a.user_id WHERE a.content_id=? AND a.kind='tema' ORDER BY a.created_at DESC LIMIT 1", c.id);
  const review = one("SELECT r.status, r.decided_at, u.name, v.number FROM reviews r LEFT JOIN users u ON u.id=r.reviewer_id LEFT JOIN content_versions v ON v.id=r.version_id WHERE r.content_id=? ORDER BY r.created_at DESC LIMIT 1", c.id);
  const cliente = one("SELECT a.created_at, a.decision, u.name, v.number FROM approvals a JOIN users u ON u.id=a.user_id LEFT JOIN content_versions v ON v.id=a.version_id WHERE a.content_id=? AND a.kind='cliente' ORDER BY a.created_at DESC LIMIT 1", c.id);
  const link = one('SELECT * FROM content_notion_links WHERE content_id=?', c.id);
  const notion = link ? one('SELECT * FROM notion_history WHERE notion_url LIKE ?', `%${link.notion_page_id.replace(/-/g, '')}%`) : null;
  const st = (r, ok = 'aprovado') => (!r ? 'pendente' : r.decision === ok || r.status === 'aprovada' ? 'aprovado' : r.decision === 'ajuste' || r.status === 'ajuste' ? 'ajuste' : r.decision === 'desfeito' ? 'pendente' : r.status === 'pendente' ? 'em_revisao' : 'pendente');
  const steps = [
    { key: 'tema', label: 'Tema', who: 'Cliente', state: st(tema), by: tema?.name, at: tema?.created_at, source: 'aprovação do tema registrada' },
    ...Object.entries(STEPS).map(([k, label]) => { const r = last(k); return { key: k, label, who: 'Equipe (revisão)', state: st(r), by: r?.actor, at: r?.created_at, note: r?.note, internal: true }; }),
    { key: 'revisao', label: 'Revisão interna', who: 'Rebeca / Raísa', state: !review ? 'pendente' : review.status === 'aprovada' ? 'aprovado' : review.status === 'ajuste' ? 'ajuste' : 'em_revisao', by: review?.name, at: review?.decided_at, note: review?.number ? `V${review.number}` : null },
    { key: 'cliente', label: 'Aprovação formal do cliente', who: 'Cliente (feed)', state: c.approved_version_id ? 'aprovado' : st(cliente), by: cliente?.name, at: cliente?.created_at, note: cliente?.number ? `V${cliente.number}` : null },
  ];
  return {
    roles: ROLES, people, sections, suggested: SECTIONS_BY_FORMAT[c.format] || [['briefing', 'Briefing']], steps,
    fields: { data: c.planned_at || c.scheduled_at, tipo: c.format, estrategia: parseJSON(c.strategy_tags, []), objetivo: c.objective, referencia: c.reference, tema: c.theme },
    notion: link ? { ...link, history: notion ? { title: notion.title, date: notion.date_start, properties: parseJSON(notion.properties, {}), extracted_at: notion.extracted_at } : null } : null,
    can: { edit: can(user, 'conteudos', 'edit'), review: canReview(user) },
  };
}

fichaConteudo.get('/contents/:id/ficha', requireInternal, requirePerm('conteudos', 'view'), (req, res) => res.json(fichaOf(content(req), req.user)));

fichaConteudo.put('/contents/:id/pessoas', requireInternal, requirePerm('conteudos', 'edit'), (req, res) => {
  const c = content(req);
  const body = req.body || {};
  const team = new Set(all("SELECT id FROM users WHERE active=1 AND role_key<>'cliente'").map((u) => u.id));
  const changes = [];
  tx(() => {
    for (const [role, userId] of Object.entries(body)) {
      if (!ROLES[role]) continue;
      if (userId && !team.has(userId)) throw new HttpError(422, `Pessoa inválida para ${ROLES[role]}.`);
      const before = one('SELECT user_id FROM content_people WHERE content_id=? AND role=?', c.id, role);
      if ((before?.user_id || null) === (userId || null)) continue;
      if (!userId) run('DELETE FROM content_people WHERE content_id=? AND role=?', c.id, role);
      else if (before) update('content_people', { content_id: c.id, role }, { user_id: userId, source: 'plataforma', updated_by: req.user.id, updated_at: now() });
      else insert('content_people', { content_id: c.id, role, user_id: userId, source: 'plataforma', updated_by: req.user.id, updated_at: now() });
      changes.push(role);
    }
  });
  if (changes.length) log({ actor: req.user.id, action: 'conteudo.responsaveis', entity: 'content', id: c.id, client: c.client_id, content: c.id, summary: `Responsáveis da ficha alterados: ${changes.map((r) => ROLES[r]).join(', ')}` });
  res.json(fichaOf(c, req.user));
});

// Seções do corpo (capa, cards, roteiro…): texto integral, na ordem; editar guarda antes/depois no histórico
fichaConteudo.post('/contents/:id/secoes', requireInternal, requirePerm('conteudos', 'edit'), (req, res) => {
  const c = content(req);
  const { kind = 'texto', title = null, body = '' } = req.body || {};
  if (!['capa', 'card', 'roteiro', 'briefing', 'referencias', 'texto'].includes(kind)) throw new HttpError(422, 'Tipo de seção inválido.');
  const pos = (one('SELECT MAX(position) m FROM content_sections WHERE content_id=?', c.id).m ?? -1) + 1;
  const s = insert('content_sections', { id: uid('cs_'), content_id: c.id, kind, position: pos, title: title?.trim() || null, body: String(body), source: 'plataforma', updated_by: req.user.id, updated_at: now() });
  log({ actor: req.user.id, action: 'conteudo.secao', entity: 'content', id: c.id, client: c.client_id, content: c.id, summary: `Seção adicionada: ${s.title || kind}` });
  res.json(fichaOf(c, req.user));
});
fichaConteudo.put('/contents/:id/secoes/:sid', requireInternal, requirePerm('conteudos', 'edit'), (req, res) => {
  const c = content(req);
  const s = one('SELECT * FROM content_sections WHERE id=? AND content_id=?', req.params.sid, c.id);
  if (!s) throw new HttpError(404, 'Seção não encontrada.');
  const patch = {};
  if (req.body?.title !== undefined) patch.title = req.body.title?.trim() || null;
  if (req.body?.body !== undefined) patch.body = String(req.body.body);
  if (req.body?.position !== undefined) patch.position = Number(req.body.position) || 0;
  if (!Object.keys(patch).length) return res.json(fichaOf(c, req.user));
  update('content_sections', { id: s.id }, { ...patch, updated_by: req.user.id, updated_at: now() });
  log({ actor: req.user.id, action: 'conteudo.secao', entity: 'content', id: c.id, client: c.client_id, content: c.id, summary: `Seção “${s.title || s.kind}” editada`, before: JSON.stringify({ title: s.title, body: s.body }), after: JSON.stringify(patch) });
  res.json(fichaOf(c, req.user));
});

// Etapas internas (texto, legenda, arte): só quem revisa; ajuste exige motivo. Aprovação do cliente continua só no feed (versão).
fichaConteudo.post('/contents/:id/checks', requireInternal, (req, res) => {
  const c = content(req);
  if (!canReview(req.user)) throw new HttpError(403, 'Aprovar etapas internas é da revisão (Rebeca, Raísa ou quem tiver a permissão).');
  const { step, decision, note } = req.body || {};
  if (!STEPS[step]) throw new HttpError(422, 'Etapa inválida.');
  if (!['aprovado', 'ajuste', 'desfeito'].includes(decision)) throw new HttpError(422, 'Decisão inválida.');
  if (decision === 'ajuste' && !note?.trim()) throw new HttpError(422, 'Pedir ajuste exige o que precisa mudar.');
  insert('content_checks', { id: uid('ck_'), content_id: c.id, step, decision, version_id: c.current_version_id || null, note: note?.trim() || null, source: 'plataforma', actor_id: req.user.id, created_at: now() });
  log({ actor: req.user.id, action: 'conteudo.etapa_aprovacao', entity: 'content', id: c.id, client: c.client_id, content: c.id, summary: `${STEPS[step]}: ${decision}${note ? ` — ${note}` : ''}` });
  res.json(fichaOf(c, req.user));
});

// ═════ VÍNCULO CR EDITORIAL (Notion) → CONTEÚDO DA PLATAFORMA — proposta + confirmação item a item ═════
// Fonte: a extração somente leitura do CR EDITORIAL (notion_history). Nada é vinculado sozinho: a pessoa confirma cada par.
// Ao vincular: título, tema, data prevista, objetivo, referência e estratégia vêm do Notion; a legenda do Notion vira uma seção
// marcada "Notion"; as pessoas do Notion ficam AGUARDANDO MAPEAMENTO (ID do Notion ≠ usuário da plataforma).
// As caixas de aprovação do Notion NUNCA viram aprovação da plataforma (regra 14). Desvincular restaura os valores anteriores.
const strip = (t) => String(t || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const PREFIX = [[/^(REELS?|TAKE)\b/i, 'reel'], [/^CARROSS+EL/i, 'carrossel'], [/^(ÚNICO|UNICO|ESTÁTICO|ESTATICO|FOTO)\b/i, 'estatico']];
const TIPO = { Reels: 'reel', Carrossel: 'carrossel', 'Estático': 'estatico' };
export function crFormat(row) {
  const p = parseJSON(row.properties, {});
  const tipo = typeof p.Tipo === 'string' ? p.Tipo : p.Tipo?.name;
  if (tipo && TIPO[tipo]) return { format: TIPO[tipo], basis: `propriedade Tipo = ${tipo}` };
  const t = strip(row.title);
  for (const [re, f] of PREFIX) if (re.test(t)) return { format: f, basis: `prefixo do título “${t.split(/[:\-]/)[0].trim()}” (proposta — confira)` };
  return { format: null, basis: 'sem Tipo e sem prefixo reconhecido — AGUARDANDO MAPEAMENTO' };
}
const pageId = (url) => (String(url || '').match(/([0-9a-f]{32})(?:\?|$)/i) || [])[1] || null;
const themeOf = (title) => strip(title).replace(/^[^:]+:\s*/, '').trim();

fichaConteudo.get('/clients/:id/notion-vinculo', requireInternal, requirePerm('conteudos', 'view'), (req, res) => {
  assertClient(req.user, req.params.id);
  const ym = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : now().slice(0, 7);
  const rows = all("SELECT * FROM notion_history WHERE client_id=? AND empty=0 AND source='CR EDITORIAL' AND substr(date_start,1,7)=? ORDER BY date_start, title", req.params.id, ym);
  const links = all('SELECT l.*, c.number, c.title FROM content_notion_links l JOIN contents c ON c.id=l.content_id WHERE c.client_id=?', req.params.id);
  const linkedHist = new Set(links.map((l) => l.history_id));
  const linkedContents = new Set(links.map((l) => l.content_id));
  const free = all(`SELECT id, number, title, format, stage, planned_at, cycle_month FROM contents WHERE client_id=? AND stage NOT IN ('cancelado','publicado') AND (legacy_status IS NULL OR legacy_status='reprogramado')
    AND (cycle_month=? OR substr(planned_at,1,7)=?) ORDER BY number`, req.params.id, ym, ym).filter((c) => !linkedContents.has(c.id));
  // Proposta: para cada formato, os cards do Notion em ordem de data × os conteúdos livres do mesmo formato em ordem de número
  const used = new Set();
  const items = rows.map((r) => {
    const f = crFormat(r);
    const link = links.find((l) => l.history_id === r.id);
    let cand = null;
    if (!link && f.format) { cand = free.find((c) => c.format === f.format && !used.has(c.id)) || null; if (cand) used.add(cand.id); }
    return { id: r.id, title: strip(r.title), date: r.date_start, notion_url: r.notion_url, format: f.format, format_basis: f.basis, properties: parseJSON(r.properties, {}),
      linked: link ? { content_id: link.content_id, number: link.number, title: link.title } : null, proposal: cand, candidates: f.format ? free.filter((c) => c.format === f.format) : free };
  });
  res.json({ month: ym, extracted_at: rows[0]?.extracted_at || null, items, unmatched_contents: free.filter((c) => !used.has(c.id)), linked: links.length, can_link: can(req.user, 'conteudos', 'edit') });
});

fichaConteudo.post('/contents/:id/notion-vinculo', requireInternal, requirePerm('conteudos', 'edit'), (req, res) => {
  const c = content(req);
  const h = one("SELECT * FROM notion_history WHERE id=? AND source='CR EDITORIAL'", req.body?.history_id);
  if (!h || h.client_id !== c.client_id) throw new HttpError(422, 'Card do CR Editorial inválido para este cliente.');
  if (one('SELECT 1 FROM content_notion_links WHERE content_id=?', c.id)) throw new HttpError(409, 'Este conteúdo já está vinculado a um card do Notion.');
  const pid = pageId(h.notion_url);
  if (!pid) throw new HttpError(422, 'O card não tem identificador de página do Notion.');
  if (one('SELECT 1 FROM content_notion_links WHERE notion_page_id=?', pid)) throw new HttpError(409, 'Este card do Notion já está vinculado a outro conteúdo.');
  const p = parseJSON(h.properties, {});
  const fields = ['title', 'theme', 'planned_at', 'objective', 'reference', 'strategy_tags'];
  const before = Object.fromEntries(fields.map((k) => [k, c[k]]));
  const tags = [].concat(p['ESTRATÉGIA'] || []).filter((x) => typeof x === 'string');
  const patch = {
    title: themeOf(h.title) || c.title, theme: themeOf(h.title) || c.theme,
    planned_at: h.date_start ? `${h.date_start.slice(0, 10)}T15:00:00.000Z` : c.planned_at,
    objective: strip(typeof p.OBJETIVO === 'string' ? p.OBJETIVO : '') || c.objective,
    reference: strip(typeof p['REFERÊNCIA'] === 'string' ? p['REFERÊNCIA'] : '') || c.reference,
    strategy_tags: tags.length ? JSON.stringify(tags) : c.strategy_tags,
  };
  const ROLE_PROPS = { '👤 Responsável Geral': 'responsavel', '👤 Estrategista': 'estrategista', '👤 Copywriter': 'copywriter', '👤 Designer': 'designer', '👤 Editor de Vídeo': 'editor_video' };
  tx(() => {
    update('contents', { id: c.id }, { ...patch, updated_at: now() });
    if (patch.planned_at && patch.planned_at.slice(0, 7) !== c.cycle_month) {
      // a data muda de mês: o conteúdo acompanha o ciclo daquele mês (mesma regra da edição de data)
      const cy = one('SELECT id FROM cycles WHERE client_id=? AND month=?', c.client_id, patch.planned_at.slice(0, 7));
      if (cy) update('contents', { id: c.id }, { cycle_id: cy.id, cycle_month: patch.planned_at.slice(0, 7) });
    }
    const legenda = strip(typeof p.LEGENDA === 'string' ? p.LEGENDA : '');
    if (legenda) insert('content_sections', { id: uid('cs_'), content_id: c.id, kind: 'texto', position: 900, title: 'Legenda no Notion', body: legenda, source: 'notion', updated_by: req.user.id, updated_at: now() });
    for (const [prop, role] of Object.entries(ROLE_PROPS)) {
      const ids = String(p[prop] ? JSON.stringify(p[prop]) : '').match(/user:\/\/([0-9a-f-]{36})/i);
      if (ids && !one('SELECT 1 FROM content_people WHERE content_id=? AND role=?', c.id, role)) insert('content_people', { content_id: c.id, role, user_id: null, notion_user_id: ids[1], source: 'notion', updated_by: req.user.id, updated_at: now() });
    }
    insert('content_notion_links', { content_id: c.id, notion_page_id: pid, notion_url: h.notion_url, data_source_id: null, notion_last_edited_time: h.last_edited_time || null, last_synced_at: h.extracted_at || null,
      sync_status: 'vinculado_pela_extracao', linked_by: req.user.id, linked_at: now(), history_id: h.id, before_snapshot: JSON.stringify(before) });
  });
  log({ actor: req.user.id, action: 'notion.vinculo', entity: 'content', id: c.id, client: c.client_id, content: c.id, summary: `#${c.number} vinculado ao card do CR Editorial “${strip(h.title)}” (${h.date_start || 'sem data'})`, before: JSON.stringify(before), after: JSON.stringify(patch) });
  res.json(fichaOf(one('SELECT * FROM contents WHERE id=?', c.id), req.user));
});

fichaConteudo.post('/contents/:id/notion-desvincular', requireInternal, requirePerm('conteudos', 'edit'), (req, res) => {
  const c = content(req);
  const l = one('SELECT * FROM content_notion_links WHERE content_id=?', c.id);
  if (!l) throw new HttpError(404, 'Conteúdo sem vínculo com o Notion.');
  if (!req.body?.reason?.trim()) throw new HttpError(422, 'Informe o motivo.');
  const before = parseJSON(l.before_snapshot, {});
  tx(() => {
    update('contents', { id: c.id }, { ...before, updated_at: now() });
    run("DELETE FROM content_sections WHERE content_id=? AND source='notion'", c.id);
    run("DELETE FROM content_people WHERE content_id=? AND source='notion' AND user_id IS NULL", c.id);
    run('DELETE FROM content_notion_links WHERE content_id=?', c.id);
  });
  log({ actor: req.user.id, action: 'notion.desvinculo', entity: 'content', id: c.id, client: c.client_id, content: c.id, summary: `#${c.number} desvinculado do Notion — ${req.body.reason.trim()} (valores anteriores restaurados)`, before: JSON.stringify({ notion_page_id: l.notion_page_id }), after: JSON.stringify(before) });
  res.json(fichaOf(one('SELECT * FROM contents WHERE id=?', c.id), req.user));
});
