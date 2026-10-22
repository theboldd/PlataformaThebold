// Permissões: ROLE + USUÁRIO + CLIENTE + MÓDULO + AÇÃO.
// Toda checagem acontece no backend; a interface apenas reflete o resultado.
import { one, all } from '../db.js';

export const MODULES = {
  dashboard: 'Visão geral', torre: 'Torre de Controle', processos: 'Processos', clientes: 'Clientes',
  conteudos: 'Conteúdos', revisao: 'Sala de Revisão', calendario: 'Calendário', reunioes: 'Reuniões',
  chat: 'Comunicação', pendencias: 'Centro de Pendências', crm: 'CRM', financeiro: 'Financeiro',
  insights: 'Insights', brain: 'The Bold Brain', automacoes: 'Automações', integracoes: 'Integrações',
  usuarios: 'Usuários e permissões', historico: 'Histórico', portal: 'Área do cliente',
  divisao: 'Divisão de clientes (ver e gerenciar quem cuida de cada cliente)',
  carteira: 'Carteira de clientes (criar cliente e mudar status: ativar, pausar, encerrar)',
  atrasos: 'Classificação de atrasos (ver os fatos de cada item atrasado ou herdado e classificar a causa)',
  repasses: 'Produção & Repasses (ver valores = view · gerenciar valores e ajustes = edit · aprovar e fechar competência = approve)',
  performance: 'Equipe · Performance (entregas, prazos, reaberturas e capacidade por pessoa — dado sobre pessoas)',
};
export const ACTIONS = ['view', 'create', 'edit', 'approve', 'admin'];

const ALL = Object.keys(MODULES).filter((m) => m !== 'portal');
// Módulos que só a CEO decide: Divisão (vincular/desvincular clientes da equipe) e Carteira (criar cliente, mudar status).
// Atrasos e Performance: dado sobre pessoas — mesma regra.
// Por padrão só o perfil CEO tem; liberar para alguém (em Usuários) ou para um perfil exige <módulo>:admin — só a CEO.
export const CEO_GRANT = ['divisao', 'carteira', 'atrasos', 'performance', 'repasses'];
const full = (mods) => Object.fromEntries(mods.map((m) => [m, [...ACTIONS]]));
const prod = { dashboard: ['view'], processos: ['view'], clientes: ['view'], conteudos: ['view', 'edit'], calendario: ['view'], reunioes: ['view'], chat: ['view', 'create'], brain: ['view'] };

// Roles iniciais (reconstruídos a partir do Notion/Slack/Calendar — ver docs/01-processo-real.md)
export const ROLE_DEFS = [
  { key: 'ceo', label: 'CEO', dashboard: 'ceo', all_clients: 1, perms: full(ALL) },
  { key: 'operacoes', label: 'Operações, Processos e Automações', dashboard: 'operacoes', all_clients: 1, perms: full(ALL.filter((m) => !CEO_GRANT.includes(m))) },
  { key: 'gestao', label: 'Gestão de Processos e Atendimento', dashboard: 'operacoes', all_clients: 1,
    perms: { ...full(['processos', 'clientes', 'conteudos', 'calendario', 'reunioes', 'chat']), dashboard: ['view'], torre: ['view'], revisao: ['view'], insights: ['view'], brain: ['view'], historico: ['view'] } },
  { key: 'qualidade', label: 'Qualidade e Revisão', dashboard: 'revisao', all_clients: 1,
    perms: { ...full(['revisao', 'conteudos', 'reunioes']), dashboard: ['view'], torre: ['view'], processos: ['view', 'edit'], clientes: ['view', 'edit'], calendario: ['view', 'create'], chat: ['view', 'create'], brain: ['view'], insights: ['view'], historico: ['view'] } },
  { key: 'estrategia', label: 'Estratégia', dashboard: 'estrategia', all_clients: 0,
    perms: { dashboard: ['view'], processos: ['view', 'edit'], clientes: ['view', 'edit'], conteudos: ['view', 'create', 'edit'], calendario: ['view', 'create'], reunioes: ['view', 'create', 'edit'], chat: ['view', 'create'], brain: ['view'], historico: ['view'] } },
  { key: 'producao', label: 'Produção', dashboard: 'producao', all_clients: 0, perms: prod },
  { key: 'design', label: 'Design', dashboard: 'producao', all_clients: 0, perms: prod },
  { key: 'edicao', label: 'Edição de vídeo', dashboard: 'producao', all_clients: 0, perms: prod },
  { key: 'copy', label: 'Copywriting', dashboard: 'producao', all_clients: 0, perms: prod },
  { key: 'comercial', label: 'Comercial e Financeiro', dashboard: 'comercial', all_clients: 0,
    perms: { ...full(['crm', 'financeiro']), dashboard: ['view'], processos: ['view'], clientes: ['view'], calendario: ['view'], reunioes: ['view', 'create'], chat: ['view', 'create'] } },
  { key: 'interno', label: 'Equipe interna', dashboard: 'producao', all_clients: 0, perms: { dashboard: ['view'], processos: ['view'], calendario: ['view'], chat: ['view', 'create'] } },
  { key: 'cliente', label: 'Cliente', dashboard: 'portal', all_clients: 0, internal: 0, perms: { portal: ['view', 'approve', 'create'] } },
];


// Centro de Pendências global: por padrão só CEO e Operações (permissões dos roles). Pode ser liberado a outra pessoa em Usuários → permissões específicas.
export const PENDENCIAS_ROLES = ['ceo', 'operacoes'];

export function roleOf(user) { return one('SELECT * FROM roles WHERE key=?', user.role_key); }

export function can(user, module, action = 'view') {
  if (!user || !user.active) return false;
  const ov = one('SELECT effect FROM user_permissions WHERE user_id=? AND module=? AND action=?', user.id, module, action);
  if (ov) return ov.effect === 'grant';
  return !!one('SELECT 1 FROM role_permissions WHERE role_key=? AND module=? AND action=?', user.role_key, module, action);
}

export function permissionMap(user) {
  const out = {};
  for (const m of Object.keys(MODULES)) {
    const acts = ACTIONS.filter((a) => can(user, m, a));
    if (acts.length) out[m] = acts;
  }
  return out;
}

export const isInternal = (user) => !!user && user.role_key !== 'cliente';
export const hasAllClients = (user) => !!roleOf(user)?.all_clients;

// IDs de clientes que o usuário pode ver em detalhe
export function clientScope(user) {
  if (hasAllClients(user)) return null; // null = todos
  return all('SELECT DISTINCT client_id FROM client_members WHERE user_id=?', user.id).map((r) => r.client_id);
}
export function canAccessClient(user, clientId) {
  if (!clientId) return false;
  if (user.role_key === 'cliente') return !!one("SELECT 1 FROM client_members WHERE user_id=? AND client_id=? AND function='cliente'", user.id, clientId);
  if (hasAllClients(user)) return true;
  return !!one('SELECT 1 FROM client_members WHERE user_id=? AND client_id=?', user.id, clientId);
}
// fragmento SQL para filtrar por escopo de cliente
export function scopeSQL(user, col = 'client_id') {
  const s = clientScope(user);
  if (s === null) return { sql: '1=1', params: [] };
  if (!s.length) return { sql: '1=0', params: [] };
  return { sql: `${col} IN (${s.map(() => '?').join(',')})`, params: s };
}

export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
export const forbid = (msg = 'Sem permissão para esta ação.') => { throw new HttpError(403, msg); };
export const notFound = (msg = 'Não encontrado.') => { throw new HttpError(404, msg); };
export const bad = (msg) => { throw new HttpError(400, msg); };
export function assertClient(user, clientId) { if (!canAccessClient(user, clientId)) forbid('Você não está vinculado(a) a este cliente.'); }
export function assertCan(user, module, action = 'view') { if (!can(user, module, action)) forbid(); }
