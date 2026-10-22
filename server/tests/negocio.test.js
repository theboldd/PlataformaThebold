// NEGÓCIO — cobranças (D-1/D0/D+N, idempotência, sem e-mail nada é "enviado"), pagamento manual, apuração de repasses
// (só plataforma, sem regra = pendente, fechamento congela), rentabilidade e permissões no servidor. Banco temporário.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bold-negocio-'));
process.env.BOLD_DATA_DIR = TMP;
process.env.BOLD_STORAGE_DIR = TMP;
process.env.BOLD_DB_PATH = path.join(TMP, 'test.db');
delete process.env.RESEND_API_KEY;

const { one, all, insert, uid, now, setClock } = await import('../db.js');
const { createApp } = await import('../index.js');
const { hashPassword } = await import('../lib/auth.js');
const N = await import('../services/negocio.js');

const app = createApp();
const server = app.listen(0);
const BASE = `http://127.0.0.1:${server.address().port}/api`;
after(() => { setClock(null); server.close(); fs.rmSync(TMP, { recursive: true, force: true }); });

const PW = 'senha-de-teste-123';
const mkUser = (key, role, fns = []) => insert('users', { id: uid('u_'), name: key, email: `${key}@t.test`, password_hash: hashPassword(PW), role_key: role, functions: JSON.stringify(fns), active: 1, capacity: 10, created_at: now() });
async function login(u) {
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bold-request': '1' }, body: JSON.stringify({ email: u.email, password: PW }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const call = async (method, url, body) => { const res = await fetch(BASE + url, { method, headers: { cookie, 'x-bold-request': '1', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: res.status, body: await res.json().catch(() => null) }; };
  return { get: (u2) => call('GET', u2), post: (u2, b) => call('POST', u2, b), put: (u2, b) => call('PUT', u2, b) };
}
const ceo = mkUser('ceo', 'ceo');
const com = mkUser('comercial', 'comercial');
const des = mkUser('felipe', 'design', ['design']);
const mkClient = (name, kind = 'externo') => insert('clients', { id: uid('cl_'), name, status: 'ativo', kind, created_at: now() });
const A = mkClient('Cliente A');
const INT = mkClient('THE BOLD', 'interno');

test('cobrança: sem e-mail/Resend nada é enviado, fica registrado o motivo; rotina idempotente; pós-vencimento só com decisão', async () => {
  const g = await login(ceo); // sessão criada no relógio real; só a rotina roda no relógio avançado
  setClock('2026-11-09T12:00:00Z');
  const inv = insert('invoices', { id: uid('iv_'), client_id: A.id, description: 'Parcela 1/6', amount: 3000, due_at: '2026-11-10T15:00:00Z', status: 'aberta', created_at: now() });
  let r = await N.billingRoutine();
  assert.equal(r.lembrete_d1, 1);
  let ev = all('SELECT * FROM billing_events WHERE invoice_id=?', inv.id);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].status, 'nao_enviado');
  assert.match(ev[0].error, /sem e-mail de cobrança/);
  r = await N.billingRoutine();
  assert.equal(all('SELECT * FROM billing_events WHERE invoice_id=?', inv.id).length, 1, 'mesma rotina no mesmo dia não duplica');
  setClock(null);
  assert.equal((await g.put(`/negocio/clientes/${A.id}/cobranca`, { billing_email: 'financeiro@cliente-a.test', due_day: 10 })).status, 200);
  setClock('2026-11-10T12:00:00Z');
  await N.billingRoutine();
  ev = one("SELECT * FROM billing_events WHERE invoice_id=? AND kind='cobranca_d0'", inv.id);
  assert.equal(ev.status, 'nao_enviado');
  assert.match(ev.error, /Resend/);
  setClock('2026-11-13T12:00:00Z');
  await N.billingRoutine();
  assert.equal(one("SELECT COUNT(*) n FROM billing_events WHERE invoice_id=? AND kind='cobranca_pos'", inv.id).n, 0, 'sem decisão: nenhuma cobrança após vencimento');
  setClock(null);
  const evs = all('SELECT * FROM billing_events WHERE invoice_id=?', inv.id);
  assert.equal(N.invoiceStatus(inv, evs, '2026-11-13T12:00:00Z'), 'pagamento_atrasado', 'D+1 sem pagamento = atrasado');
  assert.equal(N.invoiceStatus(inv, evs, '2026-11-09T12:00:00Z'), 'a_vencer', 'lembrete não enviado não muda o status para "lembrete enviado"');
  assert.equal((await g.post(`/negocio/parcelas/${inv.id}/pagar`, { amount: 3000, paid_at: '2026-11-13', competencia: '2026-11' })).status, 200);
  assert.equal((await g.get('/negocio/recebimentos')).body.invoices.find((i) => i.id === inv.id).display, 'pagamento_confirmado');
  assert.equal((await g.post(`/negocio/parcelas/${inv.id}/cancelar`, {})).status, 422, 'cancelar exige motivo');
  setClock(null);
});

test('repasses: só trabalho da plataforma, sem regra = pendente, fechamento exige regra e aprovação, e congela', async () => {
  setClock('2026-10-20T12:00:00Z');
  const task = (o) => insert('tasks', { id: uid('t_'), title: o.title, client_id: o.client || A.id, function: 'design', assignee_id: des.id, status: o.status || 'concluida', kind: 'etapa', origin: 'engine', priority: 'media', due_at: o.due || '2026-10-15T12:00:00Z', completed_at: o.status === 'aberta' ? null : (o.done || '2026-10-14T12:00:00Z'), completed_by: o.status === 'aberta' ? null : des.id, created_at: now(), data_origin: o.origin || 'plataforma' });
  task({ title: 'Design carrossel' });
  task({ title: 'Migrada', origin: 'notion' });
  task({ title: 'Interno', client: INT.id });
  task({ title: 'Atrasada', status: 'aberta', due: '2026-10-05T12:00:00Z' });
  let ap = N.apuracao('2026-10');
  assert.deepEqual(ap.lines.map((l) => l.title).sort(), ['Atrasada', 'Design carrossel'], 'migrada e cliente interno ficam fora');
  assert.equal(ap.totals.pendentes_regra, 1);
  assert.equal(ap.lines.find((l) => l.title === 'Atrasada').exec, 'nao_realizado_sem_motivo');
  assert.equal(ap.lines.find((l) => l.title === 'Atrasada').conta, false, 'prazo vencido não gera desconto nem valor automático');
  const g = await login(ceo);
  assert.equal((await g.post('/negocio/repasses/2026-10/status', { to: 'rascunho' })).status, 200);
  for (const to of ['em_revisao', 'aguardando_aprovacao', 'aprovado']) assert.equal((await g.post('/negocio/repasses/2026-10/status', { to })).status, 200, to);
  assert.equal((await g.post('/negocio/repasses/2026-10/status', { to: 'fechado' })).status, 409, 'não fecha com demanda sem regra');
  assert.equal((await g.post('/negocio/repasses/valores', { function: 'design', value: 120, starts_at: '2026-01-01' })).status, 200);
  ap = N.apuracao('2026-10');
  assert.equal(ap.totals.valor_apurado, 120);
  assert.equal((await g.post('/negocio/repasses/ajustes', { competencia: '2026-10', user_id: des.id, amount: -20, reason: 'Desconto combinado' })).status, 200);
  const f = await g.post('/negocio/repasses/2026-10/status', { to: 'fechado' });
  assert.equal(f.status, 200);
  assert.equal(f.body.status, 'fechado');
  assert.equal(f.body.report_error, 'E-mail do relatório não definido na Configuração financeira.');
  // valor novo não muda o fechado
  await g.post('/negocio/repasses/valores', { user_id: des.id, value: 999, starts_at: '2026-01-01' });
  const fechado = (await g.get('/negocio/repasses?competencia=2026-10')).body;
  assert.equal(fechado.frozen, true);
  assert.equal(fechado.apuracao.people[0].valor_final, 100);
  assert.equal((await g.post('/negocio/repasses/ajustes', { competencia: '2026-10', user_id: des.id, amount: 5, reason: 'x' })).status, 409, 'competência fechada não aceita ajuste');
  assert.equal((await g.post('/negocio/repasses/2026-10/status', { to: 'reaberto' })).status, 422, 'reabrir exige motivo');
  setClock(null);
});

test('permissões: repasses só com a permissão própria; rentabilidade esconde valores de repasse de quem não tem', async () => {
  const c = await login(com);
  assert.equal((await c.get('/negocio/recebimentos')).status, 200, 'comercial vê recebimentos');
  assert.equal((await c.get('/negocio/repasses')).status, 403, 'comercial não vê repasses');
  const rent = (await c.get('/negocio/rentabilidade?competencia=2026-10')).body;
  assert.equal(rent.repasses, null);
  assert.equal(rent.states.repasses, 'restrito');
  assert.equal((await c.put('/negocio/config', { 'fin.dia_fechamento': 10 })).status, 403, 'regra de fechamento: só com permissão de repasses');
  const d = await login(des);
  assert.equal((await d.get('/negocio/recebimentos')).status, 403);
  assert.equal((await d.get('/negocio/repasses')).status, 403);
  const g = await login(ceo);
  assert.equal((await g.put('/negocio/config', { 'fin.dia_fechamento': 40 })).status, 422);
  assert.equal((await g.put('/negocio/config', { 'fin.dia_fechamento': 10, 'fin.cobrancas_pos_vencimento': 2 })).status, 200);
  assert.ok(one("SELECT 1 FROM activity_logs WHERE action='financeiro.config'"), 'mudança de configuração vai para o histórico');
});

test('custos, metas e rentabilidade: margem só com receita, custos e repasses; sem meta = aguardando decisão', async () => {
  const g = await login(ceo);
  let m = (await g.get('/negocio/metas?competencia=2026-11')).body;
  assert.ok(m.items.every((i) => i.state === 'aguardando_decisao'));
  assert.equal((await g.post('/negocio/custos', { description: 'Ferramentas', category: 'ferramentas', kind: 'recorrente', amount: 500, starts_at: '2026-09-01' })).status, 200);
  const r = (await g.get('/negocio/rentabilidade?competencia=2026-11')).body;
  assert.equal(r.custos, 500, 'custo recorrente vale na competência');
  assert.equal(r.receita.faturado, 3000);
  m = (await g.put('/negocio/metas', { competencia: '2026-11', metric: 'faturado', target: 5000 })).body;
  const fat = m.items.find((i) => i.metric === 'faturado');
  assert.equal(fat.state, 'ativo');
  assert.equal(fat.desvio, -2000);
});
