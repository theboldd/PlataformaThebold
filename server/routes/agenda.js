// AGENDA — criar eventos, compromissos e tarefas no Calendário. A equipe só visualiza; criar exige a permissão "agenda",
// que só a CEO concede. Ao criar, escolhe-se quem vê: toda a equipe ou pessoas selecionadas uma a uma (verificado no servidor).
import { Router } from 'express';
import { one, all, insert, update, uid, now, tx } from '../db.js';
import { requireInternal, requirePerm } from '../lib/auth.js';
import { can, HttpError, assertClient } from '../lib/permissions.js';
import { log, notify } from '../lib/core.js';

export const agenda = Router();
const TIPOS = { evento: 'Evento', compromisso: 'Compromisso', tarefa: 'Tarefa' };
const team = () => all("SELECT id, name, functions FROM users WHERE active=1 AND role_key<>'cliente' ORDER BY name");

// Quem pode ver um evento: toda a equipe, ou criador + pessoas selecionadas; quem tem agenda:admin vê todos
export const eventVisibleSQL = (user) => ({
  sql: `(e.audience='todos' OR e.created_by=? OR EXISTS (SELECT 1 FROM event_members em WHERE em.event_id=e.id AND em.user_id=?) OR ?)`,
  params: [user.id, user.id, can(user, 'agenda', 'admin') ? 1 : 0],
});

agenda.get('/agenda/opcoes', requireInternal, requirePerm('calendario', 'view'), (req, res) => res.json({
  can_create: can(req.user, 'agenda', 'create'), people: team(), tipos: TIPOS,
  clients: all("SELECT id, name FROM clients WHERE status<>'encerrado' ORDER BY name"),
}));

agenda.post('/agenda/itens', requireInternal, requirePerm('agenda', 'create'), (req, res) => {
  const b = req.body || {};
  if (!TIPOS[b.tipo]) throw new HttpError(422, 'Escolha o tipo: evento, compromisso ou tarefa.');
  if (!b.title?.trim()) throw new HttpError(422, 'Informe o título.');
  const start = new Date(b.starts_at);
  if (!b.starts_at || Number.isNaN(start.getTime())) throw new HttpError(422, 'Informe a data e o horário.');
  const end = b.ends_at ? new Date(b.ends_at) : null;
  if (end && (Number.isNaN(end.getTime()) || end < start)) throw new HttpError(422, 'O fim precisa ser depois do início.');
  if (b.client_id) assertClient(req.user, b.client_id);
  const everyone = b.audience !== 'selecionados';
  const valid = new Set(team().map((p) => p.id));
  const members = everyone ? [] : [...new Set(b.members || [])].filter((id) => valid.has(id));
  if (!everyone && !members.length) throw new HttpError(422, 'Selecione pelo menos uma pessoa da equipe (ou escolha “Toda a equipe”).');
  const recipients = everyone ? [...valid] : members;
  const title = b.title.trim();
  const when = start.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const out = tx(() => {
    if (b.tipo === 'tarefa') {
      // Tarefa = uma tarefa real por pessoa (aparece em Pendências/Processos e no Calendário como prazo)
      const ids = recipients.map((uidv) => insert('tasks', { id: uid('t_'), title, description: b.description?.trim() || null, client_id: b.client_id || null, assignee_id: uidv, status: 'aberta', kind: 'manual', origin: 'manual',
        priority: ['baixa', 'media', 'alta', 'critica'].includes(b.priority) ? b.priority : 'media', due_at: start.toISOString(), created_by: req.user.id, created_at: now(), data_origin: 'plataforma' }).id);
      return { tipo: 'tarefa', tasks: ids.length };
    }
    const e = insert('events', { id: uid('ev_'), title, kind: b.tipo, description: b.description?.trim() || null, starts_at: start.toISOString(), ends_at: end ? end.toISOString() : null, all_day: b.all_day ? 1 : 0,
      client_id: b.client_id || null, audience: everyone ? 'todos' : 'selecionados', created_by: req.user.id, created_at: now() });
    for (const m of members) insert('event_members', { event_id: e.id, user_id: m });
    return { tipo: b.tipo, id: e.id };
  });
  log({ actor: req.user.id, action: 'agenda.criado', entity: out.id ? 'event' : 'task', id: out.id || null, client: b.client_id || null,
    summary: `${TIPOS[b.tipo]} criado no Calendário: “${title}” (${when}) · ${everyone ? 'toda a equipe' : `${members.length} pessoa(s) selecionada(s)`}` });
  notify(recipients.filter((x) => x !== req.user.id), { level: 'info', type: b.tipo === 'tarefa' ? 'tarefa' : 'agenda', title: `${TIPOS[b.tipo]}: ${title}`, body: `${when} · criado por ${req.user.name}`, link: b.tipo === 'tarefa' ? '/pendencias' : '/calendario' });
  res.json({ ...out, recipients: recipients.length });
});

agenda.post('/agenda/eventos/:id/cancelar', requireInternal, requirePerm('agenda', 'create'), (req, res) => {
  const e = one('SELECT * FROM events WHERE id=?', req.params.id);
  if (!e || e.cancelled_at) throw new HttpError(404, 'Evento não encontrado.');
  if (e.created_by !== req.user.id && !can(req.user, 'agenda', 'admin')) throw new HttpError(403, 'Só quem criou (ou quem administra a agenda) cancela este evento.');
  if (!req.body?.reason?.trim()) throw new HttpError(422, 'Informe o motivo do cancelamento.');
  update('events', { id: e.id }, { cancelled_at: now(), cancelled_by: req.user.id, cancel_reason: req.body.reason.trim() });
  log({ actor: req.user.id, action: 'agenda.cancelado', entity: 'event', id: e.id, client: e.client_id, summary: `Evento cancelado: “${e.title}” — ${req.body.reason.trim()}` });
  const who = e.audience === 'todos' ? team().map((p) => p.id) : all('SELECT user_id FROM event_members WHERE event_id=?', e.id).map((r) => r.user_id);
  notify(who.filter((x) => x !== req.user.id), { level: 'info', type: 'agenda', title: `Cancelado: ${e.title}`, body: req.body.reason.trim(), link: '/calendario' });
  res.json({ ok: true });
});
