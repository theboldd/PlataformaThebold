// ITENS LEGADOS (regra oficial 22) — os itens herdados de "Para agendamento" ficam como LEGADO / MIGRADO DO NOTION — NÃO VALIDADO.
// Não são pendência, atraso, tarefa ativa, carga, KPI, notificação nem aprovação. A regra só levanta FATOS (com a fonte);
// uma pessoa autorizada (permissão "atrasos") decide, item a item, uma de três ações: REPROGRAMAR · CANCELAR · MANTER COMO HISTÓRICO.
// Origem estrutural (regra 24): tasks.data_origin / contents.data_origin = notion | plataforma — é o que todos os cálculos usam.
import { one, all, run, insert, update, now, parseJSON, tx } from '../db.js';
import { log } from '../lib/core.js';
import { HttpError } from '../lib/permissions.js';
import { STAGES, setting, cancelContent, reopenLegacy } from '../engine/process.js';

export const DECISIONS = {
  nao_validado: 'Legado · não validado',
  reprogramado: 'Reprogramado (voltou à operação)',
  cancelado: 'Encerrado como cancelado',
  historico: 'Mantido como histórico',
};

// Performance, atraso e capacidade só com origem "plataforma" (regras 24 e 25). Mesmo filtro para SQL e para linhas carregadas.
// Tarefas de etapas já liberadas para publicação (publicação manual) também ficam fora: não são prazo operacional.
const RELEASED = ['agendamento', 'agendado', 'publicado'];
const relSQL = (a) => `COALESCE(${a}.stage,'') NOT IN (${RELEASED.map((s) => `'${s}'`).join(',')})`;
export const PERF_SQL = {
  individual: (a = 't') => `${a}.data_origin='plataforma' AND ${relSQL(a)}`,
  equipe: (a = 't') => `${a}.data_origin='plataforma' AND ${relSQL(a)}`,
};
const opTask = (t) => t.data_origin === 'plataforma' && !RELEASED.includes(t.stage);
export const perfOK = { individual: opTask, equipe: opTask };
export const isInherited = (t) => t.data_origin === 'notion';
export const NOT_ATTRIB = ['notion'];

const IMPORT_TAG = '%importado-notion-%';
// Origem estrutural, idempotente: conteúdo importado do Notion = notion; tarefa criada pelo sistema junto com um conteúdo importado = notion
export function markMigratedTasks() {
  run("UPDATE contents SET data_origin='notion' WHERE data_origin<>'notion' AND strategy_tags LIKE ?", IMPORT_TAG);
  const n = run(`UPDATE tasks SET perf_status=COALESCE(perf_status,'migrado'), data_origin='notion' WHERE data_origin<>'notion' AND (perf_status IS NOT NULL OR (created_by IS NULL AND content_id IN (SELECT id FROM contents WHERE strategy_tags LIKE ?)
    AND EXISTS (SELECT 1 FROM contents c WHERE c.id=tasks.content_id AND abs(julianday(tasks.created_at)-julianday(c.created_at))*86400 < 120)))`, IMPORT_TAG).changes;
  return n;
}

// Regra 18: os itens em revisão ainda sem decisão viram LEGADO — NÃO VALIDADO (tarefa sai da operação; conteúdo marcado).
// Cada item recebe o próprio registro (antes/depois). Idempotente.
export function markLegacy() {
  let n = 0;
  for (const d of all("SELECT d.*, t.status task_status, c.legacy_status FROM delay_reviews d JOIN tasks t ON t.id=d.task_id LEFT JOIN contents c ON c.id=d.content_id WHERE d.decided_by IS NULL AND (t.status IN ('aberta','em_andamento') OR c.legacy_status IS NULL)")) {
    tx(() => {
      run("UPDATE tasks SET status='legado' WHERE id=? AND status IN ('aberta','em_andamento')", d.task_id);
      if (d.content_id) run("UPDATE contents SET legacy_status='nao_validado' WHERE id=? AND legacy_status IS NULL", d.content_id);
      update('delay_reviews', { task_id: d.task_id }, { category: 'nao_validado', updated_at: now() });
      log({ kind: 'sistema', action: 'legado.marcado', entity: 'task', id: d.task_id, client: d.client_id, content: d.content_id, origin: 'automatica',
        summary: 'Item herdado de "Para agendamento" marcado como LEGADO / MIGRADO DO NOTION — NÃO VALIDADO (regra oficial 22): fora da operação até decisão individual',
        before: JSON.stringify({ task_status: d.task_status, legacy_status: d.legacy_status || null }), after: JSON.stringify({ task_status: 'legado', legacy_status: 'nao_validado' }) });
    });
    n++;
  }
  return n;
}

const fmtD = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }) : null);
const fmtDT = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null);
const fact = (k, label, value, source) => ({ k, label, value, source });

// Fatos a partir da base (funciona em qualquer ambiente). Nada é inferido: quando não há registro, o fato diz "sem registro".
export function factsFor(t) {
  const c = t.content_id ? one('SELECT * FROM contents WHERE id=?', t.content_id) : null;
  const cl = t.client_id ? one('SELECT name FROM clients WHERE id=?', t.client_id) : null;
  const who = t.assignee_id ? one('SELECT name, role_key FROM users WHERE id=?', t.assignee_id) : null;
  const notes = c?.internal_notes || '';
  const migrated = t.data_origin === 'notion' || /^Importado do Notion/.test(notes);
  const F = [];
  const head = notes.split('\n')[0];
  F.push(fact('origem', 'Origem', migrated ? `${head || 'Importado do Notion'} — criado na migração em ${fmtD(c?.created_at)}` : `Criado na plataforma em ${fmtD(t.created_at)}`, migrated ? 'contents.internal_notes' : 'tasks.created_at'));
  if (c?.reference?.startsWith('http')) F.push(fact('fonte', 'Card de origem', c.reference.split('#')[0], 'contents.reference'));
  F.push(fact('cliente', 'Cliente', cl?.name || 'Sem cliente', 'clients'));
  if (c) F.push(fact('conteudo', 'Conteúdo', `#${c.number} ${c.title}`, 'contents'));
  F.push(fact('etapa', 'Etapa', `${STAGES[t.stage]?.label || t.stage || '—'}${c && c.stage !== t.stage ? ` (conteúdo hoje em ${STAGES[c.stage]?.label || c.stage})` : ''}`, 'tasks.stage'));
  // Responsável atual e como foi definido
  const linked = t.assignee_id && t.client_id && one('SELECT 1 FROM client_members WHERE client_id=? AND user_id=? AND function=?', t.client_id, t.assignee_id, t.function);
  const fallbackRoles = t.function === 'agendamento' || t.function === 'atendimento' ? setting('agendamento_roles') : t.function === 'revisao' ? setting('revisores_padrao_roles') : [];
  const how = !who ? 'Sem responsável' : linked ? `vínculo do cliente na função “${t.function}” (Divisão)` : fallbackRoles.includes(who.role_key) ? `regra padrão da plataforma (perfil que cobre “${t.function}” quando o cliente não tem ninguém vinculado) — não veio do Notion` : 'atribuição direta';
  F.push(fact('responsavel_atual', 'Responsável atual', who ? `${who.name} — definido por ${how}` : 'Sem responsável', 'tasks.assignee_id + client_members'));
  // Responsável histórico e mudanças de responsabilidade
  const reassign = all("SELECT summary, created_at FROM activity_logs WHERE entity_type='task' AND entity_id=? AND action='tarefa.reatribuida' ORDER BY created_at", t.id);
  const moves = c ? all('SELECT from_stage, to_stage, kind, created_at FROM stage_moves WHERE content_id=? ORDER BY created_at', c.id) : [];
  F.push(fact('responsavel_historico', 'Responsável histórico', migrated ? 'Sem registro: o quadro do Notion não tem campo de responsável por card' : 'Sem registro anterior', migrated ? 'export do quadro (propriedades: Nome, Cronograma, Selecionar)' : 'activity_logs'));
  F.push(fact('mudanca_responsabilidade', 'Mudança de responsabilidade', reassign.length ? reassign.map((r) => `${fmtD(r.created_at)}: ${r.summary}`).join(' · ') : 'Nenhuma registrada', 'activity_logs (tarefa.reatribuida)'));
  if (moves.length) F.push(fact('movimentos', 'Movimentos manuais de etapa', moves.map((m) => `${fmtD(m.created_at)} ${m.from_stage}→${m.to_stage} (${m.kind})`).join(' · '), 'stage_moves'));
  // Datas
  const post = notes.match(/Post citado no Notion: .*? · (\d{4}-\d{2}-\d{2})/);
  F.push(fact('data_original', 'Data original de postagem', c?.planned_at ? `${fmtD(c.planned_at)}${post ? ' (data do post no Notion)' : ''}` : 'Sem data no Notion', post ? 'post do Notion citado no card' : 'contents.planned_at'));
  if (migrated && c?.planned_at && c.planned_at < c.created_at) F.push(fact('data_passada', 'Data já passada na migração', `A data de postagem (${fmtD(c.planned_at)}) já tinha passado quando o item foi importado (${fmtD(c.created_at)}).`, 'contents.planned_at × contents.created_at'));
  if (c?.planned_at && t.due_at && t.due_at < c.planned_at) F.push(fact('antes_postagem', 'Prazo × data de postagem', `O prazo da tarefa (${fmtD(t.due_at)}) é anterior à data de postagem (${fmtD(c.planned_at)}).${c.planned_at > now() ? ' A data de postagem ainda não chegou.' : ''}`, 'tasks.due_at × contents.planned_at'));
  F.push(fact('prazo', 'Prazo da tarefa', t.due_at ? `${fmtDT(t.due_at)} — ${migrated ? 'calculado pela plataforma no momento da migração (prazo padrão da etapa); não é um prazo combinado no Notion' : 'calculado pela regra da etapa'}` : 'Sem prazo', 'tasks.due_at + engine dueFor'));
  // Motivo / dependências: só o que está escrito
  const quotes = notes.split('\n').map((l) => l.trim()).filter((l) => /aguardando|falta(m)? (material|foto|video|vídeo)|material d[ao] client|pendente por material|enviou|mandou/i.test(l) && !/^(Importado|Card:|Item da lista|Post citado|Sem post|Legendas do mês|Observação da extração|https?:)/.test(l));
  F.push(fact('motivo', 'Motivo do atraso', 'Sem registro', 'contents, tasks, activity_logs'));
  F.push(fact('dep_cliente', 'Dependia do cliente', c?.blocked && c.waiting_on === 'cliente' ? `Sim — bloqueado aguardando cliente: ${c.block_reason || 'sem motivo escrito'}` : 'Sem registro', 'contents.blocked'));
  if (quotes.length) F.push(fact('mencoes', 'Trechos do card de origem sobre espera ou material', `${quotes.map((q) => `“${q}”`).join(' / ')} — o texto é do card inteiro do cliente; não diz a qual conteúdo se refere nem confirma a causa`, 'texto do card de origem (Notion)'));
  F.push(fact('dep_equipe', 'Dependia da equipe', c?.blocked && c.waiting_on === 'equipe' ? `Sim — ${c.block_reason || 'sem motivo escrito'}` : 'Sem registro', 'contents.blocked'));
  F.push(fact('processo_antigo', 'Veio do processo antigo do Notion', migrated ? 'Sim' : 'Não', 'contents.strategy_tags'));
  const after = c ? one("SELECT COUNT(*) n FROM activity_logs WHERE content_id=? AND origin='manual' AND created_at > ?", c.id, c.created_at).n : 0;
  F.push(fact('pendente', 'Está realmente pendente', ['concluida', 'cancelada'].includes(t.status) ? `Não — tarefa ${t.status}` : c?.published_at ? 'Não — conteúdo publicado' : migrated && !after ? 'Não confirmado: ninguém mexeu neste item na plataforma desde a migração' : 'Sim, segundo a plataforma', 'tasks.status + activity_logs'));
  F.push(fact('evidencia_pessoa', 'Evidência para atribuir o atraso à pessoa', 'Não há', 'nenhum registro de prazo combinado, responsável histórico ou motivo'));
  return F;
}

// Atualiza só os FATOS das linhas existentes. Dado migrado não gera item novo automaticamente (regra 23).
export function syncDelayReviews() {
  const rows = all('SELECT t.* FROM tasks t JOIN delay_reviews d ON d.task_id=t.id');
  for (const t of rows) update('delay_reviews', { task_id: t.id }, { facts: factsFor(t), updated_at: now() });
  return { total: rows.length, created: 0 };
}

function decide(taskId, actor, decision, note, extra, ip) {
  const d = one('SELECT * FROM delay_reviews WHERE task_id=?', taskId);
  if (!d) throw new HttpError(404, 'Item não encontrado.');
  if (d.decided_by) throw new HttpError(409, `Este item já foi decidido: ${DECISIONS[d.category] || d.category}.`);
  const c = d.content_id ? one('SELECT stage, legacy_status FROM contents WHERE id=?', d.content_id) : null;
  const t = one('SELECT status, assignee_id, due_at FROM tasks WHERE id=?', taskId);
  const before = { decision: d.category, task_status: t?.status, content_stage: c?.stage, legacy_status: c?.legacy_status };
  extra?.();
  const c2 = d.content_id ? one('SELECT stage, legacy_status FROM contents WHERE id=?', d.content_id) : null;
  update('delay_reviews', { task_id: taskId }, { category: decision, decided_by: actor.id, decided_at: now(), note, updated_at: now() });
  log({ actor: actor.id, action: `legado.${decision}`, entity: 'task', id: taskId, client: d.client_id, content: d.content_id, ip,
    summary: `Item legado: ${DECISIONS[decision]}${note ? ` — ${note}` : ''}`, before: JSON.stringify(before),
    after: JSON.stringify({ decision, task_status: one('SELECT status FROM tasks WHERE id=?', taskId)?.status, content_stage: c2?.stage, legacy_status: c2?.legacy_status }) });
  return one('SELECT * FROM delay_reviews WHERE task_id=?', taskId);
}

// REPROGRAMAR: volta à operação como demanda válida (novas tarefas nascem na plataforma). Exige prazo, responsável, etapa e motivo.
export function reprogramLegacy(taskId, actor, { due_at, assignee_id, stage, note } = {}, ip) {
  if (!due_at || Number.isNaN(new Date(due_at).getTime()) || new Date(due_at) < new Date()) throw new HttpError(422, 'Informe um novo prazo futuro.');
  if (!assignee_id || !one("SELECT 1 FROM users WHERE id=? AND active=1 AND role_key<>'cliente'", assignee_id)) throw new HttpError(422, 'Escolha o responsável (pessoa ativa da equipe).');
  if (!STAGES[stage] || ['cancelado', 'publicado'].includes(stage)) throw new HttpError(422, 'Escolha a etapa em que o item volta.');
  if (!String(note || '').trim()) throw new HttpError(422, 'Escreva o contexto/motivo da reabertura.');
  return tx(() => {
    const d = one('SELECT * FROM delay_reviews WHERE task_id=?', taskId);
    if (!d?.content_id) throw new HttpError(404, 'Item não encontrado.');
    return decide(taskId, actor, 'reprogramado', String(note).trim(), () => reopenLegacy(d.content_id, actor, { stage, assignee_id, due_at: new Date(due_at).toISOString(), reason: String(note).trim() }), ip);
  });
}
// ENCERRAR COMO CANCELADO: ação explícita (permissão de cancelar conteúdo), com motivo e antes/depois
export function cancelLegacy(taskId, actor, { note } = {}, ip) {
  if (!String(note || '').trim()) throw new HttpError(422, 'Escreva o motivo do cancelamento.');
  return tx(() => {
    const d = one('SELECT * FROM delay_reviews WHERE task_id=?', taskId);
    if (!d?.content_id) throw new HttpError(404, 'Item não encontrado.');
    return decide(taskId, actor, 'cancelado', String(note).trim(), () => {
      cancelContent(d.content_id, actor, `Item legado encerrado: ${String(note).trim()}`);
      run("UPDATE contents SET legacy_status='cancelado' WHERE id=?", d.content_id);
    }, ip);
  });
}
// MANTER COMO HISTÓRICO: preservado e totalmente fora da operação
export function keepAsHistory(taskId, actor, { note } = {}, ip) {
  return tx(() => {
    const d = one('SELECT * FROM delay_reviews WHERE task_id=?', taskId);
    if (!d) throw new HttpError(404, 'Item não encontrado.');
    return decide(taskId, actor, 'historico', String(note || '').trim() || null, () => { if (d.content_id) run("UPDATE contents SET legacy_status='historico' WHERE id=?", d.content_id); }, ip);
  });
}

export function listReviews() {
  const rows = all(`SELECT d.*, t.title task_title, t.status task_status, t.due_at, t.stage, t.perf_status, u.name assignee, cl.name client, c.number, c.title content_title, c.planned_at, c.stage content_stage, du.name decided_by_name
    FROM delay_reviews d JOIN tasks t ON t.id=d.task_id LEFT JOIN users u ON u.id=t.assignee_id LEFT JOIN clients cl ON cl.id=d.client_id LEFT JOIN contents c ON c.id=d.content_id LEFT JOIN users du ON du.id=d.decided_by
    ORDER BY (d.decided_by IS NOT NULL), cl.name, c.planned_at`);
  return rows.map((r) => ({ ...r, facts: parseJSON(r.facts, []), source_facts: parseJSON(r.source_facts, []), decision: r.decided_by ? r.category : 'nao_validado', decision_label: DECISIONS[r.decided_by ? r.category : 'nao_validado'] }));
}
export function historyOf(taskId) {
  return all("SELECT l.*, u.name actor_name FROM activity_logs l LEFT JOIN users u ON u.id=l.actor_id WHERE l.entity_type='task' AND l.entity_id=? AND (l.action LIKE 'legado.%' OR l.action IN ('atraso.classificado','tarefa.prazo_alterado')) ORDER BY l.created_at DESC", taskId);
}
// BASE DE PERFORMANCE (estrutura preparada, sem score — decisão da CEO no Bloco 5).
// Evento válido = tarefa concluída que pode ser atribuída: nasceu na plataforma ou foi classificada como do responsável/equipe.
// Herdado da migração e não atribuível nunca entram. Nada aqui gera nota, ranking ou alerta sobre pessoas.
export function performanceBase() {
  const ev = all(`SELECT t.completed_by uid, COUNT(*) n, SUM(t.due_at IS NOT NULL AND t.completed_at <= t.due_at) no_prazo, SUM(t.due_at IS NOT NULL AND t.completed_at > t.due_at) com_atraso
    FROM tasks t WHERE t.status='concluida' AND t.completed_by IS NOT NULL AND ${PERF_SQL.individual('t')} GROUP BY t.completed_by`);
  const total = ev.reduce((s, r) => s + r.n, 0);
  const pending = one("SELECT COUNT(*) n FROM delay_reviews WHERE decided_by IS NULL").n; // legados não validados: nunca entram
  return { valid_events: total, people_with_events: ev.length, pending_classification: pending, score: null,
    status: total ? 'em_coleta' : 'dados_insuficientes',
    note: 'Score individual não implementado. A coleta usa só eventos operacionais válidos e classificados; itens herdados da migração ficam fora.' };
}
