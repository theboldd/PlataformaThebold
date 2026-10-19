import { Router } from 'express';
import { one, all, insert, update, run, uid, now, parseJSON, tx } from '../db.js';
import { hashPassword, verifyPassword, validatePassword, createSession, destroySession, destroyUserSessions, checkRate, clearRate, COOKIE, requireAuth, requireInternal, requirePerm } from '../lib/auth.js';
import { MODULES, ACTIONS, permissionMap, roleOf, can, canAccessClient, isInternal, scopeSQL, HttpError, PENDENCIAS_ROLES } from '../lib/permissions.js';
import { bus, log } from '../lib/core.js';
import { storage, fileDTO } from '../services/media.js';
import { verifyAssetSig } from '../integrations/meta.js';

export const core = Router();

const userDTO = (u) => ({ id: u.id, name: u.name, email: u.email, role_key: u.role_key, title: u.title, functions: parseJSON(u.functions, []), active: !!u.active, avatar_color: u.avatar_color, capacity: u.capacity, last_login_at: u.last_login_at });

// ── AUTH ──
core.post('/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const key = `${req.ip}:${email}`;
  checkRate(key);
  const u = one('SELECT * FROM users WHERE email=?', email);
  const pw = String(req.body?.password || '');
  // senha colada costuma vir com espaço ou quebra de linha nas pontas
  if (!u || !(verifyPassword(pw, u.password_hash) || (pw !== pw.trim() && verifyPassword(pw.trim(), u.password_hash)))) throw new HttpError(401, 'E-mail ou senha incorretos.');
  if (!u.active) throw new HttpError(403, 'Acesso desativado. Fale com a administração.');
  clearRate(key);
  const s = createSession(u, req);
  res.cookie(COOKIE, s.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', expires: new Date(s.expires), path: '/' });
  log({ actor: u.id, action: 'auth.login', entity: 'user', id: u.id, summary: `${u.name} entrou`, ip: req.ip });
  res.json({ ok: true });
});
core.post('/auth/logout', (req, res) => { destroySession(req.cookies?.[COOKIE]); res.clearCookie(COOKIE, { path: '/' }); res.json({ ok: true }); });
core.get('/auth/me', requireAuth, (req, res) => {
  const u = req.user;
  const role = roleOf(u);
  const clients = u.role_key === 'cliente' ? all("SELECT c.id, c.name, c.handle, c.color FROM client_members cm JOIN clients c ON c.id=cm.client_id WHERE cm.user_id=? AND cm.function='cliente'", u.id) : [];
  res.json({ user: userDTO(u), role: { key: role.key, label: role.label, dashboard: role.dashboard, all_clients: !!role.all_clients }, permissions: permissionMap(u), internal: isInternal(u), clients,
    pendencias: can(u, 'pendencias') });
});
core.post('/auth/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  if (!verifyPassword(String(current || ''), req.user.password_hash)) throw new HttpError(400, 'Senha atual incorreta.');
  validatePassword(next);
  update('users', { id: req.user.id }, { password_hash: hashPassword(next) });
  log({ actor: req.user.id, action: 'auth.senha', entity: 'user', id: req.user.id, summary: 'Senha alterada' });
  res.json({ ok: true });
});

// ── USUÁRIOS E PERMISSÕES (admin) ──
core.get('/users/directory', requireInternal, (_req, res) => {
  res.json(all("SELECT id, name, role_key, title, functions, avatar_color FROM users WHERE active=1 AND role_key<>'cliente' ORDER BY name").map((u) => ({ ...u, functions: parseJSON(u.functions, []) })));
});
core.get('/users', requirePerm('usuarios', 'view'), (_req, res) => {
  const users = all('SELECT * FROM users ORDER BY role_key=\'cliente\', name').map((u) => ({
    ...userDTO(u),
    clients: all('SELECT cm.client_id, cm.function, c.name FROM client_members cm JOIN clients c ON c.id=cm.client_id WHERE cm.user_id=?', u.id),
    overrides: all('SELECT module, action, effect FROM user_permissions WHERE user_id=?', u.id),
  }));
  res.json({ users, roles: all('SELECT * FROM roles'), role_permissions: all('SELECT * FROM role_permissions'), modules: MODULES, actions: ACTIONS });
});
core.post('/users', requirePerm('usuarios', 'admin'), (req, res) => {
  const { name, email, password, role_key, title, functions = [], capacity = 12, clients = [] } = req.body || {};
  if (!name?.trim() || !email?.includes('@')) throw new HttpError(422, 'Nome e e-mail válidos são obrigatórios.');
  if (!one('SELECT 1 FROM roles WHERE key=?', role_key)) throw new HttpError(422, 'Função (role) inválida.');
  if (one('SELECT 1 FROM users WHERE email=?', email.toLowerCase())) throw new HttpError(409, 'Já existe um usuário com este e-mail.');
  validatePassword(password);
  const u = tx(() => {
    const u = insert('users', { id: uid('u_'), name: name.trim(), email: email.trim().toLowerCase(), password_hash: hashPassword(password), role_key, title, functions: JSON.stringify(functions), capacity, active: 1, avatar_color: '#4A1725', created_at: now() });
    for (const c of clients) insert('client_members', { client_id: c.client_id, user_id: u.id, function: role_key === 'cliente' ? 'cliente' : c.function });
    return u;
  });
  log({ actor: req.user.id, action: 'usuario.criado', entity: 'user', id: u.id, summary: `Usuário ${u.name} criado (${role_key})` });
  res.json(userDTO(one('SELECT * FROM users WHERE id=?', u.id)));
});
core.patch('/users/:id', requirePerm('usuarios', 'admin'), (req, res) => {
  const u = one('SELECT * FROM users WHERE id=?', req.params.id);
  if (!u) throw new HttpError(404, 'Usuário não encontrado.');
  const { name, role_key, title, functions, active, capacity, password } = req.body || {};
  if (u.id === req.user.id && active === false) throw new HttpError(422, 'Você não pode desativar o próprio acesso.');
  const patch = {};
  if (name) patch.name = name;
  if (role_key) { if (!one('SELECT 1 FROM roles WHERE key=?', role_key)) throw new HttpError(422, 'Role inválido.'); patch.role_key = role_key; }
  if (title !== undefined) patch.title = title;
  if (functions) patch.functions = JSON.stringify(functions);
  if (capacity) patch.capacity = Number(capacity);
  if (active !== undefined) patch.active = active ? 1 : 0;
  if (password) { validatePassword(password); patch.password_hash = hashPassword(password); }
  update('users', { id: u.id }, patch);
  if (active === false || password) destroyUserSessions(u.id);
  log({ actor: req.user.id, action: 'usuario.alterado', entity: 'user', id: u.id, summary: `Usuário ${u.name} alterado: ${Object.keys(patch).filter((k) => k !== 'password_hash').join(', ')}${password ? ', senha' : ''}`, before: JSON.stringify({ role_key: u.role_key, active: u.active }), after: JSON.stringify({ role_key: patch.role_key ?? u.role_key, active: patch.active ?? u.active }) });
  res.json(userDTO(one('SELECT * FROM users WHERE id=?', u.id)));
});
core.put('/users/:id/clients', requirePerm('usuarios', 'admin'), (req, res) => {
  const u = one('SELECT * FROM users WHERE id=?', req.params.id);
  if (!u) throw new HttpError(404, 'Usuário não encontrado.');
  const links = Array.isArray(req.body?.links) ? req.body.links : [];
  // vínculo de pessoa da equipe com cliente = Divisão de clientes (mesma regra da tela Divisão)
  const sig = (list) => JSON.stringify(list.map((l) => `${l.client_id}:${l.function}`).sort());
  const changed = sig(links) !== sig(all('SELECT client_id, function FROM client_members WHERE user_id=?', u.id));
  if (changed && u.role_key !== 'cliente' && !can(req.user, 'divisao', 'edit')) throw new HttpError(403, 'Vincular ou desvincular clientes da equipe é liberado pela CEO (Divisão de clientes).');
  tx(() => {
    run('DELETE FROM client_members WHERE user_id=?', u.id);
    for (const l of links) insert('client_members', { client_id: l.client_id, user_id: u.id, function: u.role_key === 'cliente' ? 'cliente' : l.function });
  });
  log({ actor: req.user.id, action: 'usuario.clientes', entity: 'user', id: u.id, summary: `Vínculos de ${u.name} atualizados (${links.length})` });
  res.json({ ok: true });
});
core.put('/users/:id/permissions', requirePerm('usuarios', 'admin'), (req, res) => {
  const u = one('SELECT * FROM users WHERE id=?', req.params.id);
  if (!u) throw new HttpError(404, 'Usuário não encontrado.');
  const ov = (req.body?.overrides || []).filter((o) => MODULES[o.module] && ACTIONS.includes(o.action) && ['grant', 'deny'].includes(o.effect));
  // liberar/retirar a Divisão de clientes é decisão da CEO (divisao:admin)
  const div = (list) => JSON.stringify(list.filter((o) => o.module === 'divisao').map((o) => `${o.effect}:${o.action}`).sort());
  if (div(ov) !== div(all('SELECT module, action, effect FROM user_permissions WHERE user_id=?', u.id)) && !can(req.user, 'divisao', 'admin')) throw new HttpError(403, 'Só a CEO (ou quem tem a Divisão de clientes como administração) pode liberar quem vincula e desvincula clientes.');
  tx(() => { run('DELETE FROM user_permissions WHERE user_id=?', u.id); ov.forEach((o) => insert('user_permissions', { user_id: u.id, ...o })); });
  log({ actor: req.user.id, action: 'usuario.permissoes', entity: 'user', id: u.id, summary: `Permissões específicas de ${u.name}: ${ov.map((o) => `${o.effect} ${o.module}:${o.action}`).join(', ') || 'nenhuma'}` });
  res.json({ ok: true });
});
core.put('/roles/:key/permissions', requirePerm('usuarios', 'admin'), (req, res) => {
  const role = one('SELECT * FROM roles WHERE key=?', req.params.key);
  if (!role) throw new HttpError(404, 'Role não encontrado.');
  const perms = (req.body?.permissions || []).filter((p) => MODULES[p.module] && ACTIONS.includes(p.action));
  const divR = (list) => JSON.stringify(list.filter((p) => p.module === 'divisao').map((p) => p.action).sort());
  if (divR(perms) !== divR(all('SELECT module, action FROM role_permissions WHERE role_key=?', role.key)) && !can(req.user, 'divisao', 'admin')) throw new HttpError(403, 'Só a CEO pode mudar quem vincula e desvincula clientes da equipe.');
  tx(() => { run('DELETE FROM role_permissions WHERE role_key=?', role.key); perms.forEach((p) => insert('role_permissions', { role_key: role.key, module: p.module, action: p.action })); });
  log({ actor: req.user.id, action: 'role.permissoes', entity: 'role', id: role.key, summary: `Permissões do perfil ${role.label} atualizadas (${perms.length})` });
  res.json({ ok: true });
});

// ── NOTIFICAÇÕES + STREAM (SSE) ──
core.get('/notifications', requireAuth, (req, res) => {
  const items = all('SELECT * FROM notifications WHERE user_id=? ORDER BY read_at IS NOT NULL, updated_at DESC LIMIT 80', req.user.id);
  res.json({ items, unread: one('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL', req.user.id).n });
});
core.post('/notifications/:id/read', requireAuth, (req, res) => { run('UPDATE notifications SET read_at=? WHERE id=? AND user_id=?', now(), req.params.id, req.user.id); res.json({ ok: true }); });
core.post('/notifications/read-all', requireAuth, (req, res) => { run('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL', now(), req.user.id); res.json({ ok: true }); });
core.get('/stream', requireAuth, (req, res) => {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  res.write('retry: 4000\n\n');
  const uidv = req.user.id;
  const user = req.user;
  const onN = (e) => { if (e.user_id === uidv) res.write(`event: notification\ndata: ${JSON.stringify({ id: e.id })}\n\n`); };
  const onM = (m) => { if (m.members ? m.members.includes(uidv) : true) { if (m.client_id && !canAccessClient(user, m.client_id)) return; res.write(`event: message\ndata: ${JSON.stringify({ channel_id: m.channel_id, id: m.id })}\n\n`); } };
  const onA = (a) => { if (!isInternal(user)) { if (a.visibility !== 'client' || !a.client_id || !canAccessClient(user, a.client_id)) return; } else if (a.client_id && !canAccessClient(user, a.client_id) && a.entity_type !== 'content') return; res.write(`event: activity\ndata: ${JSON.stringify({ entity: a.entity_type, id: a.entity_id, content_id: a.content_id, client_id: a.client_id })}\n\n`); };
  bus.on('notify', onN); bus.on('message', onM); bus.on('activity', onA);
  const ping = setInterval(() => res.write(': ping\n\n'), 25e3);
  req.on('close', () => { clearInterval(ping); bus.off('notify', onN); bus.off('message', onM); bus.off('activity', onA); });
});

// ── HISTÓRICO / AUDITORIA ──
core.get('/history', requirePerm('historico', 'view'), (req, res) => {
  const { client_id, content_id, actor_kind, action, q, limit = 200 } = req.query;
  const sc = scopeSQL(req.user, 'l.client_id');
  const where = [`(l.client_id IS NULL OR ${sc.sql})`]; const p = [...sc.params];
  if (client_id) { where.push('l.client_id=?'); p.push(client_id); }
  if (content_id) { where.push('l.content_id=?'); p.push(content_id); }
  if (actor_kind) { where.push('l.actor_kind=?'); p.push(actor_kind); }
  if (action) { where.push('l.action LIKE ?'); p.push(`${action}%`); }
  if (q) { where.push('l.summary LIKE ?'); p.push(`%${q}%`); }
  if (!can(req.user, 'financeiro')) where.push("l.entity_type NOT IN ('invoice','contract')");
  res.json(all(`SELECT l.*, u.name actor_name, c.name client_name FROM activity_logs l LEFT JOIN users u ON u.id=l.actor_id LEFT JOIN clients c ON c.id=l.client_id WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC LIMIT ?`, ...p, Math.min(Number(limit) || 200, 1000)));
});

// ── MÍDIA (entrega autenticada; Range/streaming suportado) ──
export function canViewFile(user, f) {
  if (!f) return false;
  if (isInternal(user)) return !f.client_id || canAccessClient(user, f.client_id);
  if (!f.client_id || !canAccessClient(user, f.client_id)) return false;
  if (f.visibility === 'client') return true;
  return !!one(`SELECT 1 FROM version_media vm JOIN content_versions v ON v.id=vm.version_id JOIN contents c ON c.id=v.content_id
    WHERE vm.file_id=? AND c.client_id=? AND (v.sent_to_client_at IS NOT NULL OR v.status='aprovada')`, f.id, f.client_id);
}
core.get('/media/:id/:variant', requireAuth, (req, res) => {
  const f = one('SELECT * FROM files WHERE id=?', req.params.id);
  if (!canViewFile(req.user, f)) throw new HttpError(404, 'Arquivo não encontrado.');
  let key = f.storage_key, mime = f.mime;
  if (req.params.variant !== 'original') {
    const v = one('SELECT * FROM file_variants WHERE file_id=? AND variant=?', f.id, req.params.variant);
    if (v) { key = v.storage_key; mime = v.mime; }
  }
  res.setHeader('content-type', mime);
  res.setHeader('cache-control', 'private, max-age=3600');
  res.setHeader('x-content-type-options', 'nosniff');
  if (req.query.download) res.setHeader('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.original_name)}`);
  res.sendFile(storage.path(key), { acceptRanges: true });
});
core.get('/files/:id', requireAuth, (req, res) => {
  const f = one('SELECT * FROM files WHERE id=?', req.params.id);
  if (!canViewFile(req.user, f)) throw new HttpError(404, 'Arquivo não encontrado.');
  res.json(fileDTO(f));
});
// Ativo de publicação para a Meta (link assinado e temporário — sem sessão)
core.get('/public/asset/:id', (req, res) => {
  if (!verifyAssetSig(req.params.id, req.query.exp, req.query.sig)) throw new HttpError(403, 'Link inválido ou expirado.');
  const f = one('SELECT * FROM files WHERE id=?', req.params.id);
  const v = one("SELECT * FROM file_variants WHERE file_id=? AND variant='publish'", f.id);
  res.setHeader('content-type', v?.mime || f.mime);
  res.sendFile(storage.path(v?.storage_key || f.storage_key));
});
