// Núcleo transversal: auditoria (activity log), notificações agrupadas e barramento em tempo real (SSE).
import { EventEmitter } from 'node:events';
import { one, all, insert, run, uid, now } from '../db.js';
import { deliveryFor, emailNotification } from '../services/notification-prefs.js';

export const bus = new EventEmitter();
bus.setMaxListeners(500);

// ── ACTIVITY LOG (append-only) ──────────────────────────
export function log({ actor = null, kind, action, entity, id = null, client = null, content = null, summary, before, after, origin = 'manual', visibility = 'internal', ip = null }) {
  const actorKind = kind || (actor ? 'usuario' : 'sistema');
  const row = insert('activity_logs', {
    id: uid('log_'), actor_id: actor, actor_kind: actorKind, action, entity_type: entity, entity_id: id,
    client_id: client, content_id: content, summary, before: before ?? null, after: after ?? null,
    origin: actorKind === 'usuario' ? origin : 'automatica', visibility, ip, created_at: now(),
  });
  bus.emit('activity', row);
  return row;
}

// ── NOTIFICAÇÕES ────────────────────────────────────────
// level: info | atencao | urgente. group_key agrupa notificações repetidas (não lidas) em uma só.
// Notificação ao cliente responde sempre: o que aconteceu (title) · por que importa / o que fazer (body) · [cta →] (link)
export function notify(userIds, { level = 'info', type, title, body = null, link = null, cta = null, groupKey = null, client = null, content = null, exclude = null }) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean))].filter((id) => id !== exclude);
  const ts = now();
  for (const user_id of ids) {
    const u = one('SELECT active FROM users WHERE id=?', user_id);
    if (!u?.active) continue;
    // Preferências da pessoa (Perfil → Notificações). Sem preferência salva = comportamento original. URGENTE sempre chega.
    const pref = deliveryFor(user_id, type, level);
    if (pref.email) emailNotification(user_id, { title, body, link });
    if (!pref.platform) continue;
    if (groupKey && pref.group) {
      const ex = one('SELECT * FROM notifications WHERE user_id=? AND group_key=? AND read_at IS NULL', user_id, groupKey);
      if (ex) {
        run('UPDATE notifications SET count=count+1, title=?, body=?, cta=COALESCE(?, cta), level=?, updated_at=? WHERE id=?', title, body, cta, rank(level) > rank(ex.level) ? level : ex.level, ts, ex.id);
        bus.emit('notify', { user_id, id: ex.id });
        continue;
      }
    }
    const n = insert('notifications', { id: uid('n_'), user_id, level, type, title, body, link, cta, group_key: groupKey, client_id: client, content_id: content, created_at: ts, updated_at: ts });
    bus.emit('notify', { user_id, id: n.id });
  }
}
const rank = (l) => ({ info: 0, atencao: 1, urgente: 2 })[l] ?? 0;

// ── MENÇÕES ─────────────────────────────────────────────
// Reconhece @Nome (primeiro nome) e @Funcao (ex.: @Designer, @Estrategista) restrito às pessoas permitidas.
const FUNC_ALIASES = { designer: 'design', design: 'design', editor: 'edicao', editora: 'edicao', edicao: 'edicao', estrategista: 'estrategia', estrategia: 'estrategia', copy: 'copy', copywriter: 'copy', revisao: 'revisao', atendimento: 'atendimento', agendamento: 'agendamento' };
export function parseMentions(body, allowedUsers, clientId) {
  const tokens = [...String(body).matchAll(/@([\p{L}][\p{L}\d_.-]*)/gu)].map((m) => m[1]);
  const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const out = new Set();
  for (const t of tokens) {
    const f = fold(t);
    const byName = allowedUsers.filter((u) => fold(u.name.split(' ')[0]) === f || fold(u.name.replace(/\s+/g, '')) === f);
    byName.forEach((u) => out.add(u.id));
    if (!byName.length && FUNC_ALIASES[f] && clientId) {
      all('SELECT user_id FROM client_members WHERE client_id=? AND function=?', clientId, FUNC_ALIASES[f])
        .forEach((r) => allowedUsers.some((u) => u.id === r.user_id) && out.add(r.user_id));
    }
  }
  return [...out];
}
export function recordMentions(sourceType, sourceId, userIds, byUser) {
  for (const user_id of userIds) insert('mentions', { id: uid('m_'), source_type: sourceType, source_id: sourceId, user_id, by_user_id: byUser, created_at: now() });
}

export const businessDaysFrom = (date, days) => {
  const d = new Date(date);
  let left = days;
  while (left > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) left--; }
  return d;
};
export const userName = (id) => (id ? one('SELECT name FROM users WHERE id=?', id)?.name : null);
