// TORRE DE CONTROLE — "o que está acontecendo na operação e por quê?"
// Camada analítica sobre os dados reais: estado → riscos/gargalos/bloqueios → mapa do processo → clientes →
// responsabilidades → pessoas → desempenho do período (com comparação só quando há histórico) → inteligência → detalhamento.
// Regras: tudo calculado do banco; sem histórico não há tendência; insight só aparece com evidência nos dados.
import { one, all, now, parseJSON } from '../db.js';
import { scopeSQL, can } from '../lib/permissions.js';
import { STAGES, STAGE_ORDER } from './process.js';
import { computePendencies, clientRisk, teamLoad, runDetectors, explain, OPERATING } from './intelligence.js';
import { PERF_SQL, perfOK, isInherited, performanceBase } from '../services/delayReview.js';
import { CATALOG } from './automations.js';

const DAY = 864e5;
const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const q = (a) => a.map(() => '?').join(',');
const ACTIVE = STAGE_ORDER.filter((s) => !['agendado', 'publicado', 'cancelado'].includes(s));
const PROD = ['producao', 'analise_producao', 'ajuste_interno', 'ajuste_cliente', 'revisao_ajuste'];
const REVIEW = ['analise_cronograma', 'analise_producao', 'revisao_ajuste'];
const WAIT = ['aprovacao_tema', 'aprovacao_cliente'];
const ESSENTIAL = { estrategia: 'Estratégia', design: 'Design', edicao: 'Edição' };
const AUTO = Object.fromEntries(CATALOG.map((c) => [c[0], { event: c[1], action: c[3] }]));
const days = (ms) => Math.round((ms / DAY) * 10) / 10;

// ── Período: hoje | 7d | 30d | custom (from/to em AAAA-MM-DD, fuso de São Paulo) ──
export function periodOf(qs) {
  const end = new Date();
  let start, key = qs.period || '7d', label;
  if (key === 'hoje') { start = new Date(`${new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)}T00:00:00-03:00`); label = 'Hoje'; }
  else if (key === '30d') { start = new Date(end - 30 * DAY); label = 'Últimos 30 dias'; }
  else if (key === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(qs.from || '') && /^\d{4}-\d{2}-\d{2}$/.test(qs.to || '')) {
    start = new Date(`${qs.from}T00:00:00-03:00`);
    const e = new Date(`${qs.to}T23:59:59-03:00`);
    if (e < end) end.setTime(e.getTime());
    label = `${qs.from.split('-').reverse().join('/')} → ${qs.to.split('-').reverse().join('/')}`;
  } else { key = '7d'; start = new Date(end - 7 * DAY); label = 'Últimos 7 dias'; }
  if (start > end) start = new Date(end - DAY);
  const len = end - start;
  return { key, label, start: start.toISOString(), end: end.toISOString(), prev_start: new Date(start - len).toISOString(), prev_end: start.toISOString() };
}

// Status (linguagem pública, regra oficial 14 incluída) → condição SQL sobre o conteúdo
const inS = (a, list) => `${a}.stage IN (${list.map((s) => `'${s}'`).join(',')})`;
const STATUS_SQL = {
  rascunho: (a) => inS(a, ['cronograma', 'analise_cronograma', 'ajuste_cronograma']),
  aguardando_cliente: (a) => inS(a, ['aprovacao_tema', 'aprovacao_cliente']),
  em_producao: (a) => inS(a, ['producao', 'analise_producao', 'ajuste_interno', 'ajuste_cliente', 'revisao_ajuste']),
  aprovado: (a) => `${a}.approved_version_id IS NOT NULL AND ${inS(a, ['agendamento', 'agendado', 'publicado'])}`,
  aprovacao_nao_registrada: (a) => `${a}.approved_version_id IS NULL AND ${inS(a, ['agendamento', 'agendado', 'publicado'])}`,
  agendado: (a) => inS(a, ['agendado']), publicado: (a) => inS(a, ['publicado']), bloqueado: (a) => `${a}.blocked=1`,
};
const STATUS_LABEL = { rascunho: 'Rascunho', aguardando_cliente: 'Aguardando cliente', em_producao: 'Em produção', aprovado: 'Aprovado (registrado)', aprovacao_nao_registrada: 'Aprovação não registrada', agendado: 'Agendado', publicado: 'Publicado', bloqueado: 'Bloqueado' };
const KIND_LABEL = { etapa: 'Etapa do processo', ajuste: 'Ajuste', follow_up: 'Follow-up', onboarding: 'Onboarding', reuniao: 'Reunião', manual: 'Manual', agendamento: 'Agendamento' };

export function tower(user, qs = {}) {
  const P = periodOf(qs);
  const nowIso = now();
  const F = { client_id: qs.client_id || null, assignee_id: qs.assignee_id || null, format: qs.format || null, stage: qs.stage || null, priority: qs.priority || null,
    status: STATUS_SQL[qs.status] ? qs.status : null, kind: qs.kind || null, origin: ['migrado', 'plataforma'].includes(qs.origin) ? qs.origin : null };
  const scC = scopeSQL(user, 'c.client_id');
  // filtro de conteúdos (alias c)
  const cw = (alias = 'c') => {
    const w = [scopeSQL(user, `${alias}.client_id`).sql], p = [...scopeSQL(user, `${alias}.client_id`).params];
    if (F.client_id) { w.push(`${alias}.client_id=?`); p.push(F.client_id); }
    if (F.format) { w.push(`${alias}.format=?`); p.push(F.format); }
    if (F.priority) { w.push(`${alias}.priority=?`); p.push(F.priority); }
    if (F.stage) { w.push(`${alias}.stage=?`); p.push(F.stage); }
    if (F.assignee_id) { w.push(`EXISTS (SELECT 1 FROM tasks ft WHERE ft.content_id=${alias}.id AND ft.assignee_id=? AND ft.status IN ('aberta','em_andamento'))`); p.push(F.assignee_id); }
    if (F.status) w.push(STATUS_SQL[F.status](alias));
    if (F.origin) w.push(`${alias}.data_origin='${F.origin === 'migrado' ? 'notion' : 'plataforma'}'`);
    if (F.kind) { w.push(`EXISTS (SELECT 1 FROM tasks fk WHERE fk.content_id=${alias}.id AND fk.kind=?)`); p.push(F.kind); }
    return { sql: w.join(' AND '), p };
  };
  // filtro de tarefas (alias t)
  const tw = (alias = 't') => {
    const s = scopeSQL(user, `${alias}.client_id`);
    const w = [`(${alias}.client_id IS NULL OR ${s.sql})`], p = [...s.params];
    if (F.client_id) { w.push(`${alias}.client_id=?`); p.push(F.client_id); }
    if (F.assignee_id) { w.push(`${alias}.assignee_id=?`); p.push(F.assignee_id); }
    if (F.priority) { w.push(`${alias}.priority=?`); p.push(F.priority); }
    if (F.stage) { w.push(`${alias}.stage=?`); p.push(F.stage); }
    if (F.format) { w.push(`(${alias}.content_id IS NULL OR EXISTS (SELECT 1 FROM contents fc WHERE fc.id=${alias}.content_id AND fc.format=?))`); p.push(F.format); }
    if (F.kind) { w.push(`${alias}.kind=?`); p.push(F.kind); }
    // origem estrutural (regra 24): migrado do Notion × nascido na plataforma
    if (F.origin) w.push(`${alias}.data_origin='${F.origin === 'migrado' ? 'notion' : 'plataforma'}'`);
    if (F.status) w.push(`EXISTS (SELECT 1 FROM contents fs WHERE fs.id=${alias}.content_id AND ${STATUS_SQL[F.status]('fs')})`);
    return { sql: w.join(' AND '), p };
  };

  // ── Base ──
  const clientScope = scopeSQL(user, 'id');
  // carteira = clientes externos (a The Bold, cliente interno, fica fora: regra oficial 16)
  const clients = all(`SELECT * FROM clients WHERE status IN (${q(OPERATING)}) AND kind<>'interno' AND ${clientScope.sql} ${F.client_id ? 'AND id=?' : ''} ORDER BY name`, ...OPERATING, ...clientScope.params, ...(F.client_id ? [F.client_id] : []));
  const C = cw();
  const content = all(`SELECT c.*, cl.name client FROM contents c JOIN clients cl ON cl.id=c.client_id WHERE c.stage<>'cancelado' AND (c.legacy_status IS NULL OR c.legacy_status='reprogramado') AND ${C.sql}`, ...C.p);
  const T = tw();
  const openTasks = all(`SELECT t.*, c.name client, u.name assignee FROM tasks t LEFT JOIN clients c ON c.id=t.client_id LEFT JOIN users u ON u.id=t.assignee_id
    WHERE t.status IN ('aberta','em_andamento') AND t.function<>'cliente' AND ${T.sql}`, ...T.p);
  // Atraso só conta o que pode ser atribuído; herdado da migração aparece à parte (em revisão)
  const lateTasks = openTasks.filter((t) => t.due_at && t.due_at < nowIso && perfOK.equipe(t));
  const inheritedLate = openTasks.filter((t) => t.due_at && t.due_at < nowIso && isInherited(t));
  const lateByContent = new Map();
  for (const t of all(`SELECT content_id, COUNT(*) n FROM tasks t WHERE status IN ('aberta','em_andamento') AND due_at < ? AND content_id IS NOT NULL AND ${PERF_SQL.equipe('t')} GROUP BY content_id`, nowIso)) lateByContent.set(t.content_id, t.n);
  const pend = can(user, 'pendencias') ? computePendencies().filter((p) => !F.client_id || p.client_id === F.client_id) : null;
  const critical = pend ? pend.filter((p) => p.severity === 'critica') : [];
  const members = all("SELECT cm.client_id, cm.function, u.name FROM client_members cm JOIN users u ON u.id=cm.user_id WHERE cm.function<>'cliente'");
  const memberOf = (cid, fn) => members.filter((m) => m.client_id === cid && m.function === fn).map((m) => m.name);

  // ── Mapa da operação (estados reais do Process Engine) ──
  const t0 = Date.now();
  const entered = Object.fromEntries(all(`SELECT l.after stage, COUNT(*) n FROM activity_logs l WHERE l.action='etapa.alterada' AND l.created_at BETWEEN ? AND ? ${F.client_id ? 'AND l.client_id=?' : ''} GROUP BY l.after`,
    P.start, P.end, ...(F.client_id ? [F.client_id] : [])).map((r) => [r.stage, r.n]));
  const stages = STAGE_ORDER.filter((s) => s !== 'cancelado').map((k) => {
    const items = content.filter((c) => c.stage === k);
    const ages = items.map((c) => t0 - new Date(c.stage_entered_at).getTime());
    const sla = STAGES[k].sla;
    return { stage: k, label: STAGES[k].label, lane: STAGES[k].lane, n: items.length, late: items.filter((c) => lateByContent.get(c.id)).length,
      blocked: items.filter((c) => c.blocked).length, avg_days: ages.length && !['agendado', 'publicado'].includes(k) ? days(ages.reduce((a, b) => a + b, 0) / ages.length) : null,
      sla_days: sla ?? null, entered: entered[k] || 0,
      top_client: (() => { const m = {}; for (const c of items) m[c.client] = (m[c.client] || 0) + 1; const top = Object.entries(m).sort((a, b) => b[1] - a[1])[0]; return top ? { name: top[0], n: top[1] } : null; })() };
  });
  // Fases na ordem real do fluxo (agrupamento visual das etapas do Process Engine; nenhuma etapa nova)
  const PHASES = [['planejamento', 'Planejamento', ['cronograma', 'analise_cronograma', 'ajuste_cronograma', 'aprovacao_tema']], ['producao', 'Produção', ['producao', 'analise_producao', 'ajuste_interno']],
    ['cliente', 'Aprovação do cliente', ['aprovacao_cliente', 'ajuste_cliente', 'revisao_ajuste']], ['publicacao', 'Publicação', ['agendamento', 'agendado', 'publicado']]];
  const lanes = PHASES.map(([key, label, st]) => ({ key, label, stages: st, n: stages.filter((x) => st.includes(x.stage)).reduce((a, x) => a + x.n, 0) }));

  // ── Riscos, gargalos e bloqueios ──
  const riskLevels = clients.map((c) => clientRisk(c.id).level);
  const risks = [];
  for (const p of critical) {
    risks.push({ id: p.id, level: 'critico', client: p.client, client_id: p.client_id, problem: p.title, impact: p.impact, who: p.who, due: p.due, late: p.late, process: p.process, link: p.link || '/pendencias' });
  }
  for (const c of clients) {
    const r = clientRisk(c.id);
    if (!['alto', 'critico'].includes(r.level) || risks.some((x) => x.client_id === c.id)) continue;
    const nextPub = content.filter((x) => x.client_id === c.id && x.planned_at && !['agendado', 'publicado'].includes(x.stage)).sort((a, b) => a.planned_at.localeCompare(b.planned_at))[0];
    risks.push({ id: `risk:${c.id}`, level: r.level, client: c.name, client_id: c.id, problem: r.reasons.slice(0, 2).join(' · ') || 'Risco calculado pelos conteúdos do cliente',
      impact: nextPub ? `Próxima publicação prevista em ${new Date(nextPub.planned_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.` : null,
      who: memberOf(c.id, 'estrategia').join(', ') || null, due: nextPub?.planned_at || null, late: null, process: null, link: `/clientes/${c.id}` });
  }
  const bottlenecks = stages.filter((s) => s.n >= 2 && !['agendado', 'publicado'].includes(s.stage) && (s.late >= 2 || (s.sla_days && s.avg_days > s.sla_days * 1.4)))
    .map((s) => ({ stage: s.stage, label: s.label, n: s.n, late: s.late, avg_days: s.avg_days, sla_days: s.sla_days,
      evidence: s.top_client && s.top_client.n >= 2 && s.top_client.n / s.n >= 0.5 ? `${pl(s.top_client.n, 'item pertence', 'itens pertencem')} a ${s.top_client.name}.` : null, link: `/processos?stage=${s.stage}` }))
    .sort((a, b) => b.late - a.late || (b.avg_days || 0) - (a.avg_days || 0));
  const WAITING = { cliente: 'Cliente', informacao: 'Informação', equipe: 'Equipe' };
  const blocks = content.filter((c) => c.blocked && !['publicado'].includes(c.stage)).map((c) => ({ id: c.id, client: c.client, client_id: c.client_id, title: `#${c.number} ${c.title}`, stage: STAGES[c.stage].label,
    reason: c.block_reason, by: WAITING[c.waiting_on] || c.waiting_on || '—', since: c.updated_at, planned_at: c.planned_at, link: `/conteudos/${c.id}` }))
    .sort((a, b) => (a.planned_at || '9').localeCompare(b.planned_at || '9'));

  // ── Clientes & saúde ──
  const migOpen = Object.fromEntries(all("SELECT client_id, COUNT(*) n FROM migration_issues WHERE status='aberto' AND client_id IS NOT NULL GROUP BY client_id").map((r) => [r.client_id, r.n]));
  const health = clients.map((c) => {
    const cs = content.filter((x) => x.client_id === c.id);
    const r = clientRisk(c.id);
    const missing = Object.keys(ESSENTIAL).filter((fn) => !memberOf(c.id, fn).length);
    const row = {
      id: c.id, name: c.name, status: c.status, risk: r.level, reasons: r.reasons,
      pendencias: pend ? pend.filter((p) => p.client_id === c.id).length : null,
      aguardando: cs.filter((x) => WAIT.includes(x.stage)).length, atrasos: openTasks.filter((t) => t.client_id === c.id && t.due_at && t.due_at < nowIso && perfOK.equipe(t)).length,
      bloqueados: cs.filter((x) => x.blocked).length, ativos: cs.filter((x) => ACTIVE.includes(x.stage)).length,
      sem_funcao: missing.map((fn) => ESSENTIAL[fn]), decisoes: migOpen[c.id] || 0,
    };
    const nextC = cs.filter((x) => ACTIVE.includes(x.stage)).sort((a, b) => (b.blocked - a.blocked) || (a.planned_at || '9').localeCompare(b.planned_at || '9'))[0];
    row.next = nextC ? `${STAGES[nextC.stage].label}: #${nextC.number} ${nextC.title}` : row.decisoes ? `Resolver ${pl(row.decisoes, 'decisão', 'decisões')} da migração` : missing.length ? `Vincular ${missing.map((x) => ESSENTIAL[x].toLowerCase()).join(', ')}` : null;
    const rl = { critico: 40, alto: 30, medio: 5 }[r.level] || 0;
    row.score = rl + (row.pendencias || 0) * 4 + row.atrasos * 3 + row.bloqueados * 4 + row.aguardando * 2 + missing.length * 2 + (row.decisoes ? 1 : 0);
    return row;
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  // ── Responsabilidades ──
  const noOwner = health.filter((h) => h.sem_funcao.length).map((h) => ({ client_id: h.id, client: h.name, functions: h.sem_funcao }));
  // regra 23/20: tarefa migrada sem dono não vira alerta; aparece só como contagem à parte
  const unassignedMigrated = openTasks.filter((t) => !t.assignee_id && t.data_origin === 'notion').length;
  const unassigned = openTasks.filter((t) => !t.assignee_id && t.data_origin === 'plataforma').map((t) => ({ id: t.id, title: t.title, client: t.client, client_id: t.client_id, function: t.function, content_id: t.content_id, due_at: t.due_at }));
  const teamConflicts = one("SELECT COUNT(*) n FROM migration_issues WHERE status='aberto' AND kind='equipe'").n;

  // ── Pessoas ──
  const done = Object.fromEntries(all(`SELECT completed_by id, COUNT(*) n, SUM(due_at IS NOT NULL AND completed_at > due_at AND ${PERF_SQL.individual('tasks')}) late FROM tasks WHERE status='concluida' AND completed_at BETWEEN ? AND ? GROUP BY completed_by`, P.start, P.end).map((r) => [r.id, r]));
  // CAPACIDADE: carga e alertas só com eventos operacionais reais (tarefa nascida na plataforma).
  // Tarefa herdada da migração aparece à parte ("carga herdada") e nunca vira alerta sobre a pessoa.
  const week = new Date(Date.now() + 7 * 864e5).toISOString();
  const real = (t) => t.data_origin === 'plataforma';
  const people = teamLoad().filter((u) => !F.assignee_id || u.id === F.assignee_id).map((u) => {
    const open = openTasks.filter((t) => t.assignee_id === u.id);
    const op = open.filter(real);
    const late = open.filter((t) => t.due_at && t.due_at < nowIso && perfOK.individual(t)).length;
    const inherited = open.filter((t) => t.due_at && t.due_at < nowIso && isInherited(t)).length;
    const ratio = u.capacity ? op.length / u.capacity : 0;
    return { id: u.id, name: u.name, functions: parseJSON(u.functions, []), capacity: u.capacity, capacity_source: 'configurada no cadastro (não medida)',
      open: open.length, open_real: op.length, open_inherited: open.length - op.length, late, inherited,
      next7: op.filter((t) => t.due_at && t.due_at >= nowIso && t.due_at <= week).length, next7_inherited: open.filter((t) => !real(t) && t.due_at && t.due_at >= nowIso && t.due_at <= week).length, done: done[u.id]?.n || 0, done_late: done[u.id]?.late || 0,
      situation: !op.length && open.length ? 'so_herdada' : op.length > u.capacity ? 'sobrecarga' : ratio >= 0.8 ? 'alta' : op.length === 0 ? 'sem_carga' : 'normal' };
  });
  const totalOpen = openTasks.length;
  const realOpen = openTasks.filter(real).length;
  const peopleInsights = [];
  if (realOpen >= 5) {
    const top = [...people].sort((a, b) => b.open_real - a.open_real)[0];
    if (top && top.open_real / realOpen >= 0.4) peopleInsights.push({ kind: 'Concentração', text: `${top.name} concentra ${Math.round((top.open_real / realOpen) * 100)}% das tarefas abertas nascidas na plataforma (${top.open_real} de ${realOpen}).`, link: `/processos?assignee_id=${top.id}`, person: top.id });
  }
  const busy = people.filter((p) => ['alta', 'sobrecarga'].includes(p.situation));
  const idle = people.filter((p) => p.situation === 'sem_carga' && p.functions.length);
  if (busy.length && idle.length) peopleInsights.push({ kind: 'Subutilização', text: `${pl(idle.length, 'pessoa com função operacional está', 'pessoas com função operacional estão')} sem tarefas (${idle.map((p) => p.name).join(', ')}) enquanto ${busy.map((p) => p.name).join(', ')} ${busy.length === 1 ? 'está' : 'estão'} com carga alta.`, link: '/processos' });
  for (const p of people.filter((x) => x.situation === 'sobrecarga')) peopleInsights.push({ kind: 'Sobrecarga', text: `${p.name}: ${p.open_real} tarefas abertas nascidas na plataforma para capacidade configurada de ${p.capacity}/semana${p.late ? `, ${pl(p.late, 'atrasada', 'atrasadas')}` : ''}.`, link: `/processos?assignee_id=${p.id}`, person: p.id });
  if (unassigned.length) peopleInsights.push({ kind: 'Sem responsável', text: `${pl(unassigned.length, 'tarefa aberta sem responsável', 'tarefas abertas sem responsável')} — ninguém foi notificado.`, link: '/pendencias' });
  if (!realOpen && totalOpen) peopleInsights.push({ kind: 'Dados insuficientes', text: `Todas as ${totalOpen} tarefas abertas são herdadas da migração. Sobrecarga, concentração e subutilização só são calculadas com tarefas nascidas na plataforma.`, link: '/processos' });
  const byFn = {};
  for (const t of openTasks) if (t.function) byFn[t.function] = (byFn[t.function] || 0) + 1;
  const fnLoad = Object.entries(byFn).map(([fn, n]) => ({ fn, open: n, people: people.filter((p) => p.functions.includes(fn)).length })).sort((a, b) => b.open - a.open);

  // ── Desempenho do período (e comparação somente com histórico) ──
  const perf = (s, e) => {
    const c2 = cw('c');
    const t2 = tw('t');
    const r = {
      conteudos_criados: one(`SELECT COUNT(*) n FROM contents c WHERE c.created_at BETWEEN ? AND ? AND ${c2.sql}`, s, e, ...c2.p).n,
      temas_aprovados: one(`SELECT COUNT(*) n FROM approvals a JOIN contents c ON c.id=a.content_id WHERE a.kind='tema' AND a.decision='aprovado' AND a.created_at BETWEEN ? AND ? AND ${c2.sql}`, s, e, ...c2.p).n,
      aprovados_cliente: one(`SELECT COUNT(*) n FROM approvals a JOIN contents c ON c.id=a.content_id WHERE a.kind='cliente' AND a.decision='aprovado' AND a.created_at BETWEEN ? AND ? AND ${c2.sql}`, s, e, ...c2.p).n,
      ajustes_internos: one(`SELECT COUNT(*) n FROM adjustments a JOIN contents c ON c.id=a.content_id WHERE a.origin='interno' AND a.created_at BETWEEN ? AND ? AND ${c2.sql}`, s, e, ...c2.p).n,
      ajustes_cliente: one(`SELECT COUNT(*) n FROM adjustments a JOIN contents c ON c.id=a.content_id WHERE a.origin='cliente' AND a.created_at BETWEEN ? AND ? AND ${c2.sql}`, s, e, ...c2.p).n,
      publicados: one(`SELECT COUNT(*) n FROM contents c WHERE c.published_at BETWEEN ? AND ? AND ${c2.sql}`, s, e, ...c2.p).n,
      tarefas_concluidas: one(`SELECT COUNT(*) n FROM tasks t WHERE t.status='concluida' AND t.completed_at BETWEEN ? AND ? AND ${t2.sql}`, s, e, ...t2.p).n,
      concluidas_atraso: one(`SELECT COUNT(*) n FROM tasks t WHERE t.status='concluida' AND t.completed_at BETWEEN ? AND ? AND t.due_at IS NOT NULL AND t.completed_at > t.due_at AND ${PERF_SQL.equipe('t')} AND ${t2.sql}`, s, e, ...t2.p).n,
      prazos_estourados: one(`SELECT COUNT(*) n FROM tasks t WHERE t.due_at BETWEEN ? AND ? AND t.due_at < ? AND (t.status IN ('aberta','em_andamento') OR (t.status='concluida' AND t.completed_at > t.due_at)) AND ${PERF_SQL.equipe('t')} AND ${t2.sql}`, s, e, nowIso, ...t2.p).n,
    };
    const appr = all(`SELECT a.created_at, (SELECT MAX(l.created_at) FROM activity_logs l WHERE l.content_id=a.content_id AND l.action='etapa.alterada' AND l.after IN ('aprovacao_cliente','aprovacao_tema') AND l.created_at<=a.created_at) sent
      FROM approvals a JOIN contents c ON c.id=a.content_id WHERE a.kind IN ('cliente','tema') AND a.created_at BETWEEN ? AND ? AND ${c2.sql}`, s, e, ...c2.p).filter((x) => x.sent);
    r.tempo_aprovacao = appr.length ? days(appr.reduce((a, x) => a + (new Date(x.created_at) - new Date(x.sent)), 0) / appr.length) : null;
    r.tempo_aprovacao_n = appr.length;
    return r;
  };
  const cur = perf(P.start, P.end);
  const firstEvent = one("SELECT MIN(created_at) t FROM activity_logs WHERE action NOT LIKE 'migracao.%' AND action NOT LIKE 'auth.%'").t;
  const comparable = !!firstEvent && firstEvent <= P.prev_start;
  const prev = comparable ? perf(P.prev_start, P.prev_end) : null;
  const moves = all(`SELECT l.created_at, l.summary, l.content_id, l.client_id FROM activity_logs l WHERE l.action='etapa.alterada' AND l.created_at BETWEEN ? AND ? ${F.client_id ? 'AND l.client_id=?' : ''} ORDER BY l.created_at DESC LIMIT 8`,
    P.start, P.end, ...(F.client_id ? [F.client_id] : []));
  const movesN = one(`SELECT COUNT(*) n FROM activity_logs l WHERE l.action='etapa.alterada' AND l.created_at BETWEEN ? AND ? ${F.client_id ? 'AND l.client_id=?' : ''}`, P.start, P.end, ...(F.client_id ? [F.client_id] : [])).n;

  // ── Inteligência (detectores sobre dados reais; evidência sempre calculada) ──
  runDetectors();
  const ins = all("SELECT * FROM ai_insights WHERE status='aberto' ORDER BY CASE severity WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, updated_at DESC")
    .filter((i) => !F.client_id || !i.client_id || i.client_id === F.client_id);
  const intel = [];
  const so = ins.filter((i) => i.detector === 'sem_responsavel');
  if (so.length) {
    const byClient = {};
    for (const i of so) { const fn = i.fingerprint.split(':')[2]; const nm = clients.find((c) => c.id === i.client_id)?.name || '—'; (byClient[nm] ||= []).push(ESSENTIAL[fn] || fn); }
    const list = Object.entries(byClient);
    intel.push({ id: 'agg:sem_responsavel', kind: 'Responsabilidade', severity: 'alta', what: `${pl(list.length, 'cliente', 'clientes')} sem pessoa vinculada em funções essenciais do processo.`,
      why: 'Tarefas dessas funções nascem sem responsável: ninguém é notificado e a etapa para.',
      evidence: list.slice(0, 6).map(([n, fns]) => `${n}: ${fns.join(', ')}`).concat(list.length > 6 ? [`+ ${list.length - 6} cliente(s)`] : []),
      fact: `${pl(list.length, 'cliente', 'clientes')} sem pessoa vinculada em funções essenciais do processo.`, pattern: null, hypothesis: null,
      recommendation: 'Vincular os responsáveis na aba Equipe de cada cliente (Divisão).',
      action: { label: 'Ver responsabilidades', to: '#responsabilidades' } });
  }
  for (const i of ins.filter((x) => x.detector !== 'sem_responsavel')) {
    let link = '/insights'; try { link = JSON.parse(i.action_payload || '{}').link || link; } catch { /* payload antigo */ }
    const ev = [];
    if (i.detector === 'gargalo') {
      const st = i.fingerprint.split(':')[1];
      for (const r of all(`SELECT c.name, COUNT(*) n FROM tasks t LEFT JOIN clients c ON c.id=t.client_id WHERE t.status IN ('aberta','em_andamento') AND t.due_at < ? AND t.stage=? AND ${PERF_SQL.equipe('t')} GROUP BY c.name ORDER BY n DESC LIMIT 3`, nowIso, st)) ev.push(`${r.name || 'Sem cliente'}: ${pl(r.n, 'tarefa atrasada', 'tarefas atrasadas')}`);
    } else if (i.detector === 'material') {
      for (const c of content.filter((x) => x.blocked && x.waiting_on === 'cliente').slice(0, 4)) ev.push(`${c.client} · #${c.number} ${c.title}`);
    } else if (i.detector === 'tempo_aprovacao') ev.push(`Média de ${String(i.metric).replace('.', ',')} ${i.metric === 1 ? 'dia' : 'dias'} entre envio e aprovação nos últimos 60 dias.`);
    else if (i.metric != null) ev.push(`Medida: ${String(i.metric).replace('.', ',')}${i.detector === 'dependencia' ? '% das intervenções manuais' : ''}`);
    intel.push({ id: i.id, kind: { gargalo: 'Gargalo', carga: 'Capacidade', tempo_aprovacao: 'Tendência', retrabalho: 'Retrabalho', material: 'Dependência', dependencia: 'Dependência' }[i.detector] || 'Padrão',
      severity: i.severity, what: i.problem, why: i.impact, evidence: ev, suggestion: i.suggestion, action: { label: i.action || 'Investigar', to: link }, ...explain(i) });
  }
  for (const pi of peopleInsights.filter((x) => x.kind === 'Concentração')) intel.push({ id: `conc:${pi.person}`, kind: 'Concentração', severity: 'media', what: pi.text, why: 'Uma única pessoa vira ponto de falha do ciclo.', evidence: [`${totalOpen} tarefas abertas na operação`], action: { label: 'Ver tarefas', to: pi.link },
    fact: pi.text, pattern: null, hypothesis: null, recommendation: 'Verificar a distribuição por função antes de redistribuir.' });

  // ── Detalhamento: financeiro, comercial, automações, relatórios, agenda ──
  const fin = can(user, 'financeiro') ? (() => {
    const n = one('SELECT (SELECT COUNT(*) FROM contracts) + (SELECT COUNT(*) FROM invoices) n').n;
    return { has_data: n > 0,
      recebido: one('SELECT COALESCE(SUM(paid_amount),0) v FROM invoices WHERE paid_at BETWEEN ? AND ?', P.start, P.end).v,
      em_aberto: one("SELECT COALESCE(SUM(amount),0) v FROM invoices WHERE status='aberta'").v,
      atrasado: one("SELECT COALESCE(SUM(amount),0) v FROM invoices WHERE status='atrasada'").v,
      a_receber_30d: one("SELECT COALESCE(SUM(amount),0) v FROM invoices WHERE status='aberta' AND due_at BETWEEN ? AND ?", nowIso, new Date(Date.now() + 30 * DAY).toISOString()).v,
      inadimplentes: one("SELECT COUNT(DISTINCT client_id) n FROM invoices WHERE status='atrasada'").n };
  })() : null;
  const crm = can(user, 'crm') ? (() => {
    const n = one('SELECT COUNT(*) n FROM deals').n;
    const open = "stage NOT IN ('fechado','perdido','onboarding')";
    return { has_data: n > 0,
      leads: one("SELECT COUNT(*) n FROM deals WHERE stage IN ('lead','contato')").n,
      oportunidades: one("SELECT COUNT(*) n FROM deals WHERE stage IN ('qualificacao','reuniao','proposta')").n,
      negociacao: one("SELECT COUNT(*) n FROM deals WHERE stage='negociacao'").n,
      ganhos: one("SELECT COUNT(*) n FROM deals WHERE stage IN ('fechado','onboarding') AND updated_at BETWEEN ? AND ?", P.start, P.end).n,
      followups_vencidos: one(`SELECT COUNT(*) n FROM deals WHERE ${open} AND next_action_at < ?`, nowIso).n,
      pipeline: one(`SELECT COALESCE(SUM(value),0) v FROM deals WHERE ${open}`).v };
  })() : null;
  const runs = all('SELECT status, COUNT(*) n FROM automation_runs WHERE created_at BETWEEN ? AND ? GROUP BY status', P.start, P.end);
  const autos = {
    runs: runs.reduce((a, r) => a + r.n, 0), ok: runs.find((r) => r.status === 'ok')?.n || 0, ignored: runs.find((r) => r.status === 'ignorada')?.n || 0, errors: runs.find((r) => r.status === 'erro')?.n || 0,
    active: one('SELECT COUNT(*) n FROM automations WHERE implemented=1 AND enabled=1').n, catalog: one('SELECT COUNT(*) n FROM automations').n,
    top: all('SELECT automation_key k, COUNT(*) n FROM automation_runs WHERE created_at BETWEEN ? AND ? GROUP BY automation_key ORDER BY n DESC LIMIT 6', P.start, P.end).map((r) => ({ ...r, label: AUTO[r.k]?.event || r.k })),
  };
  const report = one('SELECT id, kind, period_start, period_end, generated_by, created_at FROM reports ORDER BY created_at DESC LIMIT 1');
  const msc = scopeSQL(user, 'm.client_id');
  const meetings = all(`SELECT m.id, m.title, m.starts_at, m.gcal_sync, c.name client_name FROM meetings m LEFT JOIN clients c ON c.id=m.client_id WHERE m.status='agendada' AND m.starts_at BETWEEN ? AND ? AND (m.client_id IS NULL OR ${msc.sql}) ORDER BY m.starts_at LIMIT 5`, nowIso, new Date(Date.now() + 7 * DAY).toISOString(), ...msc.params);

  // ── Estado da operação + resumo ──
  const inOp = content.filter((c) => ACTIVE.includes(c.stage));
  const endToday = new Date(`${new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)}T23:59:59-03:00`).toISOString();
  const state = {
    operacao: { n: inOp.length, producao: inOp.filter((c) => PROD.includes(c.stage) && !REVIEW.includes(c.stage)).length, revisao: inOp.filter((c) => REVIEW.includes(c.stage)).length, clientes: inOp.filter((c) => WAIT.includes(c.stage)).length },
    clientes: { n: clients.length, ativos: clients.filter((c) => c.status === 'ativo').length, a_confirmar: clients.filter((c) => c.status === 'a_confirmar').length, com_operacao: new Set(inOp.map((c) => c.client_id)).size, em_risco: riskLevels.filter((r) => ['alto', 'critico'].includes(r)).length },
    producao: { n: content.filter((c) => PROD.includes(c.stage)).length, bloqueados: blocks.length, agendados: content.filter((c) => c.stage === 'agendado').length, publicados: cur.publicados },
    prazos: { n: lateTasks.length, herdados: inheritedLate.length, hoje: openTasks.filter((t) => t.data_origin === 'plataforma' && t.due_at && t.due_at >= nowIso && t.due_at <= endToday).length, hoje_herdados: openTasks.filter((t) => t.data_origin === 'notion' && t.due_at && t.due_at >= nowIso && t.due_at <= endToday).length, sem_responsavel: unassigned.length },
    riscos: { n: risks.length, criticas: pend ? critical.length : null, clientes: new Set(risks.map((r) => r.client_id).filter(Boolean)).size },
    pessoas: { n: people.length, sobrecarga: people.filter((p) => p.situation === 'sobrecarga').length, sem_carga: people.filter((p) => p.situation === 'sem_carga').length, abertas: totalOpen },
  };
  const top = risks[0] ? `${risks[0].client ? `${risks[0].client}: ` : ''}${risks[0].problem}` : bottlenecks[0] ? `Gargalo em “${bottlenecks[0].label}” (${pl(bottlenecks[0].n, 'item', 'itens')}).`
    : intel[0] ? intel[0].what : null;
  const summary = {
    lines: [`${pl(state.operacao.n, 'item em operação', 'itens em operação')}`, `${pl(state.prazos.n, 'tarefa atrasada', 'tarefas atrasadas')}${state.prazos.herdados ? ` (+ ${state.prazos.herdados} herdadas da migração, em revisão)` : ''}`, `${pl(state.clientes.em_risco, 'cliente em risco', 'clientes em risco')}`]
      .concat(pend ? [`${pl(critical.length, 'pendência crítica', 'pendências críticas')}`] : []),
    focus: top,
  };

  // Opções de filtro: só valores que existem nos dados
  const filters = {
    clients: all(`SELECT id, name FROM clients WHERE status IN (${q(OPERATING)}) AND ${clientScope.sql} ORDER BY name`, ...OPERATING, ...clientScope.params),
    people: all("SELECT id, name FROM users WHERE active=1 AND role_key<>'cliente' ORDER BY name"),
    stages: all(`SELECT DISTINCT stage FROM contents c WHERE stage<>'cancelado' AND ${scC.sql}`, ...scC.params).map((r) => r.stage).sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b)).map((s) => ({ key: s, label: STAGES[s].label })),
    formats: all(`SELECT DISTINCT format FROM contents c WHERE ${scC.sql}`, ...scC.params).map((r) => r.format),
    priorities: all(`SELECT DISTINCT priority FROM contents c WHERE ${scC.sql}`, ...scC.params).map((r) => r.priority),
    statuses: Object.keys(STATUS_SQL).filter((k) => one(`SELECT 1 FROM contents c WHERE c.stage<>'cancelado' AND ${STATUS_SQL[k]('c')} AND ${scC.sql} LIMIT 1`, ...scC.params)).map((k) => ({ key: k, label: STATUS_LABEL[k] })),
    kinds: all("SELECT DISTINCT kind FROM tasks WHERE status IN ('aberta','em_andamento','agendada')").map((r) => ({ key: r.kind, label: KIND_LABEL[r.kind] || r.kind })),
    origins: [{ key: 'migrado', label: 'Dado migrado do Notion' }, { key: 'plataforma', label: 'Evento real da plataforma' }],
  };

  return {
    period: P, applied: F, filters, summary, state,
    risks: risks.slice(0, 12), bottlenecks, blocks,
    stages, lanes,
    health, responsibilities: { no_owner: noOwner, unassigned, unassigned_migrated: unassignedMigrated, team_conflicts: teamConflicts },
    people, people_insights: peopleInsights, fn_load: fnLoad, performance_base: performanceBase(),
    performance: { current: cur, previous: prev, comparable, first_event: firstEvent, moves, moves_n: movesN, pendencias_abertas: pend ? pend.length : null },
    intel, finance: fin, crm, automations: autos, report, meetings,
    // herdados vencidos ficam fora desta lista: estão na Revisão de atrasos
    deadlines: openTasks.filter((t) => t.due_at && !(isInherited(t) && t.due_at < nowIso)).sort((a, b) => a.due_at.localeCompare(b.due_at)).slice(0, 25)
      .map((t) => ({ id: t.id, title: t.title, client: t.client, assignee: t.assignee, due_at: t.due_at, content_id: t.content_id, client_id: t.client_id, overdue: t.due_at < nowIso && perfOK.equipe(t), inherited: t.data_origin === 'notion' })),
  };
}

// Execuções de automação para investigação (qual rodou, quando, sobre o quê, resultado)
export function automationRuns(qs = {}) {
  const P = periodOf(qs);
  const w = ['r.created_at BETWEEN ? AND ?'], p = [P.start, P.end];
  if (qs.status) { w.push('r.status=?'); p.push(qs.status); }
  if (qs.key) { w.push('r.automation_key=?'); p.push(qs.key); }
  return all(`SELECT r.*, c.name client FROM automation_runs r LEFT JOIN clients c ON c.id=r.client_id WHERE ${w.join(' AND ')} ORDER BY r.created_at DESC LIMIT 80`, ...p)
    .map((r) => ({ ...r, label: AUTO[r.automation_key]?.event || r.automation_key, action: AUTO[r.automation_key]?.action || null }));
}

// Tarefas abertas de uma pessoa (drill-down da capacidade)
export function personTasks(userId) {
  return all(`SELECT t.id, t.title, t.due_at, t.status, t.function, t.content_id, t.client_id, t.priority, c.name client FROM tasks t LEFT JOIN clients c ON c.id=t.client_id
    WHERE t.assignee_id=? AND t.status IN ('aberta','em_andamento') ORDER BY t.due_at IS NULL, t.due_at`, userId);
}
