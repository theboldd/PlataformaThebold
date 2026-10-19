// ÁREA DO CLIENTE — endpoints exclusivos do cliente. Nunca expõem dados internos:
// comentários internos, tarefas internas, financeiro, outros clientes, problemas internos ou notas da equipe.
import { Router } from 'express';
import { one, all, insert, update, run, uid, now, parseJSON } from '../db.js';
import { requireClientUser } from '../lib/auth.js';
import { HttpError } from '../lib/permissions.js';
import { log, notify } from '../lib/core.js';
import { STAGES, publicStatus, clientDecision, versionMedia, unblockContent } from '../engine/process.js';
import { fileDTO, ingest } from '../services/media.js';
import { addComment, upload, checkOnboardingComplete } from './ops.js';
import { createMeeting } from './comms.js';

export const portal = Router();
portal.use((req, _res, next) => (req.user ? next() : next(new HttpError(401, 'Faça login para continuar.'))));
portal.use(requireClientUser);

const myClient = (req) => {
  const links = all("SELECT client_id FROM client_members WHERE user_id=? AND function='cliente'", req.user.id).map((r) => r.client_id);
  const id = req.query.client_id || req.body?.client_id || links[0];
  if (!id || !links.includes(id)) throw new HttpError(403, 'Sem acesso a este projeto.');
  return one('SELECT * FROM clients WHERE id=?', id);
};
const CLIENT_STAGES = Object.entries(STAGES).filter(([, s]) => s.client).map(([k]) => k);

// Versão visível ao cliente: a mais recente que foi enviada a ele (ou aprovada). Nunca rascunhos internos.
function clientVersion(c) {
  if (c.stage === 'aprovacao_tema') return null;
  return one('SELECT * FROM content_versions WHERE content_id=? AND (sent_to_client_at IS NOT NULL OR status=\'aprovada\') ORDER BY number DESC LIMIT 1', c.id);
}
function feedItem(c, client) {
  const v = clientVersion(c);
  const approval = one("SELECT ap.created_at, u.name, v.number FROM approvals ap JOIN users u ON u.id=ap.user_id LEFT JOIN content_versions v ON v.id=ap.version_id WHERE ap.content_id=? AND ap.decision='aprovado' AND ap.kind IN ('cliente','tema') ORDER BY ap.created_at DESC LIMIT 1", c.id);
  const comments = all("SELECT cm.id, cm.body, cm.parent_id, cm.anchor, cm.created_at, u.name author_name, u.role_key='cliente' is_client, v.number version_number FROM comments cm JOIN users u ON u.id=cm.author_id LEFT JOIN content_versions v ON v.id=cm.version_id WHERE cm.content_id=? AND cm.visibility='client' ORDER BY cm.created_at", c.id)
    .map((x) => ({ ...x, anchor: parseJSON(x.anchor), is_client: !!x.is_client }));
  const openAdj = all("SELECT description, carousel_page, created_at FROM adjustments WHERE content_id=? AND origin='cliente' AND status='aberto'", c.id);
  return {
    id: c.id, number: c.number, title: c.title, format: c.format, planned_at: c.planned_at, scheduled_at: c.scheduled_at, status: publicStatus(c), stage: c.stage,
    is_theme: c.stage === 'aprovacao_tema', theme: c.theme, objective: c.objective, reference: c.reference,
    brand: { name: client.name, handle: client.handle },
    version: v ? { number: v.number, caption: v.caption, approved: v.status === 'aprovada', media: versionMedia(v.id).map(fileDTO) } : null,
    can_decide: ['aprovacao_tema', 'aprovacao_cliente'].includes(c.stage) && !c.blocked,
    approval, comments, open_adjustments: openAdj, schedule_mode: c.schedule_mode,
  };
}

portal.get('/me', (req, res) => {
  const c = myClient(req);
  const team = all("SELECT DISTINCT u.id, u.name, cm.function FROM client_members cm JOIN users u ON u.id=cm.user_id WHERE cm.client_id=? AND cm.function IN ('estrategia','atendimento','design','edicao','copy','revisao') AND u.active=1", c.id);
  const counts = one(`SELECT SUM(stage IN ('aprovacao_tema','aprovacao_cliente')) aguardando, SUM(stage='ajuste_cliente') em_ajuste, SUM(stage IN ('agendamento','agendado')) aprovados, SUM(stage='publicado') publicados FROM contents WHERE client_id=?`, c.id);
  const next = one("SELECT * FROM meetings WHERE client_id=? AND status='agendada' AND starts_at > ? ORDER BY starts_at LIMIT 1", c.id, now());
  const ob = one('SELECT * FROM onboarding WHERE client_id=?', c.id);
  const timeline = all("SELECT created_at, summary FROM activity_logs WHERE client_id=? AND visibility='client' ORDER BY created_at DESC LIMIT 25", c.id);
  const cycle = one("SELECT * FROM cycles WHERE client_id=? AND status<>'encerrado' ORDER BY month LIMIT 1", c.id);
  const steps = [];
  if (counts.aguardando) steps.push({ text: `Aprovar ${counts.aguardando} conteúdo(s) no feed`, link: '/portal/feed' });
  const mat = one("SELECT COUNT(*) n FROM contents WHERE client_id=? AND blocked=1 AND waiting_on='cliente'", c.id).n;
  if (mat) steps.push({ text: `Enviar ${mat} material(is) pendente(s)`, link: '/portal/pendencias' });
  if (ob && ob.status !== 'concluido') steps.push({ text: 'Completar o onboarding', link: '/portal/pendencias' });
  if (next) steps.push({ text: `Reunião em ${new Date(next.starts_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}`, link: '/portal/reunioes' });
  res.json({ client: { id: c.id, name: c.name, handle: c.handle, status: c.status, services: parseJSON(c.services, []) }, team: team.map(({ id, name, function: f }) => ({ id, name, function: f })), counts, next_meeting: next, timeline, steps,
    cycle: cycle ? { month: cycle.month, status: cycle.status, milestones: Object.fromEntries(Object.entries(parseJSON(cycle.milestones, {})).filter(([k]) => ['cliente_aprova_temas', 'cliente_aprova_final', 'ajustes_cliente'].includes(k))) } : null,
    onboarding: ob ? { status: ob.status } : null });
});
portal.get('/feed', (req, res) => {
  const c = myClient(req);
  const where = [`client_id=?`, `stage IN (${CLIENT_STAGES.map(() => '?').join(',')})`]; const p = [c.id, ...CLIENT_STAGES];
  const f = req.query.filter;
  const map = { aguardando: ['aprovacao_tema', 'aprovacao_cliente'], aprovados: ['agendamento', 'agendado', 'publicado'], ajuste: ['ajuste_cliente'], agendados: ['agendado'], publicados: ['publicado'] };
  if (map[f]) { where.push(`stage IN (${map[f].map(() => '?').join(',')})`); p.push(...map[f]); }
  if (req.query.month) { where.push('substr(planned_at,1,7)=?'); p.push(req.query.month); }
  if (req.query.format) { where.push('format=?'); p.push(req.query.format); }
  const rows = all(`SELECT * FROM contents WHERE ${where.join(' AND ')} ORDER BY CASE WHEN stage IN ('aprovacao_tema','aprovacao_cliente') THEN 0 ELSE 1 END, planned_at`, ...p);
  const months = all(`SELECT DISTINCT substr(planned_at,1,7) m FROM contents WHERE client_id=? AND planned_at IS NOT NULL AND stage IN (${CLIENT_STAGES.map(() => '?').join(',')}) ORDER BY m`, c.id, ...CLIENT_STAGES).map((r) => r.m);
  res.json({ items: rows.map((x) => feedItem(x, c)), months });
});
const getMyContent = (req) => {
  const c = one('SELECT * FROM contents WHERE id=?', req.params.id);
  if (!c || !CLIENT_STAGES.includes(c.stage) || !one("SELECT 1 FROM client_members WHERE user_id=? AND client_id=? AND function='cliente'", req.user.id, c.client_id)) throw new HttpError(404, 'Conteúdo não encontrado.');
  return c;
};
portal.post('/contents/:id/approve', (req, res) => {
  const c = getMyContent(req);
  clientDecision(c.id, req.user, { decision: 'aprovar', note: req.body?.note }, req);
  res.json(feedItem(one('SELECT * FROM contents WHERE id=?', c.id), one('SELECT * FROM clients WHERE id=?', c.client_id)));
});
portal.post('/contents/:id/adjust', upload.single('file'), async (req, res) => {
  const c = getMyContent(req);
  let fileId = null;
  if (req.file) fileId = (await ingest(req.file.path, { originalName: Buffer.from(req.file.originalname, 'latin1').toString('utf8'), mime: req.file.mimetype, clientId: c.client_id, userId: req.user.id, visibility: 'client' })).id;
  const note = String(req.body?.note || '').trim();
  const page = req.body.carousel_page ? Number(req.body.carousel_page) : null;
  const t = req.body.video_timestamp ? Number(req.body.video_timestamp) : null;
  clientDecision(c.id, req.user, { decision: 'ajuste', note, carousel_page: page, video_timestamp: t }, req);
  addComment(one('SELECT * FROM contents WHERE id=?', c.id), req.user, { body: `Ajuste solicitado: ${note}`, anchor: page || t != null ? { page, t } : null, file_id: fileId });
  res.json(feedItem(one('SELECT * FROM contents WHERE id=?', c.id), one('SELECT * FROM clients WHERE id=?', c.client_id)));
});
portal.post('/contents/:id/comments', (req, res) => {
  const c = getMyContent(req);
  addComment(c, req.user, { body: req.body?.body, parent_id: req.body?.parent_id, anchor: req.body?.anchor });
  res.json(feedItem(one('SELECT * FROM contents WHERE id=?', c.id), one('SELECT * FROM clients WHERE id=?', c.client_id)));
});
portal.get('/calendar', (req, res) => {
  const c = myClient(req);
  const items = all(`SELECT * FROM contents WHERE client_id=? AND stage IN (${CLIENT_STAGES.map(() => '?').join(',')}) AND planned_at IS NOT NULL ORDER BY planned_at`, c.id, ...CLIENT_STAGES)
    .map((x) => ({ id: x.id, title: x.title, format: x.format, date: x.scheduled_at || x.planned_at, status: publicStatus(x) }));
  const upcoming = all("SELECT COUNT(*) n FROM contents WHERE client_id=? AND stage IN ('cronograma','analise_cronograma','ajuste_cronograma','producao','analise_producao','ajuste_interno')", c.id)[0].n;
  const meetings = all("SELECT id, title, starts_at, ends_at FROM meetings WHERE client_id=? AND status='agendada'", c.id);
  res.json({ items, meetings, in_preparation: upcoming });
});
portal.get('/pendencias', (req, res) => {
  const c = myClient(req);
  const ob = one('SELECT * FROM onboarding WHERE client_id=?', c.id);
  const onboarding = ob ? all("SELECT id, kind, label, status, due_at, brain_section FROM onboarding_items WHERE onboarding_id=? AND who='cliente' ORDER BY sort", ob.id) : [];
  const approvals = all("SELECT id, number, title, stage, stage_entered_at FROM contents WHERE client_id=? AND stage IN ('aprovacao_tema','aprovacao_cliente')", c.id);
  const materials = all("SELECT id, number, title, block_reason, updated_at, planned_at FROM contents WHERE client_id=? AND blocked=1 AND waiting_on='cliente'", c.id);
  res.json({ onboarding, approvals, materials, onboarding_status: ob?.status });
});
// Formulário de onboarding: preenche o Client Brain e dá baixa no item
portal.post('/onboarding/:itemId', (req, res) => {
  const c = myClient(req);
  const it = one("SELECT oi.* FROM onboarding_items oi JOIN onboarding ob ON ob.id=oi.onboarding_id WHERE oi.id=? AND ob.client_id=? AND oi.who='cliente'", req.params.itemId, c.id);
  if (!it) throw new HttpError(404, 'Item não encontrado.');
  const value = String(req.body?.value || '').trim();
  if (it.kind === 'formulario' && !value) throw new HttpError(422, 'Preencha a resposta.');
  update('onboarding_items', { id: it.id }, { status: 'recebido', value: value || it.value, received_at: now() });
  if (it.brain_section && value) run('UPDATE client_brain SET body=?, updated_by=?, updated_at=? WHERE client_id=? AND section=?', value, req.user.id, now(), c.id, it.brain_section);
  log({ actor: req.user.id, action: 'onboarding.item', entity: 'onboarding_item', id: it.id, client: c.id, summary: `Cliente enviou: ${it.label}`, visibility: 'client' });
  notify(all("SELECT user_id FROM client_members WHERE client_id=? AND function IN ('estrategia','atendimento')", c.id).map((r) => r.user_id), { level: 'info', type: 'onboarding', title: `${c.name} enviou: ${it.label}`, link: `/clientes/${c.id}?tab=onboarding`, groupKey: `onb-rec:${c.id}`, client: c.id });
  checkOnboardingComplete(it.onboarding_id, req.user);
  res.json({ ok: true });
});
// Materiais: upload direto (original preservado), visível ao cliente e à equipe
portal.get('/materials', (req, res) => {
  const c = myClient(req);
  res.json(all("SELECT * FROM files WHERE client_id=? AND visibility='client' ORDER BY created_at DESC", c.id).map(fileDTO));
});
portal.post('/materials', upload.array('files', 20), async (req, res) => {
  const c = myClient(req);
  const out = [];
  for (const f of req.files || []) out.push(await ingest(f.path, { originalName: Buffer.from(f.originalname, 'latin1').toString('utf8'), mime: f.mimetype, clientId: c.id, userId: req.user.id, visibility: 'client' }));
  if (!out.length) throw new HttpError(422, 'Nenhum arquivo enviado.');
  const contentId = req.body.content_id;
  if (contentId) {
    const ct = one("SELECT * FROM contents WHERE id=? AND client_id=? AND blocked=1 AND waiting_on='cliente'", contentId, c.id);
    if (ct) unblockContent(ct.id, null, `material enviado pelo cliente (${out.length} arquivo(s))`);
  }
  if (req.body.onboarding_item) {
    const it = one("SELECT oi.* FROM onboarding_items oi JOIN onboarding ob ON ob.id=oi.onboarding_id WHERE oi.id=? AND ob.client_id=?", req.body.onboarding_item, c.id);
    if (it) { update('onboarding_items', { id: it.id }, { status: 'recebido', value: out.map((f) => f.original_name).join(', '), received_at: now() }); checkOnboardingComplete(it.onboarding_id, req.user); }
  }
  log({ actor: req.user.id, action: 'material.recebido', entity: 'file', id: out[0].id, client: c.id, content: contentId || null, summary: `${req.user.name} enviou ${out.length} material(is): ${out.map((f) => f.original_name).join(', ').slice(0, 160)}`, visibility: 'client' });
  notify(all("SELECT user_id FROM client_members WHERE client_id=? AND function IN ('estrategia','atendimento','design','edicao')", c.id).map((r) => r.user_id), { level: 'info', type: 'material', title: `Material recebido de ${c.name}`, body: `${out.length} arquivo(s)`, link: `/clientes/${c.id}?tab=arquivos`, groupKey: `mat:${c.id}`, client: c.id });
  res.json(out.map(fileDTO));
});
// Sala de Reuniões: cliente vê somente horários livres e reserva
portal.get('/meetings', (req, res) => {
  const c = myClient(req);
  res.json({
    meetings: all("SELECT id, title, starts_at, ends_at, location, status, summary FROM meetings WHERE client_id=? ORDER BY starts_at DESC", c.id),
    slots: all('SELECT id, starts_at, ends_at, window_label FROM meeting_slots WHERE meeting_id IS NULL AND starts_at > ? ORDER BY starts_at', new Date(Date.now() + 2 * 3600e3).toISOString()),
    has_upcoming: !!one("SELECT 1 FROM meetings WHERE client_id=? AND status='agendada' AND starts_at > ? AND kind='mensal'", c.id, now()),
  });
});
portal.post('/meetings/book', async (req, res) => {
  const c = myClient(req);
  const slot = one('SELECT * FROM meeting_slots WHERE id=? AND meeting_id IS NULL', req.body?.slot_id);
  if (!slot) throw new HttpError(409, 'Este horário não está mais disponível.');
  if (slot.starts_at < now()) throw new HttpError(409, 'Horário no passado.');
  const MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const m = await createMeeting(req.user, { client_id: c.id, title: `${c.name} e The Bold — Reunião mensal de conteúdo (${MES[new Date(slot.starts_at).getMonth()]})`, kind: 'mensal', starts_at: slot.starts_at, ends_at: slot.ends_at, attendees: slot.host_id ? [slot.host_id] : [], slot_id: slot.id });
  res.json({ id: m.id, starts_at: m.starts_at, gcal_sync: m.gcal_sync });
});
// Conversa com a equipe (canal do cliente)
portal.get('/channel', (req, res) => {
  const c = myClient(req);
  const ch = one("SELECT id FROM channels WHERE client_id=? AND kind='cliente'", c.id);
  res.json({ channel_id: ch?.id || null });
});
