// SALA DE REVISÃO por cliente (Rebeca · Raísa · Vitória).
// Fluxo: escolher cliente → revisar cada conteúdo (decisão/ajustes/comentários ficam em RASCUNHO da rodada)
// → "Finalizar revisão do cliente": aplica tudo de uma vez pelo Process Engine e só então a equipe vê comentários e ajustes.
import { Router } from 'express';
import { one, all, insert, update, run, uid, now, parseJSON, tx } from '../db.js';
import { requireInternal, requirePerm } from '../lib/auth.js';
import { can, canAccessClient, assertClient, scopeSQL, HttpError } from '../lib/permissions.js';
import { log, notify, userName } from '../lib/core.js';
import { STAGES, reviewDecision, versionMedia } from '../engine/process.js';
import { fileDTO } from '../services/media.js';
import { addComment, contentCard } from './ops.js';

export const review = Router();
const guard = [requireInternal, requirePerm('revisao', 'view')];
const REVIEW_STAGES = ['analise_cronograma', 'analise_producao', 'revisao_ajuste'];
const IN = REVIEW_STAGES.map(() => '?').join(',');

const openSession = (clientId) => one("SELECT * FROM review_sessions WHERE client_id=? AND status='aberta'", clientId);
function ensureSession(clientId, user) {
  return openSession(clientId) || insert('review_sessions', { id: uid('rs_'), client_id: clientId, status: 'aberta', opened_by: user.id, opened_at: now() });
}
const draftDTO = (d) => d && ({ ...d, adjustments: parseJSON(d.adjustments, []), comments: parseJSON(d.comments, []), reviewer_name: userName(d.reviewer_id) });
function reviewableContent(clientId, contentId, user) {
  const c = one(`SELECT * FROM contents WHERE id=? AND client_id=? AND stage IN (${IN})`, contentId, clientId, ...REVIEW_STAGES);
  if (!c) throw new HttpError(409, 'Este conteúdo não está mais aguardando revisão.');
  const ok = c.stage === 'revisao_ajuste' ? (can(user, 'revisao', 'approve') || !!one("SELECT 1 FROM client_members WHERE user_id=? AND client_id=? AND function='estrategia'", user.id, clientId)) : can(user, 'revisao', 'approve');
  if (!ok) throw new HttpError(403, 'A decisão desta revisão é de quem revisa.');
  return c;
}

// Clientes com conteúdos aguardando revisão
review.get('/review/clients', ...guard, (req, res) => {
  const sc = scopeSQL(req.user, 'c.client_id');
  const rows = all(`SELECT cl.id, cl.name, cl.handle, COUNT(*) pending, MIN(c.stage_entered_at) oldest, MIN(c.planned_at) next_publish,
      SUM(c.stage='analise_cronograma') cronograma, SUM(c.stage='analise_producao') producao, SUM(c.stage='revisao_ajuste') ajuste
    FROM contents c JOIN clients cl ON cl.id=c.client_id WHERE ${sc.sql} AND c.stage IN (${IN}) GROUP BY cl.id ORDER BY oldest`, ...sc.params, ...REVIEW_STAGES);
  res.json(rows.map((r) => {
    const s = openSession(r.id);
    const drafts = s ? all('SELECT d.decision, d.reviewer_id FROM review_drafts d JOIN contents c ON c.id=d.content_id WHERE d.session_id=? AND c.stage IN (' + IN + ')', s.id, ...REVIEW_STAGES) : [];
    const thumbs = all(`SELECT id FROM contents WHERE client_id=? AND stage IN (${IN}) ORDER BY planned_at LIMIT 4`, r.id, ...REVIEW_STAGES).map((c) => contentCard(one('SELECT * FROM contents WHERE id=?', c.id)).thumb).filter(Boolean);
    return { ...r, thumbs, session: s ? { id: s.id, opened_at: s.opened_at, opened_by: userName(s.opened_by), decided: drafts.filter((d) => d.decision).length, reviewers: [...new Set(drafts.map((d) => userName(d.reviewer_id)).filter(Boolean))] } : null };
  }));
});

// Sala do cliente: conteúdos em revisão + rascunhos da rodada
review.get('/review/clients/:id', ...guard, (req, res) => {
  assertClient(req.user, req.params.id);
  const client = one('SELECT id, name, handle FROM clients WHERE id=?', req.params.id);
  if (!client) throw new HttpError(404, 'Cliente não encontrado.');
  const s = openSession(client.id);
  const drafts = s ? Object.fromEntries(all('SELECT * FROM review_drafts WHERE session_id=?', s.id).map((d) => [d.content_id, draftDTO(d)])) : {};
  const items = all(`SELECT * FROM contents WHERE client_id=? AND stage IN (${IN}) ORDER BY CASE stage WHEN 'analise_cronograma' THEN 0 WHEN 'analise_producao' THEN 1 ELSE 2 END, planned_at`, client.id, ...REVIEW_STAGES).map((c) => ({
    ...contentCard(c, req.user), theme: c.theme, objective: c.objective, reference: c.reference, briefing: c.briefing,
    kind: c.stage === 'analise_producao' && c.revision_rounds > 0 ? 'Revisão do ajuste interno' : STAGES[c.stage].label,
    versions: all('SELECT * FROM content_versions WHERE content_id=? ORDER BY number DESC', c.id).map((v) => ({ ...v, media: versionMedia(v.id).map(fileDTO) })),
    adjustments: all('SELECT a.*, u.name assigned_name FROM adjustments a LEFT JOIN users u ON u.id=a.assigned_to WHERE a.content_id=? ORDER BY a.created_at DESC LIMIT 10', c.id),
    comments: all('SELECT cm.*, u.name author_name, u.role_key author_role FROM comments cm JOIN users u ON u.id=cm.author_id WHERE cm.content_id=? ORDER BY cm.created_at DESC LIMIT 20', c.id).map((x) => ({ ...x, anchor: parseJSON(x.anchor) })),
    producers: all("SELECT DISTINCT u.id, u.name, t.function FROM tasks t JOIN users u ON u.id=t.completed_by WHERE t.content_id=? AND t.function IN ('design','edicao','copy')", c.id),
    draft: drafts[c.id] || null,
    can_decide: c.stage === 'revisao_ajuste' ? (can(req.user, 'revisao', 'approve') || !!one("SELECT 1 FROM client_members WHERE user_id=? AND client_id=? AND function='estrategia'", req.user.id, client.id)) : can(req.user, 'revisao', 'approve'),
  }));
  res.json({ client, session: s ? { ...s, opened_by_name: userName(s.opened_by) } : null, items,
    history: all("SELECT * FROM review_sessions WHERE client_id=? AND status='finalizada' ORDER BY finished_at DESC LIMIT 5", client.id).map((h) => ({ ...h, summary: parseJSON(h.summary, {}), finished_by_name: userName(h.finished_by) })) });
});

// Decisão em rascunho (aprovar | ajuste) — não dispara nada ainda
review.put('/review/clients/:id/drafts/:contentId', ...guard, (req, res) => {
  assertClient(req.user, req.params.id);
  const c = reviewableContent(req.params.id, req.params.contentId, req.user);
  const { decision, note = null, adjustments = [] } = req.body || {};
  if (!['aprovar', 'ajuste', null].includes(decision ?? null)) throw new HttpError(422, 'Decisão inválida.');
  const adj = (adjustments || []).filter((a) => a.description?.trim()).map((a) => ({ description: a.description.trim(), track: a.track === 'legenda' ? 'legenda' : 'visual', assignee_id: a.assignee_id || null }));
  if (decision === 'ajuste' && !adj.length && !note?.trim()) throw new HttpError(422, 'Descreva o ajuste necessário.');
  tx(() => {
    const s = ensureSession(req.params.id, req.user);
    const ex = one('SELECT * FROM review_drafts WHERE session_id=? AND content_id=?', s.id, c.id);
    const row = { decision: decision ?? null, note: decision === 'ajuste' ? note : null, adjustments: JSON.stringify(decision === 'ajuste' ? adj : []), reviewer_id: req.user.id, updated_at: now() };
    if (ex) update('review_drafts', { session_id: s.id, content_id: c.id }, row);
    else insert('review_drafts', { session_id: s.id, content_id: c.id, comments: '[]', ...row });
  });
  res.json({ ok: true });
});
// Comentário da revisão (rascunho) — vira comentário interno ao finalizar
review.post('/review/clients/:id/drafts/:contentId/comments', ...guard, (req, res) => {
  assertClient(req.user, req.params.id);
  const c = reviewableContent(req.params.id, req.params.contentId, req.user);
  const body = String(req.body?.body || '').trim();
  if (!body) throw new HttpError(422, 'Escreva o comentário.');
  tx(() => {
    const s = ensureSession(req.params.id, req.user);
    const ex = one('SELECT * FROM review_drafts WHERE session_id=? AND content_id=?', s.id, c.id);
    const list = parseJSON(ex?.comments, []);
    list.push({ id: uid('rc_'), body, page: req.body.page ? Number(req.body.page) : null, author_id: req.user.id, author_name: req.user.name, at: now() });
    if (ex) update('review_drafts', { session_id: s.id, content_id: c.id }, { comments: JSON.stringify(list), updated_at: now() });
    else insert('review_drafts', { session_id: s.id, content_id: c.id, decision: null, comments: JSON.stringify(list), adjustments: '[]', reviewer_id: req.user.id, updated_at: now() });
  });
  res.json({ ok: true });
});
review.delete('/review/clients/:id/drafts/:contentId/comments/:commentId', ...guard, (req, res) => {
  assertClient(req.user, req.params.id);
  const s = openSession(req.params.id);
  const d = s && one('SELECT * FROM review_drafts WHERE session_id=? AND content_id=?', s.id, req.params.contentId);
  if (!d) throw new HttpError(404, 'Rascunho não encontrado.');
  update('review_drafts', { session_id: s.id, content_id: d.content_id }, { comments: JSON.stringify(parseJSON(d.comments, []).filter((x) => x.id !== req.params.commentId || x.author_id !== req.user.id)), updated_at: now() });
  res.json({ ok: true });
});

// FINALIZAR a revisão do cliente: aplica tudo de uma vez
review.post('/review/clients/:id/finish', ...guard, (req, res) => {
  assertClient(req.user, req.params.id);
  const s = openSession(req.params.id);
  if (!s) throw new HttpError(409, 'Nenhuma decisão registrada nesta rodada.');
  const client = one('SELECT name FROM clients WHERE id=?', req.params.id);
  const drafts = all('SELECT * FROM review_drafts WHERE session_id=?', s.id).map(draftDTO);
  if (!drafts.some((d) => d.decision || d.comments.length)) throw new HttpError(409, 'Nenhuma decisão ou comentário para aplicar.');
  const summary = { aprovados: [], ajustes: [], comentarios: 0, ignorados: [], pendentes: 0 };
  tx(() => {
    for (const d of drafts) {
      const c = one('SELECT * FROM contents WHERE id=?', d.content_id);
      if (!c || !REVIEW_STAGES.includes(c.stage)) { summary.ignorados.push(c ? `#${c.number}` : d.content_id); continue; }
      const reviewer = one('SELECT * FROM users WHERE id=?', d.reviewer_id) || req.user;
      // 1) comentários da revisão → comentários INTERNOS (menções notificam agora)
      for (const cm of d.comments) {
        const author = one('SELECT * FROM users WHERE id=?', cm.author_id) || req.user;
        addComment(c, author, { body: cm.body, visibility: 'internal', anchor: cm.page ? { page: cm.page } : null });
        summary.comentarios++;
      }
      // 2) decisão → Process Engine
      if (d.decision === 'aprovar') { reviewDecision(c.id, reviewer, { decision: 'aprovar' }, req); summary.aprovados.push(`#${c.number}`); }
      else if (d.decision === 'ajuste') { reviewDecision(c.id, reviewer, { decision: 'ajuste', note: d.note, adjustments: d.adjustments }, req); summary.ajustes.push(`#${c.number}`); }
    }
    summary.pendentes = one(`SELECT COUNT(*) n FROM contents WHERE client_id=? AND stage IN (${IN})`, req.params.id, ...REVIEW_STAGES).n;
    update('review_sessions', { id: s.id }, { status: 'finalizada', finished_by: req.user.id, finished_at: now(), summary: JSON.stringify(summary) });
  });
  const text = `${summary.aprovados.length} aprovado(s) → cliente · ${summary.ajustes.length} com ajuste · ${summary.comentarios} comentário(s)`;
  log({ actor: req.user.id, action: 'revisao.rodada_finalizada', entity: 'review_session', id: s.id, client: req.params.id, summary: `Revisão de ${client.name} finalizada por ${req.user.name}: ${text}` });
  const team = all("SELECT DISTINCT user_id FROM client_members WHERE client_id=? AND function IN ('estrategia','atendimento')", req.params.id).map((r) => r.user_id);
  notify(team, { level: summary.ajustes.length ? 'atencao' : 'info', type: 'revisao_rodada', title: `Revisão de ${client.name} concluída`, body: text, link: `/clientes/${req.params.id}?tab=conteudos`, client: req.params.id, exclude: req.user.id });
  res.json(summary);
});
