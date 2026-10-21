// EQUIPE & PERFORMANCE — fatos por pessoa, só com dados nascidos na plataforma (regras oficiais 8, 9, 13, 22, 23, 24 e 25).
// A tela existe sempre, mesmo com 0 eventos. NUNCA calcula score, nota, percentual comparativo nem ranking (decisão da CEO:
// "Score e ranking — fora do escopo"). Capacidade é a CONFIGURADA no cadastro (users.capacity), não medida.
// Cada métrica que a base não permite derivar volta null + `reason` explícito — nada é estimado.
import { Router } from 'express';
import { one, all, now, nowMs, parseJSON } from '../db.js';
import { requireInternal, requirePerm } from '../lib/auth.js';
import { PERF_SQL, performanceBase } from '../services/delayReview.js';
import { STAGES, STAGE_ORDER, setting } from '../engine/process.js';

export const performance = Router();

const DAY = 864e5;
const PERIODS = [7, 30, 90];
// Limiar de eventos válidos no período para afirmar qualquer leitura de performance (tendência).
// Padrão provisório; ajustável em settings.performance_min_eventos — a definição final é da CEO.
export const DEFAULT_MIN_VALID_EVENTS = 20;
// Mínimo de eventos de uma pessoa (período atual + anterior) para mostrar a tendência dela
const MIN_PERSON_TREND = 5;
const OPEN = "('aberta','em_andamento')";
const T_PLAT = PERF_SQL.individual('t'); // t.data_origin='plataforma' — mesma regra auditável da Torre e da base de performance
const DELAY_LABEL = {
  atraso_cliente: 'Atraso do cliente', aguardando_cliente: 'Aguardando cliente', atraso_equipe: 'Atraso da equipe', atraso_responsavel: 'Atraso do responsável',
  processo_antigo: 'Processo antigo', dado_migrado: 'Dado migrado', responsabilidade_alterada: 'Responsabilidade alterada', outro: 'Outro',
};
const WAITING = { cliente: 'aguardando cliente', equipe: 'aguardando equipe', informacao: 'aguardando informação' };
const idx = (s) => STAGE_ORDER.indexOf(s);
const daysBetween = (a, b) => Math.max(0, Math.floor((new Date(b) - new Date(a)) / DAY));

export function periodFor(q = {}) {
  const days = PERIODS.includes(Number(q.days)) ? Number(q.days) : 30;
  const endMs = nowMs();
  const end = new Date(endMs).toISOString();
  const start = new Date(endMs - days * DAY).toISOString();
  const prev_start = new Date(endMs - 2 * days * DAY).toISOString();
  return { days, start, end, prev_start, prev_end: start, label: `Últimos ${days} dias` };
}

// Evento válido = tarefa concluída na plataforma, com quem concluiu registrado (mesma definição de performanceBase/executive).
const validEventsIn = (s, e) => one(`SELECT COUNT(*) n FROM tasks t WHERE t.status='concluida' AND t.completed_by IS NOT NULL AND ${T_PLAT} AND t.completed_at BETWEEN ? AND ?`, s, e).n;

export function performanceReport(_user, query = {}) {
  const P = periodFor(query);
  const nowIso = now();
  const configured = Number(setting('performance_min_eventos'));
  const threshold = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MIN_VALID_EVENTS;
  const base = performanceBase();
  const count = validEventsIn(P.start, P.end);
  const sufficient = count >= threshold;
  const firstPlatform = one(`SELECT MIN(t.created_at) t FROM tasks t WHERE ${T_PLAT}`).t;
  const comparable = !!firstPlatform && firstPlatform <= P.prev_start;

  const people = all("SELECT id, name, title, functions, capacity, role_key FROM users WHERE active=1 AND role_key<>'cliente' ORDER BY name");

  // ── Registros de suporte (todos filtrados por origem plataforma) ──
  const doneRows = all(`SELECT t.id, t.title, t.stage, t.function, t.content_id, t.client_id, t.due_at, t.completed_at, t.completed_by, cl.name client
    FROM tasks t LEFT JOIN clients cl ON cl.id=t.client_id
    WHERE t.status='concluida' AND t.completed_by IS NOT NULL AND ${T_PLAT} AND t.completed_at BETWEEN ? AND ? ORDER BY t.completed_at DESC`, P.start, P.end);
  const prevDone = Object.fromEntries(all(`SELECT t.completed_by id, COUNT(*) n FROM tasks t WHERE t.status='concluida' AND t.completed_by IS NOT NULL AND ${T_PLAT} AND t.completed_at BETWEEN ? AND ? GROUP BY t.completed_by`, P.prev_start, P.prev_end).map((r) => [r.id, r.n]));
  const openRows = all(`SELECT t.id, t.title, t.stage, t.content_id, t.client_id, t.assignee_id, t.due_at, t.data_origin, cl.name client,
      c.blocked, c.block_reason, c.waiting_on, c.number content_number, d.category delay_category, d.decided_by delay_decided
    FROM tasks t LEFT JOIN clients cl ON cl.id=t.client_id LEFT JOIN contents c ON c.id=t.content_id LEFT JOIN delay_reviews d ON d.task_id=t.id
    WHERE t.status IN ${OPEN} AND t.assignee_id IS NOT NULL`);
  const lateDoneCtx = Object.fromEntries(all(`SELECT t.id, c.waiting_on, c.block_reason, d.category delay_category, d.decided_by delay_decided
    FROM tasks t LEFT JOIN contents c ON c.id=t.content_id LEFT JOIN delay_reviews d ON d.task_id=t.id
    WHERE t.status='concluida' AND ${T_PLAT} AND t.completed_at BETWEEN ? AND ? AND t.due_at IS NOT NULL AND t.completed_at > t.due_at`, P.start, P.end).map((r) => [r.id, r]));

  // Reabertura: o conteúdo voltou para a etapa (ou antes) que a pessoa já tinha entregue na plataforma.
  // Fontes registradas: stage_moves (kind retorno | reabertura) e devolução controlada (etapa.alterada "(devolvido: …)").
  const backMoves = [
    ...all("SELECT content_id, to_stage, created_at, reason FROM stage_moves WHERE kind IN ('retorno','reabertura') AND created_at BETWEEN ? AND ?", P.start, P.end),
    ...all("SELECT content_id, after to_stage, created_at, summary reason FROM activity_logs WHERE action='etapa.alterada' AND summary LIKE '%(devolvido:%' AND created_at BETWEEN ? AND ?", P.start, P.end),
  ];
  const deliveredOn = (contentId, before) => all(`SELECT t.completed_by uid, t.stage FROM tasks t WHERE t.content_id=? AND t.status='concluida' AND t.completed_by IS NOT NULL AND ${T_PLAT}
    AND COALESCE(t.function,'')<>'cliente' AND t.completed_at < ?`, contentId, before);
  const reopenedBy = {};
  for (const m of backMoves) {
    const who = new Set(deliveredOn(m.content_id, m.created_at).filter((d) => d.stage && idx(d.stage) >= idx(m.to_stage)).map((d) => d.uid));
    for (const u of who) reopenedBy[u] = (reopenedBy[u] || 0) + 1;
  }

  // Devolução: revisão INTERNA pediu ajuste (approvals decision='ajuste' por pessoa da equipe) sobre a entrega mais recente da pessoa.
  const PRODUCER = { interna: ['producao', 'ajuste_interno', 'ajuste_cliente'], tema: ['cronograma', 'ajuste_cronograma'] };
  const returns = all(`SELECT a.id, a.content_id, a.kind, a.created_at FROM approvals a JOIN users u ON u.id=a.user_id
    WHERE a.decision='ajuste' AND a.kind IN ('interna','tema') AND u.role_key<>'cliente' AND a.created_at BETWEEN ? AND ?`, P.start, P.end);
  const returnedBy = {};
  for (const r of returns) {
    const prevAppr = one('SELECT MAX(created_at) t FROM approvals WHERE content_id=? AND created_at < ?', r.content_id, r.created_at).t || '';
    const st = PRODUCER[r.kind];
    const who = all(`SELECT DISTINCT t.completed_by uid FROM tasks t WHERE t.content_id=? AND t.status='concluida' AND t.completed_by IS NOT NULL AND ${T_PLAT}
      AND t.stage IN (${st.map(() => '?').join(',')}) AND t.completed_at <= ? AND t.completed_at > ?`, r.content_id, ...st, r.created_at, prevAppr).map((x) => x.uid);
    for (const u of who) returnedBy[u] = (returnedBy[u] || 0) + 1;
  }

  // Reprogramação: só existe se a base registrar alteração de prazo de tarefa (activity_logs action 'tarefa.prazo_alterado').
  const dueChangeRecorded = !!one("SELECT 1 FROM activity_logs WHERE action='tarefa.prazo_alterado' LIMIT 1");
  const reprogBy = dueChangeRecorded ? Object.fromEntries(all(`SELECT t.assignee_id id, COUNT(*) n FROM activity_logs l JOIN tasks t ON t.id=l.entity_id
    WHERE l.action='tarefa.prazo_alterado' AND l.entity_type='task' AND ${T_PLAT} AND l.created_at BETWEEN ? AND ? GROUP BY t.assignee_id`, P.start, P.end).map((r) => [r.id, r.n])) : null;

  const reasonOf = (r) => {
    if (r.delay_decided && DELAY_LABEL[r.delay_category]) return `${DELAY_LABEL[r.delay_category]} (classificado na Revisão de atrasos)`;
    if (r.blocked && r.waiting_on) return `Bloqueado — ${WAITING[r.waiting_on] || r.waiting_on}${r.block_reason ? `: ${r.block_reason}` : ''}`;
    if (r.waiting_on && r.block_reason) return `${WAITING[r.waiting_on] || r.waiting_on}: ${r.block_reason}`;
    return 'Sem motivo registrado';
  };

  const out = people.map((u) => {
    const mineOpen = openRows.filter((t) => t.assignee_id === u.id);
    const open = mineOpen.filter((t) => t.data_origin === 'plataforma');
    const done = doneRows.filter((t) => t.completed_by === u.id);
    const withDue = done.filter((t) => t.due_at);
    const onTime = withDue.filter((t) => t.completed_at <= t.due_at);
    const late = withDue.filter((t) => t.completed_at > t.due_at);
    const overdue = open.filter((t) => t.due_at && t.due_at < nowIso);
    const blocked = open.filter((t) => t.blocked);
    const prevN = prevDone[u.id] || 0;
    const personEvents = done.length + prevN;
    let trend;
    if (!sufficient) trend = { value: null, reason: `Equipe abaixo do mínimo de ${threshold} eventos válidos no período.` };
    else if (!comparable) trend = { value: null, reason: 'Sem período anterior comparável: a coleta na plataforma começou depois do início do período anterior.' };
    else if (personEvents < MIN_PERSON_TREND) trend = { value: null, reason: `Menos de ${MIN_PERSON_TREND} entregas da pessoa somando este período e o anterior.` };
    else trend = { value: done.length > prevN ? 'subiu' : done.length < prevN ? 'caiu' : 'estavel', current: done.length, previous: prevN, reason: null };
    const lateCtx = [
      ...overdue.map((t) => ({ id: t.id, title: t.title, client: t.client, stage: STAGES[t.stage]?.label || t.stage, status: 'aberta', days_late: daysBetween(t.due_at, nowIso), waiting_on: t.waiting_on || null, reason: reasonOf(t), content_id: t.content_id })),
      ...late.map((t) => ({ id: t.id, title: t.title, client: t.client, stage: STAGES[t.stage]?.label || t.stage, status: 'concluida', days_late: daysBetween(t.due_at, t.completed_at), waiting_on: lateDoneCtx[t.id]?.waiting_on || null, reason: reasonOf(lateDoneCtx[t.id] || {}), content_id: t.content_id })),
    ].sort((a, b) => b.days_late - a.days_late).slice(0, 5);
    return {
      id: u.id, name: u.name, title: u.title || null, functions: parseJSON(u.functions, []),
      capacity_configured: u.capacity ?? null, capacity_source: 'configurada no cadastro — não medida',
      open_tasks: open.length, inherited_open: mineOpen.length - open.length,
      done_in_period: done.length, done_on_time: onTime.length, done_late: late.length, done_without_due: done.length - withDue.length,
      overdue_open: overdue.length,
      reopened: { value: reopenedBy[u.id] || 0, reason: null, source: 'Vezes que algo que a pessoa já tinha entregue voltou de etapa' },
      returned: { value: returnedBy[u.id] || 0, reason: null, source: 'Vezes que a revisão interna pediu ajuste numa entrega da pessoa' },
      blocked: { value: blocked.length, reason: null, source: 'Conteúdos bloqueados em que a pessoa tem tarefa aberta', items: blocked.slice(0, 5).map((t) => ({ id: t.id, title: t.title, client: t.client, waiting_on: t.waiting_on, reason: t.block_reason || null, content_id: t.content_id })) },
      reprogrammed: dueChangeRecorded
        ? { value: reprogBy[u.id] || 0, reason: null, source: 'Mudanças de prazo registradas nas tarefas da pessoa' }
        : { value: null, reason: 'A plataforma ainda não registra mudança de prazo de tarefa, então não há como contar reprogramações. Reprogramar item legado nunca conta contra ninguém.' },
      trend,
      late_context: lateCtx,
      recent_deliveries: done.slice(0, 5).map((t) => ({ id: t.id, title: t.title, client: t.client, stage: STAGES[t.stage]?.label || t.stage, completed_at: t.completed_at, due_at: t.due_at, on_time: t.due_at ? t.completed_at <= t.due_at : null, content_id: t.content_id })),
    };
  });

  const sum = (k) => out.reduce((s, p) => s + (typeof p[k] === 'number' ? p[k] : p[k]?.value || 0), 0);
  const team = {
    people: out.length, open_tasks: sum('open_tasks'), inherited_open: sum('inherited_open'), done_in_period: sum('done_in_period'), done_on_time: sum('done_on_time'), done_late: sum('done_late'),
    overdue_open: sum('overdue_open'), reopened: sum('reopened'), returned: sum('returned'), blocked: sum('blocked'),
    reprogrammed: dueChangeRecorded ? sum('reprogrammed') : null,
    capacity_configured: out.reduce((s, p) => s + (p.capacity_configured || 0), 0),
    previous_done: comparable ? validEventsIn(P.prev_start, P.prev_end) : null,
  };
  const insufficient_reason = sufficient ? null
    : count === 0 ? `Nenhum evento válido no período: nenhuma tarefa nascida na plataforma foi concluída nos últimos ${P.days} dias. Itens migrados do Notion e legados não contam.`
      : `${count} ${count === 1 ? 'evento válido' : 'eventos válidos'} no período — o mínimo para medir performance é ${threshold}. Os fatos abaixo são contagens; nenhuma leitura de desempenho é feita.`;

  return {
    period: { ...P, comparable, first_platform_task: firstPlatform },
    valid_events: { count, threshold, sufficient, all_time: base.valid_events, pending_classification: base.pending_classification, definition: 'Tarefa concluída na plataforma (tasks.data_origin = plataforma) com quem concluiu registrado. Herdados do Notion e legados nunca entram.' },
    people: out, team, insufficient_reason,
    rules: ['Só dados com data_origin = plataforma (regras 24 e 25).', 'Sem score e sem ranking (decisão da CEO).', 'Capacidade é a configurada no cadastro, não medida (regra 25).', 'Atraso não é culpa: o contexto mostra o motivo registrado (regra 12).'],
  };
}

performance.get('/performance', requireInternal, requirePerm('torre', 'view'), (req, res) => res.json(performanceReport(req.user, req.query)));
