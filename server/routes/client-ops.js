// LADO DA EQUIPE da área do cliente: solicitações, decisões pedidas ao cliente, marca compartilhada, Pulso,
// Saúde do Cliente (interno), satisfação e pós-reunião. Sempre limitado aos clientes que a pessoa pode acessar.
import { Router } from 'express';
import { one, all, now, parseJSON } from '../db.js';
import { requireInternal, requirePerm } from '../lib/auth.js';
import { assertClient, can, scopeSQL, HttpError } from '../lib/permissions.js';
import { log } from '../lib/core.js';
import { requestForTeam, updateRequest } from '../services/requests.js';
import { createDecision, decisionDTO, savePulse, unpublishPulse, originLabel } from '../services/client-brand.js';
import { clientHealth, lastSnapshots } from '../services/health.js';
import { addTranscript, generateSummaries, saveSummary, publishClientSummary, summariesFor } from '../services/meeting-summaries.js';
import { addMeetingItem } from './comms.js';

export const clientOps = Router();
clientOps.use(requireInternal);
const clientOr404 = (req) => { assertClient(req.user, req.params.id); const c = one('SELECT * FROM clients WHERE id=?', req.params.id); if (!c) throw new HttpError(404, 'Cliente não encontrado.'); return c; };

// ── SOLICITAÇÕES ──
clientOps.get('/requests', requirePerm('clientes', 'view'), (req, res) => {
  const sc = scopeSQL(req.user, 'r.client_id');
  const open = req.query.all ? '' : "AND r.status NOT IN ('concluido','cancelado')";
  res.json(all(`SELECT r.*, c.name client_name FROM client_requests r JOIN clients c ON c.id=r.client_id WHERE ${sc.sql} ${open} ORDER BY r.updated_at DESC LIMIT 300`, ...sc.params).map((r) => ({ ...requestForTeam(r), client_name: r.client_name })));
});
clientOps.get('/clients/:id/requests', requirePerm('clientes', 'view'), (req, res) => {
  const c = clientOr404(req);
  res.json(all('SELECT * FROM client_requests WHERE client_id=? ORDER BY CASE WHEN status IN (\'concluido\',\'cancelado\') THEN 1 ELSE 0 END, updated_at DESC', c.id).map(requestForTeam));
});
clientOps.patch('/requests/:rid', (req, res) => {
  const r = one('SELECT * FROM client_requests WHERE id=?', req.params.rid);
  if (!r) throw new HttpError(404, 'Solicitação não encontrada.');
  assertClient(req.user, r.client_id);
  if (!can(req.user, 'clientes', 'edit') && r.assigned_to !== req.user.id) throw new HttpError(403, 'Só quem cuida da solicitação ou edita clientes pode atualizá-la.');
  res.json(requestForTeam(updateRequest(r.id, req.user, req.body || {})));
});

// ── DECISÕES PEDIDAS AO CLIENTE ──
clientOps.get('/clients/:id/decisions', requirePerm('clientes', 'view'), (req, res) => {
  const c = clientOr404(req);
  res.json(all('SELECT * FROM client_decisions WHERE client_id=? ORDER BY CASE status WHEN \'pendente\' THEN 0 ELSE 1 END, created_at DESC', c.id).map(decisionDTO));
});
clientOps.post('/clients/:id/decisions', requirePerm('clientes', 'edit'), (req, res) => {
  const c = clientOr404(req);
  res.json(decisionDTO(createDecision(c.id, req.user, req.body || {})));
});
clientOps.post('/decisions/:did/cancel', requirePerm('clientes', 'edit'), (req, res) => {
  const d = one('SELECT * FROM client_decisions WHERE id=?', req.params.did);
  if (!d) throw new HttpError(404, 'Decisão não encontrada.');
  assertClient(req.user, d.client_id);
  if (d.status !== 'pendente') throw new HttpError(409, 'Esta decisão já foi respondida.');
  one("UPDATE client_decisions SET status='cancelada' WHERE id=? RETURNING id", d.id);
  log({ actor: req.user.id, action: 'decisao.cancelada', entity: 'client_decision', id: d.id, client: d.client_id, visibility: 'client', summary: `Pedido de decisão retirado pela The Bold: ${d.title}` });
  res.json({ ok: true });
});

// ── SUA MARCA (o que é compartilhado com o cliente) ──
clientOps.patch('/clients/:id/brain-entries/:eid/share', requirePerm('clientes', 'edit'), (req, res) => {
  const c = clientOr404(req);
  const e = one('SELECT * FROM client_brain_entries WHERE id=? AND client_id=?', req.params.eid, c.id);
  if (!e) throw new HttpError(404, 'Registro não encontrado.');
  const shared = !!req.body?.shared;
  if (shared && ['observacao_interna', 'ia', 'indefinido'].includes(e.origin)) throw new HttpError(422, 'Observações internas, sugestões da IA e informações sem origem confirmada não podem ser compartilhadas com o cliente.');
  one('UPDATE client_brain_entries SET shared=? WHERE id=? RETURNING id', shared ? 1 : 0, e.id);
  log({ actor: req.user.id, action: shared ? 'marca.compartilhada' : 'marca.descompartilhada', entity: 'client', id: c.id, client: c.id, summary: `${shared ? 'Compartilhado' : 'Retirado'} em “Sua marca”: ${(e.label || e.content).slice(0, 80)}` });
  res.json({ ok: true, shared });
});
clientOps.get('/clients/:id/brain-entries/:eid/history', requirePerm('clientes', 'view'), (req, res) => {
  const c = clientOr404(req);
  res.json({ history: all('SELECT h.*, u.name changed_by_name FROM client_brain_history h LEFT JOIN users u ON u.id=h.changed_by WHERE h.entry_id=? AND h.client_id=? ORDER BY h.created_at DESC', req.params.eid, c.id),
    confirmations: all('SELECT b.*, u.name user_name FROM brand_confirmations b JOIN users u ON u.id=b.user_id WHERE b.entry_id=? ORDER BY b.created_at DESC', req.params.eid) });
});
clientOps.get('/clients/:id/brand', requirePerm('clientes', 'view'), (req, res) => {
  const c = clientOr404(req);
  res.json({ confirmations: all('SELECT b.*, e.section, e.label, u.name user_name FROM brand_confirmations b JOIN client_brain_entries e ON e.id=b.entry_id JOIN users u ON u.id=b.user_id WHERE b.client_id=? ORDER BY b.created_at DESC LIMIT 50', c.id),
    shared: all('SELECT id, section, label, content, origin, source_type FROM client_brain_entries WHERE client_id=? AND shared=1', c.id).map((e) => ({ ...e, origin_label: originLabel(e) })) });
});

// ── PULSO DA MARCA ──
clientOps.get('/clients/:id/pulse', requirePerm('clientes', 'view'), (req, res) => { const c = clientOr404(req); res.json(one('SELECT * FROM brand_pulse WHERE client_id=?', c.id) || { client_id: c.id, status: 'rascunho' }); });
clientOps.put('/clients/:id/pulse', requirePerm('clientes', 'edit'), (req, res) => { const c = clientOr404(req); res.json(savePulse(c.id, req.user, req.body || {}, !!req.body?.publish)); });
clientOps.post('/clients/:id/pulse/unpublish', requirePerm('clientes', 'edit'), (req, res) => { const c = clientOr404(req); unpublishPulse(c.id, req.user); res.json({ ok: true }); });

// ── SAÚDE DO CLIENTE (interno) + SATISFAÇÃO ──
clientOps.get('/clients/:id/health', requirePerm('clientes', 'view'), (req, res) => {
  const c = clientOr404(req);
  res.json({ ...clientHealth(c.id, req.user), history: lastSnapshots(c.id, 30),
    satisfaction: all('SELECT r.*, u.name user_name FROM satisfaction_responses r JOIN users u ON u.id=r.user_id WHERE r.client_id=? ORDER BY r.created_at DESC LIMIT 30', c.id) });
});
clientOps.get('/client-health', requirePerm('clientes', 'view'), (req, res) => {
  const sc = scopeSQL(req.user, 'id');
  res.json(all(`SELECT id, name, status FROM clients WHERE ${sc.sql} AND status NOT IN ('encerrado') ORDER BY name`, ...sc.params).map((c) => {
    const h = clientHealth(c.id, req.user);
    return { id: c.id, name: c.name, level: h.level, label: h.label, trend: h.trend, signals: h.signals.filter((s) => ['atencao', 'risco'].includes(s.level)).map(({ key, label, level, evidence }) => ({ key, label, level, evidence: evidence.slice(0, 2) })) };
  }));
});

// ── PÓS-REUNIÃO ──
const meetingOr404 = (req) => {
  const m = one('SELECT * FROM meetings WHERE id=?', req.params.mid);
  if (!m) throw new HttpError(404, 'Reunião não encontrada.');
  if (m.client_id) assertClient(req.user, m.client_id);
  if (!can(req.user, 'reunioes', 'view')) throw new HttpError(403, 'Sem acesso.');
  return m;
};
const canEditMeeting = (u) => can(u, 'reunioes', 'edit') || can(u, 'reunioes', 'create');
clientOps.get('/meetings/:mid/post', (req, res) => {
  const m = meetingOr404(req);
  res.json({ transcripts: all('SELECT id, source, status, source_ref, created_at, length(body) size FROM meeting_transcripts WHERE meeting_id=? ORDER BY created_at DESC', m.id), summaries: summariesFor(m.id), agenda: m.agenda });
});
clientOps.post('/meetings/:mid/transcript', (req, res) => {
  const m = meetingOr404(req);
  if (!canEditMeeting(req.user)) throw new HttpError(403, 'Sem permissão.');
  res.json(addTranscript(m, req.user, { body: req.body?.body, source: req.body?.source === 'upload' ? 'upload' : 'colado' }));
});
clientOps.post('/meetings/:mid/summaries/generate', async (req, res) => {
  const m = meetingOr404(req);
  if (!canEditMeeting(req.user)) throw new HttpError(403, 'Sem permissão.');
  res.json(await generateSummaries(m, req.user));
});
clientOps.put('/meetings/:mid/summaries/:audience', (req, res) => {
  const m = meetingOr404(req);
  if (!canEditMeeting(req.user)) throw new HttpError(403, 'Sem permissão.');
  const s = saveSummary(m, req.user, req.params.audience, req.body?.content || {});
  log({ actor: req.user.id, action: 'reuniao.resumo_editado', entity: 'meeting', id: m.id, client: m.client_id, summary: `Resumo ${req.params.audience === 'client' ? 'do cliente' : 'interno'} editado (V${s.version})` });
  res.json({ ...s, content: parseJSON(s.content, {}) });
});
clientOps.post('/meetings/:mid/summaries/client/publish', (req, res) => {
  const m = meetingOr404(req);
  if (!can(req.user, 'reunioes', 'edit')) throw new HttpError(403, 'Só quem edita reuniões pode publicar o resumo ao cliente.');
  res.json(publishClientSummary(m, req.user));
});
// Resumo interno → registros oficiais, item a item, com confirmação humana (tarefas, decisões, memória do cliente)
clientOps.post('/meetings/:mid/summaries/internal/apply', (req, res) => {
  const m = meetingOr404(req);
  if (!canEditMeeting(req.user)) throw new HttpError(403, 'Sem permissão.');
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 60) : [];
  if (!items.length) throw new HttpError(422, 'Escolha os itens que viram registro.');
  const out = items.map((it) => addMeetingItem(m, req.user, { kind: it.kind, body: it.body, owner_id: it.owner_id || null, due_at: it.due_at || null, origin: 'ia_confirmado' }));
  const s = one("SELECT id FROM meeting_summaries WHERE meeting_id=? AND audience='internal' ORDER BY version DESC LIMIT 1", m.id);
  if (s) one("UPDATE meeting_summaries SET status='publicado', approved_by=?, approved_at=?, updated_at=? WHERE id=? RETURNING id", req.user.id, now(), now(), s.id);
  log({ actor: req.user.id, action: 'reuniao.resumo_interno_aplicado', entity: 'meeting', id: m.id, client: m.client_id, summary: `${out.length} item(ns) do resumo interno viraram registro (tarefas, decisões, memória)` });
  res.json({ ok: true, created: out.length });
});
