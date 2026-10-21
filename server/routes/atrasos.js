// REVISÃO DE ITENS LEGADOS (regra oficial 22) — fatos de cada item herdado e decisão individual por pessoa autorizada.
// Restrito (permissão "atrasos": CEO e quem ela liberar). Três ações apenas, item a item: reprogramar · cancelar · manter como histórico.
import { Router } from 'express';
import { all } from '../db.js';
import { requireInternal, requirePerm } from '../lib/auth.js';
import { DECISIONS, listReviews, historyOf, reprogramLegacy, cancelLegacy, keepAsHistory, syncDelayReviews } from '../services/delayReview.js';
import { can } from '../lib/permissions.js';
import { STAGE_ORDER, STAGES } from '../engine/process.js';

export const atrasos = Router();
const view = [requireInternal, requirePerm('atrasos', 'view')];
const edit = [requireInternal, requirePerm('atrasos', 'edit')];

atrasos.get('/atrasos', view, (req, res) => {
  syncDelayReviews();
  const items = listReviews();
  const by = items.reduce((m, i) => ((m[i.decision] = (m[i.decision] || 0) + 1), m), {});
  res.json({ items, decisions: DECISIONS, counts: { total: items.length, pendentes: by.nao_validado || 0, by_decision: by },
    stages: STAGE_ORDER.filter((k) => !['cancelado', 'publicado'].includes(k)).map((k) => ({ key: k, label: STAGES[k].label })),
    people: all("SELECT id, name FROM users WHERE active=1 AND role_key<>'cliente' ORDER BY name"),
    can_edit: can(req.user, 'atrasos', 'edit'), can_cancel: can(req.user, 'conteudos', 'approve') });
});
atrasos.get('/atrasos/:taskId/historico', view, (req, res) => res.json(historyOf(req.params.taskId)));
atrasos.post('/atrasos/:taskId/reprogramar', edit, (req, res) => res.json(reprogramLegacy(req.params.taskId, req.user, req.body || {}, req.ip)));
atrasos.post('/atrasos/:taskId/cancelar', edit, (req, res) => res.json(cancelLegacy(req.params.taskId, req.user, req.body || {}, req.ip)));
atrasos.post('/atrasos/:taskId/historico', edit, (req, res) => res.json(keepAsHistory(req.params.taskId, req.user, req.body || {}, req.ip)));
