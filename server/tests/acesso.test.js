// Acesso pelo nome com senha inicial: cria o login, entra pelo nome (sem acento/maiúscula), troca a senha no primeiro acesso
// e gera a mensagem pronta. Banco temporário; nunca toca a base real.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bold-acesso-'));
process.env.BOLD_DATA_DIR = TMP; process.env.BOLD_STORAGE_DIR = TMP; process.env.BOLD_DB_PATH = path.join(TMP, 'test.db');
const { one, insert, uid, now } = await import('../db.js');
const { createApp } = await import('../index.js');
const { startClient } = await import('../routes/ops.js');
const { hashPassword } = await import('../lib/auth.js');
const app = createApp(); const server = app.listen(0);
const BASE = `http://127.0.0.1:${server.address().port}/api`;
after(() => { server.close(); fs.rmSync(TMP, { recursive: true, force: true }); });
const ceo = insert('users', { id: uid('u_'), name: 'Rebeca', email: 'rebeca@t.test', password_hash: hashPassword('senha-da-ceo-123'), role_key: 'ceo', functions: '[]', active: 1, capacity: 10, created_at: now() });
const C = startClient({ name: 'Alanna Santoro | Dermatologista', services: [], monthly_posts: 4, requires_theme_approval: true, team: [] }, ceo);
async function session(login, password) {
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bold-request': '1' }, body: JSON.stringify({ email: login, password }) });
  if (r.status !== 200) return { status: r.status };
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const call = async (method, url, body) => { const res = await fetch(`${BASE}${url}`, { method, headers: { cookie, 'x-bold-request': '1', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: res.status, data: await res.json() }; };
  return { status: 200, get: (u) => call('GET', u), post: (u, b) => call('POST', u, b || {}) };
}

test('login pelo nome + senha inicial → troca obrigatória → mensagem de acesso', async () => {
  const adm = await session('rebeca@t.test', 'senha-da-ceo-123');
  const r = await adm.post('/client-access/login-por-nome', { password: 'thebold' });
  assert.equal(r.data.created[0].login, 'alanna.santoro');
  const msg = await adm.get(`/users/${r.data.created[0].user_id}/mensagem-acesso`);
  assert.match(msg.data.text, /Login: alanna\.santoro/);
  assert.match(msg.data.text, /Senha: thebold/);
  assert.equal(one("SELECT value FROM settings WHERE key='acesso.senha_inicial'").value.includes('thebold'), false, 'senha inicial guardada cifrada');

  const cli = await session('Alanna Santoro', 'thebold');
  assert.equal(cli.status, 200, 'entra com o nome, maiúsculas e espaço');
  assert.equal((await session('alanna.santoro', 'errada')).status, 401);
  const me = await cli.get('/auth/me');
  assert.equal(me.data.user.must_change_password, true);
  assert.equal((await cli.post('/auth/first-password', { password: 'thebold' })).status, 400, 'mínimo de 10 caracteres');
  assert.equal((await cli.post('/auth/first-password', { password: 'minha-senha-nova' })).status, 200);
  assert.equal((await session('alanna santoro', 'thebold')).status, 401, 'a senha inicial deixa de valer');
  assert.equal((await session('alannasantoro', 'minha-senha-nova')).status, 200);
  const msg2 = await adm.get(`/users/${r.data.created[0].user_id}/mensagem-acesso`);
  assert.doesNotMatch(msg2.data.text, /Senha: thebold/, 'depois da troca a mensagem não mostra mais a senha inicial');
  assert.match(msg2.data.text, /redefinir-senha/);
});
