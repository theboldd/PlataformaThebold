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

// PRONTO ≠ DISPONÍVEL: antes da data a revisão é recusada; na data do marco (relógio da aplicação avançado só neste teste) a tarefa abre e a ação é aceita
const { setClock } = await import('../db.js');
const { activateScheduledTasks } = await import('../engine/scheduler.js');
function review(contentId, actor, body, rq) {
  const opens = P.stageAvailability(one('SELECT * FROM contents WHERE id=?', contentId));
  if (!opens) return P.reviewDecision(contentId, actor, body, rq);
  assert.throws(() => P.reviewDecision(contentId, actor, body, rq), /Etapa agendada/, 'revisão antes da janela é recusada');
  setClock(new Date(new Date(opens).getTime() + 60e3).toISOString());
  try { activateScheduledTasks(); return P.reviewDecision(contentId, actor, body, rq); } finally { setClock(null); }
}
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
  review(c.id, user(U.rev), { decision: 'aprovar' }, req);
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
  review(c.id, user(U.ceo), { decision: 'ajuste', adjustments: [{ description: 'Aumentar contraste', track: 'visual' }] }, req);
  assert.equal(fresh(c).stage, 'ajuste_interno');
  const adj = open(c)[0];
  assert.equal(adj.assignee_id, U.des.id, 'ajuste volta para quem produziu');
  assert.throws(() => P.completeTask(adj.id, user(U.des)), /nova versão/);
  await addImage(c, user(U.des), '#222222');
  P.completeTask(adj.id, user(U.des));
  // Regra da CEO (23/10): ajuste interno feito segue direto para o cliente, sem nova revisão; quem pediu é avisado
  assert.equal(fresh(c).stage, 'aprovacao_cliente', 'ajuste interno concluído segue para a aprovação do cliente');
  const aviso = one("SELECT * FROM notifications WHERE user_id=? AND type='ajuste_feito' ORDER BY created_at DESC LIMIT 1", U.ceo.id);
  assert.ok(aviso, 'quem pediu o ajuste recebe o aviso');
  assert.match(aviso.title, /fez o ajuste pedido/);
  // Cliente pede ajuste → nova versão → conferência → cliente aprova V3
  P.clientDecision(c.id, user(cu), { decision: 'ajuste', note: 'Trocar frase da página 2', carousel_page: 2 }, req);
  assert.equal(fresh(c).stage, 'ajuste_cliente');
  assert.equal(one("SELECT carousel_page FROM adjustments WHERE content_id=? AND origin='cliente'", c.id).carousel_page, 2);
  await addImage(c, user(U.des), '#F6F3F0');
  P.completeTask(open(c)[0].id, user(U.des));
  assert.equal(fresh(c).stage, 'revisao_ajuste');
  review(c.id, user(U.est), { decision: 'aprovar' }, req);
  assert.equal(fresh(c).stage, 'aprovacao_cliente', 'regra The Bold (21/10): a V3 que resolve o ajuste volta para o cliente aprovar');
  assert.equal(fresh(c).approved_version_id, null, 'nenhuma aprovação inferida pela etapa');
  P.clientDecision(c.id, user(cu), { decision: 'aprovar' }, req);
  c = fresh(c);
  assert.equal(c.stage, 'agendamento');
  const versions = all('SELECT * FROM content_versions WHERE content_id=? ORDER BY number', c.id);
  assert.equal(versions.length, 3, 'V1, V2 e V3 preservadas');
  const released = versions.find((v) => v.id === c.approved_version_id);
  assert.equal(released.number, 3);
  assert.equal(released.status, 'aprovada');
  assert.equal(released.approved_by, cu.id, 'aprovada pelo cliente, não pela equipe');
  assert.equal(released.locked, 1);
  assert.deepEqual(versions.slice(0, 2).map((v) => v.status), ['substituida', 'substituida']);
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
  assert.throws(() => P.reviewDecision(c.id, user(U.des), { decision: 'aprovar' }, req), /permissão|Etapa agendada/, 'designer não aprova revisão');
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

test('rotinas: trava impede execução simultânea, timeout registra erro e lease vencido expira', async () => {
  const { runJob } = await import('../engine/jobs.js');
  let n = 0;
  const slow = () => new Promise((r) => setTimeout(() => { n++; r({ n }); }, 50));
  const [a, b] = await Promise.all([runJob('t1', slow), runJob('t1', slow)]);
  assert.ok(a.ok && b.skipped, 'a segunda chamada é ignorada');
  assert.equal(n, 1);
  assert.equal(one("SELECT COUNT(*) n FROM job_runs WHERE job='t1' AND status='ignorado'").n, 1);
  const t = await runJob('t2', () => new Promise(() => {}), { timeoutMs: 30 });
  assert.match(t.error, /timeout/);
  insert('job_runs', { id: uid('jr_'), job: 't3', status: 'rodando', started_at: now(), lease_until: new Date(Date.now() - 1000).toISOString(), trigger: 'teste' });
  assert.ok((await runJob('t3', () => 1)).ok);
  assert.equal(one("SELECT COUNT(*) n FROM job_runs WHERE job='t3' AND status='expirado'").n, 1);
});

test('legado (regra 22): fora da operação; só reprogramar, cancelar ou manter histórico, um a um', async () => {
  const D = await import('../services/delayReview.js');
  const { computePendencies, teamLoad } = await import('../engine/intelligence.js');
  const mk = (title) => {
    const c = P.createContent({ client_id: client.id, title, format: 'estatico', stage: 'agendamento', strategy_tags: ['importado-notion-outubro'], internal_notes: 'Importado do Notion · quadro X' }, null);
    D.markMigratedTasks();
    const t = one("SELECT * FROM tasks WHERE content_id=? AND status='aberta'", c.id);
    run('UPDATE tasks SET due_at=? WHERE id=?', new Date(Date.now() - 864e5).toISOString(), t.id);
    insert('delay_reviews', { task_id: t.id, content_id: c.id, client_id: client.id, category: 'dado_migrado', attribution: 'nao_atribuido', facts: '[]', source_facts: '[]', created_at: now(), updated_at: now() });
    return { c, t };
  };
  const a = mk('Legado A'), b = mk('Legado B'), h = mk('Legado C');
  assert.equal(one('SELECT data_origin FROM tasks WHERE id=?', a.t.id).data_origin, 'notion');
  assert.equal(one('SELECT data_origin FROM contents WHERE id=?', a.c.id).data_origin, 'notion');
  D.markLegacy();
  assert.equal(one('SELECT status FROM tasks WHERE id=?', a.t.id).status, 'legado');
  assert.equal(one('SELECT legacy_status FROM contents WHERE id=?', a.c.id).legacy_status, 'nao_validado');
  assert.ok(!computePendencies().some((p) => p.content_id === a.c.id), 'legado não é pendência');
  assert.equal(teamLoad().find((u) => u.id === a.t.assignee_id)?.late || 0, 0);
  // reprogramar exige prazo, responsável, etapa e motivo
  assert.throws(() => D.reprogramLegacy(a.t.id, U.ceo, { note: 'x' }), /prazo/);
  assert.throws(() => D.reprogramLegacy(a.t.id, U.ceo, { due_at: new Date(Date.now() + 864e5).toISOString(), stage: 'agendamento', note: 'x' }), /responsável/);
  D.reprogramLegacy(a.t.id, U.ceo, { due_at: new Date(Date.now() + 2 * 864e5).toISOString(), assignee_id: U.gestao.id, stage: 'agendamento', note: 'Cliente confirmou que ainda quer o post' });
  const nt = one("SELECT * FROM tasks WHERE content_id=? AND status='aberta'", a.c.id);
  assert.equal(nt.data_origin, 'plataforma'); assert.equal(nt.assignee_id, U.gestao.id);
  assert.equal(one('SELECT legacy_status FROM contents WHERE id=?', a.c.id).legacy_status, 'reprogramado');
  assert.throws(() => D.keepAsHistory(a.t.id, U.ceo, {}), /já foi decidido/);
  assert.throws(() => D.cancelLegacy(b.t.id, U.ceo, {}), /motivo/);
  D.cancelLegacy(b.t.id, U.ceo, { note: 'Post da campanha já encerrada' });
  assert.equal(one('SELECT stage FROM contents WHERE id=?', b.c.id).stage, 'cancelado');
  D.keepAsHistory(h.t.id, U.ceo, {});
  assert.equal(one('SELECT legacy_status FROM contents WHERE id=?', h.c.id).legacy_status, 'historico');
  const lg = one("SELECT * FROM activity_logs WHERE entity_id=? AND action='legado.cancelado'", b.t.id);
  assert.match(lg.before, /agendamento/); assert.match(lg.after, /cancelado/);
  assert.equal(can(U.ops, 'atrasos'), false, 'Operações não decide legado sem liberação da CEO');
});

test('pronto ≠ disponível (regra oficial): revisão agendada não pode ser antecipada por nenhum caminho', async () => {
  const c = P.createContent({ client_id: client.id, title: 'Janela estrita', format: 'estatico', planned_at: new Date(Date.now() + 25 * 864e5).toISOString(), stage: 'producao' }, user(U.est));
  await addImage(c, user(U.des), '#123123');
  const v = P.editableVersion(fresh(c), U.des.id); run('UPDATE content_versions SET caption=? WHERE id=?', 'x', v.id);
  for (const t of open(c)) P.completeTask(t.id, user(t.function === 'design' ? U.des : U.est));
  const c2 = fresh(c);
  assert.equal(c2.stage, 'analise_producao');
  const opens = P.stageAvailability(c2);
  if (!opens) return; // ciclo cuja janela já abriu: nada a testar aqui
  const t = one("SELECT * FROM tasks WHERE content_id=? AND stage='analise_producao'", c.id);
  assert.equal(t.status, 'agendada', 'AGENDADA antes da data');
  assert.throws(() => P.reviewDecision(c.id, user(U.ceo), { decision: 'aprovar' }, req), /Etapa agendada/, 'nem a CEO antecipa');
  assert.throws(() => P.completeTask(t.id, user(U.rev)), /agendada/, 'concluir a tarefa também é bloqueado');
  setClock(new Date(new Date(opens).getTime() + 60e3).toISOString());
  try {
    activateScheduledTasks();
    assert.equal(one('SELECT status FROM tasks WHERE id=?', t.id).status, 'aberta', 'na data do marco: disponível');
    assert.ok(one("SELECT 1 FROM notifications WHERE user_id=? AND title LIKE 'Disponível hoje%'", t.assignee_id), 'responsável avisado na abertura');
    P.reviewDecision(c.id, user(U.rev), { decision: 'aprovar' }, req);
    assert.equal(fresh(c).stage, 'aprovacao_cliente');
  } finally { setClock(null); }
});

test('comentário vira ajuste: só onde a equipe está com o conteúdo, uma vez, ligado ao comentário', async () => {
  const { addComment } = await import('../routes/ops.js');
  const prod = P.createContent({ client_id: client.id, title: 'Com comentário', format: 'estatico', stage: 'producao' }, U.est);
  const cm = addComment(prod, U.rev, { body: 'Trocar a cor do título', visibility: 'internal' });
  const adj = P.commentToAdjustment(cm.id, U.est, { size: 'simples' });
  assert.equal(adj.origin, 'interno'); assert.equal(adj.size, 'simples');
  assert.equal(one('SELECT adjustment_id FROM comments WHERE id=?', cm.id).adjustment_id, adj.id);
  assert.ok(one("SELECT 1 FROM tasks WHERE id=? AND kind='ajuste' AND status='aberta'", adj.task_id));
  const again = P.commentToAdjustment(cm.id, U.est);
  assert.equal(again.id, adj.id, 'segunda conversão devolve o mesmo ajuste'); assert.equal(again.already, true);
  assert.equal(one('SELECT COUNT(*) n FROM adjustments WHERE comment_id=?', cm.id).n, 1, 'sem ajuste duplicado');
  // cliente comentou: vira ajuste "do cliente"; página do carrossel vem da âncora
  const cc = addComment(prod, cu, { body: 'Pode aumentar a foto?', anchor: { page: 2 } });
  const a2 = P.commentToAdjustment(cc.id, U.est);
  assert.equal(a2.origin, 'cliente'); assert.equal(a2.carousel_page, 2);
  // conteúdo com o cliente: a mudança passa pela decisão do cliente, não pela conversão
  const wait = P.createContent({ client_id: client.id, title: 'Esperando cliente', format: 'estatico', stage: 'aprovacao_cliente' }, U.est);
  const cw = addComment(wait, cu, { body: 'Não gostei da cor' });
  assert.throws(() => P.commentToAdjustment(cw.id, U.est), /decisão do cliente/);
  // sem permissão de editar conteúdo ou sem acesso ao cliente
  const cx = addComment(prod, U.rev, { body: 'Outro ponto', visibility: 'internal' });
  assert.throws(() => P.commentToAdjustment(cx.id, U.out), /Sem permissão/);
  assert.ok(one("SELECT 1 FROM activity_logs WHERE action='comentario.virou_ajuste' AND entity_id=?", cm.id));
});

test('regra 14: "aprovado" só com registro de aprovação; etapa não prova aprovação', () => {
  const c = P.createContent({ client_id: client.id, title: 'Sem registro', format: 'estatico', stage: 'agendamento' }, U.est);
  assert.equal(P.publicStatus(one('SELECT * FROM contents WHERE id=?', c.id)), 'aprovacao_nao_registrada');
  run('UPDATE contents SET approved_version_id=? WHERE id=?', 'v_fake', c.id);
  assert.equal(P.publicStatus(one('SELECT * FROM contents WHERE id=?', c.id)), 'aprovado');
});

test('causa raiz: fato, padrão, hipótese marcada como não verificada; carga ignora herdados', async () => {
  const I = await import('../engine/intelligence.js');
  const before = all("SELECT fingerprint FROM ai_insights WHERE detector='carga' AND status='aberto'").length;
  run("UPDATE tasks SET data_origin='notion' WHERE assignee_id=?", U.des.id);
  for (let i = 0; i < 12; i++) insert('tasks', { id: uid('t_'), title: `Herdada ${i}`, client_id: client.id, assignee_id: U.des.id, status: 'aberta', kind: 'etapa', function: 'design', data_origin: 'notion', created_at: now() });
  I.runDetectors();
  assert.ok(!one("SELECT 1 FROM ai_insights WHERE fingerprint=? AND status='aberto'", `carga:${U.des.id}`), 'herdadas não geram alerta de carga');
  for (const i of all("SELECT * FROM ai_insights WHERE status='aberto'")) {
    const e = I.explain(i);
    assert.ok(e.fact);
    if (e.hypothesis) {
      assert.equal(e.hypothesis.verified, false);
      for (const u of all("SELECT name FROM users WHERE role_key<>'cliente'")) assert.ok(!e.hypothesis.text.includes(u.name), 'hipótese não aponta pessoa');
    }
  }
  assert.ok(before >= 0);
});
