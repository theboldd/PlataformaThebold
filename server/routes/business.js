import { Router } from 'express';
import { one, all, insert, update, run, uid, now, parseJSON, tx } from '../db.js';
import { requireInternal, requirePerm } from '../lib/auth.js';
import { can, HttpError } from '../lib/permissions.js';
import { log, notify, userName } from '../lib/core.js';
import { automation } from '../engine/automations.js';
import { generateReport } from '../services/reports.js';
import { ask, AGENTS, aiConfigured, MODEL } from '../ai/gateway.js';
import { knowledgeProvider } from '../ai/memory.js';
import { PROVIDERS, integrationStatus, saveIntegration } from '../integrations/vault.js';
import * as gcal from '../integrations/google.js';
import * as meta from '../integrations/meta.js';
import * as slack from '../integrations/slack.js';
import { startClient } from './ops.js';

export const business = Router();
business.use(requireInternal);

// ═════════════ CRM COMERCIAL ═════════════
export const DEAL_STAGES = [
  { key: 'lead', label: 'Lead', p: 10 }, { key: 'contato', label: 'Contato', p: 20 }, { key: 'qualificacao', label: 'Qualificação', p: 30 }, { key: 'reuniao', label: 'Reunião', p: 45 },
  { key: 'proposta', label: 'Proposta', p: 60 }, { key: 'negociacao', label: 'Negociação', p: 75 }, { key: 'fechado', label: 'Fechado', p: 100 }, { key: 'onboarding', label: 'Onboarding', p: 100 }, { key: 'perdido', label: 'Perdido', p: 0 },
];
business.get('/crm', requirePerm('crm', 'view'), (_req, res) => {
  res.json({ stages: DEAL_STAGES, deals: all('SELECT d.*, u.name owner_name FROM deals d LEFT JOIN users u ON u.id=d.owner_id ORDER BY d.updated_at DESC'), people: all("SELECT id, name FROM users WHERE active=1 AND role_key IN ('ceo','comercial','operacoes','gestao')") });
});
business.post('/crm', requirePerm('crm', 'create'), (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) throw new HttpError(422, 'Informe o nome do negócio.');
  const st = DEAL_STAGES.find((s) => s.key === (b.stage || 'lead'));
  const d = insert('deals', { id: uid('dl_'), name: b.name.trim(), company: b.company, contact_name: b.contact_name, contact_channel: b.contact_channel, origin: b.origin, owner_id: b.owner_id || req.user.id, value: Number(b.value) || 0, service: b.service,
    stage: st.key, probability: st.p, last_interaction_at: now(), next_action: b.next_action || 'Primeiro contato', next_action_at: b.next_action_at ? new Date(b.next_action_at).toISOString() : new Date(Date.now() + 864e5).toISOString(), created_at: now(), updated_at: now() });
  log({ actor: req.user.id, action: 'crm.criado', entity: 'deal', id: d.id, summary: `Negócio “${d.name}” criado (${st.label})` });
  res.json(d);
});
business.patch('/crm/:id', requirePerm('crm', 'edit'), (req, res) => {
  const d = one('SELECT * FROM deals WHERE id=?', req.params.id);
  if (!d) throw new HttpError(404, 'Negócio não encontrado.');
  const allowed = ['name', 'company', 'contact_name', 'contact_channel', 'origin', 'owner_id', 'value', 'service', 'stage', 'probability', 'next_action', 'next_action_at', 'lost_reason', 'last_interaction_at'];
  const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
  if (patch.stage) { const st = DEAL_STAGES.find((s) => s.key === patch.stage); if (!st) throw new HttpError(422, 'Etapa inválida.'); if (patch.probability === undefined) patch.probability = st.p; if (patch.stage === 'perdido' && !patch.lost_reason) throw new HttpError(422, 'Informe o motivo da perda.'); }
  if (patch.next_action_at) patch.next_action_at = new Date(patch.next_action_at).toISOString();
  const result = tx(() => {
    update('deals', { id: d.id }, { ...patch, updated_at: now() });
    // Fechamento → cria cliente e inicia onboarding automaticamente (com confirmação humana: a ação de mover para "fechado")
    if (patch.stage === 'fechado' && !d.client_id) {
      const c = startClient({ name: d.company || d.name, services: d.service ? [d.service] : [], monthly_posts: 12, requires_theme_approval: true, team: [] }, req.user);
      update('deals', { id: d.id }, { client_id: c.id, stage: 'onboarding' });
      automation('crm.fechado', { entity: 'deal', id: d.id, client: c.id });
      notify(all("SELECT id FROM users WHERE role_key IN ('ceo','operacoes')").map((r) => r.id), { level: 'info', type: 'crm', title: `Negócio fechado: ${d.name}`, body: 'Cliente criado e onboarding iniciado. Vincule a equipe.', link: `/clientes/${c.id}?tab=equipe`, client: c.id });
      return { client_id: c.id };
    }
    return {};
  });
  log({ actor: req.user.id, action: 'crm.alterado', entity: 'deal', id: d.id, summary: `Negócio “${d.name}”: ${Object.keys(patch).join(', ')}`, before: JSON.stringify({ stage: d.stage }), after: JSON.stringify({ stage: patch.stage || d.stage }) });
  res.json({ ok: true, ...result });
});

// ═════════════ FINANCEIRO (acesso restrito) ═════════════
business.get('/finance', requirePerm('financeiro', 'view'), (_req, res) => {
  const m = new Date().toISOString().slice(0, 7);
  const sum = (sql, ...p) => one(sql, ...p).v;
  res.json({
    summary: {
      receita_recorrente: sum("SELECT COALESCE(SUM(monthly_value),0) v FROM contracts WHERE status='ativo'"),
      faturado_mes: sum('SELECT COALESCE(SUM(amount),0) v FROM invoices WHERE substr(due_at,1,7)=?', m),
      recebido_mes: sum('SELECT COALESCE(SUM(paid_amount),0) v FROM invoices WHERE substr(paid_at,1,7)=?', m),
      pendente: sum("SELECT COALESCE(SUM(amount),0) v FROM invoices WHERE status='aberta'"),
      atrasado: sum("SELECT COALESCE(SUM(amount),0) v FROM invoices WHERE status='atrasada'"),
    },
    upcoming: all("SELECT i.*, c.name client_name FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.status='aberta' ORDER BY i.due_at LIMIT 20"),
    overdue: all("SELECT i.*, c.name client_name FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.status='atrasada' ORDER BY i.due_at"),
    contracts: all('SELECT k.*, c.name client_name FROM contracts k JOIN clients c ON c.id=k.client_id ORDER BY c.name'),
    invoices: all('SELECT i.*, c.name client_name FROM invoices i JOIN clients c ON c.id=i.client_id ORDER BY i.due_at DESC LIMIT 200'),
    clients: all("SELECT id, name FROM clients WHERE status<>'encerrado' ORDER BY name"),
  });
});
business.post('/finance/contracts', requirePerm('financeiro', 'create'), (req, res) => {
  const { client_id, service, monthly_value, starts_at, ends_at, due_day = 10, months = 6 } = req.body || {};
  if (!client_id || !service || !(Number(monthly_value) > 0) || !starts_at) throw new HttpError(422, 'Cliente, serviço, valor e início são obrigatórios.');
  const k = tx(() => {
    const k = insert('contracts', { id: uid('ct_'), client_id, service, monthly_value: Number(monthly_value), starts_at, ends_at: ends_at || null, due_day: Number(due_day), status: 'ativo', created_at: now() });
    const [y, mm] = starts_at.split('-').map(Number);
    for (let i = 0; i < Number(months); i++) {
      const d = new Date(Date.UTC(y, mm - 1 + i, Math.min(Number(due_day), 28), 15));
      insert('invoices', { id: uid('iv_'), contract_id: k.id, client_id, description: `${service} — parcela ${i + 1}/${months}`, amount: Number(monthly_value), due_at: d.toISOString(), status: 'aberta', created_at: now() });
    }
    return k;
  });
  log({ actor: req.user.id, action: 'financeiro.contrato', entity: 'contract', id: k.id, client: client_id, summary: `Contrato criado (${service}) com ${months} parcelas` });
  res.json(k);
});
business.post('/finance/invoices/:id/pay', requirePerm('financeiro', 'edit'), (req, res) => {
  const i = one('SELECT * FROM invoices WHERE id=?', req.params.id);
  if (!i) throw new HttpError(404, 'Parcela não encontrada.');
  update('invoices', { id: i.id }, { status: 'paga', paid_at: req.body?.paid_at ? new Date(req.body.paid_at).toISOString() : now(), paid_amount: Number(req.body?.amount) || i.amount });
  log({ actor: req.user.id, action: 'financeiro.pagamento', entity: 'invoice', id: i.id, client: i.client_id, summary: `Pagamento registrado: ${i.description}`, before: i.status, after: 'paga' });
  res.json({ ok: true });
});

// ═════════════ RELATÓRIOS ═════════════
business.get('/reports', requirePerm('torre', 'view'), (req, res) => {
  const fin = can(req.user, 'financeiro');
  res.json(all('SELECT * FROM reports ORDER BY created_at DESC LIMIT 30').map((r) => { const d = parseJSON(r.data, {}); if (!fin) delete d.financeiro; return { ...r, data: d }; }));
});
business.post('/reports', requirePerm('torre', 'view'), (req, res) => {
  const days = Number(req.body?.days) || 7;
  const r = generateReport(req.body?.kind || 'operacao', new Date(Date.now() - days * 864e5).toISOString(), now());
  const d = parseJSON(r.data, {}); if (!can(req.user, 'financeiro')) delete d.financeiro;
  res.json({ ...r, data: d });
});

// ═════════════ THE BOLD BRAIN / AGENTES ═════════════
business.get('/brain/agents', requirePerm('brain', 'view'), (req, res) => {
  res.json({ configured: aiConfigured(), model: MODEL, knowledge_provider: knowledgeProvider().name,
    agents: Object.entries(AGENTS).map(([key, a]) => ({ key, ...a, available: a.modules.some((m) => can(req.user, m, 'view')) })),
    history: all("SELECT id, agent, prompt, status, created_at, client_id FROM ai_actions WHERE user_id=? ORDER BY created_at DESC LIMIT 20", req.user.id) });
});
business.post('/brain/ask', requirePerm('brain', 'view'), async (req, res) => {
  const { question, agent = 'brain', client_id, content_id } = req.body || {};
  if (!question?.trim()) throw new HttpError(422, 'Escreva a pergunta.');
  const r = await ask(req.user, agent, question.trim(), { clientId: client_id || null, contentId: content_id || null });
  log({ actor: req.user.id, kind: 'usuario', action: 'ia.consulta', entity: 'ai_action', client: client_id || null, content: content_id || null, summary: `Consulta ao ${AGENTS[agent]?.label}: ${question.slice(0, 100)} (${r.status})` });
  res.json(r);
});

// ═════════════ INTEGRAÇÕES ═════════════
business.get('/integrations', requirePerm('integracoes', 'view'), (_req, res) => {
  res.json({ providers: Object.keys(PROVIDERS).map(integrationStatus), public_base_url: !!process.env.PUBLIC_BASE_URL,
    clients: all("SELECT id, name, handle FROM clients WHERE status<>'encerrado' ORDER BY name") });
});
const ADAPTERS = { google_calendar: gcal, meta, slack };
business.post('/integrations/:provider/connect', requirePerm('integracoes', 'admin'), (req, res) => {
  const a = ADAPTERS[req.params.provider];
  if (!a) throw new HttpError(409, req.params.provider === 'google_drive' ? 'Google Drive: implementação aguardando aprovação da especificação (docs/integracoes/google-drive.md).' : 'Provedor sem fluxo de conexão.');
  res.json({ url: a.authUrl(req.user.id) });
});
business.post('/integrations/:provider/disconnect', requirePerm('integracoes', 'admin'), async (req, res) => {
  if (req.params.provider === 'google_calendar') await gcal.disconnect();
  else saveIntegration(req.params.provider, { status: 'desconectado', secret_enc: null, account_label: null });
  log({ actor: req.user.id, action: 'integracao.desconectada', entity: 'integration', id: req.params.provider, summary: `${PROVIDERS[req.params.provider]?.label} desconectado` });
  res.json({ ok: true });
});
business.put('/integrations/:provider/config', requirePerm('integracoes', 'admin'), (req, res) => {
  const cur = integrationStatus(req.params.provider).config || {};
  const allowed = { meta: ['client_map'], slack: ['mirror_channel'], google_calendar: ['calendar_id'] }[req.params.provider] || [];
  const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
  saveIntegration(req.params.provider, { config: JSON.stringify({ ...cur, ...patch }) });
  log({ actor: req.user.id, action: 'integracao.config', entity: 'integration', id: req.params.provider, summary: `Configuração de ${PROVIDERS[req.params.provider]?.label} alterada (${Object.keys(patch).join(', ')})` });
  res.json({ ok: true });
});
// Callbacks OAuth (redirecionam de volta para a tela de Integrações)
export async function oauthCallback(provider, req, res) {
  const a = ADAPTERS[provider];
  try {
    if (req.query.error) throw new Error(String(req.query.error_description || req.query.error));
    const userId = await a.handleCallback({ code: req.query.code, state: req.query.state });
    log({ actor: userId, action: 'integracao.conectada', entity: 'integration', id: provider, summary: `${PROVIDERS[provider].label} conectado` });
    res.redirect('/integracoes?ok=' + provider);
  } catch (e) {
    saveIntegration(provider, { status: 'erro', last_error: e.message });
    res.redirect('/integracoes?erro=' + encodeURIComponent(e.message));
  }
}
