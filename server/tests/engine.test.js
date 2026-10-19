// Testes do núcleo: Process Engine, versões, permissões, auditoria e preservação de mídia.
// Rodam em banco e storage temporários: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bold-test-'));
process.env.BOLD_DATA_DIR = TMP;
process.env.BOLD_STORAGE_DIR = TMP;
process.env.BOLD_DB_PATH = path.join(TMP, 'test.db');

const { one, all, insert, uid, now, run } = await import('../db.js');
const { bootstrap } = await import('../index.js');
const P = await import('../engine/process.js');
const { startClient } = await import('../routes/ops.js');
const { canAccessClient, can } = await import('../lib/permissions.js');
const { ingest, waitForProcessing, TMP_DIR, storage } = await import('../services/media.js');
const sharp = (await import('sharp')).default;
bootstrap();

const mkUser = (key, role, fns = []) => insert('users', { id: uid('u_'), name: key[0].toUpperCase() + key.slice(1), email: `${key}@t.test`, password_hash: 'x', role_key: role, functions: JSON.stringify(fns), active: 1, capacity: 10, created_at: now() });
const U = { ceo: mkUser('rebeca', 'ceo'), ops: mkUser('vitoria', 'operacoes'), rev: mkUser('raisa', 'qualidade'), est: mkUser('juliane', 'estrategia'), des: mkUser('felipe', 'design'), ed: mkUser('leo', 'edicao'), out: mkUser('outro', 'design'), gestao: mkUser('vivian', 'gestao') };
const client = startClient({ name: 'Cliente Teste', services: [], monthly_posts: 4, requires_theme_approval: true,
  team: [{ user_id: U.est.id, function: 'estrategia' }, { user_id: U.est.id, function: 'copy' }, { user_id: U.des.id, function: 'design' }, { user_id: U.ed.id, function: 'edicao' }, { user_id: U.gestao.id, function: 'agendamento' }, { user_id: U.rev.id, function: 'revisao' }] }, U.ceo);
const cu = mkUser('cliente', 'cliente'); insert('client_members', { client_id: client.id, user_id: cu.id, function: 'cliente' });
const other = startClient({ name: 'Outro Cliente', services: [], monthly_posts: 4, requires_theme_approval: true, team: [] }, U.ceo);
const req = { ip: '10.0.0.1', headers: { 'user-agent': 'test' } };
const user = (u) => one('SELECT * FROM users WHERE id=?', u.id);
const fresh = (c) => one('SELECT * FROM contents WHERE id=?', c.id);
const open = (c, f = () => true) => all("SELECT * FROM tasks WHERE content_id=? AND status IN ('aberta','em_andamento') AND kind IN ('etapa','ajuste')", c.id).filter(f);

async function addImage(c, u, color) {
  const src = path.join(TMP_DIR, `src-${crypto.randomUUID()}.jpg`);
  await sharp({ create: { width: 3000, height: 3750, channels: 3, background: color } }).jpeg({ quality: 95 }).toFile(src);
  const f = await ingest(src, { originalName: 'arte.jpg', mime: 'image/jpeg', clientId: c.client_id, userId: u.id });
  const v = P.editableVersion(fresh(c), u.id);
  run('DELETE FROM version_media WHERE version_id=?', v.id);
  insert('version_media', { version_id: v.id, file_id: f.id, position: 0 });
  return f;
}

test('ciclo completo do conteúdo: o engine move tudo sozinho e preserva versões', async () => {
  let c = P.createContent({ client_id: client.id, title: 'Post teste', format: 'carrossel', theme: 'Tema', planned_at: new Date(Date.now() + 20 * 864e5).toISOString() }, user(U.est));
  assert.equal(c.stage, 'cronograma');
  const t1 = open(c)[0];
  assert.equal(t1.assignee_id, U.est.id, 'atribui à estrategista do cliente');
  assert.ok(t1.due_at, 'define prazo');
  P.completeTask(t1.id, user(U.est));
  assert.equal(fresh(c).stage, 'analise_cronograma');
  P.reviewDecision(c.id, user(U.rev), { decision: 'aprovar' }, req);
  assert.equal(fresh(c).stage, 'aprovacao_tema');
  assert.ok(one("SELECT 1 FROM notifications WHERE user_id=? AND type='aprovacao'", cu.id), 'cliente notificado');
  P.clientDecision(c.id, user(cu), { decision: 'aprovar' }, req);
  c = fresh(c);
  assert.equal(c.stage, 'producao');
  const tracks = open(c);
  assert.deepEqual(tracks.map((t) => t.function).sort(), ['copy', 'design'], 'cria trilhas de legenda e design');
  const visual = tracks.find((t) => t.function === 'design');
  assert.throws(() => P.completeTask(visual.id, user(U.des)), /arquivo final/, 'não entrega sem arquivo');
  await addImage(c, user(U.des), '#4A1725');
  P.completeTask(visual.id, user(U.des));
  assert.equal(fresh(c).stage, 'producao', 'aguarda a legenda');
  const legenda = open(c)[0];
  const v1 = P.editableVersion(fresh(c), U.est.id);
  run('UPDATE content_versions SET caption=? WHERE id=?', 'Legenda V1', v1.id);
  P.completeTask(legenda.id, user(U.est));
  assert.equal(fresh(c).stage, 'analise_producao');
  assert.equal(one('SELECT locked FROM content_versions WHERE id=?', v1.id).locked, 1, 'versão enviada à revisão é travada');
  // Revisão pede ajuste → precisa de nova versão
  P.reviewDecision(c.id, user(U.ceo), { decision: 'ajuste', adjustments: [{ description: 'Aumentar contraste', track: 'visual' }] }, req);
  assert.equal(fresh(c).stage, 'ajuste_interno');
  const adj = open(c)[0];
  assert.equal(adj.assignee_id, U.des.id, 'ajuste volta para quem produziu');
  assert.throws(() => P.completeTask(adj.id, user(U.des)), /nova versão/);
  await addImage(c, user(U.des), '#222222');
  P.completeTask(adj.id, user(U.des));
  assert.equal(fresh(c).stage, 'analise_producao', 'ajuste concluído volta para revisão');
  P.reviewDecision(c.id, user(U.rev), { decision: 'aprovar' }, req);
  assert.equal(fresh(c).stage, 'aprovacao_cliente');
  // Cliente pede ajuste → nova versão → conferência → cliente aprova V3
  P.clientDecision(c.id, user(cu), { decision: 'ajuste', note: 'Trocar frase da página 2', carousel_page: 2 }, req);
  assert.equal(fresh(c).stage, 'ajuste_cliente');
  assert.equal(one("SELECT carousel_page FROM adjustments WHERE content_id=? AND origin='cliente'", c.id).carousel_page, 2);
  await addImage(c, user(U.des), '#F6F3F0');
  P.completeTask(open(c)[0].id, user(U.des));
  assert.equal(fresh(c).stage, 'revisao_ajuste');
  P.reviewDecision(c.id, user(U.est), { decision: 'aprovar' }, req);
  c = fresh(c);
  assert.equal(c.stage, 'agendamento', 'regra The Bold: ajuste do cliente conferido vai direto para agendamento');
  const versions = all('SELECT * FROM content_versions WHERE content_id=? ORDER BY number', c.id);
  assert.equal(versions.length, 3, 'V1, V2 e V3 preservadas');
  const released = versions.find((v) => v.id === c.approved_version_id);
  assert.equal(released.number, 3);
  assert.equal(released.status, 'aprovada');
  assert.equal(released.locked, 1);
  const ap = one("SELECT * FROM approvals WHERE content_id=? AND kind='cliente' AND decision='ajuste'", c.id);
  assert.equal(ap.user_id, cu.id); assert.equal(ap.ip, '10.0.0.1'); assert.equal(ap.version_id, versions[1].id, 'pedido de ajuste vinculado à V2');
  assert.throws(() => P.schedule(c.id, user(U.gestao), { at: new Date().toISOString(), mode: 'meta' }), /não está conectado/, 'Meta desconectada não é simulada');
  P.schedule(c.id, user(U.gestao), { at: new Date(Date.now() + 864e5).toISOString(), mode: 'externo' });
  assert.equal(fresh(c).stage, 'agendado');
  P.confirmPublished(c.id, user(U.gestao), {});
  assert.equal(fresh(c).stage, 'publicado');
  assert.ok(all('SELECT 1 FROM automation_runs').length > 5, 'automações registradas');
});

test('tarefa sem responsável quando a função não tem pessoa vinculada', () => {
  const c = P.createContent({ client_id: other.id, title: 'Sem equipe', format: 'estatico', stage: 'producao' }, user(U.ceo));
  const t = open(c);
  assert.ok(t.some((x) => x.assignee_id === null), 'gera tarefa sem responsável (pendência crítica)');
  assert.ok(one("SELECT 1 FROM notifications WHERE type='sem_responsavel'"));
});

test('permissões por cliente, função e módulo — no backend', () => {
  assert.equal(canAccessClient(user(U.des), client.id), true);
  assert.equal(canAccessClient(user(U.out), client.id), false, 'designer não vinculado não vê o cliente');
  assert.equal(canAccessClient(user(cu), other.id), false, 'cliente não vê outro cliente');
  assert.equal(can(user(U.ops), 'pendencias'), true);
  assert.equal(can(user(U.gestao), 'pendencias'), false, 'Centro de Pendências: padrão só CEO e Operações');
  insert('user_permissions', { user_id: U.gestao.id, module: 'pendencias', action: 'view', effect: 'grant' });
  assert.equal(can(user(U.gestao), 'pendencias'), true, 'administração pode liberar a outra pessoa');
  assert.equal(can(user(U.des), 'financeiro'), false);
  const c = P.createContent({ client_id: client.id, title: 'X', format: 'estatico', theme: 't', planned_at: new Date(Date.now() + 9 * 864e5).toISOString() }, user(U.est));
  assert.throws(() => P.reviewDecision(c.id, user(U.des), { decision: 'aprovar' }, req), /aprovação|permissão|Ação inválida/);
  P.completeTask(open(c)[0].id, user(U.est));
  assert.throws(() => P.reviewDecision(c.id, user(U.des), { decision: 'aprovar' }, req), /permissão/, 'designer não aprova revisão');
});

test('histórico é append-only', () => {
  const l = one('SELECT id FROM activity_logs LIMIT 1');
  assert.throws(() => run("UPDATE activity_logs SET summary='x' WHERE id=?", l.id), /append-only/);
  assert.throws(() => run('DELETE FROM activity_logs WHERE id=?', l.id), /append-only/);
});

test('mídia: o original é preservado byte a byte; preview é derivado', async () => {
  const src = path.join(TMP_DIR, 'orig.png');
  await sharp({ create: { width: 4200, height: 5250, channels: 3, background: '#123456' } }).png().toFile(src);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex');
  const f = await ingest(src, { originalName: 'foto.png', mime: 'image/png', clientId: client.id, userId: U.des.id });
  await waitForProcessing();
  assert.equal(f.sha256, hash);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(storage.path(f.storage_key))).digest('hex'), hash, 'arquivo armazenado idêntico');
  assert.equal(f.width, 4200);
  const prev = one("SELECT * FROM file_variants WHERE file_id=? AND variant='preview'", f.id);
  assert.ok(prev && prev.width <= 2560 && prev.width > 0, 'preview otimizado gerado separadamente');
});
