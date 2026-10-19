// Autenticação: senhas com scrypt, sessões opacas (token só existe no cookie httpOnly; no banco fica o hash).
import crypto from 'node:crypto';
import { one, run, insert, uid, now } from '../db.js';
import { can, isInternal, HttpError } from './permissions.js';

const SESSION_DAYS = 14;
export const COOKIE = 'bold_session';

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
export function verifyPassword(pw, stored) {
  const [alg, s, h] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const hash = crypto.scryptSync(pw, Buffer.from(s, 'base64'), 64, { N: 16384, r: 8, p: 1 });
  const ref = Buffer.from(h, 'base64');
  return ref.length === hash.length && crypto.timingSafeEqual(ref, hash);
}
export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 10) throw new HttpError(400, 'A senha precisa ter pelo menos 10 caracteres.');
}

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

// Sessões assinadas (sem estado) para ambientes com várias instâncias e banco local por instância (prévia no Vercel).
// O token carrega usuário + validade + HMAC; qualquer instância valida sem consultar a tabela de sessões.
const STATELESS = process.env.BOLD_STATELESS_SESSIONS === '1';
const SECRET = process.env.BOLD_SESSION_SECRET || (process.env.BOLD_DEMO === '1' ? 'the-bold-os:demo-preview' : null);
if (STATELESS && !SECRET) throw new Error('BOLD_SESSION_SECRET é obrigatório com sessões assinadas.');
const sign = (payload) => crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
function readSigned(token) {
  const [v, userId, exp, mac] = String(token).split('.');
  if (v !== 'v1' || !userId || !exp || !mac) return null;
  const ref = Buffer.from(sign(`v1.${userId}.${exp}`)), got = Buffer.from(mac);
  if (ref.length !== got.length || !crypto.timingSafeEqual(ref, got) || Number(exp) < Date.now()) return null;
  return userId;
}

export function createSession(user, req) {
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  const token = STATELESS ? `v1.${user.id}.${Date.parse(expires)}.${sign(`v1.${user.id}.${Date.parse(expires)}`)}` : crypto.randomBytes(32).toString('base64url');
  insert('sessions', { id: uid('s_'), token_hash: sha(token), user_id: user.id, created_at: now(), expires_at: expires, ip: req.ip, user_agent: String(req.headers['user-agent'] || '').slice(0, 200) });
  run('UPDATE users SET last_login_at=? WHERE id=?', now(), user.id);
  return { token, expires };
}
export function destroySession(token) { if (token) run('DELETE FROM sessions WHERE token_hash=?', sha(token)); }
export function destroyUserSessions(userId) { run('DELETE FROM sessions WHERE user_id=?', userId); }

// Limite de tentativas de login (memória do processo)
const attempts = new Map();
export function checkRate(key) {
  const a = attempts.get(key) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60e3) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 8) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.');
  a.n++; attempts.set(key, a);
}
export const clearRate = (key) => attempts.delete(key);

export function loadUser(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  req.user = null;
  if (token && STATELESS) {
    const userId = readSigned(token);
    const u = userId && one('SELECT * FROM users WHERE id=?', userId);
    if (u && u.active) req.user = u;
  } else if (token) {
    const s = one('SELECT * FROM sessions WHERE token_hash=?', sha(token));
    if (s && s.expires_at > now()) {
      const u = one('SELECT * FROM users WHERE id=?', s.user_id);
      if (u && u.active) req.user = u;
    }
  }
  next();
}

// CSRF: requisições que alteram estado precisam do header customizado (bloqueado cross-origin sem CORS).
export function csrf(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/api/integrations/webhooks/')) return next();
  if (req.headers['x-bold-request'] !== '1') return next(new HttpError(403, 'Requisição inválida.'));
  next();
}

export const requireAuth = (req, _res, next) => (req.user ? next() : next(new HttpError(401, 'Faça login para continuar.')));
export const requireInternal = (req, _res, next) => (!req.user ? next(new HttpError(401, 'Faça login.')) : isInternal(req.user) ? next() : next(new HttpError(403, 'Área exclusiva da equipe The Bold.')));
export const requireClientUser = (req, _res, next) => (!req.user ? next(new HttpError(401, 'Faça login para continuar.')) : req.user.role_key === 'cliente' ? next() : next(new HttpError(403, 'Área exclusiva do cliente.')));
export const requirePerm = (module, action = 'view') => (req, _res, next) => (can(req.user, module, action) ? next() : next(new HttpError(403, 'Sem permissão para esta ação.')));
