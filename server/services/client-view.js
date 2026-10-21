// VISÃO DO CLIENTE — traduz o estado operacional real em clareza para o cliente.
// Responde: AGORA (onde está o projeto) · VOCÊ (o que precisa de você) · THE BOLD (o que estamos fazendo) · DEPOIS · HISTÓRICO.
// Regra: tudo sai do banco (engine, ciclos, tarefas, solicitações, decisões). Nada interno é exposto:
// sem nomes da equipe, prioridades, bloqueios internos, custos ou problemas — só a tradução amigável.
import { one, all, now, parseJSON } from '../db.js';
import { formStatus } from './onboarding.js';

const TZ = 'America/Sao_Paulo';
export const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }) : '');
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const monthName = (ym) => (ym ? MONTHS[Number(ym.slice(5, 7)) - 1] : '');
const plural = (n, one_, many) => (n === 1 ? one_ : many.replace('{n}', n));
const inList = (arr) => arr.map(() => '?').join(',');

// ── AGORA: "Você está aqui" (6 etapas em linguagem de cliente) ──
export const JOURNEY = ['Planejamento', 'Produção', 'Revisão', 'Aprovação', 'Agendamento', 'Publicação'];
const STEP_OF = { cronograma: 0, analise_cronograma: 0, ajuste_cronograma: 0, aprovacao_tema: 0, producao: 1, analise_producao: 2, ajuste_interno: 2,
  aprovacao_cliente: 3, ajuste_cliente: 3, revisao_ajuste: 3, agendamento: 4, agendado: 5, publicado: 5 };
const CLIENT_WAIT = ['aprovacao_tema', 'aprovacao_cliente'];

// Ciclo "vivo": o primeiro com trabalho em andamento; senão o mais recente
export function liveCycle(clientId) {
  return one("SELECT * FROM cycles WHERE client_id=? AND EXISTS (SELECT 1 FROM contents WHERE cycle_id=cycles.id AND stage NOT IN ('agendado','publicado','cancelado')) ORDER BY month LIMIT 1", clientId)
    || one("SELECT * FROM cycles WHERE client_id=? AND EXISTS (SELECT 1 FROM contents WHERE cycle_id=cycles.id AND stage NOT IN ('publicado','cancelado')) ORDER BY month LIMIT 1", clientId)
    || one('SELECT * FROM cycles WHERE client_id=? ORDER BY month DESC LIMIT 1', clientId);
}
export function journey(clientId) {
  const cycle = liveCycle(clientId);
  if (!cycle) return null;
  const cs = all("SELECT stage, blocked, waiting_on FROM contents WHERE cycle_id=? AND stage<>'cancelado' AND (legacy_status IS NULL OR legacy_status='reprogramado')", cycle.id);
  if (!cs.length) return { month: cycle.month, steps: JOURNEY.map((label) => ({ label, state: 'next', note: 'próxima etapa', count: 0 })), here: null };
  const idx = cs.map((x) => STEP_OF[x.stage]);
  const min = Math.min(...idx), max = Math.max(...idx);
  const allPublished = cs.every((x) => x.stage === 'publicado');
  const steps = JOURNEY.map((label, i) => {
    const here = cs.filter((x) => STEP_OF[x.stage] === i);
    const waitingYou = here.some((x) => CLIENT_WAIT.includes(x.stage) || (x.blocked && x.waiting_on === 'cliente'));
    let state = i < min ? 'done' : here.length ? (waitingYou ? 'you' : 'current') : i < max ? 'partial' : 'next';
    if (i === 5 && allPublished) state = 'done';
    const n = here.length;
    const note = { done: 'concluída', partial: 'parte concluída', you: 'aguardando você', next: 'próxima etapa' }[state]
      || (i === 5 ? `${n} ${n === 1 ? 'agendado ou publicado' : 'agendados ou publicados'}` : `${n} ${n === 1 ? 'conteúdo' : 'conteúdos'}`);
    return { label, state, note, count: n };
  });
  // "Você está aqui": a etapa mais atrasada que ainda tem conteúdos (prioridade para o que espera o cliente)
  const hereIdx = steps.findIndex((s) => s.state === 'you') >= 0 ? steps.findIndex((s) => s.state === 'you') : steps.findIndex((s) => s.state === 'current');
  return { month: cycle.month, steps, here: hereIdx >= 0 ? hereIdx : null };
}

// ── Prazo do cliente para um conteúdo (vem da tarefa real de aprovação criada pelo engine) ──
export function clientDeadline(content) {
  if (!CLIENT_WAIT.includes(content.stage)) return null;
  const t = one("SELECT due_at FROM tasks WHERE content_id=? AND kind='aprovacao' AND status IN ('aberta','em_andamento') ORDER BY created_at DESC LIMIT 1", content.id);
  if (!t?.due_at) return null;
  return deadlineText(t.due_at, content.planned_at);
}
// Linguagem nunca acusatória: antes do prazo → "para manter a publicação"; depois → "ainda podemos receber"
export function deadlineText(due, planned) {
  const overdue = due < now();
  return {
    due_at: due, planned_at: planned || null, overdue,
    title: overdue ? 'Precisamos de você' : `Precisamos de você até ${fmtDay(due)}`,
    text: overdue
      ? 'O prazo de aprovação passou. Ainda podemos receber sua aprovação, mas a data de publicação poderá precisar ser ajustada.'
      : planned ? `Para manter a publicação prevista para ${fmtDay(planned)}.` : 'Para manter o cronograma do mês.',
  };
}

// ── VOCÊ: tudo que depende de uma ação/decisão do cliente (alimentado pelo Process Engine e pelos registros reais) ──
export function clientActions(clientId) {
  const out = [];
  // 1. Aprovações — agrupadas por mês e tipo (tema × conteúdo)
  const waiting = all(`SELECT * FROM contents WHERE client_id=? AND (legacy_status IS NULL OR legacy_status='reprogramado') AND blocked=0 AND stage IN (${inList(CLIENT_WAIT)}) ORDER BY planned_at`, clientId, ...CLIENT_WAIT);
  const groups = {};
  for (const c of waiting) (groups[`${c.stage}:${c.cycle_month || (c.planned_at || '').slice(0, 7)}`] ||= []).push(c);
  for (const [key, list] of Object.entries(groups)) {
    const [stage, month] = key.split(':');
    const theme = stage === 'aprovacao_tema';
    const dl = list.map(clientDeadline).filter(Boolean).sort((a, b) => a.due_at.localeCompare(b.due_at))[0] || null;
    const planned = list.map((c) => c.planned_at).filter(Boolean).sort()[0] || null;
    const n = list.length;
    out.push({
      key: `aprovacao:${key}`, kind: 'aprovacao', count: n,
      title: n === 1 ? `Aprovar ${theme ? 'o tema' : ''} “${list[0].title}”`.replace('  ', ' ') : `Aprovar ${n} ${theme ? 'temas' : 'conteúdos'}${month ? ` de ${monthName(month)}` : ''}`,
      short: theme ? plural(n, 'Aprovar 1 tema', 'Aprovar {n} temas') : plural(n, 'Aprovar 1 conteúdo', 'Aprovar {n} conteúdos'),
      context: theme ? 'Com os temas aprovados, a produção dos conteúdos começa.' : 'Precisamos da sua aprovação para seguir para agendamento.',
      consequence: dl ? dl.text : planned ? `Para manter a publicação prevista para ${fmtDay(planned)}.` : null,
      due_at: dl?.due_at || null, overdue: !!dl?.overdue, cta: 'Revisar agora',
      link: `/portal/conteudos?filtro=aguardando${month ? `&mes=${month}` : ''}`, ids: list.map((c) => c.id),
    });
  }
  // 2. Materiais pedidos (conteúdo travado aguardando o cliente; itens do onboarding)
  for (const c of all("SELECT id, title, block_reason, planned_at FROM contents WHERE client_id=? AND (legacy_status IS NULL OR legacy_status='reprogramado') AND blocked=1 AND waiting_on='cliente' AND stage NOT IN ('publicado','cancelado')", clientId)) {
    out.push({ key: `material:${c.id}`, kind: 'material', count: 1, title: c.block_reason || 'Enviar material', short: 'Enviar material', context: `Para o conteúdo “${c.title}”.`,
      consequence: c.planned_at ? `Com o material, seguimos com a produção para a publicação de ${fmtDay(c.planned_at)}.` : 'Com o material, seguimos com a produção.',
      due_at: null, overdue: false, cta: 'Enviar material', link: `/portal/materiais?pedido=conteudo:${c.id}`, ref: { type: 'conteudo', id: c.id } });
  }
  const ob = one('SELECT * FROM onboarding WHERE client_id=?', clientId);
  if (ob) for (const it of all("SELECT * FROM onboarding_items WHERE onboarding_id=? AND who='cliente' AND kind='material' AND status='pendente' ORDER BY sort", ob.id)) {
    out.push({ key: `onb:${it.id}`, kind: 'material', count: 1, title: it.label, short: 'Enviar material', context: 'Para o início do seu projeto.', consequence: null,
      due_at: it.due_at, overdue: !!(it.due_at && it.due_at < now()), cta: 'Enviar', link: `/portal/materiais?pedido=onboarding:${it.id}`, ref: { type: 'onboarding', id: it.id } });
  }
  // 3. Decisões pedidas pela equipe (escolha, confirmação, resposta estratégica, data)
  for (const d of all("SELECT * FROM client_decisions WHERE client_id=? AND status='pendente' ORDER BY COALESCE(due_at, created_at)", clientId)) {
    out.push({ key: `decisao:${d.id}`, kind: d.kind === 'resposta' ? 'pergunta' : d.kind === 'data' ? 'confirmacao_data' : d.kind, count: 1, title: d.title,
      short: { escolha: 'Escolher uma opção', confirmacao: 'Confirmar', resposta: 'Responder pergunta', data: 'Confirmar data' }[d.kind] || 'Decidir',
      context: d.context, consequence: d.consequence, due_at: d.due_at, overdue: !!(d.due_at && d.due_at < now()), cta: d.kind === 'resposta' ? 'Responder' : 'Decidir', link: `/portal/decisoes?d=${d.id}`, decision_id: d.id });
  }
  // 4. Solicitações que voltaram aguardando o cliente
  for (const r of all("SELECT * FROM client_requests WHERE client_id=? AND status='aguardando_cliente' ORDER BY updated_at", clientId)) {
    out.push({ key: `solicitacao:${r.id}`, kind: 'solicitacao', count: 1, title: r.title, short: 'Responder solicitação', context: r.next_action || 'A The Bold precisa de uma informação sua para continuar.',
      consequence: null, due_at: r.expected_at, overdue: false, cta: 'Responder', link: `/portal/solicitacoes?r=${r.id}` });
  }
  // 5. Onboarding: cliente migrado com respostas faltando (o que veio do Notion nunca é perguntado de novo)
  if (ob && ob.form_status === 'migrado_parcial') {
    const p = profileProgress(clientId);
    if (p?.missing) out.push({ key: 'onboarding', kind: 'onboarding', count: p.missing, title: 'Completar seu onboarding', short: `Completar onboarding (${p.missing})`,
      context: `Trouxemos ${p.answered} respostas que você já tinha dado no Notion. Seu onboarding está ${p.percent}% completo.`, consequence: `${p.missing === 1 ? 'Falta 1 informação' : `Faltam ${p.missing} informações`} — só o que ainda não foi respondido.`,
      due_at: null, overdue: false, cta: 'Continuar', link: '/portal/onboarding?faltando=1' });
  } else
  // Onboarding ainda não enviado (cliente novo): é o que libera o início do projeto
  if (ob && ob.status !== 'migrado' && ob.status !== 'concluido' && ob.form_status !== 'concluido') {
    const p = profileProgress(clientId);
    out.push({ key: 'onboarding', kind: 'onboarding', count: 1, title: ob.form_status === 'em_andamento' ? 'Continuar seu onboarding' : 'Preencher seu onboarding', short: 'Responder briefing',
      context: p ? `Seu onboarding está ${p.percent}% completo.` : 'Suas respostas são a base da estratégia.', consequence: 'Com o onboarding, a The Bold inicia a estratégia do seu projeto.',
      due_at: null, overdue: false, cta: ob.form_status === 'em_andamento' ? 'Continuar' : 'Começar', link: '/portal/onboarding' });
  }
  // 6. Reunião mensal: só quando a The Bold abriu horários (regra definida pela equipe) e não há reunião marcada
  const hasMeeting = one("SELECT 1 FROM meetings WHERE client_id=? AND status='agendada' AND starts_at > ? AND kind='mensal'", clientId, now());
  const slots = one('SELECT COUNT(*) n FROM meeting_slots WHERE meeting_id IS NULL AND starts_at > ?', new Date(Date.now() + 2 * 3600e3).toISOString()).n;
  if (!hasMeeting && slots && ob?.status !== 'em_andamento') {
    out.push({ key: 'reuniao', kind: 'reuniao', count: 1, title: 'Escolher o horário da reunião mensal', short: 'Confirmar data da reunião', context: `${slots} ${slots === 1 ? 'horário disponível' : 'horários disponíveis'}.`,
      consequence: 'Na reunião alinhamos a estratégia do próximo ciclo.', due_at: null, overdue: false, cta: 'Escolher horário', link: '/portal/reunioes' });
  }
  const order = { aprovacao: 0, pergunta: 1, escolha: 1, confirmacao: 1, confirmacao_data: 1, outro: 1, material: 2, solicitacao: 3, onboarding: 4, reuniao: 5 };
  return out.sort((a, b) => (b.overdue - a.overdue) || (order[a.kind] ?? 9) - (order[b.kind] ?? 9) || String(a.due_at || '9').localeCompare(String(b.due_at || '9')));
}

// Perfil (onboarding) — % completo e o que falta. Acessos (login/senha) não contam: a The Bold prefere acesso de parceiro pelo Meta Business.
export function profileProgress(clientId) {
  const st = formStatus(clientId);
  if (!st) return null;
  const total = st.total - st.sensitive_total;
  const missing = st.missing_keys.length;
  return { percent: total ? Math.round(((total - missing) / total) * 100) : 0, answered: total - missing, total, missing, status: st.status };
}

// ── THE BOLD: o que está sendo feito agora (tradução amigável; nunca tarefas internas, nomes ou problemas) ──
export function boldIsDoing(clientId) {
  const counts = Object.fromEntries(all("SELECT stage, COUNT(*) n FROM contents WHERE client_id=? AND (legacy_status IS NULL OR legacy_status='reprogramado') AND stage NOT IN ('agendado','publicado','cancelado') AND NOT (blocked=1 AND waiting_on='cliente') GROUP BY stage", clientId).map((r) => [r.stage, r.n]));
  const sum = (...st) => st.reduce((a, s) => a + (counts[s] || 0), 0);
  const items = [];
  const add = (label, n, detail) => n && items.push({ label, detail: detail || `${n} ${n === 1 ? 'conteúdo' : 'conteúdos'}` });
  add('Estratégia e temas do próximo ciclo', sum('cronograma', 'analise_cronograma', 'ajuste_cronograma'));
  add('Produção dos conteúdos', sum('producao'));
  add('Revisão interna de qualidade', sum('analise_producao', 'ajuste_interno'));
  add('Ajustes que você pediu', sum('ajuste_cliente', 'revisao_ajuste'));
  add('Organização do calendário e agendamento', sum('agendamento'));
  for (const r of all("SELECT title FROM client_requests WHERE client_id=? AND status IN ('recebido','em_analise','em_andamento') ORDER BY created_at LIMIT 3", clientId)) items.push({ label: 'Sua solicitação', detail: r.title });
  const ob = one('SELECT * FROM onboarding WHERE client_id=?', clientId);
  if (ob && ob.form_status === 'concluido' && ob.status === 'em_andamento') items.push({ label: 'Preparação do início do seu projeto', detail: 'com base no seu onboarding' });
  const pendingSummary = one("SELECT m.starts_at FROM meetings m WHERE m.client_id=? AND m.status='realizada' AND m.starts_at > ? AND NOT EXISTS (SELECT 1 FROM meeting_summaries s WHERE s.meeting_id=m.id AND s.audience='client' AND s.status='publicado') ORDER BY m.starts_at DESC LIMIT 1", clientId, new Date(Date.now() - 14 * 864e5).toISOString());
  if (pendingSummary) items.push({ label: 'Resumo da reunião', detail: `de ${fmtDay(pendingSummary.starts_at)}` });
  return items;
}

// ── DEPOIS: o que acontece em seguida (marcos reais do ciclo e datas de publicação) ──
export function whatsNext(clientId, actions = clientActions(clientId)) {
  const out = [];
  const cycle = liveCycle(clientId);
  const ms = parseJSON(cycle?.milestones, {});
  const today = now().slice(0, 10);
  if (actions.some((a) => a.kind === 'aprovacao')) out.push({ text: 'Depois da sua aprovação, os conteúdos seguem para agendamento e publicação.' });
  const stages = cycle ? all("SELECT stage FROM contents WHERE cycle_id=? AND stage<>'cancelado' AND (legacy_status IS NULL OR legacy_status='reprogramado')", cycle.id).map((r) => r.stage) : [];
  if (stages.some((s) => ['producao', 'analise_producao', 'ajuste_interno'].includes(s))) {
    const d = ms.cliente_aprova_final?.start;
    out.push({ text: 'Quando a revisão interna terminar, os conteúdos chegam aqui para você aprovar.', date: d && d >= today ? d : null });
  } else if (stages.some((s) => ['cronograma', 'analise_cronograma', 'ajuste_cronograma'].includes(s))) {
    const d = ms.cliente_aprova_temas?.start;
    out.push({ text: 'Os temas do mês chegam para sua aprovação.', date: d && d >= today ? d : null });
  }
  const pub = one("SELECT title, COALESCE(scheduled_at, planned_at) d FROM contents WHERE client_id=? AND (legacy_status IS NULL OR legacy_status='reprogramado') AND stage IN ('agendamento','agendado') AND COALESCE(scheduled_at, planned_at) >= ? ORDER BY d LIMIT 1", clientId, now());
  if (pub) out.push({ text: `Próxima publicação: “${pub.title}”.`, date: pub.d });
  const m = one("SELECT title, starts_at FROM meetings WHERE client_id=? AND status='agendada' AND starts_at > ? ORDER BY starts_at LIMIT 1", clientId, now());
  if (m) out.push({ text: 'Próxima reunião com a The Bold.', date: m.starts_at, time: true });
  return out.slice(0, 4);
}

// ── HISTÓRICO: eventos visíveis ao cliente, com link para o registro original ──
const STAGE_PHRASE = { aprovacao_tema: 'tema enviado para sua aprovação', producao: 'em produção', aprovacao_cliente: 'enviado para sua aprovação', ajuste_cliente: 'ajuste em andamento',
  agendamento: 'em agendamento', agendado: 'agendado', publicado: 'publicado' }; // agendamento ≠ aprovado (regra 14)
export function clientHistory(clientId, { limit = 60, before = null } = {}) {
  const rows = all(`SELECT * FROM activity_logs WHERE client_id=? AND visibility='client' AND action<>'versao.criada' ${before ? 'AND created_at<?' : ''} ORDER BY created_at DESC LIMIT ?`, clientId, ...(before ? [before] : []), limit);
  return rows.map((r) => {
    const content = r.content_id ? one('SELECT id, title, stage FROM contents WHERE id=?', r.content_id) : null;
    let text = r.summary.replace(/ \[DEMO\]/g, '').replace(/^#\d+\s*/, '');
    const isClient = r.actor_id && one("SELECT 1 FROM users WHERE id=? AND role_key='cliente'", r.actor_id);
    if (r.action === 'etapa.alterada') {
      const v = content && r.after === 'aprovacao_cliente' ? one('SELECT number FROM content_versions WHERE content_id=? AND sent_to_client_at<=? ORDER BY sent_to_client_at DESC LIMIT 1', content.id, r.created_at) : null;
      const phrase = STAGE_PHRASE[r.after] || 'atualizado';
      text = content ? `“${content.title}”${v ? ` V${v.number}` : ''} — ${phrase}` : `Conteúdo ${phrase}`;
    } else if (r.action === 'comentario.criado') {
      text = `${isClient ? 'Você comentou' : 'A The Bold comentou'}${content ? ` em “${content.title}”` : ''}`;
    } else if (content && !text.includes(content.title)) text = `“${content.title}” — ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
    const link = content ? `/portal/conteudos?c=${content.id}`
      : r.entity_type === 'client_request' ? `/portal/solicitacoes?r=${r.entity_id}`
      : r.entity_type === 'client_decision' ? `/portal/decisoes?d=${r.entity_id}`
      : r.entity_type === 'meeting' ? `/portal/reunioes?m=${r.entity_id}`
      : r.entity_type === 'file' ? '/portal/materiais'
      : r.entity_type === 'brand' ? '/portal/marca'
      : r.action.startsWith('onboarding') ? '/portal/onboarding' : null;
    return { id: r.id, at: r.created_at, text, action: r.action, link };
  });
}

// Página inicial completa ("Meu momento Bold")
export function clientHome(clientId) {
  const actions = clientActions(clientId);
  return { journey: journey(clientId), actions, doing: boldIsDoing(clientId), next: whatsNext(clientId, actions), profile: profileProgress(clientId), history: clientHistory(clientId, { limit: 6 }) };
}
