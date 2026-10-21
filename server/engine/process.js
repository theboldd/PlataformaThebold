// ════════════════════════════════════════════════════════════════════
// PROCESS ENGINE — determinístico. Nenhuma IA decide estado operacional.
// Reconstruído do processo real (quadro PROCESSO no Notion, PDF "PROCESSO THE BOLD 2026",
// manual "Como a The Bold Funciona" e marcos do ciclo no Google Calendar).
// Cada etapa: responsável (função), entrada, ação, saída, próximo status, prazo, notificações, bloqueios e retorno.
// ════════════════════════════════════════════════════════════════════
import { db, one, all, insert, update, run, uid, now, tx, nextNumber, parseJSON } from '../db.js';
import { log, notify, businessDaysFrom, userName } from '../lib/core.js';
import { can, canAccessClient, HttpError } from '../lib/permissions.js';
import { automation } from './automations.js';

export const STAGES = {
  cronograma:         { label: 'Cronograma',            lane: 'estrategia',  fn: 'estrategia', milestone: 'cronograma_entrega',  sla: 3, action: 'Elaborar tema, objetivo e referência', exit: 'Tema completo (título, objetivo, formato, data)' },
  analise_cronograma: { label: 'Análise do cronograma', lane: 'revisao',     fn: 'revisao',    milestone: 'revisao_cronograma',  sla: 2, action: 'Analisar cronograma (Rebeca/Raísa)', exit: 'Aprovado ou ajuste solicitado', review: true },
  ajuste_cronograma:  { label: 'Ajuste do cronograma',  lane: 'ajuste',      fn: 'estrategia', milestone: 'ajuste_cronograma',   sla: 1, action: 'Ajustar tema conforme análise', exit: 'Cronograma pronto' },
  aprovacao_tema:     { label: 'Aprovação do tema',     lane: 'cliente',     fn: 'cliente',    milestone: 'cliente_aprova_temas', sla: 5, action: 'Cliente aprova ou comenta o tema', exit: 'Tema aprovado', client: true },
  producao:           { label: 'Produção',              lane: 'producao',    fn: null,         milestone: 'producao',            sla: 4, action: 'Produzir legenda + design/vídeo', exit: 'Todas as trilhas entregues com arquivo/legenda' },
  analise_producao:   { label: 'Revisão interna',       lane: 'revisao',     fn: 'revisao',    milestone: 'revisao_producao',    sla: 2, action: 'Revisar produção (Rebeca/Raísa)', exit: 'Aprovado internamente ou ajuste', review: true },
  ajuste_interno:     { label: 'Ajuste interno',        lane: 'ajuste',      fn: null,         milestone: 'ajustes_equipe',      sla: 1, action: 'Executar ajustes da revisão', exit: 'Nova versão entregue' },
  aprovacao_cliente:  { label: 'Aguardando cliente',    lane: 'cliente',     fn: 'cliente',    milestone: 'cliente_aprova_final', sla: 2, action: 'Cliente aprova ou solicita ajuste', exit: 'Versão aprovada pelo cliente', client: true },
  ajuste_cliente:     { label: 'Ajuste do cliente',     lane: 'ajuste',      fn: null,         milestone: 'ajustes_cliente',     sla: 1, action: 'Executar ajuste pedido pelo cliente', exit: 'Nova versão entregue', client: true },
  revisao_ajuste:     { label: 'Revisão do ajuste',     lane: 'revisao',     fn: 'estrategia', milestone: 'ajustes_cliente',     sla: 1, action: 'Estrategista confere o ajuste', exit: 'Ajuste conferido', review: true },
  agendamento:        { label: 'Para agendamento',      lane: 'agendamento', fn: 'agendamento', milestone: 'agendamento',        sla: 1, action: 'Agendar publicação', exit: 'Post agendado', client: true },
  agendado:           { label: 'Agendado',              lane: 'publicacao',  fn: null, sla: null, action: 'Aguardar publicação', exit: 'Publicação confirmada', client: true },
  publicado:          { label: 'Publicado',             lane: 'publicacao',  fn: null, sla: null, final: true, client: true },
  cancelado:          { label: 'Cancelado',             lane: null,          fn: null, sla: null, final: true },
};
export const LANES = [
  { key: 'estrategia', label: 'Estratégia' }, { key: 'revisao', label: 'Revisão' }, { key: 'ajuste', label: 'Ajuste' },
  { key: 'cliente', label: 'Cliente' }, { key: 'producao', label: 'Produção' }, { key: 'agendamento', label: 'Agendamento' }, { key: 'publicacao', label: 'Publicação' },
];
export const STAGE_ORDER = Object.keys(STAGES);

// Status público (linguagem do feed do cliente / status visual)
// Regra oficial 14: "aprovado" só com registro de aprovação do cliente (approved_version_id). Etapa não prova aprovação.
export function publicStatus(c) {
  if (c.blocked) return 'bloqueado';
  if (c.stage === 'agendamento' && !c.approved_version_id) return 'aprovacao_nao_registrada';
  // Regra 18: versão LIBERADA PELA EQUIPE não é aprovação do cliente
  if (c.stage === 'agendamento' && one('SELECT status FROM content_versions WHERE id=?', c.approved_version_id)?.status === 'liberada') return 'liberada_equipe';
  return ({ cronograma: 'rascunho', analise_cronograma: 'rascunho', ajuste_cronograma: 'rascunho', aprovacao_tema: 'aguardando_cliente',
    producao: 'em_producao', analise_producao: 'revisao_interna', ajuste_interno: 'em_ajuste', aprovacao_cliente: 'aguardando_cliente',
    ajuste_cliente: 'ajuste_solicitado', revisao_ajuste: 'em_ajuste', agendamento: 'aprovado', agendado: 'agendado', publicado: 'publicado', cancelado: 'cancelado' })[c.stage];
}

// Trilhas de produção por formato (legenda sempre; visual depende do formato)
export function productionTracks(format) {
  const visual = ['reel', 'video'].includes(format) ? 'edicao' : 'design';
  return [{ key: 'visual', fn: visual, title: visual === 'edicao' ? 'Editar vídeo' : 'Criar design' }, { key: 'legenda', fn: 'copy', title: 'Escrever legenda' }];
}

// ── Configurações do engine ─────────────────────────────
export const DEFAULT_SETTINGS = {
  // Calendário operacional (dias do mês anterior ao mês de publicação). Fonte: Google Calendar, ciclo NOV/26.
  cycle_template: {
    cronograma_entrega: [1, 1], revisao_cronograma: [2, 4], ajuste_cronograma: [5, 6], cliente_aprova_temas: [8, 15],
    leitura_comentarios: [16, 16], producao: [16, 22], revisao_producao: [23, 24], ajustes_equipe: [25, 26],
    tudo_pronto: [27, 27], cliente_aprova_final: [27, 28], ajustes_cliente: [29, 30], agendamento: [29, 30],
  },
  analise_cronograma_ativa: true,      // PDF: "em breve não teremos essa fase" → desligável
  reenviar_cliente_apos_ajuste: true,  // decisão The Bold (21/10): a versão que resolve o ajuste do cliente VOLTA para o cliente aprovar — aprovação nunca é inferida pela etapa
  revisores_padrao_roles: ['qualidade', 'ceo'], // Rebeca + Raísa
  cc_roles: ['operacoes'],             // Vitória recebe cópia das etapas-chave
  agendamento_roles: ['gestao'],       // Vivian agenda
  followup_cliente_horas: [24, 48, 72],
  lembrete_cliente_intervalo_horas: 24, // nunca mais de um lembrete ao cliente nesse intervalo
  lembrete_cliente_max: 3,             // máximo de lembretes por conteúdo em cada etapa de aprovação
  satisfacao_intervalo_dias: 14,       // intervalo mínimo entre convites de satisfação
  // Etapas que só ABREM na data do marco do ciclo: o conteúdo pode chegar pronto antes, mas a tarefa operacional
  // fica agendada (sem atraso, sem pendência, sem evento) até o início da janela. Ex.: revisão de produção abre dia 23.
  janela_etapas: ['analise_cronograma', 'analise_producao'],
};
export function setting(key) {
  const r = one('SELECT value FROM settings WHERE key=?', key);
  return r ? parseJSON(r.value) : DEFAULT_SETTINGS[key];
}

// ── Ciclos ──────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
export function buildMilestones(month) {
  const [y, m] = month.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1));
  const py = prev.getUTCFullYear(), pm = prev.getUTCMonth() + 1;
  const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const out = {};
  for (const [k, [a, b]] of Object.entries(setting('cycle_template'))) {
    out[k] = { start: `${py}-${pad(pm)}-${pad(Math.min(a, last))}`, end: `${py}-${pad(pm)}-${pad(Math.min(b, last))}` };
  }
  return out;
}
export function ensureCycle(clientId, month) {
  let c = one('SELECT * FROM cycles WHERE client_id=? AND month=?', clientId, month);
  if (!c) {
    c = insert('cycles', { id: uid('cy_'), client_id: clientId, month, status: 'planejamento', milestones: JSON.stringify(buildMilestones(month)), created_at: now() });
  }
  return c;
}
const endOfDayBR = (d) => new Date(`${d}T18:00:00-03:00`).toISOString();
const startOfDayBR = (d) => new Date(`${d}T08:00:00-03:00`).toISOString();
// Tarefas "vivas" = abertas + agendadas (as agendadas ainda não contam como trabalho de hoje, mas a etapa as reconhece)
export const LIVE_TASK = "('aberta','em_andamento','agendada')";
// Data em que a etapa abre para execução (início do marco do ciclo), quando ainda está no futuro e a etapa usa janela.
export function stageOpensAt(content, stage) {
  const def = STAGES[stage];
  if (!def?.milestone || !content.cycle_id || !setting('janela_etapas').includes(stage)) return null;
  const ms = parseJSON(one('SELECT milestones FROM cycles WHERE id=?', content.cycle_id)?.milestones, {})[def.milestone];
  if (!ms) return null;
  const at = startOfDayBR(ms.start);
  return at > now() ? at : null;
}

// PRONTO ≠ DISPONÍVEL (regra oficial): enquanto a tarefa da etapa atual estiver AGENDADA, nenhuma ação operacional a executa.
export function stageAvailability(content) {
  const t = one("SELECT available_at FROM tasks WHERE content_id=? AND stage=? AND status='agendada' ORDER BY available_at LIMIT 1", content.id, content.stage);
  return t?.available_at && t.available_at > now() ? t.available_at : null;
}
const fmtDiaBR = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
function assertAvailable(content) {
  const opens = stageAvailability(content);
  if (opens) throw new HttpError(409, `Etapa agendada: “${STAGES[content.stage].label}” só fica disponível em ${fmtDiaBR(opens)}. Pronto não é disponível — a ação abre na data do marco.`);
}

// Prazo da etapa: marco do ciclo (se ainda no futuro) → senão SLA em dias úteis. Nunca depois da data de publicação.
export function dueFor(content, stage) {
  const def = STAGES[stage];
  if (!def || def.sla == null) return null;
  let due = null;
  if (content.cycle_id && def.milestone) {
    const cy = one('SELECT milestones FROM cycles WHERE id=?', content.cycle_id);
    const ms = parseJSON(cy?.milestones, {})[def.milestone];
    if (ms) { const d = endOfDayBR(ms.end); if (d > now()) due = d; }
  }
  if (!due) { const d = businessDaysFrom(new Date(now()), def.sla); d.setHours(21, 0, 0, 0); due = d.toISOString(); }
  if (content.planned_at) {
    const cap = new Date(new Date(content.planned_at).getTime() - (stage === 'agendamento' ? 2 : 24) * 3600e3).toISOString();
    if (cap < due && cap > now()) due = cap;
  }
  return due;
}

// ── Atribuição por função ───────────────────────────────
const openLoad = (userId) => one("SELECT COUNT(*) n FROM tasks WHERE assignee_id=? AND status IN ('aberta','em_andamento')", userId).n;
export function resolveAssignee(clientId, fn) {
  if (!fn) return null;
  const pick = (ids) => ids.length ? ids.map((id) => ({ id, load: openLoad(id) })).sort((a, b) => a.load - b.load)[0].id : null;
  const members = (f) => all("SELECT cm.user_id FROM client_members cm JOIN users u ON u.id=cm.user_id WHERE cm.client_id=? AND cm.function=? AND u.active=1", clientId, f).map((r) => r.user_id);
  const byRoles = (roles) => all(`SELECT id FROM users WHERE active=1 AND role_key IN (${roles.map(() => '?').join(',')})`, ...roles).map((r) => r.id);
  let id = pick(members(fn));
  if (id) return id;
  const fallback = { copy: () => members('estrategia'), revisao: () => byRoles(setting('revisores_padrao_roles')), agendamento: () => byRoles(setting('agendamento_roles')), atendimento: () => byRoles(setting('agendamento_roles')) };
  if (fallback[fn]) id = pick(fallback[fn]());
  return id || null; // null → tarefa sem responsável → pendência crítica
}
export const clientUsers = (clientId) => all("SELECT u.id FROM client_members cm JOIN users u ON u.id=cm.user_id WHERE cm.client_id=? AND cm.function='cliente' AND u.active=1", clientId).map((r) => r.id);
const ccUsers = () => all(`SELECT id FROM users WHERE active=1 AND role_key IN (${setting('cc_roles').map(() => '?').join(',')})`, ...setting('cc_roles')).map((r) => r.id);
export const reviewersFor = (clientId) => {
  const m = all("SELECT user_id FROM client_members WHERE client_id=? AND function='revisao'", clientId).map((r) => r.user_id);
  return m.length ? m : all(`SELECT id FROM users WHERE active=1 AND role_key IN (${setting('revisores_padrao_roles').map(() => '?').join(',')})`, ...setting('revisores_padrao_roles')).map((r) => r.id);
};

// ── Versões ─────────────────────────────────────────────
export function currentVersion(contentId) {
  const c = one('SELECT current_version_id FROM contents WHERE id=?', contentId);
  return c?.current_version_id ? one('SELECT * FROM content_versions WHERE id=?', c.current_version_id) : null;
}
export function versionMedia(versionId) {
  return all('SELECT f.*, vm.position FROM version_media vm JOIN files f ON f.id=vm.file_id WHERE vm.version_id=? ORDER BY vm.position', versionId);
}
// Garante uma versão editável. Se a atual está travada (enviada à revisão/cliente), cria V+1 copiando legenda e mídia.
// Nunca sobrescreve silenciosamente uma versão anterior.
export function editableVersion(content, actorId) {
  const cur = currentVersion(content.id);
  if (cur && !cur.locked) return cur;
  const number = (one('SELECT MAX(number) n FROM content_versions WHERE content_id=?', content.id).n || 0) + 1;
  // Motivo da nova versão: os ajustes em aberto que ela vai resolver
  const open = all("SELECT origin, created_at FROM adjustments WHERE content_id=? AND status='aberto' ORDER BY created_at", content.id);
  const fromClient = open.find((a) => a.origin === 'cliente');
  const reason = fromClient ? `Ajustes solicitados em ${new Date(fromClient.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })}` : open.length ? 'Ajustes da revisão interna' : null;
  const v = insert('content_versions', { id: uid('v_'), content_id: content.id, number, caption: cur?.caption || '', notes: reason, status: 'rascunho', locked: 0, created_by: actorId, created_at: now() });
  // A versão anterior deixa de ser a atual: nunca é considerada aprovada depois que existe uma nova (a aprovação dela continua no histórico)
  if (cur) update('content_versions', { id: cur.id }, { status: 'substituida', locked: 1 });
  if (cur) for (const m of all('SELECT * FROM version_media WHERE version_id=?', cur.id)) insert('version_media', { version_id: v.id, file_id: m.file_id, position: m.position });
  update('contents', { id: content.id }, { current_version_id: v.id, updated_at: now() });
  log({ actor: actorId, action: 'versao.criada', entity: 'content', id: content.id, client: content.client_id, content: content.id, summary: `V${number} criada${cur ? ` a partir da V${cur.number}` : ''}`, visibility: 'internal' }); // rascunho: o cliente só vê a versão quando ela é enviada a ele
  return v;
}
function lockVersion(versionId, status) { if (versionId) update('content_versions', { id: versionId }, { locked: 1, status }); }

// ── Criação de conteúdo ─────────────────────────────────
export function createContent(data, actor) {
  return tx(() => {
    const client = one('SELECT * FROM clients WHERE id=?', data.client_id);
    if (!client) throw new HttpError(404, 'Cliente não encontrado.');
    const month = data.cycle_month || (data.planned_at ? data.planned_at.slice(0, 7) : null);
    const cycle = month ? ensureCycle(client.id, month) : null;
    const ts = now();
    const c = insert('contents', {
      id: uid('c_'), number: nextNumber('content'), client_id: client.id, project_id: data.project_id || null, cycle_id: cycle?.id || null,
      title: data.title, format: data.format, channel: data.channel || 'instagram', theme: data.theme || null, objective: data.objective || null,
      strategy_tags: JSON.stringify(data.strategy_tags || []), reference: data.reference || null, briefing: data.briefing || null,
      internal_notes: data.internal_notes || null, material_status: data.material_status || 'nao_necessario',
      stage: data.stage || 'cronograma', stage_entered_at: ts, priority: data.priority || 'media', planned_at: data.planned_at || null,
      cycle_month: month, created_by: actor?.id || null, created_at: ts, updated_at: ts,
    });
    log({ actor: actor?.id, action: 'conteudo.criado', entity: 'content', id: c.id, client: client.id, content: c.id, summary: `Conteúdo #${c.number} “${c.title}” criado em ${STAGES[c.stage].label}` });
    enterStage(c, c.stage, actor, { initial: true });
    return one('SELECT * FROM contents WHERE id=?', c.id);
  });
}

// ── Entrada em etapa: cria tarefas, atribui, define prazo, notifica, registra ──
function enterStage(content, stage, actor, ctx = {}) {
  const def = STAGES[stage];
  const ts = now();
  const prev = content.stage;
  update('contents', { id: content.id }, { stage, stage_entered_at: ts, updated_at: ts });
  content = one('SELECT * FROM contents WHERE id=?', content.id);
  // Fecha tarefas de etapa abertas da etapa anterior (a ação já foi realizada)
  run(`UPDATE tasks SET status='cancelada', completed_at=? WHERE content_id=? AND kind IN ('etapa','aprovacao','agendamento') AND status IN ${LIVE_TASK} AND stage<>?`, ts, content.id, stage);
  if (!ctx.initial) {
    log({ actor: actor?.id, action: 'etapa.alterada', entity: 'content', id: content.id, client: content.client_id, content: content.id,
      summary: `#${content.number} ${STAGES[prev]?.label} → ${def.label}${ctx.reason ? ` (${ctx.reason})` : ''}`, before: prev, after: stage, origin: 'automatica',
      visibility: def.client ? 'client' : 'internal' });
  }
  const due = dueFor(content, stage);
  // Pronto para a próxima etapa ≠ etapa disponível: se a janela da etapa ainda não abriu, a tarefa nasce AGENDADA
  const opensAt = stageOpensAt(content, stage);
  const mk = (title, fn, kind = 'etapa', extra = {}) => {
    const assignee = fn === 'cliente' ? (clientUsers(content.client_id)[0] || null) : resolveAssignee(content.client_id, fn);
    const scheduled = !!opensAt && kind === 'etapa' && fn !== 'cliente';
    const t = insert('tasks', { id: uid('t_'), title, client_id: content.client_id, content_id: content.id, stage, function: fn, assignee_id: assignee,
      status: scheduled ? 'agendada' : 'aberta', available_at: scheduled ? opensAt : null, kind, origin: 'engine', priority: content.priority, due_at: due, created_by: actor?.id || null, created_at: ts, ...extra });
    if (scheduled) {
      automation('etapa.agendada', { entity: 'task', id: t.id, client: content.client_id, detail: `${title} — abre em ${opensAt.slice(0, 10)}` });
      return t; // sem aviso de tarefa agora: quem recebe é avisado quando a etapa abrir
    }
    automation('tarefa.atribuida', { entity: 'task', id: t.id, client: content.client_id, detail: `${title} → ${userName(assignee) || 'SEM RESPONSÁVEL'}` });
    if (!assignee) {
      notify(ccUsers(), { level: 'urgente', type: 'sem_responsavel', title: `Tarefa sem responsável: ${title}`, body: `#${content.number} ${content.title} — função “${fn}” sem pessoa vinculada ao cliente.`, link: `/conteudos/${content.id}`, client: content.client_id, content: content.id });
    } else if (fn !== 'cliente') {
      notify(assignee, { level: 'info', type: 'tarefa', title: `${title}`, body: `#${content.number} ${content.title}`, link: `/conteudos/${content.id}`, groupKey: `tarefa:${assignee}:${stage}:${content.cycle_id || content.client_id}`, client: content.client_id, content: content.id });
    }
    return t;
  };
  const clientName = one('SELECT name FROM clients WHERE id=?', content.client_id).name;

  switch (stage) {
    case 'cronograma': case 'ajuste_cronograma':
      mk(`${def.action} — ${content.title}`, 'estrategia'); break;
    case 'analise_cronograma': case 'analise_producao': case 'revisao_ajuste': {
      const v = currentVersion(content.id);
      if (stage !== 'analise_cronograma') lockVersion(v?.id, 'em_revisao');
      if (v && stage !== 'analise_cronograma') insert('reviews', { id: uid('r_'), content_id: content.id, version_id: v.id, kind: stage === 'revisao_ajuste' ? 'ajuste_cliente' : content.revision_rounds > 0 ? 'ajuste_interno' : 'producao', status: 'pendente', created_at: ts });
      const t = mk(`${def.action} — ${content.title}`, def.fn);
      if (t.status === 'agendada') {
        // Aviso antecipado (sem tarefa, sem atraso): "X conteúdos prontos para revisão a partir de DD/MM"
        const day = new Date(opensAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
        notify([...new Set([...reviewersFor(content.client_id), ...ccUsers()])], { level: 'info', type: 'pronto_para_etapa', title: `Prontos para ${def.label.toLowerCase()} a partir de ${day}`, body: `${clientName}: #${content.number} ${content.title}`, link: '/revisao', groupKey: `pronto:${content.client_id}:${stage}:${opensAt.slice(0, 10)}`, client: content.client_id });
      } else if (stage !== 'revisao_ajuste') notify(reviewersFor(content.client_id).filter((id) => id !== t.assignee_id), { level: 'info', type: 'revisao', title: 'Conteúdos aguardando revisão', body: `${clientName}: #${content.number} ${content.title}`, link: '/revisao', groupKey: `revisao:${content.client_id}`, client: content.client_id });
      break;
    }
    case 'aprovacao_tema': case 'aprovacao_cliente': {
      if (stage === 'aprovacao_cliente') {
        const v = currentVersion(content.id);
        lockVersion(v?.id, 'enviada_cliente');
        if (v) update('content_versions', { id: v.id }, { sent_to_client_at: ts });
      }
      mk(stage === 'aprovacao_tema' ? `Aprovar tema — ${content.title}` : `Aprovar conteúdo — ${content.title}`, 'cliente', 'aprovacao');
      const updated = stage === 'aprovacao_cliente' && content.client_adjust_rounds > 0;
      notify(clientUsers(content.client_id), { level: 'atencao', type: 'aprovacao', title: updated ? 'O conteúdo atualizado está disponível para revisão.' : stage === 'aprovacao_tema' ? 'Novos temas disponíveis para aprovação.' : 'Novo conteúdo disponível para aprovação.',
        // o que aconteceu · por que importa · o que fazer
        body: `${updated ? `${content.title} — nova versão com o ajuste que você pediu. ` : ''}${due ? `Precisamos da sua aprovação até ${new Date(due).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })}${content.planned_at ? ` para manter a publicação prevista para ${new Date(content.planned_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })}` : ''}.` : 'Com a sua aprovação, seguimos para a próxima etapa.'}`,
        cta: 'Revisar agora', link: updated ? `/portal/conteudos?c=${content.id}` : '/portal/conteudos?filtro=aguardando', groupKey: `aprovacao:${content.client_id}:${stage}:${updated ? 'u' : 'n'}`, client: content.client_id, content: content.id });
      automation('cliente.notificado_aprovacao', { entity: 'content', id: content.id, client: content.client_id });
      break;
    }
    case 'producao': {
      for (const tr of productionTracks(content.format)) mk(`${tr.title} — ${content.title}`, tr.fn, 'etapa', { description: `trilha:${tr.key}` });
      if (content.material_status === 'aguardando') blockContent(content.id, 'Pendente por material do cliente', 'cliente', null, { silent: true });
      break;
    }
    case 'ajuste_interno': case 'ajuste_cliente':
      // tarefas de ajuste já são criadas em requestAdjustment
      break;
    case 'agendamento':
      mk(`Agendar publicação — ${content.title}`, 'agendamento', 'agendamento'); break;
    default: break;
  }
  // Ciclo acompanha a etapa mais atrasada dos conteúdos
  if (content.cycle_id) refreshCycleStatus(content.cycle_id);
  return content;
}

function refreshCycleStatus(cycleId) {
  const stages = all("SELECT stage FROM contents WHERE cycle_id=? AND stage<>'cancelado'", cycleId).map((r) => r.stage);
  if (!stages.length) return;
  const min = Math.min(...stages.map((s) => STAGE_ORDER.indexOf(s)));
  const s = STAGE_ORDER[min];
  const status = ['cronograma', 'analise_cronograma', 'ajuste_cronograma'].includes(s) ? 'planejamento' : s === 'aprovacao_tema' ? 'aprovacao_temas'
    : ['producao', 'analise_producao', 'ajuste_interno'].includes(s) ? 'producao' : ['aprovacao_cliente', 'ajuste_cliente', 'revisao_ajuste'].includes(s) ? 'aprovacao_final'
    : s === 'agendamento' ? 'agendamento' : s === 'agendado' ? 'publicando' : 'encerrado';
  run('UPDATE cycles SET status=? WHERE id=?', status, cycleId);
}

// ── Autorização por evento (backend) ────────────────────
function isMember(user, clientId, fn) { return !!one('SELECT 1 FROM client_members WHERE user_id=? AND client_id=? AND function=?', user.id, clientId, fn); }
function assertActor(user, content, who) {
  if (!canAccessClient(user, content.client_id)) throw new HttpError(403, 'Sem acesso a este cliente.');
  const ok = {
    estrategia: () => isMember(user, content.client_id, 'estrategia') || can(user, 'conteudos', 'approve'),
    revisor: () => can(user, 'revisao', 'approve'),
    estrategia_ou_revisor: () => isMember(user, content.client_id, 'estrategia') || can(user, 'revisao', 'approve'),
    cliente: () => user.role_key === 'cliente' || can(user, 'conteudos', 'admin'), // equipe pode registrar em nome do cliente (ex.: aprovou no WhatsApp)
    agendamento: () => isMember(user, content.client_id, 'agendamento') || can(user, 'conteudos', 'approve') || setting('agendamento_roles').includes(user.role_key),
    equipe: () => user.role_key !== 'cliente' && (can(user, 'conteudos', 'edit')),
  }[who];
  if (!ok || !ok()) throw new HttpError(403, 'Você não tem permissão para executar esta etapa.');
}

const getContent = (id) => { const c = one('SELECT * FROM contents WHERE id=?', id); if (!c) throw new HttpError(404, 'Conteúdo não encontrado.'); return c; };
const expectStage = (c, ...st) => { if (!st.includes(c.stage)) throw new HttpError(409, `Ação inválida: o conteúdo está em “${STAGES[c.stage].label}”.`); };
const assertNotBlocked = (c) => { if (c.blocked) throw new HttpError(409, `Conteúdo bloqueado: ${c.block_reason}. Desbloqueie antes de avançar.`); };

// ════════════ AÇÕES DO PROCESSO ════════════

// Conclusão de uma tarefa. Se for a última tarefa da etapa, o engine avança sozinho.
export function completeTask(taskId, actor, meta = {}) {
  return tx(() => {
    const t = one('SELECT * FROM tasks WHERE id=?', taskId);
    if (!t) throw new HttpError(404, 'Tarefa não encontrada.');
    if (['concluida', 'cancelada'].includes(t.status)) throw new HttpError(409, 'Tarefa já encerrada.');
    if (t.status === 'agendada' && t.available_at > now()) throw new HttpError(409, `Tarefa agendada: fica disponível em ${fmtDiaBR(t.available_at)}. Pronto não é disponível.`);
    if (t.client_id && !canAccessClient(actor, t.client_id)) throw new HttpError(403, 'Sem acesso.');
    if (t.assignee_id !== actor.id && !can(actor, 'conteudos', 'approve') && !(t.client_id && isMember(actor, t.client_id, t.function))) throw new HttpError(403, 'Esta tarefa não está atribuída a você.');
    const c = t.content_id ? getContent(t.content_id) : null;
    if (c && t.kind === 'etapa') {
      assertNotBlocked(c);
      validateDeliverable(c, t);
    }
    if (c && t.kind === 'ajuste') validateAdjustmentDone(c, t);
    update('tasks', { id: t.id }, { status: 'concluida', completed_at: now(), completed_by: actor.id });
    log({ actor: actor.id, action: 'tarefa.concluida', entity: 'task', id: t.id, client: t.client_id, content: t.content_id, summary: `Tarefa concluída: ${t.title}` });
    if (t.kind === 'ajuste') {
      run("UPDATE adjustments SET status='concluido', done_at=?, resolved_version_id=? WHERE task_id=?", now(), c?.current_version_id, t.id);
    }
    if (!c) return { task: t };
    const pending = one(`SELECT COUNT(*) n FROM tasks WHERE content_id=? AND stage=? AND kind IN ('etapa','ajuste') AND status IN ${LIVE_TASK}`, c.id, c.stage).n;
    if (pending === 0) advance(c, actor, meta);
    return { task: t, content: one('SELECT * FROM contents WHERE id=?', c.id) };
  });
}

function validateDeliverable(c, t) {
  if (c.stage === 'cronograma' || c.stage === 'ajuste_cronograma') {
    if (!c.theme && !c.objective) throw new HttpError(422, 'Preencha tema ou objetivo antes de concluir o cronograma.');
    if (!c.planned_at) throw new HttpError(422, 'Defina a data prevista de publicação.');
  }
  if (c.stage === 'producao') {
    const v = currentVersion(c.id);
    if (t.description === 'trilha:visual' && (!v || !versionMedia(v.id).length)) throw new HttpError(422, 'Envie o arquivo final (imagem/vídeo) antes de entregar. A próxima pessoa precisa dele.');
    if (t.description === 'trilha:legenda' && (!v || !v.caption.trim())) throw new HttpError(422, 'Escreva a legenda antes de entregar.');
  }
}
function validateAdjustmentDone(c, t) {
  const adj = one('SELECT * FROM adjustments WHERE task_id=?', t.id);
  const cur = currentVersion(c.id);
  const reqV = adj?.version_id ? one('SELECT number FROM content_versions WHERE id=?', adj.version_id)?.number : 0;
  if (!cur || cur.number <= (reqV || 0)) throw new HttpError(422, 'Crie a nova versão (arquivo ou legenda ajustados) antes de concluir o ajuste. A versão anterior é preservada.');
}

// Avanço automático quando a etapa foi cumprida
function advance(c, actor, meta) {
  const client = one('SELECT * FROM clients WHERE id=?', c.client_id);
  const toTheme = client.requires_theme_approval ? 'aprovacao_tema' : 'producao';
  switch (c.stage) {
    case 'cronograma': return enterStage(c, setting('analise_cronograma_ativa') ? 'analise_cronograma' : toTheme, actor, { reason: 'cronograma concluído' });
    case 'ajuste_cronograma': return enterStage(c, c.client_adjust_rounds > 0 ? 'producao' : toTheme, actor, { reason: 'cronograma pronto' });
    case 'producao': automation('producao.concluida', { entity: 'content', id: c.id, client: c.client_id }); return enterStage(c, 'analise_producao', actor, { reason: 'produção entregue' });
    case 'ajuste_interno': automation('ajuste.concluido', { entity: 'content', id: c.id, client: c.client_id }); return enterStage(c, 'analise_producao', actor, { reason: 'ajuste interno concluído' });
    case 'ajuste_cliente': {
      automation('ajuste.concluido', { entity: 'content', id: c.id, client: c.client_id });
      const sizes = all("SELECT size FROM adjustments WHERE content_id=? AND origin='cliente' AND status='concluido' AND version_id=(SELECT version_id FROM adjustments WHERE content_id=? AND origin='cliente' ORDER BY created_at DESC LIMIT 1)", c.id, c.id).map((r) => r.size);
      const simple = sizes.length && sizes.every((s) => s === 'simples');
      if (!simple || roundNeedsReapproval(c.id)) return enterStage(c, 'revisao_ajuste', actor, { reason: 'ajuste concluído — estrategista confere' });
      return setting('reenviar_cliente_apos_ajuste') ? enterStage(c, 'aprovacao_cliente', actor, { reason: 'ajuste simples concluído' }) : releaseAfterClientAdjust(c, actor, 'ajuste simples concluído');
    }
    default: return null;
  }
}

// Regra da The Bold: o ajuste pedido pelo cliente, depois de conferido, segue direto para agendamento.
// A nova versão é congelada como versão liberada (o cliente já aprovou o conteúdo e pediu só aquele ajuste).
// Pedido feito DEPOIS de o cliente ter aprovado → a nova versão precisa de nova aprovação do cliente
function roundNeedsReapproval(contentId) {
  const last = one("SELECT version_id FROM adjustments WHERE content_id=? AND origin='cliente' ORDER BY created_at DESC LIMIT 1", contentId);
  return !!(last && one("SELECT 1 FROM adjustments WHERE content_id=? AND origin='cliente' AND reapproval=1 AND version_id IS ?", contentId, last.version_id));
}
// Só usado se a configuração voltar a "não reenviar": a versão é LIBERADA pela equipe, nunca marcada como aprovada pelo cliente
function releaseAfterClientAdjust(c, actor, reason) {
  const v = currentVersion(c.id);
  if (v) {
    update('content_versions', { id: v.id }, { status: 'liberada', locked: 1 });
    update('contents', { id: c.id }, { approved_version_id: v.id });
  }
  log({ actor: actor?.id, action: 'versao.liberada', entity: 'content', id: c.id, client: c.client_id, content: c.id, visibility: 'client',
    summary: `V${v?.number} liberada para agendamento após o ajuste solicitado pelo cliente (${reason})` });
  return enterStage(c, 'agendamento', actor, { reason });
}

// Decisão de revisão interna (Sala de Revisão) — aprovar ou pedir ajuste
export function reviewDecision(contentId, actor, { decision, note, adjustments = [] }, req) {
  return tx(() => {
    const c = getContent(contentId);
    expectStage(c, 'analise_cronograma', 'analise_producao', 'revisao_ajuste');
    assertActor(actor, c, c.stage === 'revisao_ajuste' ? 'estrategia_ou_revisor' : 'revisor');
    assertAvailable(c);
    const v = currentVersion(c.id);
    const review = one("SELECT * FROM reviews WHERE content_id=? AND status='pendente' ORDER BY created_at DESC LIMIT 1", c.id);
    if (review) update('reviews', { id: review.id }, { status: decision === 'aprovar' ? 'aprovada' : 'ajuste', reviewer_id: actor.id, note, decided_at: now() });
    run(`UPDATE tasks SET status='concluida', completed_at=?, completed_by=? WHERE content_id=? AND stage=? AND kind='etapa' AND status IN ${LIVE_TASK}`, now(), actor.id, c.id, c.stage);
    insert('approvals', { id: uid('ap_'), content_id: c.id, version_id: v?.id || null, kind: c.stage === 'analise_cronograma' ? 'tema' : 'interna', decision: decision === 'aprovar' ? 'aprovado' : 'ajuste', user_id: actor.id, note, ip: req?.ip, user_agent: req?.headers?.['user-agent']?.slice(0, 200), created_at: now() });
    log({ actor: actor.id, action: decision === 'aprovar' ? 'revisao.aprovada' : 'revisao.ajuste', entity: 'content', id: c.id, client: c.client_id, content: c.id, summary: `${STAGES[c.stage].label}: ${decision === 'aprovar' ? 'aprovado' : 'ajuste solicitado'}${v ? ` (V${v.number})` : ''}${note ? ` — “${note}”` : ''}` });
    if (decision === 'aprovar') {
      if (c.stage === 'analise_cronograma') { const cl = one('SELECT requires_theme_approval FROM clients WHERE id=?', c.client_id); return enterStage(c, cl.requires_theme_approval ? 'aprovacao_tema' : 'producao', actor, { reason: 'cronograma aprovado internamente' }); }
      automation('revisao.aprovada', { entity: 'content', id: c.id, client: c.client_id });
      if (c.stage === 'revisao_ajuste' && !setting('reenviar_cliente_apos_ajuste') && !roundNeedsReapproval(c.id)) return releaseAfterClientAdjust(c, actor, 'ajuste do cliente conferido');
      return enterStage(c, 'aprovacao_cliente', actor, { reason: 'aprovado internamente — enviado ao cliente' });
    }
    if (!adjustments.length && !note) throw new HttpError(422, 'Descreva o ajuste necessário.');
    if (c.stage === 'analise_cronograma') {
      return enterStage(c, 'ajuste_cronograma', actor, { reason: note || 'ajuste no cronograma' });
    }
    const list = adjustments.length ? adjustments : [{ description: note }];
    const origin = c.stage === 'revisao_ajuste' ? 'cliente' : 'interno';
    update('contents', { id: c.id }, origin === 'interno' ? { revision_rounds: c.revision_rounds + 1 } : {});
    const next = enterStage(c, origin === 'interno' ? 'ajuste_interno' : 'ajuste_cliente', actor, { reason: 'ajuste solicitado na revisão' });
    for (const a of list) createAdjustment(next, actor, { ...a, origin });
    automation('revisao.ajuste', { entity: 'content', id: c.id, client: c.client_id, detail: `${list.length} ajuste(s)` });
    return one('SELECT * FROM contents WHERE id=?', c.id);
  });
}

// Tipo do ajuste (feedback estruturado do cliente) → trilha responsável
export const ADJUST_ASPECTS = { texto: 'Texto', imagem: 'Imagem', video: 'Vídeo', legenda: 'Legenda', pagina: 'Página do carrossel', outro: 'Outro' };
const trackOfAspect = (aspect) => (['legenda', 'texto'].includes(aspect) ? 'legenda' : 'visual');
function createAdjustment(c, actor, { description, origin, size = 'normal', track = null, aspect = null, assignee_id = null, carousel_page = null, video_timestamp = null, region = null, reapproval = 0 }) {
  if (!description?.trim()) throw new HttpError(422, 'Explique o ajuste necessário.');
  if (aspect && !ADJUST_ASPECTS[aspect]) aspect = 'outro';
  track = track || (aspect ? trackOfAspect(aspect) : 'visual');
  if (region && typeof region === 'object') region = JSON.stringify({ x: Math.max(0, Math.min(1, Number(region.x) || 0)), y: Math.max(0, Math.min(1, Number(region.y) || 0)) });
  const v = currentVersion(c.id);
  const fn = track === 'legenda' ? 'copy' : productionTracks(c.format)[0].fn;
  const assignee = assignee_id || lastProducer(c.id, fn) || resolveAssignee(c.client_id, fn);
  const due = dueFor(c, c.stage);
  const t = insert('tasks', { id: uid('t_'), title: `Ajuste ${origin === 'cliente' ? 'do cliente' : 'interno'} — ${c.title}`, description, client_id: c.client_id, content_id: c.id, stage: c.stage, function: fn,
    assignee_id: assignee, status: 'aberta', kind: 'ajuste', origin: 'engine', priority: origin === 'cliente' ? 'alta' : c.priority, due_at: due, created_by: actor.id, created_at: now() });
  const adj = insert('adjustments', { id: uid('aj_'), content_id: c.id, version_id: v?.id || null, origin, size, description, aspect, carousel_page, video_timestamp, region,
    requested_by: actor.id, assigned_to: assignee, task_id: t.id, status: 'aberto', due_at: due, created_at: now(), reapproval: reapproval ? 1 : 0 });
  notify(assignee, { level: origin === 'cliente' ? 'atencao' : 'info', type: 'ajuste', title: `Ajuste ${origin === 'cliente' ? 'solicitado pelo cliente' : 'interno'}`, body: `#${c.number} ${c.title}: ${description.slice(0, 140)}`, link: `/conteudos/${c.id}`, client: c.client_id, content: c.id });
  log({ actor: actor.id, action: 'ajuste.criado', entity: 'adjustment', id: adj.id, client: c.client_id, content: c.id, summary: `Ajuste (${origin}${size === 'simples' ? ', simples' : ''}) atribuído a ${userName(assignee) || 'SEM RESPONSÁVEL'}: ${description.slice(0, 120)}` });
  // O cliente vê o registro em linguagem dele, sem nomes internos
  if (origin === 'cliente') log({ actor: actor.id, action: 'ajuste.solicitado', entity: 'adjustment', id: adj.id, client: c.client_id, content: c.id, visibility: 'client',
    summary: `Ajuste solicitado em V${v?.number ?? '?'}${carousel_page ? ` · página ${carousel_page}` : ''}${video_timestamp != null ? ` · ${Math.floor(video_timestamp / 60)}:${String(Math.floor(video_timestamp % 60)).padStart(2, '0')}` : ''}${aspect ? ` · ${ADJUST_ASPECTS[aspect]}` : ''}: ${description.slice(0, 120)}` });
  return adj;
}
function lastProducer(contentId, fn) {
  return one("SELECT completed_by FROM tasks WHERE content_id=? AND function=? AND status='concluida' AND completed_by IS NOT NULL ORDER BY completed_at DESC LIMIT 1", contentId, fn)?.completed_by || null;
}

// Comentário que vira ajuste (feito pela equipe): o comentário original fica intacto e passa a apontar para o ajuste criado.
// Só onde a equipe está com o conteúdo. Quando o conteúdo espera o cliente ou já foi aprovado, a mudança de etapa
// passa pela decisão do cliente (registrada pelo cliente ou pela equipe em nome dele), não por aqui.
export const COMMENT_ADJ_STAGES = ['producao', 'analise_producao', 'ajuste_interno', 'ajuste_cliente', 'revisao_ajuste'];
export function commentToAdjustment(commentId, actor, { size = 'normal', track = 'visual', description } = {}) {
  return tx(() => {
    const cm = one('SELECT * FROM comments WHERE id=?', commentId);
    if (!cm) throw new HttpError(404, 'Comentário não encontrado.');
    // Idempotente (regra 19): a segunda tentativa devolve o ajuste já existente, sem criar outro
    if (cm.adjustment_id) return { ...one('SELECT * FROM adjustments WHERE id=?', cm.adjustment_id), already: true };
    const c = getContent(cm.content_id);
    if (!can(actor, 'conteudos', 'edit') || !canAccessClient(actor, c.client_id)) throw new HttpError(403, 'Sem permissão para criar ajuste neste conteúdo.');
    if (!COMMENT_ADJ_STAGES.includes(c.stage)) throw new HttpError(409, ['aprovacao_tema', 'aprovacao_cliente', 'agendamento', 'agendado'].includes(c.stage)
      ? 'O conteúdo está com o cliente ou já aprovado: registre a decisão do cliente (ajuste) em vez de converter o comentário.'
      : `Na etapa “${STAGES[c.stage].label}” não cabe ajuste de produção.`);
    const author = one('SELECT role_key FROM users WHERE id=?', cm.author_id);
    const origin = author?.role_key === 'cliente' ? 'cliente' : 'interno';
    const anchor = parseJSON(cm.anchor, {}) || {};
    let cur = c;
    if (origin === 'cliente' && c.stage === 'revisao_ajuste') cur = enterStage(c, 'ajuste_cliente', actor, { reason: 'pedido do cliente (comentário) durante a revisão do ajuste' });
    const adj = createAdjustment(cur, actor, { description: String(description || cm.body).trim(), origin, size: size === 'simples' ? 'simples' : 'normal', track: track === 'legenda' ? 'legenda' : 'visual',
      carousel_page: anchor.page || null, video_timestamp: anchor.t ?? null, region: anchor.region || null });
    update('comments', { id: cm.id }, { adjustment_id: adj.id });
    update('adjustments', { id: adj.id }, { comment_id: cm.id });
    log({ actor: actor.id, action: 'comentario.virou_ajuste', entity: 'comment', id: cm.id, client: c.client_id, content: c.id, summary: `Comentário ${origin === 'cliente' ? 'do cliente' : 'interno'} virou ajuste: ${cm.body.slice(0, 120)}`, after: adj.id });
    return adj;
  });
}

// Decisão do cliente (feed de aprovação) — tema ou conteúdo final
export function clientDecision(contentId, actor, { decision, note, carousel_page, video_timestamp, region, aspect, size, on_behalf_note }, req) {
  return tx(() => {
    const c = getContent(contentId);
    expectStage(c, 'aprovacao_tema', 'aprovacao_cliente');
    assertActor(actor, c, 'cliente');
    const onBehalf = actor.role_key !== 'cliente';
    if (onBehalf && !on_behalf_note) throw new HttpError(422, 'Ao registrar em nome do cliente, informe a origem (ex.: “aprovado no WhatsApp 19/10 14h”).');
    const v = c.stage === 'aprovacao_cliente' ? currentVersion(c.id) : null;
    const kind = c.stage === 'aprovacao_tema' ? 'tema' : 'cliente';
    insert('approvals', { id: uid('ap_'), content_id: c.id, version_id: v?.id || null, kind, decision: decision === 'aprovar' ? 'aprovado' : 'ajuste', user_id: actor.id,
      note: onBehalf ? `[registrado pela equipe] ${on_behalf_note}${note ? ` — ${note}` : ''}` : note, ip: req?.ip, user_agent: req?.headers?.['user-agent']?.slice(0, 200), created_at: now() });
    run("UPDATE tasks SET status='concluida', completed_at=?, completed_by=? WHERE content_id=? AND kind='aprovacao' AND status IN ('aberta','em_andamento')", now(), actor.id, c.id);
    const team = [...new Set([...all("SELECT user_id FROM client_members WHERE client_id=? AND function IN ('estrategia','atendimento')", c.client_id).map((r) => r.user_id), ...ccUsers()])];
    const cname = one('SELECT name FROM clients WHERE id=?', c.client_id).name;
    if (decision === 'aprovar') {
      if (v) { update('content_versions', { id: v.id }, { status: 'aprovada', locked: 1, approved_by: actor.id, approved_at: now() }); update('contents', { id: c.id }, { approved_version_id: v.id }); }
      log({ actor: actor.id, action: kind === 'tema' ? 'tema.aprovado' : 'cliente.aprovou', entity: 'content', id: c.id, client: c.client_id, content: c.id, visibility: 'client', ip: req?.ip,
        summary: `${kind === 'tema' ? 'Tema aprovado' : `Conteúdo aprovado — V${v?.number} congelada`} por ${actor.name}${onBehalf ? ' (registrado pela equipe)' : ''}` });
      notify(team, { level: 'info', type: 'aprovacao_cliente', title: `${cname} aprovou ${kind === 'tema' ? 'temas' : 'conteúdos'}`, body: `#${c.number} ${c.title}`, link: `/conteudos/${c.id}`, groupKey: `aprovou:${c.client_id}:${kind}`, client: c.client_id, content: c.id });
      automation(kind === 'tema' ? 'tema.aprovado' : 'cliente.aprovou', { entity: 'content', id: c.id, client: c.client_id });
      return enterStage(c, kind === 'tema' ? 'producao' : 'agendamento', actor, { reason: kind === 'tema' ? 'tema aprovado pelo cliente' : 'aprovado pelo cliente' });
    }
    if (!note?.trim()) throw new HttpError(422, 'Explique o ajuste necessário.');
    update('contents', { id: c.id }, { client_adjust_rounds: c.client_adjust_rounds + 1 });
    notify(team, { level: 'atencao', type: 'ajuste_cliente', title: `${cname} solicitou ajuste`, body: `#${c.number} ${c.title}: ${note.slice(0, 140)}`, link: `/conteudos/${c.id}`, client: c.client_id, content: c.id });
    if (kind === 'tema') {
      log({ actor: actor.id, action: 'tema.ajuste', entity: 'content', id: c.id, client: c.client_id, content: c.id, visibility: 'client', summary: `Cliente pediu ajuste no tema: ${note.slice(0, 140)}` });
      const next = enterStage(c, 'ajuste_cronograma', actor, { reason: 'cliente pediu ajuste no tema' });
      run("UPDATE tasks SET description=? WHERE content_id=? AND stage='ajuste_cronograma' AND status='aberta'", `Pedido do cliente: ${note}`, c.id);
      automation('tema.ajuste', { entity: 'content', id: c.id, client: c.client_id });
      return next;
    }
    const next = enterStage(c, 'ajuste_cliente', actor, { reason: 'cliente solicitou ajuste' });
    createAdjustment(next, actor, { description: note, origin: 'cliente', size: size === 'simples' ? 'simples' : 'normal', aspect, carousel_page, video_timestamp, region });
    if (!onBehalf) notify(actor.id, { level: 'info', type: 'ajuste_recebido', title: 'Seu ajuste foi recebido pela equipe.', body: `${c.title} — a The Bold já está cuidando. Você recebe a nova versão aqui para aprovar.`, link: `/portal/conteudos?c=${c.id}`, groupKey: `ajuste-rec:${c.client_id}`, client: c.client_id });
    automation('cliente.ajuste', { entity: 'content', id: c.id, client: c.client_id });
    return one('SELECT * FROM contents WHERE id=?', c.id);
  });
}

// Agendamento: Meta conectada → publicação programada pela plataforma; senão → marcado como agendado externamente
export function schedule(contentId, actor, { at, mode, external_note }) {
  return tx(() => {
    const c = getContent(contentId);
    expectStage(c, 'agendamento', 'agendado');
    assertActor(actor, c, 'agendamento');
    if (!c.approved_version_id) throw new HttpError(409, 'Não há versão aprovada pelo cliente.');
    if (!at) throw new HttpError(422, 'Informe data e horário.');
    if (mode === 'meta') {
      const meta = one("SELECT status FROM integrations WHERE provider='meta'");
      if (meta?.status !== 'conectado') throw new HttpError(409, 'Meta/Instagram não está conectado. Use “Marcar como agendado externamente”.');
    }
    update('contents', { id: c.id }, { scheduled_at: new Date(at).toISOString(), schedule_mode: mode === 'meta' ? 'meta' : 'externo', updated_at: now() });
    run("UPDATE tasks SET status='concluida', completed_at=?, completed_by=? WHERE content_id=? AND kind='agendamento' AND status IN ('aberta','em_andamento')", now(), actor.id, c.id);
    log({ actor: actor.id, action: 'conteudo.agendado', entity: 'content', id: c.id, client: c.client_id, content: c.id, visibility: 'client',
      summary: mode === 'meta' ? `Agendado para publicação automática via Meta em ${new Date(at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : `Marcado como agendado externamente (${new Date(at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}) — publicação depende de ação externa${external_note ? `: ${external_note}` : ''}` });
    automation('conteudo.agendado', { entity: 'content', id: c.id, client: c.client_id });
    notify(clientUsers(c.client_id), { level: 'info', type: 'agendado', title: 'Conteúdo agendado', body: `${c.title} — vai ao ar em ${new Date(at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}. Nada mais depende de você.`, link: `/portal/conteudos?c=${c.id}`, groupKey: `agendado:${c.client_id}`, client: c.client_id });
    if (c.stage === 'agendado') return one('SELECT * FROM contents WHERE id=?', c.id);
    return enterStage(one('SELECT * FROM contents WHERE id=?', c.id), 'agendado', actor, { reason: mode === 'meta' ? 'agendado (Meta)' : 'agendado externamente' });
  });
}
export function confirmPublished(contentId, actor, { external_post_id = null, at = null } = {}, system = false) {
  return tx(() => {
    const c = getContent(contentId);
    expectStage(c, 'agendado');
    if (!system) assertActor(actor, c, 'agendamento');
    update('contents', { id: c.id }, { published_at: at || now(), external_post_id });
    log({ actor: actor?.id, kind: system ? 'integracao' : undefined, action: 'conteudo.publicado', entity: 'content', id: c.id, client: c.client_id, content: c.id, visibility: 'client', summary: `Publicação confirmada${external_post_id ? ` (post ${external_post_id})` : ''}` });
    return enterStage(c, 'publicado', actor, { reason: 'publicado' });
  });
}

// Bloqueio / desbloqueio (ex.: "Pendente por material" — agora com motivo obrigatório)
export function blockContent(contentId, reason, waitingOn, actor, opt = {}) {
  if (!reason?.trim()) throw new HttpError(422, 'Informe o motivo do bloqueio (o que falta, de quem).');
  const c = getContent(contentId);
  if (actor) assertActor(actor, c, 'equipe');
  update('contents', { id: c.id }, { blocked: 1, block_reason: reason, waiting_on: waitingOn || 'equipe', updated_at: now() });
  log({ actor: actor?.id, action: 'conteudo.bloqueado', entity: 'content', id: c.id, client: c.client_id, content: c.id, summary: `Bloqueado: ${reason} (aguardando ${waitingOn || 'equipe'})` });
  if (waitingOn === 'cliente') {
    automation('material.pendente', { entity: 'content', id: c.id, client: c.client_id, detail: reason });
    notify(clientUsers(c.client_id), { level: 'atencao', type: 'material', title: 'Precisamos de um material seu', body: `${c.title}: ${reason}`, link: '/portal/projeto', groupKey: `material:${c.client_id}`, client: c.client_id });
  }
  if (!opt.silent) notify(ccUsers(), { level: 'atencao', type: 'bloqueio', title: `Conteúdo bloqueado`, body: `#${c.number} ${c.title}: ${reason}`, link: `/conteudos/${c.id}`, client: c.client_id, content: c.id, exclude: actor?.id });
}
export function unblockContent(contentId, actor, note) {
  const c = getContent(contentId);
  if (actor) assertActor(actor, c, 'equipe');
  update('contents', { id: c.id }, { blocked: 0, block_reason: null, waiting_on: null, material_status: c.material_status === 'aguardando' ? 'recebido' : c.material_status, updated_at: now() });
  log({ actor: actor?.id, action: 'conteudo.desbloqueado', entity: 'content', id: c.id, client: c.client_id, content: c.id, summary: `Desbloqueado${note ? `: ${note}` : ''}` });
  const assignees = all("SELECT assignee_id FROM tasks WHERE content_id=? AND status='aberta'", c.id).map((r) => r.assignee_id);
  notify(assignees, { level: 'info', type: 'desbloqueio', title: 'Conteúdo liberado para seguir', body: `#${c.number} ${c.title}${note ? ` — ${note}` : ''}`, link: `/conteudos/${c.id}`, content: c.id, client: c.client_id });
}
export function cancelContent(contentId, actor, reason) {
  return tx(() => {
    const c = getContent(contentId);
    if (!can(actor, 'conteudos', 'approve')) throw new HttpError(403, 'Sem permissão para cancelar.');
    run(`UPDATE tasks SET status='cancelada', completed_at=? WHERE content_id=? AND status IN ${LIVE_TASK}`, now(), c.id);
    log({ actor: actor.id, action: 'conteudo.cancelado', entity: 'content', id: c.id, client: c.client_id, content: c.id, summary: `Cancelado: ${reason || 'sem motivo informado'}` });
    return enterStage(c, 'cancelado', actor, { reason: reason || 'cancelado' });
  });
}
// Retorno controlado: equipe pode devolver um conteúdo para uma etapa anterior (com motivo; registrado)
export function returnToStage(contentId, actor, stage, reason) {
  return tx(() => {
    const c = getContent(contentId);
    if (!can(actor, 'conteudos', 'approve')) throw new HttpError(403, 'Sem permissão para devolver etapas.');
    if (!STAGES[stage] || STAGES[stage].final) throw new HttpError(422, 'Etapa inválida.');
    if (STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(c.stage)) throw new HttpError(422, 'Só é possível devolver para uma etapa anterior.');
    if (!reason?.trim()) throw new HttpError(422, 'Informe o motivo do retorno.');
    return enterStage(c, stage, actor, { reason: `devolvido: ${reason}` });
  });
}

// ── Movimento manual de etapa ────────────────────────────
// Toda a equipe vê; quem pode editar processos move. O sistema não assume que mover é erro: classifica,
// mostra o impacto antes, pede motivo quando o movimento é relevante e avisa quem precisa saber.
export const MOVE_KINDS = { normal: 'Movimento normal', manual: 'Avanço manual', retorno: 'Retorno', reabertura: 'Reabertura', correcao: 'Correção', excecao: 'Exceção', bloqueio: 'Bloqueio' };
const FLOW = ['cronograma', 'analise_cronograma', 'aprovacao_tema', 'producao', 'analise_producao', 'aprovacao_cliente', 'agendamento'];
const fmtDia = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
const liveAssignees = (contentId) => all(`SELECT DISTINCT u.name FROM tasks t JOIN users u ON u.id=t.assignee_id WHERE t.content_id=? AND t.status IN ${LIVE_TASK}`, contentId).map((r) => r.name);

export function movePreview(c, to, chosenKind) {
  if (!STAGES[to] || to === 'cancelado') throw new HttpError(422, 'Etapa inválida (para cancelar, use “Cancelar”).');
  if (to === c.stage) throw new HttpError(422, 'O conteúdo já está nesta etapa.');
  const iFrom = STAGE_ORDER.indexOf(c.stage), iTo = STAGE_ORDER.indexOf(to);
  const auto = STAGES[c.stage].final ? 'reabertura' : iTo < iFrom ? 'retorno' : iTo === iFrom + 1 ? 'manual' : 'excecao';
  const kind = ['correcao', 'excecao'].includes(chosenKind) ? chosenKind : auto;
  const impacts = [];
  // prazo de publicação: caminho mínimo da etapa de destino até o agendamento (SLA em dias úteis)
  if (c.planned_at && iTo < STAGE_ORDER.indexOf('agendado')) {
    const startIdx = FLOW.indexOf(to) >= 0 ? FLOW.indexOf(to) : FLOW.findIndex((k) => STAGE_ORDER.indexOf(k) > iTo);
    const days = (FLOW.includes(to) ? 0 : STAGES[to].sla || 0) + FLOW.slice(Math.max(startIdx, 0)).reduce((n, k) => n + (STAGES[k].sla || 0), 0);
    const ready = businessDaysFrom(new Date(now()), days);
    if (ready.toISOString() > c.planned_at) impacts.push({ type: 'prazo', level: 'alto', text: `Publicação de ${fmtDia(c.planned_at)} em risco: daqui até o agendamento são ~${days} dias úteis de etapas.` });
  }
  if (c.approved_version_id && iTo < STAGE_ORDER.indexOf('aprovacao_cliente')) impacts.push({ type: 'aprovacao', level: 'medio', text: 'O cliente já tinha aprovado: a aprovação precisará ser feita de novo.' });
  if (c.scheduled_at && iTo < STAGE_ORDER.indexOf('agendado')) impacts.push({ type: 'agendamento', level: 'alto', text: `Havia agendamento para ${fmtDia(c.scheduled_at)}: confira e desfaça na ferramenta de publicação, se for o caso.` });
  const opens = stageOpensAt(c, to);
  if (opens) impacts.push({ type: 'janela', level: 'info', text: `A etapa só abre em ${fmtDia(opens)}: a tarefa fica agendada até lá (sem atraso).` });
  if (c.blocked) impacts.push({ type: 'bloqueio', level: 'medio', text: `Continua bloqueado: ${c.block_reason}.` });
  const openAdj = one("SELECT COUNT(*) n FROM adjustments WHERE content_id=? AND status='aberto'", c.id).n;
  if (openAdj) impacts.push({ type: 'ajustes', level: 'info', text: `${openAdj} ajuste(s) em aberto continuam valendo.` });
  return { from: c.stage, from_label: STAGES[c.stage].label, to, to_label: STAGES[to].label, kind, kind_label: MOVE_KINDS[kind], auto_kind: auto,
    reason_required: kind !== 'manual', impacts, prev_assignees: liveAssignees(c.id) };
}

export function moveContent(contentId, actor, { to, reason, kind }) {
  if (!can(actor, 'processos', 'edit')) throw new HttpError(403, 'Sem permissão para mover etapas.');
  return tx(() => {
    const c = getContent(contentId);
    const pv = movePreview(c, to, kind);
    const why = String(reason || '').trim();
    if (pv.reason_required && !why) throw new HttpError(422, `${pv.kind_label}: informe o motivo do movimento.`);
    const prevIds = all(`SELECT DISTINCT assignee_id FROM tasks WHERE content_id=? AND status IN ${LIVE_TASK} AND assignee_id IS NOT NULL`, c.id).map((r) => r.assignee_id);
    enterStage(c, to, actor, { reason: `${pv.kind_label.toLowerCase()}${why ? `: ${why}` : ''}` });
    const newIds = all(`SELECT DISTINCT assignee_id FROM tasks WHERE content_id=? AND status IN ${LIVE_TASK} AND assignee_id IS NOT NULL`, c.id).map((r) => r.assignee_id);
    insert('stage_moves', { id: uid('sm_'), content_id: c.id, client_id: c.client_id, from_stage: c.stage, to_stage: to, kind: pv.kind, reason: why || null, actor_id: actor.id,
      prev_assignees: JSON.stringify(prevIds), new_assignees: JSON.stringify(newIds), impacts: JSON.stringify(pv.impacts), created_at: now() });
    automation('etapa.movida_manual', { entity: 'content', id: c.id, client: c.client_id, detail: `${pv.kind}: ${c.stage} → ${to}` });
    log({ actor: actor.id, action: 'etapa.movida', entity: 'content', id: c.id, client: c.client_id, content: c.id,
      summary: `#${c.number} ${pv.kind_label}: ${pv.from_label} → ${pv.to_label}${why ? ` — ${why}` : ''}`, before: c.stage, after: to });
    // quem precisa saber: quem estava com o conteúdo, quem passa a estar, e Operações se houver impacto
    const body = `#${c.number} ${c.title} · ${pv.from_label} → ${pv.to_label}${why ? ` · ${why}` : ''}`;
    const touched = [...new Set([...prevIds, ...newIds])].filter((id) => id !== actor.id);
    if (touched.length) notify(touched, { level: pv.kind === 'manual' ? 'info' : 'atencao', type: 'etapa_movida', title: `${pv.kind_label} por ${actor.name}`, body, link: `/conteudos/${c.id}`, client: c.client_id, content: c.id });
    if (pv.impacts.some((i) => i.level === 'alto')) notify(ccUsers().filter((id) => id !== actor.id), { level: 'atencao', type: 'etapa_movida', title: `Movimento com impacto: ${pv.impacts.filter((i) => i.level === 'alto').map((i) => i.type).join(', ')}`, body, link: `/conteudos/${c.id}`, client: c.client_id, content: c.id });
    return { ...pv, ok: true };
  });
}

// O que a etapa atual espera, de quem, e qual a próxima ação — usado em toda a interface.
export function nextAction(c) {
  const def = STAGES[c.stage];
  if (c.blocked) return { who: c.waiting_on, text: `Destravar: ${c.block_reason}` };
  const open = all("SELECT t.title, t.assignee_id, u.name FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.content_id=? AND t.status IN ('aberta','em_andamento')", c.id);
  if (def.final) return { who: null, text: def.label };
  const sched = !open.length && one("SELECT t.available_at, u.name FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.content_id=? AND t.status='agendada' ORDER BY t.available_at LIMIT 1", c.id);
  if (sched) return { who: sched.name || null, text: `Pronto para ${def.label.toLowerCase()} — a etapa abre em ${new Date(sched.available_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })}`, opens_at: sched.available_at };
  if (!open.length) return { who: null, text: def.action };
  const names = [...new Set(open.map((o) => o.name || 'SEM RESPONSÁVEL'))];
  return { who: names.join(', '), text: def.action, unassigned: open.some((o) => !o.assignee_id) };
}

// Risco operacional (limiares herdados da "Central de Clientes": 24/48/72h sem resposta; 5/3/2 dias até o prazo)
export function contentRisk(c) {
  if (STAGES[c.stage].final) return { level: 'nenhum', reasons: [] };
  const reasons = [];
  let score = 0;
  const t = Date.now();
  // herdado da migração: o prazo foi calculado na importação — não é "prazo vencido" até ser classificado
  const tasks = all("SELECT due_at, assignee_id, kind FROM tasks WHERE content_id=? AND status IN ('aberta','em_andamento') AND (perf_status IS NULL OR perf_status NOT IN ('migrado','excluido'))", c.id);
  const overdue = tasks.filter((x) => x.due_at && new Date(x.due_at).getTime() < t);
  if (overdue.length) { score += 3; reasons.push('Prazo da etapa vencido'); }
  else if (tasks.some((x) => x.due_at && new Date(x.due_at).getTime() - t < 24 * 3600e3)) { score += 1; reasons.push('Prazo vence em menos de 24h'); }
  if (tasks.some((x) => !x.assignee_id)) { score += 3; reasons.push('Tarefa sem responsável'); }
  if (c.blocked) { score += 2; reasons.push(`Bloqueado: ${c.block_reason}`); }
  const hours = (t - new Date(c.stage_entered_at).getTime()) / 3600e3;
  if (STAGES[c.stage].lane === 'cliente') {
    if (hours > 72) { score += 2; reasons.push('Cliente sem resposta há mais de 72h'); } else if (hours > 48) { score += 1; reasons.push('Cliente sem resposta há mais de 48h'); }
  }
  if (c.planned_at) {
    const days = (new Date(c.planned_at).getTime() - t) / 864e5;
    const idx = STAGE_ORDER.indexOf(c.stage);
    if (days < 0 && idx < STAGE_ORDER.indexOf('agendado')) { score += 4; reasons.push('Data de publicação já passou'); }
    else if (days < 2 && idx < STAGE_ORDER.indexOf('agendamento')) { score += 3; reasons.push('Publica em menos de 2 dias e ainda não foi aprovado'); }
    else if (days < 3 && idx < STAGE_ORDER.indexOf('aprovacao_cliente')) { score += 2; reasons.push('Publica em menos de 3 dias e ainda está em produção/revisão'); }
    else if (days < 5 && idx < STAGE_ORDER.indexOf('producao')) { score += 1; reasons.push('Publica em menos de 5 dias e o tema não foi aprovado'); }
  }
  if (c.revision_rounds + c.client_adjust_rounds >= 3) { score += 1; reasons.push(`Voltou para ajuste ${c.revision_rounds + c.client_adjust_rounds} vezes`); }
  const level = score >= 5 ? 'critico' : score >= 3 ? 'alto' : score >= 1 ? 'medio' : 'baixo';
  return { level, score, reasons };
}


// ═══════════ Ações do cliente além de aprovar/ajustar ═══════════
const hours = (iso) => (Date.now() - new Date(iso).getTime()) / 3600e3;
// Desfazer uma aprovação (like) — só enquanto nada irreversível aconteceu.
export function undoClientApproval(contentId, actor) {
  return tx(() => {
    const c = getContent(contentId);
    assertActor(actor, c, 'cliente');
    const last = one("SELECT * FROM approvals WHERE content_id=? AND kind IN ('cliente','tema') ORDER BY created_at DESC LIMIT 1", c.id);
    if (!last || last.decision !== 'aprovado' || last.user_id !== actor.id) throw new HttpError(409, 'Não há aprovação sua para desfazer neste conteúdo.');
    if (hours(last.created_at) > 24) throw new HttpError(409, 'A aprovação já foi processada pela equipe. Para mudar algo, comente pedindo ajuste.');
    if (last.kind === 'cliente') {
      if (c.stage !== 'agendamento' || c.scheduled_at) throw new HttpError(409, 'Este conteúdo já seguiu para agendamento. Para mudar algo, comente pedindo ajuste.');
      if (c.approved_version_id) update('content_versions', { id: c.approved_version_id }, { status: 'enviada_cliente', approved_by: null, approved_at: null });
      update('contents', { id: c.id }, { approved_version_id: null });
    } else {
      const started = one("SELECT 1 FROM tasks WHERE content_id=? AND stage='producao' AND (status='concluida' OR started_at IS NOT NULL)", c.id) || c.current_version_id;
      if (c.stage !== 'producao' || started) throw new HttpError(409, 'A produção deste tema já começou. Para mudar algo, comente pedindo ajuste.');
    }
    insert('approvals', { id: uid('ap_'), content_id: c.id, version_id: last.version_id, kind: last.kind, decision: 'desfeita', user_id: actor.id, note: 'Aprovação desfeita pelo cliente', created_at: now() });
    log({ actor: actor.id, action: 'cliente.desfez_aprovacao', entity: 'content', id: c.id, client: c.client_id, content: c.id, visibility: 'client', summary: `${actor.name} desfez a aprovação` });
    const team = all("SELECT DISTINCT user_id FROM client_members WHERE client_id=? AND function IN ('estrategia','atendimento','agendamento')", c.client_id).map((r) => r.user_id);
    notify(team, { level: 'atencao', type: 'aprovacao_desfeita', title: 'Cliente desfez uma aprovação', body: `#${c.number} ${c.title}`, link: `/conteudos/${c.id}`, content: c.id, client: c.client_id });
    return enterStage(c, last.kind === 'cliente' ? 'aprovacao_cliente' : 'aprovacao_tema', actor, { reason: 'aprovação desfeita pelo cliente' });
  });
}

// Pedido de ajuste vindo do cliente em qualquer momento visível a ele:
//  · aguardando aprovação → ajuste normal;  · já em ajuste → soma um item à rodada;
//  · já aprovado (agendamento/agendado) → reabre: ajuste → nova versão → revisão → NOVA aprovação do cliente.
export function clientAdjustmentRequest(contentId, actor, { note, carousel_page = null, video_timestamp = null, aspect = null, region = null }, req) {
  return tx(() => {
    const c = getContent(contentId);
    assertActor(actor, c, 'cliente');
    if (!note?.trim()) throw new HttpError(422, 'Explique o ajuste necessário.');
    if (['aprovacao_tema', 'aprovacao_cliente'].includes(c.stage)) return { mode: 'ajuste', content: clientDecision(c.id, actor, { decision: 'ajuste', note, carousel_page, video_timestamp, aspect, region }, req) };
    if (c.stage === 'ajuste_cliente' || c.stage === 'revisao_ajuste') {
      const reap = roundNeedsReapproval(c.id) ? 1 : 0;
      if (c.stage === 'revisao_ajuste') enterStage(c, 'ajuste_cliente', actor, { reason: 'novo pedido do cliente durante o ajuste' });
      const adj = createAdjustment(one('SELECT * FROM contents WHERE id=?', c.id), actor, { description: note, origin: 'cliente', aspect, carousel_page, video_timestamp, region, reapproval: reap });
      return { mode: 'ajuste_adicional', adjustment: adj, content: one('SELECT * FROM contents WHERE id=?', c.id) };
    }
    if (['agendamento', 'agendado'].includes(c.stage)) {
      const v = currentVersion(c.id);
      insert('approvals', { id: uid('ap_'), content_id: c.id, version_id: v?.id || null, kind: 'cliente', decision: 'ajuste', user_id: actor.id, note, ip: req?.ip, user_agent: req?.headers?.['user-agent']?.slice(0, 200), created_at: now() });
      update('contents', { id: c.id }, { approved_version_id: null, scheduled_at: null, schedule_mode: null, client_adjust_rounds: c.client_adjust_rounds + 1, updated_at: now() });
      log({ actor: actor.id, action: 'cliente.ajuste_pos_aprovacao', entity: 'content', id: c.id, client: c.client_id, content: c.id, visibility: 'client', summary: `Ajuste solicitado após a aprovação da V${v?.number} — nova versão volta para aprovação` });
      const next = enterStage(c, 'ajuste_cliente', actor, { reason: 'ajuste pedido após aprovação' });
      const adj = createAdjustment(next, actor, { description: note, origin: 'cliente', aspect, carousel_page, video_timestamp, region, reapproval: 1 });
      const team = all("SELECT DISTINCT user_id FROM client_members WHERE client_id=? AND function IN ('estrategia','atendimento','agendamento')", c.client_id).map((r) => r.user_id);
      notify(team, { level: 'urgente', type: 'ajuste_pos_aprovacao', title: 'Ajuste pedido em conteúdo já aprovado', body: `#${c.number} ${c.title}: ${note.slice(0, 120)}${c.stage === 'agendado' ? ' — o agendamento foi suspenso.' : ''}`, link: `/conteudos/${c.id}`, content: c.id, client: c.client_id });
      notify(actor.id, { level: 'info', type: 'ajuste_recebido', title: 'Seu ajuste foi recebido pela equipe.', body: `${c.title} — a nova versão volta para você aprovar.`, link: '/portal/conteudos', client: c.client_id });
      return { mode: 'reaberto', adjustment: adj, content: one('SELECT * FROM contents WHERE id=?', c.id) };
    }
    throw new HttpError(409, c.stage === 'publicado' ? 'Este conteúdo já foi publicado. Seu comentário foi enviado à equipe.' : 'Este conteúdo ainda está com a equipe.');
  });
}
