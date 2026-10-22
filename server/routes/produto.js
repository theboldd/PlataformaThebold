// ESTADO DO PRODUTO — as áreas definidas do The Bold OS ficam visíveis mesmo sem dados, sem chave ou sem decisão.
// Nada aqui é simulado: cada bloco devolve dados reais ou um ESTADO honesto (dados insuficientes, aguardando configuração,
// aguardando integração, aguardando decisão, em desenvolvimento, bloqueado por dependência) com o que falta para ativar.
import { Router } from 'express';
import { one, all, now, parseJSON } from '../db.js';
import { requireInternal, requirePerm } from '../lib/auth.js';
import { can, assertClient, HttpError } from '../lib/permissions.js';
import { PROVIDERS, integrationStatus } from '../integrations/vault.js';
import { mailConfigured } from '../services/mail.js';
import { PLATFORM_CONTENT } from '../engine/process.js';
import { automationStats } from '../engine/automations.js';

export const produto = Router();

const DAY = 864e5;
const iso = (ms) => new Date(ms).toISOString();
const hosted = () => (process.env.VERCEL ? 'vercel' : 'servidor');

// ═════════════ EQUIPE · PERFORMANCE ═════════════
// Só eventos válidos (regras 24 e 25): tarefas e conteúdos nascidos na plataforma. Herdado do Notion fica à parte e não pesa contra ninguém.
// Sem score e sem ranking (decisão da CEO): pessoas em ordem alfabética, números brutos com o contexto de cada atraso.
export function performanceReport({ dias = 30 } = {}) {
  const days = [7, 30, 90].includes(Number(dias)) ? Number(dias) : 30;
  const end = Date.parse(now());
  const start = iso(end - days * DAY), prevStart = iso(end - 2 * days * DAY), endIso = iso(end);
  const people = all("SELECT id, name, functions, capacity FROM users WHERE active=1 AND role_key<>'cliente' ORDER BY name");
  const done = (uid, s, e) => one(`SELECT COUNT(*) n, SUM(due_at IS NOT NULL AND completed_at <= due_at) no_prazo, SUM(due_at IS NOT NULL AND completed_at > due_at) atraso, SUM(due_at IS NULL) sem_prazo
    FROM tasks WHERE status='concluida' AND completed_by=? AND data_origin='plataforma' AND completed_at >= ? AND completed_at < ?`, uid, s, e);
  const moves = (uid, kind) => one(`SELECT COUNT(*) n FROM stage_moves sm JOIN contents c ON c.id=sm.content_id
    WHERE sm.kind=? AND sm.created_at >= ? AND sm.prev_assignees LIKE ? AND ${PLATFORM_CONTENT('c.')}`, kind, start, `%"${uid}"%`).n;
  const rows = people.map((p) => {
    const cur = done(p.id, start, endIso), prev = done(p.id, prevStart, start);
    const reprog = all(`SELECT l.before, l.after FROM activity_logs l JOIN tasks t ON t.id=l.entity_id
      WHERE l.action='tarefa.alterada' AND l.entity_type='task' AND l.created_at >= ? AND t.assignee_id=? AND t.data_origin='plataforma'`, start, p.id)
      .filter((l) => { const a = parseJSON(l.after, {}), b = parseJSON(l.before, {}); return a.due_at && a.due_at !== b.due_at; }).length;
    const open = one("SELECT COUNT(*) n, SUM(due_at IS NOT NULL AND due_at < ?) vencidas FROM tasks WHERE assignee_id=? AND status IN ('aberta','em_andamento') AND data_origin='plataforma'", endIso, p.id);
    const inherited = one("SELECT COUNT(*) n FROM tasks WHERE assignee_id=? AND status IN ('aberta','em_andamento','agendada') AND data_origin='notion'", p.id).n;
    const blocked = one(`SELECT COUNT(DISTINCT c.id) n FROM contents c JOIN tasks t ON t.content_id=c.id
      WHERE c.blocked=1 AND t.assignee_id=? AND t.status IN ('aberta','em_andamento') AND ${PLATFORM_CONTENT('c.')}`, p.id).n;
    const events = (cur.n || 0) + moves(p.id, 'retorno') + moves(p.id, 'reabertura') + reprog;
    // Tendência só quando os dois períodos têm volume mínimo para comparar (sem volume, comparar seria inventar)
    const trend = (cur.n || 0) >= 3 && (prev.n || 0) >= 3 ? { atual: cur.n, anterior: prev.n } : null;
    return {
      id: p.id, name: p.name, functions: parseJSON(p.functions, []),
      entregas: cur.n || 0, no_prazo: cur.no_prazo || 0, com_atraso: cur.atraso || 0, sem_prazo: cur.sem_prazo || 0,
      devolucoes: moves(p.id, 'retorno'), reaberturas: moves(p.id, 'reabertura'), reprogramacoes: reprog, bloqueios: blocked,
      abertas: open.n || 0, vencidas: open.vencidas || 0, herdadas: inherited, capacidade_configurada: p.capacity,
      tendencia: trend, eventos_validos: events,
    };
  });
  const valid = rows.reduce((s, r) => s + r.eventos_validos, 0);
  // Contexto dos atrasos: cada tarefa concluída com atraso ou vencida, com o que estava acontecendo no conteúdo
  const late = all(`SELECT t.id, t.title, t.due_at, t.completed_at, t.status, u.name pessoa, c.number, c.title content_title, c.stage, c.blocked, c.block_reason, c.waiting_on, cl.name client
    FROM tasks t LEFT JOIN users u ON u.id=COALESCE(t.completed_by, t.assignee_id) LEFT JOIN contents c ON c.id=t.content_id LEFT JOIN clients cl ON cl.id=t.client_id
    WHERE t.data_origin='plataforma' AND t.due_at IS NOT NULL AND (
      (t.status='concluida' AND t.completed_at > t.due_at AND t.completed_at >= ?) OR (t.status IN ('aberta','em_andamento') AND t.due_at < ?))
    ORDER BY t.due_at DESC LIMIT 40`, start, endIso);
  const migrated = one("SELECT COUNT(*) n FROM tasks WHERE data_origin='notion' AND status IN ('aberta','em_andamento','agendada')").n;
  // Previsão da próxima semana: demanda com prazo nos próximos 7 dias × capacidade CONFIGURADA (não medida). Só alerta; nunca redistribui.
  const nextEnd = iso(end + 7 * DAY);
  const forecast = people.map((p) => {
    const due = one("SELECT COUNT(*) n FROM tasks WHERE assignee_id=? AND data_origin='plataforma' AND status IN ('aberta','em_andamento','agendada') AND due_at >= ? AND due_at < ?", p.id, endIso, nextEnd).n;
    const clients = all("SELECT DISTINCT c.name FROM tasks t JOIN clients c ON c.id=t.client_id WHERE t.assignee_id=? AND t.data_origin='plataforma' AND t.status IN ('aberta','em_andamento','agendada') AND t.due_at >= ? AND t.due_at < ?", p.id, endIso, nextEnd).map((r) => r.name);
    return { id: p.id, name: p.name, demanda: due, capacidade: p.capacity, clientes: clients, alerta: due > p.capacity,
      motivo: due > p.capacity ? `${due} tarefas com prazo nos próximos 7 dias para capacidade configurada de ${p.capacity}/semana` : null };
  });
  return {
    period: { dias: days, start, end: endIso },
    state: valid ? 'ativo' : 'dados_insuficientes',
    valid_events: valid, people: rows, late,
    forecast: { state: forecast.some((f) => f.demanda) ? 'ativo' : 'dados_insuficientes', confianca: 'baixa — capacidade configurada, ainda não medida', items: forecast },
    migrated_open: migrated,
    score: null,
    rules: [
      'Evento válido = tarefa concluída, devolução, reabertura ou reprogramação de algo que nasceu na plataforma.',
      'Tarefas herdadas do Notion aparecem à parte e nunca pesam contra ninguém.',
      'Sem score e sem ranking enquanto não houver dados válidos suficientes (decisão da CEO).',
      'Capacidade configurada ≠ capacidade medida: a medida só existe com histórico de entregas.',
    ],
  };
}
produto.get('/performance', requireInternal, requirePerm('performance', 'view'), (req, res) => res.json(performanceReport({ dias: req.query.dias })));

// ═════════════ FINANCEIRO · estrutura completa (Recebimentos · Produção & Repasses · Rentabilidade) ═════════════
produto.get('/financeiro/estrutura', requireInternal, requirePerm('financeiro', 'view'), (req, res) => {
  const end = Date.parse(now());
  const month = new Date(end).toISOString().slice(0, 7);
  const contracts = one("SELECT COUNT(*) n, SUM(CASE WHEN status='ativo' THEN monthly_value ELSE 0 END) mrr FROM contracts");
  const invoices = one('SELECT COUNT(*) n FROM invoices').n;
  // Produção do mês por profissional: é dado real (tarefas concluídas na plataforma). O VALOR do repasse depende das regras financeiras.
  const producao = all(`SELECT u.id, u.name, substr(t.completed_at,1,7) competencia, COUNT(*) demandas, GROUP_CONCAT(DISTINCT t.function) funcoes
    FROM tasks t JOIN users u ON u.id=t.completed_by WHERE t.status='concluida' AND t.data_origin='plataforma' AND t.completed_at >= ?
    GROUP BY u.id, competencia ORDER BY competencia DESC, u.name`, iso(end - 92 * DAY));
  // Rentabilidade: receita vem dos contratos; retrabalho = ajustes registrados em conteúdos da plataforma; custos e repasses aguardam as regras
  const receita = all("SELECT c.id, c.name, SUM(k.monthly_value) receita FROM contracts k JOIN clients c ON c.id=k.client_id WHERE k.status='ativo' GROUP BY c.id ORDER BY c.name");
  const retrabalho = all(`SELECT cl.id, cl.name, SUM(a.origin='interno') internos, SUM(a.origin='cliente') do_cliente FROM adjustments a JOIN contents c ON c.id=a.content_id JOIN clients cl ON cl.id=c.client_id
    WHERE ${PLATFORM_CONTENT('c.')} AND a.created_at >= ? GROUP BY cl.id ORDER BY cl.name`, iso(end - 92 * DAY));
  res.json({
    month,
    recebimentos: { state: invoices || contracts.n ? 'ativo' : 'dados_insuficientes', contratos: contracts.n, parcelas: invoices, mrr: contracts.mrr || 0,
      cobranca: mailConfigured() ? null : 'Envio de cobrança por e-mail aguarda configuração do Resend (RESEND_API_KEY e BOLD_MAIL_FROM).' },
    repasses: {
      state: one('SELECT 1 FROM payout_rates WHERE active=1') ? 'ativo' : 'aguardando_configuracao',
      motivo: 'Os valores de repasse (por pessoa, função, tipo de demanda ou cliente, com vigência) ainda não foram cadastrados em Negócio → Produção & Repasses → Valores.',
      campos: ['Profissional', 'Demanda', 'Valor', 'Competência', 'Status', 'Fechamento', 'Motivo'],
      producao, producao_state: producao.length ? 'ativo' : 'dados_insuficientes',
    },
    rentabilidade: {
      state: receita.length ? 'aguardando_decisao' : 'dados_insuficientes',
      motivo: 'Margem e rentabilidade por cliente dependem de receita cadastrada (contratos) e das regras de repasse e custos (aguardando decisão).',
      receita, retrabalho, retrabalho_state: retrabalho.length ? 'ativo' : 'dados_insuficientes',
      custos: { state: one('SELECT 1 FROM finance_costs WHERE active=1') ? 'ativo' : 'aguardando_configuracao' }, margem: { state: 'aguardando_configuracao' }, evolucao: { state: 'dados_insuficientes' },
    },
  });
});

// ═════════════ INTEGRAÇÕES · todas as conexões do produto, com estado honesto ═════════════
// CONECTADA · NÃO CONECTADA · AGUARDANDO CONFIGURAÇÃO · ERRO — nunca simula conexão.
export function connState(s) {
  if (s.last_error || s.status === 'token_expirado') return 'erro';
  if (s.status === 'conectado') return 'conectada';
  if (!s.configured) return 'aguardando_configuracao';
  return 'nao_conectada';
}
export function productIntegrations() {
  const base = Object.keys(PROVIDERS).map((p) => { const s = integrationStatus(p); return { key: p, label: s.label, state: connState(s), detail: s.last_error || null, env: s.env, docs: s.docs, account: s.account }; });
  const gcal = base.find((b) => b.key === 'google_calendar');
  const notion = one('SELECT COUNT(*) n, MAX(extracted_at) at FROM notion_history');
  const migrated = one("SELECT COUNT(*) n FROM contents WHERE data_origin='notion'").n;
  const extras = [
    { key: 'google_meet', label: 'Google Meet', state: gcal.state, depends: 'Google Calendar',
      docs: 'Reunião criada sem local físico nasce com link do Meet pelo próprio evento do Google Calendar. Ativa junto com o Google Calendar.' },
    { key: 'resend', label: 'Resend · e-mail', state: mailConfigured() ? 'conectada' : 'aguardando_configuracao', env: ['RESEND_API_KEY', 'BOLD_MAIL_FROM'],
      docs: 'E-mail transacional (convites, redefinição de senha, avisos e cobranças). Com a chave presente, o envio só é confirmado no primeiro e-mail aceito pelo provedor.' },
    { key: 'notion', label: 'Notion', state: 'nao_conectada', mode: 'importacao',
      docs: `Sem sincronização ativa: a plataforma não lê nem escreve no Notion. O que existe é a importação histórica (${migrated} conteúdos, ${notion.n} registros de calendários), somente leitura.`,
      imported_at: notion.at },
    { key: 'push', label: 'Notificações no celular (push)', state: 'em_desenvolvimento',
      docs: 'Push pela plataforma instalada na tela inicial (PWA, iOS 16.4+), com chaves VAPID. Hoje as notificações chegam no sino da plataforma.' },
    { key: 'pagamentos', label: 'Banco / gateway de pagamento', state: 'nao_conectada',
      docs: 'Sem integração bancária nesta fase: o pagamento é confirmado manualmente em Financeiro (quem, quando, valor). Nada é confirmado automaticamente.' },
    { key: 'infra', label: 'Hospedagem e rotinas', state: hosted() === 'vercel' ? 'aguardando_decisao' : 'ativo',
      docs: hosted() === 'vercel'
        ? 'Prévia na Vercel: cada instância trabalha numa cópia temporária da base (alterações não são permanentes). As rotinas contínuas (1 min / 15 min) não rodam aqui; o cron diário roda só com CRON_SECRET. Hospedagem definitiva (Railway) aguarda aprovação da CEO.'
        : 'Servidor contínuo: banco persistente e agendador ativo.',
      cron: !!process.env.CRON_SECRET, base_url: !!process.env.PUBLIC_BASE_URL },
  ];
  return [...base, ...extras];
}
produto.get('/produto/integracoes', requireInternal, (_req, res) => res.json({ items: productIntegrations(), public_base_url: !!process.env.PUBLIC_BASE_URL, hosting: hosted() }));

// ═════════════ AUTOMAÇÕES · estado de cada uma + rotinas do sistema ═════════════
// Dependência de integração por automação (as de motor "ia" dependem do Claude)
const DEPENDS = { 'meta.publicar': 'meta', 'reuniao.transcricao_detectada': 'google_calendar', 'drive.material': 'google_drive', 'slack.espelhar': 'slack' };
export function automationStates() {
  const integ = Object.fromEntries(productIntegrations().map((i) => [i.key, i]));
  const errs = Object.fromEntries(all("SELECT automation_key k, MAX(created_at) at, detail FROM automation_runs WHERE status='erro' GROUP BY automation_key").map((r) => [r.k, r]));
  return automationStats().map((a) => {
    const dep = DEPENDS[a.key] || (a.engine === 'ia' ? 'anthropic' : null);
    const depOk = !dep || integ[dep]?.state === 'conectada';
    const err = errs[a.key] && (!a.last_run || errs[a.key].at >= a.last_run) ? errs[a.key] : null;
    const state = !a.implemented ? 'em_desenvolvimento' : !a.enabled ? 'desligada' : !depOk ? 'aguardando_integracao' : err ? 'erro' : 'ativo';
    return { key: a.key, state, dependency: dep ? { key: dep, label: integ[dep]?.label || dep, state: integ[dep]?.state || 'aguardando_configuracao' } : null, last_run: a.last_run, runs: a.runs, last_error: err };
  });
}
// Rotinas: quando rodam, última e próxima execução — com o bloqueio real do ambiente atual
export function routines() {
  const vercel = hosted() === 'vercel';
  const lastJob = (job) => one('SELECT status, started_at, finished_at, error FROM job_runs WHERE job=? ORDER BY started_at DESC LIMIT 1', job);
  const lastAuto = (k) => one('SELECT MAX(created_at) at FROM automation_runs WHERE automation_key=?', k)?.at || null;
  const nextDaily = (h) => { const d = new Date(Date.parse(now())); const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h)); if (n <= d) n.setUTCDate(n.getUTCDate() + 1); return n.toISOString(); };
  const contState = vercel ? 'bloqueado' : 'ativo';
  const contNote = vercel ? 'Depende de servidor contínuo — hospedagem definitiva aguardando aprovação da CEO.' : null;
  const integ = Object.fromEntries(productIntegrations().map((i) => [i.key, i.state]));
  const tick = lastJob('tick');
  return [
    { key: 'tick', label: 'Ciclo do processo (prazos, janelas, lembretes, saúde)', schedule: vercel ? 'Diário · 10:00 UTC (cron da Vercel)' : 'A cada 1 minuto',
      state: vercel && !process.env.CRON_SECRET ? 'aguardando_configuracao' : 'ativo', note: vercel && !process.env.CRON_SECRET ? 'Cron diário exige CRON_SECRET no projeto da Vercel.' : null,
      last: tick?.started_at || null, last_status: tick?.status || null, last_error: tick?.error || null, next: vercel ? (process.env.CRON_SECRET ? nextDaily(10) : null) : 'em até 1 minuto' },
    { key: 'insights', label: 'Detectores de insights', schedule: 'A cada 15 minutos', state: contState, note: contNote, last: lastAuto('insights.detectar'), next: vercel ? null : 'em até 15 minutos' },
    { key: 'relatorio', label: 'Relatório semanal da operação', schedule: 'Segunda-feira, 08h', state: contState, note: contNote, last: lastAuto('relatorio.semanal'), next: null },
    { key: 'publicacao', label: 'Publicação no Instagram no horário agendado', schedule: 'A cada 1 minuto',
      state: integ.meta !== 'conectada' ? 'aguardando_integracao' : contState, note: integ.meta !== 'conectada' ? 'Depende da conexão Meta/Instagram.' : contNote, last: lastAuto('meta.publicar'), next: null },
    { key: 'transcricoes', label: 'Detecção de transcrições de reuniões', schedule: 'A cada 15 minutos',
      state: integ.google_calendar !== 'conectada' ? 'aguardando_integracao' : contState, note: integ.google_calendar !== 'conectada' ? 'Depende da conexão Google Calendar.' : contNote, last: lastAuto('reuniao.transcricao_detectada'), next: null },
  ];
}
produto.get('/automations/estado', requireInternal, requirePerm('automacoes', 'view'), (_req, res) => res.json({ automations: automationStates(), routines: routines(), hosting: hosted() }));

// ═════════════ NOTION · origem e histórico (somente leitura) ═════════════
produto.get('/notion/resumo', requireInternal, requirePerm('clientes', 'view'), (_req, res) => {
  const c = (sql, ...p) => one(sql, ...p).n;
  res.json({
    sync: 'nao_conectada',
    clientes_com_pagina: c("SELECT COUNT(*) n FROM clients WHERE notion_url IS NOT NULL AND notion_url<>''"),
    brain: { entradas: c("SELECT COUNT(*) n FROM client_brain_entries WHERE source_type='notion'"), clientes: c("SELECT COUNT(DISTINCT client_id) n FROM client_brain_entries WHERE source_type='notion'") },
    onboarding: { respostas: c("SELECT COUNT(*) n FROM onboarding_answers WHERE source_type='notion'"), clientes: c("SELECT COUNT(DISTINCT client_id) n FROM onboarding_answers WHERE source_type='notion'") },
    historico: all('SELECT source, COUNT(*) n, SUM(empty) vazios, MAX(extracted_at) extraido FROM notion_history GROUP BY source ORDER BY source'),
    conteudos: { total: c("SELECT COUNT(*) n FROM contents WHERE data_origin='notion'"), em_andamento: c("SELECT COUNT(*) n FROM contents WHERE data_origin='notion' AND legacy_status IS NULL AND stage NOT IN ('publicado','cancelado')") },
    legado: all("SELECT COALESCE(legacy_status,'—') status, COUNT(*) n FROM contents WHERE legacy_status IS NOT NULL GROUP BY legacy_status"),
    tarefas_herdadas_abertas: c("SELECT COUNT(*) n FROM tasks WHERE data_origin='notion' AND status IN ('aberta','em_andamento','agendada')"),
    decisoes: { abertas: c("SELECT COUNT(*) n FROM migration_issues WHERE status='aberto'"), por_tipo: all("SELECT kind, COUNT(*) n FROM migration_issues WHERE status='aberto' GROUP BY kind ORDER BY n DESC") },
  });
});

// ═════════════ CONFIGURAÇÕES · um lugar só, com o estado de cada área ═════════════
produto.get('/configuracoes', requireInternal, (req, res) => {
  const u = req.user;
  const integ = productIntegrations();
  const nInteg = (s) => integ.filter((i) => i.state === s).length;
  const autos = automationStates();
  const sec = (key, label, desc, to, state, extra = {}) => ({ key, label, desc, to, state, ...extra });
  res.json({ sections: [
    sec('usuarios', 'Usuários', 'Pessoas da equipe, acesso, último login e convites.', '/usuarios', 'ativo', { visible: can(u, 'usuarios'),
      note: (() => { const d = one("SELECT COUNT(*) n FROM users WHERE active=1 AND role_key<>'cliente' AND email LIKE '%.demo'").n; return d ? `${d} pessoa(s) da equipe com e-mail provisório (@thebold.demo): sem acesso real até receber o e-mail definitivo.` : null; })() }),
    sec('permissoes', 'Perfis e permissões', 'Perfil (role) + exceções por pessoa + clientes vinculados. Verificado no servidor.', '/usuarios?aba=perfis', 'ativo', { visible: can(u, 'usuarios') }),
    sec('funcoes', 'Funções e divisão', 'Quem cuida de cada cliente em cada função.', '/divisao', 'ativo', { visible: !!can(u, 'divisao') || !!can(u, 'divisao', 'admin') }),
    sec('clientes', 'Clientes e acessos do portal', 'Carteira, status e acessos dos clientes.', '/usuarios?aba=acessos', 'ativo', { visible: can(u, 'usuarios'),
      note: `${one("SELECT COUNT(DISTINCT cm.client_id) n FROM client_members cm JOIN users x ON x.id=cm.user_id WHERE x.role_key='cliente' AND x.active=1").n} de ${one("SELECT COUNT(*) n FROM clients WHERE kind<>'interno'").n} clientes com acesso ao portal.` }),
    sec('integracoes', 'Integrações', 'Google Calendar e Meet, Drive, Slack, Meta/Instagram, Resend, Claude, Notion e hospedagem.', '/integracoes',
      nInteg('conectada') === integ.length ? 'ativo' : 'aguardando_configuracao', { visible: can(u, 'integracoes'), note: `${nInteg('conectada')} conectada(s) · ${nInteg('aguardando_configuracao')} aguardando configuração · ${nInteg('erro')} com erro.` }),
    sec('automacoes', 'Automações', 'O que o sistema faz sozinho, o estado de cada automação e as rotinas.', '/automacoes', 'ativo', { visible: can(u, 'automacoes'),
      note: `${autos.filter((a) => a.state === 'ativo').length} ativas · ${autos.filter((a) => a.state === 'aguardando_integracao').length} aguardando integração · ${autos.filter((a) => a.state === 'em_desenvolvimento').length} em desenvolvimento.` }),
    sec('regras', 'Regras do processo', 'Etapas, responsáveis, regras do fluxo e reenvio ao cliente.', '/automacoes?aba=regras', 'ativo', { visible: can(u, 'automacoes') }),
    sec('calendario', 'Calendário operacional', 'Marcos do ciclo mensal (cronograma, revisão, produção, aprovação, agendamento).', '/automacoes?aba=regras', 'ativo', { visible: can(u, 'automacoes') }),
    sec('notificacoes', 'Notificações', 'Preferências por pessoa: plataforma e e-mail por categoria, agrupamento. Urgentes sempre chegam. Push no celular em desenvolvimento.', '/perfil', 'ativo', { visible: true, note: mailConfigured() ? null : 'Canal e-mail aguardando configuração (Resend).' }),
    sec('financeiro', 'Financeiro', 'Régua de cobrança, textos dos e-mails, dia de fechamento, e-mail do relatório e regras de repasse.', '/negocio?aba=config',
      (() => { const g = (k) => { const r = one('SELECT value FROM settings WHERE key=?', k); return r ? JSON.parse(r.value) : null; }; return g('fin.dia_fechamento') && one('SELECT 1 FROM payout_rates WHERE active=1') ? 'ativo' : 'aguardando_configuracao'; })(),
      { visible: can(u, 'financeiro'), note: 'Pendente até a CEO definir: dia de fechamento, valores de repasse e cobranças após o vencimento.' }),
    sec('hospedagem', 'Hospedagem e dados', integ.find((i) => i.key === 'infra').docs, '/integracoes', integ.find((i) => i.key === 'infra').state, { visible: can(u, 'integracoes') }),
    sec('perfil', 'Meu perfil', 'Seus dados, aparência e senha.', '/perfil', 'ativo', { visible: true }),
  ].filter((s) => s.visible) });
});

// ═════════════ ORIGEM DOS DADOS de um cliente: o que é da plataforma e o que veio do Notion ═════════════
produto.get('/clients/:id/origem', requireInternal, requirePerm('clientes', 'view'), (req, res) => {
  assertClient(req.user, req.params.id);
  const id = req.params.id;
  const cl = one('SELECT id, notion_url, notion_section FROM clients WHERE id=?', id);
  if (!cl) throw new HttpError(404, 'Cliente não encontrado.');
  const by = (sql) => Object.fromEntries(all(sql, id).map((r) => [r.k, r.n]));
  res.json({
    notion_url: cl.notion_url || null, notion_section: cl.notion_section || null,
    conteudos: by("SELECT data_origin k, COUNT(*) n FROM contents WHERE client_id=? GROUP BY data_origin"),
    legado: by("SELECT legacy_status k, COUNT(*) n FROM contents WHERE client_id=? AND legacy_status IS NOT NULL GROUP BY legacy_status"),
    tarefas_abertas: by("SELECT data_origin k, COUNT(*) n FROM tasks WHERE client_id=? AND status IN ('aberta','em_andamento','agendada') GROUP BY data_origin"),
    brain: by('SELECT source_type k, COUNT(*) n FROM client_brain_entries WHERE client_id=? GROUP BY source_type'),
    onboarding: by('SELECT source_type k, COUNT(*) n FROM onboarding_answers WHERE client_id=? GROUP BY source_type'),
    historico: by('SELECT source k, COUNT(*) n FROM notion_history WHERE client_id=? AND empty=0 GROUP BY source'),
    decisoes_abertas: one("SELECT COUNT(*) n FROM migration_issues WHERE client_id=? AND status='aberto'", id).n,
  });
});
