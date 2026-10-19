import { Router } from 'express';
import { one, all, insert, update, run, uid, now, parseJSON, tx } from '../db.js';
import { requireInternal, requirePerm, requireAuth } from '../lib/auth.js';
import { can, canAccessClient, assertClient, scopeSQL, isInternal, HttpError } from '../lib/permissions.js';
import { bus, log, notify, parseMentions, recordMentions, userName } from '../lib/core.js';
import { STAGES, publicStatus, clientDecision, reviewDecision, blockContent } from '../engine/process.js';
import { automation } from '../engine/automations.js';
import { ingest, fileDTO } from '../services/media.js';
import * as gcal from '../integrations/google.js';
import { upload } from './ops.js';

export const comms = Router();

// ═════════════ CHAT ═════════════
export function canSeeChannel(user, ch) {
  if (!ch) return false;
  if (ch.kind === 'cliente') return canAccessClient(user, ch.client_id) && (isInternal(user) || !!one("SELECT 1 FROM client_members WHERE user_id=? AND client_id=? AND function='cliente'", user.id, ch.client_id));
  if (!isInternal(user)) return false;
  if (ch.kind === 'direto' || ch.is_private) return !!one('SELECT 1 FROM channel_members WHERE channel_id=? AND user_id=?', ch.id, user.id);
  return true;
}
const channelMembers = (ch) => ch.kind === 'cliente'
  ? [...new Set([...all('SELECT user_id FROM client_members WHERE client_id=?', ch.client_id).map((r) => r.user_id), ...all('SELECT user_id FROM channel_members WHERE channel_id=?', ch.id).map((r) => r.user_id)])]
  : ch.kind === 'interno' && !ch.is_private ? all("SELECT id FROM users WHERE active=1 AND role_key<>'cliente'").map((r) => r.id) : all('SELECT user_id FROM channel_members WHERE channel_id=?', ch.id).map((r) => r.user_id);

comms.get('/chat/channels', requireAuth, (req, res) => {
  const u = req.user;
  const rows = all('SELECT * FROM channels ORDER BY kind, name').filter((ch) => canSeeChannel(u, ch));
  res.json(rows.map((ch) => {
    const lr = one('SELECT last_read_at FROM channel_members WHERE channel_id=? AND user_id=?', ch.id, u.id)?.last_read_at || '1970';
    const last = one('SELECT m.body, m.created_at, us.name FROM messages m JOIN users us ON us.id=m.author_id WHERE m.channel_id=? AND m.parent_id IS NULL ORDER BY m.created_at DESC LIMIT 1', ch.id);
    return { ...ch, unread: one('SELECT COUNT(*) n FROM messages WHERE channel_id=? AND created_at>? AND author_id<>?', ch.id, lr, u.id).n, last, client_name: ch.client_id ? one('SELECT name FROM clients WHERE id=?', ch.client_id)?.name : null,
      direct_name: ch.kind === 'direto' ? all('SELECT u.name FROM channel_members cm JOIN users u ON u.id=cm.user_id WHERE cm.channel_id=? AND cm.user_id<>?', ch.id, u.id).map((x) => x.name).join(', ') : null };
  }));
});
comms.post('/chat/channels', requireInternal, (req, res) => {
  const { name, topic, is_private = false, kind = 'interno', members = [] } = req.body || {};
  if (kind === 'direto') {
    const other = members[0];
    const ex = one("SELECT c.id FROM channels c WHERE c.kind='direto' AND EXISTS (SELECT 1 FROM channel_members WHERE channel_id=c.id AND user_id=?) AND EXISTS (SELECT 1 FROM channel_members WHERE channel_id=c.id AND user_id=?)", req.user.id, other);
    if (ex) return res.json({ id: ex.id });
    const ch = insert('channels', { id: uid('ch_'), kind: 'direto', name: 'direto', is_private: 1, created_by: req.user.id, created_at: now() });
    [req.user.id, other].forEach((m) => run('INSERT OR IGNORE INTO channel_members (channel_id,user_id) VALUES (?,?)', ch.id, m));
    return res.json(ch);
  }
  if (!name?.trim()) throw new HttpError(422, 'Nome do canal obrigatório.');
  const slug = name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
  const ch = insert('channels', { id: uid('ch_'), kind: 'interno', name: slug, topic, is_private: is_private ? 1 : 0, created_by: req.user.id, created_at: now() });
  [req.user.id, ...members].forEach((m) => run('INSERT OR IGNORE INTO channel_members (channel_id,user_id) VALUES (?,?)', ch.id, m));
  log({ actor: req.user.id, action: 'canal.criado', entity: 'channel', id: ch.id, summary: `Canal #${slug} criado` });
  res.json(ch);
});
const msgDTO = (m) => ({ ...m, converted_to: parseJSON(m.converted_to, []), file: m.file_id ? fileDTO(one('SELECT * FROM files WHERE id=?', m.file_id)) : null,
  replies: one('SELECT COUNT(*) n FROM messages WHERE parent_id=?', m.id).n, last_reply_at: one('SELECT MAX(created_at) t FROM messages WHERE parent_id=?', m.id).t });
comms.get('/chat/channels/:id/messages', requireAuth, (req, res) => {
  const ch = one('SELECT * FROM channels WHERE id=?', req.params.id);
  if (!canSeeChannel(req.user, ch)) throw new HttpError(404, 'Canal não encontrado.');
  const parent = req.query.parent || null;
  const rows = all(`SELECT m.*, u.name author_name, u.role_key author_role, u.avatar_color FROM messages m JOIN users u ON u.id=m.author_id WHERE m.channel_id=? AND ${parent ? 'm.parent_id=?' : 'm.parent_id IS NULL'} ORDER BY m.created_at DESC LIMIT 200`, ch.id, ...(parent ? [parent] : []));
  run('INSERT INTO channel_members (channel_id,user_id,last_read_at) VALUES (?,?,?) ON CONFLICT(channel_id,user_id) DO UPDATE SET last_read_at=excluded.last_read_at', ch.id, req.user.id, now());
  res.json({ channel: ch, messages: rows.reverse().map(msgDTO), parent: parent ? msgDTO(one('SELECT m.*, u.name author_name, u.role_key author_role FROM messages m JOIN users u ON u.id=m.author_id WHERE m.id=?', parent)) : null,
    people: all('SELECT id, name, role_key FROM users WHERE id IN (' + channelMembers(ch).map(() => '?').join(',') + ')', ...channelMembers(ch)) });
});
comms.post('/chat/channels/:id/messages', requireAuth, upload.single('file'), async (req, res) => {
  const ch = one('SELECT * FROM channels WHERE id=?', req.params.id);
  if (!canSeeChannel(req.user, ch)) throw new HttpError(404, 'Canal não encontrado.');
  const body = String(req.body?.body || '').trim();
  if (!body && !req.file) throw new HttpError(422, 'Mensagem vazia.');
  let file = null;
  if (req.file) file = await ingest(req.file.path, { originalName: Buffer.from(req.file.originalname, 'latin1').toString('utf8'), mime: req.file.mimetype, clientId: ch.client_id, userId: req.user.id, visibility: ch.kind === 'cliente' ? 'client' : 'internal' });
  const parent_id = req.body.parent_id || null;
  const m = insert('messages', { id: uid('msg_'), channel_id: ch.id, parent_id, author_id: req.user.id, body: body || '(arquivo)', file_id: file?.id || null, created_at: now() });
  const members = channelMembers(ch);
  const people = all(`SELECT id, name FROM users WHERE active=1 AND id IN (${members.map(() => '?').join(',') || "''"})`, ...members);
  const mentioned = parseMentions(body, people, ch.client_id).filter((id) => id !== req.user.id);
  recordMentions('message', m.id, mentioned, req.user.id);
  const link = (uidv) => (one('SELECT role_key FROM users WHERE id=?', uidv)?.role_key === 'cliente' ? '/portal/comunicacao' : `/comunicacao/${ch.id}${parent_id ? `?thread=${parent_id}` : ''}`);
  for (const id of mentioned) notify(id, { level: 'atencao', type: 'mencao', title: `${req.user.name} mencionou você`, body: body.slice(0, 140), link: link(id), client: ch.client_id });
  if (mentioned.length) automation('mencao', { entity: 'message', id: m.id, client: ch.client_id });
  if (parent_id) { const p = one('SELECT author_id FROM messages WHERE id=?', parent_id); if (p && p.author_id !== req.user.id && !mentioned.includes(p.author_id)) notify(p.author_id, { level: 'info', type: 'resposta', title: `${req.user.name} respondeu na thread`, body: body.slice(0, 140), link: link(p.author_id), groupKey: `thread:${parent_id}:${p.author_id}` }); }
  if (ch.kind === 'cliente' && req.user.role_key === 'cliente') {
    notify(members.filter((id) => id !== req.user.id && !mentioned.includes(id)), { level: 'info', type: 'mensagem_cliente', title: `Mensagem de ${req.user.name}`, body: body.slice(0, 140), link: `/comunicacao/${ch.id}`, groupKey: `cliente-msg:${ch.id}`, client: ch.client_id });
  }
  if (ch.kind === 'direto') notify(members.filter((id) => id !== req.user.id), { level: 'info', type: 'direta', title: `Mensagem de ${req.user.name}`, body: body.slice(0, 140), link: `/comunicacao/${ch.id}`, groupKey: `dm:${ch.id}` });
  bus.emit('message', { channel_id: ch.id, id: m.id, client_id: ch.client_id, members });
  res.json(msgDTO({ ...m, author_name: req.user.name, author_role: req.user.role_key }));
});
// Transformar mensagem em registro oficial: tarefa | pendencia | decisao | ajuste | evento
comms.post('/chat/messages/:id/convert', requireInternal, (req, res) => {
  const m = one('SELECT * FROM messages WHERE id=?', req.params.id);
  const ch = m && one('SELECT * FROM channels WHERE id=?', m.channel_id);
  if (!canSeeChannel(req.user, ch)) throw new HttpError(404, 'Mensagem não encontrada.');
  const { type, title, assignee_id, due_at, content_id, starts_at } = req.body || {};
  const clientId = req.body.client_id || ch.client_id || null;
  if (clientId) assertClient(req.user, clientId);
  const text = title?.trim() || m.body.slice(0, 160);
  const author = userName(m.author_id);
  let result;
  tx(() => {
    if (type === 'tarefa' || type === 'pendencia') {
      const t = insert('tasks', { id: uid('t_'), title: type === 'pendencia' ? `Pendência: ${text}` : text, description: `Origem: mensagem de ${author} em ${ch.kind === 'cliente' ? 'conversa com cliente' : '#' + ch.name}:\n“${m.body}”`, client_id: clientId, content_id: content_id || null,
        assignee_id: assignee_id || null, status: 'aberta', kind: 'manual', origin: 'chat', source_type: 'message', source_id: m.id, priority: type === 'pendencia' ? 'alta' : 'media', due_at: due_at ? new Date(due_at).toISOString() : null, created_by: req.user.id, created_at: now() });
      if (assignee_id) notify(assignee_id, { level: 'info', type: 'tarefa', title: `Nova ${type === 'pendencia' ? 'pendência' : 'tarefa'} da conversa`, body: text, link: `/comunicacao/${ch.id}`, client: clientId });
      if (type === 'pendencia' && content_id) blockContent(content_id, text, req.body.waiting_on || 'cliente', req.user);
      result = { type, id: t.id };
    } else if (type === 'decisao') {
      if (!clientId) throw new HttpError(422, 'Decisões são registradas no Client Brain: informe o cliente.');
      const d = insert('client_memories', { id: uid('cm_'), client_id: clientId, kind: 'decisao', body: text, source_type: 'message', source_id: m.id, created_by: req.user.id, created_at: now() });
      result = { type, id: d.id };
    } else if (type === 'ajuste') {
      const c = one('SELECT * FROM contents WHERE id=?', content_id);
      if (!c) throw new HttpError(422, 'Selecione o conteúdo do ajuste.');
      if (['aprovacao_cliente', 'aprovacao_tema'].includes(c.stage)) clientDecision(c.id, req.user, { decision: 'ajuste', note: m.body, on_behalf_note: `pedido do cliente na conversa (${new Date(m.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })})` }, req);
      else if (['analise_producao', 'analise_cronograma', 'revisao_ajuste'].includes(c.stage)) reviewDecision(c.id, req.user, { decision: 'ajuste', note: m.body }, req);
      else throw new HttpError(409, `O conteúdo está em “${STAGES[c.stage].label}”. Ajustes entram em etapas de revisão ou de aprovação do cliente.`);
      result = { type, id: c.id };
    } else if (type === 'evento') {
      if (!starts_at) throw new HttpError(422, 'Informe a data do evento.');
      const e = insert('events', { id: uid('ev_'), title: text, kind: req.body.kind || 'compromisso', starts_at: new Date(starts_at).toISOString(), all_day: req.body.all_day ? 1 : 0, client_id: clientId, created_by: req.user.id, created_at: now() });
      result = { type, id: e.id };
    } else throw new HttpError(422, 'Tipo inválido.');
    const conv = parseJSON(m.converted_to, []); conv.push({ ...result, by: req.user.name, at: now() });
    update('messages', { id: m.id }, { converted_to: JSON.stringify(conv) });
  });
  automation('chat.converter', { entity: 'message', id: m.id, client: clientId, detail: type });
  log({ actor: req.user.id, action: 'chat.convertido', entity: 'message', id: m.id, client: clientId, content: content_id, summary: `Mensagem de ${author} virou ${type}: ${text.slice(0, 120)}` });
  res.json(result);
});

// ═════════════ CALENDÁRIO (contexto operacional + Google Calendar) ═════════════
comms.get('/calendar', requireInternal, async (req, res) => {
  if (!can(req.user, 'calendario')) throw new HttpError(403, 'Sem acesso ao calendário.');
  const start = req.query.start || new Date(Date.now() - 7 * 864e5).toISOString();
  const end = req.query.end || new Date(Date.now() + 35 * 864e5).toISOString();
  const sc = scopeSQL(req.user, 'c.client_id');
  const cf = req.query.client_id ? ' AND c.client_id=?' : '';
  const cp = req.query.client_id ? [req.query.client_id] : [];
  const items = [];
  for (const c of all(`SELECT c.*, cl.name client FROM contents c JOIN clients cl ON cl.id=c.client_id WHERE ${sc.sql}${cf} AND c.stage<>'cancelado' AND COALESCE(c.scheduled_at,c.planned_at) BETWEEN ? AND ?`, ...sc.params, ...cp, start, end)) {
    items.push({ id: `c:${c.id}`, type: 'conteudo', title: `${c.client} — ${c.title}`, start: c.scheduled_at || c.planned_at, format: c.format, status: publicStatus(c), stage: STAGES[c.stage].label, client_id: c.client_id, link: `/conteudos/${c.id}` });
  }
  const sct = scopeSQL(req.user, 't.client_id');
  for (const t of all(`SELECT t.*, cl.name client, u.name assignee FROM tasks t LEFT JOIN clients cl ON cl.id=t.client_id LEFT JOIN users u ON u.id=t.assignee_id WHERE t.status IN ('aberta','em_andamento') AND t.function<>'cliente' AND t.due_at BETWEEN ? AND ? AND (t.client_id IS NULL OR ${sct.sql})${req.query.client_id ? ' AND t.client_id=?' : ''} ${req.query.mine ? 'AND t.assignee_id=?' : ''}`, start, end, ...sct.params, ...cp, ...(req.query.mine ? [req.user.id] : []))) {
    items.push({ id: `t:${t.id}`, type: 'prazo', title: `Prazo: ${t.title}`, start: t.due_at, assignee: t.assignee, client_id: t.client_id, link: t.content_id ? `/conteudos/${t.content_id}` : null, overdue: t.due_at < now() });
  }
  const scm = scopeSQL(req.user, 'm.client_id');
  for (const m of all(`SELECT m.*, cl.name client FROM meetings m LEFT JOIN clients cl ON cl.id=m.client_id WHERE m.status<>'cancelada' AND m.starts_at BETWEEN ? AND ? AND (m.client_id IS NULL OR ${scm.sql})${req.query.client_id ? ' AND m.client_id=?' : ''}`, start, end, ...scm.params, ...cp)) {
    items.push({ id: `m:${m.id}`, type: 'reuniao', title: m.title, start: m.starts_at, end: m.ends_at, client_id: m.client_id, gcal: m.gcal_sync, link: `/reunioes?m=${m.id}` });
  }
  for (const e of all(`SELECT e.* FROM events e WHERE e.starts_at BETWEEN ? AND ? AND (e.client_id IS NULL OR ${scopeSQL(req.user, 'e.client_id').sql})`, start, end, ...scopeSQL(req.user, 'e.client_id').params)) {
    items.push({ id: `e:${e.id}`, type: e.kind === 'producao' || e.kind === 'ciclo' ? 'ciclo' : 'evento', title: e.title, start: e.starts_at, end: e.ends_at, all_day: !!e.all_day, client_id: e.client_id });
  }
  // Marcos do ciclo: agregados por mês (ex.: "Produção · NOVEMBRO") — iguais para todos os clientes, mostrados uma vez
  const LABEL = { cronograma_entrega: 'Entrega de cronograma', revisao_cronograma: 'Revisão de cronograma', ajuste_cronograma: 'Ajuste de cronograma', cliente_aprova_temas: 'Clientes aprovam temas', leitura_comentarios: 'Estrategistas leem comentários', producao: 'Produção', revisao_producao: 'Revisão da produção', ajustes_equipe: 'Ajustes da equipe', tudo_pronto: 'Tudo pronto', cliente_aprova_final: 'Clientes aprovam produção', ajustes_cliente: 'Ajustes dos clientes', agendamento: 'Agendamento' };
  const seen = new Set();
  const MES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
  for (const cy of all(`SELECT cy.* FROM cycles cy WHERE ${scopeSQL(req.user, 'cy.client_id').sql}`, ...scopeSQL(req.user, 'cy.client_id').params)) {
    for (const [k, ms] of Object.entries(parseJSON(cy.milestones, {}))) {
      const key = `${cy.month}:${k}:${ms.start}:${ms.end}`;
      if (seen.has(key) || ms.end < start.slice(0, 10) || ms.start > end.slice(0, 10)) continue;
      seen.add(key);
      items.push({ id: `cy:${key}`, type: 'ciclo', title: `${LABEL[k] || k} · ${MES[Number(cy.month.slice(5)) - 1]}`, start: ms.start, end: ms.end, all_day: true });
    }
  }
  let google = { status: gcal.connected() ? 'conectado' : 'desconectado', items: 0 };
  if (gcal.connected() && !req.query.client_id) {
    try {
      const ev = await gcal.listEvents(start, end);
      const known = new Set(all('SELECT gcal_event_id FROM meetings WHERE gcal_event_id IS NOT NULL').map((r) => r.gcal_event_id));
      for (const e of ev.filter((x) => !known.has(x.id))) items.push({ id: `g:${e.id}`, type: 'google', title: e.summary || '(sem título)', start: e.start?.dateTime || e.start?.date, end: e.end?.dateTime || e.end?.date, all_day: !!e.start?.date, link: e.htmlLink, external: true });
      google.items = ev.length;
    } catch (e) { google = { status: 'erro', error: e.message }; }
  }
  res.json({ items: items.sort((a, b) => String(a.start).localeCompare(String(b.start))), google });
});

// ═════════════ REUNIÕES ═════════════
async function conflictCheck(userIds, startsAt, endsAt, ignoreMeeting = null) {
  const clash = all(`SELECT m.title, u.name FROM meetings m JOIN meeting_attendees a ON a.meeting_id=m.id JOIN users u ON u.id=a.user_id WHERE m.status='agendada' AND m.starts_at < ? AND m.ends_at > ? AND a.user_id IN (${userIds.map(() => '?').join(',') || "''"}) ${ignoreMeeting ? 'AND m.id<>?' : ''}`,
    endsAt, startsAt, ...userIds, ...(ignoreMeeting ? [ignoreMeeting] : []));
  if (clash.length) throw new HttpError(409, `Conflito de agenda: ${clash[0].name} já tem “${clash[0].title}” neste horário.`);
  if (gcal.connected()) {
    const emails = all(`SELECT email FROM users WHERE id IN (${userIds.map(() => '?').join(',') || "''"}) AND role_key<>'cliente'`, ...userIds).map((r) => r.email);
    try {
      const busy = await gcal.freeBusy(emails, startsAt, endsAt);
      if (busy.length) throw new HttpError(409, 'Conflito no Google Calendar da equipe neste horário.');
    } catch (e) { if (e.status === 409) throw e; /* Google indisponível: segue com a checagem interna */ }
  }
}
async function syncToGoogle(meetingId) {
  const m = one('SELECT * FROM meetings WHERE id=?', meetingId);
  if (!gcal.connected()) return 'nao_sincronizado';
  try {
    const att = all('SELECT u.email FROM meeting_attendees a JOIN users u ON u.id=a.user_id WHERE a.meeting_id=?', m.id).map((r) => r.email).filter((e) => !e.endsWith('.demo'));
    const ev = await gcal.createEvent({ title: m.title, description: `${m.summary || ''}\n\nReunião registrada na THE BOLD OS.`, start: m.starts_at, end: m.ends_at, attendees: att, location: m.location });
    update('meetings', { id: m.id }, { gcal_event_id: ev.id, gcal_sync: 'sincronizado' });
    return 'sincronizado';
  } catch (e) { update('meetings', { id: m.id }, { gcal_sync: 'erro' }); log({ kind: 'integracao', action: 'gcal.erro', entity: 'meeting', id: m.id, client: m.client_id, summary: `Google Calendar: ${e.message}` }); return 'erro'; }
}
export async function createMeeting(actor, { client_id, title, kind = 'mensal', starts_at, ends_at, attendees = [], location, summary, slot_id = null }) {
  if (!title?.trim() || !starts_at || !ends_at) throw new HttpError(422, 'Título, início e fim são obrigatórios.');
  const s = new Date(starts_at).toISOString(), e = new Date(ends_at).toISOString();
  if (e <= s) throw new HttpError(422, 'O fim deve ser depois do início.');
  const team = client_id ? all("SELECT user_id FROM client_members WHERE client_id=? AND function IN ('estrategia','atendimento','revisao')", client_id).map((r) => r.user_id) : [];
  const clientUsersIds = client_id ? all("SELECT user_id FROM client_members WHERE client_id=? AND function='cliente'", client_id).map((r) => r.user_id) : [];
  const people = [...new Set([...attendees, ...team, ...clientUsersIds, ...(isInternal(actor) ? [actor.id] : [])])];
  await conflictCheck(people.filter((id) => !clientUsersIds.includes(id)), s, e);
  const m = tx(() => {
    const m = insert('meetings', { id: uid('mt_'), client_id: client_id || null, title: title.trim(), kind, starts_at: s, ends_at: e, location: location || null, status: 'agendada', booked_by: actor.id, summary: summary || null, created_at: now() });
    people.forEach((id) => run('INSERT OR IGNORE INTO meeting_attendees (meeting_id,user_id) VALUES (?,?)', m.id, id));
    if (slot_id) {
      const r = run('UPDATE meeting_slots SET meeting_id=? WHERE id=? AND meeting_id IS NULL', m.id, slot_id);
      if (!r.changes) throw new HttpError(409, 'Este horário acabou de ser reservado. Escolha outro.');
    }
    return m;
  });
  const sync = await syncToGoogle(m.id);
  update('meetings', { id: m.id }, { gcal_sync: sync });
  automation(slot_id ? 'reuniao.reservada' : 'reuniao.itens', { entity: 'meeting', id: m.id, client: client_id, detail: sync });
  const when = new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  notify(people.filter((id) => id !== actor.id), { level: 'info', type: 'reuniao', title: `Reunião agendada: ${title}`, body: `${when}${sync === 'sincronizado' ? ' · no Google Calendar' : ''}`, link: '/reunioes', client: client_id });
  log({ actor: actor.id, action: 'reuniao.criada', entity: 'meeting', id: m.id, client: client_id, summary: `Reunião “${title}” em ${when} (Google Calendar: ${sync.replace('_', ' ')})`, visibility: 'client' });
  return one('SELECT * FROM meetings WHERE id=?', m.id);
}
const meetingDTO = (m) => ({ ...m, client_name: m.client_id ? one('SELECT name FROM clients WHERE id=?', m.client_id)?.name : null,
  attendees: all('SELECT u.id, u.name, u.role_key FROM meeting_attendees a JOIN users u ON u.id=a.user_id WHERE a.meeting_id=?', m.id),
  items: all('SELECT mi.*, u.name owner_name FROM meeting_items mi LEFT JOIN users u ON u.id=mi.owner_id WHERE mi.meeting_id=? ORDER BY mi.created_at', m.id) });
comms.get('/meetings', requireInternal, (req, res) => {
  if (!can(req.user, 'reunioes')) throw new HttpError(403, 'Sem acesso.');
  const sc = scopeSQL(req.user, 'client_id');
  const rows = all(`SELECT * FROM meetings WHERE (client_id IS NULL OR ${sc.sql}) ${req.query.client_id ? 'AND client_id=?' : ''} ORDER BY starts_at DESC LIMIT 200`, ...sc.params, ...(req.query.client_id ? [req.query.client_id] : []));
  res.json({ meetings: rows.map(meetingDTO), slots: all('SELECT s.*, u.name host_name, m.title meeting_title, c.name client_name FROM meeting_slots s LEFT JOIN users u ON u.id=s.host_id LEFT JOIN meetings m ON m.id=s.meeting_id LEFT JOIN clients c ON c.id=m.client_id WHERE s.starts_at > ? ORDER BY s.starts_at', new Date(Date.now() - 864e5).toISOString()),
    google: gcal.connected() ? 'conectado' : 'desconectado' });
});
comms.post('/meetings', requireInternal, async (req, res) => {
  if (!can(req.user, 'reunioes', 'create')) throw new HttpError(403, 'Sem permissão para criar reuniões.');
  if (req.body?.client_id) assertClient(req.user, req.body.client_id);
  res.json(meetingDTO(await createMeeting(req.user, req.body || {})));
});
comms.patch('/meetings/:id', requireInternal, async (req, res) => {
  if (!can(req.user, 'reunioes', 'edit')) throw new HttpError(403, 'Sem permissão.');
  const m = one('SELECT * FROM meetings WHERE id=?', req.params.id);
  if (!m) throw new HttpError(404, 'Reunião não encontrada.');
  if (m.client_id) assertClient(req.user, m.client_id);
  const { status, starts_at, ends_at, summary, notes } = req.body || {};
  const patch = {};
  if (summary !== undefined) patch.summary = summary;
  if (notes !== undefined) patch.notes = notes;
  if (status) patch.status = status;
  if (starts_at && ends_at) {
    patch.starts_at = new Date(starts_at).toISOString(); patch.ends_at = new Date(ends_at).toISOString();
    await conflictCheck(all("SELECT a.user_id FROM meeting_attendees a JOIN users u ON u.id=a.user_id WHERE a.meeting_id=? AND u.role_key<>'cliente'", m.id).map((r) => r.user_id), patch.starts_at, patch.ends_at, m.id);
  }
  update('meetings', { id: m.id }, patch);
  if (m.gcal_event_id && gcal.connected()) {
    try {
      if (status === 'cancelada') await gcal.deleteEvent(m.gcal_event_id);
      else if (patch.starts_at) await gcal.updateEvent(m.gcal_event_id, { start: { dateTime: patch.starts_at }, end: { dateTime: patch.ends_at } });
    } catch (e) { update('meetings', { id: m.id }, { gcal_sync: 'erro' }); }
  }
  if (status === 'cancelada') run('UPDATE meeting_slots SET meeting_id=NULL WHERE meeting_id=?', m.id);
  const people = all('SELECT user_id FROM meeting_attendees WHERE meeting_id=?', m.id).map((r) => r.user_id).filter((id) => id !== req.user.id);
  if (status === 'cancelada' || patch.starts_at) notify(people, { level: 'atencao', type: 'reuniao', title: status === 'cancelada' ? `Reunião cancelada: ${m.title}` : `Reunião alterada: ${m.title}`, body: patch.starts_at ? new Date(patch.starts_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null, link: '/reunioes', client: m.client_id });
  log({ actor: req.user.id, action: 'reuniao.alterada', entity: 'meeting', id: m.id, client: m.client_id, summary: `Reunião “${m.title}”: ${Object.keys(patch).join(', ')}`, before: JSON.stringify({ starts_at: m.starts_at, status: m.status }), after: JSON.stringify({ starts_at: patch.starts_at || m.starts_at, status: patch.status || m.status }), visibility: status === 'cancelada' || patch.starts_at ? 'client' : 'internal' });
  res.json(meetingDTO(one('SELECT * FROM meetings WHERE id=?', m.id)));
});
// Ata estruturada: decisões, ações (viram tarefas), pendências, mudanças de estratégia, solicitações
comms.post('/meetings/:id/items', requireInternal, (req, res) => {
  const m = one('SELECT * FROM meetings WHERE id=?', req.params.id);
  if (!m) throw new HttpError(404, 'Reunião não encontrada.');
  if (m.client_id) assertClient(req.user, m.client_id);
  if (!can(req.user, 'reunioes', 'edit') && !can(req.user, 'reunioes', 'create')) throw new HttpError(403, 'Sem permissão.');
  const { kind, body, owner_id, due_at } = req.body || {};
  if (!['decisao', 'acao', 'pendencia', 'mudanca_estrategia', 'solicitacao', 'informacao'].includes(kind) || !body?.trim()) throw new HttpError(422, 'Tipo e descrição obrigatórios.');
  const item = tx(() => {
    const it = insert('meeting_items', { id: uid('mi_'), meeting_id: m.id, kind, body: body.trim(), owner_id: owner_id || null, due_at: due_at ? new Date(due_at).toISOString() : null, origin: 'manual', confirmed: 1, created_at: now() });
    if (['acao', 'pendencia', 'solicitacao'].includes(kind)) {
      const t = insert('tasks', { id: uid('t_'), title: body.trim().slice(0, 160), description: `Origem: reunião “${m.title}” (${new Date(m.starts_at).toLocaleDateString('pt-BR')})`, client_id: m.client_id, assignee_id: owner_id || null, status: 'aberta', kind: 'reuniao', origin: 'reuniao', source_type: 'meeting', source_id: m.id, priority: kind === 'pendencia' ? 'alta' : 'media', due_at: it.due_at, created_by: req.user.id, created_at: now() });
      update('meeting_items', { id: it.id }, { task_id: t.id });
      if (owner_id) notify(owner_id, { level: 'info', type: 'tarefa', title: 'Nova tarefa da reunião', body: body.slice(0, 140), link: '/', client: m.client_id });
      automation('reuniao.itens', { entity: 'meeting_item', id: it.id, client: m.client_id, detail: kind });
    }
    if (m.client_id && ['decisao', 'mudanca_estrategia'].includes(kind)) insert('client_memories', { id: uid('cm_'), client_id: m.client_id, kind: 'decisao', body: body.trim(), source_type: 'meeting', source_id: m.id, created_by: req.user.id, created_at: now() });
    return it;
  });
  log({ actor: req.user.id, action: 'reuniao.item', entity: 'meeting', id: m.id, client: m.client_id, summary: `Reunião “${m.title}” — ${kind}: ${body.slice(0, 120)}` });
  res.json(item);
});
comms.post('/meetings/slots', requireInternal, (req, res) => {
  if (!can(req.user, 'reunioes', 'admin') && !can(req.user, 'reunioes', 'edit')) throw new HttpError(403, 'Sem permissão.');
  const { date, from = '09:00', to = '17:00', duration = 60, host_id, label, skip = [] } = req.body || {};
  if (!date) throw new HttpError(422, 'Informe a data.');
  const created = [];
  let t = new Date(`${date}T${from}:00-03:00`);
  const endT = new Date(`${date}T${to}:00-03:00`);
  while (t.getTime() + duration * 60e3 <= endT.getTime()) {
    const hhmm = t.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    if (!skip.includes(hhmm)) created.push(insert('meeting_slots', { id: uid('sl_'), starts_at: t.toISOString(), ends_at: new Date(t.getTime() + duration * 60e3).toISOString(), host_id: host_id || req.user.id, window_label: label || 'Reuniões mensais', created_at: now() }));
    t = new Date(t.getTime() + duration * 60e3);
  }
  log({ actor: req.user.id, action: 'reuniao.horarios', entity: 'meeting_slot', summary: `${created.length} horários abertos em ${date} (${label || 'Reuniões mensais'})` });
  res.json(created);
});
comms.delete('/meetings/slots/:id', requireInternal, (req, res) => {
  const r = run('DELETE FROM meeting_slots WHERE id=? AND meeting_id IS NULL', req.params.id);
  if (!r.changes) throw new HttpError(409, 'Horário já reservado: cancele a reunião primeiro.');
  res.json({ ok: true });
});
