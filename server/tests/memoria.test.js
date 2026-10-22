// MEMÓRIA DE DECISÕES, RADAR DE AUTOMAÇÕES e PREFERÊNCIAS DE NOTIFICAÇÃO — pelo HTTP real, em banco e storage temporários.
// Nada aqui toca a base real; os registros existem só neste banco de teste e são apagados ao final.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bold-memoria-'));
process.env.BOLD_DATA_DIR = TMP;
process.env.BOLD_STORAGE_DIR = TMP;
process.env.BOLD_DB_PATH = path.join(TMP, 'test.db');
delete process.env.RESEND_API_KEY;

const { one, all, insert, uid, now, run } = await import('../db.js');
const { createApp } = await import('../index.js');
const { hashPassword } = await import('../lib/auth.js');
const { log, notify } = await import('../lib/core.js');
const { RADAR_THRESHOLD } = await import('../routes/memoria.js');

const app = createApp();
const server = app.listen(0);
const BASE = `http://127.0.0.1:${server.address().port}/api`;
after(() => { server.close(); fs.rmSync(TMP, { recursive: true, force: true }); });

const PW = 'senha-de-teste-123';
const mkUser = (key, role) => insert('users', { id: uid('u_'), name: key, email: `${key}@t.test`, password_hash: hashPassword(PW), role_key: role, functions: '[]', active: 1, capacity: 10, created_at: now() });
async function login(u) {
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bold-request': '1' }, body: JSON.stringify({ email: u.email, password: PW }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return async (method, url, body) => {
    const res = await fetch(BASE + url, { method, headers: { cookie, 'x-bold-request': '1', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await res.text();
    let j = null; try { j = JSON.parse(t); } catch { /* texto */ }
    return { status: res.status, body: j ?? t };
  };
}
const U = { ceo: mkUser('ceo', 'ceo'), ops: mkUser('ops', 'operacoes'), des: mkUser('des', 'design'), gestao: mkUser('gestao', 'gestao'), autor: mkUser('autor', 'design') };
// pode registrar (brain:create) mas não confirmar
insert('user_permissions', { user_id: U.autor.id, module: 'brain', action: 'create', effect: 'grant' });

test('Memória de Decisões: ciclo de vida, versão ao editar confirmada, nada é apagado, 403 sem permissão', async () => {
  const ceo = await login(U.ceo);
  const empty = await ceo('GET', '/brain/decisions');
  assert.equal(empty.status, 200);
  assert.equal(empty.body.state, 'dados_insuficientes');

  const c = await ceo('POST', '/brain/decisions', { decision: 'Reels sempre com legenda revisada', context: 'Erros de legenda', reason: 'Qualidade', area: 'regra', links: ['https://exemplo.test/doc'] });
  assert.equal(c.status, 200);
  assert.equal(c.body.status, 'rascunho');
  assert.equal(c.body.version, 1);
  const id = c.body.id;
  assert.equal((await ceo('POST', '/brain/decisions', { decision: 'x', links: ['javascript:alert(1)'] })).status, 422, 'só links http(s)');

  assert.equal((await ceo('POST', `/brain/decisions/${id}/status`, { status: 'sugerida' })).body.status, 'sugerida');
  // quem só cria não confirma
  const autor = await login(U.autor);
  const byAutor = await autor('POST', '/brain/decisions', { decision: 'Decisão do autor' });
  assert.equal(byAutor.status, 200);
  assert.equal((await autor('POST', `/brain/decisions/${id}/status`, { status: 'confirmada' })).status, 403);
  const conf = await ceo('POST', `/brain/decisions/${id}/status`, { status: 'confirmada' });
  assert.equal(conf.body.status, 'confirmada');
  assert.equal(conf.body.confirmed_by, U.ceo.id);

  // editar a CONFIRMADA cria V2 e a V1 vira SUBSTITUÍDA apontando para a nova
  const ed = await ceo('PUT', `/brain/decisions/${id}`, { reason: 'Qualidade + prazo', note: 'ajuste do motivo' });
  assert.equal(ed.status, 200);
  assert.notEqual(ed.body.id, id);
  assert.equal(ed.body.version, 2);
  assert.equal(ed.body.status, 'confirmada');
  assert.equal(ed.body.reason, 'Qualidade + prazo');
  const old = one('SELECT * FROM brain_decisions WHERE id=?', id);
  assert.equal(old.status, 'substituida');
  assert.equal(old.replaced_by, ed.body.id);
  assert.equal(old.reason, 'Qualidade', 'a versão antiga é preservada');
  const det = await ceo('GET', `/brain/decisions/${ed.body.id}`);
  assert.equal(det.body.versions.length, 2);
  assert.ok(det.body.history.length >= 4);
  assert.equal((await ceo('PUT', `/brain/decisions/${id}`, { reason: 'x' })).status, 409, 'substituída não se edita');

  // filtros
  assert.equal((await ceo('GET', '/brain/decisions?q=legenda')).body.items.length, 1, 'vigentes não incluem substituídas');
  assert.equal((await ceo('GET', '/brain/decisions?q=legenda&status=todas')).body.items.length, 2);
  assert.equal((await ceo('GET', '/brain/decisions?area=regra')).body.items.length, 1);
  assert.equal((await ceo('GET', '/brain/decisions?status=rascunho')).body.items.length, 1);

  // revogar exige motivo; nunca apagar
  assert.equal((await ceo('POST', `/brain/decisions/${ed.body.id}/status`, { status: 'revogada' })).status, 422);
  assert.equal((await ceo('POST', `/brain/decisions/${ed.body.id}/status`, { status: 'revogada', note: 'mudou o processo' })).body.status, 'revogada');
  assert.equal((await ceo('DELETE', `/brain/decisions/${ed.body.id}`)).status, 404, 'não existe rota de exclusão');
  assert.throws(() => run('DELETE FROM brain_decisions WHERE id=?', id), /nunca são apagadas/);
  assert.equal(one('SELECT COUNT(*) n FROM brain_decisions').n, 3);
  assert.ok(one("SELECT 1 FROM activity_logs WHERE action='brain.decisao_versionada'"), 'auditoria registrada');

  // permissão no backend
  const des = await login(U.des);
  assert.equal((await des('GET', '/brain/decisions')).status, 200, 'design vê (brain:view)');
  assert.equal((await des('POST', '/brain/decisions', { decision: 'tentativa' })).status, 403);
  assert.equal((await des('POST', `/brain/decisions/${byAutor.body.id}/status`, { status: 'sugerida' })).status, 403);
  assert.equal((await des('PUT', `/brain/decisions/${byAutor.body.id}`, { decision: 'x' })).status, 403);
});

test('Radar de Automações: limiar determinístico, decisão humana persiste e aprovar não cria automação', async () => {
  const ceo = await login(U.ceo);
  const empty = await ceo('GET', '/brain/radar');
  assert.equal(empty.status, 200);
  assert.equal(empty.body.state, 'dados_insuficientes');
  for (let i = 0; i < RADAR_THRESHOLD - 1; i++) log({ actor: U.ops.id, action: 'conteudo.alterado', entity: 'content', id: `ct${i}`, summary: `Legenda ajustada à mão ${i}` });
  for (let i = 0; i < 10; i++) log({ actor: U.ops.id, action: 'auth.login', entity: 'user', summary: 'login' }); // ignorado
  for (let i = 0; i < 10; i++) log({ kind: 'sistema', action: 'tarefa.criada', entity: 'task', summary: 'sistema' }); // não é manual
  let r = await ceo('GET', '/brain/radar');
  assert.equal(r.body.items.length, 0, 'abaixo do limiar não vira sugestão');
  log({ actor: U.gestao.id, action: 'conteudo.alterado', entity: 'content', id: 'ctx', summary: 'Legenda ajustada à mão (5)' });
  r = await ceo('GET', '/brain/radar');
  assert.equal(r.body.state, 'ativo');
  assert.equal(r.body.items.length, 1);
  const s = r.body.items[0];
  assert.equal(s.action, 'conteudo.alterado');
  assert.equal(s.occurrences, RADAR_THRESHOLD);
  assert.equal(s.people, 2);
  assert.equal(s.status, 'sugerida');
  assert.equal(s.process, 'Produção de conteúdo');
  assert.ok(s.examples.length > 0 && s.per_week > 0);

  // só quem administra automações (ou CEO) decide
  const des = await login(U.des);
  assert.equal((await des('GET', '/brain/radar')).status, 403);
  const gestao = await login(U.gestao);
  assert.equal((await gestao('POST', `/brain/radar/${s.id}/status`, { status: 'em_revisao' })).status, 403);

  const autos = all('SELECT key, enabled, implemented FROM automations ORDER BY key');
  assert.equal((await ceo('POST', `/brain/radar/${s.id}/status`, { status: 'aprovada_regra' })).status, 422, 'nota obrigatória');
  const ap = await ceo('POST', `/brain/radar/${s.id}/status`, { status: 'aprovada_regra', note: 'virar regra no processo' });
  assert.equal(ap.status, 200);
  assert.equal(ap.body.status, 'aprovada_regra');
  assert.deepEqual(all('SELECT key, enabled, implemented FROM automations ORDER BY key'), autos, 'aprovar não cria nem liga automação');

  // nova detecção é idempotente e preserva a decisão
  log({ actor: U.ops.id, action: 'conteudo.alterado', entity: 'content', id: 'cty', summary: 'mais um' });
  r = await ceo('GET', '/brain/radar');
  assert.equal(r.body.items.length, 1);
  assert.equal(r.body.items[0].status, 'aprovada_regra');
  assert.equal(r.body.items[0].occurrences, RADAR_THRESHOLD + 1);
  assert.equal(one('SELECT COUNT(*) n FROM automation_suggestions').n, 1);
});

test('Preferências de notificação: filtram a plataforma, URGENTE sempre chega, sem preferência nada muda', async () => {
  const notifs = (u) => all('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at', u.id);
  // padrão (sem preferências): comportamento original, inclusive agrupamento
  notify([U.gestao.id], { level: 'info', type: 'tarefa', title: 'T1', groupKey: 'g1' });
  notify([U.gestao.id], { level: 'info', type: 'tarefa', title: 'T2', groupKey: 'g1' });
  notify([U.gestao.id], { level: 'info', type: 'reuniao', title: 'R1' });
  assert.equal(notifs(U.gestao).length, 2);
  assert.equal(notifs(U.gestao)[0].count, 2);

  const get = await login(U.des);
  const pr = await get('GET', '/me/notification-prefs');
  assert.equal(pr.status, 200);
  assert.ok(pr.body.categories.every((c) => c.platform === true), 'padrão: tudo ligado');
  assert.equal(pr.body.channels.email.state, 'aguardando_configuracao');
  assert.equal(pr.body.channels.push.state, 'em_desenvolvimento');
  const sv = await get('PUT', '/me/notification-prefs', { categories: { tarefas: { platform: false, email: true } }, group_similar: false });
  assert.equal(sv.status, 200);
  assert.equal(sv.body.categories.find((c) => c.key === 'tarefas').platform, false);
  assert.equal(sv.body.group_similar, false);

  notify([U.des.id, U.ops.id], { level: 'info', type: 'tarefa', title: 'Nova tarefa' });
  notify([U.des.id], { level: 'atencao', type: 'prazo', title: 'Prazo' });
  notify([U.des.id], { level: 'urgente', type: 'atraso', title: 'Prazo vencido' });
  notify([U.des.id], { level: 'info', type: 'reuniao', title: 'Reunião A', groupKey: 'r' });
  notify([U.des.id], { level: 'info', type: 'reuniao', title: 'Reunião B', groupKey: 'r' });
  const mine = notifs(U.des).map((n) => n.title);
  assert.ok(!mine.includes('Nova tarefa') && !mine.includes('Prazo'), 'categoria desligada não chega na plataforma');
  assert.ok(mine.includes('Prazo vencido'), 'URGENTE nunca é desligado');
  assert.ok(mine.includes('Reunião A') && mine.includes('Reunião B'), 'agrupar desligado: uma notificação por evento');
  assert.ok(notifs(U.ops).some((n) => n.title === 'Nova tarefa'), 'outra pessoa sem preferência recebe normalmente');
  assert.ok(one("SELECT 1 FROM activity_logs WHERE action='notificacoes.preferencias' AND actor_id=?", U.des.id));

  // cliente do portal não acessa preferências internas
  const cli = mkUser('cli', 'cliente');
  assert.equal((await (await login(cli))('GET', '/me/notification-prefs')).status, 403);
});

test('Reunião → Memória: decisão do resumo interno aplicada por humano entra como CONFIRMADA (origem reunião), sem duplicar', async () => {
  const m = insert('meetings', { id: uid('mt_'), client_id: null, title: 'Interna de processo', kind: 'interna', starts_at: now(), ends_at: now(), created_at: now() });
  const ceo = await login(U.ceo);
  const body = { items: [{ kind: 'decisao', body: 'Aprovação de tema sempre até quinta' }, { kind: 'informacao', body: 'só informação' }] };
  assert.equal((await ceo('POST', `/meetings/${m.id}/summaries/internal/apply`, body)).status, 200);
  const d = all("SELECT * FROM brain_decisions WHERE meeting_id=? AND origin='reuniao'", m.id);
  assert.equal(d.length, 1);
  assert.equal(d[0].status, 'confirmada');
  assert.equal(d[0].confirmed_by, U.ceo.id);
  assert.equal((await ceo('POST', `/meetings/${m.id}/summaries/internal/apply`, { items: [{ kind: 'acao', body: 'outra' }] })).status, 200);
  assert.equal(one("SELECT COUNT(*) n FROM brain_decisions WHERE meeting_id=?", m.id).n, 1, 'não duplica');
});
