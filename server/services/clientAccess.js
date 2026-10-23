// ACESSOS DOS CLIENTES (regras oficiais 4 e 7).
// O e-mail de acesso vem só de dados reais, com a origem registrada. Sem e-mail confiável: nada é criado
// e o acesso fica "SEM E-MAIL". O cliente sem login continua com todos os dados migrados normalmente.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { one, all, insert, run, update, uid, now } from '../db.js';
import { hashPassword } from '../lib/auth.js';
import { log } from '../lib/core.js';

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const AGENCY = /@thebold\.|bold\.agenciamkt@|rebecapacheco\.mkt@/i;
// Nome de quem acessa = parte pessoal do nome do cliente ("Bruna Moura l Endocrinologista" → "Bruna Moura")
export const contactName = (clientName) => clientName.split(/\s+[|lI]\s+/)[0].trim() || clientName;

export const ACCESS_STATUS = { ativo: 'ACESSO ATIVO', convite: 'CONVITE PENDENTE', sem_email: 'SEM E-MAIL', bloqueado: 'BLOQUEADO' };
const PORTAL_PERMISSION = 'Cliente · área do cliente: ver, aprovar, comentar, enviar materiais (somente o próprio projeto)';

function clientUser(clientId) {
  return one("SELECT u.* FROM users u JOIN client_members cm ON cm.user_id=u.id WHERE cm.client_id=? AND cm.function='cliente' ORDER BY u.created_at LIMIT 1", clientId);
}
export function accessStatus(u) {
  if (!u) return 'sem_email';
  if (!u.active) return 'bloqueado';
  return u.last_login_at ? 'ativo' : 'convite';
}

// Cria o usuário-cliente sem senha conhecida: o acesso começa por um link de convite (redefinição de senha)
export function createClientLogin(client, email, { source, source_url = null, actor = null }) {
  const e = String(email || '').trim().toLowerCase();
  if (!EMAIL.test(e)) throw Object.assign(new Error('E-mail inválido.'), { status: 422 });
  if (AGENCY.test(e)) throw Object.assign(new Error('Este e-mail é da própria agência — não pode ser acesso de cliente.'), { status: 422 });
  const existing = one('SELECT * FROM users WHERE email=?', e);
  if (existing && existing.role_key !== 'cliente') throw Object.assign(new Error('Este e-mail já é de alguém da equipe.'), { status: 409 });
  const u = existing || insert('users', { id: uid('u_'), name: contactName(client.name), email: e, password_hash: hashPassword(crypto.randomBytes(24).toString('base64url')),
    role_key: 'cliente', title: 'Cliente', functions: '[]', capacity: 0, active: 1, avatar_color: '#000000', created_at: now(), email_source: source, email_source_url: source_url });
  run("INSERT OR IGNORE INTO client_members (client_id,user_id,function) VALUES (?,?,'cliente')", client.id, u.id);
  run("INSERT OR IGNORE INTO channel_members (channel_id,user_id) SELECT id, ? FROM channels WHERE client_id=? AND kind='cliente'", u.id, client.id);
  log({ actor: actor?.id || null, kind: actor ? 'usuario' : 'sistema', action: 'acesso.cliente_preparado', entity: 'user', id: u.id, client: client.id,
    summary: `Acesso de cliente preparado para ${client.name}: ${e} (origem: ${source})`, after: JSON.stringify({ email: e, origem: source, url: source_url }) });
  return u;
}

// Varredura das fontes reais. Idempotente: não duplica usuário nem candidato.
export function prepareClientAccess({ dir = process.env.BOLD_MIGRATION_DIR || path.resolve('storage/migration/notion') } = {}) {
  const report = { created: [], candidates: [], sem_email: [] };
  // cliente interno (a própria The Bold) não tem acesso de cliente (regra oficial 16)
  const clients = all("SELECT id, name FROM clients WHERE kind<>'interno' ORDER BY name");
  const byName = new Map(clients.map((c) => [c.name, c]));
  // 1) e-mail informado pelo próprio cliente em formulário (cadastro) — já na plataforma, vindo do Notion
  for (const c of clients) {
    if (clientUser(c.id)) continue;
    const fromForm = all("SELECT content, source_url, source_page FROM client_brain_entries WHERE client_id=? AND lower(label) LIKE '%e-mail%'", c.id)
      .map((e) => ({ email: String(e.content).trim().toLowerCase(), url: e.source_url, page: e.source_page })).filter((e) => EMAIL.test(e.email) && !AGENCY.test(e.email));
    const fromAnswers = all("SELECT answer, source_ref FROM onboarding_answers WHERE client_id=? AND (lower(question_text) LIKE '%e-mail%' OR lower(question_text) LIKE '%email%')", c.id)
      .map((a) => ({ email: String(a.answer).trim().toLowerCase(), url: a.source_ref, page: 'Formulário de onboarding' })).filter((e) => EMAIL.test(e.email) && !AGENCY.test(e.email));
    const found = [...fromForm, ...fromAnswers];
    if (found.length) {
      const f = found[0];
      createClientLogin(c, f.email, { source: `Formulário preenchido pelo cliente (MIGRADO DO NOTION · ${f.page || 'página do cliente'})`, source_url: f.url });
      report.created.push(`${c.name}: ${f.email}`);
    }
  }
  // 2) e-mails achados no Notion fora de cadastro (ex.: contato publicado num post) → para a equipe confirmar
  const file = path.join(dir, '_client_emails.json');
  const extra = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).encontrados || [] : [];
  for (const x of extra) {
    const c = byName.get(x.client);
    if (!c || clientUser(c.id)) continue;
    const e = String(x.email).trim().toLowerCase();
    if (!EMAIL.test(e) || AGENCY.test(e)) continue;
    if (x.confidence === 'cadastro') { createClientLogin(c, e, { source: `${x.source} (MIGRADO DO NOTION)`, source_url: x.source_url }); report.created.push(`${c.name}: ${e}`); continue; }
    run('INSERT OR IGNORE INTO client_email_candidates (id, client_id, email, source, source_url, confidence, status, created_at) VALUES (?,?,?,?,?,?,?,?)',
      uid('ce_'), c.id, e, x.source, x.source_url || null, x.confidence, 'a_confirmar', now());
    report.candidates.push(`${c.name}: ${e} (confirmar)`);
  }
  for (const c of clients) if (!clientUser(c.id)) report.sem_email.push(c.name);
  return report;
}

export function accessList() {
  return all("SELECT id, name, status FROM clients WHERE kind<>'interno' ORDER BY name").map((c) => {
    const u = clientUser(c.id);
    const st = accessStatus(u);
    return {
      client_id: c.id, client: c.name, client_status: c.status,
      email: u?.email || null, user_id: u?.id || null, user: u?.name || null,
      status: st, status_label: ACCESS_STATUS[st],
      email_source: u?.email_source || null, email_source_url: u?.email_source_url || null,
      last_login_at: u?.last_login_at || null, permission: u ? PORTAL_PERMISSION : null,
      candidates: all("SELECT id, email, source, source_url, confidence FROM client_email_candidates WHERE client_id=? AND status='a_confirmar'", c.id),
    };
  });
}

// LOGIN PELO NOME (decisão da CEO, 23/10): o cliente entra com o próprio nome e a senha inicial combinada pela equipe;
// no primeiro acesso a plataforma pede uma senha nova só dele (a inicial é igual para todos e não pode continuar valendo).
// O nome de login ignora maiúsculas, acentos, espaços e pontos ("Alanna Santoro" = "alanna.santoro").
export const loginSlug = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
export const loginLabel = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
export function createNameLogins(password, actor, clientIds = null) {
  const out = { created: [], updated: [], skipped: [] };
  const clients = all("SELECT id, name FROM clients WHERE kind<>'interno' ORDER BY name").filter((c) => !clientIds || clientIds.includes(c.id));
  for (const c of clients) {
    const name = contactName(c.name).replace(/\s+[|lI]?\s*$/, '').trim();
    let slug = loginSlug(name);
    const taken = (x, uidSelf) => one('SELECT id FROM users WHERE username=? AND id<>?', x, uidSelf || '');
    const u = clientUser(c.id);
    if (u) {
      if (!u.username) { if (taken(slug, u.id)) slug = loginSlug(`${name} ${c.id.slice(-4)}`); update('users', { id: u.id }, { username: slug }); out.updated.push({ client: c.name, login: loginLabel(name), user_id: u.id, note: 'já tinha acesso: senha mantida' }); }
      else out.skipped.push({ client: c.name, login: u.username, user_id: u.id });
      continue;
    }
    if (taken(slug)) slug = loginSlug(`${name} ${c.id.slice(-4)}`);
    const nu = insert('users', { id: uid('u_'), name, email: `${slug}@login.thebold`, username: slug, password_hash: hashPassword(password), must_change_password: 1,
      role_key: 'cliente', title: 'Cliente', functions: '[]', capacity: 0, active: 1, avatar_color: '#000000', created_at: now(), email_source: 'Sem e-mail: login pelo nome (senha inicial da equipe)' });
    run("INSERT OR IGNORE INTO client_members (client_id,user_id,function) VALUES (?,?,'cliente')", c.id, nu.id);
    run("INSERT OR IGNORE INTO channel_members (channel_id,user_id) SELECT id, ? FROM channels WHERE client_id=? AND kind='cliente'", nu.id, c.id);
    log({ actor: actor?.id || null, action: 'acesso.cliente_preparado', entity: 'user', id: nu.id, client: c.id, summary: `Acesso de cliente criado para ${c.name}: login pelo nome “${loginLabel(name)}”, senha inicial a trocar no primeiro acesso` });
    out.created.push({ client: c.name, login: loginLabel(name), user_id: nu.id });
  }
  return out;
}
