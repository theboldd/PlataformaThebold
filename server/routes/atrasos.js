// REVISÃO DE ATRASOS — fatos de cada item atrasado herdado e classificação feita por pessoa autorizada.
// Restrito (permissão "atrasos": CEO e quem ela liberar). Nada aqui alimenta performance até ser classificado.
import { Router } from 'express';
import { tx } from '../db.js';
import { requireInternal, requirePerm } from '../lib/auth.js';
import { CATEGORIES, ATTRIBUTIONS, listReviews, historyOf, classify, reschedule, cancelItem, syncDelayReviews } from '../services/delayReview.js';
import { can } from '../lib/permissions.js';

export const atrasos = Router();
const view = [requireInternal, requirePerm('atrasos', 'view')];
const edit = [requireInternal, requirePerm('atrasos', 'edit')];

atrasos.get('/atrasos', view, (req, res) => {
  syncDelayReviews();
  const items = listReviews();
  const by = (k) => items.reduce((m, i) => ((m[i[k]] = (m[i[k]] || 0) + 1), m), {});
  res.json({ items, categories: Object.entries(CATEGORIES).map(([key, v]) => ({ key, ...v })), attributions: ATTRIBUTIONS,
    counts: { total: items.length, pendentes: items.filter((i) => !i.decided_by).length, by_category: by('category'), by_attribution: by('attribution') },
    can_edit: can(req.user, 'atrasos', 'edit'), can_cancel: can(req.user, 'conteudos', 'approve') });
});
atrasos.get('/atrasos/:taskId/historico', view, (req, res) => res.json(historyOf(req.params.taskId)));
atrasos.put('/atrasos/:taskId', edit, (req, res) => res.json(classify(req.params.taskId, req.user, req.body || {}, req.ip)));
// Lote: mesma categoria e mesma evidência para vários itens (cada item recebe o próprio registro no histórico)
atrasos.post('/atrasos/lote', edit, (req, res) => {
  const ids = Array.isArray(req.body?.task_ids) ? req.body.task_ids : [];
  res.json({ ok: tx(() => ids.map((id) => classify(id, req.user, req.body, req.ip)).length) });
});
atrasos.post('/atrasos/:taskId/reprogramar', edit, (req, res) => res.json(reschedule(req.params.taskId, req.user, req.body || {}, req.ip)));
atrasos.post('/atrasos/:taskId/cancelar', edit, (req, res) => res.json(cancelItem(req.params.taskId, req.user, req.body || {}, req.ip)));
