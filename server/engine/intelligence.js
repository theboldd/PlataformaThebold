// Inteligência operacional determinística: pendências, risco de clientes, gargalos, carga, padrões.
// A IA (Claude) só interpreta/narra estes resultados — os números vêm do banco.
import { one, all, insert, update, uid, now, parseJSON } from '../db.js';
import { STAGES, contentRisk, nextAction } from './process.js';
import { scopeSQL } from '../lib/permissions.js';
import { PERF_SQL } from '../services/delayReview.js';

const H = 3600e3;
const ago = (iso) => (Date.now() - new Date(iso).getTime());
const fmtDays = (ms) => { const d = ms / 864e5; return d < 1 ? `${Math.max(1, Math.round(ms / H))}h` : `${Math.round(d)} dia${Math.round(d) > 1 ? 's' : ''}`; };

// ── CENTRO DE PENDÊNCIAS (derivado do estado; nunca fica desatualizado) ──
// Clientes que fazem parte da operação. "a_confirmar" = cliente real migrado do Notion cujo status ainda não foi confirmado.
export const OPERATING = ['ativo', 'onboarding', 'a_confirmar'];
const OP_SQL = OPERATING.map((s) => `'${s}'`).join(',');

export function computePendencies() {
  const out = [];
  const t = Date.now();
  const tasks = all(`SELECT t.*, c.name client_name, u.name assignee_name, ct.number content_number, ct.title content_title, ct.stage content_stage, ct.planned_at
    FROM tasks t LEFT JOIN clients c ON c.id=t.client_id LEFT JOIN users u ON u.id=t.assignee_id LEFT JOIN contents ct ON ct.id=t.content_id
    WHERE t.status IN ('aberta','em_andamento')`);
  for (const k of tasks) {
    const overdue = k.due_at && new Date(k.due_at).getTime() < t;
    const isClient = k.function === 'cliente';
    const base = { id: `task:${k.id}`, client_id: k.client_id, client: k.client_name, content_id: k.content_id, content: k.content_id ? `#${k.content_number} ${k.content_title}` : null,
      process: k.content_stage ? STAGES[k.content_stage]?.label : k.kind, since: k.created_at, due: k.due_at, link: k.content_id ? `/conteudos/${k.content_id}` : '/processos',
      source: { type: 'task', id: k.id }, who_id: k.assignee_id, function: k.function, publish_at: k.planned_at };
    if (!k.assignee_id) {
      out.push({ ...base, severity: 'critica', title: `Tarefa sem responsável: ${k.title}`, problem: `${k.client_name && k.title.endsWith(` — ${k.client_name}`) ? k.title.slice(0, -(k.client_name.length + 3)) : k.title} — sem responsável`, cause: 'responsavel', late_ms: ago(k.created_at), late: fmtDays(ago(k.created_at)), impact_w: 3,
        who: 'Operações (definir responsável)', impact: 'O fluxo para: ninguém foi notificado.', action: 'Atribuir responsável', next: `Vincular uma pessoa com a função “${k.function}” ao cliente ou atribuir manualmente.` });
      continue;
    }
    // Herdado da migração com prazo vencido: o prazo foi calculado na importação, não combinado — não é atraso de ninguém até ser classificado
    if (overdue && ['migrado', 'excluido'].includes(k.perf_status)) {
      out.push({ ...base, severity: 'media', title: `Herdado da migração: ${k.title}`, problem: `${k.client_name && k.title.endsWith(` — ${k.client_name}`) ? k.title.slice(0, -(k.client_name.length + 3)) : k.title} — ${k.perf_status === 'migrado' ? 'herdado da migração, em revisão' : 'prazo vencido, classificado como não atribuível'}`, cause: 'migracao', inherited: true, late_ms: 0, late: null, impact_w: 1,
        who: k.assignee_name, impact: 'Prazo calculado pela plataforma na importação do Notion (não foi combinado). Não conta como atraso de ninguém até ser classificado.', action: 'Confirmar a situação real',
        next: 'Confirmar se já foi publicado ou agendado; quem tem a permissão de classificar atrasos decide se reprograma, cancela ou classifica.' });
      continue;
    }
    if (overdue) {
      const late = t - new Date(k.due_at).getTime();
      const publishSoon = k.planned_at && (new Date(k.planned_at).getTime() - t) < 3 * 864e5;
      out.push({ ...base, severity: publishSoon || late > 2 * 864e5 ? 'critica' : 'alta', title: isClient ? `Aprovação atrasada — ${k.client_name}` : `Atrasado: ${k.title}`,
        problem: isClient ? `${k.content_stage === 'aprovacao_tema' ? 'Aprovação do tema' : 'Aprovação'} atrasada` : (k.client_name && k.title.endsWith(` — ${k.client_name}`) ? k.title.slice(0, -(k.client_name.length + 3)) : k.title), cause: isClient ? 'cliente' : 'prazo', late_ms: late, impact_w: publishSoon ? 3 : 2,
        action: isClient ? 'Cobrar aprovação do cliente' : 'Concluir ou renegociar o prazo',
        who: isClient ? 'Cliente' : k.assignee_name, late: fmtDays(late), impact: publishSoon ? 'Publicação em menos de 3 dias em risco.' : 'Atrasa as próximas etapas do ciclo.',
        next: isClient ? 'Enviar follow-up ao cliente (régua de cobrança) e decidir se o item vai para a próxima semana ou o próximo mês.' : 'Concluir a etapa ou renegociar o prazo com Operações.' });
    } else if (isClient && ago(k.created_at) > 48 * H) {
      out.push({ ...base, severity: ago(k.created_at) > 72 * H ? 'alta' : 'media', title: `Aguardando cliente — ${k.client_name}`, problem: 'Aguardando resposta do cliente', cause: 'cliente', late_ms: ago(k.created_at), impact_w: 1, action: 'Fazer follow-up', who: 'Cliente', late: fmtDays(ago(k.created_at)), impact: 'Produção/agendamento esperando resposta.', next: 'Follow-up pelo atendimento.' });
    }
  }
  for (const c of all(`SELECT ct.*, cl.name client_name FROM contents ct JOIN clients cl ON cl.id=ct.client_id WHERE ct.blocked=1 AND ct.stage NOT IN ('publicado','cancelado')`)) {
    out.push({ id: `block:${c.id}`, client_id: c.client_id, client: c.client_name, content_id: c.id, content: `#${c.number} ${c.title}`, process: STAGES[c.stage].label, since: c.updated_at, due: c.planned_at,
      severity: c.planned_at && new Date(c.planned_at).getTime() - t < 5 * 864e5 ? 'critica' : 'alta', title: `Bloqueado: ${c.block_reason}`, problem: c.block_reason || 'Conteúdo bloqueado',
      cause: c.waiting_on === 'cliente' ? 'material' : c.waiting_on === 'informacao' ? 'informacao' : 'equipe', late_ms: ago(c.updated_at), late: fmtDays(ago(c.updated_at)), impact_w: c.planned_at && new Date(c.planned_at).getTime() - t < 5 * 864e5 ? 3 : 2,
      action: c.waiting_on === 'cliente' ? 'Cobrar o material' : 'Resolver e desbloquear', source: { type: 'content', id: c.id }, publish_at: c.planned_at, who: c.waiting_on === 'cliente' ? 'Cliente' : c.waiting_on === 'informacao' ? 'Aguardando informação' : 'Equipe',
      impact: 'Conteúdo não avança.', next: c.waiting_on === 'cliente' ? 'Cobrar o material e definir data-limite.' : 'Resolver o bloqueio e desbloquear.', link: `/conteudos/${c.id}` });
  }
  for (const o of all(`SELECT oi.*, ob.client_id, cl.name client_name FROM onboarding_items oi JOIN onboarding ob ON ob.id=oi.onboarding_id JOIN clients cl ON cl.id=ob.client_id
    WHERE oi.status='pendente' AND oi.required=1 AND ob.status<>'concluido'`)) {
    const late = o.due_at && new Date(o.due_at).getTime() < t;
    if (!late && ago(o.requested_at) < 3 * 864e5) continue;
    out.push({ id: `onb:${o.id}`, client_id: o.client_id, client: o.client_name, process: 'Onboarding', since: o.requested_at, due: o.due_at, severity: late ? 'alta' : 'media',
      title: `Onboarding incompleto: ${o.label}`, problem: o.label, cause: 'onboarding', late_ms: late ? t - new Date(o.due_at).getTime() : ago(o.requested_at), impact_w: 1,
      action: o.who === 'cliente' ? 'Lembrar o cliente' : 'Concluir item interno', source: { type: 'onboarding_item', id: o.id }, who: o.who === 'cliente' ? 'Cliente' : 'Equipe', late: late ? fmtDays(t - new Date(o.due_at).getTime()) : null, impact: 'Atrasa o primeiro cronograma.', next: o.who === 'cliente' ? 'Lembrar o cliente pelo portal e pelo grupo.' : 'Concluir item interno.', link: `/clientes/${o.client_id}?tab=onboarding` });
  }
  for (const i of all("SELECT inv.*, cl.name client_name FROM invoices inv JOIN clients cl ON cl.id=inv.client_id WHERE inv.status IN ('aberta','atrasada') AND inv.due_at < ?", now())) {
    out.push({ id: `inv:${i.id}`, client_id: i.client_id, client: i.client_name, process: 'Financeiro', since: i.due_at, due: i.due_at, severity: 'alta', title: `Pagamento em atraso — ${i.description}`, problem: `Pagamento em atraso: ${i.description}`, cause: 'financeiro', late_ms: t - new Date(i.due_at).getTime(), impact_w: 2,
      action: 'Contato do financeiro', source: { type: 'invoice', id: i.id }, who: 'Cliente / Financeiro', late: fmtDays(t - new Date(i.due_at).getTime()), impact: 'Receita pendente.', next: 'Contato do financeiro.', link: '/financeiro', financial: true });
  }
  const order = { critica: 0, alta: 1, media: 2, baixa: 3 };
  // prioridade → impacto → tempo de atraso → prazo mais próximo
  return out.sort((a, b) => order[a.severity] - order[b.severity] || (b.impact_w || 0) - (a.impact_w || 0) || (b.late_ms || 0) - (a.late_ms || 0) || String(a.due || '9').localeCompare(String(b.due || '9')));
}

// ── Risco por cliente ──
export function clientRisk(clientId) {
  const contents = all("SELECT * FROM contents WHERE client_id=? AND stage NOT IN ('publicado','cancelado')", clientId);
  const reasons = new Map();
  let worst = 0;
  const lv = { baixo: 0, medio: 1, alto: 2, critico: 3, nenhum: 0 };
  for (const c of contents) {
    const r = contentRisk(c);
    worst = Math.max(worst, lv[r.level]);
    r.reasons.forEach((x) => reasons.set(x, (reasons.get(x) || 0) + 1));
  }
  const ob = one("SELECT * FROM onboarding WHERE client_id=? AND status<>'concluido'", clientId);
  if (ob) {
    const missing = one("SELECT COUNT(*) n FROM onboarding_items WHERE onboarding_id=? AND status='pendente' AND required=1", ob.id).n;
    if (missing) { reasons.set(`Onboarding: ${missing} item(ns) pendente(s)`, 1); worst = Math.max(worst, missing > 3 ? 2 : 1); }
  }
  const level = ['baixo', 'medio', 'alto', 'critico'][worst];
  return { level, reasons: [...reasons.entries()].map(([r, n]) => (n > 1 ? `${r} (${n})` : r)) };
}

export function clientSummary(client) {
  const risk = clientRisk(client.id);
  const nextC = one(`SELECT * FROM contents WHERE client_id=? AND stage NOT IN ('publicado','cancelado') ORDER BY CASE WHEN blocked=1 THEN 0 ELSE 1 END, planned_at LIMIT 1`, client.id);
  const counts = one(`SELECT COUNT(*) total, SUM(stage IN ('aprovacao_tema','aprovacao_cliente')) aguardando_cliente, SUM(stage IN ('producao','ajuste_interno','ajuste_cliente')) em_producao,
    SUM(stage='publicado') publicados,
    SUM(stage IN ('cronograma','analise_cronograma','ajuste_cronograma')) rascunho, SUM(stage IN ('producao','analise_producao')) producao,
    SUM(stage IN ('ajuste_interno','ajuste_cliente','revisao_ajuste')) ajuste, SUM(stage IN ('agendamento','agendado','publicado')) aprovados,
    SUM(stage IN ('analise_cronograma','analise_producao','revisao_ajuste')) em_revisao
    FROM contents WHERE client_id=? AND stage<>'cancelado'`, client.id);
  for (const k of Object.keys(counts)) counts[k] = counts[k] || 0;
  const strategist = one("SELECT u.name FROM client_members cm JOIN users u ON u.id=cm.user_id WHERE cm.client_id=? AND cm.function='estrategia' LIMIT 1", client.id)?.name;
  return { ...client, services: parseJSON(client.services, []), risk, counts, strategist,
    next: nextC ? { content: `#${nextC.number} ${nextC.title}`, content_id: nextC.id, stage: STAGES[nextC.stage].label, ...nextAction(nextC) } : null };
}

// ── Detectores de gargalo e padrões → AIInsights (PROBLEMA → CAUSA → IMPACTO → SUGESTÃO → AÇÃO) ──
function upsertInsight(fp, data) {
  const ex = one('SELECT * FROM ai_insights WHERE fingerprint=?', fp);
  if (ex) { if (ex.status === 'aberto') update('ai_insights', { id: ex.id }, { ...data, updated_at: now() }); return; }
  insert('ai_insights', { id: uid('in_'), fingerprint: fp, status: 'aberto', created_at: now(), updated_at: now(), source: 'regra', ...data });
}
export function runDetectors() {
  const month = new Date().toISOString().slice(0, 7);
  const seen = new Set();
  const put = (fp, d) => { seen.add(fp); upsertInsight(fp, d); };
  // 1. Retrabalho: conteúdos que voltaram para ajuste várias vezes
  for (const r of all(`SELECT a.content_id, COUNT(*) n, c.number, c.title, c.client_id, cl.name FROM adjustments a JOIN contents c ON c.id=a.content_id JOIN clients cl ON cl.id=c.client_id
    WHERE substr(a.created_at,1,7)=? GROUP BY a.content_id HAVING n>=3`, month)) {
    put(`retrabalho:${r.content_id}:${month}`, { detector: 'retrabalho', scope: 'conteudo', client_id: r.client_id, severity: r.n >= 4 ? 'alta' : 'media', metric: r.n,
      problem: `#${r.number} “${r.title}” (${r.name}) voltou para ajuste ${r.n} vezes neste mês.`, cause: 'Briefing incompleto ou expectativa do cliente não registrada no Client Brain.',
      impact: 'Consome horas de produção e empurra o agendamento.', suggestion: 'Revisar briefing e registrar a preferência do cliente no Client Brain antes da próxima versão.', action: 'Abrir conteúdo', action_payload: JSON.stringify({ link: `/conteudos/${r.content_id}` }) });
  }
  // 2. Etapa que mais concentra conteúdos atrasados
  const late = all(`SELECT t.stage, COUNT(*) n FROM tasks t WHERE t.status IN ('aberta','em_andamento') AND t.due_at < ? AND t.stage IS NOT NULL AND ${PERF_SQL.equipe('t')} GROUP BY t.stage ORDER BY n DESC`, now());
  if (late[0] && late[0].n >= 2) {
    put(`gargalo:${late[0].stage}`, { detector: 'gargalo', severity: late[0].n >= 5 ? 'alta' : 'media', metric: late[0].n, problem: `${late[0].n} tarefas atrasadas em “${STAGES[late[0].stage]?.label}”.`,
      cause: 'Capacidade da função abaixo do volume do ciclo ou entrada concentrada no mesmo marco.', impact: 'Todos os conteúdos seguintes do ciclo herdam o atraso.',
      suggestion: 'Redistribuir tarefas da etapa ou escalonar o marco por cliente.', action: 'Ver no quadro', action_payload: JSON.stringify({ link: `/processos?stage=${late[0].stage}` }) });
  }
  // 3. Tempo médio de aprovação do cliente
  const appr = all(`SELECT ap.content_id, ap.created_at, (SELECT MAX(l.created_at) FROM activity_logs l WHERE l.content_id=ap.content_id AND l.action='etapa.alterada' AND l.after IN ('aprovacao_cliente','aprovacao_tema') AND l.created_at<=ap.created_at) sent
    FROM approvals ap WHERE ap.kind IN ('cliente','tema') AND ap.created_at > ?`, new Date(Date.now() - 60 * 864e5).toISOString()).filter((r) => r.sent);
  if (appr.length >= 3) {
    const avg = appr.reduce((s, r) => s + (new Date(r.created_at) - new Date(r.sent)), 0) / appr.length / 864e5;
    put('aprovacao:media', { detector: 'tempo_aprovacao', severity: avg > 2 ? 'media' : 'baixa', metric: Math.round(avg * 10) / 10, problem: `Clientes levam em média ${avg.toFixed(1).replace('.', ',')} ${avg >= 0.95 && avg < 1.05 ? 'dia' : 'dias'} para aprovar.`,
      cause: avg > 2 ? 'Lembretes ainda dependem de mensagem manual no WhatsApp.' : 'Dentro do esperado.', impact: 'Define a folga real entre produção e publicação.',
      suggestion: avg > 2 ? 'Ativar régua de cobrança automática no portal e reduzir o lote enviado por vez.' : 'Manter régua atual.', action: 'Ver automações', action_payload: JSON.stringify({ link: '/automacoes' }) });
  }
  // 4. Sobrecarga por pessoa (tarefas abertas vs. capacidade semanal)
  for (const u of all(`SELECT u.id, u.name, u.capacity, COUNT(t.id) n FROM users u JOIN tasks t ON t.assignee_id=u.id AND t.status IN ('aberta','em_andamento') AND t.function<>'cliente'
    WHERE u.role_key<>'cliente' GROUP BY u.id HAVING n > u.capacity`)) {
    put(`carga:${u.id}`, { detector: 'carga', severity: u.n > u.capacity * 1.5 ? 'alta' : 'media', metric: u.n, problem: `${u.name} está com ${u.n} tarefas abertas (capacidade ${u.capacity}/semana).`,
      cause: 'Atribuição por função concentra clientes na mesma pessoa.', impact: 'Risco de atraso em cadeia e queda de qualidade.', suggestion: 'Vincular outra pessoa da mesma função a parte dos clientes.', action: 'Ver pessoas', action_payload: JSON.stringify({ link: '/torre?tab=pessoas' }) });
  }
  // 5. Produção esperando material do cliente
  const mat = one("SELECT COUNT(*) n FROM contents WHERE blocked=1 AND waiting_on='cliente' AND stage NOT IN ('publicado','cancelado')").n;
  if (mat >= 2) put('material:cliente', { detector: 'material', severity: mat >= 5 ? 'alta' : 'media', metric: mat, problem: `${mat} conteúdos parados aguardando material do cliente.`,
    cause: 'Material solicitado sem data-limite ou sem canal oficial de envio.', impact: 'Produção ociosa e risco de conteúdo ir para o mês seguinte.', suggestion: 'Pedir material pela área do cliente com prazo e lembrete automático; definir regra semana seguinte × mês seguinte.', action: 'Ver pendências', action_payload: JSON.stringify({ link: '/pendencias' }) });
  // 6. Dependência manual de uma pessoa (quem mais executa ações de “cobrar/destravar”)
  const manual = all(`SELECT actor_id, COUNT(*) n FROM activity_logs WHERE origin='manual' AND action IN ('conteudo.desbloqueado','tarefa.reatribuida','cliente.followup') AND created_at > ? GROUP BY actor_id ORDER BY n DESC`, new Date(Date.now() - 30 * 864e5).toISOString());
  const total = manual.reduce((s, r) => s + r.n, 0);
  if (manual[0] && total >= 5 && manual[0].n / total > 0.6) {
    const name = one('SELECT name FROM users WHERE id=?', manual[0].actor_id)?.name;
    put(`dependencia:${manual[0].actor_id}`, { detector: 'dependencia', severity: 'media', metric: Math.round((manual[0].n / total) * 100), problem: `${Math.round((manual[0].n / total) * 100)}% das intervenções manuais do mês dependem de ${name}.`,
      cause: 'Etapas sem gatilho automático exigem acompanhamento pessoal.', impact: 'Ponto único de falha na operação.', suggestion: 'Transformar as intervenções mais frequentes em automações.', action: 'Ver automações', action_payload: JSON.stringify({ link: '/automacoes' }) });
  }
  // 7. Funções sem pessoa vinculada em clientes ativos
  for (const r of all(`SELECT cl.id, cl.name, f.fn FROM clients cl, (SELECT 'estrategia' fn UNION SELECT 'design' UNION SELECT 'edicao') f
    WHERE cl.status IN (${OP_SQL}) AND NOT EXISTS (SELECT 1 FROM client_members cm WHERE cm.client_id=cl.id AND cm.function=f.fn)`)) {
    put(`semfuncao:${r.id}:${r.fn}`, { detector: 'sem_responsavel', client_id: r.id, severity: 'alta', problem: `${r.name} não tem ninguém vinculado na função “${r.fn}”.`, cause: 'Divisão de equipe não cadastrada (hoje: 3 fontes diferentes no Notion).', impact: 'Tarefas dessa função nascem sem responsável.', suggestion: 'Vincular responsável na ficha do cliente → Equipe.', action: 'Abrir ficha', action_payload: JSON.stringify({ link: `/clientes/${r.id}?tab=equipe` }) });
  }
  // Insights que deixaram de ser verdade são resolvidos automaticamente
  for (const i of all("SELECT id, fingerprint FROM ai_insights WHERE status='aberto' AND source='regra'")) {
    if (!seen.has(i.fingerprint)) update('ai_insights', { id: i.id }, { status: 'resolvido', updated_at: now() });
  }
}

// ── Métricas agregadas (Torre de Controle / dashboards) ──
export function opsMetrics(user) {
  const sc = scopeSQL(user, 'client_id');
  const q = (sql, ...p) => one(sql.replace('{S}', sc.sql), ...sc.params, ...p);
  const nowIso = now();
  const today = new Date(); today.setHours(23, 59, 59, 999);
  return {
    clientes_ativos: one(`SELECT COUNT(*) n FROM clients WHERE status IN (${OP_SQL}) AND ${scopeSQL(user, 'id').sql}`, ...scopeSQL(user, 'id').params).n,
    em_producao: q("SELECT COUNT(*) n FROM contents WHERE {S} AND stage IN ('producao','analise_producao','ajuste_interno','ajuste_cliente','revisao_ajuste')").n,
    aguardando_cliente: q("SELECT COUNT(*) n FROM contents WHERE {S} AND stage IN ('aprovacao_tema','aprovacao_cliente')").n,
    em_revisao: q("SELECT COUNT(*) n FROM contents WHERE {S} AND stage IN ('analise_cronograma','analise_producao','revisao_ajuste')").n,
    bloqueados: q("SELECT COUNT(*) n FROM contents WHERE {S} AND blocked=1 AND stage NOT IN ('publicado','cancelado')").n,
    atrasadas: q(`SELECT COUNT(*) n FROM tasks t WHERE {S} AND status IN ('aberta','em_andamento') AND due_at < ? AND ${PERF_SQL.equipe('t')}`, nowIso).n,
    herdados_revisao: q("SELECT COUNT(*) n FROM tasks WHERE {S} AND status IN ('aberta','em_andamento') AND due_at < ? AND perf_status IN ('migrado','excluido')", nowIso).n,
    prazos_hoje: q("SELECT COUNT(*) n FROM tasks WHERE {S} AND status IN ('aberta','em_andamento') AND due_at >= ? AND due_at <= ?", nowIso, today.toISOString()).n,
    sem_responsavel: q("SELECT COUNT(*) n FROM tasks WHERE {S} AND status IN ('aberta','em_andamento') AND assignee_id IS NULL").n,
    agendados: q("SELECT COUNT(*) n FROM contents WHERE {S} AND stage='agendado'").n,
    publicados_mes: q("SELECT COUNT(*) n FROM contents WHERE {S} AND stage='publicado' AND substr(published_at,1,7)=?", nowIso.slice(0, 7)).n,
  };
}
export function stageDistribution(user) {
  const sc = scopeSQL(user, 'client_id');
  return all(`SELECT stage, COUNT(*) n, SUM(blocked) blocked FROM contents WHERE ${sc.sql} AND stage NOT IN ('cancelado') GROUP BY stage`, ...sc.params);
}
export function teamLoad() {
  return all(`SELECT u.id, u.name, u.role_key, u.capacity, u.functions,
    (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id=u.id AND t.status IN ('aberta','em_andamento')) open,
    (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id=u.id AND t.status IN ('aberta','em_andamento') AND t.due_at < ? AND ${PERF_SQL.individual('t')}) late,
    (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id=u.id AND t.status IN ('aberta','em_andamento') AND t.due_at < ? AND t.perf_status IN ('migrado','excluido')) inherited,
    (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id=u.id AND t.status='concluida' AND t.completed_at > ?) done_7d
    FROM users u WHERE u.active=1 AND u.role_key<>'cliente' ORDER BY open DESC`, now(), now(), new Date(Date.now() - 7 * 864e5).toISOString());
}
