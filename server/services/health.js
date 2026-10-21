// SAÚDE DO CLIENTE — camada INTERNA (nunca exposta ao portal).
// 🟢 ESTÁVEL · 🟡 ATENÇÃO · 🔴 RISCO, calculada por regras sobre dados reais. Cada sinal traz evidências;
// sem dados suficientes, o sinal diz "sem dados" — nunca se afirma algo que o banco não sustenta.
import { one, all, insert, uid, now, parseJSON } from '../db.js';
import { can } from '../lib/permissions.js';
import { fmtDay } from './client-view.js';

const DAY = 864e5;
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();
const sig = (key, label, level, evidence, value = null) => ({ key, label, level, evidence, value });

export function clientHealth(clientId, viewer = null) {
  const s = [];
  // 1. Aprovações: prazos do cliente vencidos e tempo médio de resposta (90 dias)
  const overdue = all("SELECT c.title, t.due_at FROM tasks t JOIN contents c ON c.id=t.content_id WHERE t.client_id=? AND t.kind='aprovacao' AND t.status IN ('aberta','em_andamento') AND t.due_at < ?", clientId, now());
  const resp = all(`SELECT (julianday(ap.created_at) - julianday(v.sent_to_client_at)) * 24 h FROM approvals ap JOIN content_versions v ON v.id=ap.version_id
    JOIN contents c ON c.id=ap.content_id WHERE c.client_id=? AND ap.kind='cliente' AND ap.user_id IN (SELECT user_id FROM client_members WHERE client_id=? AND function='cliente') AND v.sent_to_client_at IS NOT NULL AND ap.created_at > ?`, clientId, clientId, ago(90)).map((r) => r.h).filter((h) => h >= 0);
  const avg = resp.length ? Math.round(resp.reduce((a, b) => a + b, 0) / resp.length) : null;
  if (!overdue.length && avg == null) s.push(sig('aprovacoes', 'Aprovações', 'sem_dados', ['Nenhuma aprovação do cliente nos últimos 90 dias.']));
  else s.push(sig('aprovacoes', 'Aprovações', overdue.length >= 3 || avg > 72 ? 'risco' : overdue.length || avg > 48 ? 'atencao' : 'ok',
    [...(avg != null ? [`Tempo médio de resposta: ${avg}h (${resp.length} aprovações em 90 dias).`] : []), ...overdue.slice(0, 5).map((o) => `Prazo de aprovação vencido em ${fmtDay(o.due_at)}: “${o.title}”.`)], avg));
  // 2. Retrabalho: rodadas de ajuste pedidas pelo cliente (conteúdos com movimento em 90 dias)
  const rw = one("SELECT COUNT(*) n, AVG(client_adjust_rounds) a, SUM(client_adjust_rounds>=2) many FROM contents WHERE client_id=? AND updated_at > ? AND stage<>'cancelado' AND stage NOT IN ('cronograma','analise_cronograma','ajuste_cronograma')", clientId, ago(90));
  if (!rw.n) s.push(sig('retrabalho', 'Retrabalho', 'sem_dados', ['Sem conteúdos em produção ou aprovação nos últimos 90 dias.']));
  else s.push(sig('retrabalho', 'Retrabalho', rw.a > 2 ? 'risco' : rw.a > 1 || rw.many >= 3 ? 'atencao' : 'ok', [`Média de ${(rw.a || 0).toFixed(1)} rodada(s) de ajuste do cliente por conteúdo (${rw.n} conteúdos).`, ...(rw.many ? [`${rw.many} conteúdo(s) com 2 ou mais rodadas.`] : [])], rw.a));
  // 3. Ajustes depois de aprovado (sinal de insatisfação com o que foi aprovado)
  const reap = all("SELECT a.created_at, c.title FROM adjustments a JOIN contents c ON c.id=a.content_id WHERE c.client_id=? AND a.origin='cliente' AND a.reapproval=1 AND a.created_at > ?", clientId, ago(60));
  s.push(sig('reclamacoes', 'Pedidos após aprovação', reap.length >= 3 ? 'risco' : reap.length >= 2 ? 'atencao' : 'ok', reap.length ? reap.slice(0, 5).map((r) => `${fmtDay(r.created_at)}: ajuste pedido depois de aprovar “${r.title}”.`) : ['Nenhum pedido de ajuste após aprovação em 60 dias.'], reap.length));
  // 4. Comunicação: última manifestação do cliente (mensagem, comentário, aprovação, solicitação)
  const last = one(`SELECT MAX(created_at) t FROM activity_logs WHERE client_id=? AND actor_id IN (SELECT user_id FROM client_members WHERE client_id=? AND function='cliente')`, clientId, clientId)?.t;
  const lastMsg = one(`SELECT MAX(m.created_at) t FROM messages m JOIN channels ch ON ch.id=m.channel_id WHERE ch.client_id=? AND m.author_id IN (SELECT user_id FROM client_members WHERE client_id=? AND function='cliente')`, clientId, clientId)?.t;
  const lastAny = [last, lastMsg].filter(Boolean).sort().pop();
  if (!lastAny) s.push(sig('comunicacao', 'Comunicação', 'sem_dados', ['Nenhuma interação do cliente registrada na plataforma.']));
  else { const d = Math.floor((Date.now() - new Date(lastAny).getTime()) / DAY); s.push(sig('comunicacao', 'Comunicação', d > 45 ? 'risco' : d > 21 ? 'atencao' : 'ok', [`Última interação do cliente na plataforma há ${d} dia(s) (${fmtDay(lastAny)}).`], d)); }
  // 5. Uso da plataforma: último acesso dos usuários do cliente
  const users = all("SELECT u.name, u.last_login_at FROM client_members cm JOIN users u ON u.id=cm.user_id WHERE cm.client_id=? AND cm.function='cliente' AND u.active=1", clientId);
  if (!users.length) s.push(sig('uso', 'Uso da plataforma', 'sem_dados', ['O cliente ainda não tem acesso à área do cliente.']));
  else {
    const lastLogin = users.map((u) => u.last_login_at).filter(Boolean).sort().pop();
    const d = lastLogin ? Math.floor((Date.now() - new Date(lastLogin).getTime()) / DAY) : null;
    s.push(sig('uso', 'Uso da plataforma', d == null ? 'atencao' : d > 30 ? 'atencao' : 'ok', [d == null ? `${users.length} acesso(s) criado(s), nenhum login registrado.` : `Último login há ${d} dia(s).`], d));
  }
  // 6. Satisfação (respostas contextuais)
  const sat = all("SELECT rating, comment, moment, created_at FROM satisfaction_responses WHERE client_id=? AND created_at > ? ORDER BY created_at DESC", clientId, ago(120));
  if (!sat.length) s.push(sig('satisfacao', 'Satisfação', 'sem_dados', ['Nenhuma avaliação nos últimos 120 dias.']));
  else { const bad = sat.filter((x) => x.rating === 'poderia_melhorar'); s.push(sig('satisfacao', 'Satisfação', bad.length >= 2 ? 'risco' : bad.length ? 'atencao' : 'ok', sat.slice(0, 5).map((x) => `${fmtDay(x.created_at)} · ${{ excelente: 'Excelente', boa: 'Boa', poderia_melhorar: 'Poderia melhorar' }[x.rating]}${x.comment ? ` — “${x.comment.slice(0, 120)}”` : ''}`), bad.length)); }
  // 7. Solicitações: atendimento da The Bold dentro do prazo esperado
  const lateReq = all("SELECT title, expected_at FROM client_requests WHERE client_id=? AND status IN ('recebido','em_analise','em_andamento') AND expected_at < ?", clientId, now());
  const openReq = one("SELECT COUNT(*) n FROM client_requests WHERE client_id=? AND status NOT IN ('concluido','cancelado')", clientId).n;
  s.push(sig('solicitacoes', 'Solicitações', lateReq.length >= 2 ? 'risco' : lateReq.length ? 'atencao' : 'ok', [`${openReq} solicitação(ões) em aberto.`, ...lateReq.slice(0, 5).map((r) => `Prazo esperado vencido (${fmtDay(r.expected_at)}): “${r.title}”.`)], lateReq.length));
  // 8. Reuniões: cancelamentos e distância da última reunião
  const canc = one("SELECT COUNT(*) n FROM meetings WHERE client_id=? AND status='cancelada' AND starts_at > ?", clientId, ago(90)).n;
  const lastMeet = one("SELECT MAX(starts_at) t FROM meetings WHERE client_id=? AND status IN ('realizada','agendada') AND starts_at < ?", clientId, now())?.t;
  const nextMeet = one("SELECT MIN(starts_at) t FROM meetings WHERE client_id=? AND status='agendada' AND starts_at > ?", clientId, now())?.t;
  if (!lastMeet && !nextMeet && !canc) s.push(sig('reunioes', 'Reuniões', 'sem_dados', ['Nenhuma reunião registrada na plataforma.']));
  else { const d = lastMeet ? Math.floor((Date.now() - new Date(lastMeet).getTime()) / DAY) : null; s.push(sig('reunioes', 'Reuniões', canc >= 2 || (d > 60 && !nextMeet) ? 'atencao' : 'ok', [...(lastMeet ? [`Última reunião em ${fmtDay(lastMeet)}.`] : []), ...(nextMeet ? [`Próxima em ${fmtDay(nextMeet)}.`] : []), ...(canc ? [`${canc} cancelada(s) em 90 dias.`] : [])])); }
  // 9. Evolução: entregas publicadas/agendadas no último mês × pacote mensal
  const cl = one('SELECT monthly_posts FROM clients WHERE id=?', clientId);
  const delivered = one("SELECT COUNT(*) n FROM contents WHERE client_id=? AND stage IN ('agendado','publicado') AND COALESCE(published_at, scheduled_at, planned_at) BETWEEN ? AND ?", clientId, ago(30), now()).n;
  const planned = one("SELECT COUNT(*) n FROM contents WHERE client_id=? AND stage<>'cancelado' AND planned_at BETWEEN ? AND ?", clientId, ago(30), now()).n;
  if (!planned) s.push(sig('evolucao', 'Entregas', 'sem_dados', ['Nenhum conteúdo previsto nos últimos 30 dias.']));
  else s.push(sig('evolucao', 'Entregas', delivered / planned < 0.5 ? 'risco' : delivered / planned < 0.8 ? 'atencao' : 'ok', [`${delivered} de ${planned} conteúdos previstos nos últimos 30 dias foram agendados ou publicados (pacote: ${cl?.monthly_posts ?? '?'}/mês).`]));
  // 10. Pagamentos — detalhe só para quem tem acesso ao financeiro
  const inv = one("SELECT COUNT(*) n, MIN(due_at) first FROM invoices WHERE client_id=? AND status='atrasada'", clientId);
  const finOk = !viewer || can(viewer, 'financeiro');
  if (!one('SELECT 1 FROM invoices WHERE client_id=?', clientId)) s.push(sig('pagamentos', 'Pagamentos', 'sem_dados', ['Nenhuma parcela registrada no financeiro da plataforma.']));
  else s.push(sig('pagamentos', 'Pagamentos', inv.n >= 2 ? 'risco' : inv.n ? 'atencao' : 'ok', finOk ? [inv.n ? `${inv.n} parcela(s) em atraso desde ${fmtDay(inv.first)}.` : 'Sem parcelas em atraso.'] : [inv.n ? 'Há pendência financeira (detalhe restrito ao financeiro).' : 'Sem pendências financeiras.']));

  const withData = s.filter((x) => x.level !== 'sem_dados');
  const risks = withData.filter((x) => x.level === 'risco').length, atts = withData.filter((x) => x.level === 'atencao').length;
  const level = withData.length < 2 ? 'sem_dados' : risks || atts >= 3 ? 'risco' : atts ? 'atencao' : 'estavel';
  // Tendência: compara com a fotografia de 7+ dias atrás
  const prev = one('SELECT level, created_at FROM client_health_snapshots WHERE client_id=? AND created_at < ? ORDER BY created_at DESC LIMIT 1', clientId, ago(7));
  const rank = { estavel: 0, atencao: 1, risco: 2 };
  const trend = prev && rank[prev.level] != null && rank[level] != null && prev.level !== level
    ? { direction: rank[level] > rank[prev.level] ? 'piorou' : 'melhorou', from: prev.level, since: prev.created_at, text: `Risco de relacionamento ${rank[level] > rank[prev.level] ? 'aumentou' : 'diminuiu'}: ${LEVEL_LABEL[prev.level]} → ${LEVEL_LABEL[level]} (comparado a ${fmtDay(prev.created_at)}).` }
    : null;
  return { level, label: LEVEL_LABEL[level], signals: s, trend, computed_at: now() };
}
export const LEVEL_LABEL = { estavel: 'Estável', atencao: 'Atenção', risco: 'Risco', sem_dados: 'Sem dados suficientes' };

// Fotografia diária (scheduler): registra o nível e avisa CEO/Operações quando piora
export function snapshotHealth(notifyFn) {
  for (const c of all("SELECT id, name FROM clients WHERE status NOT IN ('encerrado')")) {
    const today = now().slice(0, 10);
    if (one('SELECT 1 FROM client_health_snapshots WHERE client_id=? AND substr(created_at,1,10)=?', c.id, today)) continue;
    const h = clientHealth(c.id);
    const last = one('SELECT level FROM client_health_snapshots WHERE client_id=? ORDER BY created_at DESC LIMIT 1', c.id);
    insert('client_health_snapshots', { id: uid('hs_'), client_id: c.id, level: h.level, signals: JSON.stringify(h.signals.map(({ key, level }) => ({ key, level }))), created_at: now() });
    const rank = { estavel: 0, atencao: 1, risco: 2 };
    if (last && rank[h.level] > (rank[last.level] ?? 9)) notifyFn?.(c, h, last.level);
  }
}
export const lastSnapshots = (clientId, n = 30) => all('SELECT level, signals, created_at FROM client_health_snapshots WHERE client_id=? ORDER BY created_at DESC LIMIT ?', clientId, n).map((r) => ({ ...r, signals: parseJSON(r.signals, []) }));
