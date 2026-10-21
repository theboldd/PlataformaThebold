// ÁREA DO CLIENTE — endpoints exclusivos do cliente. Nunca expõem dados internos:
// comentários internos, tarefas internas, financeiro, outros clientes, problemas internos ou notas da equipe.
import { Router } from 'express';
import { one, all, insert, update, run, uid, now, parseJSON, tx } from '../db.js';
import { requireClientUser } from '../lib/auth.js';
import { HttpError } from '../lib/permissions.js';
import { log, notify } from '../lib/core.js';
import { STAGES, publicStatus, clientDecision, versionMedia, unblockContent, editableVersion, undoClientApproval, clientAdjustmentRequest } from '../engine/process.js';
import { detectAdjustment } from '../lib/intent.js';
import { activeForm, questionOf, saveAnswer, formStatus, submitForm } from '../services/onboarding.js';
import { fileDTO, ingest } from '../services/media.js';
import { addComment, upload, checkOnboardingComplete } from './ops.js';
import { createMeeting } from './comms.js';

export const portal = Router();
portal.use((req, _res, next) => (req.user ? next() : next(new HttpError(401, 'Faça login para continuar.'))));
portal.use(requireClientUser);

const myClient = (req) => {
  const links = all("SELECT client_id FROM client_members WHERE user_id=? AND function='cliente'", req.user.id).map((r) => r.client_id);
  const id = req.query.client_id || req.body?.client_id || links[0];
  if (!id || !links.includes(id)) throw new HttpError(403, 'Sem acesso a este projeto.');
  return one('SELECT * FROM clients WHERE id=?', id);
};
// revisao_ajuste também aparece (como "em ajuste"); temas aprovados em produção aparecem como ♥ até virarem conteúdo
const CLIENT_STAGES = [...Object.entries(STAGES).filter(([, s]) => s.client).map(([k]) => k), 'revisao_ajuste'];

// Versão visível ao cliente: a mais recente que foi enviada a ele (ou aprovada). Nunca rascunhos internos.
function clientVersion(c) {
  if (c.stage === 'aprovacao_tema') return null;
  return one('SELECT * FROM content_versions WHERE content_id=? AND (sent_to_client_at IS NOT NULL OR status=\'aprovada\') ORDER BY number DESC LIMIT 1', c.id);
}
function feedItem(c, client) {
  const v = clientVersion(c);
  const approval = one("SELECT ap.created_at, u.name, v.number FROM approvals ap JOIN users u ON u.id=ap.user_id LEFT JOIN content_versions v ON v.id=ap.version_id WHERE ap.content_id=? AND ap.decision='aprovado' AND ap.kind IN ('cliente','tema') ORDER BY ap.created_at DESC LIMIT 1", c.id);
  const lastClient = one("SELECT * FROM approvals WHERE content_id=? AND kind IN ('cliente','tema') ORDER BY created_at DESC LIMIT 1", c.id);
  const comments = all("SELECT cm.id, cm.body, cm.parent_id, cm.anchor, cm.adjustment_id, cm.created_at, u.name author_name, u.role_key='cliente' is_client, v.number version_number FROM comments cm JOIN users u ON u.id=cm.author_id LEFT JOIN content_versions v ON v.id=cm.version_id WHERE cm.content_id=? AND cm.visibility='client' ORDER BY cm.created_at", c.id)
    .map((x) => ({ ...x, anchor: parseJSON(x.anchor), is_client: !!x.is_client, is_adjustment: !!x.adjustment_id }));
  const openAdj = all("SELECT description, carousel_page, video_timestamp, created_at FROM adjustments WHERE content_id=? AND origin='cliente' AND status='aberto'", c.id);
  // Histórico de versões que o cliente já viu (nunca rascunhos internos)
  const versions = c.stage === 'aprovacao_tema' ? [] : all("SELECT * FROM content_versions WHERE content_id=? AND (sent_to_client_at IS NOT NULL OR status='aprovada') ORDER BY number DESC", c.id)
    .map((x) => ({ number: x.number, caption: x.caption, approved: x.status === 'aprovada', current: x.id === v?.id, sent_at: x.sent_to_client_at, approved_at: x.approved_at, media: versionMedia(x.id).map(fileDTO) }));
  const liked = (['agendamento', 'agendado', 'publicado'].includes(c.stage) && !!c.approved_version_id) || (c.stage === 'producao' && lastClient?.kind === 'tema' && lastClient.decision === 'aprovado');
  const hrs = lastClient ? (Date.now() - new Date(lastClient.created_at).getTime()) / 3600e3 : 99;
  const canUnlike = lastClient?.decision === 'aprovado' && hrs <= 24 && ((c.stage === 'agendamento' && !c.scheduled_at && lastClient.kind === 'cliente') || (c.stage === 'producao' && lastClient.kind === 'tema' && !c.current_version_id));
  const adjustState = openAdj.length || c.stage === 'revisao_ajuste' ? 'solicitado' : c.stage === 'aprovacao_cliente' && c.client_adjust_rounds > 0 ? 'concluido' : null;
  return {
    id: c.id, number: c.number, title: c.title, format: c.format, planned_at: c.planned_at, scheduled_at: c.scheduled_at, status: publicStatus(c), stage: c.stage,
    is_theme: c.stage === 'aprovacao_tema' || c.stage === 'producao', theme: c.theme, objective: c.objective, reference: c.reference,
    brand: { name: client.name, handle: client.handle },
    version: v ? { number: v.number, caption: v.caption, approved: v.status === 'aprovada', media: versionMedia(v.id).map(fileDTO) } : null,
    versions, liked, can_like: ['aprovacao_tema', 'aprovacao_cliente'].includes(c.stage) && !c.blocked, can_unlike: !!canUnlike,
    can_decide: ['aprovacao_tema', 'aprovacao_cliente'].includes(c.stage) && !c.blocked, adjust_state: adjustState,
    can_request_adjust: !['publicado'].includes(c.stage),
    approval, comments, open_adjustments: openAdj, schedule_mode: c.schedule_mode,
  };
}

// Andamento simplificado do projeto (5 etapas) a partir do ciclo atual
const STEP_OF = { cronograma: 0, analise_cronograma: 0, ajuste_cronograma: 0, aprovacao_tema: 0, producao: 1, analise_producao: 1, ajuste_interno: 1, aprovacao_cliente: 2, ajuste_cliente: 2, revisao_ajuste: 2, agendamento: 3, agendado: 4, publicado: 4 };
const STEPS = ['Estratégia', 'Produção', 'Aprovação', 'Agendamento', 'Publicação'];
function projectTrack(clientId) {
  // Ciclo "vivo": o primeiro com trabalho ainda em andamento (não só agendado/publicado)
  const cycle = one("SELECT * FROM cycles WHERE client_id=? AND EXISTS (SELECT 1 FROM contents WHERE cycle_id=cycles.id AND stage NOT IN ('agendado','publicado','cancelado')) ORDER BY month LIMIT 1", clientId)
    || one("SELECT * FROM cycles WHERE client_id=? AND EXISTS (SELECT 1 FROM contents WHERE cycle_id=cycles.id AND stage NOT IN ('publicado','cancelado')) ORDER BY month LIMIT 1", clientId)
    || one("SELECT * FROM cycles WHERE client_id=? ORDER BY month DESC LIMIT 1", clientId);
  if (!cycle) return null;
  const cs = all("SELECT stage FROM contents WHERE cycle_id=? AND stage<>'cancelado'", cycle.id);
  if (!cs.length) return { month: cycle.month, steps: STEPS.map((label) => ({ label, state: 'next' })) };
  const idx = cs.map((x) => STEP_OF[x.stage]);
  const min = Math.min(...idx);
  const allPublished = cs.every((x) => x.stage === 'publicado');
  const steps = STEPS.map((label, i) => {
    const here = cs.filter((x) => STEP_OF[x.stage] === i);
    const waitingYou = here.some((x) => ['aprovacao_tema', 'aprovacao_cliente'].includes(x.stage));
    const max = Math.max(...idx);
    let state = i < min ? 'done' : here.length ? (waitingYou ? 'you' : 'current') : i < max ? 'partial' : 'next';
    if (i === 4 && allPublished) state = 'done';
    const n = here.length;
    const note = state === 'partial' ? 'parte concluída' : state === 'done' ? 'concluída' : state === 'you' ? 'aguardando você' : state === 'current' ? (i === 4 ? `${n} agendado(s)` : 'em andamento') : 'próxima etapa';
    return { label, state, note, count: n };
  });
  return { month: cycle.month, steps };
}

portal.get('/me', (req, res) => {
  const c = myClient(req);
  const team = all("SELECT DISTINCT u.id, u.name, cm.function FROM client_members cm JOIN users u ON u.id=cm.user_id WHERE cm.client_id=? AND cm.function IN ('estrategia','atendimento','design','edicao','copy','revisao') AND u.active=1", c.id);
  const counts = one(`SELECT SUM(stage IN ('aprovacao_tema','aprovacao_cliente')) aguardando, SUM(stage='ajuste_cliente') em_ajuste, SUM(stage IN ('agendamento','agendado') AND approved_version_id IS NOT NULL) aprovados, SUM(stage='publicado') publicados FROM contents WHERE (legacy_status IS NULL OR legacy_status='reprogramado') AND client_id=?`, c.id);
  const next = one("SELECT * FROM meetings WHERE client_id=? AND status='agendada' AND starts_at > ? ORDER BY starts_at LIMIT 1", c.id, now());
  const ob = one('SELECT * FROM onboarding WHERE client_id=?', c.id);
  const timeline = all("SELECT created_at, summary FROM activity_logs WHERE client_id=? AND visibility='client' ORDER BY created_at DESC LIMIT 25", c.id);
  const cycle = one("SELECT * FROM cycles WHERE client_id=? AND status<>'encerrado' ORDER BY month LIMIT 1", c.id);
  const steps = [];
  if (counts.aguardando) steps.push({ text: counts.aguardando === 1 ? '1 conteúdo aguardando sua aprovação.' : `${counts.aguardando} conteúdos aguardando sua aprovação.`, link: '/portal/conteudos', cta: 'Ver conteúdos' });
  const mat = one("SELECT COUNT(*) n FROM contents WHERE client_id=? AND blocked=1 AND waiting_on='cliente'", c.id).n;
  if (mat) steps.push({ text: `Enviar ${mat} material(is) pendente(s)`, link: '/portal/projeto', cta: 'Enviar materiais' });
  if (ob && ob.form_status === 'migrado_parcial') { const fs = formStatus(c.id); steps.unshift({ text: `Trouxemos ${fs.answered} respostas que você já tinha dado no Notion. Faltam ${fs.total - fs.answered} para completar seu onboarding.`, link: '/portal/onboarding', cta: 'Completar onboarding' }); }
  else if (ob && ob.form_status !== 'concluido' && ob.status !== 'migrado') steps.unshift({ text: ob.form_status === 'em_andamento' ? 'Seu formulário de onboarding está pela metade — continue de onde parou.' : 'Preencha o formulário de onboarding para começarmos seu projeto.', link: '/portal/onboarding', cta: ob.form_status === 'em_andamento' ? 'Continuar formulário' : 'Preencher formulário' });
  else if (ob && !['concluido', 'migrado'].includes(ob.status)) steps.push({ text: 'Faltam algumas informações para começarmos.', link: '/portal/projeto', cta: 'Completar' });
  if (next) steps.push({ text: `Reunião em ${new Date(next.starts_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}`, link: '/portal/reunioes', cta: 'Ver reunião' });
  res.json({ client: { id: c.id, name: c.name, handle: c.handle, status: c.status, services: parseJSON(c.services, []) }, team: team.map(({ id, name, function: f }) => ({ id, name, function: f })), counts, next_meeting: next, timeline, steps,
    cycle: cycle ? { month: cycle.month, status: cycle.status, milestones: Object.fromEntries(Object.entries(parseJSON(cycle.milestones, {})).filter(([k]) => ['cliente_aprova_temas', 'cliente_aprova_final', 'ajustes_cliente'].includes(k))) } : null,
    onboarding: ob ? { status: ob.status, form_status: ob.form_status } : null, track: projectTrack(c.id),
    upcoming: all("SELECT id, title, format, COALESCE(scheduled_at, planned_at) date, stage FROM contents WHERE client_id=? AND (legacy_status IS NULL OR legacy_status='reprogramado') AND stage IN ('aprovacao_cliente','agendamento','agendado') AND COALESCE(scheduled_at, planned_at) >= ? ORDER BY date LIMIT 4", c.id, now()).map((x) => ({ ...x, status: publicStatus(x) })),
    in_preparation: one("SELECT COUNT(*) n FROM contents WHERE client_id=? AND stage IN ('cronograma','analise_cronograma','ajuste_cronograma','producao','analise_producao','ajuste_interno')", c.id).n,
    deadlines: cycle ? Object.entries(parseJSON(cycle.milestones, {})).filter(([k, m]) => ['cliente_aprova_temas', 'cliente_aprova_final'].includes(k) && m.end >= now().slice(0, 10)).map(([k, m]) => ({ label: k === 'cliente_aprova_temas' ? 'Aprovar os temas do mês' : 'Aprovar os conteúdos do mês', date: m.end })) : [] });
});
portal.get('/feed', (req, res) => {
  const c = myClient(req);
  const where = [`client_id=?`, `(stage IN (${CLIENT_STAGES.map(() => '?').join(',')}) OR (stage='producao' AND current_version_id IS NULL))`]; const p = [c.id, ...CLIENT_STAGES];
  const f = req.query.filter;
  const map = { aguardando: ['aprovacao_tema', 'aprovacao_cliente'], aprovados: ['agendamento', 'agendado', 'publicado'], ajuste: ['ajuste_cliente'], agendados: ['agendado'], publicados: ['publicado'] };
  if (map[f]) { where.push(`stage IN (${map[f].map(() => '?').join(',')})`); p.push(...map[f]); }
  if (f === 'aprovados') where.push('approved_version_id IS NOT NULL'); // só com aprovação registrada (regra oficial 14)
  if (req.query.month) { where.push('substr(planned_at,1,7)=?'); p.push(req.query.month); }
  if (req.query.format) { where.push('format=?'); p.push(req.query.format); }
  where.push("(legacy_status IS NULL OR legacy_status='reprogramado')"); // regra 18: item legado não é conteúdo operacional para o cliente
  const rows = all(`SELECT * FROM contents WHERE ${where.join(' AND ')} ORDER BY CASE WHEN stage IN ('aprovacao_tema','aprovacao_cliente') THEN 0 ELSE 1 END, planned_at`, ...p);
  const months = all(`SELECT DISTINCT substr(planned_at,1,7) m FROM contents WHERE client_id=? AND planned_at IS NOT NULL AND stage IN (${CLIENT_STAGES.map(() => '?').join(',')}) ORDER BY m`, c.id, ...CLIENT_STAGES).map((r) => r.m);
  res.json({ items: rows.map((x) => feedItem(x, c)), months });
});
const getMyContent = (req) => {
  const c = one('SELECT * FROM contents WHERE id=?', req.params.id);
  if (!c || !(CLIENT_STAGES.includes(c.stage) || (c.stage === 'producao' && !c.current_version_id)) || !one("SELECT 1 FROM client_members WHERE user_id=? AND client_id=? AND function='cliente'", req.user.id, c.client_id)) throw new HttpError(404, 'Conteúdo não encontrado.');
  return c;
};
portal.post('/contents/:id/approve', (req, res) => {
  const c = getMyContent(req);
  clientDecision(c.id, req.user, { decision: 'aprovar', note: req.body?.note }, req);
  res.json(feedItem(one('SELECT * FROM contents WHERE id=?', c.id), one('SELECT * FROM clients WHERE id=?', c.client_id)));
});
portal.post('/contents/:id/adjust', upload.single('file'), async (req, res) => {
  const c = getMyContent(req);
  let fileId = null;
  if (req.file) fileId = (await ingest(req.file.path, { originalName: Buffer.from(req.file.originalname, 'latin1').toString('utf8'), mime: req.file.mimetype, clientId: c.client_id, userId: req.user.id, visibility: 'client' })).id;
  const note = String(req.body?.note || '').trim();
  const page = req.body.carousel_page ? Number(req.body.carousel_page) : null;
  const t = req.body.video_timestamp ? Number(req.body.video_timestamp) : null;
  clientDecision(c.id, req.user, { decision: 'ajuste', note, carousel_page: page, video_timestamp: t }, req);
  const cm = addComment(one('SELECT * FROM contents WHERE id=?', c.id), req.user, { body: `Ajuste solicitado: ${note}`, anchor: page || t != null ? { page, t } : null, file_id: fileId });
  // o comentário aponta para o ajuste que a decisão acabou de criar (histórico ligado)
  const adj = one("SELECT id FROM adjustments WHERE content_id=? AND origin='cliente' AND requested_by=? ORDER BY created_at DESC LIMIT 1", c.id, req.user.id);
  if (adj) update('comments', { id: cm.id }, { adjustment_id: adj.id });
  res.json(feedItem(one('SELECT * FROM contents WHERE id=?', c.id), one('SELECT * FROM clients WHERE id=?', c.client_id)));
});
// Cliente edita a legenda direto no feed → nova versão (a anterior é preservada) + equipe notificada
portal.post('/contents/:id/caption', (req, res) => {
  const c = getMyContent(req);
  if (c.stage !== 'aprovacao_cliente' || c.blocked) throw new HttpError(409, 'A legenda só pode ser editada enquanto o conteúdo aguarda sua aprovação.');
  const caption = String(req.body?.caption ?? '').trim();
  if (!caption) throw new HttpError(422, 'A legenda não pode ficar vazia.');
  if (caption.length > 2200) throw new HttpError(422, 'O Instagram aceita até 2.200 caracteres na legenda.');
  const cur = one('SELECT * FROM content_versions WHERE id=?', c.current_version_id);
  if (cur && cur.caption.trim() === caption) throw new HttpError(422, 'Nenhuma alteração na legenda.');
  const v = tx(() => {
    const v = editableVersion(c, req.user.id);
    update('content_versions', { id: v.id }, { caption, status: 'enviada_cliente', locked: 1, sent_to_client_at: now(), notes: 'Legenda editada pelo cliente' });
    return one('SELECT * FROM content_versions WHERE id=?', v.id);
  });
  log({ actor: req.user.id, action: 'legenda.editada_cliente', entity: 'content', id: c.id, client: c.client_id, content: c.id, visibility: 'client',
    summary: `${req.user.name} editou a legenda (V${cur?.number} → V${v.number})`, before: cur?.caption, after: caption });
  const team = all("SELECT DISTINCT user_id FROM client_members WHERE client_id=? AND function IN ('estrategia','copy','atendimento')", c.client_id).map((r) => r.user_id);
  notify(team, { level: 'atencao', type: 'legenda_cliente', title: `${one('SELECT name FROM clients WHERE id=?', c.client_id).name} editou uma legenda`, body: `#${c.number} ${c.title} — nova versão V${v.number}`, link: `/conteudos/${c.id}`, content: c.id, client: c.client_id });
  res.json(feedItem(one('SELECT * FROM contents WHERE id=?', c.id), one('SELECT * FROM clients WHERE id=?', c.client_id)));
});
// LIKE = aprovação formal (registra usuário, data/hora, IP, versão; congela a versão; avança o processo)
portal.post('/contents/:id/like', (req, res) => {
  const c = getMyContent(req);
  clientDecision(c.id, req.user, { decision: 'aprovar' }, req);
  res.json(feedItem(one('SELECT * FROM contents WHERE id=?', c.id), one('SELECT * FROM clients WHERE id=?', c.client_id)));
});
portal.delete('/contents/:id/like', (req, res) => {
  const c = getMyContent(req);
  undoClientApproval(c.id, req.user);
  res.json(feedItem(one('SELECT * FROM contents WHERE id=?', c.id), one('SELECT * FROM clients WHERE id=?', c.client_id)));
});
// Comentário: conversa OU pedido de ajuste (detectado automaticamente; o cliente pode confirmar "é só um comentário")
portal.post('/contents/:id/comments', upload.single('file'), async (req, res) => {
  const c = getMyContent(req);
  const body = String(req.body?.body || '').trim();
  if (!body) throw new HttpError(422, 'Escreva o comentário.');
  let file_id = null;
  if (req.file) file_id = (await ingest(req.file.path, { originalName: Buffer.from(req.file.originalname, 'latin1').toString('utf8'), mime: req.file.mimetype, clientId: c.client_id, userId: req.user.id, visibility: 'client' })).id;
  const detected = detectAdjustment(body);
  const page = req.body.page ? Number(req.body.page) : detected.page;
  const t = req.body.t != null && req.body.t !== '' ? Number(req.body.t) : detected.t;
  const intent = req.body.intent === 'comentario' ? 'comentario' : req.body.intent === 'ajuste' ? 'ajuste' : detected.isAdjustment ? 'ajuste' : 'comentario';
  let action = null;
  if (intent === 'ajuste' && !req.body.parent_id && c.stage !== 'publicado') {
    const r = clientAdjustmentRequest(c.id, req.user, { note: body, carousel_page: page, video_timestamp: t }, req);
    const adj = r.adjustment || one("SELECT * FROM adjustments WHERE content_id=? AND origin='cliente' ORDER BY created_at DESC LIMIT 1", c.id);
    action = { type: 'ajuste', mode: r.mode, adjustment_id: adj?.id };
  }
  const cm = addComment(one('SELECT * FROM contents WHERE id=?', c.id), req.user, { body, parent_id: req.body.parent_id || null, anchor: page || t != null ? { page, t } : null, file_id });
  if (action?.adjustment_id) update('comments', { id: cm.id }, { adjustment_id: action.adjustment_id });
  if (intent === 'ajuste' && c.stage === 'publicado') {
    const team = all("SELECT DISTINCT user_id FROM client_members WHERE client_id=? AND function IN ('estrategia','atendimento')", c.client_id).map((r) => r.user_id);
    notify(team, { level: 'atencao', type: 'comentario_publicado', title: 'Pedido do cliente em conteúdo já publicado', body: `#${c.number} ${c.title}: ${body.slice(0, 120)}`, link: `/conteudos/${c.id}`, content: c.id, client: c.client_id });
  }
  res.json({ item: feedItem(one('SELECT * FROM contents WHERE id=?', c.id), one('SELECT * FROM clients WHERE id=?', c.client_id)), action });
});
portal.post('/intent', (req, res) => res.json(detectAdjustment(req.body?.body)));
portal.get('/calendar', (req, res) => {
  const c = myClient(req);
  const items = all(`SELECT * FROM contents WHERE client_id=? AND (legacy_status IS NULL OR legacy_status='reprogramado') AND stage IN (${CLIENT_STAGES.map(() => '?').join(',')}) AND planned_at IS NOT NULL ORDER BY planned_at`, c.id, ...CLIENT_STAGES)
    .map((x) => ({ id: x.id, title: x.title, format: x.format, date: x.scheduled_at || x.planned_at, status: publicStatus(x) }));
  const upcoming = all("SELECT COUNT(*) n FROM contents WHERE client_id=? AND stage IN ('cronograma','analise_cronograma','ajuste_cronograma','producao','analise_producao','ajuste_interno')", c.id)[0].n;
  const meetings = all("SELECT id, title, starts_at, ends_at FROM meetings WHERE client_id=? AND status='agendada'", c.id);
  res.json({ items, meetings, in_preparation: upcoming });
});
portal.get('/pendencias', (req, res) => {
  const c = myClient(req);
  const ob = one('SELECT * FROM onboarding WHERE client_id=?', c.id);
  const onboarding = ob ? all("SELECT id, kind, label, status, due_at, brain_section FROM onboarding_items WHERE onboarding_id=? AND who='cliente' ORDER BY sort", ob.id) : [];
  const approvals = all("SELECT id, number, title, stage, stage_entered_at FROM contents WHERE client_id=? AND stage IN ('aprovacao_tema','aprovacao_cliente')", c.id);
  const materials = all("SELECT id, number, title, block_reason, updated_at, planned_at FROM contents WHERE client_id=? AND blocked=1 AND waiting_on='cliente'", c.id);
  res.json({ onboarding, approvals, materials, onboarding_status: ob?.status, form_status: ob?.form_status });
});
// FORMULÁRIO OFICIAL "Sua marca" — o cliente preenche na plataforma (rascunho salvo a cada resposta)
portal.get('/onboarding/form', (req, res) => {
  const c = myClient(req);
  const form = activeForm();
  if (!form) throw new HttpError(404, 'Formulário não configurado.');
  const st = formStatus(c.id);
  // Acessos nunca voltam para a tela: só a indicação de que já foram informados
  const answers = Object.fromEntries(Object.entries(st.answers).map(([k, a]) => [k, k.startsWith('acesso_') ? { saved: true, migrated: a.source_type === 'notion' } : { value: a.answer, updated_at: a.updated_at, migrated: a.source_type === 'notion' }]));
  res.json({ title: form.title, version: form.version, sections: form.sections.map((s) => ({ title: s.title, intro: s.intro || null, questions: s.questions.map(({ key, text, type, options, help, sensitive }) => ({ key, text, type, options, help: help && !/^(CAMPO SENSÍVEL|Linha |Checkboxes|Pode envolver|Resposta:)/.test(help) ? help : null, sensitive: !!sensitive, required: form.required_keys.includes(key) })) })),
    answers, status: st.status, submitted_at: st.submitted_at, answered: st.answered, total: st.total, missing_required: st.missing_required });
});
portal.put('/onboarding/answers/:key', (req, res) => {
  const c = myClient(req);
  const form = activeForm();
  if (!questionOf(form, req.params.key)) throw new HttpError(404, 'Pergunta não encontrada.');
  const value = req.body?.value;
  if (typeof value !== 'string' && !Array.isArray(value)) throw new HttpError(422, 'Resposta inválida.');
  if (String(value).length > 20000) throw new HttpError(422, 'Resposta muito longa.');
  saveAnswer(c.id, req.params.key, value, req.user, { origin: 'onboarding_cliente', source_type: 'plataforma' });
  run("UPDATE onboarding SET form_status='em_andamento' WHERE client_id=? AND form_status='nao_iniciado'", c.id);
  if (req.params.key.startsWith('acesso_') && String(value).trim()) run("UPDATE onboarding_items SET status='recebido', received_at=? WHERE onboarding_id=(SELECT id FROM onboarding WHERE client_id=?) AND kind='acesso' AND status='pendente'", now(), c.id);
  const st = formStatus(c.id);
  res.json({ ok: true, answered: st.answered, total: st.total, saved_at: now() });
});
portal.post('/onboarding/submit', (req, res) => {
  const c = myClient(req);
  const ob = one('SELECT * FROM onboarding WHERE client_id=?', c.id);
  const st = submitForm(c.id, req.user, () => ob && checkOnboardingComplete(ob.id, req.user));
  res.json({ ok: true, status: st.status, answered: st.answered, total: st.total });
});
// Formulário de onboarding: preenche o Client Brain e dá baixa no item
portal.post('/onboarding/:itemId', (req, res) => {
  const c = myClient(req);
  const it = one("SELECT oi.* FROM onboarding_items oi JOIN onboarding ob ON ob.id=oi.onboarding_id WHERE oi.id=? AND ob.client_id=? AND oi.who='cliente'", req.params.itemId, c.id);
  if (!it) throw new HttpError(404, 'Item não encontrado.');
  const value = String(req.body?.value || '').trim();
  if (it.kind === 'formulario' && !value) throw new HttpError(422, 'Preencha a resposta.');
  update('onboarding_items', { id: it.id }, { status: 'recebido', value: value || it.value, received_at: now() });
  if (it.brain_section && value) run('UPDATE client_brain SET body=?, updated_by=?, updated_at=? WHERE client_id=? AND section=?', value, req.user.id, now(), c.id, it.brain_section);
  log({ actor: req.user.id, action: 'onboarding.item', entity: 'onboarding_item', id: it.id, client: c.id, summary: `Cliente enviou: ${it.label}`, visibility: 'client' });
  notify(all("SELECT user_id FROM client_members WHERE client_id=? AND function IN ('estrategia','atendimento')", c.id).map((r) => r.user_id), { level: 'info', type: 'onboarding', title: `${c.name} enviou: ${it.label}`, link: `/clientes/${c.id}?tab=onboarding`, groupKey: `onb-rec:${c.id}`, client: c.id });
  checkOnboardingComplete(it.onboarding_id, req.user);
  res.json({ ok: true });
});
// Materiais: upload direto (original preservado), visível ao cliente e à equipe
portal.get('/materials', (req, res) => {
  const c = myClient(req);
  const files = all("SELECT f.*, u.role_key uploader_role FROM files f LEFT JOIN users u ON u.id=f.uploaded_by WHERE f.client_id=? AND f.visibility='client' ORDER BY f.created_at DESC", c.id);
  const ob = one('SELECT id FROM onboarding WHERE client_id=?', c.id);
  res.json({
    requested: [
      ...all("SELECT id, number, title, block_reason reason, planned_at FROM contents WHERE client_id=? AND blocked=1 AND waiting_on='cliente'", c.id).map((x) => ({ kind: 'conteudo', id: x.id, title: x.reason, context: `Para o conteúdo “${x.title}”`, due: x.planned_at })),
      ...(ob ? all("SELECT id, label, due_at FROM onboarding_items WHERE onboarding_id=? AND who='cliente' AND kind IN ('material','acesso') AND status='pendente'", ob.id).map((x) => ({ kind: 'onboarding', id: x.id, title: x.label, context: 'Início do projeto', due: x.due_at })) : []),
    ],
    sent: files.filter((f) => f.uploader_role === 'cliente').map(fileDTO),
    from_team: files.filter((f) => f.uploader_role !== 'cliente').map(fileDTO),
  });
});
portal.post('/materials', upload.array('files', 20), async (req, res) => {
  const c = myClient(req);
  const out = [];
  for (const f of req.files || []) out.push(await ingest(f.path, { originalName: Buffer.from(f.originalname, 'latin1').toString('utf8'), mime: f.mimetype, clientId: c.id, userId: req.user.id, visibility: 'client' }));
  if (!out.length) throw new HttpError(422, 'Nenhum arquivo enviado.');
  const contentId = req.body.content_id;
  if (contentId) {
    const ct = one("SELECT * FROM contents WHERE id=? AND client_id=? AND blocked=1 AND waiting_on='cliente'", contentId, c.id);
    if (ct) unblockContent(ct.id, null, `material enviado pelo cliente (${out.length} arquivo(s))`);
  }
  if (req.body.onboarding_item) {
    const it = one("SELECT oi.* FROM onboarding_items oi JOIN onboarding ob ON ob.id=oi.onboarding_id WHERE oi.id=? AND ob.client_id=?", req.body.onboarding_item, c.id);
    if (it) { update('onboarding_items', { id: it.id }, { status: 'recebido', value: out.map((f) => f.original_name).join(', '), received_at: now() }); checkOnboardingComplete(it.onboarding_id, req.user); }
  }
  log({ actor: req.user.id, action: 'material.recebido', entity: 'file', id: out[0].id, client: c.id, content: contentId || null, summary: `${req.user.name} enviou ${out.length} material(is): ${out.map((f) => f.original_name).join(', ').slice(0, 160)}`, visibility: 'client' });
  notify(all("SELECT user_id FROM client_members WHERE client_id=? AND function IN ('estrategia','atendimento','design','edicao')", c.id).map((r) => r.user_id), { level: 'info', type: 'material', title: `Material recebido de ${c.name}`, body: `${out.length} arquivo(s)`, link: `/clientes/${c.id}?tab=arquivos`, groupKey: `mat:${c.id}`, client: c.id });
  res.json(out.map(fileDTO));
});
// Sala de Reuniões: cliente vê somente horários livres e reserva
portal.get('/meetings', (req, res) => {
  const c = myClient(req);
  res.json({
    meetings: all("SELECT id, title, starts_at, ends_at, location, status, CASE WHEN status='realizada' THEN summary END summary FROM meetings WHERE client_id=? ORDER BY starts_at DESC", c.id),
    slots: all('SELECT id, starts_at, ends_at, window_label FROM meeting_slots WHERE meeting_id IS NULL AND starts_at > ? ORDER BY starts_at', new Date(Date.now() + 2 * 3600e3).toISOString()),
    has_upcoming: !!one("SELECT 1 FROM meetings WHERE client_id=? AND status='agendada' AND starts_at > ? AND kind='mensal'", c.id, now()),
  });
});
portal.post('/meetings/book', async (req, res) => {
  const c = myClient(req);
  const slot = one('SELECT * FROM meeting_slots WHERE id=? AND meeting_id IS NULL', req.body?.slot_id);
  if (!slot) throw new HttpError(409, 'Este horário não está mais disponível.');
  if (slot.starts_at < now()) throw new HttpError(409, 'Horário no passado.');
  const MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const m = await createMeeting(req.user, { client_id: c.id, title: `${c.name} e The Bold — Reunião mensal de conteúdo (${MES[new Date(slot.starts_at).getMonth()]})`, kind: 'mensal', starts_at: slot.starts_at, ends_at: slot.ends_at, attendees: slot.host_id ? [slot.host_id] : [], slot_id: slot.id });
  res.json({ id: m.id, starts_at: m.starts_at, gcal_sync: m.gcal_sync });
});
// Conversa com a equipe (canal do cliente)
portal.get('/channel', (req, res) => {
  const c = myClient(req);
  const ch = one("SELECT id FROM channels WHERE client_id=? AND kind='cliente'", c.id);
  res.json({ channel_id: ch?.id || null });
});
