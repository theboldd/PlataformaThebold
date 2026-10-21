// FICHA DO CLIENTE — Client Brain com procedência, respostas do onboarding, links/arquivos, cofre de acessos e pontos de revisão da migração.
// Somente equipe interna, sempre limitado aos clientes que a pessoa pode acessar. Nada daqui é exposto no portal do cliente.
import { Router } from 'express';
import { one, all, insert, update, uid, now, parseJSON } from '../db.js';
import { requireInternal, requirePerm } from '../lib/auth.js';
import { assertClient, can, HttpError } from '../lib/permissions.js';
import { log } from '../lib/core.js';
import { open } from '../integrations/vault.js';
import { activeForm, formStatus } from '../services/onboarding.js';
import { BRAIN_SECTIONS } from '../ai/memory.js';

export const ficha = Router();
const TEAM_ORIGINS = ['equipe', 'observacao_interna', 'ia'];

ficha.get('/clients/:id/ficha', requireInternal, requirePerm('clientes', 'view'), (req, res) => {
  assertClient(req.user, req.params.id);
  const c = one('SELECT id, name, notion_url, notion_section, aliases FROM clients WHERE id=?', req.params.id);
  if (!c) throw new HttpError(404, 'Cliente não encontrado.');
  const entries = all('SELECT e.*, u.name author, u2.name editor FROM client_brain_entries e LEFT JOIN users u ON u.id=e.created_by LEFT JOIN users u2 ON u2.id=e.updated_by WHERE e.client_id=? ORDER BY e.section, e.created_at', c.id);
  const form = activeForm();
  const st = formStatus(c.id);
  const answerRows = all('SELECT a.*, u.name answered_by_name FROM onboarding_answers a LEFT JOIN users u ON u.id=a.answered_by WHERE a.client_id=?', c.id);
  const byKey = Object.fromEntries(answerRows.map((a) => [a.question_key, a]));
  const onboarding = form ? form.sections.map((s) => ({ title: s.title, questions: s.questions.map((q) => ({ key: q.key, text: q.text, sensitive: !!q.sensitive, answer: byKey[q.key] || null })) })) : [];
  res.json({
    source: { notion_url: c.notion_url, notion_section: c.notion_section, aliases: parseJSON(c.aliases, []) },
    sections: BRAIN_SECTIONS, entries, onboarding, form_status: st,
    links: all('SELECT * FROM client_links WHERE client_id=? ORDER BY kind, created_at', c.id),
    secrets: all('SELECT s.id, s.label, s.created_at, s.updated_at, u.name provided_by_name FROM client_secrets s LEFT JOIN users u ON u.id=s.provided_by WHERE s.client_id=?', c.id),
    issues: all('SELECT * FROM migration_issues WHERE client_id=? ORDER BY status, kind, created_at', c.id),
    can_edit: can(req.user, 'clientes', 'edit'), can_reveal: can(req.user, 'clientes', 'admin'),
  });
});

// A equipe acrescenta informações — sempre como "equipe" ou "observação interna", nunca como resposta do cliente
ficha.post('/clients/:id/brain-entries', requireInternal, requirePerm('clientes', 'edit'), (req, res) => {
  assertClient(req.user, req.params.id);
  const { section, label, content, origin = 'equipe' } = req.body || {};
  if (!BRAIN_SECTIONS.includes(section)) throw new HttpError(422, 'Seção inválida.');
  if (!TEAM_ORIGINS.includes(origin)) throw new HttpError(422, 'Origem inválida.');
  if (!String(content || '').trim()) throw new HttpError(422, 'Escreva o conteúdo.');
  const e = insert('client_brain_entries', { id: uid('be_'), client_id: req.params.id, section, label: label?.trim() || null, content: content.trim(), origin, source_type: 'plataforma', created_by: req.user.id, created_at: now() });
  log({ actor: req.user.id, action: 'brain.registro', entity: 'client', id: req.params.id, client: req.params.id, summary: `Client Brain · ${section}: ${(label || content).slice(0, 80)}`, after: content });
  res.json(e);
});
ficha.patch('/clients/:id/brain-entries/:eid', requireInternal, requirePerm('clientes', 'edit'), (req, res) => {
  assertClient(req.user, req.params.id);
  const e = one('SELECT * FROM client_brain_entries WHERE id=? AND client_id=?', req.params.eid, req.params.id);
  if (!e) throw new HttpError(404, 'Registro não encontrado.');
  const patch = {};
  if (req.body.section !== undefined) { if (!BRAIN_SECTIONS.includes(req.body.section)) throw new HttpError(422, 'Seção inválida.'); patch.section = req.body.section; }
  if (req.body.content !== undefined) { if (!String(req.body.content).trim()) throw new HttpError(422, 'O conteúdo não pode ficar vazio.'); patch.content = String(req.body.content).trim(); }
  if (req.body.label !== undefined) patch.label = req.body.label || null;
  // A procedência não muda: uma resposta do cliente editada continua sendo do cliente, com o editor registrado.
  // O valor anterior nunca some: fica em client_brain_history (antes/depois, quem, quando, motivo).
  if (patch.content !== undefined && patch.content !== e.content) insert('client_brain_history', { id: uid('bh_'), entry_id: e.id, client_id: e.client_id, content_before: e.content, content_after: patch.content, changed_by: req.user.id, origin: e.origin, reason: req.body.reason || null, created_at: now() });
  update('client_brain_entries', { id: e.id }, { ...patch, updated_by: req.user.id, updated_at: now() });
  log({ actor: req.user.id, action: 'brain.registro_alterado', entity: 'client', id: e.client_id, client: e.client_id, summary: `Client Brain alterado · ${patch.section || e.section}: ${(e.label || '').slice(0, 80)}`, before: JSON.stringify({ section: e.section, content: e.content }), after: JSON.stringify({ section: patch.section || e.section, content: patch.content ?? e.content }) });
  res.json(one('SELECT * FROM client_brain_entries WHERE id=?', e.id));
});

// Revelar um acesso: só quem administra clientes, e sempre fica no histórico
ficha.post('/clients/:id/secrets/:sid/reveal', requireInternal, requirePerm('clientes', 'admin'), (req, res) => {
  assertClient(req.user, req.params.id);
  const s = one('SELECT * FROM client_secrets WHERE id=? AND client_id=?', req.params.sid, req.params.id);
  if (!s) throw new HttpError(404, 'Acesso não encontrado.');
  log({ actor: req.user.id, action: 'acesso.revelado', entity: 'client', id: s.client_id, client: s.client_id, summary: `${req.user.name} visualizou o acesso "${s.label}"`, ip: req.ip });
  res.json({ value: open(s.secret_enc)?.value ?? null });
});

// Pontos de revisão da migração (inconsistências, conflitos, páginas não lidas)
ficha.get('/migration-issues', requireInternal, requirePerm('clientes', 'admin'), (req, res) => {
  res.json(all("SELECT i.*, c.name client FROM migration_issues i LEFT JOIN clients c ON c.id=i.client_id ORDER BY i.status, c.name, i.kind"));
});
ficha.patch('/migration-issues/:id', requireInternal, requirePerm('clientes', 'edit'), (req, res) => {
  const i = one('SELECT * FROM migration_issues WHERE id=?', req.params.id);
  if (!i) throw new HttpError(404, 'Ponto não encontrado.');
  if (i.client_id) assertClient(req.user, i.client_id);
  const status = req.body?.status;
  if (!['aberto', 'resolvido', 'ignorado'].includes(status)) throw new HttpError(422, 'Status inválido.');
  update('migration_issues', { id: i.id }, { status });
  log({ actor: req.user.id, action: 'migracao.revisao', entity: 'client', id: i.client_id, client: i.client_id, summary: `Ponto de migração marcado como ${status}: ${i.description.slice(0, 90)}`, before: i.status, after: status });
  res.json({ ok: true });
});
