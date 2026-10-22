// FICHA DO CONTEÚDO e vínculo com o CR Editorial — responsáveis por função, corpo em blocos, etapas internas de aprovação
// separadas da aprovação do cliente, vínculo confirmado item a item e desvínculo que restaura. Banco temporário.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bold-ficha-'));
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
const mk = (key, role, fns = []) => insert('users', { id: uid('u_'), name: key, email: `${key}@t.test`, password_hash: hashPassword(PW), role_key: role, functions: JSON.stringify(fns), active: 1, capacity: 10, created_at: now() });
async function login(u) {
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bold-request': '1' }, body: JSON.stringify({ email: u.email, password: PW }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const call = async (m, url, b) => { const res = await fetch(BASE + url, { method: m, headers: { cookie, 'x-bold-request': '1', 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { status: res.status, body: await res.json().catch(() => null) }; };
  return { get: (u2) => call('GET', u2), post: (u2, b) => call('POST', u2, b), put: (u2, b) => call('PUT', u2, b) };
}
const ceo = mk('ceo', 'ceo'), rev = mk('raisa', 'qualidade', ['revisao']), des = mk('felipe', 'design', ['design']);
const C = startClient({ name: 'Cliente Ficha', services: [], monthly_posts: 4, requires_theme_approval: true, team: [{ user_id: des.id, function: 'design' }] }, ceo);
const cli = mk('cliente', 'cliente'); insert('client_members', { client_id: C.id, user_id: cli.id, function: 'cliente' });
const ct = insert('contents', { id: uid('c_'), number: 900, client_id: C.id, title: 'Carrossel 1 de 4 · novembro (tema a definir)', format: 'carrossel', stage: 'producao', stage_entered_at: now(), priority: 'media', cycle_month: '2026-11', created_at: now(), updated_at: now(), data_origin: 'notion', strategy_tags: '[]' });
const cr = insert('notion_history', { id: uid('nh_'), client_id: C.id, source: 'CR EDITORIAL', notion_url: 'https://app.notion.com/p/3ec6957a41e380a6b0f5f187f42f5621', title: 'CARROSSEL: <b>EU EM NOVEMBRO</b>', date_start: '2026-11-03',
  properties: JSON.stringify({ 'APROVAÇÃO TEMA': true, 'ESTRATÉGIA': ['EDUCATIVO', 'OBESIDADE'], OBJETIVO: 'Gerar consciência', LEGENDA: 'Texto da legenda', '👤 Designer': '<mention url="user://7786bd65-ea40-4c61-8388-1255f9047f08" />' }), extracted_at: '2026-10-21T19:10:00Z', imported_at: now() });

test('ficha: responsáveis, corpo em blocos e etapas internas separadas da aprovação do cliente', async () => {
  const g = await login(ceo);
  let f = (await g.get(`/contents/${ct.id}/ficha`)).body;
  assert.deepEqual(f.steps.map((s) => s.key), ['tema', 'texto', 'legenda', 'arte', 'revisao', 'cliente']);
  assert.ok(f.steps.every((s) => s.state === 'pendente'));
  assert.deepEqual(f.suggested.map((x) => x[0]), ['capa', 'card', 'referencias'], 'carrossel sugere capa e cards');
  f = (await g.put(`/contents/${ct.id}/pessoas`, { designer: des.id })).body;
  assert.equal(f.people.designer.user_id, des.id);
  f = (await g.post(`/contents/${ct.id}/secoes`, { kind: 'capa', title: 'Capa', body: 'EU EM NOVEMBRO\nhttps://br.pinterest.com/pin/1/' })).body;
  assert.equal(f.sections[0].body.includes('pinterest'), true, 'texto e link preservados');
  const d = await login(des);
  assert.equal((await d.post(`/contents/${ct.id}/checks`, { step: 'arte', decision: 'aprovado' })).status, 403, 'design não aprova etapa interna');
  const r = await login(rev);
  assert.equal((await r.post(`/contents/${ct.id}/checks`, { step: 'arte', decision: 'ajuste' })).status, 422, 'ajuste exige motivo');
  f = (await r.post(`/contents/${ct.id}/checks`, { step: 'arte', decision: 'aprovado' })).body;
  assert.equal(f.steps.find((s) => s.key === 'arte').state, 'aprovado');
  assert.equal(f.steps.find((s) => s.key === 'cliente').state, 'pendente', 'etapa interna não aprova pelo cliente');
  assert.equal((await (await login(cli)).get(`/contents/${ct.id}/ficha`)).status, 403, 'cliente não vê a ficha interna');
});

test('vínculo com o CR Editorial: proposta, confirmação, sem duplicar, aprovação do Notion não vira aprovação, desvincular restaura', async () => {
  const g = await login(ceo);
  const prop = (await g.get(`/clients/${C.id}/notion-vinculo?mes=2026-11`)).body;
  const it = prop.items.find((x) => x.id === cr.id);
  assert.equal(it.format, 'carrossel');
  assert.equal(it.proposal.id, ct.id);
  let f = (await g.post(`/contents/${ct.id}/notion-vinculo`, { history_id: cr.id })).body;
  const c = one('SELECT * FROM contents WHERE id=?', ct.id);
  assert.equal(c.title, 'EU EM NOVEMBRO');
  assert.equal(c.planned_at.slice(0, 10), '2026-11-03');
  assert.equal(c.objective, 'Gerar consciência');
  assert.deepEqual(JSON.parse(c.strategy_tags), ['EDUCATIVO', 'OBESIDADE']);
  assert.equal(f.steps.find((s) => s.key === 'tema').state, 'pendente', 'APROVAÇÃO TEMA do Notion é informativa (regra 14)');
  assert.ok(f.people.designer, 'designer já definido na plataforma não é sobrescrito');
  assert.ok(f.sections.some((s) => s.source === 'notion' && s.body === 'Texto da legenda'));
  assert.equal((await g.post(`/contents/${ct.id}/notion-vinculo`, { history_id: cr.id })).status, 409, 'sem duplicar');
  assert.equal((await g.post(`/contents/${ct.id}/notion-desvincular`, {})).status, 422);
  f = (await g.post(`/contents/${ct.id}/notion-desvincular`, { reason: 'par errado' })).body;
  assert.equal(one('SELECT title FROM contents WHERE id=?', ct.id).title, 'Carrossel 1 de 4 · novembro (tema a definir)', 'valores anteriores restaurados');
  assert.ok(!f.sections.some((s) => s.source === 'notion'));
  assert.ok(one("SELECT 1 FROM activity_logs WHERE action='notion.desvinculo'"));
});
