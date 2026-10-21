// VISÃO GERAL DA CEO — central de decisão, não relatório.
// Lógica: ESTADO → PROBLEMA → IMPACTO → RESPONSÁVEL → AÇÃO. Tudo derivado do banco; o detalhe completo fica na Torre.
// Período (hoje | 7d | 30d | custom) define a janela à frente de compromissos e prazos; estados (risco, produção, espera) são sempre "agora".
import { one, all, now } from '../db.js';
import { scopeSQL, can } from '../lib/permissions.js';
import { STAGES, STAGE_ORDER } from './process.js';
import { computePendencies, clientRisk, opsMetrics, stageDistribution, runDetectors, OPERATING } from './intelligence.js';
import { PERF_SQL } from '../services/delayReview.js';
import { integrationStatus } from '../integrations/vault.js';

const H = 3600e3, DAY = 864e5;
const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const PROD_STAGES = ['producao', 'analise_producao', 'ajuste_interno', 'ajuste_cliente', 'revisao_ajuste'];
const WAIT_STAGES = ['aprovacao_tema', 'aprovacao_cliente'];
const ESSENTIAL = { estrategia: 'Estratégia', design: 'Design', edicao: 'Edição' };
const inList = (a) => a.map(() => '?').join(',');

// Janela à frente: hoje (até 23:59 de SP), 7 ou 30 dias, ou datas escolhidas
export function windowOf(qs = {}) {
  const start = new Date();
  const todayEnd = new Date(`${new Date(Date.now() - 3 * H).toISOString().slice(0, 10)}T23:59:59-03:00`);
  let key = qs.period || '7d', end, label;
  if (key === 'hoje') { end = todayEnd; label = 'Hoje'; }
  else if (key === '30d') { end = new Date(Date.now() + 30 * DAY); label = 'Próximos 30 dias'; }
  else if (key === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(qs.from || '') && /^\d{4}-\d{2}-\d{2}$/.test(qs.to || '')) {
    const f = new Date(`${qs.from}T00:00:00-03:00`);
    if (f > start) start.setTime(f.getTime());
    end = new Date(`${qs.to}T23:59:59-03:00`);
    label = `${qs.from.split('-').reverse().join('/')} → ${qs.to.split('-').reverse().join('/')}`;
  } else { key = '7d'; end = new Date(Date.now() + 7 * DAY); label = 'Próximos 7 dias'; }
  if (end < start) end = new Date(start.getTime() + DAY);
  return { key, label, start: start.toISOString(), end: end.toISOString() };
}

// Decisões da migração do Notion: problema + impacto reais (o que muda na operação se ficar sem decisão)
const MIGRATION = {
  status: (n) => [`${pl(n, 'cliente', 'clientes')} com status a confirmar`, 'Sem status, não dá para saber quem está ativo, pausado ou encerrado na operação.'],
  equipe: (n) => [`${pl(n, 'vínculo', 'vínculos')} de equipe sem decisão`, 'Fontes do Notion divergem sobre quem atende o cliente; enquanto isso, a função fica sem dono.'],
  duplicado: (n) => [n === 1 ? '1 possível cliente duplicado' : `${n} possíveis clientes duplicados`, 'A mesma pessoa pode receber dois fluxos de conteúdo e de comunicação.'],
  escopo: (n) => [`${pl(n, 'caso', 'casos')} sobre quem entra na base`, 'Define quais clientes entram na operação e nos indicadores.'],
};

let lastDetect = 0;
function freshInsights() {
  if (Date.now() - lastDetect > 10 * 60e3) { lastDetect = Date.now(); runDetectors(); }
  return all("SELECT * FROM ai_insights WHERE status='aberto'");
}

export function executiveOverview(user, qs = {}) {
  const W = windowOf(qs);
  const nowIso = now();
  const m = opsMetrics(user);
  const sc = scopeSQL(user, 'client_id');
  const cScope = scopeSQL(user, 'id');

  // ── Base real ──
  const base = one(`SELECT COUNT(*) total, SUM(status='ativo') ativos, SUM(status='a_confirmar') a_confirmar, SUM(status='onboarding') onboarding
    FROM clients WHERE status IN (${inList(OPERATING)}) AND ${cScope.sql}`, ...OPERATING, ...cScope.params);
  for (const k of Object.keys(base)) base[k] = base[k] || 0;
  base.com_conteudo = one(`SELECT COUNT(DISTINCT client_id) n FROM contents WHERE stage NOT IN ('cancelado','publicado') AND ${sc.sql}`, ...sc.params).n;

  // ── Indicadores (estado atual) ──
  const risks = all(`SELECT * FROM clients WHERE status IN (${inList(OPERATING)}) AND ${cScope.sql}`, ...OPERATING, ...cScope.params)
    .map((c) => ({ id: c.id, name: c.name, ...clientRisk(c.id) })).filter((r) => ['alto', 'critico'].includes(r.level))
    .sort((a, b) => (a.level === 'critico' ? 0 : 1) - (b.level === 'critico' ? 0 : 1));
  const pend = computePendencies();
  const critical = pend.filter((p) => p.severity === 'critica');
  const csc = scopeSQL(user, 'c.client_id');
  const prodLate = one(`SELECT COUNT(DISTINCT c.id) n FROM contents c JOIN tasks tk ON tk.content_id=c.id AND tk.status IN ('aberta','em_andamento') AND tk.due_at < ? AND ${PERF_SQL.equipe('tk')}
    WHERE c.stage IN (${inList(PROD_STAGES)}) AND ${csc.sql}`, nowIso, ...PROD_STAGES, ...csc.params).n;
  const waitOld = one(`SELECT COUNT(*) n FROM contents WHERE stage IN (${inList(WAIT_STAGES)}) AND stage_entered_at < ? AND ${sc.sql}`, ...WAIT_STAGES, new Date(Date.now() - 48 * H).toISOString(), ...sc.params).n;
  const kpis = {
    risk: { n: risks.length, critico: risks.filter((r) => r.level === 'critico').length },
    critical: { n: critical.length, vencidas: critical.filter((p) => p.late).length },
    producao: { n: m.em_producao, atrasados: prodLate, stages: PROD_STAGES },
    aguardando: { n: m.aguardando_cliente, mais_48h: waitOld, stages: WAIT_STAGES },
  };

  // ── Precisa da sua atenção: situações (não tarefas soltas), com impacto, responsável, tempo e ação ──
  const attention = [];
  for (const p of pend.filter((x) => ['critica', 'alta'].includes(x.severity))) {
    attention.push({ id: p.id, level: p.severity === 'critica' ? 'critico' : 'atencao', client: p.client, client_id: p.client_id, problem: p.client && p.title.endsWith(` — ${p.client}`) ? p.title.slice(0, -(p.client.length + 3)) : p.title,
      context: [p.process, p.content].filter(Boolean).join(' · '), impact: p.impact, who: p.who, time: p.late ? `há ${p.late}` : null, action: { label: 'Abrir pendência', to: p.link || '/pendencias' } });
  }
  for (const r of risks.filter((x) => x.level === 'critico' && !attention.some((a) => a.client_id === x.id))) {
    attention.push({ id: `risk:${r.id}`, level: 'critico', client: r.name, client_id: r.id, problem: 'Cliente em risco crítico', context: null, impact: r.reasons.slice(0, 2).join(' · '), who: null, time: null, action: { label: 'Abrir cliente', to: `/clientes/${r.id}` } });
  }
  // Tarefas da própria CEO vencidas ou que vencem na janela escolhida
  for (const t of all(`SELECT tk.*, c.name client FROM tasks tk LEFT JOIN clients c ON c.id=tk.client_id WHERE tk.assignee_id=? AND tk.status IN ('aberta','em_andamento') AND tk.due_at IS NOT NULL AND tk.due_at <= ? ORDER BY tk.due_at`, user.id, W.end)) {
    const late = t.due_at < nowIso;
    attention.push({ id: `mine:${t.id}`, level: late ? 'critico' : 'atencao', client: t.client || 'The Bold', client_id: t.client_id, problem: t.title, context: STAGES[t.stage]?.label || null,
      impact: late ? 'Tarefa sua vencida: as próximas etapas esperam por ela.' : 'Tarefa sua com prazo dentro do período.', who: 'Você',
      time: late ? `venceu ${new Date(t.due_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short' })}` : `até ${new Date(t.due_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short' })}`,
      action: { label: 'Abrir tarefa', to: t.content_id ? `/conteudos/${t.content_id}` : t.client_id ? `/clientes/${t.client_id}` : '/processos' } });
  }
  // Itens herdados da migração com prazo vencido: decisão da CEO (não contam como atraso de ninguém)
  const inh = one("SELECT COUNT(*) n, COUNT(DISTINCT d.client_id) clients FROM delay_reviews d JOIN tasks t ON t.id=d.task_id WHERE d.decided_by IS NULL AND t.status IN ('aberta','em_andamento')");
  if (inh.n && can(user, 'atrasos')) attention.push({ id: 'herdados', level: 'atencao', client: 'Migração', client_id: null, problem: `${inh.n} itens herdados do Notion com prazo vencido aguardando classificação`,
    context: `${inh.clients} clientes · prazo calculado na importação`, impact: 'Não entram em nenhum indicador de desempenho até serem classificados.', who: 'Você', time: null, action: { label: 'Revisar itens herdados', to: '/atrasos' } });
  const issues = all("SELECT kind, COUNT(*) n, COUNT(DISTINCT client_id) clients FROM migration_issues WHERE status='aberto' GROUP BY kind");
  const byKind = Object.fromEntries(issues.map((i) => [i.kind, i]));
  for (const kind of ['status', 'equipe', 'duplicado', 'escopo']) {
    const i = byKind[kind];
    if (!i) continue;
    const [problem, impact] = MIGRATION[kind](kind === 'status' ? i.clients : i.n);
    attention.push({ id: `mig:${kind}`, level: 'atencao', client: 'Base de clientes', client_id: null, problem, context: 'Migração do Notion', impact, who: 'Decisão da direção', time: null, action: { label: 'Decidir', to: `/migracao?kind=${kind}` } });
  }
  const order = { critico: 0, atencao: 1 };
  attention.sort((a, b) => order[a.level] - order[b.level]);

  // ── Próximos compromissos na janela ──
  const msc = scopeSQL(user, 'm.client_id');
  const meetings = all(`SELECT m.id, m.title, m.kind, m.starts_at, m.client_id, c.name client FROM meetings m LEFT JOIN clients c ON c.id=m.client_id
    WHERE m.status='agendada' AND m.starts_at BETWEEN ? AND ? AND (m.client_id IS NULL OR ${msc.sql}) ORDER BY m.starts_at LIMIT 5`, W.start, W.end, ...msc.params);
  const google = integrationStatus('google_calendar');

  // ── Operação: estados reais do Process Engine (sem publicados, que já saíram do fluxo) ──
  const dist = Object.fromEntries(stageDistribution(user).map((s) => [s.stage, s]));
  const operation = STAGE_ORDER.filter((k) => k !== 'publicado' && dist[k]?.n).map((k) => ({ stage: k, label: STAGES[k].label, n: dist[k].n, blocked: dist[k].blocked || 0 }));

  // ── Inteligência: o que acontece → por que importa → o que fazer → registros que geraram a leitura ──
  const ins = freshInsights();
  const intel = [];
  const noOwner = ins.filter((i) => i.detector === 'sem_responsavel');
  if (noOwner.length) {
    const byClient = new Map();
    for (const i of noOwner) {
      const fn = i.fingerprint.split(':')[2];
      const c = byClient.get(i.client_id) || { name: one('SELECT name FROM clients WHERE id=?', i.client_id)?.name || '—', fns: [] };
      c.fns.push(ESSENTIAL[fn] || fn); byClient.set(i.client_id, c);
    }
    const fnCount = {};
    for (const c of byClient.values()) for (const f of c.fns) fnCount[f] = (fnCount[f] || 0) + 1;
    intel.push({ id: 'agg:sem_responsavel', kind: 'Responsabilidade',
      what: `${pl(byClient.size, 'cliente está', 'clientes estão')} sem responsável em funções essenciais (${Object.entries(fnCount).map(([f, n]) => `${f} ${n}`).join(', ')}).`,
      why: 'Quando o primeiro ciclo começar, as tarefas dessas funções nascem sem dono e a etapa para.',
      todo: 'Definir os responsáveis na aba Equipe de cada cliente.',
      records: [...byClient.entries()].map(([id, c]) => ({ label: c.name, meta: c.fns.join(', '), to: `/clientes/${id}?tab=equipe` })) });
  }
  const nowMs = Date.now();
  for (const i of ins.filter((x) => x.detector !== 'sem_responsavel')) {
    let link = '/insights'; try { link = JSON.parse(i.action_payload || '{}').link || link; } catch { /* payload antigo */ }
    let records = [];
    if (i.detector === 'gargalo') {
      const st = i.fingerprint.split(':')[1];
      records = all(`SELECT t.title, t.due_at, t.content_id, c.name client FROM tasks t LEFT JOIN clients c ON c.id=t.client_id WHERE t.status IN ('aberta','em_andamento') AND t.due_at < ? AND t.stage=? ORDER BY t.due_at LIMIT 12`, nowIso, st)
        .map((r) => ({ label: r.title, meta: `${r.client || 'Sem cliente'} · venceu há ${pl(Math.max(1, Math.round((nowMs - new Date(r.due_at)) / DAY)), 'dia', 'dias')}`, to: r.content_id ? `/conteudos/${r.content_id}` : '/processos' }));
    } else if (i.detector === 'material') {
      records = all("SELECT c.id, c.number, c.title, cl.name client FROM contents c JOIN clients cl ON cl.id=c.client_id WHERE c.blocked=1 AND c.waiting_on='cliente' AND c.stage NOT IN ('publicado','cancelado') LIMIT 12")
        .map((r) => ({ label: `#${r.number} ${r.title}`, meta: r.client, to: `/conteudos/${r.id}` }));
    } else if (i.detector === 'retrabalho' || i.detector === 'carga') {
      records = [{ label: i.problem, meta: null, to: link }];
    }
    intel.push({ id: i.id, kind: { gargalo: 'Gargalo', carga: 'Capacidade', tempo_aprovacao: 'Tendência', retrabalho: 'Retrabalho', material: 'Dependência', dependencia: 'Dependência' }[i.detector] || 'Padrão',
      what: i.problem, why: i.impact, todo: i.suggestion, records, link });
  }

  // ── Atalhos finais (resumo de uma linha, sempre real) ──
  const mon = new Date().toISOString().slice(0, 7);
  const finCount = one('SELECT (SELECT COUNT(*) FROM contracts) + (SELECT COUNT(*) FROM invoices) n').n;
  const finance = { has_data: finCount > 0, recebido_mes: one('SELECT COALESCE(SUM(paid_amount),0) v FROM invoices WHERE substr(paid_at,1,7)=?', mon).v, atrasado: one("SELECT COALESCE(SUM(amount),0) v FROM invoices WHERE status='atrasada'").v };
  const team = all(`SELECT u.capacity, (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id=u.id AND t.status IN ('aberta','em_andamento')) open FROM users u WHERE u.active=1 AND u.role_key<>'cliente'`);
  const capacity = { open: team.reduce((a, x) => a + x.open, 0), acima: team.filter((x) => x.open > x.capacity).length };
  const automations = { runs_7d: one('SELECT COUNT(*) n FROM automation_runs WHERE created_at > ?', new Date(Date.now() - 7 * DAY).toISOString()).n, errors_7d: one("SELECT COUNT(*) n FROM automation_runs WHERE status='erro' AND created_at > ?", new Date(Date.now() - 7 * DAY).toISOString()).n };

  // ── Está tudo bem? ──
  const crit = attention.filter((a) => a.level === 'critico').length;
  const state = crit ? 'critico' : attention.length ? 'atencao' : 'ok';
  const headline = crit ? `${pl(crit, 'situação crítica pede', 'situações críticas pedem')} sua atenção.`
    : attention.length ? `Nenhum ponto crítico. ${attention.length === 1 ? '1 assunto aguarda' : `${attention.length} assuntos aguardam`} sua decisão.` : 'Operação em dia. Nada exige sua intervenção agora.';

  return {
    window: W, state, headline, base, kpis, risks,
    attention: attention.slice(0, 5), attention_total: attention.length,
    agenda: { items: meetings, google: { status: google.status } },
    operation, intel: intel.slice(0, 3), intel_total: intel.length,
    finance, capacity, automations,
  };
}
