// DIVISÃO DE CLIENTES — quem cuida de cada cliente (equivalente à DIVISÃO EQUIPE do Notion).
// Leitura liberada a toda a equipe interna; a fonte é client_members (editado na aba Equipe de cada cliente).
import { Router } from 'express';
import { all } from '../db.js';
import { requireInternal } from '../lib/auth.js';
import { canAccessClient, can } from '../lib/permissions.js';

export const divisao = Router();

const ORDER = ['estrategia', 'copy', 'design', 'edicao', 'revisao', 'agendamento', 'atendimento'];
const CORE = ['estrategia', 'design', 'edicao']; // funções que todo cliente em operação precisa ter
const SECTION = { 'CLIENTES MKT': 'MKT', 'CLIENTES ADVS MKT': 'ADVS' };

divisao.get('/divisao', requireInternal, (req, res) => {
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
    can_edit: can(req.user, 'clientes', 'admin'),
  });
});
