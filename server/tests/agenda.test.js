// AGENDA — equipe só visualiza; criar exige a permissão "agenda" (CEO concede); "toda a equipe" × pessoas selecionadas.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bold-agenda-'));
process.env.BOLD_DATA_DIR = TMP;
process.env.BOLD_STORAGE_DIR = TMP;
process.env.BOLD_DB_PATH = path.join(TMP, 'test.db');

const { one, all, insert, uid, now } = await import('../db.js');
const { createApp } = await import('../index.js');
const { hashPassword } = await import('../lib/auth.js');
const app = createApp();
const server = app.listen(0);
const BASE = `http://127.0.0.1:${server.address().port}/api`;
after(() => { server.close(); fs.rmSync(TMP, { recursive: true, force: true }); });

const PW = 'senha-de-teste-123';
const mk = (key, role) => insert('users', { id: uid('u_'), name: key, email: `${key}@t.test`, password_hash: hashPassword(PW), role_key: role, functions: '[]', active: 1, capacity: 10, created_at: now() });
async function login(u) {
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bold-request': '1' }, body: JSON.stringify({ email: u.email, password: PW }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const call = async (m, url, b) => { const res = await fetch(BASE + url, { method: m, headers: { cookie, 'x-bold-request': '1', 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { status: res.status, body: await res.json().catch(() => null) }; };
  return { get: (u2) => call('GET', u2), post: (u2, b) => call('POST', u2, b) };
}
const ceo = mk('ceo', 'ceo'), est = mk('juliane', 'estrategia'), des = mk('felipe', 'design'), qa = mk('raisa', 'qualidade');
const day = new Date(Date.now() + 2 * 864e5).toISOString();
const range = `/calendar?start=${new Date(Date.now() - 864e5).toISOString()}&end=${new Date(Date.now() + 9 * 864e5).toISOString()}`;

test('equipe só visualiza: criar evento exige a permissão de Agenda', async () => {
  for (const u of [est, des, qa]) {
    const g = await login(u);
    assert.equal((await g.get('/agenda/opcoes')).body?.can_create ?? false, false);
    assert.equal((await g.post('/agenda/itens', { tipo: 'evento', title: 'x', starts_at: day })).status, 403, `${u.name} não cria`);
  }
});

test('para pessoas selecionadas: só elas e quem criou veem; para toda a equipe: todos veem; tarefa vira uma por pessoa', async () => {
  const c = await login(ceo);
  assert.equal((await c.post('/agenda/itens', { tipo: 'evento', title: 'Sem ninguém', starts_at: day, audience: 'selecionados', members: [] })).status, 422);
  const r = await c.post('/agenda/itens', { tipo: 'compromisso', title: 'Reunião de design', starts_at: day, audience: 'selecionados', members: [des.id] });
  assert.equal(r.status, 200);
  assert.equal((await c.post('/agenda/itens', { tipo: 'evento', title: 'Confraternização', starts_at: day, audience: 'todos' })).status, 200);
  const titles = async (u) => (await (await login(u)).get(range)).body.items.filter((i) => i.type === 'evento').map((i) => i.title).sort();
  assert.deepEqual(await titles(des), ['Confraternização', 'Reunião de design']);
  assert.deepEqual(await titles(est), ['Confraternização'], 'quem não foi selecionado não vê');
  assert.deepEqual(await titles(ceo), ['Confraternização', 'Reunião de design']);
  assert.ok(one("SELECT 1 FROM notifications WHERE user_id=? AND title LIKE '%Reunião de design%'", des.id), 'selecionado é avisado');
  assert.ok(!one("SELECT 1 FROM notifications WHERE user_id=? AND title LIKE '%Reunião de design%'", est.id));
  const t = await c.post('/agenda/itens', { tipo: 'tarefa', title: 'Enviar relatório', starts_at: day, audience: 'selecionados', members: [des.id, est.id] });
  assert.equal(t.body.tasks, 2);
  assert.equal(all("SELECT * FROM tasks WHERE title='Enviar relatório' AND data_origin='plataforma'").length, 2);
  assert.equal((await c.post(`/agenda/eventos/${r.body.id}/cancelar`, {})).status, 422, 'cancelar exige motivo');
  assert.equal((await c.post(`/agenda/eventos/${r.body.id}/cancelar`, { reason: 'remarcada' })).status, 200);
  assert.deepEqual(await titles(des), ['Confraternização'], 'cancelado sai do calendário');
});
