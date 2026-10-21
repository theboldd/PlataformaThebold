import { Router } from 'express';
import multer from 'multer';
import { one, all, insert, update, run, uid, now, parseJSON, tx } from '../db.js';
import { requireInternal, requirePerm } from '../lib/auth.js';
import { can, canAccessClient, assertClient, assertCan, scopeSQL, clientScope, HttpError, PENDENCIAS_ROLES, roleOf } from '../lib/permissions.js';
import { log, notify, parseMentions, recordMentions, userName, businessDaysFrom } from '../lib/core.js';
import { STAGES, LANES, STAGE_ORDER, stageAvailability, publicStatus, productionTracks, createContent, completeTask, reviewDecision, clientDecision, schedule, confirmPublished,
  blockContent, unblockContent, cancelContent, returnToStage, movePreview, moveContent, MOVE_KINDS, nextAction, contentRisk, editableVersion, currentVersion, versionMedia, resolveAssignee, ensureCycle, setting, DEFAULT_SETTINGS, buildMilestones } from '../engine/process.js';
import { automation, automationStats } from '../engine/automations.js';
import { computePendencies, clientSummary, clientRisk, runDetectors, opsMetrics, stageDistribution, teamLoad, OPERATING } from '../engine/intelligence.js';
import { executiveOverview } from '../engine/executive.js';
import { tower, automationRuns, personTasks } from '../engine/tower.js';
import { ingest, fileDTO, TMP_DIR } from '../services/media.js';
import { BRAIN_SECTIONS, exportClientBrainMarkdown } from '../ai/memory.js';
import { integrationStatus } from '../integrations/vault.js';
import { activeForm, formStatus } from '../services/onboarding.js';
import { myPendencies } from './pendencias.js';
import { isInherited } from '../services/delayReview.js';

export const ops = Router();
ops.use(requireInternal);
export const upload = multer({ dest: TMP_DIR, limits: { fileSize: 5 * 1024 ** 3, files: 20 } });

const getContentOr404 = (id) => { const c = one('SELECT * FROM contents WHERE id=?', id); if (!c) throw new HttpError(404, 'Conteúdo não encontrado.'); return c; };
const hoursSince = (iso) => Math.round((Date.now() - new Date(iso).getTime()) / 3600e3);

// ═════════════ CLIENTES ═════════════
ops.get('/clients', requirePerm('clientes', 'view'), (req, res) => {
  const sc = scopeSQL(req.user, 'id');
  const q = req.query.q ? `%${req.query.q}%` : null;
  const rows = all(`SELECT * FROM clients WHERE ${sc.sql} ${q ? 'AND name LIKE ?' : ''} ORDER BY status='encerrado', name`, ...sc.params, ...(q ? [q] : []));
  res.json(rows.map(clientSummary));
});
ops.post('/clients', requirePerm('carteira', 'create'), (req, res) => {
  const { name, handle, segment, services = [], monthly_posts = 12, requires_theme_approval = true, team = [] } = req.body || {};
  if (!name?.trim()) throw new HttpError(422, 'Informe o nome do cliente.');
  const client = tx(() => startClient({ name: name.trim(), handle, segment, services, monthly_posts, requires_theme_approval, team }, req.user));
  res.json(client);
});
// Novo cliente → onboarding automático (automação "cliente.novo")
export function startClient({ name, handle, segment, services, monthly_posts, requires_theme_approval, team, is_demo = 0, startedAt = null }, actor) {
  const ts = startedAt || now();
  const c = insert('clients', { id: uid('cl_'), name, handle: handle || null, segment: segment || null, status: 'onboarding', services: JSON.stringify(services), color: null, started_at: ts.slice(0, 10), requires_theme_approval: requires_theme_approval ? 1 : 0, monthly_posts, created_at: ts, is_demo });
  insert('projects', { id: uid('pj_'), client_id: c.id, name: 'Gestão de conteúdo recorrente', kind: 'recorrente', status: 'ativo', created_at: ts });
  for (const s of BRAIN_SECTIONS) insert('client_brain', { client_id: c.id, section: s, body: '', updated_at: ts });
  for (const m of team) insert('client_members', { client_id: c.id, user_id: m.user_id, function: m.function });
  const ob = insert('onboarding', { id: uid('ob_'), client_id: c.id, status: 'em_andamento', form_sent_at: ts, started_at: ts });
  // Checklist: formulário oficial "Sua marca" (ESPAÇO CLIENTE, Notion) + itens de equipe de MEMÓRIA > CLIENTE NOVO
  const W = (w) => businessDaysFrom(new Date(ts), w * 5).toISOString();
  const form = activeForm();
  const items = [
    ['formulario', `Formulário de onboarding — Sua marca (${form ? form.sections.length : 6} etapas)`, null, 'cliente', W(1)],
    ['acesso', 'Acesso às contas (Facebook / Instagram)', null, 'cliente', W(1)],
    ['interno', 'Contrato assinado (duração e plano)', null, 'equipe', W(1)], ['interno', 'Canal do cliente criado na plataforma', null, 'equipe', W(1)],
    ['interno', 'Aniversário do cliente no calendário', null, 'equipe', W(1)], ['interno', 'Reunião de Diagnóstico de Marca', null, 'equipe', W(2)],
    ['interno', 'Plano estratégico (diagnóstico do 1º mês)', null, 'equipe', W(3)], ['interno', 'Primeiro cronograma', null, 'equipe', W(3)],
  ];
  items.forEach(([kind, label, brain_section, who, due], i) => insert('onboarding_items', { id: uid('oi_'), onboarding_id: ob.id, kind, label, brain_section, who, required: 1, status: kind === 'interno' && label.startsWith('Canal') ? 'recebido' : 'pendente', requested_at: ts, due_at: due, received_at: null, sort: i }));
  const ch = insert('channels', { id: uid('ch_'), kind: 'cliente', client_id: c.id, name: name, topic: 'Conversa oficial com o cliente', created_by: actor?.id, created_at: ts });
  for (const m of team) run('INSERT OR IGNORE INTO channel_members (channel_id,user_id) VALUES (?,?)', ch.id, m.user_id);
  const atend = resolveAssignee(c.id, 'atendimento');
  for (const [title, fn] of [['Enviar contrato e coletar dados do plano', 'atendimento'], ['Agendar Reunião de Diagnóstico de Marca', 'atendimento'], ['Preparar plano estratégico do 1º mês', 'estrategia']]) {
    insert('tasks', { id: uid('t_'), title: `${title} — ${name}`, client_id: c.id, function: fn, assignee_id: resolveAssignee(c.id, fn), status: 'aberta', kind: 'onboarding', origin: 'automacao', priority: 'alta', due_at: W(fn === 'estrategia' ? 3 : 1), created_at: ts, created_by: actor?.id });
  }
  automation('cliente.novo', { entity: 'client', id: c.id, client: c.id, detail: name });
  log({ actor: actor?.id, action: 'cliente.criado', entity: 'client', id: c.id, client: c.id, summary: `Cliente ${name} criado — onboarding iniciado (${items.length} itens)`, visibility: 'client' });
  notify([...team.map((m) => m.user_id), atend], { level: 'info', type: 'onboarding', title: `Novo cliente: ${name}`, body: 'Onboarding iniciado automaticamente.', link: `/clientes/${c.id}?tab=onboarding`, client: c.id });
  return c;
}
ops.get('/clients/:id', requirePerm('clientes', 'view'), (req, res) => {
  assertClient(req.user, req.params.id);
  const c = one('SELECT * FROM clients WHERE id=?', req.params.id);
  if (!c) throw new HttpError(404, 'Cliente não encontrado.');
  const team = all('SELECT cm.function, u.id, u.name, u.role_key FROM client_members cm JOIN users u ON u.id=cm.user_id WHERE cm.client_id=? ORDER BY cm.function', c.id);
  const brain = all('SELECT section, body, updated_at, updated_by FROM client_brain WHERE client_id=?', c.id);
  const memories = all('SELECT m.*, u.name author FROM client_memories m LEFT JOIN users u ON u.id=m.created_by WHERE m.client_id=? ORDER BY m.created_at DESC', c.id);
  const ob = one('SELECT * FROM onboarding WHERE client_id=?', c.id);
  const fst = ob ? formStatus(c.id) : null;
  const onboarding = ob ? { ...ob, form: fst && { answered: fst.answered, total: fst.total }, items: all('SELECT * FROM onboarding_items WHERE onboarding_id=? ORDER BY sort', ob.id) } : null;
  const cycles = all('SELECT * FROM cycles WHERE client_id=? ORDER BY month DESC', c.id).map((cy) => ({ ...cy, milestones: parseJSON(cy.milestones, {}),
    counts: one("SELECT COUNT(*) total, SUM(stage IN ('agendado','publicado')) done FROM contents WHERE cycle_id=? AND stage<>'cancelado'", cy.id) }));
  const contents = all("SELECT * FROM contents WHERE client_id=? AND stage<>'cancelado' ORDER BY planned_at", c.id).map((x) => ({ ...contentCard(x), status: publicStatus(x) }));
  const meetings = all('SELECT * FROM meetings WHERE client_id=? ORDER BY starts_at DESC LIMIT 20', c.id);
  const files = all("SELECT * FROM files WHERE client_id=? ORDER BY created_at DESC LIMIT 60", c.id).map(fileDTO);
  const timeline = all('SELECT l.*, u.name actor_name FROM activity_logs l LEFT JOIN users u ON u.id=l.actor_id WHERE l.client_id=? ORDER BY l.created_at DESC LIMIT 120', c.id);
  const finance = can(req.user, 'financeiro') ? { contracts: all('SELECT * FROM contracts WHERE client_id=?', c.id), invoices: all('SELECT * FROM invoices WHERE client_id=? ORDER BY due_at DESC', c.id) } : null;
  const channel = one("SELECT id FROM channels WHERE client_id=? AND kind='cliente'", c.id);
  res.json({ client: clientSummary(c), team, brain, memories, onboarding, cycles, contents, meetings, files, timeline, finance, channel_id: channel?.id, open_requests: one("SELECT COUNT(*) n FROM client_requests WHERE client_id=? AND status NOT IN ('concluido','cancelado')", c.id).n, can_edit: can(req.user, 'clientes', 'edit') });
});
ops.patch('/clients/:id', requirePerm('clientes', 'edit'), (req, res) => {
  assertClient(req.user, req.params.id);
  const c = one('SELECT * FROM clients WHERE id=?', req.params.id);
  const allowed = ['name', 'handle', 'segment', 'status', 'monthly_posts', 'requires_theme_approval', 'services'];
  const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
  // status do cliente (ativar, pausar, encerrar) = carteira de clientes: só a CEO ou quem ela liberar
  if (patch.status !== undefined && patch.status !== c.status) {
    if (!can(req.user, 'carteira', 'edit')) throw new HttpError(403, 'Mudar o status do cliente (ativar, pausar, encerrar) é liberado pela CEO.');
    if (!['onboarding', 'ativo', 'pausado', 'encerrado', 'a_confirmar'].includes(patch.status)) throw new HttpError(422, 'Status inválido.');
  } else delete patch.status;
  if (patch.services) patch.services = JSON.stringify(patch.services);
  if (!Object.keys(patch).length) return res.json({ ok: true });
  update('clients', { id: c.id }, patch);
  const ST = { onboarding: 'onboarding', ativo: 'ativo', pausado: 'pausado', encerrado: 'encerrado', a_confirmar: 'a confirmar' };
  if (patch.status) {
    // status decidido: o ponto de revisão "status a confirmar" da migração fica resolvido
    if (patch.status !== 'a_confirmar') run("UPDATE migration_issues SET status='resolvido' WHERE client_id=? AND kind='status' AND status='aberto'", c.id);
    log({ actor: req.user.id, action: 'cliente.status', entity: 'client', id: c.id, client: c.id, summary: `${c.name}: status ${ST[c.status] || c.status} → ${ST[patch.status]}`, before: c.status, after: patch.status });
  }
  if (Object.keys(patch).some((k) => k !== 'status')) log({ actor: req.user.id, action: 'cliente.alterado', entity: 'client', id: c.id, client: c.id, summary: `Ficha alterada: ${Object.keys(patch).join(', ')}`, before: JSON.stringify(Object.fromEntries(Object.keys(patch).map((k) => [k, c[k]]))), after: JSON.stringify(patch) });
  res.json({ ok: true });
});
// EXCLUIR CLIENTE (definitivo): só a CEO ou quem ela liberar (Carteira de clientes · administrar). Exige digitar o nome.
// Apaga ficha, conteúdos, tarefas, ciclos, reuniões, conversas, arquivos e os acessos de cliente dele. O registro de auditoria
// (activity_logs) não se apaga — fica a linha "cliente excluído" com quem fez e quando.
ops.post('/clients/:id/excluir', requirePerm('carteira', 'admin'), async (req, res) => {
  const c = one('SELECT * FROM clients WHERE id=?', req.params.id);
  if (!c) throw new HttpError(404, 'Cliente não encontrado.');
  if (String(req.body?.confirm || '').trim() !== c.name.trim()) throw new HttpError(422, 'Para excluir, digite o nome do cliente exatamente como aparece.');
  const files = all('SELECT id, storage_key FROM files WHERE client_id=?', c.id);
  const clientUsers = all("SELECT u.id FROM users u JOIN client_members cm ON cm.user_id=u.id WHERE cm.client_id=? AND u.role_key='cliente'", c.id).map((r) => r.id);
  const counts = { conteudos: one('SELECT COUNT(*) n FROM contents WHERE client_id=?', c.id).n, tarefas: one('SELECT COUNT(*) n FROM tasks WHERE client_id=?', c.id).n };
  let usersRemoved = 0, usersDisabled = 0;
  try {
    tx(() => {
      run('DELETE FROM clients WHERE id=?', c.id);
      for (const f of files) run('DELETE FROM files WHERE id=? AND NOT EXISTS (SELECT 1 FROM version_media WHERE file_id=?) AND NOT EXISTS (SELECT 1 FROM messages WHERE file_id=?)', f.id, f.id, f.id);
      for (const uid_ of clientUsers) {
        if (one('SELECT 1 FROM client_members WHERE user_id=?', uid_)) continue; // ainda é contato de outro cliente
        try { run('DELETE FROM sessions WHERE user_id=?', uid_); run('DELETE FROM users WHERE id=?', uid_); usersRemoved++; } catch { run('UPDATE users SET active=0 WHERE id=?', uid_); usersDisabled++; }
      }
    });
  } catch (e) { throw new HttpError(409, `Não foi possível excluir: ${e.message}`); }
  // arquivos físicos (original + variações)
  const { storage } = await import('../services/media.js');
  for (const f of files) {
    await storage.remove(f.storage_key);
    const dir = storage.path(`derived/${f.id.slice(2, 4)}/x`).replace(/x$/, '');
    let names = [];
    try { names = (await import('node:fs')).readdirSync(dir).filter((n) => n.startsWith(f.id)); } catch { /* sem variações */ }
    for (const n of names) await storage.remove(`derived/${f.id.slice(2, 4)}/${n}`);
  }
  log({ actor: req.user.id, action: 'cliente.excluido', entity: 'client', id: c.id, summary: `Cliente excluído: ${c.name} (${counts.conteudos} conteúdos, ${counts.tarefas} tarefas, ${files.length} arquivos${usersRemoved ? `, ${usersRemoved} acesso(s) de cliente removido(s)` : ''}${usersDisabled ? `, ${usersDisabled} desativado(s)` : ''})`, before: JSON.stringify({ name: c.name, status: c.status, notion_url: c.notion_url }) });
  res.json({ ok: true, ...counts, files: files.length, users_removed: usersRemoved, users_disabled: usersDisabled });
});
ops.put('/clients/:id/brain/:section', requirePerm('clientes', 'edit'), (req, res) => {
  assertClient(req.user, req.params.id);
  if (!BRAIN_SECTIONS.includes(req.params.section)) throw new HttpError(422, 'Seção inválida.');
  const prev = one('SELECT body FROM client_brain WHERE client_id=? AND section=?', req.params.id, req.params.section);
  run('INSERT INTO client_brain (client_id, section, body, updated_by, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(client_id, section) DO UPDATE SET body=excluded.body, updated_by=excluded.updated_by, updated_at=excluded.updated_at',
    req.params.id, req.params.section, String(req.body?.body || ''), req.user.id, now());
  log({ actor: req.user.id, action: 'brain.alterado', entity: 'client_brain', id: req.params.section, client: req.params.id, summary: `Client Brain — ${req.params.section} atualizado`, before: prev?.body?.slice(0, 2000), after: String(req.body?.body || '').slice(0, 2000) });
  res.json({ ok: true });
});
ops.post('/clients/:id/memories', requirePerm('clientes', 'edit'), (req, res) => {
  assertClient(req.user, req.params.id);
  const { kind = 'informacao', body } = req.body || {};
  if (!body?.trim()) throw new HttpError(422, 'Escreva a memória.');
  const m = insert('client_memories', { id: uid('cm_'), client_id: req.params.id, kind, body, source_type: req.body.source_type || null, source_id: req.body.source_id || null, created_by: req.user.id, created_at: now() });
  log({ actor: req.user.id, action: 'brain.memoria', entity: 'client_memory', id: m.id, client: req.params.id, summary: `${kind}: ${body.slice(0, 140)}` });
  res.json(m);
});
ops.get('/clients/:id/brain.md', requirePerm('brain', 'view'), (req, res) => { assertClient(req.user, req.params.id); res.type('text/markdown').send(exportClientBrainMarkdown(req.params.id)); });
ops.put('/clients/:id/team', requirePerm('divisao', 'edit'), (req, res) => {
  assertClient(req.user, req.params.id);
  const members = (req.body?.members || []).filter((m) => m.user_id && m.function && m.function !== 'cliente');
  const teamSnap = () => all("SELECT u.name, cm.function FROM client_members cm JOIN users u ON u.id=cm.user_id WHERE cm.client_id=? AND cm.function<>'cliente' ORDER BY cm.function, u.name", req.params.id).map((r) => `${r.function}:${r.name}`);
  const before = teamSnap();
  tx(() => {
    run("DELETE FROM client_members WHERE client_id=? AND function<>'cliente'", req.params.id);
    members.forEach((m) => run('INSERT OR IGNORE INTO client_members (client_id,user_id,function) VALUES (?,?,?)', req.params.id, m.user_id, m.function));
    const ch = one("SELECT id FROM channels WHERE client_id=? AND kind='cliente'", req.params.id);
    if (ch) members.forEach((m) => run('INSERT OR IGNORE INTO channel_members (channel_id,user_id) VALUES (?,?)', ch.id, m.user_id));
    // Tarefas sem responsável passam a ter dono assim que a função é preenchida
    for (const t of all("SELECT * FROM tasks WHERE client_id=? AND assignee_id IS NULL AND status='aberta' AND function<>'cliente'", req.params.id)) {
      const a = resolveAssignee(req.params.id, t.function);
      if (a) { update('tasks', { id: t.id }, { assignee_id: a }); notify(a, { level: 'info', type: 'tarefa', title: t.title, body: 'Atribuída após atualização da equipe do cliente', link: t.content_id ? `/conteudos/${t.content_id}` : '/', content: t.content_id }); }
    }
  });
  log({ actor: req.user.id, action: 'cliente.equipe', entity: 'client', id: req.params.id, client: req.params.id, summary: `Equipe do cliente atualizada: ${members.map((m) => `${userName(m.user_id)} (${m.function})`).join(', ')}`,
    before: JSON.stringify(before), after: JSON.stringify(teamSnap()) });
  res.json({ ok: true });
});
ops.patch('/onboarding/items/:id', requirePerm('clientes', 'edit'), (req, res) => {
  const it = one('SELECT oi.*, ob.client_id, ob.id ob_id FROM onboarding_items oi JOIN onboarding ob ON ob.id=oi.onboarding_id WHERE oi.id=?', req.params.id);
  if (!it) throw new HttpError(404, 'Item não encontrado.');
  assertClient(req.user, it.client_id);
  const status = req.body?.status;
  if (!['pendente', 'recebido', 'dispensado'].includes(status)) throw new HttpError(422, 'Status inválido.');
  update('onboarding_items', { id: it.id }, { status, value: req.body.value ?? it.value, received_at: status === 'recebido' ? now() : null });
  if (status === 'recebido' && it.brain_section && req.body.value) run('UPDATE client_brain SET body=?, updated_by=?, updated_at=? WHERE client_id=? AND section=?', req.body.value, req.user.id, now(), it.client_id, it.brain_section);
  log({ actor: req.user.id, action: 'onboarding.item', entity: 'onboarding_item', id: it.id, client: it.client_id, summary: `Onboarding: “${it.label}” → ${status}`, visibility: 'client' });
  checkOnboardingComplete(it.ob_id, req.user);
  res.json({ ok: true });
});
export function checkOnboardingComplete(obId, actor) {
  const ob = one('SELECT * FROM onboarding WHERE id=?', obId);
  if (!ob || ob.status === 'concluido') return;
  const missing = one("SELECT COUNT(*) n FROM onboarding_items WHERE onboarding_id=? AND required=1 AND status='pendente'", obId).n;
  if (missing) return;
  update('onboarding', { id: obId }, { status: 'concluido', completed_at: now() });
  run("UPDATE clients SET status='ativo' WHERE id=? AND status='onboarding'", ob.client_id);
  const next = new Date(); next.setMonth(next.getMonth() + 2);
  ensureCycle(ob.client_id, next.toISOString().slice(0, 7));
  automation('onboarding.concluido', { entity: 'onboarding', id: obId, client: ob.client_id });
  log({ actor: actor?.id, action: 'onboarding.concluido', entity: 'onboarding', id: obId, client: ob.client_id, summary: 'Onboarding concluído — cliente ativo', visibility: 'client' });
  notify(all("SELECT user_id FROM client_members WHERE client_id=? AND function='estrategia'", ob.client_id).map((r) => r.user_id), { level: 'info', type: 'onboarding', title: 'Onboarding concluído', body: 'Cliente pronto para o primeiro cronograma.', link: `/clientes/${ob.client_id}`, client: ob.client_id });
}

// ═════════════ CONTEÚDOS ═════════════
export function contentCard(c, user = null) {
  const cl = one('SELECT name, color FROM clients WHERE id=?', c.client_id);
  const owner = one("SELECT t.assignee_id, u.name, t.due_at FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.content_id=? AND t.status IN ('aberta','em_andamento') ORDER BY t.due_at LIMIT 1", c.id);
  const v = currentVersion(c.id);
  const thumb = v ? versionMedia(v.id)[0] : null;
  const risk = contentRisk(c);
  const opens = !owner ? one("SELECT available_at FROM tasks WHERE content_id=? AND status='agendada' ORDER BY available_at LIMIT 1", c.id)?.available_at || null : null;
  return { opens_at: opens, id: c.id, number: c.number, title: c.title, format: c.format, client_id: c.client_id, client: cl?.name, client_color: cl?.color, stage: c.stage, stage_label: STAGES[c.stage].label, lane: STAGES[c.stage].lane,
    priority: c.priority, planned_at: c.planned_at, blocked: !!c.blocked, block_reason: c.block_reason, waiting_on: c.waiting_on, owner: owner?.name || (owner ? 'SEM RESPONSÁVEL' : null), owner_id: owner?.assignee_id,
    due_at: owner?.due_at, hours_in_stage: hoursSince(c.stage_entered_at), risk: risk.level, risk_reasons: risk.reasons, version: v?.number || null, thumb: thumb ? fileDTO(thumb).urls.thumb : null,
    restricted: user ? !canAccessClient(user, c.client_id) : false, rounds: c.revision_rounds + c.client_adjust_rounds, month: c.cycle_month || c.planned_at?.slice(0, 7) || null,
    material_url: user && !canAccessClient(user, c.client_id) ? null : c.material_url || null,
    needs_material: c.material_status === 'aguardando' || (!!c.blocked && c.waiting_on === 'cliente') };
}
ops.get('/contents', requirePerm('conteudos', 'view'), (req, res) => {
  const sc = scopeSQL(req.user, 'client_id');
  const where = [sc.sql, "stage<>'cancelado'"]; const p = [...sc.params];
  for (const k of ['client_id', 'stage', 'format', 'cycle_month']) if (req.query[k]) { where.push(`${k}=?`); p.push(req.query[k]); }
  if (req.query.month) { where.push('substr(planned_at,1,7)=?'); p.push(req.query.month); }
  res.json(all(`SELECT * FROM contents WHERE ${where.join(' AND ')} ORDER BY planned_at LIMIT 500`, ...p).map((c) => contentCard(c, req.user)));
});
ops.post('/contents', requirePerm('conteudos', 'create'), (req, res) => {
  const b = req.body || {};
  assertClient(req.user, b.client_id);
  if (!b.title?.trim() || !['reel', 'video', 'carrossel', 'estatico', 'foto', 'stories'].includes(b.format)) throw new HttpError(422, 'Informe título e formato.');
  // Entrada direta em produção (ex.: conteúdo extra já aprovado em reunião) exige permissão de aprovação
  if (b.stage && b.stage !== 'cronograma' && !(b.stage === 'producao' && can(req.user, 'conteudos', 'approve'))) throw new HttpError(403, 'Somente quem aprova pode criar conteúdo direto em produção.');
  const c = createContent({ ...b, title: b.title.trim() }, req.user);
  res.json(contentCard(c, req.user));
});
ops.get('/contents/:id', requirePerm('conteudos', 'view'), (req, res) => {
  const c = getContentOr404(req.params.id);
  assertClient(req.user, c.client_id);
  const versions = all('SELECT v.*, u.name author, a.name approver FROM content_versions v LEFT JOIN users u ON u.id=v.created_by LEFT JOIN users a ON a.id=v.approved_by WHERE v.content_id=? ORDER BY v.number DESC', c.id)
    .map((v) => ({ ...v, locked: !!v.locked, media: versionMedia(v.id).map(fileDTO) }));
  res.json({
    content: { ...c, strategy_tags: parseJSON(c.strategy_tags, []), status: publicStatus(c) },
    card: contentCard(c, req.user), stage: { key: c.stage, ...STAGES[c.stage] }, next_action: nextAction(c), risk: contentRisk(c), available_at: stageAvailability(c),
    client: one('SELECT id, name, handle, requires_theme_approval FROM clients WHERE id=?', c.client_id),
    cycle: c.cycle_id ? (({ milestones, ...cy }) => ({ ...cy, milestones: parseJSON(milestones, {}) }))(one('SELECT * FROM cycles WHERE id=?', c.cycle_id)) : null,
    versions,
    tasks: all('SELECT t.*, u.name assignee_name FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.content_id=? ORDER BY t.created_at DESC', c.id),
    adjustments: all('SELECT a.*, r.name requested_by_name, s.name assigned_name, v.number version_number FROM adjustments a LEFT JOIN users r ON r.id=a.requested_by LEFT JOIN users s ON s.id=a.assigned_to LEFT JOIN content_versions v ON v.id=a.version_id WHERE a.content_id=? ORDER BY a.created_at DESC', c.id),
    approvals: all('SELECT ap.*, u.name user_name, u.role_key, v.number version_number FROM approvals ap JOIN users u ON u.id=ap.user_id LEFT JOIN content_versions v ON v.id=ap.version_id WHERE ap.content_id=? ORDER BY ap.created_at DESC', c.id),
    reviews: all('SELECT r.*, u.name reviewer_name, v.number version_number FROM reviews r LEFT JOIN users u ON u.id=r.reviewer_id LEFT JOIN content_versions v ON v.id=r.version_id WHERE r.content_id=? ORDER BY r.created_at DESC', c.id),
    comments: all('SELECT cm.*, u.name author_name, u.role_key author_role, v.number version_number FROM comments cm JOIN users u ON u.id=cm.author_id LEFT JOIN content_versions v ON v.id=cm.version_id WHERE cm.content_id=? ORDER BY cm.created_at', c.id).map((x) => ({ ...x, anchor: parseJSON(x.anchor) })),
    history: all('SELECT l.*, u.name actor_name FROM activity_logs l LEFT JOIN users u ON u.id=l.actor_id WHERE l.content_id=? ORDER BY l.created_at DESC', c.id),
    tracks: productionTracks(c.format),
    permissions: { move: can(req.user, 'processos', 'edit'), edit: can(req.user, 'conteudos', 'edit'), approve: can(req.user, 'conteudos', 'approve'), review: can(req.user, 'revisao', 'approve'), admin: can(req.user, 'conteudos', 'admin') },
    meta_connected: integrationStatus('meta').status === 'conectado',
  });
});
ops.patch('/contents/:id', requirePerm('conteudos', 'edit'), (req, res) => {
  const c = getContentOr404(req.params.id);
  assertClient(req.user, c.client_id);
  const allowed = ['title', 'theme', 'objective', 'reference', 'briefing', 'internal_notes', 'planned_at', 'priority', 'format', 'strategy_tags', 'material_status', 'material_url'];
  if (req.body?.material_url && !/^https?:\/\/\S+$/i.test(req.body.material_url)) throw new HttpError(422, 'Link do material inválido: use um endereço que comece com http(s)://');
  const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
  // material marcado no formulário segue a mesma regra do pedido: aguardando = parado pelo cliente; recebido = libera
  const askMaterial = patch.material_status === 'aguardando' && c.material_status !== 'aguardando' && !c.blocked;
  const gotMaterial = patch.material_status && patch.material_status !== 'aguardando' && c.material_status === 'aguardando' && c.blocked && c.waiting_on === 'cliente';
  if (patch.strategy_tags) patch.strategy_tags = JSON.stringify(patch.strategy_tags);
  if (patch.planned_at) { patch.planned_at = new Date(patch.planned_at).toISOString(); const m = patch.planned_at.slice(0, 7); if (m !== c.cycle_month) { const cy = ensureCycle(c.client_id, m); patch.cycle_id = cy.id; patch.cycle_month = m; } }
  if (!Object.keys(patch).length) return res.json({ ok: true });
  update('contents', { id: c.id }, { ...patch, updated_at: now() });
  log({ actor: req.user.id, action: 'conteudo.alterado', entity: 'content', id: c.id, client: c.client_id, content: c.id, summary: `Alterado: ${Object.keys(patch).filter((k) => !['cycle_id', 'cycle_month'].includes(k)).join(', ')}`,
    before: JSON.stringify(Object.fromEntries(Object.keys(patch).map((k) => [k, c[k]]))), after: JSON.stringify(patch) });
  if (askMaterial) blockContent(c.id, 'Material do cliente: ver observações do conteúdo', 'cliente', req.user);
  if (gotMaterial) unblockContent(c.id, req.user, 'material marcado como recebido');
  res.json({ ok: true });
});
// Legenda: sempre na versão editável (nova versão se a atual já foi enviada)
ops.put('/contents/:id/caption', requirePerm('conteudos', 'edit'), (req, res) => {
  const c = getContentOr404(req.params.id);
  assertClient(req.user, c.client_id);
  if (STAGES[c.stage].final || ['agendado'].includes(c.stage)) throw new HttpError(409, 'Conteúdo já agendado/publicado: crie um novo conteúdo ou devolva a etapa.');
  const v = tx(() => { const v = editableVersion(c, req.user.id); update('content_versions', { id: v.id }, { caption: String(req.body?.caption || '') }); return v; });
  log({ actor: req.user.id, action: 'legenda.alterada', entity: 'content', id: c.id, client: c.client_id, content: c.id, summary: `Legenda editada (V${v.number})` });
  res.json({ version: v.number });
});
// Upload direto de mídia para a versão editável. deliver=1 → conclui a trilha visual do responsável (detecção automática de entrega)
ops.post('/contents/:id/media', requirePerm('conteudos', 'edit'), upload.array('files', 20), async (req, res) => {
  const c = getContentOr404(req.params.id);
  try { assertClient(req.user, c.client_id); } catch (e) { for (const f of req.files || []) await import('node:fs/promises').then((fs) => fs.unlink(f.path).catch(() => {})); throw e; }
  if (!req.files?.length) throw new HttpError(422, 'Nenhum arquivo enviado.');
  const ingested = [];
  for (const f of req.files) ingested.push(await ingest(f.path, { originalName: Buffer.from(f.originalname, 'latin1').toString('utf8'), mime: f.mimetype, clientId: c.client_id, userId: req.user.id }));
  const v = tx(() => {
    const v = editableVersion(c, req.user.id);
    if (req.body.replace === '1') run('DELETE FROM version_media WHERE version_id=?', v.id);
    let pos = (one('SELECT MAX(position) p FROM version_media WHERE version_id=?', v.id).p ?? -1) + 1;
    for (const f of ingested) insert('version_media', { version_id: v.id, file_id: f.id, position: pos++ });
    return v;
  });
  log({ actor: req.user.id, action: 'midia.enviada', entity: 'content', id: c.id, client: c.client_id, content: c.id, summary: `${ingested.length} arquivo(s) enviados para V${v.number} (originais preservados: ${ingested.map((f) => `${f.width || '?'}×${f.height || '?'}`).join(', ')})` });
  let delivered = null;
  if (req.body.deliver === '1') {
    const t = one("SELECT * FROM tasks WHERE content_id=? AND status='aberta' AND ((kind='etapa' AND description='trilha:visual') OR kind='ajuste') AND (assignee_id=? OR ?) ORDER BY kind='ajuste' DESC LIMIT 1", c.id, req.user.id, can(req.user, 'conteudos', 'approve') ? 1 : 0);
    if (t) { completeTask(t.id, req.user); delivered = t.title; }
  }
  res.json({ version: v.number, files: ingested.map(fileDTO), delivered });
});
ops.put('/contents/:id/media/order', requirePerm('conteudos', 'edit'), (req, res) => {
  const c = getContentOr404(req.params.id);
  assertClient(req.user, c.client_id);
  const ids = req.body?.file_ids || [];
  const v = tx(() => {
    const v = editableVersion(c, req.user.id);
    const existing = all('SELECT file_id FROM version_media WHERE version_id=?', v.id).map((r) => r.file_id);
    if (ids.some((id) => !existing.includes(id))) throw new HttpError(422, 'Arquivo não pertence à versão.');
    run('DELETE FROM version_media WHERE version_id=?', v.id);
    ids.forEach((file_id, position) => insert('version_media', { version_id: v.id, file_id, position }));
    return v;
  });
  log({ actor: req.user.id, action: 'midia.reordenada', entity: 'content', id: c.id, client: c.client_id, content: c.id, summary: `Mídia reorganizada na V${v.number} (${ids.length} itens)` });
  res.json({ version: v.number });
});
// Ações do processo
ops.post('/contents/:id/review', (req, res) => res.json(reviewDecision(req.params.id, req.user, req.body || {}, req)));
ops.post('/contents/:id/client-decision', (req, res) => res.json(clientDecision(req.params.id, req.user, req.body || {}, req)));
ops.post('/contents/:id/schedule', (req, res) => res.json(schedule(req.params.id, req.user, req.body || {})));
ops.post('/contents/:id/published', (req, res) => res.json(confirmPublished(req.params.id, req.user, req.body || {})));
ops.post('/contents/:id/block', requirePerm('conteudos', 'edit'), (req, res) => { blockContent(req.params.id, req.body?.reason, req.body?.waiting_on, req.user); res.json({ ok: true }); });
// Pedir material ao cliente: etiqueta "Material do cliente" no card, conteúdo parado aguardando o cliente,
// aviso na área do cliente (Materiais). O envio pelo portal desbloqueia sozinho; a equipe também pode marcar como recebido.
ops.post('/contents/:id/material', requirePerm('conteudos', 'edit'), (req, res) => {
  const c = getContentOr404(req.params.id);
  assertClient(req.user, c.client_id);
  const what = String(req.body?.what || '').trim();
  if (!what) throw new HttpError(422, 'Diga qual material o cliente precisa enviar.');
  tx(() => {
    if (c.blocked) unblockContent(c.id, null, 'substituído pelo pedido de material');
    update('contents', { id: c.id }, { material_status: 'aguardando', updated_at: now() });
    blockContent(c.id, `Material do cliente: ${what}`, 'cliente', req.user);
  });
  res.json({ ok: true });
});
ops.post('/contents/:id/unblock', requirePerm('conteudos', 'edit'), (req, res) => { unblockContent(req.params.id, req.user, req.body?.note); res.json({ ok: true }); });
ops.post('/contents/:id/cancel', (req, res) => res.json(cancelContent(req.params.id, req.user, req.body?.reason)));
ops.post('/contents/:id/return', (req, res) => res.json(returnToStage(req.params.id, req.user, req.body?.stage, req.body?.reason)));
// Mover etapa manualmente: prévia do impacto (antes de confirmar) e o movimento registrado
ops.get('/contents/:id/move-preview', requirePerm('processos', 'view'), (req, res) => {
  const c = getContentOr404(req.params.id);
  assertClient(req.user, c.client_id);
  res.json({ ...movePreview(c, String(req.query.to || ''), req.query.kind), can_move: can(req.user, 'processos', 'edit') });
});
ops.post('/contents/:id/move', requirePerm('processos', 'edit'), (req, res) => {
  const c = getContentOr404(req.params.id);
  assertClient(req.user, c.client_id);
  res.json(moveContent(c.id, req.user, { to: req.body?.to, reason: req.body?.reason, kind: req.body?.kind }));
});
ops.get('/contents/:id/moves', requirePerm('processos', 'view'), (req, res) => {
  const c = getContentOr404(req.params.id);
  assertClient(req.user, c.client_id);
  res.json(all('SELECT m.*, u.name actor FROM stage_moves m LEFT JOIN users u ON u.id=m.actor_id WHERE m.content_id=? ORDER BY m.created_at DESC', c.id)
    .map((m) => ({ ...m, kind_label: MOVE_KINDS[m.kind] || m.kind, from_label: STAGES[m.from_stage]?.label, to_label: STAGES[m.to_stage]?.label, impacts: parseJSON(m.impacts, []),
      prev: parseJSON(m.prev_assignees, []).map(userName), next: parseJSON(m.new_assignees, []).map(userName) })));
});
ops.post('/contents/:id/duplicate', requirePerm('conteudos', 'create'), (req, res) => {
  const c = getContentOr404(req.params.id);
  assertClient(req.user, c.client_id);
  const n = createContent({ client_id: c.client_id, title: `${c.title} (cópia)`, format: c.format, theme: c.theme, objective: c.objective, reference: c.reference, briefing: c.briefing, strategy_tags: parseJSON(c.strategy_tags, []), planned_at: req.body?.planned_at || null }, req.user);
  res.json(contentCard(n, req.user));
});
// Comentários (equipe pode marcar como interno; menções notificam)
ops.post('/contents/:id/comments', requirePerm('conteudos', 'view'), (req, res) => {
  const c = getContentOr404(req.params.id);
  assertClient(req.user, c.client_id);
  res.json(addComment(c, req.user, req.body || {}));
});
export function addComment(c, user, { body, visibility, parent_id, anchor, file_id, kind = null }) {
  if (!body?.trim()) throw new HttpError(422, 'Escreva o comentário.');
  const vis = user.role_key === 'cliente' ? 'client' : visibility === 'internal' ? 'internal' : 'client';
  if (parent_id) { const p = one('SELECT * FROM comments WHERE id=? AND content_id=?', parent_id, c.id); if (!p || (user.role_key === 'cliente' && p.visibility !== 'client')) throw new HttpError(404, 'Comentário não encontrado.'); }
  const v = currentVersion(c.id);
  const cm = insert('comments', { id: uid('cm_'), content_id: c.id, version_id: v?.id || null, parent_id: parent_id || null, author_id: user.id, body: body.trim(), visibility: vis, anchor: anchor ? JSON.stringify(anchor) : null, file_id: file_id || null, kind, created_at: now() });
  // Menções: cliente só pode mencionar a equipe vinculada a ele; equipe interna pode mencionar internos. Comentário interno nunca notifica cliente.
  const linkedTeam = all("SELECT DISTINCT u.id, u.name FROM client_members cm JOIN users u ON u.id=cm.user_id WHERE cm.client_id=? AND u.active=1 AND u.role_key<>'cliente'", c.client_id);
  const internals = all("SELECT id, name FROM users WHERE active=1 AND role_key<>'cliente'");
  const clientPeople = all("SELECT u.id, u.name FROM client_members cm JOIN users u ON u.id=cm.user_id WHERE cm.client_id=? AND cm.function='cliente' AND u.active=1", c.client_id);
  const allowed = user.role_key === 'cliente' ? linkedTeam : vis === 'internal' ? internals : [...internals, ...clientPeople];
  const mentioned = parseMentions(body, allowed, c.client_id).filter((id) => id !== user.id);
  recordMentions('comment', cm.id, mentioned, user.id);
  const isClientAuthor = user.role_key === 'cliente';
  notify(mentioned, { level: 'atencao', type: 'mencao', title: `${user.name} mencionou você`, body: `#${c.number} ${c.title}: ${body.slice(0, 140)}`, link: one('SELECT role_key FROM users WHERE id=?', mentioned[0] || '')?.role_key === 'cliente' ? `/portal/conteudos?c=${c.id}` : `/conteudos/${c.id}`, content: c.id, client: c.client_id });
  if (mentioned.length) automation('mencao', { entity: 'comment', id: cm.id, client: c.client_id, detail: `${mentioned.length}` });
  if (isClientAuthor) {
    const team = all("SELECT user_id FROM client_members WHERE client_id=? AND function IN ('estrategia','atendimento')", c.client_id).map((r) => r.user_id).filter((id) => !mentioned.includes(id));
    notify(team, { level: 'info', type: 'comentario_cliente', title: `Comentário do cliente`, body: `#${c.number} ${c.title}: ${body.slice(0, 140)}`, link: `/conteudos/${c.id}`, groupKey: `comentario:${c.id}`, content: c.id, client: c.client_id });
    automation('comentario.cliente', { entity: 'comment', id: cm.id, client: c.client_id });
  } else if (vis === 'client' && parent_id) {
    const parent = one('SELECT author_id FROM comments WHERE id=?', parent_id);
    const toClient = parent && one('SELECT role_key FROM users WHERE id=?', parent.author_id)?.role_key === 'cliente';
    if (parent && parent.author_id !== user.id && !mentioned.includes(parent.author_id)) notify(parent.author_id, { level: 'info', type: 'resposta', title: toClient ? 'A The Bold respondeu seu comentário' : `${user.name} respondeu seu comentário`, body: `${c.title}: ${body.slice(0, 140)}`, cta: toClient ? 'Ver resposta' : null, link: toClient ? `/portal/conteudos?c=${c.id}` : `/conteudos/${c.id}`, content: c.id, client: c.client_id });
    // Pergunta do cliente respondida pela equipe → a pendência interna é retirada
    if (toClient && one("SELECT 1 FROM comments WHERE id=? AND kind='pergunta'", parent_id)) {
      run("UPDATE tasks SET status='concluida', completed_at=?, completed_by=? WHERE source_type='comment' AND source_id=? AND status IN ('aberta','em_andamento')", now(), user.id, parent_id);
      log({ actor: user.id, action: 'pergunta.respondida', entity: 'comment', id: parent_id, client: c.client_id, content: c.id, visibility: 'client', summary: 'A The Bold respondeu sua pergunta' });
    }
  }
  log({ actor: user.id, action: 'comentario.criado', entity: 'comment', id: cm.id, client: c.client_id, content: c.id, summary: `${vis === 'internal' ? 'Comentário interno' : 'Comentário'} de ${user.name}${anchor?.page ? ` (página ${anchor.page})` : ''}${anchor?.t != null ? ` (${anchor.t}s)` : ''}`, visibility: vis === 'internal' ? 'internal' : 'client' });
  return cm;
}

// ═════════════ PROCESSOS (quadro operacional — compartilhado com toda a equipe interna) ═════════════
ops.get('/process/board', requirePerm('processos', 'view'), (req, res) => {
  const { client_id, assignee_id, stage, risk, priority, due, q, month, format } = req.query;
  const where = ["c.stage NOT IN ('cancelado')"]; const p = [];
  // Mês do ciclo (como os quadros mensais do Notion): com mês escolhido, o quadro mostra o mês inteiro, inclusive publicados
  if (month) { where.push('COALESCE(c.cycle_month, substr(c.planned_at,1,7))=?'); p.push(month); }
  else if (!req.query.include_published) where.push("NOT (c.stage='publicado' AND c.published_at < ?)"), p.push(new Date(Date.now() - 7 * 864e5).toISOString());
  if (format) { where.push('c.format=?'); p.push(format); }
  if (client_id) { where.push('c.client_id=?'); p.push(client_id); }
  if (stage) { const st = String(stage).split(','); where.push(`c.stage IN (${st.map(() => '?').join(',')})`); p.push(...st); }
  if (priority) { where.push('c.priority=?'); p.push(priority); }
  if (q) { where.push('(c.title LIKE ? OR cl.name LIKE ?)'); p.push(`%${q}%`, `%${q}%`); }
  let cards = all(`SELECT c.* FROM contents c JOIN clients cl ON cl.id=c.client_id WHERE ${where.join(' AND ')} ORDER BY c.planned_at`, ...p).map((c) => contentCard(c, req.user));
  if (risk) cards = cards.filter((c) => c.risk === risk);
  if (due === 'atrasado') cards = cards.filter((c) => c.due_at && c.due_at < now());
  if (due === 'hoje') { const e = new Date(); e.setHours(23, 59, 59); cards = cards.filter((c) => c.due_at && c.due_at <= e.toISOString()); }
  if (due === 'semana') { const e = new Date(Date.now() + 7 * 864e5).toISOString(); cards = cards.filter((c) => c.due_at && c.due_at <= e); }
  // Cards de clientes fora do vínculo: visíveis no quadro, sem miniatura e sem acesso ao detalhe
  cards = cards.map((c) => (c.restricted ? { ...c, thumb: null } : c));
  // Trilhas abertas de cada card (quem está com ele agora, por função) — base da visão "Equipe", igual às colunas por pessoa do Notion
  const ids = cards.map((c) => c.id);
  const open = ids.length ? all(`SELECT t.content_id, t.function fn, t.assignee_id, u.name, t.due_at FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id
    WHERE t.status IN ('aberta','em_andamento') AND t.function<>'cliente' AND t.content_id IN (${ids.map(() => '?').join(',')}) ORDER BY t.due_at`, ...ids) : [];
  const byContent = new Map();
  for (const t of open) (byContent.get(t.content_id) || byContent.set(t.content_id, []).get(t.content_id)).push({ fn: t.fn, assignee_id: t.assignee_id, name: t.name, due_at: t.due_at });
  cards = cards.map((c) => ({ ...c, tracks: byContent.get(c.id) || [] }));
  // filtro por pessoa vale para qualquer trilha aberta do card (design, edição, legenda…), não só a primeira
  if (assignee_id) cards = cards.filter((c) => c.tracks.some((t) => (assignee_id === 'none' ? !t.assignee_id : t.assignee_id === assignee_id)));
  const lanes = LANES.map((l) => ({ ...l, stages: Object.entries(STAGES).filter(([, s]) => s.lane === l.key).map(([k, s]) => ({ key: k, label: s.label, fn: s.fn, action: s.action, exit: s.exit })), cards: cards.filter((c) => c.lane === l.key) }));
  const recent = all("SELECT l.created_at, l.summary, l.content_id, c.client_id FROM activity_logs l JOIN contents c ON c.id=l.content_id WHERE l.action='etapa.alterada' ORDER BY l.created_at DESC LIMIT 25")
    .map((r) => (canAccessClient(req.user, r.client_id) ? r : { created_at: r.created_at, summary: r.summary.replace(/^#\d+/, '#—'), content_id: null }));
  res.json({ lanes, total: cards.length, recent, filters: { months: all("SELECT DISTINCT COALESCE(cycle_month, substr(planned_at,1,7)) m FROM contents WHERE stage<>'cancelado' AND COALESCE(cycle_month, substr(planned_at,1,7)) IS NOT NULL ORDER BY m DESC").map((r) => r.m), formats: all("SELECT DISTINCT format FROM contents WHERE stage<>'cancelado'").map((r) => r.format), clients: all('SELECT id, name FROM clients ORDER BY name'), people: all("SELECT id, name, functions FROM users WHERE active=1 AND role_key<>'cliente' ORDER BY name").map((u) => ({ ...u, functions: parseJSON(u.functions, []) })), stages: STAGE_ORDER.map((k) => ({ key: k, label: STAGES[k].label })) } });
});
ops.get('/process/definition', requirePerm('processos', 'view'), (_req, res) => {
  res.json({ stages: STAGES, lanes: LANES, order: STAGE_ORDER, settings: Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, setting(k)])), example_cycle: buildMilestones(new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 7)) });
});
ops.put('/process/settings/:key', requirePerm('automacoes', 'admin'), (req, res) => {
  if (!(req.params.key in DEFAULT_SETTINGS)) throw new HttpError(404, 'Configuração desconhecida.');
  const before = setting(req.params.key);
  run('INSERT INTO settings (key,value,updated_by,updated_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at', req.params.key, JSON.stringify(req.body?.value), req.user.id, now());
  log({ actor: req.user.id, action: 'processo.config', entity: 'setting', id: req.params.key, summary: `Regra do processo alterada: ${req.params.key}`, before: JSON.stringify(before), after: JSON.stringify(req.body?.value) });
  res.json({ ok: true });
});

// ═════════════ TAREFAS ═════════════
const taskRow = (t) => ({ ...t, content: t.content_id ? one('SELECT number, title, stage, format FROM contents WHERE id=?', t.content_id) : null, client: t.client_id ? one('SELECT name FROM clients WHERE id=?', t.client_id)?.name : null, overdue: !!(t.due_at && t.due_at < now() && !isInherited(t)), inherited: !!(t.due_at && t.due_at < now() && isInherited(t)) });
ops.get('/tasks/mine', (req, res) => {
  res.json(all("SELECT * FROM tasks WHERE assignee_id=? AND status IN ('aberta','em_andamento') ORDER BY due_at IS NULL, due_at", req.user.id).map(taskRow));
});
ops.get('/tasks', requirePerm('processos', 'view'), (req, res) => {
  const sc = scopeSQL(req.user, 'client_id');
  const where = [`(client_id IS NULL OR ${sc.sql})`, "status IN ('aberta','em_andamento')", "function<>'cliente'"]; const p = [...sc.params];
  if (req.query.assignee_id === 'none') where.push('assignee_id IS NULL'); else if (req.query.assignee_id) { where.push('assignee_id=?'); p.push(req.query.assignee_id); }
  if (req.query.client_id) { where.push('client_id=?'); p.push(req.query.client_id); }
  res.json(all(`SELECT * FROM tasks WHERE ${where.join(' AND ')} ORDER BY due_at LIMIT 300`, ...p).map(taskRow));
});
ops.post('/tasks', (req, res) => {
  const { title, description, client_id, content_id, assignee_id, due_at, priority = 'media' } = req.body || {};
  if (!title?.trim()) throw new HttpError(422, 'Informe o título.');
  if (client_id) assertClient(req.user, client_id);
  const t = insert('tasks', { id: uid('t_'), title: title.trim(), description, client_id: client_id || null, content_id: content_id || null, assignee_id: assignee_id || null, status: 'aberta', kind: 'manual', origin: req.body.origin || 'manual', source_type: req.body.source_type || null, source_id: req.body.source_id || null, priority, due_at: due_at ? new Date(due_at).toISOString() : null, created_by: req.user.id, created_at: now() });
  if (assignee_id && assignee_id !== req.user.id) notify(assignee_id, { level: 'info', type: 'tarefa', title: `${req.user.name} atribuiu uma tarefa`, body: title, link: '/', client: client_id });
  log({ actor: req.user.id, action: 'tarefa.criada', entity: 'task', id: t.id, client: client_id, content: content_id, summary: `Tarefa criada: ${title} → ${userName(assignee_id) || 'sem responsável'}` });
  res.json(t);
});
ops.post('/tasks/:id/complete', (req, res) => res.json(completeTask(req.params.id, req.user)));
ops.post('/tasks/:id/start', (req, res) => {
  const t = one('SELECT * FROM tasks WHERE id=?', req.params.id);
  if (!t || t.assignee_id !== req.user.id) throw new HttpError(403, 'Tarefa não atribuída a você.');
  update('tasks', { id: t.id }, { status: 'em_andamento', started_at: now() });
  res.json({ ok: true });
});
ops.post('/tasks/:id/reassign', requirePerm('processos', 'edit'), (req, res) => {
  const t = one('SELECT * FROM tasks WHERE id=?', req.params.id);
  if (!t) throw new HttpError(404, 'Tarefa não encontrada.');
  if (t.client_id) assertClient(req.user, t.client_id);
  const to = req.body?.assignee_id;
  if (!one("SELECT 1 FROM users WHERE id=? AND active=1 AND role_key<>'cliente'", to)) throw new HttpError(422, 'Pessoa inválida.');
  update('tasks', { id: t.id }, { assignee_id: to, due_at: req.body.due_at ? new Date(req.body.due_at).toISOString() : t.due_at });
  notify(to, { level: 'info', type: 'tarefa', title: `Tarefa atribuída a você`, body: t.title, link: t.content_id ? `/conteudos/${t.content_id}` : '/', content: t.content_id, client: t.client_id });
  log({ actor: req.user.id, action: 'tarefa.reatribuida', entity: 'task', id: t.id, client: t.client_id, content: t.content_id, summary: `Tarefa “${t.title}”: ${userName(t.assignee_id) || 'sem responsável'} → ${userName(to)}` });
  res.json({ ok: true });
});

// ═════════════ SALA DE REVISÃO ═════════════
ops.get('/review/queue', requirePerm('revisao', 'view'), (req, res) => {
  const sc = scopeSQL(req.user, 'client_id');
  const items = all(`SELECT * FROM contents WHERE ${sc.sql} AND stage IN ('analise_cronograma','analise_producao','revisao_ajuste') ORDER BY planned_at`, ...sc.params).map((c) => {
    const versions = all('SELECT * FROM content_versions WHERE content_id=? ORDER BY number DESC', c.id).map((v) => ({ ...v, media: versionMedia(v.id).map(fileDTO) }));
    return { ...contentCard(c, req.user), theme: c.theme, objective: c.objective, reference: c.reference, briefing: c.briefing, versions, kind: c.revision_rounds > 0 && c.stage === 'analise_producao' ? 'Revisão do ajuste interno' : STAGES[c.stage].label,
      adjustments: all('SELECT a.*, u.name assigned_name FROM adjustments a LEFT JOIN users u ON u.id=a.assigned_to WHERE a.content_id=? ORDER BY a.created_at DESC LIMIT 10', c.id),
      comments: all("SELECT cm.*, u.name author_name, u.role_key author_role FROM comments cm JOIN users u ON u.id=cm.author_id WHERE cm.content_id=? ORDER BY cm.created_at DESC LIMIT 20", c.id),
      producers: all("SELECT DISTINCT u.id, u.name, t.function FROM tasks t JOIN users u ON u.id=t.completed_by WHERE t.content_id=? AND t.function IN ('design','edicao','copy')", c.id) };
  });
  res.json({ items, team: all("SELECT id, name, role_key FROM users WHERE active=1 AND role_key IN ('design','edicao','copy','producao','estrategia') ORDER BY name") });
});

// ═════════════ CENTRO DE PENDÊNCIAS (Minhas: toda a equipe · Equipe: permissão pendencias) ═════════════
// Centro de Pendências: ver routes/pendencias.js

// ═════════════ TORRE DE CONTROLE / DASHBOARDS ═════════════
function financeSummary() {
  const m = new Date().toISOString().slice(0, 7);
  return {
    mrr: one("SELECT COALESCE(SUM(monthly_value),0) v FROM contracts WHERE status='ativo'").v,
    faturado_mes: one('SELECT COALESCE(SUM(amount),0) v FROM invoices WHERE substr(due_at,1,7)=?', m).v,
    recebido_mes: one('SELECT COALESCE(SUM(paid_amount),0) v FROM invoices WHERE substr(paid_at,1,7)=?', m).v,
    pendente: one("SELECT COALESCE(SUM(amount),0) v FROM invoices WHERE status='aberta'").v,
    atrasado: one("SELECT COALESCE(SUM(amount),0) v FROM invoices WHERE status='atrasada'").v,
    inadimplentes: one("SELECT COUNT(DISTINCT client_id) n FROM invoices WHERE status='atrasada'").n,
  };
}
function crmSummary() {
  return { abertos: one("SELECT COUNT(*) n, COALESCE(SUM(value),0) v FROM deals WHERE stage NOT IN ('fechado','perdido','onboarding')"), ponderado: one("SELECT COALESCE(SUM(value*probability/100.0),0) v FROM deals WHERE stage NOT IN ('fechado','perdido','onboarding')").v,
    followups_vencidos: one("SELECT COUNT(*) n FROM deals WHERE stage NOT IN ('fechado','perdido','onboarding') AND next_action_at < ?", now()).n };
}
function riskClients(user) {
  const sc = scopeSQL(user, 'id');
  return all(`SELECT * FROM clients WHERE status IN (${OPERATING.map(() => '?').join(',')}) AND ${sc.sql}`, ...OPERATING, ...sc.params).map((c) => ({ c, r: clientRisk(c.id) }))
    .filter((x) => ['alto', 'critico'].includes(x.r.level)).map(({ c, r }) => {
      const s = clientSummary(c);
      return { id: c.id, name: c.name, level: r.level, reasons: r.reasons, next: s.next, strategist: s.strategist };
    });
}
function upcomingMeetings(user, days = 7) {
  const sc = scopeSQL(user, 'm.client_id');
  return all(`SELECT m.*, c.name client_name FROM meetings m LEFT JOIN clients c ON c.id=m.client_id WHERE m.status='agendada' AND m.starts_at BETWEEN ? AND ? AND (m.client_id IS NULL OR ${sc.sql}) ORDER BY m.starts_at LIMIT 12`,
    now(), new Date(Date.now() + days * 864e5).toISOString(), ...sc.params);
}
function deadlines(user, limit = 8) {
  const sc = scopeSQL(user, 'client_id');
  return all(`SELECT * FROM tasks WHERE status IN ('aberta','em_andamento') AND function<>'cliente' AND due_at IS NOT NULL AND (client_id IS NULL OR ${sc.sql}) ORDER BY due_at LIMIT ?`, ...sc.params, limit).map(taskRow);
}
function executiveBrief(m, risks, pend, insights) {
  const parts = [];
  parts.push(`${m.clientes_ativos} clientes ativos, ${m.em_producao} conteúdos em produção e ${m.aguardando_cliente} aguardando aprovação de clientes.`);
  if (risks.length) parts.push(`${risks.length} cliente(s) em risco — principal motivo: ${risks[0].reasons[0] || 'prazos'} (${risks[0].name}).`);
  if (m.atrasadas) parts.push(`${m.atrasadas} tarefa(s) atrasada(s)${m.sem_responsavel ? ` e ${m.sem_responsavel} sem responsável` : ''}.`);
  if (pend) parts.push(`${pend} pendência(s) crítica(s) no Centro de Pendências.`);
  if (insights[0]) parts.push(`Gargalo em destaque: ${insights[0].problem}`);
  return parts.join(' ');
}
// Torre de Controle: período (hoje | 7d | 30d | custom) e filtros (cliente, responsável, etapa, formato, prioridade)
ops.get('/torre', requirePerm('torre', 'view'), (req, res) => res.json(tower(req.user, req.query)));
ops.get('/torre/automations', requirePerm('torre', 'view'), (req, res) => res.json(automationRuns(req.query)));
ops.get('/torre/people/:id/tasks', requirePerm('torre', 'view'), (req, res) => res.json(personTasks(req.params.id)));
// "O que eu preciso fazer hoje?" — igual para toda a equipe, só com dados da própria pessoa e dos clientes dela
const FLOW_VIEW = ['cronograma', 'analise_cronograma', 'aprovacao_tema', 'producao', 'analise_producao', 'aprovacao_cliente', 'agendamento', 'agendado', 'publicado'];
function todayFor(u, mine) {
  const nowIso = now();
  const end = new Date(); end.setHours(23, 59, 59, 999); const endIso = end.toISOString();
  const week = new Date(Date.now() + 7 * 864e5).toISOString();
  // Herdado da migração com prazo vencido não é "atrasada": o prazo foi calculado na importação (fica à parte, em revisão)
  const inherited = mine.filter((t) => t.due_at && t.due_at < nowIso && isInherited(t));
  const overdue = mine.filter((t) => t.due_at && t.due_at < nowIso && !isInherited(t));
  const today = mine.filter((t) => t.due_at && t.due_at >= nowIso && t.due_at <= endIso);
  const next = mine.filter((t) => t.due_at && t.due_at > endIso && t.due_at <= week);
  const scheduled = one("SELECT COUNT(*) n, MIN(available_at) first FROM tasks WHERE assignee_id=? AND status='agendada'", u.id);
  const pend = myPendencies(u);
  const clients = all("SELECT c.id, c.name, GROUP_CONCAT(DISTINCT cm.function) fns FROM client_members cm JOIN clients c ON c.id=cm.client_id WHERE cm.user_id=? AND cm.function<>'cliente' AND c.status<>'encerrado' GROUP BY c.id ORDER BY c.name", u.id)
    .map((c) => ({ id: c.id, name: c.name, functions: c.fns.split(','), open: mine.filter((t) => t.client_id === c.id).length }));
  const unread = all("SELECT id, type, title, body, link, count, updated_at FROM notifications WHERE user_id=? AND read_at IS NULL ORDER BY updated_at DESC LIMIT 5", u.id);
  const unreadTotal = one('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL', u.id).n;
  // Você está aqui: a tarefa mais urgente com conteúdo → cliente → processo → etapa → próxima ação
  const focusTask = [...overdue, ...today, ...next, ...inherited, ...mine].find((t) => t.content_id);
  let here = null;
  if (focusTask) {
    const c = one('SELECT * FROM contents WHERE id=?', focusTask.content_id);
    if (c && canAccessClient(u, c.client_id)) {
      const na = nextAction(c);
      here = { task: focusTask.title, task_due: focusTask.due_at, client_id: c.client_id, client: one('SELECT name FROM clients WHERE id=?', c.client_id)?.name, content_id: c.id, content: `#${c.number} ${c.title}`,
        steps: FLOW_VIEW.map((k) => ({ key: k, label: STAGES[k].label })), current: c.stage, current_label: STAGES[c.stage].label, next: na.text, next_who: na.who };
    }
  }
  return { overdue: overdue.length, inherited: inherited.length, today: today.length, next7: next.length, no_due: mine.filter((t) => !t.due_at).length, scheduled: scheduled.n, scheduled_first: scheduled.first,
    pendencies: pend.length, pendencies_top: pend.slice(0, 4), clients, unread: unreadTotal, unread_items: unread, here,
    focus: [...overdue, ...today, ...next].slice(0, 6).concat(inherited.slice(0, Math.max(0, 6 - overdue.length - today.length - next.length)).map((t) => ({ ...t, inherited: true }))) };
}

ops.get('/dashboard', (req, res) => {
  const u = req.user;
  const kind = roleOf(u).dashboard;
  const m = opsMetrics(u);
  const mine = all("SELECT * FROM tasks WHERE assignee_id=? AND status IN ('aberta','em_andamento') ORDER BY due_at IS NULL, due_at", u.id).map(taskRow);
  const base = { kind, metrics: m, my_tasks: mine, meetings: upcomingMeetings(u, 3), today: kind === 'ceo' ? null : todayFor(u, mine) };
  const sc = scopeSQL(u, 'client_id');
  if (kind === 'ceo') {
    // Visão executiva: resumo → prioridade → contexto; o detalhe completo continua na Torre de Controle
    const exec = executiveOverview(u, req.query);
    if (!can(u, 'financeiro')) exec.finance = null;
    if (!can(u, 'clientes', 'admin')) exec.attention = exec.attention.filter((x) => !x.id.startsWith('mig:'));
    return res.json({ ...base, exec });
  }
  if (kind === 'operacoes') {
    const pend = can(u, 'pendencias') ? computePendencies() : [];
    const waitingClient = all(`SELECT * FROM contents WHERE ${sc.sql} AND stage IN ('aprovacao_tema','aprovacao_cliente') ORDER BY stage_entered_at LIMIT 12`, ...sc.params).map((c) => contentCard(c, u));
    const waitingTeam = all(`SELECT * FROM contents WHERE ${sc.sql} AND blocked=0 AND stage IN ('producao','ajuste_interno','ajuste_cliente','analise_producao','agendamento') ORDER BY stage_entered_at LIMIT 12`, ...sc.params).map((c) => contentCard(c, u)).filter((c) => c.hours_in_stage > 24);
    const unassigned = all(`SELECT * FROM tasks WHERE assignee_id IS NULL AND status='aberta' AND function<>'cliente' AND (client_id IS NULL OR ${sc.sql})`, ...sc.params).map(taskRow);
    const followups = all(`SELECT * FROM tasks WHERE kind='follow_up' AND status='aberta' AND (client_id IS NULL OR ${sc.sql}) ORDER BY due_at`, ...sc.params).map(taskRow);
    const stalled = all(`SELECT * FROM contents WHERE ${sc.sql} AND blocked=1 AND stage NOT IN ('publicado','cancelado')`, ...sc.params).map((c) => contentCard(c, u));
    const reviewCount = one(`SELECT COUNT(*) n FROM contents WHERE ${sc.sql} AND stage IN ('analise_cronograma','analise_producao','revisao_ajuste')`, ...sc.params).n;
    const schedulingQueue = all(`SELECT * FROM contents WHERE ${sc.sql} AND stage='agendamento' ORDER BY planned_at`, ...sc.params).map((c) => contentCard(c, u));
    return res.json({ ...base, attention: pend.slice(0, 10), critical_count: pend.filter((p) => p.severity === 'critica').length, waiting_client: waitingClient, waiting_team: waitingTeam, unassigned, followups, stalled, review_count: reviewCount, scheduling: schedulingQueue,
      insights: all("SELECT * FROM ai_insights WHERE status='aberto' ORDER BY updated_at DESC LIMIT 4"), meetings: upcomingMeetings(u, 1) });
  }
  if (kind === 'revisao') {
    const queue = all(`SELECT * FROM contents WHERE ${sc.sql} AND stage IN ('analise_cronograma','analise_producao','revisao_ajuste') ORDER BY planned_at`, ...sc.params).map((c) => contentCard(c, u));
    return res.json({ ...base, review_queue: queue, insights: all("SELECT * FROM ai_insights WHERE status='aberto' AND detector IN ('retrabalho','gargalo') LIMIT 4") });
  }
  if (kind === 'estrategia') {
    const myClients = all("SELECT c.* FROM clients c JOIN client_members cm ON cm.client_id=c.id WHERE cm.user_id=? AND cm.function='estrategia'", u.id).map(clientSummary);
    const ids = myClients.map((c) => c.id);
    const inIds = ids.length ? `client_id IN (${ids.map(() => '?').join(',')})` : '1=0';
    const calendar = all(`SELECT * FROM contents WHERE ${inIds} AND planned_at BETWEEN ? AND ? AND stage<>'cancelado' ORDER BY planned_at`, ...ids, new Date(Date.now() - 864e5).toISOString(), new Date(Date.now() + 21 * 864e5).toISOString()).map((c) => ({ ...contentCard(c, u), status: publicStatus(c) }));
    const awaiting = all(`SELECT * FROM contents WHERE ${inIds} AND stage IN ('aprovacao_tema','aprovacao_cliente')`, ...ids).map((c) => contentCard(c, u));
    const adjustments = all(`SELECT a.*, c.number, c.title, cl.name client FROM adjustments a JOIN contents c ON c.id=a.content_id JOIN clients cl ON cl.id=c.client_id WHERE a.status='aberto' AND c.${inIds}`, ...ids);
    const comments = all(`SELECT cm.*, c.number, c.title, u.name author_name FROM comments cm JOIN contents c ON c.id=cm.content_id JOIN users u ON u.id=cm.author_id WHERE u.role_key='cliente' AND c.${inIds} ORDER BY cm.created_at DESC LIMIT 8`, ...ids);
    const materials = all(`SELECT * FROM contents WHERE ${inIds} AND blocked=1 AND waiting_on='cliente'`, ...ids).map((c) => contentCard(c, u));
    return res.json({ ...base, clients: myClients, calendar, awaiting, adjustments, comments, materials });
  }
  if (kind === 'comercial') {
    return res.json({ ...base, crm: can(u, 'crm') ? crmSummary() : null, finance: can(u, 'financeiro') ? financeSummary() : null,
      deals: can(u, 'crm') ? all("SELECT d.*, us.name owner_name FROM deals d LEFT JOIN users us ON us.id=d.owner_id WHERE stage NOT IN ('fechado','perdido','onboarding') ORDER BY next_action_at LIMIT 10") : [],
      invoices: can(u, 'financeiro') ? all("SELECT i.*, c.name client_name FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.status IN ('aberta','atrasada') ORDER BY i.due_at LIMIT 10") : [] });
  }
  // produção / design / edição / copy
  const toProduce = mine.filter((t) => t.kind === 'etapa');
  const adjustments = mine.filter((t) => t.kind === 'ajuste');
  const blocked = all(`SELECT DISTINCT c.* FROM contents c JOIN tasks t ON t.content_id=c.id WHERE t.assignee_id=? AND t.status='aberta' AND c.blocked=1`, u.id).map((c) => contentCard(c, u));
  const inReview = all(`SELECT DISTINCT c.* FROM contents c JOIN tasks t ON t.content_id=c.id WHERE t.completed_by=? AND c.stage IN ('analise_producao','revisao_ajuste','aprovacao_cliente') AND t.completed_at > ?`, u.id, new Date(Date.now() - 14 * 864e5).toISOString()).map((c) => contentCard(c, u));
  res.json({ ...base, to_produce: toProduce, adjustments, blocked, in_review: inReview });
});

// ═════════════ INSIGHTS + AUTOMAÇÕES ═════════════
ops.get('/insights', requirePerm('insights', 'view'), (req, res) => {
  const st = req.query.status || 'aberto';
  res.json(all('SELECT * FROM ai_insights WHERE status=? ORDER BY CASE severity WHEN \'alta\' THEN 0 WHEN \'media\' THEN 1 ELSE 2 END, updated_at DESC', st).map((i) => ({ ...i, action_payload: parseJSON(i.action_payload) }))
    .filter((i) => !i.client_id || canAccessClient(req.user, i.client_id)));
});
ops.post('/insights/run', requirePerm('insights', 'view'), (_req, res) => { runDetectors(); res.json({ ok: true }); });
ops.post('/insights/:id/status', requirePerm('insights', 'edit'), (req, res) => {
  if (!['aplicado', 'descartado', 'aberto'].includes(req.body?.status)) throw new HttpError(422, 'Status inválido.');
  update('ai_insights', { id: req.params.id }, { status: req.body.status, updated_at: now() });
  log({ actor: req.user.id, action: 'insight.status', entity: 'ai_insight', id: req.params.id, summary: `Insight marcado como ${req.body.status}` });
  res.json({ ok: true });
});
const CORE_AUTOMATIONS = ['tarefa.atribuida', 'tema.aprovado', 'tema.ajuste', 'producao.concluida', 'revisao.ajuste', 'ajuste.concluido', 'revisao.aprovada', 'cliente.aprovou', 'cliente.ajuste', 'conteudo.agendado', 'cliente.novo', 'chat.converter', 'onboarding.concluido'];
ops.get('/automations', requirePerm('automacoes', 'view'), (_req, res) => {
  res.json({ automations: automationStats().map((a) => ({ ...a, core: CORE_AUTOMATIONS.includes(a.key) })),
    runs: all('SELECT r.*, c.name client_name FROM automation_runs r LEFT JOIN clients c ON c.id=r.client_id ORDER BY r.created_at DESC LIMIT 150') });
});
ops.post('/automations/:key/toggle', requirePerm('automacoes', 'admin'), (req, res) => {
  if (CORE_AUTOMATIONS.includes(req.params.key)) throw new HttpError(409, 'Esta automação é parte do núcleo do processo e não pode ser desligada (desligar quebraria o fluxo).');
  const a = one('SELECT * FROM automations WHERE key=?', req.params.key);
  if (!a) throw new HttpError(404, 'Automação não encontrada.');
  update('automations', { key: a.key }, { enabled: a.enabled ? 0 : 1 });
  log({ actor: req.user.id, action: 'automacao.toggle', entity: 'automation', id: a.key, summary: `Automação ${a.key} ${a.enabled ? 'desligada' : 'ligada'}` });
  res.json({ enabled: !a.enabled });
});
