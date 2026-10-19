// Meta / Instagram — Instagram Graph API (Content Publishing). Integração REAL, sem simulação.
//
// Capacidades oficiais usadas: criação de container de mídia (IMAGE, REELS, CAROUSEL com até 10 itens) e media_publish.
// LIMITAÇÕES OFICIAIS (não inventamos capacidades):
//  • A Content Publishing API NÃO oferece agendamento nativo para Instagram. A The Bold OS agenda internamente
//    e executa a publicação no horário (scheduler → publishDueContent).
//  • A API busca a mídia por URL pública: exige PUBLIC_BASE_URL acessível pela Meta (link assinado e temporário).
//  • Imagens precisam ser JPEG (geramos o publishing asset sem tocar no original). Stories via API exigem
//    permissões/contas específicas — não habilitado nesta versão.
//  • Existe limite diário de publicações por conta via API (consultado em /content_publishing_limit).
//  • Conta precisa ser Instagram Profissional (Business/Creator) vinculada a uma Página do Facebook.
import crypto from 'node:crypto';
import { one, all, run, insert, update, now, parseJSON } from '../db.js';
import { seal, getSecret, saveIntegration, integrationStatus } from './vault.js';
import { ensurePublishAsset } from '../services/media.js';
import { log, notify } from '../lib/core.js';

const V = process.env.META_GRAPH_VERSION || 'v21.0';
const G = `https://graph.facebook.com/${V}`;
const SCOPES = ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement', 'business_management'];
const redirectUri = () => `${process.env.PUBLIC_BASE_URL || 'http://localhost:4000'}/api/integrations/meta/callback`;

export function authUrl(userId) {
  if (!process.env.META_APP_ID) throw Object.assign(new Error('META_APP_ID/META_APP_SECRET não configurados no servidor.'), { status: 412 });
  const state = crypto.randomBytes(24).toString('base64url');
  insert('oauth_states', { state, provider: 'meta', user_id: userId, created_at: now() });
  return `https://www.facebook.com/${V}/dialog/oauth?${new URLSearchParams({ client_id: process.env.META_APP_ID, redirect_uri: redirectUri(), state, scope: SCOPES.join(','), response_type: 'code' })}`;
}
export async function handleCallback({ code, state }) {
  const st = one("SELECT * FROM oauth_states WHERE state=? AND provider='meta'", state);
  run('DELETE FROM oauth_states WHERE state=?', state);
  if (!st) throw Object.assign(new Error('Estado OAuth inválido.'), { status: 400 });
  const short = await (await fetch(`${G}/oauth/access_token?${new URLSearchParams({ client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, redirect_uri: redirectUri(), code })}`)).json();
  if (short.error) throw new Error(short.error.message);
  const long = await (await fetch(`${G}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, fb_exchange_token: short.access_token })}`)).json();
  if (long.error) throw new Error(long.error.message);
  const pages = await (await fetch(`${G}/me/accounts?fields=name,access_token,instagram_business_account{id,username}&access_token=${long.access_token}`)).json();
  const accounts = (pages.data || []).filter((p) => p.instagram_business_account).map((p) => ({ page_id: p.id, page: p.name, ig_user_id: p.instagram_business_account.id, username: p.instagram_business_account.username, page_token: p.access_token }));
  saveIntegration('meta', { status: 'conectado', account_label: `${accounts.length} conta(s) Instagram`, secret_enc: seal({ user_token: long.access_token, accounts }),
    expires_at: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null, last_error: null, connected_by: st.user_id,
    config: JSON.stringify({ accounts: accounts.map(({ page_token, ...a }) => a), client_map: integrationStatus('meta').config?.client_map || {} }) });
  return st.user_id;
}
export const connected = () => { const s = integrationStatus('meta'); return s.status === 'conectado' && (!one("SELECT expires_at FROM integrations WHERE provider='meta'")?.expires_at || one("SELECT expires_at FROM integrations WHERE provider='meta'").expires_at > now()); };

// Link público assinado (HMAC, 2h) para a Meta baixar o publishing asset
const signKey = () => crypto.createHash('sha256').update(String(process.env.BOLD_VAULT_KEY || 'dev') + ':publish').digest();
export function signedAssetUrl(fileId) {
  if (!process.env.PUBLIC_BASE_URL) throw new Error('PUBLIC_BASE_URL não configurado: a Meta precisa acessar a mídia por URL pública.');
  const exp = Date.now() + 2 * 3600e3;
  const sig = crypto.createHmac('sha256', signKey()).update(`${fileId}.${exp}`).digest('base64url');
  return `${process.env.PUBLIC_BASE_URL}/api/public/asset/${fileId}?exp=${exp}&sig=${sig}`;
}
export function verifyAssetSig(fileId, exp, sig) {
  if (!exp || Number(exp) < Date.now()) return false;
  const good = crypto.createHmac('sha256', signKey()).update(`${fileId}.${exp}`).digest('base64url');
  return sig && good.length === sig.length && crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig));
}

async function gpost(path, params) {
  const r = await fetch(`${G}${path}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  const j = await r.json();
  if (j.error) throw new Error(`Meta: ${j.error.message}`);
  return j;
}
async function waitReady(id, token) {
  for (let i = 0; i < 60; i++) {
    const j = await (await fetch(`${G}/${id}?fields=status_code,status&access_token=${token}`)).json();
    if (j.status_code === 'FINISHED') return;
    if (j.status_code === 'ERROR' || j.status_code === 'EXPIRED') throw new Error(`Meta: container ${j.status_code} ${j.status || ''}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('Meta: tempo esgotado processando vídeo.');
}

export async function publishContent(contentId) {
  const c = one('SELECT * FROM contents WHERE id=?', contentId);
  const secret = getSecret('meta');
  const map = integrationStatus('meta').config?.client_map || {};
  const igId = map[c.client_id];
  const acc = secret?.accounts?.find((a) => a.ig_user_id === igId);
  if (!acc) throw new Error('Cliente sem conta Instagram vinculada em Integrações → Meta.');
  const token = acc.page_token || secret.user_token;
  const v = one('SELECT * FROM content_versions WHERE id=?', c.approved_version_id);
  const media = all('SELECT f.* FROM version_media vm JOIN files f ON f.id=vm.file_id WHERE vm.version_id=? ORDER BY vm.position', v.id);
  if (!media.length) throw new Error('Versão aprovada sem mídia.');
  for (const m of media) await ensurePublishAsset(m.id);
  const item = (m, carousel) => m.kind === 'video'
    ? { media_type: carousel ? 'VIDEO' : 'REELS', video_url: signedAssetUrl(m.id), ...(carousel ? { is_carousel_item: 'true' } : {}) }
    : { image_url: signedAssetUrl(m.id), ...(carousel ? { is_carousel_item: 'true' } : {}) };
  let creation;
  if (media.length > 1) {
    if (media.length > 10) throw new Error('Carrossel do Instagram aceita no máximo 10 itens.');
    const children = [];
    for (const m of media) { const ch = await gpost(`/${igId}/media`, { ...item(m, true), access_token: token }); if (m.kind === 'video') await waitReady(ch.id, token); children.push(ch.id); }
    creation = await gpost(`/${igId}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption: v.caption, access_token: token });
  } else {
    creation = await gpost(`/${igId}/media`, { ...item(media[0], false), caption: v.caption, access_token: token });
    if (media[0].kind === 'video') await waitReady(creation.id, token);
  }
  const pub = await gpost(`/${igId}/media_publish`, { creation_id: creation.id, access_token: token });
  return pub.id;
}

// Executado pelo scheduler a cada minuto
export async function publishDueContent() {
  if (!connected()) return;
  const { confirmPublished } = await import('../engine/process.js');
  for (const c of all("SELECT * FROM contents WHERE stage='agendado' AND schedule_mode='meta' AND scheduled_at <= ? AND external_post_id IS NULL", now())) {
    try {
      const postId = await publishContent(c.id);
      confirmPublished(c.id, null, { external_post_id: postId }, true);
    } catch (e) {
      log({ kind: 'integracao', action: 'meta.erro', entity: 'content', id: c.id, client: c.client_id, content: c.id, summary: `Falha ao publicar via Meta: ${e.message}` });
      update('contents', { id: c.id }, { schedule_mode: 'meta_erro' });
      const who = all("SELECT assignee_id FROM tasks WHERE content_id=? AND kind='agendamento' ORDER BY created_at DESC LIMIT 1", c.id).map((r) => r.assignee_id);
      notify([...who, ...all("SELECT id FROM users WHERE role_key='operacoes'").map((r) => r.id)], { level: 'urgente', type: 'meta', title: 'Falha na publicação automática', body: `#${c.number} ${c.title}: ${e.message}`, link: `/conteudos/${c.id}`, content: c.id, client: c.client_id });
    }
  }
}
