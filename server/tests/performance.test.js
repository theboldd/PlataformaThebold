// Equipe & Performance: a tela existe com 0 eventos, nunca calcula score/ranking e não conta dado migrado do Notion.
// Banco temporário (mesmo padrão de engine.test.js): npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bold-perf-test-'));
process.env.BOLD_DATA_DIR = TMP;
process.env.BOLD_STORAGE_DIR = TMP;
process.env.BOLD_DB_PATH = path.join(TMP, 'test.db');

const { one, insert, uid, now } = await import('../db.js');
const { bootstrap } = await import('../index.js');
const { performanceReport } = await import('../routes/performance.js');
bootstrap();

const mkUser = (key, role, extra = {}) => insert('users', { id: uid('u_'), name: key, email: `${key}@perf.test`, password_hash: 'x', role_key: role, functions: '["design"]', active: 1, capacity: 8, created_at: now(), ...extra });
const ceo = mkUser('ceo-perf', 'ceo');
const des = mkUser('designer-perf', 'design');
mkUser('cliente-perf', 'cliente');
mkUser('inativo-perf', 'design', { active: 0 });
const cl = insert('clients', { id: uid('c_'), name: 'Cliente Perf', status: 'ativo', created_at: now() });
const user = (u) => one('SELECT * FROM users WHERE id=?', u.id);
const hasKey = (obj, re) => JSON.stringify(obj, (k, v) => { if (re.test(k)) throw new Error(`campo proibido: ${k}`); return v; });

test('sem eventos da plataforma: a tela existe, DADOS INSUFICIENTES, sem score nem ranking', () => {
  const r = performanceReport(user(ceo), {});
  assert.equal(r.period.days, 30);
  assert.equal(r.valid_events.count, 0);
  assert.equal(r.valid_events.sufficient, false);
  assert.ok(r.valid_events.threshold > 0);
  assert.ok(r.insufficient_reason);
  assert.doesNotThrow(() => hasKey(r, /score|rank/i), 'nenhum campo de score/ranking');
  const ids = r.people.map((p) => p.id);
  assert.ok(ids.includes(des.id) && ids.includes(ceo.id));
  assert.ok(!r.people.some((p) => /cliente-perf|inativo-perf/.test(p.name)), 'exclui cliente e inativo');
  const p = r.people.find((x) => x.id === des.id);
  assert.equal(p.capacity_configured, 8);
  assert.match(p.capacity_source, /não medida/);
  assert.equal(p.trend.value, null);
  assert.ok(p.trend.reason);
  assert.equal(performanceReport(user(ceo), { days: '7' }).period.days, 7);
  assert.equal(performanceReport(user(ceo), { days: '999' }).period.days, 30, 'período fora da lista volta ao padrão');
});

test('tarefas migradas do Notion não contam; tarefas da plataforma contam', () => {
  const past = new Date(Date.now() - 2 * 864e5).toISOString();
  const older = new Date(Date.now() - 4 * 864e5).toISOString();
  const task = (origin, extra = {}) => insert('tasks', { id: uid('t_'), title: `Tarefa ${origin}`, client_id: cl.id, stage: 'producao', function: 'design', assignee_id: des.id, status: 'concluida', kind: 'etapa', origin: 'engine',
    due_at: older, created_at: older, completed_at: past, completed_by: des.id, data_origin: origin, ...extra });
  for (let i = 0; i < 3; i++) task('notion', { perf_status: 'migrado' });
  insert('tasks', { id: uid('t_'), title: 'Aberta herdada', client_id: cl.id, stage: 'producao', function: 'design', assignee_id: des.id, status: 'aberta', kind: 'etapa', origin: 'engine', due_at: older, created_at: older, data_origin: 'notion', perf_status: 'migrado' });
  let r = performanceReport(user(ceo), {});
  let p = r.people.find((x) => x.id === des.id);
  assert.equal(r.valid_events.count, 0, 'herdado do Notion não é evento válido');
  assert.equal(p.done_in_period, 0);
  assert.equal(p.done_late, 0);
  assert.equal(p.overdue_open, 0, 'herdada vencida não vira atraso da pessoa');
  assert.equal(p.open_tasks, 0);
  assert.equal(p.inherited_open, 1, 'herdada aparece à parte');
  assert.equal(p.late_context.length, 0);

  task('plataforma');
  r = performanceReport(user(ceo), {});
  p = r.people.find((x) => x.id === des.id);
  assert.equal(r.valid_events.count, 1);
  assert.equal(r.valid_events.sufficient, false);
  assert.equal(p.done_in_period, 1);
  assert.equal(p.done_late, 1);
  assert.equal(p.late_context.length, 1);
  assert.equal(p.late_context[0].reason, 'Sem motivo registrado');
  assert.doesNotThrow(() => hasKey(r, /score|rank/i));
});
