// SINCRONIZAÇÃO NOTION → THE BOLD OS — banco temporário e Notion simulado (fetch interceptado). Nada toca a base real nem o Notion real.
// Garante: sem token = BLOQUEADO; só leitura (nenhuma escrita no Notion); sem mapeamento = AGUARDANDO MAPEAMENTO (não descarta, não cria);
// base mapeada atualiza o espelho; conteúdo vinculado não muda sozinho (conflito); legado continua legado; webhook só com assinatura válida.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bold-nsync-'));
process.env.BOLD_DATA_DIR = TMP;
process.env.BOLD_STORAGE_DIR = TMP;
process.env.BOLD_DB_PATH = path.join(TMP, 'test.db');
delete process.env.NOTION_TOKEN;

const { one, all, insert, uid, now } = await import('../db.js');
const S = await import('../services/notion-sync.js');
const { createApp } = await import('../index.js');
const { startClient } = await import('../routes/ops.js');
const { hashPassword } = await import('../lib/auth.js');
const app = createApp();
const server = app.listen(0);
const BASE = `http://127.0.0.1:${server.address().port}/api`;
const realFetch = globalThis.fetch;
after(() => { globalThis.fetch = realFetch; server.close(); fs.rmSync(TMP, { recursive: true, force: true }); });

const PW = 'senha-de-teste-123';
const ceo = insert('users', { id: uid('u_'), name: 'ceo', email: 'ceo@t.test', password_hash: hashPassword(PW), role_key: 'ceo', functions: '[]', active: 1, capacity: 10, created_at: now() });
async function login(u) {
  const r = await realFetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bold-request': '1' }, body: JSON.stringify({ email: u.email, password: PW }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const call = async (m, url, b) => { const res = await realFetch(BASE + url, { method: m, headers: { cookie, 'x-bold-request': '1', 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { status: res.status, body: await res.json().catch(() => null) }; };
  return { get: (x) => call('GET', x), post: (x, b) => call('POST', x, b), patch: (x, b) => call('PATCH', x, b) };
}

const C = startClient({ name: 'Cliente Sync', services: [], monthly_posts: 4, team: [] }, ceo);
const DB = '15e6957a41e38194af44d2ea27039378';
const h1 = insert('notion_history', { id: uid('nh_'), client_id: C.id, source: 'CR EDITORIAL', source_db_url: `https://app.notion.com/p/${DB}`, notion_url: 'https://app.notion.com/p/aaaa1111aaaa1111aaaa1111aaaa1111', title: 'CARROSSEL: Antigo', date_start: '2026-11-03', properties: '{}', extracted_at: '2026-10-21T18:48:53Z', imported_at: now() });
const legacy = insert('contents', { id: uid('c_'), number: 77, client_id: C.id, title: 'CARROSSEL: Antigo', format: 'carrossel', stage: 'agendamento', stage_entered_at: now(), priority: 'media', planned_at: '2026-11-03T15:00:00.000Z', created_at: now(), updated_at: now(), data_origin: 'notion', legacy_status: 'nao_validado', strategy_tags: '[]' });
insert('content_notion_links', { content_id: legacy.id, notion_page_id: 'aaaa1111-aaaa-1111-aaaa-1111aaaa1111', notion_url: h1.notion_url, history_id: h1.id, linked_at: now() });

const page = (id, title, date, edited, extra = {}) => ({ object: 'page', id, url: `https://app.notion.com/p/${id.replace(/-/g, '')}`, created_time: '2026-10-01T10:00:00Z', last_edited_time: edited, archived: false, parent: { type: 'database_id', database_id: DB },
  properties: { Name: { type: 'title', title: [{ plain_text: title }] }, Date: { type: 'date', date: { start: date } }, 'APROVAÇÃO TEMA': { type: 'checkbox', checkbox: true } }, ...extra });
const calls = [];
function mockNotion(results) {
  globalThis.fetch = async (url, opts = {}) => {
    if (!String(url).startsWith('https://api.notion.com')) return realFetch(url, opts);
    calls.push({ url: String(url), method: opts.method });
    return new Response(JSON.stringify({ results, has_more: false }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

test('mapa: estados explícitos, importado ≠ sincronizado, diferença 108 × 106 detectada, escrita desativada', async () => {
  const g = await login(ceo);
  const r = (await g.get('/integracoes/notion')).body;
  assert.equal(r.token, false);
  assert.equal(r.write_back, false, 'The Bold OS → Notion desativado');
  const items = r.groups.flatMap((x) => x.items);
  const nov = items.find((i) => i.key === 'novembro');
  assert.equal(nov.state, 'importado_nao_sincronizado', 'importado uma vez não é sincronizado');
  assert.ok(nov.differences.some((d) => /108 cards no Notion × 106/.test(d)), 'diferença detectada');
  assert.equal(items.find((i) => i.key === 'aprov_db').state, 'aguardando_mapeamento');
  assert.equal(items.find((i) => i.key === 'padrao').state, 'documentacao');
  assert.ok(items.every((i) => i.state !== 'ativa'), 'nada marcado como ativo sem token');
  assert.ok(items.find((i) => i.key === `hist:${DB}`), 'CR Editorial do cliente aparece no mapa com o ID real da base');
  assert.match(nov.frequency, /BLOQUEADO|bloqueado/);
});

test('sem NOTION_TOKEN: sincronizar agora responde BLOQUEADO e registra a execução, sem chamar o Notion', async () => {
  const g = await login(ceo);
  const r = await g.post(`/integracoes/notion/fontes/hist:${DB}/sincronizar`);
  assert.equal(r.status, 412);
  assert.match(r.body.error, /NOTION_TOKEN/);
  assert.equal(one("SELECT status FROM notion_sync_runs ORDER BY started_at DESC LIMIT 1").status, 'bloqueado');
  assert.equal(calls.length, 0);
});

test('cliente HTTP só lê: qualquer escrita no Notion é recusada antes de sair', async () => {
  process.env.NOTION_TOKEN = 'secret_teste';
  mockNotion([]);
  for (const [m, p] of [['PATCH', '/pages/x'], ['POST', '/pages'], ['DELETE', '/blocks/x'], ['POST', '/comments']]) {
    await assert.rejects(S.notionRead(m, p, {}), /desativado/);
  }
  assert.equal(calls.length, 0, 'nenhuma requisição de escrita saiu');
  delete process.env.NOTION_TOKEN;
});

test('polling: base mapeada atualiza o espelho; conteúdo vinculado legado não muda (conflito); card novo vira espelho, não conteúdo', async () => {
  process.env.NOTION_TOKEN = 'secret_teste';
  mockNotion([page('aaaa1111-aaaa-1111-aaaa-1111aaaa1111', 'CARROSSEL: Novo título', '2026-11-05', '2026-10-22T10:00:00Z'), page('bbbb2222-bbbb-2222-bbbb-2222bbbb2222', 'REELS: Card novo', '2026-11-09', '2026-10-22T10:05:00Z')]);
  const contentsBefore = one('SELECT COUNT(*) n FROM contents').n;
  const r = await S.pollSource(`hist:${DB}`, 'manual');
  assert.equal(r.changes, 2);
  assert.ok(calls.every((c) => c.method === 'POST' && /\/databases\/.+\/query$/.test(c.url)), 'só consulta de leitura');
  assert.equal(one('SELECT title FROM notion_history WHERE id=?', h1.id).title, 'CARROSSEL: Novo título', 'espelho atualizado');
  const c = one('SELECT * FROM contents WHERE id=?', legacy.id);
  assert.equal(c.title, 'CARROSSEL: Antigo', 'conteúdo vinculado não muda sozinho');
  assert.equal(c.legacy_status, 'nao_validado', 'legado continua legado');
  assert.equal(c.stage, 'agendamento');
  assert.equal(one("SELECT status FROM notion_changes WHERE notion_page_id='aaaa1111-aaaa-1111-aaaa-1111aaaa1111'").status, 'conflito');
  assert.equal(one('SELECT COUNT(*) n FROM contents').n, contentsBefore, 'nenhum conteúdo criado');
  assert.ok(one("SELECT 1 FROM notion_history WHERE title='REELS: Card novo'"), 'card novo da base mapeada vira espelho somente leitura');
  // mesma edição de novo: não duplica
  assert.equal((await S.pollSource(`hist:${DB}`, 'manual')).changes, 0);
  delete process.env.NOTION_TOKEN;
});

test('base sem mapeamento: alteração detectada fica AGUARDANDO MAPEAMENTO (não descarta, não aplica)', async () => {
  S.ensureSources();
  const ch = S.recordChange({ source_key: 'processo:novembro', page: page('cccc3333-cccc-3333-cccc-3333cccc3333', 'Bárbara Firmo', '2026-11-01', '2026-10-22T12:34:00Z'), via: 'polling' });
  const r = S.processChange(ch, {});
  assert.equal(r.status, 'aguardando_mapeamento');
  assert.ok(one("SELECT 1 FROM notion_changes WHERE id=? AND status='aguardando_mapeamento'", ch.id), 'registro guardado');
  const g = await login(ceo);
  const p = (await g.get('/integracoes/notion')).body;
  assert.ok(p.counts.aguardando_mapeamento >= 1 && p.counts.conflitos >= 1 && p.counts.detectadas >= 3);
});

test('webhook: só aceita com assinatura válida do token de verificação', async () => {
  const post = (body, sig) => realFetch(`${BASE}/integrations/webhooks/notion`, { method: 'POST', headers: { 'content-type': 'application/json', ...(sig ? { 'x-notion-signature': sig } : {}) }, body });
  assert.equal((await post(JSON.stringify({ verification_token: 'tok_123' }))).status, 200);
  const ev = JSON.stringify({ type: 'page.properties_updated', timestamp: '2026-10-22T13:00:00Z', entity: { id: 'dddd4444-dddd-4444-dddd-4444dddd4444', type: 'page' }, data: { parent: { id: 'ffff', type: 'database' } } });
  assert.equal((await post(ev, 'sha256=errado')).status, 401);
  const sig = `sha256=${crypto.createHmac('sha256', 'tok_123').update(ev).digest('hex')}`;
  const ok = await post(ev, sig);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).status, 'aguardando_mapeamento', 'página de base não mapeada não vira nada sozinha');
  assert.ok(all('SELECT * FROM notion_changes WHERE via=?', 'webhook').length === 1);
});

test('decisão da CEO: CR EDITORIAL ligado; desligar pelo painel prevalece; sem hospedagem persistente fica PARCIAL, não ATIVA', async () => {
  S.ensureSources();
  assert.equal(one('SELECT enabled FROM notion_sync_sources WHERE key=?', `hist:${DB}`).enabled, 1);
  process.env.NOTION_TOKEN = 'secret_teste';
  let it = S.syncMap().flatMap((g) => g.items).find((i) => i.key === `hist:${DB}`);
  assert.equal(it.state, 'parcial', 'sem hospedagem persistente não é sincronização ativa');
  process.env.BOLD_PERSISTENT_HOST = '1';
  it = S.syncMap().flatMap((g) => g.items).find((i) => i.key === `hist:${DB}`);
  assert.equal(it.state, 'ativa');
  delete process.env.BOLD_PERSISTENT_HOST; delete process.env.NOTION_TOKEN;
  const g = await login(ceo);
  assert.equal((await g.patch(`/integracoes/notion/fontes/hist:${DB}`, { enabled: false })).status, 200);
  S.ensureSources();
  assert.equal(one('SELECT enabled FROM notion_sync_sources WHERE key=?', `hist:${DB}`).enabled, 0, 'escolha manual não é sobrescrita');
  assert.equal(one("SELECT enabled FROM notion_sync_sources WHERE key LIKE 'processo:%' LIMIT 1").enabled, 0, 'quadros continuam desligados');
});
