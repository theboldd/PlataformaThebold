// SOLICITAÇÕES DO CLIENTE ("+ NOVA SOLICITAÇÃO")
// Enviar → criar solicitação → associar ao cliente → registrar solicitante e data → atribuir responsável por tipo →
// criar tarefa → definir status → notificar equipe → histórico. O cliente vê só a linguagem simples (RECEBIDO … CONCLUÍDO).
import { one, all, insert, update, run, uid, now, tx, nextNumber } from '../db.js';
import { log, notify, businessDaysFrom, userName } from '../lib/core.js';
import { HttpError } from '../lib/permissions.js';
import { resolveAssignee, clientUsers, NOT_LEGACY, PLATFORM_CONTENT } from '../engine/process.js';
import { automation } from '../engine/automations.js';
import { offerSatisfaction } from './satisfaction.js';

export const REQUEST_KINDS = {
  conteudo: { label: 'Conteúdo', fn: 'estrategia', days: 2 }, alteracao: { label: 'Alteração', fn: 'estrategia', days: 2 },
  material: { label: 'Material', fn: 'atendimento', days: 2 }, duvida: { label: 'Dúvida', fn: 'atendimento', days: 1 },
  reuniao: { label: 'Reunião', fn: 'atendimento', days: 1 }, estrategia: { label: 'Estratégia', fn: 'estrategia', days: 3 },
  financeiro: { label: 'Financeiro', fn: 'financeiro', days: 2 }, outro: { label: 'Outro', fn: 'atendimento', days: 2 },
};
export const REQUEST_STATUS = { recebido: 'Recebido', em_analise: 'Em análise', em_andamento: 'Em andamento', aguardando_cliente: 'Aguardando você', concluido: 'Concluído', cancelado: 'Cancelado' };
const OPEN = ['recebido', 'em_analise', 'em_andamento', 'aguardando_cliente'];

function ownerFor(clientId, kind) {
  const fn = REQUEST_KINDS[kind].fn;
  if (fn === 'financeiro') return one("SELECT id FROM users WHERE active=1 AND role_key='comercial' ORDER BY created_at LIMIT 1")?.id || one("SELECT id FROM users WHERE active=1 AND role_key='ceo' LIMIT 1")?.id || null;
  return resolveAssignee(clientId, fn) || resolveAssignee(clientId, 'atendimento');
}
const teamOf = (clientId) => all("SELECT DISTINCT user_id FROM client_members WHERE client_id=? AND function IN ('estrategia','atendimento')", clientId).map((r) => r.user_id);

export function createRequest(clientId, actor, { kind, title, description, ref_type = null, ref_id = null, file_id = null }) {
  if (!REQUEST_KINDS[kind]) throw new HttpError(422, 'Escolha o tipo da solicitação.');
  title = String(title || '').trim(); description = String(description || '').trim();
  if (!title && !description) throw new HttpError(422, 'Conte o que você precisa.');
  if (!title) title = description.split('\n')[0].slice(0, 90);
  if (title.length > 160 || description.length > 8000) throw new HttpError(422, 'Texto muito longo.');
  // Regras 22–24: a solicitação só se vincula a conteúdo operacional da plataforma — nunca a dado migrado ou legado
  if (ref_type === 'conteudo' && ref_id && !one(`SELECT 1 FROM contents WHERE id=? AND client_id=? AND ${PLATFORM_CONTENT()} AND ${NOT_LEGACY()}`, ref_id, clientId)) throw new HttpError(404, 'Conteúdo não encontrado.');
  const client = one('SELECT name FROM clients WHERE id=?', clientId);
  const ts = now();
  const owner = ownerFor(clientId, kind);
  const expected = businessDaysFrom(new Date(ts), REQUEST_KINDS[kind].days); expected.setHours(21, 0, 0, 0);
  const r = tx(() => {
    const r = insert('client_requests', { id: uid('rq_'), number: nextNumber('request'), client_id: clientId, kind, title, description: description || null, status: 'recebido', assigned_to: owner,
      next_action: 'A The Bold vai analisar sua solicitação.', expected_at: expected.toISOString(), ref_type, ref_id, requested_by: actor.id, created_at: ts, updated_at: ts });
    const t = insert('tasks', { id: uid('t_'), title: `Solicitação do cliente (${REQUEST_KINDS[kind].label}) — ${title}`.slice(0, 200), description: description || null, client_id: clientId, content_id: ref_type === 'conteudo' ? ref_id : null,
      function: REQUEST_KINDS[kind].fn, assignee_id: owner, status: 'aberta', kind: 'solicitacao', origin: 'automacao', source_type: 'client_request', source_id: r.id, priority: kind === 'alteracao' ? 'alta' : 'media',
      due_at: expected.toISOString(), created_by: actor.id, created_at: ts });
    update('client_requests', { id: r.id }, { task_id: t.id });
    insert('client_request_updates', { id: uid('ru_'), request_id: r.id, author_id: actor.id, body: description || title, status_to: 'recebido', file_id, visibility: 'client', created_at: ts });
    return one('SELECT * FROM client_requests WHERE id=?', r.id);
  });
  log({ actor: actor.id, action: 'solicitacao.criada', entity: 'client_request', id: r.id, client: clientId, content: ref_type === 'conteudo' ? ref_id : null, visibility: 'client', summary: `Solicitação enviada: ${title}` });
  log({ kind: 'sistema', action: 'solicitacao.atribuida', entity: 'client_request', id: r.id, client: clientId, summary: `Solicitação #${r.number} (${REQUEST_KINDS[kind].label}) atribuída a ${userName(owner) || 'SEM RESPONSÁVEL'}` });
  automation('solicitacao.criada', { entity: 'client_request', id: r.id, client: clientId, detail: kind });
  notify([owner, ...teamOf(clientId)], { level: kind === 'alteracao' ? 'atencao' : 'info', type: 'solicitacao', title: `${client.name}: nova solicitação (${REQUEST_KINDS[kind].label})`, body: title, link: `/clientes/${clientId}?tab=solicitacoes&r=${r.id}`, client: clientId, exclude: actor.id });
  if (!owner) notify(all("SELECT id FROM users WHERE active=1 AND role_key IN ('operacoes','ceo')").map((x) => x.id), { level: 'urgente', type: 'sem_responsavel', title: 'Solicitação sem responsável', body: `${client.name}: ${title}`, link: `/clientes/${clientId}?tab=solicitacoes&r=${r.id}`, client: clientId });
  return r;
}

// Visão do cliente: status simples + última atualização + próxima ação + prazo esperado. Atualizações internas nunca saem daqui.
export function requestForClient(r) {
  const updates = all("SELECT u.id, u.body, u.status_to, u.created_at, u.file_id, us.name author_name, us.role_key='cliente' is_client FROM client_request_updates u LEFT JOIN users us ON us.id=u.author_id WHERE u.request_id=? AND u.visibility='client' ORDER BY u.created_at", r.id)
    .map((u) => ({ ...u, is_client: !!u.is_client, author_name: u.is_client ? u.author_name : 'The Bold' }));
  return { id: r.id, number: r.number, kind: r.kind, kind_label: REQUEST_KINDS[r.kind]?.label, title: r.title, description: r.description, status: r.status, status_label: REQUEST_STATUS[r.status],
    next_action: r.next_action, expected_at: OPEN.includes(r.status) ? r.expected_at : null, updated_at: r.updated_at, created_at: r.created_at, closed_at: r.closed_at,
    // responsável só quando apropriado: o primeiro nome de quem cuida do atendimento/estratégia do cliente
    owner: r.assigned_to && one("SELECT 1 FROM client_members WHERE client_id=? AND user_id=? AND function IN ('estrategia','atendimento')", r.client_id, r.assigned_to) ? userName(r.assigned_to)?.split(' ')[0] : null,
    ref: r.ref_type === 'conteudo' && r.ref_id ? one('SELECT id, title FROM contents WHERE id=?', r.ref_id) : null, updates };
}

// Equipe atualiza: status, próxima ação, prazo, responsável, resposta ao cliente (visível) ou nota interna
export function updateRequest(id, actor, { status, next_action, expected_at, assigned_to, message, internal_note }) {
  const r = one('SELECT * FROM client_requests WHERE id=?', id);
  if (!r) throw new HttpError(404, 'Solicitação não encontrada.');
  if (status && !REQUEST_STATUS[status]) throw new HttpError(422, 'Status inválido.');
  if (status === 'aguardando_cliente' && !String(next_action || message || '').trim()) throw new HttpError(422, 'Diga ao cliente o que você precisa dele (próxima ação ou mensagem).');
  const ts = now();
  const patch = { updated_at: ts };
  if (status && status !== r.status) { patch.status = status; if (['concluido', 'cancelado'].includes(status)) patch.closed_at = ts; else patch.closed_at = null; }
  if (next_action !== undefined) patch.next_action = String(next_action || '').trim() || null;
  if (expected_at !== undefined) patch.expected_at = expected_at ? new Date(expected_at).toISOString() : null;
  if (assigned_to !== undefined && assigned_to !== r.assigned_to) patch.assigned_to = assigned_to || null;
  tx(() => {
    update('client_requests', { id }, patch);
    if (message?.trim() || patch.status) insert('client_request_updates', { id: uid('ru_'), request_id: id, author_id: actor.id, body: message?.trim() || null, status_from: r.status, status_to: patch.status || null, visibility: 'client', created_at: ts });
    if (internal_note?.trim()) insert('client_request_updates', { id: uid('ru_'), request_id: id, author_id: actor.id, body: internal_note.trim(), visibility: 'internal', created_at: ts });
    if (patch.assigned_to !== undefined && r.task_id) run('UPDATE tasks SET assignee_id=? WHERE id=?', patch.assigned_to, r.task_id);
    if (['concluido', 'cancelado'].includes(patch.status) && r.task_id) run("UPDATE tasks SET status=?, completed_at=?, completed_by=? WHERE id=? AND status IN ('aberta','em_andamento')", patch.status === 'concluido' ? 'concluida' : 'cancelada', ts, actor.id, r.task_id);
    if (patch.status && OPEN.includes(patch.status) && ['concluido', 'cancelado'].includes(r.status) && r.task_id) run("UPDATE tasks SET status='aberta', completed_at=NULL WHERE id=?", r.task_id);
  });
  const st = patch.status ? REQUEST_STATUS[patch.status] : null;
  log({ actor: actor.id, action: 'solicitacao.atualizada', entity: 'client_request', id, client: r.client_id, visibility: patch.status || message?.trim() ? 'client' : 'internal',
    summary: `Solicitação “${r.title}”${st ? ` — ${st.toLowerCase()}` : message?.trim() ? ' — nova resposta da The Bold' : ' — atualizada'}`, before: r.status, after: patch.status || r.status });
  if (patch.assigned_to) notify(patch.assigned_to, { level: 'info', type: 'solicitacao', title: 'Solicitação atribuída a você', body: r.title, link: `/clientes/${r.client_id}?tab=solicitacoes&r=${id}`, client: r.client_id, exclude: actor.id });
  // Cliente: só o que importa — aguardando você, resposta nova ou conclusão
  if (patch.status === 'aguardando_cliente') notify(clientUsers(r.client_id), { level: 'atencao', type: 'solicitacao', title: 'Sua solicitação precisa de você', body: `${r.title} — ${patch.next_action || message?.trim()}`, cta: 'Responder', link: `/portal/solicitacoes?r=${id}`, client: r.client_id });
  else if (patch.status === 'concluido') { notify(clientUsers(r.client_id), { level: 'info', type: 'solicitacao', title: 'Sua solicitação foi concluída', body: message?.trim() ? `${r.title} — ${message.trim().slice(0, 140)}` : r.title, cta: 'Ver', link: `/portal/solicitacoes?r=${id}`, client: r.client_id }); offerSatisfaction(r.client_id, 'solicitacao', id, `a solicitação “${r.title}”`); }
  else if (message?.trim()) notify(clientUsers(r.client_id), { level: 'info', type: 'solicitacao', title: 'Nova resposta na sua solicitação', body: `${r.title} — ${message.trim().slice(0, 140)}`, cta: 'Ver resposta', link: `/portal/solicitacoes?r=${id}`, client: r.client_id });
  return one('SELECT * FROM client_requests WHERE id=?', id);
}

// Cliente responde/complementa: se estava aguardando o cliente, volta para a equipe automaticamente
export function clientReply(id, clientId, actor, { body, file_id = null }) {
  const r = one('SELECT * FROM client_requests WHERE id=? AND client_id=?', id, clientId);
  if (!r) throw new HttpError(404, 'Solicitação não encontrada.');
  if (!String(body || '').trim() && !file_id) throw new HttpError(422, 'Escreva sua resposta.');
  if (['concluido', 'cancelado'].includes(r.status)) throw new HttpError(409, 'Esta solicitação já foi encerrada. Abra uma nova solicitação se precisar.');
  const ts = now();
  const back = r.status === 'aguardando_cliente';
  tx(() => {
    insert('client_request_updates', { id: uid('ru_'), request_id: id, author_id: actor.id, body: String(body || '').trim() || null, file_id, status_from: back ? r.status : null, status_to: back ? 'em_andamento' : null, visibility: 'client', created_at: ts });
    update('client_requests', { id }, { updated_at: ts, ...(back ? { status: 'em_andamento', next_action: 'A The Bold recebeu sua resposta e está dando continuidade.' } : {}) });
  });
  log({ actor: actor.id, action: 'solicitacao.resposta_cliente', entity: 'client_request', id, client: clientId, visibility: 'client', summary: `Você respondeu à solicitação “${r.title}”` });
  notify([r.assigned_to, ...teamOf(clientId)], { level: back ? 'atencao' : 'info', type: 'solicitacao', title: `${one('SELECT name FROM clients WHERE id=?', clientId).name} respondeu a uma solicitação`, body: `${r.title}: ${String(body || 'arquivo enviado').slice(0, 140)}`, link: `/clientes/${clientId}?tab=solicitacoes&r=${id}`, client: clientId, exclude: actor.id });
  return one('SELECT * FROM client_requests WHERE id=?', id);
}

export const requestForTeam = (r) => ({ ...r, kind_label: REQUEST_KINDS[r.kind]?.label, status_label: REQUEST_STATUS[r.status], owner_name: userName(r.assigned_to), requester_name: userName(r.requested_by),
  updates: all('SELECT u.*, us.name author_name FROM client_request_updates u LEFT JOIN users us ON us.id=u.author_id WHERE u.request_id=? ORDER BY u.created_at', r.id),
  ref: r.ref_type === 'conteudo' && r.ref_id ? one('SELECT id, number, title FROM contents WHERE id=?', r.ref_id) : null });
