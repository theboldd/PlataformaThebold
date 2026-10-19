// Cofre de segredos de integrações: AES-256-GCM. A chave vem de BOLD_VAULT_KEY (32 bytes base64) — nunca do banco.
// Em desenvolvimento, sem a variável, uma chave local é gerada em storage/.vault-key (não usar em produção).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { one, run, now } from '../db.js';

function key() {
  if (process.env.BOLD_VAULT_KEY) return Buffer.from(process.env.BOLD_VAULT_KEY, 'base64');
  const p = path.resolve(process.env.BOLD_STORAGE_DIR || 'storage', '.vault-key');
  if (!fs.existsSync(p)) fs.writeFileSync(p, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
  return Buffer.from(fs.readFileSync(p, 'utf8'), 'base64');
}
export function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return `v1.${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}
export function open(sealed) {
  if (!sealed) return null;
  const [, iv, tag, data] = sealed.split('.');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8'));
}

export const PROVIDERS = {
  google_calendar: { label: 'Google Calendar', env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], docs: 'OAuth 2.0 (Google Cloud Console → Credenciais → ID do cliente OAuth, tipo Web). Escopo: calendar.events + calendar.freebusy.' },
  meta: { label: 'Meta Business · Instagram', env: ['META_APP_ID', 'META_APP_SECRET'], docs: 'App Meta com Instagram Graph API (instagram_basic, instagram_content_publish, pages_show_list, pages_read_engagement). Exige conta Instagram Profissional vinculada a uma Página.' },
  slack: { label: 'Slack', env: ['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET'], docs: 'Slack App com OAuth v2 (chat:write, channels:read, channels:history). Usado na transição para espelhar avisos.' },
  google_drive: { label: 'Google Drive', env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], docs: 'Especificado em docs/integracoes/google-drive.md — implementação aguardando definição Workspace × Gmail.' },
  anthropic: { label: 'Claude (Anthropic API)', env: ['ANTHROPIC_API_KEY'], docs: 'Chave de API da Anthropic. Usada pelos agentes e pelo The Bold Brain.' },
};
export function integrationStatus(provider) {
  const row = one('SELECT * FROM integrations WHERE provider=?', provider);
  const def = PROVIDERS[provider];
  const configured = def.env.every((e) => !!process.env[e]);
  let status = row?.status || 'desconectado';
  if (provider === 'anthropic') status = configured ? 'conectado' : 'desconectado';
  if (status === 'conectado' && row?.expires_at && row.expires_at < now() && provider !== 'meta') status = 'token_expirado';
  return { provider, label: def.label, configured, status, account: row?.account_label || null, last_error: row?.last_error || null, updated_at: row?.updated_at || null, docs: def.docs, env: def.env, config: row?.config ? JSON.parse(row.config) : null };
}
export function saveIntegration(provider, patch) {
  const ex = one('SELECT provider FROM integrations WHERE provider=?', provider);
  const p = { ...patch, updated_at: now() };
  if (ex) { const k = Object.keys(p); run(`UPDATE integrations SET ${k.map((x) => `${x}=?`).join(',')} WHERE provider=?`, ...k.map((x) => p[x] ?? null), provider); }
  else { const k = ['provider', ...Object.keys(p)]; run(`INSERT INTO integrations (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`, provider, ...Object.values(p).map((v) => v ?? null)); }
}
export function getSecret(provider) { return open(one('SELECT secret_enc FROM integrations WHERE provider=?', provider)?.secret_enc); }
