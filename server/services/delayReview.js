// CLASSIFICAÇÃO OPERACIONAL DE ATRASOS — atraso não é, por si só, atraso da responsável.
// A regra levanta só FATOS (cada um com a fonte). Quem decide a categoria é uma pessoa com permissão "atrasos".
// Até ser classificado, item herdado da migração NÃO alimenta nenhum indicador de desempenho (ver PERF_SQL).
import { one, all, run, insert, update, now, parseJSON, tx } from '../db.js';
import { log } from '../lib/core.js';
import { HttpError } from '../lib/permissions.js';
import { STAGES, setting, cancelContent } from '../engine/process.js';

export const CATEGORIES = {
  atraso_cliente: { label: 'Atraso do cliente', attribution: 'cliente' },
  aguardando_cliente: { label: 'Aguardando cliente', attribution: 'cliente' },
  atraso_equipe: { label: 'Atraso da equipe', attribution: 'equipe' },
  atraso_responsavel: { label: 'Atraso do responsável', attribution: 'responsavel' },
  processo_antigo: { label: 'Processo antigo', attribution: 'nao_atribuido' },
  dado_migrado: { label: 'Dado migrado', attribution: 'nao_atribuido' },
  responsabilidade_alterada: { label: 'Responsabilidade alterada', attribution: 'nao_atribuido' },
  sem_contexto: { label: 'Sem contexto', attribution: 'nao_atribuido' },
  reprogramado: { label: 'Reprogramado', attribution: 'nao_atribuido' },
  cancelado: { label: 'Cancelado', attribution: 'nao_atribuido' },
  outro: { label: 'Outro', attribution: 'nao_atribuido' },
};
export const ATTRIBUTIONS = { nao_atribuido: 'Não atribuído', cliente: 'Cliente', equipe: 'Equipe', responsavel: 'Responsável' };
// perf_status da tarefa conforme a atribuição: só "responsavel" entra em indicador individual; "equipe" só no agregado da equipe
const PERF_OF = { responsavel: 'individual', equipe: 'equipe', cliente: 'excluido', nao_atribuido: 'excluido' };

// Filtros para qualquer métrica de desempenho/atraso. Tarefa nascida na plataforma (perf_status NULL) conta;
// herdada e não classificada (migrado) ou classificada como não atribuível (excluido) não conta.
export const PERF_SQL = {
  individual: (a = 't') => `(${a}.perf_status IS NULL OR ${a}.perf_status='individual')`,
  equipe: (a = 't') => `(${a}.perf_status IS NULL OR ${a}.perf_status IN ('individual','equipe'))`,
};

const IMPORT_TAG = '%importado-notion-%';
// Regra determinística: tarefa criada pelo sistema (sem autor) junto com um conteúdo importado do Notion = herdada da migração
export function markMigratedTasks() {
  return run(`UPDATE tasks SET perf_status='migrado' WHERE perf_status IS NULL AND created_by IS NULL AND content_id IN (SELECT id FROM contents WHERE strategy_tags LIKE ?)
    AND EXISTS (SELECT 1 FROM contents c WHERE c.id=tasks.content_id AND abs(julianday(tasks.created_at)-julianday(c.created_at))*86400 < 120)`, IMPORT_TAG).changes;
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
  const migrated = t.perf_status === 'migrado' || /^Importado do Notion/.test(notes);
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

// Mantém uma linha de revisão para cada tarefa herdada que já venceu (e para as que vencerem depois). Idempotente.
// Fatos são recalculados; categoria/atribuição de uma pessoa nunca são sobrescritas.
export function syncDelayReviews() {
  const ts = now();
  const rows = all(`SELECT t.* FROM tasks t WHERE t.perf_status='migrado' AND t.due_at < ? AND t.status IN ('aberta','em_andamento')
    UNION SELECT t.* FROM tasks t JOIN delay_reviews d ON d.task_id=t.id`, ts);
  let created = 0;
  for (const t of rows) {
    const facts = factsFor(t);
    const ex = one('SELECT task_id FROM delay_reviews WHERE task_id=?', t.id);
    if (ex) update('delay_reviews', { task_id: t.id }, { facts, updated_at: ts });
    else {
      insert('delay_reviews', { task_id: t.id, content_id: t.content_id, client_id: t.client_id, category: 'dado_migrado', attribution: 'nao_atribuido', facts, source_facts: [], created_at: ts, updated_at: ts });
      created++;
    }
  }
  return { total: rows.length, created };
}

const summaryOf = (d) => `${CATEGORIES[d.category]?.label || d.category} · ${ATTRIBUTIONS[d.attribution]}`;

export function classify(taskId, actor, { category, note }, ip) {
  const cat = CATEGORIES[category];
  if (!cat) throw new HttpError(422, 'Categoria inválida.');
  if (!String(note || '').trim()) throw new HttpError(422, 'Escreva a evidência ou o motivo da classificação.');
  if (cat.attribution === 'responsavel' && String(note).trim().length < 20) throw new HttpError(422, 'Atribuir atraso a uma pessoa exige a evidência descrita (prazo combinado, responsável na época e o que aconteceu).');
  return tx(() => {
    const d = one('SELECT * FROM delay_reviews WHERE task_id=?', taskId);
    if (!d) throw new HttpError(404, 'Item não encontrado.');
    const t = one('SELECT perf_status FROM tasks WHERE id=?', taskId);
    const next = { category, attribution: cat.attribution, decided_by: actor.id, decided_at: now(), note: String(note).trim(), updated_at: now() };
    update('delay_reviews', { task_id: taskId }, next);
    run('UPDATE tasks SET perf_status=? WHERE id=?', PERF_OF[cat.attribution], taskId);
    log({ actor: actor.id, action: 'atraso.classificado', entity: 'task', id: taskId, client: d.client_id, content: d.content_id, ip,
      summary: `Atraso classificado: ${summaryOf(next)} — ${next.note}`,
      before: JSON.stringify({ category: d.category, attribution: d.attribution, perf_status: t?.perf_status, decided_by: d.decided_by, note: d.note }),
      after: JSON.stringify({ category, attribution: cat.attribution, perf_status: PERF_OF[cat.attribution], note: next.note }) });
    return one('SELECT * FROM delay_reviews WHERE task_id=?', taskId);
  });
}

export function reschedule(taskId, actor, { due_at, note }, ip) {
  if (!due_at || Number.isNaN(new Date(due_at).getTime())) throw new HttpError(422, 'Informe a nova data.');
  if (new Date(due_at) < new Date()) throw new HttpError(422, 'A nova data precisa ser futura.');
  if (!String(note || '').trim()) throw new HttpError(422, 'Escreva o motivo da reprogramação.');
  return tx(() => {
    const t = one('SELECT * FROM tasks WHERE id=?', taskId);
    if (!t || !one('SELECT 1 FROM delay_reviews WHERE task_id=?', taskId)) throw new HttpError(404, 'Item não encontrado.');
    if (['concluida', 'cancelada'].includes(t.status)) throw new HttpError(409, 'Tarefa já encerrada.');
    const iso = new Date(due_at).toISOString();
    run('UPDATE tasks SET due_at=? WHERE id=?', iso, taskId);
    log({ actor: actor.id, action: 'tarefa.prazo_alterado', entity: 'task', id: taskId, client: t.client_id, content: t.content_id, ip,
      summary: `Prazo reprogramado na revisão de atrasos: ${fmtDT(t.due_at)} → ${fmtDT(iso)} — ${String(note).trim()}`, before: t.due_at, after: iso });
    const out = classify(taskId, actor, { category: 'reprogramado', note: `Reprogramado para ${fmtDT(iso)}: ${String(note).trim()}` }, ip);
    // O prazo novo foi definido por uma pessoa: daqui em diante a tarefa segue a regra normal (o atraso anterior continua não atribuído no histórico)
    run('UPDATE tasks SET perf_status=NULL WHERE id=?', taskId);
    return out;
  });
}

export function cancelItem(taskId, actor, { note }, ip) {
  if (!String(note || '').trim()) throw new HttpError(422, 'Escreva o motivo do cancelamento.');
  const d = one('SELECT * FROM delay_reviews WHERE task_id=?', taskId);
  if (!d) throw new HttpError(404, 'Item não encontrado.');
  if (!d.content_id) throw new HttpError(422, 'Item sem conteúdo.');
  return tx(() => {
    cancelContent(d.content_id, actor, `Revisão de atrasos: ${String(note).trim()}`); // checa permissão de cancelar conteúdo
    return classify(taskId, actor, { category: 'cancelado', note: String(note).trim() }, ip);
  });
}

export function listReviews() {
  const rows = all(`SELECT d.*, t.title task_title, t.status task_status, t.due_at, t.stage, t.perf_status, u.name assignee, cl.name client, c.number, c.title content_title, c.planned_at, c.stage content_stage, du.name decided_by_name
    FROM delay_reviews d JOIN tasks t ON t.id=d.task_id LEFT JOIN users u ON u.id=t.assignee_id LEFT JOIN clients cl ON cl.id=d.client_id LEFT JOIN contents c ON c.id=d.content_id LEFT JOIN users du ON du.id=d.decided_by
    ORDER BY (d.decided_by IS NOT NULL), cl.name, c.planned_at`);
  return rows.map((r) => ({ ...r, facts: parseJSON(r.facts, []), source_facts: parseJSON(r.source_facts, []), category_label: CATEGORIES[r.category]?.label, attribution_label: ATTRIBUTIONS[r.attribution] }));
}
export function historyOf(taskId) {
  return all("SELECT l.*, u.name actor_name FROM activity_logs l LEFT JOIN users u ON u.id=l.actor_id WHERE l.entity_type='task' AND l.entity_id=? AND l.action IN ('atraso.classificado','tarefa.prazo_alterado') ORDER BY l.created_at DESC", taskId);
}
// Mesmo filtro de PERF_SQL, para linhas de tarefa já carregadas
export const perfOK = {
  individual: (t) => !t.perf_status || t.perf_status === 'individual',
  equipe: (t) => !t.perf_status || ['individual', 'equipe'].includes(t.perf_status),
};
// Prazo vencido que não é atraso de ninguém: herdado sem classificação (migrado) ou classificado como não atribuível (excluido)
export const NOT_ATTRIB = ['migrado', 'excluido'];
export const isInherited = (t) => NOT_ATTRIB.includes(t.perf_status);

// BASE DE PERFORMANCE (estrutura preparada, sem score — decisão da CEO no Bloco 5).
// Evento válido = tarefa concluída que pode ser atribuída: nasceu na plataforma ou foi classificada como do responsável/equipe.
// Herdado da migração e não atribuível nunca entram. Nada aqui gera nota, ranking ou alerta sobre pessoas.
export function performanceBase() {
  const ev = all(`SELECT t.completed_by uid, COUNT(*) n, SUM(t.due_at IS NOT NULL AND t.completed_at <= t.due_at) no_prazo, SUM(t.due_at IS NOT NULL AND t.completed_at > t.due_at) com_atraso
    FROM tasks t WHERE t.status='concluida' AND t.completed_by IS NOT NULL AND ${PERF_SQL.individual('t')} GROUP BY t.completed_by`);
  const total = ev.reduce((s, r) => s + r.n, 0);
  const pending = one("SELECT COUNT(*) n FROM delay_reviews WHERE decided_by IS NULL").n;
  return { valid_events: total, people_with_events: ev.length, pending_classification: pending, score: null,
    status: total ? 'em_coleta' : 'dados_insuficientes',
    note: 'Score individual não implementado. A coleta usa só eventos operacionais válidos e classificados; itens herdados da migração ficam fora.' };
}
