// Google Calendar — integração REAL via OAuth 2.0 + Calendar API v3.
// Sem GOOGLE_CLIENT_ID/SECRET configurados, o status permanece DESCONECTADO e nenhuma chamada é simulada.
import crypto from 'node:crypto';
import { one, run, insert, now } from '../db.js';
import { seal, getSecret, saveIntegration, integrationStatus } from './vault.js';

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/calendar/v3';
export const SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.freebusy', 'https://www.googleapis.com/auth/calendar.readonly', 'openid', 'email'];
const redirectUri = () => `${process.env.PUBLIC_BASE_URL || 'http://localhost:4000'}/api/integrations/google_calendar/callback`;

export function authUrl(userId) {
  if (!process.env.GOOGLE_CLIENT_ID) throw Object.assign(new Error('GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET não configurados no servidor.'), { status: 412 });
  const state = crypto.randomBytes(24).toString('base64url');
  insert('oauth_states', { state, provider: 'google_calendar', user_id: userId, created_at: now() });
  const q = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(), response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
  return `${AUTH}?${q}`;
}
export async function handleCallback({ code, state }) {
  const st = one("SELECT * FROM oauth_states WHERE state=? AND provider='google_calendar'", state);
  run('DELETE FROM oauth_states WHERE state=?', state);
  if (!st || Date.now() - new Date(st.created_at).getTime() > 10 * 60e3) throw Object.assign(new Error('Estado OAuth inválido ou expirado.'), { status: 400 });
  const r = await fetch(TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri(), grant_type: 'authorization_code' }) });
  const tok = await r.json();
  if (!r.ok) throw new Error(tok.error_description || tok.error || 'Falha ao trocar código OAuth');
  const info = await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${tok.access_token}` } })).json().catch(() => ({}));
  saveIntegration('google_calendar', { status: 'conectado', account_label: info.email || 'Conta Google', scopes: tok.scope, secret_enc: seal({ refresh_token: tok.refresh_token, access_token: tok.access_token, expiry: Date.now() + tok.expires_in * 1000 }), expires_at: null, last_error: null, connected_by: st.user_id, config: JSON.stringify({ calendar_id: 'primary' }) });
  return st.user_id;
}
async function accessToken() {
  const s = getSecret('google_calendar');
  if (!s?.refresh_token) throw Object.assign(new Error('Google Calendar não conectado.'), { status: 409 });
  if (s.access_token && s.expiry - 60e3 > Date.now()) return s.access_token;
  const r = await fetch(TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: s.refresh_token, grant_type: 'refresh_token' }) });
  const tok = await r.json();
  if (!r.ok) {
    saveIntegration('google_calendar', { status: tok.error === 'invalid_grant' ? 'token_expirado' : 'erro', last_error: tok.error_description || tok.error });
    throw Object.assign(new Error('Token do Google expirado ou revogado. Reconecte em Integrações.'), { status: 409 });
  }
  saveIntegration('google_calendar', { secret_enc: seal({ ...s, access_token: tok.access_token, expiry: Date.now() + tok.expires_in * 1000 }), status: 'conectado', last_error: null });
  return tok.access_token;
}
async function api(path, opt = {}) {
  const r = await fetch(`${API}${path}`, { ...opt, headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json', ...(opt.headers || {}) } });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { saveIntegration('google_calendar', { last_error: j.error?.message || `HTTP ${r.status}` }); throw Object.assign(new Error(`Google Calendar: ${j.error?.message || r.status}`), { status: 502 }); }
  return j;
}
export const connected = () => integrationStatus('google_calendar').status === 'conectado';
const calId = () => encodeURIComponent(integrationStatus('google_calendar').config?.calendar_id || 'primary');

export async function listEvents(timeMin, timeMax) {
  const q = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
  return (await api(`/calendars/${calId()}/events?${q}`)).items || [];
}
export async function freeBusy(emails, timeMin, timeMax) {
  const j = await api('/freeBusy', { method: 'POST', body: JSON.stringify({ timeMin, timeMax, items: emails.map((id) => ({ id })) }) });
  return Object.values(j.calendars || {}).flatMap((c) => c.busy || []);
}
// Sem local físico, o evento já nasce com link do Google Meet (conferenceDataVersion=1)
export async function createEvent({ title, description, start, end, attendees, location }) {
  const meet = location ? {} : { conferenceData: { createRequest: { requestId: `bold-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } } };
  return api(`/calendars/${calId()}/events?sendUpdates=all&conferenceDataVersion=1`, { method: 'POST', body: JSON.stringify({ summary: title, description, location, start: { dateTime: start, timeZone: 'America/Sao_Paulo' }, end: { dateTime: end, timeZone: 'America/Sao_Paulo' }, attendees: attendees.map((email) => ({ email })), ...meet }) });
}
export async function getEvent(id) { return api(`/calendars/${calId()}/events/${encodeURIComponent(id)}`); }
export async function updateEvent(id, patch) { return api(`/calendars/${calId()}/events/${encodeURIComponent(id)}?sendUpdates=all`, { method: 'PATCH', body: JSON.stringify(patch) }); }
export async function deleteEvent(id) { return api(`/calendars/${calId()}/events/${encodeURIComponent(id)}?sendUpdates=all`, { method: 'DELETE' }); }
export async function disconnect() {
  const s = getSecret('google_calendar');
  if (s?.refresh_token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(s.refresh_token)}`, { method: 'POST' }).catch(() => {});
  saveIntegration('google_calendar', { status: 'desconectado', secret_enc: null, account_label: null });
}
