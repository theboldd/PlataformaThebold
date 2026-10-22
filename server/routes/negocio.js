// NEGÓCIO — CRM + Financeiro numa área só: Recebimentos, Produção & Repasses, Custos, Metas, Rentabilidade e Configuração.
// Permissões no servidor: financeiro (recebimentos, custos, metas, rentabilidade) · repasses (valores e fechamento — só a CEO concede).
import { Router } from 'express';
import { one, all, insert, update, uid, now } from '../db.js';
import { requireInternal, requirePerm } from '../lib/auth.js';
import { can, HttpError } from '../lib/permissions.js';
import { log } from '../lib/core.js';
import { mailConfigured } from '../services/mail.js';
import * as N from '../services/negocio.js';

export const negocio = Router();
const guard = [requireInternal];
const ym = (q) => (N.validMonth(q) ? q : N.currentMonth());

// ── Recebimentos ──
negocio.get('/negocio/recebimentos', ...guard, requirePerm('financeiro', 'view'), (_req, res) => res.json({ ...N.receivables(), status: N.INVOICE_STATUS }));
negocio.put('/negocio/clientes/:id/cobranca', ...guard, requirePerm('financeiro', 'edit'), (req, res) => res.json(N.saveBilling(req.params.id, req.body || {}, req.user)));
negocio.post('/negocio/parcelas/:id/:action', ...guard, requirePerm('financeiro', 'edit'), async (req, res) => res.json(await N.invoiceAction(req.params.id, req.params.action, req.body || {}, req.user)));
negocio.post('/negocio/recebimentos/rotina', ...guard, requirePerm('financeiro', 'admin'), async (req, res) => {
  const r = await N.billingRoutine();
  log({ actor: req.user.id, action: 'financeiro.rotina_manual', entity: 'billing', summary: `Rotina de cobrança executada manualmente: ${JSON.stringify(r)}` });
  res.json(r);
});

// ── Produção & Repasses ──
negocio.get('/negocio/repasses', ...guard, requirePerm('repasses', 'view'), (req, res) => {
  const c = ym(req.query.competencia);
  const closing = N.closingOf(c);
  const live = N.apuracao(c);
  const frozen = closing?.status === 'fechado' && closing.snapshot;
  res.json({
    competencia: c, closing, flow: N.CLOSING_FLOW, closing_labels: N.CLOSING_LABEL, exec_labels: N.EXEC,
    apuracao: frozen ? { ...live, people: closing.snapshot.people, lines: closing.snapshot.lines, adjustments: closing.snapshot.adjustments, motivos: closing.snapshot.motivos, totals: closing.totals, frozen_at: closing.snapshot.frozen_at } : live,
    frozen: !!frozen,
    daily: all('SELECT * FROM payout_daily WHERE competencia=? ORDER BY date DESC LIMIT 31', c),
    closings: all('SELECT competencia, status, report_sent_at, report_error, updated_at FROM payout_closings ORDER BY competencia DESC LIMIT 24').map((x) => ({ ...x, label: N.CLOSING_LABEL[x.status] })),
    rates: all('SELECT r.*, u.name user_name, c.name client_name FROM payout_rates r LEFT JOIN users u ON u.id=r.user_id LEFT JOIN clients c ON c.id=r.client_id ORDER BY r.active DESC, r.starts_at DESC'),
    people: all("SELECT id, name, functions FROM users WHERE active=1 AND role_key<>'cliente' ORDER BY name"),
    clients: all("SELECT id, name FROM clients WHERE kind<>'interno' ORDER BY name"),
    config: { dia_fechamento: N.finSetting('fin.dia_fechamento'), email_relatorio: N.finSetting('fin.email_relatorio'), motivos: N.finSetting('fin.repasse_motivos_contabilizados') },
    can: { edit: can(req.user, 'repasses', 'edit'), approve: can(req.user, 'repasses', 'approve') },
  });
});
negocio.post('/negocio/repasses/valores', ...guard, requirePerm('repasses', 'edit'), (req, res) => {
  const b = req.body || {};
  const value = Number(b.value);
  if (!(value >= 0) || b.value === '' || b.value == null) throw new HttpError(422, 'Informe o valor (R$).');
  if (!b.starts_at || Number.isNaN(Date.parse(b.starts_at))) throw new HttpError(422, 'Informe o início da vigência.');
  if (!b.user_id && !b.function && !b.task_kind && !b.client_id) throw new HttpError(422, 'Defina a quem a regra se aplica (pessoa, função, tipo de demanda ou cliente).');
  const r = insert('payout_rates', { id: uid('pr_'), user_id: b.user_id || null, function: b.function || null, task_kind: b.task_kind || null, client_id: b.client_id || null, value, starts_at: b.starts_at.slice(0, 10), ends_at: b.ends_at ? b.ends_at.slice(0, 10) : null, active: 1, note: b.note || null, created_by: req.user.id, created_at: now() });
  log({ actor: req.user.id, action: 'repasse.valor', entity: 'payout_rate', id: r.id, summary: `Valor de repasse cadastrado: R$ ${value} (vigência a partir de ${r.starts_at})`, after: JSON.stringify(r) });
  res.json(r);
});
negocio.post('/negocio/repasses/valores/:id/encerrar', ...guard, requirePerm('repasses', 'edit'), (req, res) => {
  const r = one('SELECT * FROM payout_rates WHERE id=?', req.params.id);
  if (!r) throw new HttpError(404, 'Regra não encontrada.');
  // Encerrar a vigência (o histórico já apurado não muda): nunca apaga a regra
  const end = req.body?.ends_at ? req.body.ends_at.slice(0, 10) : now().slice(0, 10);
  update('payout_rates', { id: r.id }, { ends_at: end, active: req.body?.desativar ? 0 : r.active });
  log({ actor: req.user.id, action: 'repasse.valor_encerrado', entity: 'payout_rate', id: r.id, summary: `Vigência de valor de repasse encerrada em ${end}`, before: JSON.stringify(r) });
  res.json({ ok: true });
});
negocio.post('/negocio/repasses/ajustes', ...guard, requirePerm('repasses', 'edit'), (req, res) => {
  const b = req.body || {};
  if (!N.validMonth(b.competencia)) throw new HttpError(422, 'Competência inválida.');
  if (N.closingOf(b.competencia)?.status === 'fechado') throw new HttpError(409, 'Competência fechada: reabra antes de lançar ajuste.');
  if (!b.user_id || !Number.isFinite(Number(b.amount)) || !b.reason?.trim()) throw new HttpError(422, 'Pessoa, valor e motivo são obrigatórios.');
  const a = insert('payout_adjustments', { id: uid('pa_'), competencia: b.competencia, user_id: b.user_id, amount: Number(b.amount), reason: b.reason.trim(), created_by: req.user.id, created_at: now() });
  log({ actor: req.user.id, action: 'repasse.ajuste', entity: 'payout_adjustment', id: a.id, summary: `Ajuste de repasse ${b.competencia}: R$ ${a.amount} — ${a.reason}`, after: JSON.stringify(a) });
  res.json(a);
});
negocio.post('/negocio/repasses/ajustes/:id/revogar', ...guard, requirePerm('repasses', 'edit'), (req, res) => {
  const a = one('SELECT * FROM payout_adjustments WHERE id=?', req.params.id);
  if (!a || a.revoked_at) throw new HttpError(404, 'Ajuste não encontrado.');
  if (N.closingOf(a.competencia)?.status === 'fechado') throw new HttpError(409, 'Competência fechada: reabra antes.');
  update('payout_adjustments', { id: a.id }, { revoked_at: now(), revoked_by: req.user.id });
  log({ actor: req.user.id, action: 'repasse.ajuste_revogado', entity: 'payout_adjustment', id: a.id, summary: `Ajuste de repasse revogado: R$ ${a.amount} — ${a.reason}`, before: JSON.stringify(a) });
  res.json({ ok: true });
});
negocio.post('/negocio/repasses/:ym/status', ...guard, requirePerm('repasses', 'edit'), async (req, res) => {
  res.json(await N.moveClosing(req.params.ym, req.body?.to, req.user, { canApprove: can(req.user, 'repasses', 'approve'), note: req.body?.note }));
});
negocio.post('/negocio/repasses/:ym/relatorio', ...guard, requirePerm('repasses', 'edit'), async (req, res) => {
  const r = await N.sendClosingReport(req.params.ym);
  log({ actor: req.user.id, action: 'repasse.relatorio', entity: 'payout_closing', id: req.params.ym, summary: `Relatório de repasses ${req.params.ym}: ${r.sent ? 'enviado' : `não enviado — ${r.error}`}` });
  res.json(r);
});

// ── Custos ──
negocio.get('/negocio/custos', ...guard, requirePerm('financeiro', 'view'), (req, res) => {
  const c = ym(req.query.competencia);
  res.json({ competencia: c, items: N.costsOf(c), categories: N.COST_CATEGORIES, all: all('SELECT f.*, c.name client_name FROM finance_costs f LEFT JOIN clients c ON c.id=f.client_id ORDER BY f.active DESC, f.created_at DESC LIMIT 200'),
    clients: all("SELECT id, name FROM clients WHERE kind<>'interno' ORDER BY name") });
});
negocio.post('/negocio/custos', ...guard, requirePerm('financeiro', 'edit'), (req, res) => {
  const b = req.body || {};
  if (!b.description?.trim() || !N.COST_CATEGORIES[b.category] || !(Number(b.amount) > 0)) throw new HttpError(422, 'Descrição, categoria e valor são obrigatórios.');
  if (b.kind === 'recorrente' ? !b.starts_at : !N.validMonth(b.competencia)) throw new HttpError(422, b.kind === 'recorrente' ? 'Informe o início do custo recorrente.' : 'Informe a competência (AAAA-MM).');
  const r = insert('finance_costs', { id: uid('fc_'), description: b.description.trim(), category: b.category, kind: b.kind === 'recorrente' ? 'recorrente' : 'unico', amount: Number(b.amount),
    competencia: b.kind === 'recorrente' ? null : b.competencia, starts_at: b.kind === 'recorrente' ? b.starts_at.slice(0, 10) : null, ends_at: b.ends_at ? b.ends_at.slice(0, 10) : null, client_id: b.client_id || null, active: 1, created_by: req.user.id, created_at: now() });
  log({ actor: req.user.id, action: 'financeiro.custo', entity: 'finance_cost', id: r.id, client: r.client_id, summary: `Custo cadastrado: ${r.description} (R$ ${r.amount})`, after: JSON.stringify(r) });
  res.json(r);
});
negocio.post('/negocio/custos/:id/desativar', ...guard, requirePerm('financeiro', 'edit'), (req, res) => {
  const r = one('SELECT * FROM finance_costs WHERE id=?', req.params.id);
  if (!r) throw new HttpError(404, 'Custo não encontrado.');
  update('finance_costs', { id: r.id }, { active: 0, ends_at: r.kind === 'recorrente' ? now().slice(0, 10) : r.ends_at });
  log({ actor: req.user.id, action: 'financeiro.custo_desativado', entity: 'finance_cost', id: r.id, summary: `Custo desativado: ${r.description}`, before: JSON.stringify(r) });
  res.json({ ok: true });
});

// ── Metas ──
negocio.get('/negocio/metas', ...guard, requirePerm('financeiro', 'view'), (req, res) => res.json(N.metas(ym(req.query.competencia))));
negocio.put('/negocio/metas', ...guard, requirePerm('financeiro', 'edit'), (req, res) => {
  const b = req.body || {};
  if (!N.validMonth(b.competencia) || !['faturado', 'recebido', 'novos_clientes', 'margem'].includes(b.metric) || !Number.isFinite(Number(b.target))) throw new HttpError(422, 'Competência, métrica e meta são obrigatórias.');
  const before = one('SELECT * FROM finance_goals WHERE competencia=? AND metric=?', b.competencia, b.metric);
  if (before) update('finance_goals', { id: before.id }, { target: Number(b.target) });
  else insert('finance_goals', { id: uid('fg_'), competencia: b.competencia, metric: b.metric, target: Number(b.target), created_by: req.user.id, created_at: now() });
  log({ actor: req.user.id, action: 'financeiro.meta', entity: 'finance_goal', id: `${b.competencia}:${b.metric}`, summary: `Meta ${b.metric} de ${b.competencia}: ${b.target}`, before: before ? String(before.target) : null, after: String(b.target) });
  res.json(N.metas(b.competencia));
});

// ── Rentabilidade (valores de repasse só para quem tem a permissão de repasses) ──
negocio.get('/negocio/rentabilidade', ...guard, requirePerm('financeiro', 'view'), (req, res) => {
  const r = N.rentabilidade(ym(req.query.competencia));
  if (!can(req.user, 'repasses', 'view')) {
    r.repasses = null; r.margem = null; r.states.repasses = 'restrito'; r.states.margem = 'restrito';
    r.clients = r.clients.map((c) => ({ ...c, repasses: null, margem: null, custo_retrabalho: null }));
  }
  res.json(r);
});

// ── Configuração financeira ──
negocio.get('/negocio/config', ...guard, requirePerm('financeiro', 'view'), (req, res) => res.json({ config: N.finConfig(), can_edit: can(req.user, 'financeiro', 'admin'), can_repasses: can(req.user, 'repasses', 'admin'), mail: { configured: mailConfigured(), from: process.env.BOLD_MAIL_FROM || null } }));
negocio.put('/negocio/config', ...guard, requirePerm('financeiro', 'admin'), (req, res) => {
  const changed = N.saveFinConfig(req.body || {}, req.user, can(req.user, 'repasses', 'admin'));
  res.json({ changed, config: N.finConfig() });
});
