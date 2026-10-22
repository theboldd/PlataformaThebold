// PREFERÊNCIAS DE NOTIFICAÇÃO por pessoa. Categorias derivadas dos `type` reais usados nas chamadas de notify().
// Regras: sem preferência salva = tudo ligado na plataforma (comportamento original). URGENTE nunca é desligado na plataforma.
// E-mail só sai quando o Resend está configurado (mailConfigured) e a pessoa escolheu; falha de e-mail nunca derruba a notificação.
// Push: em desenvolvimento (não selecionável).
import { db, one, all, run, now } from '../db.js';
import { mailConfigured, sendMail } from './mail.js';

db.exec(`
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL, platform INTEGER NOT NULL DEFAULT 1, email INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL, PRIMARY KEY (user_id, category)
);
CREATE TABLE IF NOT EXISTS notification_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  group_similar INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
);
`);

export const NOTIF_CATEGORIES = [
  { key: 'tarefas', label: 'Tarefas e prazos', types: ['tarefa', 'prazo', 'lembrete', 'atraso', 'follow_up', 'sem_responsavel'] },
  { key: 'etapas', label: 'Etapas do processo', types: ['etapa_movida', 'pronto_para_etapa', 'agendado', 'desbloqueio'] },
  { key: 'comentarios', label: 'Comentários, menções e mensagens', types: ['mencao', 'resposta', 'direta', 'mensagem', 'mensagem_cliente', 'comentario_publicado', 'comentario_cliente', 'pergunta_cliente'] },
  { key: 'aprovacoes', label: 'Aprovações, ajustes e revisão', types: ['aprovacao', 'aprovacao_cliente', 'aprovacao_desfeita', 'ajuste', 'ajuste_recebido', 'ajuste_cliente', 'ajuste_pos_aprovacao', 'revisao', 'revisao_rodada', 'legenda_cliente', 'decisao'] },
  { key: 'reunioes', label: 'Reuniões', types: ['reuniao'] },
  { key: 'clientes', label: 'Clientes e solicitações', types: ['solicitacao', 'onboarding', 'material', 'marca', 'pulso', 'satisfacao'] },
  { key: 'risco', label: 'Risco e saúde', types: ['saude', 'escalada', 'parado', 'bloqueio', 'cliente_atraso'] },
  { key: 'financeiro', label: 'Financeiro e comercial', types: ['financeiro', 'crm'] },
  { key: 'sistema', label: 'Sistema e integrações', types: ['meta'] }, // também recebe qualquer tipo não mapeado
];
const BY_TYPE = Object.fromEntries(NOTIF_CATEGORIES.flatMap((c) => c.types.map((t) => [t, c.key])));
export const categoryOf = (type) => BY_TYPE[type] || 'sistema';

// Decide o que fazer para UMA pessoa: { platform, email, group }. Sem linha salva = padrão original.
export function deliveryFor(userId, type, level) {
  const cat = categoryOf(type);
  const p = one('SELECT platform, email FROM notification_prefs WHERE user_id=? AND category=?', userId, cat);
  const s = one('SELECT group_similar FROM notification_settings WHERE user_id=?', userId);
  return {
    platform: level === 'urgente' ? true : p ? !!p.platform : true,
    email: !!p?.email && mailConfigured(),
    group: s ? !!s.group_similar : true,
  };
}

// Envio de e-mail "melhor esforço": nunca lança, nunca bloqueia a notificação.
export function emailNotification(userId, { title, body, link }) {
  try {
    const u = one('SELECT email, name, active FROM users WHERE id=?', userId);
    if (!u?.active || !u.email) return;
    const base = process.env.PUBLIC_BASE_URL || '';
    const url = link ? `${base}${link}` : null;
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
    sendMail({
      to: u.email, subject: `The Bold · ${title}`,
      text: [title, body, url].filter(Boolean).join('\n\n'),
      html: `<p><b>${esc(title)}</b></p>${body ? `<p>${esc(body)}</p>` : ''}${url ? `<p><a href="${esc(url)}">Abrir na plataforma</a></p>` : ''}`,
    }).catch(() => {});
  } catch { /* melhor esforço */ }
}

export function prefsFor(userId) {
  const rows = Object.fromEntries(all('SELECT * FROM notification_prefs WHERE user_id=?', userId).map((r) => [r.category, r]));
  const s = one('SELECT group_similar FROM notification_settings WHERE user_id=?', userId);
  return {
    categories: NOTIF_CATEGORIES.map((c) => ({ key: c.key, label: c.label, types: c.types, platform: rows[c.key] ? !!rows[c.key].platform : true, email: rows[c.key] ? !!rows[c.key].email : false, customized: !!rows[c.key] })),
    group_similar: s ? !!s.group_similar : true,
    channels: {
      plataforma: { state: 'ativo', note: 'Notificações URGENTES sempre chegam na plataforma, mesmo com a categoria desligada.' },
      email: mailConfigured() ? { state: 'ativo' } : { state: 'aguardando_configuracao', missing: 'configurar RESEND_API_KEY e BOLD_MAIL_FROM no servidor. Sua escolha fica salva e passa a valer quando o e-mail for configurado.' },
      push: { state: 'em_desenvolvimento', missing: 'notificações push ainda não existem na plataforma.' },
    },
  };
}

export function savePrefs(userId, { categories = {}, group_similar } = {}) {
  const ts = now();
  const changed = [];
  for (const c of NOTIF_CATEGORIES) {
    const v = categories[c.key];
    if (!v || typeof v !== 'object') continue;
    const cur = one('SELECT platform, email FROM notification_prefs WHERE user_id=? AND category=?', userId, c.key) || { platform: 1, email: 0 };
    const platform = v.platform === undefined ? cur.platform : v.platform ? 1 : 0;
    const email = v.email === undefined ? cur.email : v.email ? 1 : 0;
    run('INSERT INTO notification_prefs (user_id,category,platform,email,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id,category) DO UPDATE SET platform=excluded.platform, email=excluded.email, updated_at=excluded.updated_at', userId, c.key, platform, email, ts);
    if (platform !== cur.platform || email !== cur.email) changed.push(`${c.label}: plataforma ${platform ? 'on' : 'off'}, e-mail ${email ? 'on' : 'off'}`);
  }
  if (group_similar !== undefined) {
    const cur = one('SELECT group_similar FROM notification_settings WHERE user_id=?', userId);
    const g = group_similar ? 1 : 0;
    run('INSERT INTO notification_settings (user_id,group_similar,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET group_similar=excluded.group_similar, updated_at=excluded.updated_at', userId, g, ts);
    if ((cur ? cur.group_similar : 1) !== g) changed.push(`Agrupar parecidas: ${g ? 'on' : 'off'}`);
  }
  return changed;
}
