// Ciclos: abrir dezembro + janeiro produzidos juntos em novembro, montar o cronograma do cliente e enviar para análise.
// Daí em diante o Process Engine segue sozinho até a produção (design/edição). Banco temporário; nunca toca a base real.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bold-ciclos-'));
process.env.BOLD_DATA_DIR = TMP;
process.env.BOLD_STORAGE_DIR = TMP;
process.env.BOLD_DB_PATH = path.join(TMP, 'test.db');
const { one, all, insert, uid, now, setClock } = await import('../db.js');
const { createApp } = await import('../index.js');
const P = await import('../engine/process.js');
const { startClient } = await import('../routes/ops.js');
const { hashPassword } = await import('../lib/auth.js');
const { activateScheduledTasks } = await import('../engine/scheduler.js');
const app = createApp();
const server = app.listen(0);
const BASE = `http://127.0.0.1:${server.address().port}/api`;
after(() => { server.close(); fs.rmSync(TMP, { recursive: true, force: true }); });
const PW = 'senha-de-teste-123';
const mkUser = (key, role) => insert('users', { id: uid('u_'), name: key[0].toUpperCase() + key.slice(1), email: `${key}@t.test`, password_hash: hashPassword(PW), role_key: role, functions: '[]', active: 1, capacity: 10, created_at: now() });
const U = { ceo: mkUser('rebeca', 'ceo'), rev: mkUser('raisa', 'qualidade'), est: mkUser('juliane', 'estrategia'), des: mkUser('felipe', 'design'), copy: mkUser('carla', 'copy') };
const C = startClient({ name: 'Cliente Ciclo', services: [], monthly_posts: 4, requires_theme_approval: true,
  team: [{ user_id: U.est.id, function: 'estrategia' }, { user_id: U.copy.id, function: 'copy' }, { user_id: U.des.id, function: 'design' }, { user_id: U.rev.id, function: 'revisao' }] }, U.ceo);
const cli = mkUser('cliente', 'cliente'); insert('client_members', { client_id: C.id, user_id: cli.id, function: 'cliente' });
async function login(u) {
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bold-request': '1' }, body: JSON.stringify({ email: u.email, password: PW }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const call = async (method, url, body) => { const res = await fetch(`${BASE}${url}`, { method, headers: { cookie, 'x-bold-request': '1', 'content-type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined }); return { status: res.status, data: await res.json() }; };
  return { get: (x) => call('GET', x), post: (x, b = {}) => call('POST', x, b) };
}
const user = (u) => one('SELECT * FROM users WHERE id=?', u.id);

test('ciclo de dezembro + janeiro produzido em novembro: cronograma → análise → tema aprovado → produção', async () => {
  const ceo = await login(U.ceo);
  const r = await ceo.post('/ciclos', { months: ['2026-12', '2027-01'], production_month: '2026-11', client_ids: [C.id] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const cys = all('SELECT * FROM cycles WHERE batch_id=? ORDER BY month', r.data.batch_id);
  assert.deepEqual(cys.map((c) => c.month), ['2026-12', '2027-01']);
  assert.equal(JSON.parse(cys[1].milestones).producao.start.slice(0, 7), '2026-11', 'janeiro produzido junto: marcos em novembro');
  const t = one("SELECT * FROM tasks WHERE source_type='ciclo' AND client_id=?", C.id);
  assert.equal(t.assignee_id, U.est.id, 'a estrategista recebe “Montar cronograma”');
  assert.ok(one("SELECT 1 FROM notifications WHERE user_id=? AND type='ciclo'", U.est.id));

  const est = await login(U.est);
  const saved = await est.post(`/ciclos/${r.data.batch_id}/${C.id}/linhas`, { rows: [
    { planned_at: '2026-12-03', format: 'carrossel', title: 'Tema de dezembro', objective: 'Educar' },
    { planned_at: '2027-01-10', format: 'reel', title: 'Tema de janeiro', theme: 'Bastidores' },
    { planned_at: '2026-10-10', format: 'reel', title: 'Fora do ciclo', theme: 'x' },
    { planned_at: '2026-12-20', format: 'estatico', title: 'Sem tema' },
  ] });
  assert.equal(saved.data.created, 3);
  assert.match(saved.data.errors[0], /fora dos meses do ciclo/);
  const view = await est.get(`/ciclos/${r.data.batch_id}/${C.id}`);
  assert.equal(view.data.rows.length, 3);
  assert.equal(view.data.rows.find((x) => x.title === 'Tema de janeiro').month, '2027-01');

  const sent = await est.post(`/ciclos/${r.data.batch_id}/${C.id}/enviar`);
  assert.equal(sent.data.sent, 2);
  assert.match(sent.data.pending[0], /tema ou objetivo/);
  const dez = one("SELECT * FROM contents WHERE title='Tema de dezembro'");
  assert.equal(dez.stage, 'analise_cronograma');

  // Rebeca/Raísa aprovam → tema vai ao cliente → cliente aprova → produção com design e legenda nos responsáveis
  const opens = P.stageAvailability(dez);
  if (opens) { setClock(new Date(new Date(opens).getTime() + 60e3).toISOString()); activateScheduledTasks(); }
  try { P.reviewDecision(dez.id, user(U.rev), { decision: 'aprovar' }, {}); } finally { setClock(null); }
  assert.equal(one('SELECT stage FROM contents WHERE id=?', dez.id).stage, 'aprovacao_tema');
  P.clientDecision(dez.id, user(cli), { decision: 'aprovar' }, {});
  assert.equal(one('SELECT stage FROM contents WHERE id=?', dez.id).stage, 'producao');
  const prod = all("SELECT function, assignee_id FROM tasks WHERE content_id=? AND stage='producao' AND status IN ('aberta','em_andamento','agendada')", dez.id);
  assert.deepEqual(prod.map((x) => x.function).sort(), ['copy', 'design']);
  assert.ok(prod.find((x) => x.function === 'design').assignee_id === U.des.id, 'design vai para o designer do cliente');
});

test('direcionamento da estrategista: observação e links chegam ao detalhe e ao cliente; não viram peça', async () => {
  const est = await login(U.est);
  const c = one("SELECT * FROM contents WHERE title='Tema de dezembro'"); // já com o cliente (tema aprovado, em produção)
  const fd = new FormData(); fd.append('note', 'Pensei num reels de bastidores, luz natural.'); fd.append('links', 'https://pinterest.com/pin/1\nnão é link');
  const cookieLogin = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bold-request': '1' }, body: JSON.stringify({ email: U.est.email, password: PW }) });
  const r = await fetch(`${BASE}/contents/${c.id}/direcionamento`, { method: 'POST', headers: { cookie: cookieLogin.headers.get('set-cookie').split(';')[0], 'x-bold-request': '1' }, body: fd });
  assert.equal(r.status, 200);
  const d = (await est.get(`/contents/${c.id}`)).data.direction;
  assert.equal(d.note, 'Pensei num reels de bastidores, luz natural.');
  assert.deepEqual(d.links, ['https://pinterest.com/pin/1']);
  assert.equal(one('SELECT current_version_id FROM contents WHERE id=?', c.id).current_version_id, null, 'referência não cria versão nem conta como entrega');
  const cl = await login(cli);
  const item = (await cl.get(`/portal/contents/${c.id}`)).data;
  assert.equal(item.direction.note, 'Pensei num reels de bastidores, luz natural.');
});
