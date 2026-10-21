// ÁREA DO CLIENTE — endpoints exclusivos do cliente. Nunca expõem dados internos:
// comentários internos, tarefas internas, financeiro, outros clientes, problemas internos ou notas da equipe.
// Regra central: toda ação do cliente gera registro → processo → responsável → próximo passo → notificação → histórico.
import { Router } from 'express';
import fsp from 'node:fs/promises';
import { one, all, insert, update, run, uid, now, parseJSON, tx } from '../db.js';
import { requireClientUser } from '../lib/auth.js';
import { HttpError } from '../lib/permissions.js';
import { log, notify, businessDaysFrom } from '../lib/core.js';
import { STAGES, publicStatus, clientDecision, versionMedia, unblockContent, editableVersion, undoClientApproval, clientAdjustmentRequest, resolveAssignee, ADJUST_ASPECTS } from '../engine/process.js';
import { automation } from '../engine/automations.js';
import { detectAdjustment } from '../lib/intent.js';
import { activeForm, questionOf, saveAnswer, formStatus, submitForm } from '../services/onboarding.js';
import { fileDTO, ingest } from '../services/media.js';
import { clientHome, clientActions, clientDeadline, clientHistory, journey, profileProgress } from '../services/client-view.js';
import { createRequest, requestForClient, clientReply, REQUEST_KINDS } from '../services/requests.js';
import { decisionDTO, answerDecision, brandForClient, confirmBrand, pulseForClient } from '../services/client-brand.js';
import { pendingPrompt, answerSatisfaction, dismissSatisfaction, offerSatisfaction } from '../services/satisfaction.js';
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
const fileName = (f) => Buffer.from(f.originalname, 'latin1').toString('utf8');
const ingestClientFile = async (f, clientId, userId, extra = {}) => {
  const out = await ingest(f.path, { originalName: fileName(f), mime: f.mimetype, clientId, userId, visibility: 'client' });
  if (Object.keys(extra).length) update('files', { id: out.id }, extra);
  return out;
};
// revisao_ajuste também aparece (como "em ajuste"); temas aprovados em produção aparecem como ♥ até virarem conteúdo
const CLIENT_STAGES = [...Object.entries(STAGES).filter(([, s]) => s.client).map(([k]) => k), 'revisao_ajuste'];

// Versão visível ao cliente: a mais recente que foi enviada a ele (ou aprovada). Nunca rascunhos internos.
function clientVersion(c) {
  if (c.stage === 'aprovacao_tema') return null;
  return one('SELECT * FROM content_versions WHERE content_id=? AND (sent_to_client_at IS NOT NULL OR approved_at IS NOT NULL) ORDER BY number DESC LIMIT 1', c.id);
}
const fmtT = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function feedItem(c, client) {
  const v = clientVersion(c);
  const approval = one("SELECT ap.created_at, u.name, v.number FROM approvals ap JOIN users u ON u.id=ap.user_id LEFT JOIN content_versions v ON v.id=ap.version_id WHERE ap.content_id=? AND ap.decision='aprovado' AND ap.kind IN ('cliente','tema') ORDER BY ap.created_at DESC LIMIT 1", c.id);
  const lastClient = one("SELECT * FROM approvals WHERE content_id=? AND kind IN ('cliente','tema') ORDER BY created_at DESC LIMIT 1", c.id);
  const comments = all("SELECT cm.id, cm.body, cm.parent_id, cm.anchor, cm.adjustment_id, cm.kind, cm.created_at, u.name author_name, u.role_key='cliente' is_client, v.number version_number FROM comments cm JOIN users u ON u.id=cm.author_id LEFT JOIN content_versions v ON v.id=cm.version_id WHERE cm.content_id=? AND cm.visibility='client' ORDER BY cm.created_at", c.id)
    .map((x) => ({ ...x, anchor: parseJSON(x.anchor), is_client: !!x.is_client, is_adjustment: !!x.adjustment_id, is_question: x.kind === 'pergunta',
      answered: x.kind === 'pergunta' ? !!one("SELECT 1 FROM comments cc JOIN users uu ON uu.id=cc.author_id WHERE cc.parent_id=? AND uu.role_key<>'cliente' AND cc.visibility='client'", x.id) : undefined }));
  const adjustments = all("SELECT a.id, a.description, a.aspect, a.carousel_page, a.video_timestamp, a.region, a.status, a.created_at, a.done_at, v.number version_number, rv.number resolved_in FROM adjustments a LEFT JOIN content_versions v ON v.id=a.version_id LEFT JOIN content_versions rv ON rv.id=a.resolved_version_id WHERE a.content_id=? AND a.origin='cliente' ORDER BY a.created_at", c.id)
    .map((a) => ({ ...a, region: parseJSON(a.region), aspect_label: ADJUST_ASPECTS[a.aspect] || null, open: a.status === 'aberto',
      where: [a.carousel_page ? `Página ${a.carousel_page}` : null, a.video_timestamp != null ? fmtT(a.video_timestamp) : null, ADJUST_ASPECTS[a.aspect] || null].filter(Boolean).join(' · ') || null }));
  const openAdj = adjustments.filter((a) => a.open);
  // Histórico de versões que o cliente já viu (nunca rascunhos internos): arquivo, data, motivo, ajustes, status, aprovação
  const versions = c.stage === 'aprovacao_tema' ? [] : all("SELECT * FROM content_versions WHERE content_id=? AND (sent_to_client_at IS NOT NULL OR approved_at IS NOT NULL) ORDER BY number DESC", c.id)
    .map((x) => {
      const current = x.id === v?.id;
      // "aprovada" só com aprovação registrada do cliente para ESTA versão; liberada pela equipe nunca aparece como aprovada
      const approvedNow = x.id === c.approved_version_id && x.status === 'aprovada';
      return { number: x.number, caption: x.caption, current, approved: approvedNow, was_approved: !!x.approved_at, approved_at: x.approved_at,
        state: approvedNow ? 'aprovada' : x.status === 'liberada' ? 'liberada' : current ? 'atual' : 'substituida', reason: x.notes && !/editada pelo cliente/i.test(x.notes) ? x.notes : x.notes ? 'Legenda editada por você' : null, sent_at: x.sent_to_client_at || x.created_at,
        adjustments_done: adjustments.filter((a) => a.resolved_in === x.number).map((a) => a.description), media: versionMedia(x.id).map(fileDTO) };
    });
  const liked = ['agendamento', 'agendado', 'publicado'].includes(c.stage) || (c.stage === 'producao' && lastClient?.kind === 'tema' && lastClient.decision === 'aprovado');
  const hrs = lastClient ? (Date.now() - new Date(lastClient.created_at).getTime()) / 3600e3 : 99;
  const canUnlike = lastClient?.decision === 'aprovado' && hrs <= 24 && ((c.stage === 'agendamento' && !c.scheduled_at && lastClient.kind === 'cliente') || (c.stage === 'producao' && lastClient.kind === 'tema' && !c.current_version_id));
  const adjustState = openAdj.length || c.stage === 'revisao_ajuste' ? 'solicitado' : c.stage === 'aprovacao_cliente' && c.client_adjust_rounds > 0 ? 'concluido' : null;
  const canDecide = ['aprovacao_tema', 'aprovacao_cliente'].includes(c.stage) && !c.blocked;
  return {
    id: c.id, number: c.number, title: c.title, format: c.format, planned_at: c.planned_at, scheduled_at: c.scheduled_at, status: publicStatus(c), stage: c.stage,
    is_theme: c.stage === 'aprovacao_tema' || c.stage === 'producao', theme: c.theme, objective: c.objective, reference: c.reference,
    brand: { name: client.name, handle: client.handle },
    version: v ? { number: v.number, caption: v.caption, approved: v.id === c.approved_version_id && v.status === 'aprovada', media: versionMedia(v.id).map(fileDTO) } : null,
    versions, liked, can_like: canDecide, can_unlike: !!canUnlike, can_decide: canDecide, adjust_state: adjustState,
    can_request_adjust: !['publicado'].includes(c.stage), can_ask: true,
    deadline: clientDeadline(c), next_step: canDecide ? (c.stage === 'aprovacao_tema' ? 'Com o tema aprovado, a produção começa.' : 'Com a sua aprovação, esta versão é congelada e segue para agendamento.') : null,
    approval, comments, adjustments, open_adjustments: openAdj, schedule_mode: c.schedule_mode,
  };
}
const contentFor = (id, client) => feedItem(one('SELECT * FROM contents WHERE id=?', id), client);

// Quando todo o ciclo foi aprovado: convite de satisfação ("Como foi essa etapa?")
function maybeCycleDone(content) {
  if (!content.cycle_id) return;
  const pending = one("SELECT COUNT(*) n FROM contents WHERE cycle_id=? AND stage IN ('cronograma','analise_cronograma','ajuste_cronograma','aprovacao_tema','producao','analise_producao','ajuste_interno','aprovacao_cliente','ajuste_cliente','revisao_ajuste')", content.cycle_id).n;
  if (pending) return;
  const cy = one('SELECT month FROM cycles WHERE id=?', content.cycle_id);
  const MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  offerSatisfaction(content.client_id, 'aprovacao_ciclo', content.cycle_id, `a aprovação dos conteúdos de ${MES[Number(cy.month.slice(5, 7)) - 1]}`);
}

portal.get('/me', (req, res) => {
  const c = myClient(req);
  const team = all("SELECT DISTINCT u.id, u.name, cm.function FROM client_members cm JOIN users u ON u.id=cm.user_id WHERE cm.client_id=? AND cm.function IN ('estrategia','atendimento','design','edicao','copy','revisao') AND u.active=1", c.id);
  const counts = one(`SELECT SUM(stage IN ('aprovacao_tema','aprovacao_cliente')) aguardando, SUM(stage='ajuste_cliente') em_ajuste, SUM(stage IN ('agendamento','agendado')) aprovados, SUM(stage='publicado') publicados FROM contents WHERE client_id=?`, c.id);
  const next = one("SELECT * FROM meetings WHERE client_id=? AND status='agendada' AND starts_at > ? ORDER BY starts_at LIMIT 1", c.id, now());
  const ob = one('SELECT * FROM onboarding WHERE client_id=?', c.id);
  const actions = clientActions(c.id);
  res.json({ client: { id: c.id, name: c.name, handle: c.handle, status: c.status, services: parseJSON(c.services, []) }, team: team.map(({ id, name, function: f }) => ({ id, name, function: f })), counts, next_meeting: next,
    timeline: clientHistory(c.id, { limit: 25 }).map((h) => ({ created_at: h.at, summary: h.text, link: h.link })),
    steps: actions.map((a) => ({ text: a.title, link: a.link, cta: a.cta })), actions_count: actions.length,
    onboarding: ob ? { status: ob.status, form_status: ob.form_status } : null, track: journey(c.id), profile: profileProgress(c.id),
    in_preparation: one("SELECT COUNT(*) n FROM contents WHERE client_id=? AND stage IN ('cronograma','analise_cronograma','ajuste_cronograma','producao','analise_producao','ajuste_interno')", c.id).n,
    open_requests: one("SELECT COUNT(*) n FROM client_requests WHERE client_id=? AND status NOT IN ('concluido','cancelado')", c.id).n });
});
// MEU MOMENTO BOLD — AGORA · VOCÊ · THE BOLD · DEPOIS · HISTÓRICO
portal.get('/home', (req, res) => {
  const c = myClient(req);
  res.json({ ...clientHome(c.id), satisfaction: pendingPrompt(c.id), pulse: pulseForClient(c.id) });
});
// CENTRAL DE DECISÕES — tudo que depende de uma decisão do cliente (pendentes) + o que já foi decidido
portal.get('/decisions', (req, res) => {
  const c = myClient(req);
  const decided = [
    ...all("SELECT ap.created_at at, ap.kind, c.id content_id, c.title, v.number FROM approvals ap JOIN contents c ON c.id=ap.content_id LEFT JOIN content_versions v ON v.id=ap.version_id WHERE c.client_id=? AND ap.decision='aprovado' AND ap.kind IN ('cliente','tema') ORDER BY ap.created_at DESC LIMIT 30", c.id)
      .map((x) => ({ at: x.at, kind: 'aprovacao', title: x.kind === 'tema' ? `Tema aprovado: “${x.title}”` : `Aprovado: “${x.title}” V${x.number}`, link: `/portal/conteudos?c=${x.content_id}` })),
    ...all("SELECT * FROM client_decisions WHERE client_id=? AND status='respondida' ORDER BY answered_at DESC LIMIT 30", c.id).map((d) => ({ at: d.answered_at, kind: d.kind, title: d.title, answer: d.answer, link: `/portal/decisoes?d=${d.id}` })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
  res.json({ pending: clientActions(c.id), decisions: all("SELECT * FROM client_decisions WHERE client_id=? AND status IN ('pendente','respondida') ORDER BY status DESC, created_at DESC LIMIT 60", c.id).map(decisionDTO), decided });
});
portal.post('/decisions/:id/answer', (req, res) => {
  const c = myClient(req);
  res.json(decisionDTO(answerDecision(req.params.id, c.id, req.user, req.body || {})));
});

portal.get('/feed', (req, res) => {
  const c = myClient(req);
  const where = [`client_id=?`, `(stage IN (${CLIENT_STAGES.map(() => '?').join(',')}) OR (stage='producao' AND current_version_id IS NULL))`]; const p = [c.id, ...CLIENT_STAGES];
  const f = req.query.filter;
  const map = { aguardando: ['aprovacao_tema', 'aprovacao_cliente'], aprovados: ['agendamento', 'agendado', 'publicado'], ajuste: ['ajuste_cliente', 'revisao_ajuste'], agendados: ['agendado'], publicados: ['publicado'] };
  if (map[f]) { where.push(`stage IN (${map[f].map(() => '?').join(',')})`); p.push(...map[f]); }
  if (req.query.month) { where.push('substr(planned_at,1,7)=?'); p.push(req.query.month); }
  if (req.query.format) { where.push('format=?'); p.push(req.query.format); }
  const rows = all(`SELECT * FROM contents WHERE ${where.join(' AND ')} ORDER BY CASE WHEN stage IN ('aprovacao_tema','aprovacao_cliente') THEN 0 ELSE 1 END, planned_at`, ...p);
  const months = all(`SELECT DISTINCT substr(planned_at,1,7) m FROM contents WHERE client_id=? AND planned_at IS NOT NULL AND stage IN (${CLIENT_STAGES.map(() => '?').join(',')}) ORDER BY m`, c.id, ...CLIENT_STAGES).map((r) => r.m);
  res.json({ items: rows.map((x) => feedItem(x, c)), months, aspects: ADJUST_ASPECTS });
});
const getMyContent = (req) => {
  const c = one('SELECT * FROM contents WHERE id=?', req.params.id);
  if (!c || !(CLIENT_STAGES.includes(c.stage) || (c.stage === 'producao' && !c.current_version_id)) || !one("SELECT 1 FROM client_members WHERE user_id=? AND client_id=? AND function='cliente'", req.user.id, c.client_id)) throw new HttpError(404, 'Conteúdo não encontrado.');
  return c;
};
const clientOf = (c) => one('SELECT * FROM clients WHERE id=?', c.client_id);
// Um conteúdo (abertura direta a partir do calendário, histórico, conversa ou notificação)
portal.get('/contents/:id', (req, res) => { const c = getMyContent(req); res.json(feedItem(c, clientOf(c))); });

// ♥ APROVAR = ação operacional formal: confirma → registra usuário, data/hora, IP, conteúdo e VERSÃO exata → congela a versão →
// atualiza status → avança o Process Engine (cria a próxima etapa e define responsável) → notifica → histórico
const approve = (req, res) => {
  const c = getMyContent(req);
  if (req.body?.confirm !== true) throw new HttpError(428, 'Confirme a aprovação.');
  const v = c.stage === 'aprovacao_cliente' ? one('SELECT number FROM content_versions WHERE id=?', c.current_version_id) : null;
  if (req.body?.version != null && v && Number(req.body.version) !== v.number) throw new HttpError(409, `Uma nova versão (V${v.number}) foi enviada enquanto você revisava. Veja a versão atual antes de aprovar.`);
  clientDecision(c.id, req.user, { decision: 'aprovar', note: req.body?.note }, req);
  const after = one('SELECT * FROM contents WHERE id=?', c.id);
  maybeCycleDone(after);
  res.json(feedItem(after, clientOf(c)));
};
portal.post('/contents/:id/approve', approve);
portal.post('/contents/:id/like', approve);
portal.delete('/contents/:id/like', (req, res) => {
  const c = getMyContent(req);
  undoClientApproval(c.id, req.user);
  res.json(contentFor(c.id, clientOf(c)));
});
// ✎ PEDIR AJUSTE (feedback estruturado): tipo + local (página, tempo do vídeo, região tocada na imagem) + descrição
// → ajuste vinculado ao conteúdo e à versão → responsável definido pelo sistema (pela trilha) → prazo → notificação → status → histórico
portal.post('/contents/:id/adjust', upload.single('file'), async (req, res) => {
  const c = getMyContent(req);
  const note = String(req.body?.note || '').trim();
  if (!note) throw new HttpError(422, 'Descreva o ajuste.');
  if (note.length > 4000) throw new HttpError(422, 'Texto muito longo.');
  const page = req.body.carousel_page ? Number(req.body.carousel_page) : null;
  const t = req.body.video_timestamp !== undefined && req.body.video_timestamp !== '' ? Number(req.body.video_timestamp) : null;
  const region = parseJSON(req.body.region, null);
  const aspect = ADJUST_ASPECTS[req.body.aspect] ? req.body.aspect : null;
  if (req.body.version != null) { const cur = one('SELECT number FROM content_versions WHERE id=?', c.current_version_id); if (cur && Number(req.body.version) !== cur.number && c.stage === 'aprovacao_cliente') throw new HttpError(409, `Uma nova versão (V${cur.number}) foi enviada enquanto você revisava. Veja a versão atual.`); }
  let fileId = null;
  if (req.file) fileId = (await ingestClientFile(req.file, c.client_id, req.user.id, { category: 'referencia', context_type: 'conteudo', context_id: c.id })).id;
  const r = clientAdjustmentRequest(c.id, req.user, { note, carousel_page: page, video_timestamp: t, aspect, region }, req);
  const adj = r.adjustment || one("SELECT * FROM adjustments WHERE content_id=? AND origin='cliente' ORDER BY created_at DESC LIMIT 1", c.id);
  const cm = addComment(one('SELECT * FROM contents WHERE id=?', c.id), req.user, { body: note, anchor: page || t != null || region ? { page, t, region } : null, file_id: fileId, kind: 'ajuste' });
  if (adj) { update('comments', { id: cm.id }, { adjustment_id: adj.id }); update('adjustments', { id: adj.id }, { comment_id: cm.id }); }
  res.json({ item: contentFor(c.id, clientOf(c)), mode: r.mode });
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
    summary: `Você editou a legenda (V${cur?.number} → V${v.number})`, before: cur?.caption, after: caption });
  const team = all("SELECT DISTINCT user_id FROM client_members WHERE client_id=? AND function IN ('estrategia','copy','atendimento')", c.client_id).map((r) => r.user_id);
  notify(team, { level: 'atencao', type: 'legenda_cliente', title: `${clientOf(c).name} editou uma legenda`, body: `#${c.number} ${c.title} — nova versão V${v.number}`, link: `/conteudos/${c.id}`, content: c.id, client: c.client_id });
  res.json(contentFor(c.id, clientOf(c)));
});
// 💬 COMENTAR ou FAZER PERGUNTA. Comentário nunca significa aprovação. Pergunta → pendência para a estrategista até a equipe responder.
portal.post('/contents/:id/comments', upload.single('file'), async (req, res) => {
  const c = getMyContent(req);
  const body = String(req.body?.body || '').trim();
  if (!body) throw new HttpError(422, 'Escreva o comentário.');
  if (body.length > 4000) throw new HttpError(422, 'Texto muito longo.');
  let file_id = null;
  if (req.file) file_id = (await ingestClientFile(req.file, c.client_id, req.user.id, { category: 'referencia', context_type: 'conteudo', context_id: c.id })).id;
  const page = req.body.page ? Number(req.body.page) : null;
  const t = req.body.t != null && req.body.t !== '' ? Number(req.body.t) : null;
  const intent = ['pergunta', 'ajuste'].includes(req.body.intent) ? req.body.intent : 'comentario';
  let action = null;
  // Compatibilidade: pedido de ajuste explícito pelo comentário segue o mesmo caminho estruturado
  if (intent === 'ajuste' && !req.body.parent_id && c.stage !== 'publicado') {
    const r = clientAdjustmentRequest(c.id, req.user, { note: body, carousel_page: page, video_timestamp: t }, req);
    const adj = r.adjustment || one("SELECT * FROM adjustments WHERE content_id=? AND origin='cliente' ORDER BY created_at DESC LIMIT 1", c.id);
    action = { type: 'ajuste', mode: r.mode, adjustment_id: adj?.id };
  }
  const kind = req.body.parent_id ? null : intent === 'pergunta' ? 'pergunta' : intent === 'ajuste' ? 'ajuste' : null;
  const cm = addComment(one('SELECT * FROM contents WHERE id=?', c.id), req.user, { body, parent_id: req.body.parent_id || null, anchor: page || t != null ? { page, t } : null, file_id, kind });
  if (action?.adjustment_id) update('comments', { id: cm.id }, { adjustment_id: action.adjustment_id });
  if (kind === 'pergunta') {
    const who = resolveAssignee(c.client_id, 'estrategia') || resolveAssignee(c.client_id, 'atendimento');
    const due = businessDaysFrom(new Date(now()), 1); due.setHours(21, 0, 0, 0);
    const task = insert('tasks', { id: uid('t_'), title: `Responder pergunta do cliente — ${c.title}`.slice(0, 200), description: body, client_id: c.client_id, content_id: c.id, function: 'estrategia', assignee_id: who, status: 'aberta', kind: 'follow_up', origin: 'automacao', source_type: 'comment', source_id: cm.id, priority: 'alta', due_at: due.toISOString(), created_by: req.user.id, created_at: now() });
    notify(who, { level: 'atencao', type: 'pergunta_cliente', title: `${clientOf(c).name} fez uma pergunta`, body: `#${c.number} ${c.title}: ${body.slice(0, 140)}`, link: `/conteudos/${c.id}`, content: c.id, client: c.client_id });
    log({ actor: req.user.id, action: 'pergunta.enviada', entity: 'comment', id: cm.id, client: c.client_id, content: c.id, visibility: 'client', summary: 'Você enviou uma pergunta — a The Bold vai responder aqui mesmo' });
    automation('pergunta.cliente', { entity: 'comment', id: cm.id, client: c.client_id, detail: task.id });
    action = { type: 'pergunta' };
  }
  if (intent === 'ajuste' && c.stage === 'publicado') {
    const team = all("SELECT DISTINCT user_id FROM client_members WHERE client_id=? AND function IN ('estrategia','atendimento')", c.client_id).map((r) => r.user_id);
    notify(team, { level: 'atencao', type: 'comentario_publicado', title: 'Pedido do cliente em conteúdo já publicado', body: `#${c.number} ${c.title}: ${body.slice(0, 120)}`, link: `/conteudos/${c.id}`, content: c.id, client: c.client_id });
  }
  res.json({ item: contentFor(c.id, clientOf(c)), action });
});
// Converter um comentário (já enviado) em pedido de ajuste — uma única vez por comentário
portal.post('/contents/:id/comments/:cid/convert', (req, res) => {
  const c = getMyContent(req);
  const cm = one("SELECT * FROM comments WHERE id=? AND content_id=? AND visibility='client'", req.params.cid, c.id);
  if (!cm || cm.author_id !== req.user.id) throw new HttpError(404, 'Comentário não encontrado.');
  // Idempotente: a segunda tentativa devolve o ajuste já existente (nada é criado de novo)
  if (cm.adjustment_id) return res.json({ item: contentFor(c.id, clientOf(c)), adjustment_id: cm.adjustment_id, already: true });
  if (cm.parent_id) throw new HttpError(422, 'Respostas não podem virar ajuste. Peça o ajuste no conteúdo.');
  const anchor = parseJSON(cm.anchor, {}) || {};
  const aspect = ADJUST_ASPECTS[req.body?.aspect] ? req.body.aspect : null;
  const r = tx(() => {
    const fresh = one('SELECT adjustment_id FROM comments WHERE id=?', cm.id);
    if (fresh.adjustment_id) return { adjustment: one('SELECT * FROM adjustments WHERE id=?', fresh.adjustment_id), mode: 'existente', already: true };
    const out = clientAdjustmentRequest(c.id, req.user, { note: cm.body, carousel_page: anchor.page || null, video_timestamp: anchor.t ?? null, aspect, region: anchor.region || null }, req);
    const adj = out.adjustment || one("SELECT * FROM adjustments WHERE content_id=? AND origin='cliente' ORDER BY created_at DESC LIMIT 1", c.id);
    update('comments', { id: cm.id }, { adjustment_id: adj.id, kind: 'ajuste' });
    update('adjustments', { id: adj.id }, { comment_id: cm.id });
    return { ...out, adjustment: adj };
  });
  if (!r.already) log({ actor: req.user.id, action: 'comentario.convertido_ajuste', entity: 'adjustment', id: r.adjustment.id, client: c.client_id, content: c.id, visibility: 'client', summary: 'Você transformou um comentário em pedido de ajuste' });
  res.json({ item: contentFor(c.id, clientOf(c)), mode: r.mode, adjustment_id: r.adjustment.id, already: !!r.already });
});
portal.post('/intent', (req, res) => res.json(detectAdjustment(req.body?.body)));
// CALENDÁRIO — o cliente visualiza, abre, comenta e aprova; nunca move datas nem edita o planejamento (só leitura aqui)
portal.get('/calendar', (req, res) => {
  const c = myClient(req);
  const items = all(`SELECT * FROM contents WHERE client_id=? AND (stage IN (${CLIENT_STAGES.map(() => '?').join(',')}) OR (stage='producao' AND current_version_id IS NULL)) AND planned_at IS NOT NULL ORDER BY planned_at`, c.id, ...CLIENT_STAGES)
    .map((x) => ({ id: x.id, title: x.title, format: x.format, date: x.scheduled_at || x.planned_at, status: publicStatus(x), can_like: ['aprovacao_tema', 'aprovacao_cliente'].includes(x.stage) && !x.blocked }));
  const upcoming = all("SELECT COUNT(*) n FROM contents WHERE client_id=? AND stage IN ('cronograma','analise_cronograma','ajuste_cronograma','producao','analise_producao','ajuste_interno') AND NOT (stage='producao' AND current_version_id IS NULL)", c.id)[0].n;
  const meetings = all("SELECT id, title, starts_at, ends_at FROM meetings WHERE client_id=? AND status='agendada'", c.id);
  const cycle = one("SELECT milestones FROM cycles WHERE client_id=? AND status<>'encerrado' ORDER BY month LIMIT 1", c.id);
  const ms = parseJSON(cycle?.milestones, {});
  const deadlines = Object.entries(ms).filter(([k]) => ['cliente_aprova_temas', 'cliente_aprova_final'].includes(k)).map(([k, m]) => ({ label: k === 'cliente_aprova_temas' ? 'Sua aprovação dos temas' : 'Sua aprovação dos conteúdos', start: m.start, end: m.end }));
  res.json({ items, meetings, in_preparation: upcoming, deadlines });
});
portal.get('/pendencias', (req, res) => {
  const c = myClient(req);
  const ob = one('SELECT * FROM onboarding WHERE client_id=?', c.id);
  const onboarding = ob ? all("SELECT id, kind, label, status, due_at, brain_section FROM onboarding_items WHERE onboarding_id=? AND who='cliente' ORDER BY sort", ob.id) : [];
  const approvals = all("SELECT id, number, title, stage, stage_entered_at FROM contents WHERE client_id=? AND stage IN ('aprovacao_tema','aprovacao_cliente')", c.id);
  const materials = all("SELECT id, number, title, block_reason, updated_at, planned_at FROM contents WHERE client_id=? AND blocked=1 AND waiting_on='cliente'", c.id);
  res.json({ onboarding, approvals, materials, onboarding_status: ob?.status, form_status: ob?.form_status });
});
// HISTÓRICO — cada evento abre o registro original
portal.get('/history', (req, res) => {
  const c = myClient(req);
  res.json(clientHistory(c.id, { limit: Math.min(Number(req.query.limit) || 60, 200), before: req.query.before || null }));
});

// FORMULÁRIO OFICIAL "Sua marca" — o cliente preenche na plataforma (rascunho salvo a cada resposta)
// Clientes migrados encontram as respostas que já deram no Notion: nada é perguntado de novo, só o que falta.
portal.get('/onboarding/form', (req, res) => {
  const c = myClient(req);
  const form = activeForm();
  if (!form) throw new HttpError(404, 'Formulário não configurado.');
  const st = formStatus(c.id);
  const ob = one('SELECT status FROM onboarding WHERE client_id=?', c.id);
  // Acessos nunca voltam para a tela: só a indicação de que já foram informados
  const answers = Object.fromEntries(Object.entries(st.answers).map(([k, a]) => [k, k.startsWith('acesso_') ? { saved: true, migrated: a.source_type === 'notion' } : { value: a.answer, updated_at: a.updated_at, migrated: a.source_type === 'notion', from_notion: a.source_type === 'notion' }]));
  res.json({ title: form.title, version: form.version, sections: form.sections.map((s) => ({ title: s.title, intro: s.intro || null, questions: s.questions.map(({ key, text, type, options, help, sensitive }) => ({ key, text, type, options, help: help && !/^(CAMPO SENSÍVEL|Linha |Checkboxes|Pode envolver|Resposta:)/.test(help) ? help : null, sensitive: !!sensitive, required: form.required_keys.includes(key) })) })),
    answers, status: st.status, submitted_at: st.submitted_at, answered: st.answered, total: st.total, missing_required: st.missing_required, missing_keys: st.missing_keys, profile: profileProgress(c.id), migrated: ob?.status === 'migrado' || st.status === 'migrado_parcial' });
});
portal.put('/onboarding/answers/:key', (req, res) => {
  const c = myClient(req);
  const form = activeForm();
  if (!questionOf(form, req.params.key)) throw new HttpError(404, 'Pergunta não encontrada.');
  const value = req.body?.value;
  if (typeof value !== 'string' && !Array.isArray(value)) throw new HttpError(422, 'Resposta inválida.');
  if (String(value).length > 20000) throw new HttpError(422, 'Resposta muito longa.');
  // Resposta editada na plataforma passa a ter a plataforma como origem; o valor anterior fica no histórico (antes/depois)
  saveAnswer(c.id, req.params.key, value, req.user, { origin: 'onboarding_cliente', source_type: 'plataforma' });
  run("UPDATE onboarding_answers SET source_type='plataforma' WHERE client_id=? AND question_key=? AND source_type='notion'", c.id, req.params.key);
  run("UPDATE onboarding SET form_status='em_andamento' WHERE client_id=? AND form_status='nao_iniciado'", c.id);
  if (req.params.key.startsWith('acesso_') && String(value).trim()) run("UPDATE onboarding_items SET status='recebido', received_at=? WHERE onboarding_id=(SELECT id FROM onboarding WHERE client_id=?) AND kind='acesso' AND status='pendente'", now(), c.id);
  const st = formStatus(c.id);
  res.json({ ok: true, answered: st.answered, total: st.total, profile: profileProgress(c.id), saved_at: now() });
});
portal.post('/onboarding/submit', (req, res) => {
  const c = myClient(req);
  const ob = one('SELECT * FROM onboarding WHERE client_id=?', c.id);
  const st = submitForm(c.id, req.user, () => ob && checkOnboardingComplete(ob.id, req.user));
  offerSatisfaction(c.id, 'onboarding', ob?.id || c.id, 'o seu onboarding');
  res.json({ ok: true, status: st.status, answered: st.answered, total: st.total });
});
// Item de onboarding (texto): dá baixa no item e registra no Client Brain com procedência — sem sobrescrever o que existe
portal.post('/onboarding/:itemId', (req, res) => {
  const c = myClient(req);
  const it = one("SELECT oi.* FROM onboarding_items oi JOIN onboarding ob ON ob.id=oi.onboarding_id WHERE oi.id=? AND ob.client_id=? AND oi.who='cliente'", req.params.itemId, c.id);
  if (!it) throw new HttpError(404, 'Item não encontrado.');
  const value = String(req.body?.value || '').trim();
  if (it.kind === 'formulario' && !value) throw new HttpError(422, 'Preencha a resposta.');
  update('onboarding_items', { id: it.id }, { status: 'recebido', value: value || it.value, received_at: now() });
  if (it.brain_section && value) insert('client_brain_entries', { id: uid('be_'), client_id: c.id, section: it.brain_section, label: it.label, content: value, origin: 'onboarding_cliente', source_type: 'plataforma', source_ref: `onboarding_item:${it.id}`, created_by: req.user.id, created_at: now() });
  log({ actor: req.user.id, action: 'onboarding.item', entity: 'onboarding_item', id: it.id, client: c.id, summary: `Você enviou: ${it.label}`, visibility: 'client' });
  notify(all("SELECT user_id FROM client_members WHERE client_id=? AND function IN ('estrategia','atendimento')", c.id).map((r) => r.user_id), { level: 'info', type: 'onboarding', title: `${c.name} enviou: ${it.label}`, link: `/clientes/${c.id}?tab=onboarding`, groupKey: `onb-rec:${c.id}`, client: c.id });
  checkOnboardingComplete(it.onboarding_id, req.user);
  res.json({ ok: true });
});

// SUA MARCA, COMO A THE BOLD ENTENDE + PULSO
portal.get('/brand', (req, res) => {
  const c = myClient(req);
  res.json({ sections: brandForClient(c.id), pulse: pulseForClient(c.id), profile: profileProgress(c.id) });
});
portal.post('/brand/:entryId/confirm', (req, res) => {
  const c = myClient(req);
  res.json(confirmBrand(req.params.entryId, c.id, req.user, req.body || {}));
});

// SOLICITAÇÕES — "+ NOVA SOLICITAÇÃO"
portal.get('/requests', (req, res) => {
  const c = myClient(req);
  res.json({ kinds: Object.fromEntries(Object.entries(REQUEST_KINDS).map(([k, v]) => [k, v.label])), items: all("SELECT * FROM client_requests WHERE client_id=? AND status<>'cancelado' ORDER BY CASE WHEN status='aguardando_cliente' THEN 0 WHEN status='concluido' THEN 2 ELSE 1 END, updated_at DESC", c.id).map(requestForClient) });
});
portal.post('/requests', upload.single('file'), async (req, res) => {
  const c = myClient(req);
  let file_id = null;
  if (req.file) file_id = (await ingestClientFile(req.file, c.id, req.user.id, { category: 'material' })).id;
  const r = createRequest(c.id, req.user, { kind: req.body?.kind, title: req.body?.title, description: req.body?.description, ref_type: req.body?.ref_type === 'conteudo' ? 'conteudo' : null, ref_id: req.body?.ref_type === 'conteudo' ? req.body?.ref_id : null, file_id });
  if (file_id) update('files', { id: file_id }, { context_type: 'solicitacao', context_id: r.id });
  res.json(requestForClient(r));
});
portal.post('/requests/:id/reply', upload.single('file'), async (req, res) => {
  const c = myClient(req);
  if (!one('SELECT 1 FROM client_requests WHERE id=? AND client_id=?', req.params.id, c.id)) throw new HttpError(404, 'Solicitação não encontrada.');
  let file_id = null;
  if (req.file) file_id = (await ingestClientFile(req.file, c.id, req.user.id, { category: 'material', context_type: 'solicitacao', context_id: req.params.id })).id;
  res.json(requestForClient(clientReply(req.params.id, c.id, req.user, { body: req.body?.body, file_id })));
});

// SATISFAÇÃO — "Como foi essa etapa?"
portal.post('/satisfaction/:id', (req, res) => { const c = myClient(req); res.json(answerSatisfaction(req.params.id, c.id, req.user, req.body || {})); });
portal.post('/satisfaction/:id/dismiss', (req, res) => { const c = myClient(req); res.json(dismissSatisfaction(req.params.id, c.id)); });

// MATERIAIS — solicitados · enviados · referências · arquivos do projeto. Nenhum material fica "solto": todo envio tem contexto.
const ctxLabel = (f) => {
  if (f.context_type === 'conteudo') { const x = one('SELECT title FROM contents WHERE id=?', f.context_id); return x ? `Conteúdo “${x.title}”` : null; }
  if (f.context_type === 'solicitacao') { const x = one('SELECT title FROM client_requests WHERE id=?', f.context_id); return x ? `Solicitação “${x.title}”` : null; }
  if (f.context_type === 'onboarding') { const x = one('SELECT label FROM onboarding_items WHERE id=?', f.context_id); return x ? x.label : 'Início do projeto'; }
  return null;
};
portal.get('/materials', (req, res) => {
  const c = myClient(req);
  const files = all("SELECT f.*, u.role_key uploader_role FROM files f LEFT JOIN users u ON u.id=f.uploaded_by WHERE f.client_id=? AND f.visibility='client' ORDER BY f.created_at DESC", c.id);
  const ob = one('SELECT id FROM onboarding WHERE client_id=?', c.id);
  const dto = (f) => ({ ...fileDTO(f), context: ctxLabel(f), category: f.category });
  res.json({
    requested: [
      ...all("SELECT id, number, title, block_reason reason, planned_at FROM contents WHERE client_id=? AND blocked=1 AND waiting_on='cliente'", c.id).map((x) => ({ kind: 'conteudo', id: x.id, key: `conteudo:${x.id}`, title: x.reason, context: `Para o conteúdo “${x.title}”`, due: x.planned_at })),
      ...(ob ? all("SELECT id, label, due_at FROM onboarding_items WHERE onboarding_id=? AND who='cliente' AND kind IN ('material','acesso') AND status='pendente'", ob.id).map((x) => ({ kind: 'onboarding', id: x.id, key: `onboarding:${x.id}`, title: x.label, context: 'Início do projeto', due: x.due_at })) : []),
      ...all("SELECT id, title, next_action FROM client_requests WHERE client_id=? AND status='aguardando_cliente'", c.id).map((x) => ({ kind: 'solicitacao', id: x.id, key: `solicitacao:${x.id}`, title: x.next_action || x.title, context: `Solicitação “${x.title}”`, due: null })),
    ],
    sent: files.filter((f) => f.uploader_role === 'cliente' && f.category !== 'referencia').map(dto),
    references: files.filter((f) => f.uploader_role === 'cliente' && f.category === 'referencia').map(dto),
    from_team: files.filter((f) => f.uploader_role !== 'cliente').map(dto),
    open_contents: all("SELECT id, title FROM contents WHERE client_id=? AND stage NOT IN ('publicado','cancelado','cronograma','analise_cronograma','ajuste_cronograma') ORDER BY planned_at LIMIT 40", c.id),
  });
});
// context: conteudo:<id> | onboarding:<id> | solicitacao:<id> | referencia | novo (cria uma solicitação de material — nada fica solto)
portal.post('/materials', upload.array('files', 20), async (req, res) => {
  const c = myClient(req);
  let ctx = String(req.body.context || '');
  // compatibilidade com o envio antigo
  if (!ctx && req.body.content_id) ctx = `conteudo:${req.body.content_id}`;
  if (!ctx && req.body.onboarding_item) ctx = `onboarding:${req.body.onboarding_item}`;
  const [type, id] = ctx.split(':');
  if (!['conteudo', 'onboarding', 'solicitacao', 'referencia', 'novo'].includes(type)) { await Promise.all((req.files || []).map((f) => fsp.unlink(f.path).catch(() => {}))); throw new HttpError(422, 'Diga para que é este material.'); }
  const note = String(req.body.note || '').trim();
  let content = null, item = null, request = null;
  if (type === 'conteudo') content = one("SELECT * FROM contents WHERE id=? AND client_id=?", id, c.id);
  if (type === 'onboarding') item = one("SELECT oi.* FROM onboarding_items oi JOIN onboarding ob ON ob.id=oi.onboarding_id WHERE oi.id=? AND ob.client_id=?", id, c.id);
  if (type === 'solicitacao') request = one('SELECT * FROM client_requests WHERE id=? AND client_id=?', id, c.id);
  if ((type === 'conteudo' && !content) || (type === 'onboarding' && !item) || (type === 'solicitacao' && !request)) throw new HttpError(404, 'Pedido não encontrado.');
  if (!req.files?.length) throw new HttpError(422, 'Nenhum arquivo enviado.');
  if (type === 'novo') request = createRequest(c.id, req.user, { kind: 'material', title: note ? note.slice(0, 120) : `Envio de ${req.files.length} material(is)`, description: note || null });
  const ctxType = type === 'novo' ? 'solicitacao' : type === 'referencia' ? null : type;
  const ctxId = content?.id || item?.id || request?.id || null;
  const out = [];
  for (const f of req.files) out.push(await ingestClientFile(f, c.id, req.user.id, { category: type === 'referencia' ? 'referencia' : 'material', context_type: ctxType, context_id: ctxId }));
  const names = out.map((f) => f.original_name).join(', ').slice(0, 160);
  // Retira a pendência correspondente
  if (content?.blocked && content.waiting_on === 'cliente') unblockContent(content.id, null, `material enviado pelo cliente (${out.length} arquivo(s))`);
  if (item) { update('onboarding_items', { id: item.id }, { status: 'recebido', value: out.map((f) => f.original_name).join(', '), received_at: now() }); checkOnboardingComplete(item.onboarding_id, req.user); }
  if (request && type === 'solicitacao') clientReply(request.id, c.id, req.user, { body: note || `Enviei ${out.length} arquivo(s): ${names}`, file_id: out[0].id });
  log({ actor: req.user.id, action: 'material.recebido', entity: 'file', id: out[0].id, client: c.id, content: content?.id || null, visibility: 'client',
    summary: `Você enviou ${out.length} ${type === 'referencia' ? 'referência(s)' : 'material(is)'}${content ? ` para “${content.title}”` : request ? ` (solicitação “${request.title}”)` : item ? ` (${item.label})` : ''}: ${names}` });
  const owner = content ? one("SELECT assignee_id FROM tasks WHERE content_id=? AND status IN ('aberta','em_andamento') AND assignee_id IS NOT NULL ORDER BY created_at DESC LIMIT 1", content.id)?.assignee_id : request?.assigned_to;
  notify([owner, ...all("SELECT user_id FROM client_members WHERE client_id=? AND function IN ('estrategia','atendimento')", c.id).map((r) => r.user_id)], { level: 'info', type: 'material', title: `Material recebido de ${c.name}`, body: `${out.length} arquivo(s)${content ? ` · ${content.title}` : request ? ` · ${request.title}` : ''}`, link: content ? `/conteudos/${content.id}` : `/clientes/${c.id}?tab=arquivos`, groupKey: `mat:${c.id}`, client: c.id });
  res.json(out.map(fileDTO));
});

// REUNIÕES — próxima reunião (data, horário, participantes, pauta), anteriores com decisões e próximos passos do RESUMO DO CLIENTE aprovado.
// O resumo interno nunca sai daqui.
const firstName = (n) => String(n || '').split(' ')[0];
portal.get('/meetings', (req, res) => {
  const c = myClient(req);
  const rows = all("SELECT id, title, kind, starts_at, ends_at, location, status, agenda FROM meetings WHERE client_id=? AND status<>'cancelada' ORDER BY starts_at DESC", c.id);
  res.json({
    meetings: rows.map((m) => {
      const s = one("SELECT content, published_at FROM meeting_summaries WHERE meeting_id=? AND audience='client' AND status='publicado' ORDER BY version DESC LIMIT 1", m.id);
      return { ...m, participants: all('SELECT u.name, u.role_key FROM meeting_attendees a JOIN users u ON u.id=a.user_id WHERE a.meeting_id=? AND u.active=1', m.id).map((p) => (p.role_key === 'cliente' ? p.name : `${firstName(p.name)} · The Bold`)),
        summary: s ? { ...parseJSON(s.content, {}), published_at: s.published_at } : null };
    }),
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
// Conversa com a equipe (canal do cliente) + conteúdos que podem ser incorporados numa mensagem
portal.get('/channel', (req, res) => {
  const c = myClient(req);
  const ch = one("SELECT id FROM channels WHERE client_id=? AND kind='cliente'", c.id);
  res.json({ channel_id: ch?.id || null, contents: all(`SELECT id, title, format FROM contents WHERE client_id=? AND (stage IN (${CLIENT_STAGES.map(() => '?').join(',')})) ORDER BY planned_at DESC LIMIT 40`, c.id, ...CLIENT_STAGES) });
});
