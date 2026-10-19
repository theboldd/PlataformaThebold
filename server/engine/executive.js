// VISÃO GERAL DA CEO — camada executiva acima da Torre de Controle.
// Responde, nesta ordem: está tudo bem? → onde está o problema? → o que precisa da minha atenção? → o que posso fazer?
// Tudo é derivado do banco (clientes migrados do Notion, conteúdos, tarefas, pendências, agenda, financeiro, insights).
// Nada aqui inventa número: quando não há dado, o bloco devolve o estado real ("sem dados", "não conectado").
import { one, all, now } from '../db.js';
import { scopeSQL } from '../lib/permissions.js';
import { STAGES, STAGE_ORDER } from './process.js';
import { computePendencies, clientRisk, opsMetrics, stageDistribution, teamLoad, runDetectors, OPERATING } from './intelligence.js';
import { integrationStatus } from '../integrations/vault.js';

const H = 3600e3;
const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const PROD_STAGES = ['producao', 'analise_producao', 'ajuste_interno', 'ajuste_cliente', 'revisao_ajuste'];
const WAIT_STAGES = ['aprovacao_tema', 'aprovacao_cliente'];
const inList = (a) => a.map(() => '?').join(',');

// Detectores são baratos; na Visão Geral rodam no máximo a cada 10 min para a inteligência refletir o estado atual
let lastDetect = 0;
function freshInsights() {
  if (Date.now() - lastDetect > 10 * 60e3) { lastDetect = Date.now(); runDetectors(); }
  return all("SELECT * FROM ai_insights WHERE status='aberto'");
}

const INTEL = {
  sem_responsavel: 'Responsabilidade', gargalo: 'Gargalo', carga: 'Capacidade', tempo_aprovacao: 'Tendência',
  retrabalho: 'Retrabalho', material: 'Dependência', dependencia: 'Dependência',
};
const FN_LABEL = { estrategia: 'Estratégia', design: 'Design', edicao: 'Edição' };
const MIGRATION = {
  status: (n) => [`${pl(n, 'cliente', 'clientes')} com status a confirmar`, 'Migrados do Notion sem status explícito (ativo, pausado ou encerrado).'],
  equipe: (n) => [`${pl(n, 'vínculo', 'vínculos')} de equipe para decidir`, 'Fontes do Notion divergem sobre quem atende o cliente — nada foi escolhido automaticamente.'],
  duplicado: (n) => [n === 1 ? '1 possível cliente duplicado' : `${n} possíveis clientes duplicados`, 'Mesma pessoa pode estar em duas fichas.'],
  escopo: (n) => [`${pl(n, 'caso', 'casos')} de escopo da base de clientes`, 'Quem entra ou não na base (ex.: conta da própria agência, nomes fora das listas).'],
};

export function executiveOverview(user) {
  const t = Date.now();
  const m = opsMetrics(user);
  const sc = scopeSQL(user, 'client_id');

  // ── Base real de clientes ──
  const base = one(`SELECT COUNT(*) total, SUM(status='ativo') ativos, SUM(status='a_confirmar') a_confirmar, SUM(status='onboarding') onboarding,
    SUM(notion_url IS NOT NULL) do_notion FROM clients WHERE status IN (${inList(OPERATING)}) AND ${scopeSQL(user, 'id').sql}`, ...OPERATING, ...scopeSQL(user, 'id').params);
  for (const k of Object.keys(base)) base[k] = base[k] || 0;
  base.com_conteudo = one(`SELECT COUNT(DISTINCT client_id) n FROM contents WHERE stage<>'cancelado' AND ${sc.sql}`, ...sc.params).n;

  // ── Indicadores executivos (auxiliares sempre calculados; sem comparação histórica porque não há série guardada) ──
  const risks = all(`SELECT * FROM clients WHERE status IN (${inList(OPERATING)}) AND ${scopeSQL(user, 'id').sql}`, ...OPERATING, ...scopeSQL(user, 'id').params)
    .map((c) => ({ id: c.id, name: c.name, ...clientRisk(c.id) })).filter((r) => ['alto', 'critico'].includes(r.level));
  const pend = computePendencies();
  const critical = pend.filter((p) => p.severity === 'critica');
  const prodLate = one(`SELECT COUNT(DISTINCT c.id) n FROM contents c JOIN tasks tk ON tk.content_id=c.id AND tk.status IN ('aberta','em_andamento') AND tk.due_at < ?
    WHERE c.stage IN (${inList(PROD_STAGES)}) AND ${scopeSQL(user, 'c.client_id').sql}`, now(), ...PROD_STAGES, ...scopeSQL(user, 'c.client_id').params).n;
  const waitOld = one(`SELECT COUNT(*) n FROM contents WHERE stage IN (${inList(WAIT_STAGES)}) AND stage_entered_at < ? AND ${sc.sql}`, ...WAIT_STAGES, new Date(t - 48 * H).toISOString(), ...sc.params).n;
  const kpis = {
    risk: { n: risks.length, critico: risks.filter((r) => r.level === 'critico').length },
    critical: { n: critical.length, vencidas: critical.filter((p) => p.late).length },
    producao: { n: m.em_producao, atrasados: prodLate },
    aguardando: { n: m.aguardando_cliente, mais_48h: waitOld },
  };

  // ── Precisa da sua atenção: pendências reais primeiro, depois clientes em risco crítico, depois decisões da migração ──
  const attention = [];
  for (const p of pend.filter((x) => ['critica', 'alta'].includes(x.severity))) {
    attention.push({ id: p.id, level: p.severity === 'critica' ? 'critico' : 'atencao', client: p.client, client_id: p.client_id, problem: p.title,
      context: [p.process, p.content].filter(Boolean).join(' · '), who: p.who, late: p.late || null, action: { label: 'Ver pendência', to: p.link || '/pendencias' } });
  }
  for (const r of risks.filter((x) => x.level === 'critico' && !attention.some((a) => a.client_id === x.id))) {
    attention.push({ id: `risk:${r.id}`, level: 'critico', client: r.name, client_id: r.id, problem: 'Cliente em risco crítico', context: r.reasons.slice(0, 2).join(' · '), who: null, late: null, action: { label: 'Ver cliente', to: `/clientes/${r.id}` } });
  }
  const issues = user.role_key === 'cliente' ? [] : all("SELECT kind, COUNT(*) n, COUNT(DISTINCT client_id) clients FROM migration_issues WHERE status='aberto' GROUP BY kind");
  const byKind = Object.fromEntries(issues.map((i) => [i.kind, i]));
  for (const kind of ['status', 'equipe', 'duplicado', 'escopo']) {
    const i = byKind[kind];
    if (!i) continue;
    const [problem, context] = MIGRATION[kind](kind === 'status' ? i.clients : i.n);
    attention.push({ id: `mig:${kind}`, level: 'atencao', client: 'Base de clientes', client_id: null, problem, context, who: null, late: null, action: { label: 'Decidir', to: `/migracao?kind=${kind}` } });
  }
  const migration_open = one("SELECT COUNT(*) n FROM migration_issues WHERE status='aberto'").n;

  // ── Próximos compromissos (agenda da plataforma; Google Agenda quando conectada) ──
  const msc = scopeSQL(user, 'm.client_id');
  const meetings = all(`SELECT m.id, m.title, m.kind, m.starts_at, m.client_id, c.name client FROM meetings m LEFT JOIN clients c ON c.id=m.client_id
    WHERE m.status='agendada' AND m.starts_at >= ? AND (m.client_id IS NULL OR ${msc.sql}) ORDER BY m.starts_at LIMIT 4`, now(), ...msc.params);
  const google = integrationStatus('google_calendar');

  // ── Sua atenção: tarefas reais da pessoa logada (atrasadas → prazo mais próximo → prioridade) ──
  const mine = all(`SELECT tk.id, tk.title, tk.due_at, tk.priority, tk.content_id, tk.client_id, c.name client FROM tasks tk LEFT JOIN clients c ON c.id=tk.client_id
    WHERE tk.assignee_id=? AND tk.status IN ('aberta','em_andamento')
    ORDER BY CASE WHEN tk.due_at < ? THEN 0 ELSE 1 END, tk.due_at IS NULL, tk.due_at, CASE tk.priority WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 ELSE 2 END`, user.id, now());

  // ── Operação: conteúdos reais por etapa (ordem do processo) ──
  const dist = Object.fromEntries(stageDistribution(user).map((s) => [s.stage, s]));
  const operation = STAGE_ORDER.filter((k) => dist[k]?.n).map((k) => ({ stage: k, label: STAGES[k].label, n: dist[k].n, blocked: dist[k].blocked || 0 }));

  // ── Inteligência The Bold: leitura dos detectores, agrupada por natureza do problema ──
  const ins = freshInsights().filter((i) => !i.client_id || user.role_key !== 'cliente');
  const intel = [];
  const noOwner = ins.filter((i) => i.detector === 'sem_responsavel');
  if (noOwner.length) {
    const fnCount = {};
    const clientsSet = new Set();
    for (const i of noOwner) { const fn = i.fingerprint.split(':')[2]; fnCount[fn] = (fnCount[fn] || 0) + 1; clientsSet.add(i.client_id); }
    intel.push({ id: 'agg:sem_responsavel', kind: 'Responsabilidade', severity: 'alta',
      text: `${pl(clientsSet.size, 'cliente', 'clientes')} sem responsável em funções essenciais.`,
      detail: Object.entries(fnCount).map(([fn, n]) => `${FN_LABEL[fn] || fn}: ${n}`).join(' · ') + '. Tarefas dessas funções nasceriam sem dono e bloqueariam a próxima etapa.',
      action: { label: 'Ver clientes afetados', to: '/insights' } });
  }
  for (const i of ins.filter((x) => x.detector !== 'sem_responsavel').sort((a, b) => (a.severity === 'alta' ? 0 : 1) - (b.severity === 'alta' ? 0 : 1))) {
    let link = null; try { link = JSON.parse(i.action_payload || '{}').link; } catch { /* payload antigo */ }
    intel.push({ id: i.id, kind: INTEL[i.detector] || 'Padrão', severity: i.severity, text: i.problem, detail: [i.impact, i.suggestion].filter(Boolean).join(' '), action: { label: i.action || 'Investigar', to: link || '/insights' } });
  }
  const intelSummary = {};
  for (const i of intel) intelSummary[i.kind] = (intelSummary[i.kind] || 0) + 1;

  // ── Financeiro (só com permissão; sem cadastros → estado real, não R$ 0 ilustrativo) ──
  const mon = new Date().toISOString().slice(0, 7);
  const finCount = one('SELECT (SELECT COUNT(*) FROM contracts) + (SELECT COUNT(*) FROM invoices) n').n;
  const finance = {
    has_data: finCount > 0,
    recebido_mes: one('SELECT COALESCE(SUM(paid_amount),0) v FROM invoices WHERE substr(paid_at,1,7)=?', mon).v,
    em_aberto: one("SELECT COALESCE(SUM(amount),0) v FROM invoices WHERE status='aberta'").v,
    atrasado: one("SELECT COALESCE(SUM(amount),0) v FROM invoices WHERE status='atrasada'").v,
  };

  // ── Capacidade (resumo; detalhe na Torre → Pessoas) ──
  const team = teamLoad();
  const capacity = { open: team.reduce((s, x) => s + x.open, 0), acima: team.filter((x) => x.open > x.capacity).map((x) => x.name), disponiveis: team.filter((x) => x.open < x.capacity).length, total: team.length };

  // ── Está tudo bem? ──
  const crit = kpis.critical.n + kpis.risk.critico;
  const decisions = attention.length;
  const state = crit ? 'critico' : decisions ? 'atencao' : 'ok';
  const headline = crit ? `${pl(crit, 'ponto crítico', 'pontos críticos')} na operação.`
    : decisions ? `Nenhum ponto crítico. ${decisions === 1 ? '1 assunto aguarda' : `${decisions} assuntos aguardam`} sua decisão.` : 'Operação em dia. Nada exige sua intervenção agora.';

  return {
    state, headline, base, kpis, risks,
    attention: attention.slice(0, 5), attention_total: attention.length, migration_open,
    agenda: { items: meetings, google: { status: google.status, configured: google.configured } },
    my_focus: mine.slice(0, 3), my_total: mine.length,
    operation, operation_total: operation.reduce((s, x) => s + x.n, 0),
    intel: intel.slice(0, 4), intel_total: intel.length, intel_summary: intelSummary,
    finance, capacity,
  };
}
