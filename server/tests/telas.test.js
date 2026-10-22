// TODAS AS TELAS ABREM — cada rota de leitura que as telas internas e o portal chamam responde sem erro de servidor,
// com a base vazia (estado inicial) e com um cliente em operação. Pega erros como o do quadro de Processos (500)
// antes de chegarem à prévia. Banco e storage temporários; nada toca a base real.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bold-telas-'));
process.env.BOLD_DATA_DIR = TMP;
process.env.BOLD_STORAGE_DIR = TMP;
process.env.BOLD_DB_PATH = path.join(TMP, 'test.db');

const { one, insert, uid, now } = await import('../db.js');
const { createApp } = await import('../index.js');
const { startClient } = await import('../routes/ops.js');
const { hashPassword } = await import('../lib/auth.js');

const app = createApp();
const server = app.listen(0);
const BASE = `http://127.0.0.1:${server.address().port}/api`;
after(() => { server.close(); fs.rmSync(TMP, { recursive: true, force: true }); });

const PW = 'senha-de-teste-123';
const mkUser = (key, role, fns = []) => insert('users', { id: uid('u_'), name: key, email: `${key}@t.test`, password_hash: hashPassword(PW), role_key: role, functions: JSON.stringify(fns), active: 1, capacity: 10, created_at: now() });
async function login(u) {
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bold-request': '1' }, body: JSON.stringify({ email: u.email, password: PW }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return async (url) => { const res = await fetch(BASE + url, { headers: { cookie, 'x-bold-request': '1' } }); return { status: res.status, body: await res.text() }; };
}
const INTERNAL = (c, ct) => ['/auth/me', '/dashboard', '/torre', '/torre/automations', '/process/board', '/process/board?month=2026-11', '/process/definition', '/pendencias?escopo=minhas', '/pendencias?escopo=equipe',
  '/atrasos', '/performance?dias=7', '/performance?dias=30', '/performance?dias=90', '/clients', `/clients/${c}`, `/clients/${c}/ficha`, `/clients/${c}/editorial`, `/clients/${c}/notion-history`, `/clients/${c}/notion-history?vazios=1`,
  `/clients/${c}/brand`, `/clients/${c}/pulse`, `/clients/${c}/health`, `/clients/${c}/decisions`, `/clients/${c}/requests`, `/clients/${c}/onboarding-card`, `/clients/${c}/origem`, '/divisao', '/onboarding/cards',
  '/contents', `/contents?client_id=${c}`, `/contents/${ct}`, '/review/clients', `/review/clients/${c}`, '/calendar', '/meetings', '/chat/channels', '/crm', '/finance', '/financeiro/estrutura',
  '/insights?status=aberto', '/brain/agents', '/automations', '/automations/estado', '/integrations', '/produto/integracoes', '/users', '/users/directory', '/client-access', '/history?limit=50',
  '/migration-issues', '/notion/resumo', '/configuracoes', '/notifications', '/reports'];
const PORTAL = ['/portal/me', '/portal/home', '/portal/feed', '/portal/decisions', '/portal/pendencias', '/portal/calendar', '/portal/meetings', '/portal/channel', '/portal/requests',
  '/portal/materials', '/portal/brand', '/portal/history?limit=80', '/portal/onboarding/form'];

async function sweep(get, urls) {
  const bad = [];
  for (const u of urls) { const r = await get(u); if (r.status >= 500) bad.push(`${u} → ${r.status} ${r.body.slice(0, 160)}`); }
  assert.deepEqual(bad, [], `rotas com erro de servidor:\n${bad.join('\n')}`);
}

test('base vazia: toda tela interna e do portal abre sem erro de servidor', async () => {
  const ceo = mkUser('ceo-vazio', 'ceo');
  const get = await login(ceo);
  await sweep(get, INTERNAL('inexistente', 'inexistente'));
  // telas novas mostram o estado honesto, não um número inventado
  const perf = JSON.parse((await get('/performance?dias=30')).body);
  assert.equal(perf.state, 'dados_insuficientes');
  assert.ok(perf.score == null && !('ranking' in perf), 'sem score nem ranking');
  const fin = JSON.parse((await get('/financeiro/estrutura')).body);
  assert.equal(fin.repasses.state, 'aguardando_decisao');
  assert.equal(fin.recebimentos.state, 'dados_insuficientes');
  const integ = JSON.parse((await get('/produto/integracoes')).body).items;
  for (const k of ['google_calendar', 'google_meet', 'google_drive', 'slack', 'meta', 'resend', 'anthropic', 'notion', 'infra']) assert.ok(integ.some((i) => i.key === k), `integração ${k} visível`);
  assert.ok(!integ.some((i) => i.state === 'conectada' && ['anthropic', 'google_calendar', 'meta', 'slack'].includes(i.key)), 'nada aparece conectado sem credencial');
});

test('cliente em operação: telas internas, portal e Performance/Configurações por permissão', async () => {
  const ceo = mkUser('ceo', 'ceo');
  const des = mkUser('design', 'design', ['design']);
  const c = startClient({ name: 'Cliente Telas', services: [], monthly_posts: 4, requires_theme_approval: true, team: [{ user_id: des.id, function: 'design' }] }, ceo);
  const ct = one('SELECT id FROM contents WHERE client_id=? LIMIT 1', c.id)?.id || 'nenhum';
  const get = await login(ceo);
  await sweep(get, INTERNAL(c.id, ct));
  const cli = mkUser('cliente', 'cliente');
  insert('client_members', { client_id: c.id, user_id: cli.id, function: 'cliente' });
  await sweep(await login(cli), PORTAL);
  // Performance é dado sobre pessoas: só a CEO (ou quem ela liberar)
  const gd = await login(des);
  assert.equal((await gd('/performance')).status, 403);
  assert.equal((await gd('/configuracoes')).status, 200);
  assert.equal((await (await login(cli))('/configuracoes')).status, 403, 'cliente nunca vê configurações internas');
});
