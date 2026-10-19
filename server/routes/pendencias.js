// CENTRO DE PENDÊNCIAS — radar operacional. As pendências são DERIVADAS do estado real (tarefas, bloqueios, onboarding, faturas):
// não existe "pendência" solta para alguém esquecer de fechar. Agir numa pendência = agir na origem dela (tarefa, conteúdo, item, fatura).
import { Router } from 'express';
import { one, all, update, now } from '../db.js';
import { requireInternal } from '../lib/auth.js';
import { can, assertClient, HttpError } from '../lib/permissions.js';
import { log } from '../lib/core.js';
import { computePendencies } from '../engine/intelligence.js';
import { completeTask, unblockContent } from '../engine/process.js';
import { addComment, checkOnboardingComplete } from './ops.js';

export const pendencias = Router();
const guard = [requireInternal, (req, _res, next) => (can(req.user, 'pendencias') ? next() : next(new HttpError(403, 'Centro de Pendências: acesso restrito (liberado pela administração em Usuários).')))];

export const CAUSES = {
  cliente: 'Cliente', prazo: 'Prazo da equipe', responsavel: 'Responsável', material: 'Material', equipe: 'Equipe',
  informacao: 'Informação', onboarding: 'Onboarding', financeiro: 'Financeiro',
};
const visible = (user) => computePendencies().filter((i) => can(user, 'financeiro') || !i.financial);

pendencias.get('/pendencias', ...guard, (req, res) => {
  const items = visible(req.user);
  const count = (f) => items.filter(f).length;
  const causes = Object.entries(CAUSES).map(([k, label]) => ({ key: k, label, n: count((i) => i.cause === k), critical: count((i) => i.cause === k && i.severity === 'critica') })).filter((c) => c.n);
  const who = [...new Set(items.map((i) => i.who).filter(Boolean))].sort();
  res.json({
    items: items.map((i) => ({ ...i, cause_label: CAUSES[i.cause] || i.cause })),
    counts: { total: items.length, critica: count((i) => i.severity === 'critica'), alta: count((i) => i.severity === 'alta'), media: count((i) => i.severity === 'media'), baixa: count((i) => i.severity === 'baixa') },
    causes,
    filters: {
      clients: [...new Map(items.filter((i) => i.client_id).map((i) => [i.client_id, i.client])).entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      who, processes: [...new Set(items.map((i) => i.process).filter(Boolean))].sort(),
    },
  });
});

// Detalhe: a pendência + a origem + histórico + comentários + o que esta pessoa pode fazer
pendencias.get('/pendencias/item', ...guard, (req, res) => {
  const p = visible(req.user).find((i) => i.id === req.query.id);
  if (!p) throw new HttpError(404, 'Pendência não encontrada — ela pode já ter sido resolvida.');
  const src = p.source || {};
  const task = src.type === 'task' ? one('SELECT t.*, u.name assignee_name FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.id=?', src.id) : null;
  const content = p.content_id ? one('SELECT id, number, title, stage, client_id, planned_at, blocked, block_reason FROM contents WHERE id=?', p.content_id) : null;
  const where = content ? ['l.content_id=?', content.id] : task ? ['(l.entity_type=? AND l.entity_id=?)', 'task', task.id] : p.client_id ? ['l.client_id=?', p.client_id] : null;
  const history = where ? all(`SELECT l.created_at, l.summary, l.action, u.name actor FROM activity_logs l LEFT JOIN users u ON u.id=l.actor_id WHERE ${where[0]} ORDER BY l.created_at DESC LIMIT 25`, ...where.slice(1)) : [];
  const notes = all("SELECT l.created_at, l.after body, u.name author FROM activity_logs l LEFT JOIN users u ON u.id=l.actor_id WHERE l.action='pendencia.nota' AND l.entity_id=? ORDER BY l.created_at", p.id);
  const comments = content ? all('SELECT c.id, c.body, c.created_at, c.visibility, u.name author FROM comments c JOIN users u ON u.id=c.author_id WHERE c.content_id=? ORDER BY c.created_at DESC LIMIT 15', content.id) : [];
  const related = all(`SELECT t.id, t.title, t.status, t.due_at, u.name assignee FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id
    WHERE t.status IN ('aberta','em_andamento') AND ${content ? 't.content_id=?' : p.client_id ? 't.client_id=?' : '1=0'} ${task ? 'AND t.id<>?' : ''} ORDER BY t.due_at LIMIT 10`, ...(content ? [content.id] : p.client_id ? [p.client_id] : []), ...(task ? [task.id] : []));
  const canEdit = can(req.user, 'processos', 'edit');
  const resolve = src.type === 'task' && task && task.function !== 'cliente' && task.assignee_id ? { kind: 'complete_task', label: 'Concluir a tarefa' }
    : src.type === 'content' && can(req.user, 'conteudos', 'edit') ? { kind: 'unblock', label: 'Desbloquear o conteúdo' }
    : src.type === 'onboarding_item' && can(req.user, 'clientes', 'edit') ? { kind: 'onboarding_received', label: 'Marcar item como recebido' } : null;
  const resolveNote = src.type === 'task' && task?.function === 'cliente' ? 'Resolve sozinha quando o cliente responder no portal.' : src.type === 'invoice' ? 'Resolve quando o pagamento for registrado no Financeiro.' : null;
  res.json({
    item: { ...p, cause_label: CAUSES[p.cause] || p.cause }, task, content, history, notes, comments, related,
    people: all("SELECT id, name, functions FROM users WHERE active=1 AND role_key<>'cliente' ORDER BY name"),
    can: { reassign: canEdit && !!task && task.function !== 'cliente', edit_task: canEdit && !!task, comment: true, create_task: true, resolve, resolve_note: resolveNote },
  });
});

// Prazo e prioridade de uma tarefa (origem da pendência)
pendencias.patch('/tasks/:id', requireInternal, (req, res) => {
  if (!can(req.user, 'processos', 'edit')) throw new HttpError(403, 'Sem permissão para alterar tarefas.');
  const t = one('SELECT * FROM tasks WHERE id=?', req.params.id);
  if (!t) throw new HttpError(404, 'Tarefa não encontrada.');
  if (t.client_id) assertClient(req.user, t.client_id);
  const patch = {};
  if (req.body?.due_at !== undefined) { const d = new Date(req.body.due_at); if (Number.isNaN(d.getTime())) throw new HttpError(422, 'Prazo inválido.'); patch.due_at = d.toISOString(); }
  if (req.body?.priority !== undefined) { if (!['baixa', 'media', 'alta', 'critica'].includes(req.body.priority)) throw new HttpError(422, 'Prioridade inválida.'); patch.priority = req.body.priority; }
  if (!Object.keys(patch).length) return res.json({ ok: true });
  update('tasks', { id: t.id }, patch);
  log({ actor: req.user.id, action: 'tarefa.alterada', entity: 'task', id: t.id, client: t.client_id, content: t.content_id, summary: `Tarefa “${t.title}”: ${Object.keys(patch).map((k) => (k === 'due_at' ? 'prazo' : 'prioridade')).join(' e ')} alterado(s)`,
    before: JSON.stringify({ due_at: t.due_at, priority: t.priority }), after: JSON.stringify(patch) });
  res.json({ ok: true });
});

// Comentário: no conteúdo (quando há) ou nota registrada na própria pendência (histórico append-only)
pendencias.post('/pendencias/comment', ...guard, (req, res) => {
  const p = visible(req.user).find((i) => i.id === req.body?.id);
  if (!p) throw new HttpError(404, 'Pendência não encontrada.');
  const body = String(req.body?.body || '').trim();
  if (!body) throw new HttpError(422, 'Escreva o comentário.');
  if (p.content_id) {
    const c = one('SELECT * FROM contents WHERE id=?', p.content_id);
    addComment(c, req.user, { body, visibility: 'internal' });
  } else {
    log({ actor: req.user.id, action: 'pendencia.nota', entity: 'pendencia', id: p.id, client: p.client_id, summary: `Nota na pendência “${p.problem || p.title}”`, after: body });
  }
  res.json({ ok: true });
});

// Resolver = executar a ação real na origem
pendencias.post('/pendencias/resolve', ...guard, (req, res) => {
  const p = visible(req.user).find((i) => i.id === req.body?.id);
  if (!p) throw new HttpError(404, 'Pendência não encontrada — ela pode já ter sido resolvida.');
  const src = p.source || {};
  if (src.type === 'task') {
    const t = one('SELECT * FROM tasks WHERE id=?', src.id);
    if (t.function === 'cliente') throw new HttpError(422, 'Esta pendência depende do cliente: ela se resolve quando ele responder no portal.');
    completeTask(t.id, req.user);
  } else if (src.type === 'content') {
    if (!can(req.user, 'conteudos', 'edit')) throw new HttpError(403, 'Sem permissão para desbloquear.');
    unblockContent(src.id, req.user, req.body?.note || 'Resolvido pelo Centro de Pendências');
  } else if (src.type === 'onboarding_item') {
    if (!can(req.user, 'clientes', 'edit')) throw new HttpError(403, 'Sem permissão.');
    const it = one('SELECT oi.*, ob.client_id FROM onboarding_items oi JOIN onboarding ob ON ob.id=oi.onboarding_id WHERE oi.id=?', src.id);
    assertClient(req.user, it.client_id);
    update('onboarding_items', { id: it.id }, { status: 'recebido', received_at: now() });
    checkOnboardingComplete(it.onboarding_id, req.user);
    log({ actor: req.user.id, action: 'onboarding.item', entity: 'onboarding_item', id: it.id, client: it.client_id, summary: `Item de onboarding marcado como recebido: ${it.label}` });
  } else throw new HttpError(422, 'Esta pendência se resolve na origem (Financeiro).');
  res.json({ ok: true });
});
