// DIVISÃO DE CLIENTES — quem cuida de cada cliente (equivalente à DIVISÃO EQUIPE do Notion).
// Regra oficial 2: VER e EDITAR a Divisão é só da CEO e de quem ela autorizar (permissão "divisao").
// A equipe comum e os clientes não acessam — a checagem é no servidor (URL/API sem permissão → 403).
import { Router } from 'express';
import { all, one, run, update, tx } from '../db.js';
import { requireInternal, requirePerm } from '../lib/auth.js';
import { canAccessClient, can, HttpError } from '../lib/permissions.js';
import { log, notify } from '../lib/core.js';
import { resolveAssignee } from '../engine/process.js';

export const divisao = Router();

const ORDER = ['estrategia', 'copy', 'design', 'edicao', 'revisao', 'agendamento', 'atendimento'];
const CORE = ['estrategia', 'design', 'edicao']; // funções que todo cliente em operação precisa ter
const SECTION = { 'CLIENTES MKT': 'MKT', 'CLIENTES ADVS MKT': 'ADVS' };

const canSee = (u) => can(u, 'divisao', 'view') || can(u, 'divisao', 'edit');
const guardView = (req, _res, next) => (canSee(req.user) ? next() : next(new HttpError(403, 'A Divisão de clientes é restrita à CEO e a quem ela autorizar.')));
const teamOf = (clientId, fn) => all("SELECT u.name FROM client_members cm JOIN users u ON u.id=cm.user_id WHERE cm.client_id=? AND cm.function=? ORDER BY u.name", clientId, fn).map((r) => r.name);

divisao.get('/divisao', requireInternal, guardView, (req, res) => {
  const clients = all("SELECT id, name, status, notion_section FROM clients WHERE status<>'encerrado' ORDER BY name");
  const links = all("SELECT cm.client_id, cm.function, u.id user_id, u.name, u.title FROM client_members cm JOIN users u ON u.id=cm.user_id WHERE cm.function<>'cliente' AND u.active=1");
  const pending = new Set(all("SELECT DISTINCT client_id FROM migration_issues WHERE kind='equipe' AND status='aberto' AND client_id IS NOT NULL").map((r) => r.client_id));
  const byClient = new Map(clients.map((c) => [c.id, c]));
  const out = clients.map((c) => {
    const team = {};
    for (const l of links.filter((x) => x.client_id === c.id)) (team[l.function] ||= []).push({ id: l.user_id, name: l.name });
    return {
      id: c.id, name: c.name, status: c.status, section: SECTION[c.notion_section] || null,
      team, missing: CORE.filter((f) => !team[f]), review: pending.has(c.id), can_open: canAccessClient(req.user, c.id),
    };
  });
  const people = new Map();
  for (const l of links) {
    const c = byClient.get(l.client_id);
    if (!c) continue;
    const p = people.get(l.user_id) || { id: l.user_id, name: l.name, title: l.title, functions: {}, clients: new Set() };
    (p.functions[l.function] ||= []).push({ id: c.id, name: c.name, section: SECTION[c.notion_section] || null, status: c.status });
    p.clients.add(c.id);
    people.set(l.user_id, p);
  }
  const used = new Set(links.map((l) => l.function));
  res.json({
    clients: out,
    people: [...people.values()].map((p) => ({ ...p, clients: p.clients.size })).sort((a, b) => b.clients - a.clients || a.name.localeCompare(b.name)),
    functions: ORDER.filter((f) => used.has(f) || CORE.includes(f)),
    can_edit: can(req.user, 'divisao', 'edit'),
    team: can(req.user, 'divisao', 'edit') ? all("SELECT id, name, functions FROM users WHERE active=1 AND role_key<>'cliente' ORDER BY name").map((u) => ({ ...u, functions: JSON.parse(u.functions || '[]') })) : [],
  });
});

const FN_OK = new Set(ORDER);
function input(req) {
  const { client_id, user_id, function: fn } = req.body || {};
  const c = one('SELECT id, name FROM clients WHERE id=?', client_id);
  const u = one("SELECT id, name FROM users WHERE id=? AND active=1 AND role_key<>'cliente'", user_id);
  if (!c || !u || !FN_OK.has(fn)) throw new HttpError(422, 'Informe cliente, pessoa da equipe e função.');
  return { c, u, fn };
}
const fnLabel = (fn) => ({ estrategia: 'estratégia', copy: 'copy/legenda', design: 'design', edicao: 'edição de vídeo', revisao: 'revisão', agendamento: 'agendamento', atendimento: 'atendimento' }[fn] || fn);

// Vincular: a pessoa passa a receber as tarefas daquela função no cliente (as que estavam sem dono já vão para ela)
divisao.post('/divisao/vinculo', requirePerm('divisao', 'edit'), (req, res) => {
  const { c, u, fn } = input(req);
  let given = 0;
  const before = teamOf(c.id, fn);
  tx(() => {
    run('INSERT OR IGNORE INTO client_members (client_id,user_id,function) VALUES (?,?,?)', c.id, u.id, fn);
    run("INSERT OR IGNORE INTO channel_members (channel_id,user_id) SELECT id, ? FROM channels WHERE client_id=? AND kind='cliente'", u.id, c.id);
    for (const t of all("SELECT * FROM tasks WHERE client_id=? AND function=? AND assignee_id IS NULL AND status IN ('aberta','em_andamento')", c.id, fn)) { update('tasks', { id: t.id }, { assignee_id: u.id }); given++; }
  });
  if (given) notify(u.id, { level: 'info', type: 'tarefa', title: `${c.name}: ${given} tarefa(s) de ${fnLabel(fn)}`, body: 'Você foi vinculado(a) a este cliente na Divisão.', link: '/processos', client: c.id });
  log({ actor: req.user.id, action: 'divisao.vinculo', entity: 'client', id: c.id, client: c.id, summary: `${u.name} vinculado(a) a ${c.name} em ${fnLabel(fn)}${given ? ` · ${given} tarefa(s) sem dono atribuída(s)` : ''}`,
    before: JSON.stringify({ funcao: fn, equipe: before }), after: JSON.stringify({ funcao: fn, equipe: teamOf(c.id, fn) }) });
  res.json({ ok: true, tasks: given });
});

// Desvincular: as tarefas abertas dessa pessoa naquela função passam para outra pessoa da função; sem ninguém, ficam sem dono (pendência)
divisao.post('/divisao/desvinculo', requirePerm('divisao', 'edit'), (req, res) => {
  const { c, u, fn } = input(req);
  const moved = [];
  const before = teamOf(c.id, fn);
  tx(() => {
    run('DELETE FROM client_members WHERE client_id=? AND user_id=? AND function=?', c.id, u.id, fn);
    for (const t of all("SELECT * FROM tasks WHERE client_id=? AND function=? AND assignee_id=? AND status IN ('aberta','em_andamento')", c.id, fn, u.id)) {
      const next = resolveAssignee(c.id, fn);
      update('tasks', { id: t.id }, { assignee_id: next });
      moved.push(next);
    }
  });
  const orphan = moved.filter((x) => !x).length;
  log({ actor: req.user.id, action: 'divisao.desvinculo', entity: 'client', id: c.id, client: c.id, summary: `${u.name} desvinculado(a) de ${c.name} em ${fnLabel(fn)}${moved.length ? ` · ${moved.length} tarefa(s) aberta(s) repassada(s)${orphan ? `, ${orphan} sem responsável` : ''}` : ''}`,
    before: JSON.stringify({ funcao: fn, equipe: before }), after: JSON.stringify({ funcao: fn, equipe: teamOf(c.id, fn) }) });
  res.json({ ok: true, moved: moved.length, orphan });
});
