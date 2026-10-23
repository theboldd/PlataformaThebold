// Testes da ÁREA DO CLIENTE pelo HTTP real (servidor Express, login, cookie de sessão, CSRF), em banco e storage temporários.
// Valida a regra central: AÇÃO DO CLIENTE → REGISTRO → PROCESSO → RESPONSÁVEL → PRÓXIMO PASSO → NOTIFICAÇÃO → HISTÓRICO,
// e que as permissões são aplicadas no backend (não só escondidas na interface).
// Os registros abaixo existem só neste banco temporário de teste e são apagados ao final; nunca tocam a base real.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bold-portal-'));
process.env.BOLD_DATA_DIR = TMP;
process.env.BOLD_STORAGE_DIR = TMP;
process.env.BOLD_DB_PATH = path.join(TMP, 'test.db');

const { one, all, insert, uid, now, run } = await import('../db.js');
const { createApp } = await import('../index.js');
const P = await import('../engine/process.js');
const { startClient } = await import('../routes/ops.js');
const { hashPassword } = await import('../lib/auth.js');
const { ingest, TMP_DIR } = await import('../services/media.js');
const { tick } = await import('../engine/scheduler.js');
const { clientHealth } = await import('../services/health.js');
const sharp = (await import('sharp')).default;

const app = createApp();
const server = app.listen(0);
const BASE = `http://127.0.0.1:${server.address().port}/api`;
after(() => { server.close(); fs.rmSync(TMP, { recursive: true, force: true }); });

const PW = 'senha-de-teste-123';
const mkUser = (key, role, fns = []) => insert('users', { id: uid('u_'), name: key[0].toUpperCase() + key.slice(1), email: `${key}@t.test`, password_hash: hashPassword(PW), role_key: role, functions: JSON.stringify(fns), active: 1, capacity: 10, created_at: now() });
const U = { ceo: mkUser('rebeca', 'ceo'), ops: mkUser('vitoria', 'operacoes'), rev: mkUser('raisa', 'qualidade'), est: mkUser('juliane', 'estrategia'), des: mkUser('felipe', 'design'), copy: mkUser('carla', 'copy'), gestao: mkUser('vivian', 'gestao'), com: mkUser('matheus', 'comercial'), fora: mkUser('outro', 'design') };
const team = [{ user_id: U.est.id, function: 'estrategia' }, { user_id: U.copy.id, function: 'copy' }, { user_id: U.des.id, function: 'design' }, { user_id: U.gestao.id, function: 'agendamento' }, { user_id: U.gestao.id, function: 'atendimento' }, { user_id: U.rev.id, function: 'revisao' }];
const A = startClient({ name: 'Cliente A', services: [], monthly_posts: 4, requires_theme_approval: true, team }, U.ceo);
const B = startClient({ name: 'Cliente B', services: [], monthly_posts: 4, requires_theme_approval: true, team }, U.ceo);
const ca = mkUser('ana', 'cliente'); insert('client_members', { client_id: A.id, user_id: ca.id, function: 'cliente' });
const cb = mkUser('bia', 'cliente'); insert('client_members', { client_id: B.id, user_id: cb.id, function: 'cliente' });
const user = (u) => one('SELECT * FROM users WHERE id=?', u.id);
const fresh = (c) => one('SELECT * FROM contents WHERE id=?', c.id);
const req = { ip: '10.0.0.9', headers: { 'user-agent': 'test' } };

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

// ── cliente HTTP com sessão ──
async function login(u) {
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bold-request': '1' }, body: JSON.stringify({ email: u.email, password: PW }) });
  assert.equal(r.status, 200, `login de ${u.email}`);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const call = async (method, url, body, form) => {
    const headers = { cookie, 'x-bold-request': '1' };
    if (body !== undefined && !form) headers['content-type'] = 'application/json';
    const res = await fetch(`${BASE}${url}`, { method, headers, body: form ? body : body !== undefined ? JSON.stringify(body) : undefined });
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data };
  };
  return { get: (u2) => call('GET', u2), post: (u2, b = {}) => call('POST', u2, b), put: (u2, b) => call('PUT', u2, b), patch: (u2, b) => call('PATCH', u2, b), del: (u2) => call('DELETE', u2), form: (u2, fd) => call('POST', u2, fd, true) };
}

async function image(clientId, by, color) {
  const src = path.join(TMP_DIR, `src-${crypto.randomUUID()}.jpg`);
  await sharp({ create: { width: 1080, height: 1350, channels: 3, background: color } }).jpeg({ quality: 90 }).toFile(src);
  return ingest(src, { originalName: 'arte.jpg', mime: 'image/jpeg', clientId, userId: by.id });
}
// Produção real até "aguardando cliente": trilhas entregues → revisão interna aprova → engine envia ao cliente
async function toClientApproval(client, title, days = 12) {
  const c = P.createContent({ client_id: client.id, title, format: 'estatico', theme: 'Tema', planned_at: new Date(Date.now() + days * 864e5).toISOString(), stage: 'producao' }, user(U.est));
  const f = await image(client.id, U.des, '#4A1725');
  const v = P.editableVersion(fresh(c), U.des.id);
  insert('version_media', { version_id: v.id, file_id: f.id, position: 0 });
  run('UPDATE content_versions SET caption=? WHERE id=?', `Legenda de ${title}`, v.id);
  for (const t of all("SELECT * FROM tasks WHERE content_id=? AND status='aberta' AND kind='etapa'", c.id)) P.completeTask(t.id, user(t.function === 'design' ? U.des : U.copy));
  review(c.id, user(U.rev), { decision: 'aprovar' }, req);
  assert.equal(fresh(c).stage, 'aprovacao_cliente');
  return fresh(c);
}

test('home "Meu momento Bold": jornada, o que precisa do cliente (com prazo real) e o que a The Bold está fazendo — sem nada interno', async () => {
  const c1 = await toClientApproval(A, 'Post de novembro');
  P.createContent({ client_id: A.id, title: 'Em produção', format: 'estatico', planned_at: new Date(Date.now() + 20 * 864e5).toISOString(), stage: 'producao' }, user(U.est));
  const s = await login(ca);
  const h = await s.get('/portal/home');
  assert.equal(h.status, 200);
  assert.equal(h.data.journey.steps.length, 6, 'Planejamento · Produção · Revisão · Aprovação · Agendamento · Publicação');
  assert.equal(h.data.journey.steps[3].state, 'you', 'aprovação marcada como "aguardando você"');
  const act = h.data.actions.find((a) => a.kind === 'aprovacao');
  assert.ok(act && act.ids.includes(c1.id), 'aprovação aparece em "Precisamos de você"');
  assert.ok(act.due_at, 'prazo vem da tarefa real do engine');
  assert.match(act.consequence, /Para manter a publicação prevista para \d\d\/\d\d/);
  assert.ok(h.data.doing.some((d) => d.label === 'Produção dos conteúdos'));
  const text = JSON.stringify(h.data);
  for (const name of ['Juliane', 'Felipe', 'Raísa', 'Raisa', 'Carla', 'Vivian']) assert.ok(!text.includes(name), `nome interno (${name}) não aparece na home`);
  assert.ok(!/prioridade|bloque|sem respons/i.test(JSON.stringify(h.data.doing)), 'sem prioridades/bloqueios internos');
});

test('♡ aprovação: exige confirmação, vale para a versão exata, congela, avança o engine, cria a próxima etapa com responsável, notifica e registra', async () => {
  const c = await toClientApproval(A, 'Aprovar este');
  const s = await login(ca);
  assert.equal((await s.post(`/portal/contents/${c.id}/like`, {})).status, 428, 'sem confirmação não aprova');
  assert.equal(fresh(c).stage, 'aprovacao_cliente');
  assert.equal((await s.post(`/portal/contents/${c.id}/approve`, { confirm: true, version: 99 })).status, 409, 'versão diferente da atual não é aprovada');
  const r = await s.post(`/portal/contents/${c.id}/approve`, { confirm: true, version: 1 });
  assert.equal(r.status, 200);
  const after = fresh(c);
  assert.equal(after.stage, 'agendamento', 'processo avançou');
  const v = one('SELECT * FROM content_versions WHERE id=?', after.approved_version_id);
  assert.equal(v.number, 1); assert.equal(v.status, 'aprovada'); assert.equal(v.locked, 1); assert.equal(v.approved_by, ca.id, `aprovada por ${one('SELECT email FROM users WHERE id=?', v.approved_by)?.email}`);
  const ap = one("SELECT * FROM approvals WHERE content_id=? AND decision='aprovado' AND kind='cliente'", c.id);
  assert.equal(ap.version_id, v.id, 'aprovação ligada à versão'); assert.equal(ap.user_id, ca.id); assert.ok(ap.ip && ap.created_at);
  const next = one("SELECT * FROM tasks WHERE content_id=? AND kind='agendamento' AND status='aberta'", c.id);
  assert.ok(next && next.assignee_id === U.gestao.id, 'próxima etapa criada com responsável (agendamento)');
  assert.ok(one("SELECT 1 FROM notifications WHERE user_id=? AND type='aprovacao_cliente'", U.est.id), 'estrategista notificada');
  assert.ok(one("SELECT 1 FROM activity_logs WHERE content_id=? AND action='cliente.aprovou' AND visibility='client'", c.id), 'histórico do cliente');
  assert.ok(r.data.liked && r.data.versions[0].state === 'aprovada');
});

test('✎ ajuste estruturado após aprovação: registra tipo, local e região na versão; responsável pela trilha; nova versão substitui a aprovada', async () => {
  const c = await toClientApproval(A, 'Ajustar depois');
  const s = await login(ca);
  await s.post(`/portal/contents/${c.id}/approve`, { confirm: true, version: 1 });
  const fd = new FormData();
  fd.append('note', 'trocar a frase da legenda'); fd.append('aspect', 'legenda'); fd.append('region', JSON.stringify({ x: 0.31, y: 0.62 })); fd.append('version', '1');
  const r = await s.form(`/portal/contents/${c.id}/adjust`, fd);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const adj = one("SELECT * FROM adjustments WHERE content_id=? AND origin='cliente'", c.id);
  assert.equal(adj.aspect, 'legenda');
  assert.deepEqual(JSON.parse(adj.region), { x: 0.31, y: 0.62 });
  assert.equal(adj.version_id, one('SELECT id FROM content_versions WHERE content_id=? AND number=1', c.id).id, 'ajuste ligado à V1');
  assert.equal(adj.assigned_to, U.copy.id, 'legenda → copy (definido pelo sistema)');
  assert.ok(adj.due_at, 'prazo definido');
  assert.equal(adj.reapproval, 1, 'ajuste após aprovação volta para o cliente aprovar');
  assert.equal(fresh(c).stage, 'ajuste_cliente');
  assert.equal(fresh(c).approved_version_id, null, 'aprovação antiga deixa de valer');
  // Copy entrega a V2 → a V1 é SUBSTITUÍDA (nunca continua "aprovada")
  const v2 = P.editableVersion(fresh(c), U.copy.id);
  run('UPDATE content_versions SET caption=? WHERE id=?', 'Legenda nova', v2.id);
  assert.equal(one('SELECT status FROM content_versions WHERE content_id=? AND number=1', c.id).status, 'substituida');
  assert.match(one('SELECT notes FROM content_versions WHERE id=?', v2.id).notes, /Ajustes solicitados em/);
  P.completeTask(adj.task_id, user(U.copy));
  // Regra da CEO (23/10): ajuste do cliente feito segue para publicar; a V2 fica LIBERADA PELA EQUIPE (não é aprovação do cliente)
  assert.equal(fresh(c).stage, 'agendamento', 'ajuste do cliente feito → liberado para publicação');
  assert.equal(one('SELECT status FROM content_versions WHERE content_id=? AND number=2', c.id).status, 'liberada');
  assert.ok(one("SELECT 1 FROM notifications WHERE type='ajuste_feito' AND content_id=?", c.id), 'Rebeca/Vitória/Vivian sabem que o ajuste foi feito');
  const item = (await s.get(`/portal/contents/${c.id}`)).data;
  assert.equal(item.version.number, 2);
  assert.deepEqual(item.versions.map((v) => [v.number, v.state]), [[2, 'liberada'], [1, 'substituida']]);
  assert.equal(item.adjustments[0].resolved_in, 2, 'ajuste feito na V2');
  assert.ok(item.adjustments[0].region, 'região volta para desenhar o pino');
});

test('💬 pergunta ≠ aprovação: vira pendência da estrategista e sai quando a equipe responde', async () => {
  const c = await toClientApproval(A, 'Com dúvida');
  const s = await login(ca);
  const fd = new FormData(); fd.append('body', 'Essa foto é do evento de março?'); fd.append('intent', 'pergunta');
  const r = await s.form(`/portal/contents/${c.id}/comments`, fd);
  assert.equal(r.data.action.type, 'pergunta');
  assert.equal(fresh(c).stage, 'aprovacao_cliente', 'comentar/perguntar não aprova nem muda etapa');
  const cm = one("SELECT * FROM comments WHERE content_id=? AND kind='pergunta'", c.id);
  const task = one("SELECT * FROM tasks WHERE source_type='comment' AND source_id=?", cm.id);
  assert.equal(task.status, 'aberta'); assert.equal(task.assignee_id, U.est.id);
  const t = await login(U.est);
  await t.post(`/contents/${c.id}/comments`, { body: 'Sim, é do evento de março.', parent_id: cm.id });
  assert.equal(one('SELECT status FROM tasks WHERE id=?', task.id).status, 'concluida', 'pendência retirada');
  assert.ok(one("SELECT 1 FROM notifications WHERE user_id=? AND type='resposta' AND cta IS NOT NULL", ca.id), 'cliente avisado com CTA');
});

test('solicitação: cria registro + tarefa + responsável por tipo; status simples; nota interna nunca chega ao cliente', async () => {
  const s = await login(ca);
  const fd = new FormData(); fd.append('kind', 'conteudo'); fd.append('title', 'Post do Dia das Crianças'); fd.append('description', 'Queremos um post especial.');
  const r = await s.form('/portal/requests', fd);
  assert.equal(r.status, 200); assert.equal(r.data.status, 'recebido'); assert.ok(r.data.expected_at);
  const rq = one('SELECT * FROM client_requests WHERE id=?', r.data.id);
  assert.equal(rq.assigned_to, U.est.id, 'conteúdo → estratégia');
  assert.equal(one('SELECT assignee_id FROM tasks WHERE id=?', rq.task_id).assignee_id, U.est.id);
  assert.ok(one("SELECT 1 FROM notifications WHERE user_id=? AND type='solicitacao'", U.est.id));
  const fin = new FormData(); fin.append('kind', 'financeiro'); fin.append('description', 'Preciso da nota fiscal de outubro');
  assert.equal(one('SELECT assigned_to FROM client_requests WHERE id=?', (await s.form('/portal/requests', fin)).data.id).assigned_to, U.com.id, 'financeiro → comercial');
  const t = await login(U.est);
  const up = await t.patch(`/requests/${rq.id}`, { status: 'aguardando_cliente', next_action: 'Envie as fotos das crianças', internal_note: 'cliente costuma atrasar fotos' });
  assert.equal(up.status, 200);
  assert.ok(one("SELECT 1 FROM notifications WHERE user_id=? AND type='solicitacao' AND cta='Responder'", ca.id));
  const mine = (await s.get('/portal/requests')).data.items.find((x) => x.id === rq.id);
  assert.equal(mine.status_label, 'Aguardando você');
  assert.ok(!JSON.stringify(mine).includes('costuma atrasar'), 'nota interna não vaza');
  assert.ok((await s.get('/portal/home')).data.actions.some((a) => a.kind === 'solicitacao'), 'entra em "Você precisa fazer"');
  await s.form(`/portal/requests/${rq.id}/reply`, (() => { const f = new FormData(); f.append('body', 'Enviei por aqui.'); return f; })());
  assert.equal(one('SELECT status FROM client_requests WHERE id=?', rq.id).status, 'em_andamento', 'resposta do cliente devolve à equipe');
});

test('central de decisões: equipe pede, cliente decide → registro, Client Brain (origem DECISÃO), memória, tarefa de sequência e histórico', async () => {
  const t = await login(U.est);
  const d = await t.post(`/clients/${A.id}/decisions`, { kind: 'escolha', title: 'Qual capa para o carrossel?', context: 'Duas opções', consequence: 'Com a escolha, seguimos para a produção.', options: ['Capa clara', 'Capa escura'], brain_section: 'preferencias' });
  assert.equal(d.status, 200);
  const s = await login(ca);
  assert.equal((await s.post(`/portal/decisions/${d.data.id}/answer`, { answer: 'Capa roxa' })).status, 422, 'só opções válidas');
  const r = await s.post(`/portal/decisions/${d.data.id}/answer`, { answer: 'Capa escura' });
  assert.equal(r.data.status, 'respondida');
  const be = one("SELECT * FROM client_brain_entries WHERE client_id=? AND source_ref=?", A.id, `decisao:${d.data.id}`);
  assert.equal(be.origin, 'decisao'); assert.equal(be.content, 'Capa escura');
  assert.ok(one("SELECT 1 FROM client_memories WHERE source_type='client_decision' AND source_id=?", d.data.id));
  assert.ok(one("SELECT 1 FROM tasks WHERE source_type='client_decision' AND source_id=? AND assignee_id=?", d.data.id, U.est.id));
  assert.ok((await s.get('/portal/history')).data.some((h) => /Decisão registrada/.test(h.text) && h.link?.includes(d.data.id)), 'histórico abre o registro');
  const sb = await login(cb);
  assert.equal((await sb.post(`/portal/decisions/${d.data.id}/answer`, { answer: 'Capa clara' })).status, 404, 'outro cliente não responde');
});

test('"Sua marca": só o que a equipe compartilhou; observação interna nunca; atualização do cliente não sobrescreve e gera avaliação', async () => {
  const pos = insert('client_brain_entries', { id: uid('be_'), client_id: A.id, section: 'posicionamento', label: 'Posicionamento', content: 'Advocacia premium para famílias', origin: 'equipe', source_type: 'plataforma', created_at: now() });
  const obs = insert('client_brain_entries', { id: uid('be_'), client_id: A.id, section: 'observacoes', label: 'Interno', content: 'Cliente sensível a preço', origin: 'observacao_interna', source_type: 'plataforma', created_at: now() });
  const t = await login(U.est);
  assert.equal((await t.patch(`/clients/${A.id}/brain-entries/${obs.id}/share`, { shared: true })).status, 422, 'observação interna não pode ser compartilhada');
  assert.equal((await t.patch(`/clients/${A.id}/brain-entries/${pos.id}/share`, { shared: true })).status, 200);
  const s = await login(ca);
  const b = (await s.get('/portal/brand')).data;
  assert.ok(JSON.stringify(b).includes('Advocacia premium'));
  assert.ok(!JSON.stringify(b).includes('sensível a preço'));
  await s.post(`/portal/brand/${pos.id}/confirm`, { decision: 'atualizar', note: 'Agora atendemos empresas também' });
  assert.equal(one('SELECT content FROM client_brain_entries WHERE id=?', pos.id).content, 'Advocacia premium para famílias', 'não sobrescreve em silêncio');
  assert.ok(one("SELECT 1 FROM client_brain_entries WHERE client_id=? AND origin='cliente' AND content LIKE 'Agora atendemos%'", A.id), 'mudança registrada com origem CLIENTE');
  assert.ok(one("SELECT 1 FROM tasks WHERE source_type='brand_entry' AND source_id=?", pos.id), 'avaliação de impacto criada');
  await t.patch(`/clients/${A.id}/brain-entries/${pos.id}`, { content: 'Advocacia premium para famílias e empresas' });
  const hist = one('SELECT * FROM client_brain_history WHERE entry_id=?', pos.id);
  assert.equal(hist.content_before, 'Advocacia premium para famílias', 'valor anterior preservado');
  // Pulso só aparece publicado e com dados reais
  assert.equal((await s.get('/portal/brand')).data.pulse, null);
  await t.put(`/clients/${A.id}/pulse`, { focus: 'Autoridade', publish: true });
  assert.equal((await s.get('/portal/brand')).data.pulse.focus, 'Autoridade');
});

test('materiais nunca ficam soltos: envio exige contexto; "outro" vira solicitação; pedido de material é retirado', async () => {
  const s = await login(ca);
  const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#000' } }).png().toBuffer();
  const mk = (ctx) => { const f = new FormData(); f.append('files', new Blob([png], { type: 'image/png' }), 'foto.png'); if (ctx) f.append('context', ctx); return f; };
  assert.equal((await s.form('/portal/materials', mk(null))).status, 422);
  const before = one('SELECT COUNT(*) n FROM client_requests WHERE client_id=?', A.id).n;
  assert.equal((await s.form('/portal/materials', mk('novo'))).status, 200);
  assert.equal(one('SELECT COUNT(*) n FROM client_requests WHERE client_id=?', A.id).n, before + 1, 'material avulso vira solicitação');
  const c = P.createContent({ client_id: A.id, title: 'Precisa de foto', format: 'estatico', planned_at: new Date(Date.now() + 15 * 864e5).toISOString(), stage: 'producao' }, user(U.est));
  P.blockContent(c.id, 'Fotos da equipe', 'cliente', user(U.est));
  assert.ok((await s.get('/portal/home')).data.actions.some((a) => a.kind === 'material' && a.ref?.id === c.id));
  assert.equal((await s.form('/portal/materials', mk(`conteudo:${c.id}`))).status, 200);
  assert.equal(fresh(c).blocked, 0, 'pendência retirada');
  const f = one("SELECT * FROM files WHERE context_type='conteudo' AND context_id=?", c.id);
  assert.equal(f.uploaded_by, ca.id);
  const sb = await login(cb);
  assert.equal((await sb.form('/portal/materials', mk(`conteudo:${c.id}`))).status, 404, 'outro cliente não envia para este conteúdo');
});

test('pós-reunião: resumo do cliente só publica sem vazamento; interno vira registros; cliente nunca vê o interno', async () => {
  const m = insert('meetings', { id: uid('mt_'), client_id: A.id, title: 'Reunião mensal', kind: 'mensal', starts_at: new Date(Date.now() - 2 * 3600e3).toISOString(), ends_at: new Date(Date.now() - 3600e3).toISOString(), status: 'agendada', summary: 'ATA INTERNA: cliente reclamou do preço', created_at: now() });
  insert('meeting_attendees', { meeting_id: m.id, user_id: U.est.id }); insert('meeting_attendees', { meeting_id: m.id, user_id: ca.id });
  const t = await login(U.est);
  assert.equal((await t.post(`/meetings/${m.id}/transcript`, { body: 'Transcrição: decidimos focar em autoridade no próximo mês; a equipe vai enviar o cronograma até sexta.' })).status, 200);
  const g = await t.post(`/meetings/${m.id}/summaries/generate`);
  assert.equal(g.data.status, 'nao_configurado', 'sem chave da IA nada é simulado');
  await t.put(`/meetings/${m.id}/summaries/internal`, { content: { decisions: ['Focar em autoridade'], tasks: [{ what: 'Enviar cronograma', owner_hint: 'Juliane', due: 'sexta' }], risks: ['cliente insatisfeito com o valor do contrato'] } });
  await t.put(`/meetings/${m.id}/summaries/client`, { content: { decisions: ['Focar em autoridade'], next_steps: [{ what: 'Enviar cronograma', who: 'The Bold', when: 'sexta' }], info: ['Nota: cliente insatisfeito com o valor do contrato'] } });
  const bad = await t.post(`/meetings/${m.id}/summaries/client/publish`);
  assert.equal(bad.status, 409, 'trecho do resumo interno bloqueia a publicação');
  await t.put(`/meetings/${m.id}/summaries/client`, { content: { decisions: ['Focar em autoridade'], next_steps: [{ what: 'Enviar cronograma', who: 'The Bold', when: 'sexta' }], info: [] } });
  assert.equal((await t.post(`/meetings/${m.id}/summaries/client/publish`)).status, 200);
  const ap = await t.post(`/meetings/${m.id}/summaries/internal/apply`, { items: [{ kind: 'acao', body: 'Enviar cronograma', owner_id: U.est.id }, { kind: 'decisao', body: 'Focar em autoridade' }] });
  assert.equal(ap.data.created, 2);
  assert.ok(one("SELECT 1 FROM tasks WHERE source_type='meeting' AND source_id=? AND assignee_id=?", m.id, U.est.id), 'tarefa com responsável');
  assert.ok(one("SELECT 1 FROM client_memories WHERE source_type='meeting' AND source_id=?", m.id), 'decisão na memória do cliente');
  const s = await login(ca);
  const meet = (await s.get('/portal/meetings')).data.meetings.find((x) => x.id === m.id);
  assert.deepEqual(meet.summary.decisions, ['Focar em autoridade']);
  const txt = JSON.stringify(meet);
  assert.ok(!txt.includes('ATA INTERNA') && !txt.includes('insatisfeito'), 'ata e resumo interno nunca chegam ao cliente');
  assert.ok(one("SELECT 1 FROM notifications WHERE user_id=? AND type='reuniao' AND cta='Ver resumo'", ca.id));
  assert.equal((await s.get(`/meetings/${m.id}/post`)).status, 403, 'cliente não acessa a área interna da reunião');
});

test('permissões no backend: cliente não alcança outro cliente nem dados internos', async () => {
  const cB = await toClientApproval(B, 'Conteúdo do B');
  const s = await login(ca);
  assert.equal((await s.get(`/portal/contents/${cB.id}`)).status, 404);
  assert.equal((await s.post(`/portal/contents/${cB.id}/approve`, { confirm: true })).status, 404);
  assert.equal((await s.get(`/portal/home?client_id=${B.id}`)).status, 403);
  for (const url of [`/clients/${A.id}`, `/clients/${A.id}/health`, `/clients/${A.id}/requests`, '/client-health', `/clients/${A.id}/ficha`, '/requests']) { const r = await s.get(url); assert.equal(r.status, 403, `${url} é interno: ${JSON.stringify(r.data).slice(0, 200)}`); }
  const out = await login(U.fora);
  assert.equal((await out.get(`/clients/${A.id}/health`)).status, 403, 'designer não vinculado não vê a saúde do cliente');
  const ids = all('SELECT DISTINCT type FROM notifications WHERE user_id=?', ca.id).map((r) => r.type);
  for (const tp of ids) assert.ok(!['tarefa', 'sem_responsavel', 'atraso', 'escalada', 'revisao', 'saude', 'parado', 'cliente_atraso', 'financeiro', 'comentario_cliente'].includes(tp), `cliente não recebe notificação interna (${tp})`);
  const hist = (await s.get('/portal/history?limit=200')).data;
  assert.ok(hist.every((h) => h.action !== 'versao.criada'), 'rascunhos internos fora do histórico do cliente');
  assert.ok(!JSON.stringify(hist).includes('Conteúdo do B'), 'histórico só do próprio cliente');
});

test('cliente não respondeu: atraso registrado, lembrete sem excesso, atendimento avisado, impacto avaliado', async () => {
  const c = await toClientApproval(A, 'Sem resposta', 1.5);
  run("UPDATE tasks SET due_at=? WHERE content_id=? AND kind='aprovacao'", new Date(Date.now() - 3600e3).toISOString(), c.id);
  run("DELETE FROM automation_runs WHERE automation_key IN ('cliente.sem_resposta_24h','cliente.prazo_vencido')");
  tick();
  const log = one("SELECT * FROM activity_logs WHERE action='cliente.prazo_vencido' AND content_id=?", c.id);
  assert.ok(log && log.visibility === 'internal' && /data editorial/.test(log.summary) && !/risco/.test(log.summary), 'atraso registrado, só interno; data de publicação só como referência');
  assert.ok(one("SELECT 1 FROM notifications WHERE user_id=? AND type='cliente_atraso'", U.gestao.id), 'atendimento avisado');
  assert.ok(!one("SELECT 1 FROM notifications WHERE title LIKE '%publicação em risco%'"), 'data de publicação não gera escalada (publicação manual, fora da plataforma)');
  const reminders = () => one("SELECT COUNT(*) n FROM automation_runs WHERE automation_key='cliente.prazo_vencido' AND client_id=? AND status='ok'", A.id).n;
  assert.equal(reminders(), 1, 'um lembrete');
  run("UPDATE tasks SET due_at=? WHERE content_id=? AND kind='aprovacao'", new Date(Date.now() - 1800e3).toISOString(), c.id);
  tick();
  assert.equal(reminders(), 1, 'dentro do intervalo configurado não há novo lembrete');
  const n = one("SELECT body FROM notifications WHERE user_id=? AND type='lembrete'", ca.id);
  assert.ok(!/atrasad/i.test(n.body), 'linguagem nunca acusatória');
});

test('saúde do cliente traz evidências e onboarding mostra % sem contar acessos', async () => {
  const h = clientHealth(A.id);
  assert.ok(['estavel', 'atencao', 'risco', 'sem_dados'].includes(h.level));
  assert.ok(h.signals.every((x) => x.evidence.length > 0), 'todo sinal tem evidência');
  const s = await login(ca);
  const f = (await s.get('/portal/onboarding/form')).data;
  assert.ok(f.profile.total > 0 && f.profile.total < f.total, 'acessos fora do percentual');
  const key = f.missing_keys[0];
  await s.put(`/portal/onboarding/answers/${key}`, { value: 'Resposta real' });
  const g = (await s.get('/portal/onboarding/form')).data;
  assert.equal(g.profile.missing, f.profile.missing - 1);
  assert.ok(one("SELECT 1 FROM activity_logs WHERE action='onboarding.resposta' AND client_id=?", A.id));
});

// Regras 22–24: legado e dado migrado fora de TODAS as superfícies operacionais — por filtro estrutural, não por etapa
test('legado/migrado fora do portal, do ciclo atual, do relatório e dos lembretes; plataforma segue normal', async () => {
  const { liveCycle, journey } = await import('../services/client-view.js');
  const { generateReport } = await import('../services/reports.js');
  const C = startClient({ name: 'Cliente C', services: [], monthly_posts: 4, requires_theme_approval: true, team }, U.ceo);
  const cc = mkUser('caio', 'cliente'); insert('client_members', { client_id: C.id, user_id: cc.id, function: 'cliente' });
  const month = (d) => new Date(Date.now() + d * 864e5).toISOString();
  // plataforma: aguardando o cliente; legado: mesmo tipo de etapa (simula "a etapa mudou"); migrado não legado: em produção, outro mês
  const plat = P.createContent({ client_id: C.id, title: 'PLAT conteúdo', format: 'estatico', theme: 'T', planned_at: month(40), stage: 'aprovacao_cliente' }, user(U.est));
  const leg = P.createContent({ client_id: C.id, title: 'LEGADO conteúdo', format: 'estatico', theme: 'T', planned_at: month(100), stage: 'aprovacao_cliente' }, user(U.est));
  const mig = P.createContent({ client_id: C.id, title: 'MIGRADO conteúdo', format: 'estatico', theme: 'T', planned_at: month(160), stage: 'producao' }, user(U.est));
  run("UPDATE contents SET data_origin='notion', legacy_status='nao_validado' WHERE id=?", leg.id);
  run("UPDATE tasks SET data_origin='notion' WHERE content_id=?", leg.id);
  run("UPDATE contents SET data_origin='notion' WHERE id=?", mig.id);
  run("UPDATE tasks SET data_origin='notion' WHERE content_id=?", mig.id);
  const cyc = (c) => one('SELECT cycle_id FROM contents WHERE id=?', c.id).cycle_id;
  const s = await login(user(cc));

  // 1. Seletores do portal: materiais, conversa e meses do feed
  const mat = (await s.get('/portal/materials')).data.open_contents.map((x) => x.id);
  assert.ok(mat.includes(plat.id)); assert.ok(!mat.includes(leg.id), 'legado fora do seletor de materiais/solicitação');
  const ch = (await s.get('/portal/channel')).data.contents.map((x) => x.id);
  assert.ok(!ch.includes(leg.id), 'legado fora do seletor da conversa');
  const feed = (await s.get('/portal/feed')).data;
  assert.ok(!feed.items.some((x) => x.id === leg.id), 'legado fora do feed');
  assert.ok(!feed.months.includes(one('SELECT substr(planned_at,1,7) m FROM contents WHERE id=?', leg.id).m), 'mês só do legado não aparece');
  assert.equal(feed.items.find((x) => x.id === plat.id)?.can_request, true, `feed: ${JSON.stringify(feed.items.map((x) => [x.title, x.can_request]))}`);
  assert.ok(!(await s.get('/portal/pendencias')).data.approvals.some((x) => x.id === leg.id), 'legado em etapa de aprovação não vira pendência do cliente');

  // 2. Solicitação: só conteúdo operacional da plataforma
  const req2 = async (ref) => { const fd = new FormData(); fd.append('kind', 'conteudo'); fd.append('description', 'Teste de vínculo'); fd.append('ref_type', 'conteudo'); fd.append('ref_id', ref); return s.form('/portal/requests', fd); };
  assert.equal((await req2(leg.id)).status, 404, 'solicitação não se vincula a legado');
  assert.equal((await req2(mig.id)).status, 404, 'solicitação não se vincula a dado migrado');
  assert.equal((await req2(plat.id)).status, 200, 'conteúdo da plataforma segue normal');

  // 3. Ciclo atual nunca formado só por migrado/legado
  assert.equal(liveCycle(C.id)?.id, cyc(plat));
  assert.notEqual(liveCycle(C.id)?.id, cyc(leg)); assert.notEqual(liveCycle(C.id)?.id, cyc(mig));
  const j = journey(C.id); assert.equal(j.month, one('SELECT month FROM cycles WHERE id=?', cyc(plat)).month);

  // 4. Relatório semanal: operação sem legado/migrado; histórico separado
  const rp = JSON.parse(generateReport('operacao', new Date(Date.now() - 864e5).toISOString(), new Date(Date.now() + 864e5).toISOString()).data);
  const before = one(`SELECT COUNT(*) n FROM contents WHERE data_origin='plataforma' AND created_at > ?`, new Date(Date.now() - 864e5).toISOString()).n;
  assert.equal(rp.producao.conteudos_criados, before, 'conteúdos criados = só plataforma');
  assert.ok(rp.historico_migrado.itens_legados_nao_validados >= 1);
  assert.ok(rp.historico_migrado.conteudos_migrados_em_andamento >= 1);

  // 5. Lembrete de aprovação vencida: legado/migrado nunca; plataforma sim (mesmo com atributos iguais)
  const past = new Date(Date.now() - 3 * 864e5).toISOString();
  for (const c of [plat, leg]) insert('tasks', { id: uid('t_'), title: `Aprovação — ${c.title}`, client_id: C.id, content_id: c.id, stage: 'aprovacao_cliente', function: 'cliente', status: 'aberta', kind: 'aprovacao', origin: 'engine', due_at: past, created_at: now(), data_origin: c === leg ? 'notion' : 'plataforma' });
  run("UPDATE contents SET legacy_status='nao_validado', data_origin='notion' WHERE id=?", leg.id);
  tick();
  assert.equal(one("SELECT COUNT(*) n FROM automation_runs WHERE automation_key='cliente.prazo_vencido' AND entity_id=?", leg.id).n, 0, 'legado não gera lembrete');
  assert.ok(one("SELECT COUNT(*) n FROM automation_runs WHERE automation_key='cliente.prazo_vencido' AND entity_id=?", plat.id).n >= 1, 'plataforma gera lembrete normalmente');

  // 6. Mudar a etapa do legado não o traz de volta
  run("UPDATE contents SET stage='agendamento' WHERE id=?", leg.id);
  assert.ok(!(await s.get('/portal/feed')).data.items.some((x) => x.id === leg.id));
  assert.ok(!(await s.get('/portal/materials')).data.open_contents.some((x) => x.id === leg.id));
  assert.notEqual(liveCycle(C.id)?.id, cyc(leg));
});

test('data de publicação não é prazo operacional: sem risco, atraso ou pendência por ela', async () => {
  const { contentRisk, dueFor, RELEASED_STAGES, STAGES } = await import('../engine/process.js');
  const { computePendencies } = await import('../engine/intelligence.js');
  const c = await toClientApproval(A, 'Data editorial passada', 1.5);
  run('UPDATE contents SET planned_at=? WHERE id=?', new Date(Date.now() - 5 * 864e5).toISOString(), c.id);
  run("UPDATE tasks SET due_at=? WHERE content_id=? AND status IN ('aberta','em_andamento')", new Date(Date.now() + 5 * 864e5).toISOString(), c.id);
  const cc = one('SELECT * FROM contents WHERE id=?', c.id);
  const r = contentRisk(cc);
  assert.ok(!r.reasons.some((x) => /publica/i.test(x)), 'nenhum motivo de risco vem da data de publicação');
  assert.ok(!computePendencies().some((p) => p.content_id === c.id && /publica/i.test(`${p.impact} ${p.title}`)), 'pendência não cita publicação');
  const due = dueFor({ ...cc, planned_at: new Date(Date.now() + 3600e3).toISOString() }, 'producao');
  assert.ok(!due || due > new Date(Date.now() + 3600e3).toISOString(), 'prazo da etapa não é encurtado pela data de publicação');
  assert.equal(STAGES.agendamento.label, 'Liberado para publicação');
  assert.equal(STAGES.agendamento.sla, null);
  for (const st of RELEASED_STAGES) assert.equal(contentRisk({ ...cc, stage: st }).level, 'nenhum', `${st}: fora da operação`);
});

test('✎ ajuste do cliente sem tipo identificável vai para a triagem (Rebeca/Vitória/Vivian encaminham)', async () => {
  const c = await toClientApproval(A, 'Sem tipo');
  const s = await login(ca);
  const fd = new FormData(); fd.append('note', 'não gostei, pode mudar?'); fd.append('version', '1');
  const r = await s.form(`/portal/contents/${c.id}/adjust`, fd);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const adj = one("SELECT * FROM adjustments WHERE content_id=? AND origin='cliente'", c.id);
  assert.equal(adj.assigned_to, null, 'não identificado: ninguém recebe por engano');
  assert.ok(one("SELECT 1 FROM notifications WHERE type='ajuste_triagem' AND content_id=? AND user_id=?", c.id, U.ceo.id), 'a CEO recebe para encaminhar');
  assert.equal(P.identifyAspect('trocar a cor do fundo'), 'imagem');
  assert.equal(P.identifyAspect('cortar o começo do reels'), 'video');
  assert.equal(P.identifyAspect('ajusta a legenda'), 'legenda');
});
