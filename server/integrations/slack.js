// Slack — ponte de transição. A comunicação operacional migra para o THE BOLD CHAT, mas o Slack pode
// continuar recebendo espelhos de avisos (ex.: #aprovações) enquanto a equipe se adapta.
// Integração real via OAuth v2 + chat.postMessage. Sem SLACK_CLIENT_ID/SECRET, permanece desconectado.
import crypto from 'node:crypto';
import { one, run, insert, now } from '../db.js';
import { seal, getSecret, saveIntegration, integrationStatus } from './vault.js';

const redirectUri = () => `${process.env.PUBLIC_BASE_URL || 'http://localhost:4000'}/api/integrations/slack/callback`;
export function authUrl(userId) {
  if (!process.env.SLACK_CLIENT_ID) throw Object.assign(new Error('SLACK_CLIENT_ID/SLACK_CLIENT_SECRET não configurados no servidor.'), { status: 412 });
  const state = crypto.randomBytes(24).toString('base64url');
  insert('oauth_states', { state, provider: 'slack', user_id: userId, created_at: now() });
  return `https://slack.com/oauth/v2/authorize?${new URLSearchParams({ client_id: process.env.SLACK_CLIENT_ID, scope: 'chat:write,channels:read,channels:history,users:read', redirect_uri: redirectUri(), state })}`;
}
export async function handleCallback({ code, state }) {
  const st = one("SELECT * FROM oauth_states WHERE state=? AND provider='slack'", state);
  run('DELETE FROM oauth_states WHERE state=?', state);
  if (!st) throw Object.assign(new Error('Estado OAuth inválido.'), { status: 400 });
  const j = await (await fetch('https://slack.com/api/oauth.v2.access', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: process.env.SLACK_CLIENT_ID, client_secret: process.env.SLACK_CLIENT_SECRET, redirect_uri: redirectUri() }) })).json();
  if (!j.ok) throw new Error(`Slack: ${j.error}`);
  saveIntegration('slack', { status: 'conectado', account_label: j.team?.name, secret_enc: seal({ bot_token: j.access_token }), connected_by: st.user_id, last_error: null, config: JSON.stringify({ mirror_channel: null }) });
  return st.user_id;
}
export async function mirror(text) {
  const st = integrationStatus('slack');
  if (st.status !== 'conectado' || !st.config?.mirror_channel) return false;
  const r = await (await fetch('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { authorization: `Bearer ${getSecret('slack').bot_token}`, 'content-type': 'application/json' }, body: JSON.stringify({ channel: st.config.mirror_channel, text }) })).json();
  if (!r.ok) saveIntegration('slack', { last_error: r.error });
  return r.ok;
}
