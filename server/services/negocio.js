// NEGÓCIO — cálculos determinísticos de Recebimentos, Produção & Repasses, Custos, Metas e Rentabilidade.
// Regras: nenhum valor é presumido (sem regra cadastrada → "pendente de configuração"); a IA não calcula nem altera valor;
// cliente interno (THE BOLD) fica fora de receita e rentabilidade; só trabalho nascido na plataforma entra na apuração (regra 24).
import { one, all, run, insert, update, uid, now, parseJSON, tx } from '../db.js';
import { log, notify } from '../lib/core.js';
import { HttpError } from '../lib/permissions.js';
import { sendMail, mailConfigured } from './mail.js';

const DAY = 864e5;
const pad = (n) => String(n).padStart(2, '0');
export const monthOf = (iso) => (iso ? String(iso).slice(0, 7) : null);
export const currentMonth = () => now().slice(0, 7);
export const prevMonth = (ym) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; };
const monthRange = (ym) => { const [y, m] = ym.split('-').map(Number); return [new Date(Date.UTC(y, m - 1, 1)).toISOString(), new Date(Date.UTC(y, m, 1)).toISOString()]; };
export const validMonth = (ym) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(ym || ''));

// ═════════════ CONFIGURAÇÃO FINANCEIRA (settings "fin.*") ═════════════
// Sem decisão da CEO, os campos ficam vazios — e a tela mostra "aguardando decisão".
export const FIN_DEFAULTS = {
  'fin.dia_fechamento': null, // dia do mês em que a competência anterior é apurada e o relatório sai
  'fin.email_relatorio': null,
  'fin.cobrancas_pos_vencimento': 0, // quantas cobranças depois do vencimento (0 = nenhuma até a decisão)
  'fin.intervalo_pos_dias': 3,
  'fin.lembrete_d1': true,
  'fin.cobranca_d0': true,
  'fin.assinatura': 'Equipe THE BOLD',
  'fin.repasse_motivos_contabilizados': [], // motivos de não execução que entram na apuração (ex.: "cliente")
  'fin.tpl.lembrete_d1': { subject: 'THE BOLD — Lembrete de pagamento', body: 'Olá, {cliente}.\n\nPassando para lembrar que a parcela "{referencia}", no valor de {valor}, vence amanhã ({vencimento}).\n\nQualquer dúvida, é só responder este e-mail.\n\n{assinatura}' },
  'fin.tpl.cobranca_d0': { subject: 'THE BOLD — Pagamento com vencimento hoje', body: 'Olá, {cliente}.\n\nA parcela "{referencia}", no valor de {valor}, vence hoje ({vencimento}).\n\nSe o pagamento já foi feito, desconsidere esta mensagem.\n\n{assinatura}' },
  'fin.tpl.cobranca_pos': { subject: 'THE BOLD — Pagamento em aberto', body: 'Olá, {cliente}.\n\nNão identificamos o pagamento da parcela "{referencia}", no valor de {valor}, com vencimento em {vencimento}.\n\nSe já pagou, por favor nos envie o comprovante respondendo este e-mail.\n\n{assinatura}' },
};
export function finSetting(key) {
  const r = one('SELECT value FROM settings WHERE key=?', key);
  return r ? parseJSON(r.value, FIN_DEFAULTS[key]) : FIN_DEFAULTS[key];
}
export function finConfig() { return Object.fromEntries(Object.keys(FIN_DEFAULTS).map((k) => [k, finSetting(k)])); }
const REPASSE_KEYS = ['fin.dia_fechamento', 'fin.email_relatorio', 'fin.repasse_motivos_contabilizados'];
export function saveFinConfig(patch, actor, canRepasses) {
  const changed = [];
  for (const [k, v] of Object.entries(patch || {})) {
    if (!(k in FIN_DEFAULTS)) continue;
    if (REPASSE_KEYS.includes(k) && !canRepasses) throw new HttpError(403, 'Regras de repasse e fechamento: só quem tem permissão de Produção & Repasses.');
    if (k === 'fin.dia_fechamento' && v !== null && !(Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 28)) throw new HttpError(422, 'Dia de fechamento: de 1 a 28.');
    if (k === 'fin.cobrancas_pos_vencimento' && !(Number(v) >= 0 && Number(v) <= 5)) throw new HttpError(422, 'Cobranças depois do vencimento: de 0 a 5.');
    const before = finSetting(k);
    const val = k === 'fin.dia_fechamento' ? (v === null || v === '' ? null : Number(v)) : v;
    run('INSERT INTO settings (key,value,updated_by,updated_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at', k, JSON.stringify(val), actor.id, now());
    changed.push(k);
    log({ actor: actor.id, action: 'financeiro.config', entity: 'settings', id: k, summary: `Configuração financeira alterada: ${k}`, before: JSON.stringify(before), after: JSON.stringify(val) });
  }
  return changed;
}

// ═════════════ RECEBIMENTOS ═════════════
const money = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dayBR = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const fill = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
// Status de exibição: derivado da parcela + eventos de cobrança (nunca inventado)
export function invoiceStatus(inv, events, nowIso = now()) {
  if (inv.status === 'paga') return 'pagamento_confirmado';
  if (inv.status === 'cancelada') return 'cancelado';
  const last = (k) => events.filter((e) => e.kind === k).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (last('em_negociacao')) return 'em_negociacao';
  const today = nowIso.slice(0, 10), due = inv.due_at.slice(0, 10);
  if (due < today) return events.some((e) => e.kind === 'cobranca_pos' && e.status === 'enviado') ? 'cobranca_enviada' : 'pagamento_atrasado';
  if (due === today) return 'vencendo_hoje';
  if (events.some((e) => e.kind === 'lembrete_d1' && e.status === 'enviado')) return 'lembrete_enviado';
  return 'a_vencer';
}
export const INVOICE_STATUS = { a_vencer: 'A vencer', lembrete_enviado: 'Lembrete enviado', vencendo_hoje: 'Vencendo hoje', pagamento_confirmado: 'Pagamento confirmado', pagamento_atrasado: 'Pagamento atrasado', cobranca_enviada: 'Cobrança enviada', em_negociacao: 'Em negociação', cancelado: 'Cancelado' };

export function receivables() {
  const nowIso = now(), today = nowIso.slice(0, 10), month = currentMonth();
  const invoices = all("SELECT i.*, c.name client_name, c.kind client_kind FROM invoices i JOIN clients c ON c.id=i.client_id ORDER BY i.due_at");
  const evs = all('SELECT * FROM billing_events ORDER BY created_at DESC');
  const byInv = evs.reduce((m, e) => ((m[e.invoice_id] ||= []).push(e), m), {});
  const rows = invoices.map((i) => ({ ...i, display: invoiceStatus(i, byInv[i.id] || [], nowIso), events: (byInv[i.id] || []).length }));
  const open = rows.filter((r) => !['pagamento_confirmado', 'cancelado'].includes(r.display));
  const sum = (list, f = (r) => r.amount) => list.reduce((s, r) => s + (f(r) || 0), 0);
  const settings = Object.fromEntries(all('SELECT * FROM billing_settings').map((b) => [b.client_id, b]));
  const cal = {};
  for (const r of open.filter((x) => x.due_at.slice(0, 10) >= today && x.due_at < new Date(Date.parse(nowIso) + 45 * DAY).toISOString())) (cal[r.due_at.slice(0, 10)] ||= []).push({ id: r.id, client_id: r.client_id, client: r.client_name, amount: r.amount, description: r.description });
  return {
    indicators: {
      receber_hoje: sum(open.filter((r) => r.due_at.slice(0, 10) === today)),
      a_receber: sum(open.filter((r) => r.due_at.slice(0, 10) >= today)),
      atrasados: sum(open.filter((r) => r.due_at.slice(0, 10) < today)),
      recebidos_mes: sum(rows.filter((r) => r.display === 'pagamento_confirmado' && monthOf(r.paid_at) === month), (r) => r.paid_amount ?? r.amount),
      total_recebido: sum(rows.filter((r) => r.display === 'pagamento_confirmado'), (r) => r.paid_amount ?? r.amount),
      total_aberto: sum(open),
    },
    invoices: rows, calendar: Object.entries(cal).sort().map(([day, items]) => ({ day, items, total: items.reduce((s, x) => s + x.amount, 0) })),
    events: evs.slice(0, 200).map((e) => ({ ...e, client: one('SELECT name FROM clients WHERE id=?', e.client_id)?.name || null })),
    billing: settings, mail: mailConfigured(), config: finConfig(),
    clients: all("SELECT id, name FROM clients WHERE status<>'encerrado' AND kind<>'interno' ORDER BY name"),
  };
}

export function saveBilling(clientId, body, actor) {
  const c = one('SELECT id, name FROM clients WHERE id=?', clientId);
  if (!c) throw new HttpError(404, 'Cliente não encontrado.');
  const email = body.billing_email ? String(body.billing_email).trim() : null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(422, 'E-mail de cobrança inválido.');
  const dd = body.due_day === '' || body.due_day == null ? null : Number(body.due_day);
  if (dd !== null && !(dd >= 1 && dd <= 28)) throw new HttpError(422, 'Dia de pagamento: de 1 a 28.');
  const before = one('SELECT * FROM billing_settings WHERE client_id=?', clientId);
  const row = { client_id: clientId, billing_email: email, due_day: dd, recurrence: body.recurrence || 'mensal', status: body.status === 'pausado' ? 'pausado' : 'ativo', notes: body.notes || null, updated_by: actor.id, updated_at: now() };
  if (before) update('billing_settings', { client_id: clientId }, row); else insert('billing_settings', row);
  log({ actor: actor.id, action: 'financeiro.config_cliente', entity: 'client', id: clientId, client: clientId, summary: `Configuração de cobrança de ${c.name} alterada`, before: JSON.stringify(before || null), after: JSON.stringify(row) });
  return row;
}

async function deliver(inv, kind, scheduledFor, actor = null) {
  const cfg = one('SELECT * FROM billing_settings WHERE client_id=?', inv.client_id);
  const cl = one('SELECT name FROM clients WHERE id=?', inv.client_id);
  const tpl = finSetting(`fin.tpl.${kind === 'reenvio_manual' ? (inv.due_at.slice(0, 10) < now().slice(0, 10) ? 'cobranca_pos' : 'cobranca_d0') : kind}`);
  const vars = { cliente: cl?.name || '', valor: money(inv.amount), vencimento: dayBR(inv.due_at), referencia: inv.description, assinatura: finSetting('fin.assinatura') };
  const ev = { id: uid('be_'), invoice_id: inv.id, client_id: inv.client_id, kind, scheduled_for: scheduledFor, to_email: cfg?.billing_email || null, subject: fill(tpl.subject, vars), actor_id: actor?.id || null, created_at: now() };
  if (cfg?.status === 'pausado') return insert('billing_events', { ...ev, status: 'nao_enviado', error: 'Cobrança pausada para este cliente.' });
  if (!cfg?.billing_email) return insert('billing_events', { ...ev, status: 'nao_enviado', error: 'Cliente sem e-mail de cobrança cadastrado.' });
  if (!mailConfigured()) return insert('billing_events', { ...ev, status: 'nao_enviado', error: 'E-mail não configurado no servidor (Resend).' });
  const r = await sendMail({ to: cfg.billing_email, subject: ev.subject, text: fill(tpl.body, vars), html: `<p>${fill(tpl.body, vars).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>` });
  return insert('billing_events', { ...ev, status: r.sent ? 'enviado' : 'falhou', sent_at: r.sent ? now() : null, error: r.sent ? null : r.reason });
}

// Rotina diária (idempotente pelo índice único invoice+tipo+data): D-1 lembrete, D0 cobrança, D+N só se a CEO definir a quantidade
export async function billingRoutine() {
  const nowIso = now(), today = nowIso.slice(0, 10);
  const tomorrow = new Date(Date.parse(today) + DAY).toISOString().slice(0, 10);
  const pos = Number(finSetting('fin.cobrancas_pos_vencimento')) || 0, step = Number(finSetting('fin.intervalo_pos_dias')) || 3;
  const out = { lembrete_d1: 0, cobranca_d0: 0, cobranca_pos: 0 };
  for (const inv of all("SELECT i.* FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.status IN ('aberta','atrasada') AND c.kind<>'interno'")) {
    const due = inv.due_at.slice(0, 10);
    const done = (kind, d) => one('SELECT 1 FROM billing_events WHERE invoice_id=? AND kind=? AND scheduled_for=?', inv.id, kind, d);
    if (one("SELECT 1 FROM billing_events WHERE invoice_id=? AND kind='em_negociacao'", inv.id)) continue;
    if (due === tomorrow && finSetting('fin.lembrete_d1') && !done('lembrete_d1', today)) { await deliver(inv, 'lembrete_d1', today); out.lembrete_d1++; }
    if (due === today && finSetting('fin.cobranca_d0') && !done('cobranca_d0', today)) { await deliver(inv, 'cobranca_d0', today); out.cobranca_d0++; }
    for (let n = 1; n <= pos; n++) {
      const d = new Date(Date.parse(due) + n * step * DAY).toISOString().slice(0, 10);
      if (d === today && !done('cobranca_pos', today)) { await deliver(inv, 'cobranca_pos', today); out.cobranca_pos++; }
    }
  }
  return out;
}

export async function invoiceAction(id, action, body, actor) {
  const inv = one('SELECT * FROM invoices WHERE id=?', id);
  if (!inv) throw new HttpError(404, 'Parcela não encontrada.');
  const base = { id: uid('be_'), invoice_id: inv.id, client_id: inv.client_id, actor_id: actor.id, note: body?.note || null, created_at: now() };
  if (action === 'pagar') {
    const paidAt = body?.paid_at ? new Date(body.paid_at).toISOString() : now();
    if (Number.isNaN(Date.parse(paidAt))) throw new HttpError(422, 'Data inválida.');
    const amount = Number(body?.amount) || inv.amount;
    tx(() => {
      update('invoices', { id: inv.id }, { status: 'paga', paid_at: paidAt, paid_amount: amount });
      insert('billing_events', { ...base, kind: 'pagamento_confirmado', status: 'registrado', note: [body?.competencia ? `Competência ${body.competencia}` : null, body?.note].filter(Boolean).join(' · ') || null });
    });
    log({ actor: actor.id, action: 'financeiro.pagamento', entity: 'invoice', id: inv.id, client: inv.client_id, summary: `Pagamento confirmado manualmente: ${inv.description} (${money(amount)})`, before: inv.status, after: 'paga' });
    return { ok: true };
  }
  if (action === 'negociacao') {
    insert('billing_events', { ...base, kind: 'em_negociacao', status: 'registrado' });
    log({ actor: actor.id, action: 'financeiro.negociacao', entity: 'invoice', id: inv.id, client: inv.client_id, summary: `Parcela em negociação: ${inv.description}` });
    return { ok: true };
  }
  if (action === 'cancelar') {
    if (!body?.note?.trim()) throw new HttpError(422, 'Informe o motivo do cancelamento.');
    update('invoices', { id: inv.id }, { status: 'cancelada' });
    insert('billing_events', { ...base, kind: 'cancelada', status: 'registrado' });
    log({ actor: actor.id, action: 'financeiro.cancelamento', entity: 'invoice', id: inv.id, client: inv.client_id, summary: `Parcela cancelada: ${inv.description} — ${body.note}`, before: inv.status, after: 'cancelada' });
    return { ok: true };
  }
  if (action === 'reenviar') return deliver(inv, 'reenvio_manual', now().slice(0, 10), actor);
  throw new HttpError(400, 'Ação desconhecida.');
}

// ═════════════ PRODUÇÃO & REPASSES ═════════════
export const EXEC = { concluido: 'Concluído', nao_realizado_cliente: 'Não realizado · aguardando cliente/material', nao_realizado_sem_motivo: 'Não realizado · sem motivo registrado', bloqueado: 'Bloqueado', cancelado: 'Cancelado', em_andamento: 'Em andamento', agendado: 'Agendado (etapa ainda não abriu)' };
export const MOTIVO = { nao_realizado_cliente: 'cliente', bloqueado: 'processo', nao_realizado_sem_motivo: 'sem_motivo', cancelado: 'escopo' };
const qsum = (ls) => ls.reduce((n, l) => n + (l.qty || 1), 0);
const specificity = (r) => ['user_id', 'function', 'task_kind', 'client_id'].filter((k) => r[k]).length;
export function rateFor(t, at, rates) {
  const ok = rates.filter((r) => r.active && (!r.user_id || r.user_id === t.user_id) && (!r.function || r.function === t.function) && (!r.task_kind || r.task_kind === t.kind)
    && (!r.client_id || r.client_id === t.client_id) && r.starts_at <= at && (!r.ends_at || r.ends_at >= at));
  return ok.sort((a, b) => specificity(b) - specificity(a) || b.starts_at.localeCompare(a.starts_at))[0] || null;
}
// Apuração ao vivo de uma competência (YYYY-MM): demandas nascidas na plataforma, status de execução, valor pela regra cadastrada
export function apuracao(ym) {
  if (!validMonth(ym)) throw new HttpError(422, 'Competência inválida (AAAA-MM).');
  const [s, e] = monthRange(ym);
  const nowIso = now();
  const rates = all('SELECT * FROM payout_rates');
  const counted = finSetting('fin.repasse_motivos_contabilizados') || [];
  const tasks = all(`SELECT t.id, t.title, t.kind, t.function, t.status, t.due_at, t.completed_at, t.client_id, t.content_id, COALESCE(t.completed_by, t.assignee_id) user_id,
      u.name user_name, cl.name client_name, c.blocked, c.waiting_on, c.block_reason
    FROM tasks t LEFT JOIN users u ON u.id=COALESCE(t.completed_by, t.assignee_id) LEFT JOIN clients cl ON cl.id=t.client_id LEFT JOIN contents c ON c.id=t.content_id
    WHERE t.data_origin='plataforma' AND COALESCE(t.completed_by, t.assignee_id) IS NOT NULL AND (cl.kind IS NULL OR cl.kind<>'interno')
      AND ((t.status='concluida' AND t.completed_at >= ? AND t.completed_at < ?) OR (t.status<>'concluida' AND t.status<>'legado' AND t.due_at >= ? AND t.due_at < ?))
    ORDER BY u.name, t.due_at`, s, e, s, e);
  const reprog = new Set(all("SELECT entity_id FROM activity_logs WHERE action='tarefa.alterada' AND entity_type='task' AND after LIKE '%due_at%'").map((r) => r.entity_id));
  const lines = tasks.map((t) => {
    const exec = t.status === 'concluida' ? 'concluido' : t.status === 'cancelada' ? 'cancelado' : t.status === 'agendada' ? 'agendado'
      : t.blocked && t.waiting_on === 'cliente' ? 'nao_realizado_cliente' : t.blocked ? 'bloqueado' : t.due_at < nowIso ? 'nao_realizado_sem_motivo' : 'em_andamento';
    const conta = exec === 'concluido' || (MOTIVO[exec] && counted.includes(MOTIVO[exec]));
    const r = conta ? rateFor(t, (t.completed_at || t.due_at || s).slice(0, 10), rates) : null;
    return { ...t, qty: 1, origem: 'processo', exec, exec_label: EXEC[exec], motivo: MOTIVO[exec] || null, reprogramado: reprog.has(t.id), conta, rate_id: r?.id || null, value: conta ? (r ? r.value : null) : 0 };
  });
  // Demandas lançadas à mão (botão "Adicionar demanda"): mesma regra de contagem; valor informado ou o da regra cadastrada × quantidade
  const MAN_EXEC = (m) => (m.status === 'concluido' ? 'concluido' : m.status === 'cancelado' ? 'cancelado' : m.status === 'previsto' ? 'em_andamento'
    : m.motivo === 'cliente' ? 'nao_realizado_cliente' : m.motivo === 'processo' ? 'bloqueado' : 'nao_realizado_sem_motivo');
  for (const m of all(`SELECT m.*, u.name user_name, cl.name client_name FROM payout_manual_items m JOIN users u ON u.id=m.user_id LEFT JOIN clients cl ON cl.id=m.client_id
      WHERE m.competencia=? AND m.revoked_at IS NULL ORDER BY u.name, m.created_at`, ym)) {
    const exec = MAN_EXEC(m);
    const conta = exec === 'concluido' || (MOTIVO[exec] && counted.includes(MOTIVO[exec]));
    const r = conta && m.unit_value == null ? rateFor({ ...m, kind: 'manual' }, `${ym}-15`, rates) : null;
    const unit = m.unit_value != null ? m.unit_value : r ? r.value : null;
    lines.push({ id: m.id, title: m.description, kind: 'manual', function: m.function, status: m.status, due_at: null, completed_at: null, client_id: m.client_id, user_id: m.user_id, user_name: m.user_name, client_name: m.client_name,
      qty: m.quantity, unit_value: unit, value_source: m.unit_value != null ? 'informado' : r ? 'regra' : null, origem: 'manual', note: m.note, created_at: m.created_at,
      exec, exec_label: EXEC[exec], motivo: exec === 'concluido' ? null : (m.motivo || MOTIVO[exec] || null), reprogramado: false, conta, rate_id: r?.id || null, value: conta ? (unit == null ? null : unit * m.quantity) : 0 });
  }
  const adj = all('SELECT a.*, u.name user_name FROM payout_adjustments a JOIN users u ON u.id=a.user_id WHERE a.competencia=? AND a.revoked_at IS NULL', ym);
  const people = {};
  for (const l of lines) {
    const p = (people[l.user_id] ||= { user_id: l.user_id, name: l.user_name, previstas: 0, concluidas: 0, nao_realizadas: 0, bloqueadas: 0, canceladas: 0, contabilizadas: 0, pendentes_regra: 0, valor_apurado: 0, ajustes: 0 });
    const q = l.qty || 1;
    p.previstas += q;
    if (l.exec === 'concluido') p.concluidas += q;
    if (l.exec.startsWith('nao_realizado')) p.nao_realizadas += q;
    if (l.exec === 'bloqueado') p.bloqueadas += q;
    if (l.exec === 'cancelado') p.canceladas += q;
    if (l.conta) { p.contabilizadas += q; if (l.value == null) p.pendentes_regra += q; else p.valor_apurado += l.value; }
  }
  for (const a of adj) (people[a.user_id] ||= { user_id: a.user_id, name: a.user_name, previstas: 0, concluidas: 0, nao_realizadas: 0, bloqueadas: 0, canceladas: 0, contabilizadas: 0, pendentes_regra: 0, valor_apurado: 0, ajustes: 0 }).ajustes += a.amount;
  const list = Object.values(people).map((p) => ({ ...p, valor_final: p.pendentes_regra ? null : p.valor_apurado + p.ajustes })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const motivos = lines.filter((l) => l.exec !== 'concluido' && l.exec !== 'em_andamento' && l.exec !== 'agendado').reduce((m, l) => ((m[l.motivo || 'outros'] = (m[l.motivo || 'outros'] || 0) + (l.qty || 1)), m), {});
  return {
    competencia: ym, lines, people: list, adjustments: adj, motivos,
    totals: { previstas: qsum(lines), concluidas: qsum(lines.filter((l) => l.exec === 'concluido')), contabilizadas: qsum(lines.filter((l) => l.conta)), excluidas: qsum(lines.filter((l) => !l.conta)),
      pendentes_regra: qsum(lines.filter((l) => l.conta && l.value == null)), valor_apurado: lines.reduce((s2, l) => s2 + (l.value || 0), 0), ajustes: adj.reduce((s2, a) => s2 + a.amount, 0) },
    has_rates: rates.some((r) => r.active),
  };
}

export const CLOSING_FLOW = { rascunho: ['em_revisao'], em_revisao: ['aguardando_aprovacao', 'rascunho'], aguardando_aprovacao: ['aprovado', 'em_revisao'], aprovado: ['fechado', 'em_revisao'], fechado: ['reaberto'], reaberto: ['em_revisao'] };
export const CLOSING_LABEL = { rascunho: 'Rascunho', em_revisao: 'Em revisão', aguardando_aprovacao: 'Aguardando aprovação', aprovado: 'Aprovado', fechado: 'Fechado', reaberto: 'Reaberto' };
export function closingOf(ym) { const c = one('SELECT * FROM payout_closings WHERE competencia=?', ym); return c ? { ...c, snapshot: parseJSON(c.snapshot, null), totals: parseJSON(c.totals, null), label: CLOSING_LABEL[c.status] } : null; }

export async function moveClosing(ym, to, actor, { canApprove, note } = {}) {
  if (!validMonth(ym)) throw new HttpError(422, 'Competência inválida.');
  let c = closingOf(ym);
  if (!c) { insert('payout_closings', { id: uid('pc_'), competencia: ym, status: 'rascunho', updated_by: actor.id, updated_at: now(), created_at: now() }); c = closingOf(ym); if (to === 'rascunho') return c; }
  if (!CLOSING_FLOW[c.status]?.includes(to)) throw new HttpError(409, `Não é possível ir de “${CLOSING_LABEL[c.status]}” para “${CLOSING_LABEL[to] || to}”.`);
  if (['aprovado', 'fechado', 'reaberto'].includes(to) && !canApprove) throw new HttpError(403, 'Aprovar, fechar ou reabrir a competência exige a permissão de aprovação de repasses.');
  if (to === 'reaberto' && !note?.trim()) throw new HttpError(422, 'Reabrir exige o motivo.');
  const ap = apuracao(ym);
  if (to === 'fechado' && ap.totals.pendentes_regra) throw new HttpError(409, `Há ${ap.totals.pendentes_regra} demanda(s) contabilizável(is) sem regra de valor. Cadastre os valores antes de fechar.`);
  const patch = { status: to, updated_by: actor.id, updated_at: now() };
  if (to === 'fechado') Object.assign(patch, { snapshot: JSON.stringify({ people: ap.people, lines: ap.lines, adjustments: ap.adjustments, motivos: ap.motivos, frozen_at: now() }), totals: JSON.stringify(ap.totals) });
  update('payout_closings', { competencia: ym }, patch);
  log({ actor: actor.id, action: 'repasse.fechamento', entity: 'payout_closing', id: c.id, summary: `Repasses ${ym}: ${CLOSING_LABEL[c.status]} → ${CLOSING_LABEL[to]}${note ? ` — ${note}` : ''}`, before: c.status, after: to });
  if (to === 'fechado') await sendClosingReport(ym);
  return closingOf(ym);
}

export async function sendClosingReport(ym) {
  const c = closingOf(ym);
  const to = finSetting('fin.email_relatorio');
  const t = c?.totals || apuracao(ym).totals;
  const people = c?.snapshot?.people || apuracao(ym).people;
  const text = [`THE BOLD — Relatório de produção e repasses · competência ${ym}`, '', `Demandas previstas: ${t.previstas} · concluídas: ${t.concluidas} · contabilizadas: ${t.contabilizadas}`, `Valor apurado: ${money(t.valor_apurado)} · ajustes: ${money(t.ajustes)}`, '', ...people.map((p) => `${p.name}: ${p.contabilizadas} contabilizada(s) · ${p.valor_final == null ? 'valor pendente de regra' : money(p.valor_final)}`), '', 'O relatório completo fica salvo em Negócio → Produção & Repasses → Fechamentos.'].join('\n');
  let err = null;
  if (!to) err = 'E-mail do relatório não definido na Configuração financeira.';
  else if (!mailConfigured()) err = 'E-mail não configurado no servidor (Resend).';
  else { const r = await sendMail({ to, subject: `THE BOLD — Repasses ${ym}`, text, html: `<pre style="font-family:inherit">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>` }); if (!r.sent) err = r.reason; }
  if (c) update('payout_closings', { competencia: ym }, { report_sent_at: err ? null : now(), report_error: err });
  return { sent: !err, error: err };
}

// Rotina: registro diário da apuração da competência corrente + relatório no dia de fechamento (competência anterior)
export async function payoutRoutine() {
  const today = now().slice(0, 10), ym = currentMonth();
  if (!one('SELECT 1 FROM payout_daily WHERE competencia=? AND date=?', ym, today)) {
    const a = apuracao(ym);
    const prev = one('SELECT total FROM payout_daily WHERE competencia=? ORDER BY date DESC LIMIT 1', ym);
    insert('payout_daily', { competencia: ym, date: today, counted: a.totals.contabilizadas, excluded: a.totals.excluidas, total: a.totals.valor_apurado, pending_rules: a.totals.pendentes_regra, diff: prev ? a.totals.valor_apurado - (prev.total || 0) : null, created_at: now() });
  }
  const day = finSetting('fin.dia_fechamento');
  if (day && Number(today.slice(8, 10)) === Number(day)) {
    const pm = prevMonth(ym);
    let c = closingOf(pm);
    if (!c) { insert('payout_closings', { id: uid('pc_'), competencia: pm, status: 'aguardando_aprovacao', updated_by: null, updated_at: now(), created_at: now() }); c = closingOf(pm); }
    if (!c.report_sent_at && !['fechado'].includes(c.status)) {
      const r = await sendClosingReport(pm);
      const ceo = all("SELECT u.id FROM users u WHERE u.active=1 AND u.role_key='ceo'").map((x) => x.id);
      notify(ceo, { level: 'atencao', type: 'financeiro', title: `Apuração de repasses ${pm} pronta para revisão`, body: r.sent ? 'Relatório enviado por e-mail.' : `Relatório não enviado: ${r.error}`, link: '/negocio?aba=repasses' });
    }
  }
}

// ═════════════ CUSTOS · METAS · RENTABILIDADE ═════════════
export const COST_CATEGORIES = { aluguel: 'Aluguel', ferramentas: 'Ferramentas', equipe: 'Equipe', impostos: 'Impostos', marketing: 'Marketing', outros: 'Outros' };
export function costsOf(ym) {
  return all(`SELECT f.*, c.name client_name FROM finance_costs f LEFT JOIN clients c ON c.id=f.client_id WHERE f.active=1 AND (
    (f.kind='unico' AND f.competencia=?) OR (f.kind='recorrente' AND substr(f.starts_at,1,7) <= ? AND (f.ends_at IS NULL OR substr(f.ends_at,1,7) >= ?)))
    ORDER BY f.category, f.description`, ym, ym, ym);
}
const external = "c.kind<>'interno'";
function revenueOf(ym, clientId = null) {
  const q = (sql) => one(sql + (clientId ? ' AND i.client_id=?' : ''), ym, ...(clientId ? [clientId] : [])).v || 0;
  return {
    faturado: q(`SELECT SUM(i.amount) v FROM invoices i JOIN clients c ON c.id=i.client_id WHERE ${external} AND i.status<>'cancelada' AND substr(i.due_at,1,7)=?`),
    recebido: q(`SELECT SUM(COALESCE(i.paid_amount,i.amount)) v FROM invoices i JOIN clients c ON c.id=i.client_id WHERE ${external} AND i.status='paga' AND substr(i.paid_at,1,7)=?`),
  };
}
export function rentabilidade(ym) {
  if (!validMonth(ym)) throw new HttpError(422, 'Competência inválida.');
  const ap = apuracao(ym);
  const costs = costsOf(ym);
  const rev = revenueOf(ym);
  const repasses = ap.totals.pendentes_regra ? null : ap.totals.valor_apurado + ap.totals.ajustes;
  const custos = costs.reduce((s, c) => s + c.amount, 0);
  const hasRevenue = !!one(`SELECT 1 FROM invoices i JOIN clients c ON c.id=i.client_id WHERE ${external} LIMIT 1`);
  const margem = !hasRevenue || repasses == null || !costs.length ? null : rev.faturado - custos - repasses;
  const [s, e] = monthRange(ym);
  const clients = all(`SELECT DISTINCT c.id, c.name FROM clients c WHERE ${external} AND (
      EXISTS (SELECT 1 FROM invoices i WHERE i.client_id=c.id AND substr(i.due_at,1,7)=?) OR EXISTS (SELECT 1 FROM finance_costs f WHERE f.client_id=c.id AND f.active=1)
      OR EXISTS (SELECT 1 FROM adjustments a JOIN contents ct ON ct.id=a.content_id WHERE ct.client_id=c.id AND ct.data_origin='plataforma' AND a.created_at >= ? AND a.created_at < ?)
      OR EXISTS (SELECT 1 FROM tasks t WHERE t.client_id=c.id AND t.data_origin='plataforma' AND t.status='concluida' AND t.completed_at >= ? AND t.completed_at < ?)
      OR EXISTS (SELECT 1 FROM payout_manual_items m WHERE m.client_id=c.id AND m.competencia=? AND m.revoked_at IS NULL)) ORDER BY c.name`, ym, s, e, s, e, ym)
    .map((c) => {
      const r = revenueOf(ym, c.id);
      const direct = costs.filter((x) => x.client_id === c.id).reduce((s2, x) => s2 + x.amount, 0);
      const cl = ap.lines.filter((l) => l.client_id === c.id && l.conta);
      const rep = cl.some((l) => l.value == null) ? null : cl.reduce((s2, l) => s2 + l.value, 0);
      const adjs = one(`SELECT SUM(a.origin='interno') i, SUM(a.origin='cliente') c FROM adjustments a JOIN contents ct ON ct.id=a.content_id WHERE ct.client_id=? AND ct.data_origin='plataforma' AND a.created_at >= ? AND a.created_at < ?`, c.id, s, e);
      const retrab = cl.filter((l) => l.kind === 'ajuste');
      return { id: c.id, name: c.name, receita: r.faturado, recebido: r.recebido, custos_diretos: direct, repasses: rep, demandas: qsum(cl),
        ajustes_internos: adjs.i || 0, ajustes_cliente: adjs.c || 0, custo_retrabalho: retrab.some((l) => l.value == null) ? null : retrab.reduce((s2, l) => s2 + l.value, 0),
        margem: rep == null || !r.faturado ? null : r.faturado - direct - rep };
    });
  const evol = [];
  let m = ym;
  for (let i = 0; i < 6; i++) { const rv = revenueOf(m); const cs = costsOf(m).reduce((s2, c) => s2 + c.amount, 0); evol.unshift({ competencia: m, faturado: rv.faturado, recebido: rv.recebido, custos: cs }); m = prevMonth(m); }
  return {
    competencia: ym, receita: rev, custos, custos_n: costs.length, repasses, repasses_pendentes: ap.totals.pendentes_regra, margem,
    states: {
      receita: hasRevenue ? 'ativo' : 'dados_insuficientes',
      custos: costs.length ? 'ativo' : 'aguardando_configuracao',
      repasses: !ap.has_rates ? 'aguardando_configuracao' : ap.totals.pendentes_regra ? 'aguardando_configuracao' : ap.totals.previstas ? 'ativo' : 'dados_insuficientes',
      margem: margem == null ? (hasRevenue ? 'aguardando_configuracao' : 'dados_insuficientes') : 'ativo',
      evolucao: evol.filter((x) => x.faturado || x.custos).length >= 2 ? 'ativo' : 'dados_insuficientes',
    },
    clients, evolucao: evol,
  };
}
const GOAL_METRICS = { faturado: 'Faturado', recebido: 'Recebido', novos_clientes: 'Novos clientes', margem: 'Margem' };
export function metas(ym) {
  if (!validMonth(ym)) throw new HttpError(422, 'Competência inválida.');
  const goals = all('SELECT * FROM finance_goals WHERE competencia=?', ym);
  const rev = revenueOf(ym);
  const [s, e] = monthRange(ym);
  const nowMs = Date.parse(now());
  const frac = Math.min(1, Math.max(0, (nowMs - Date.parse(s)) / (Date.parse(e) - Date.parse(s))));
  const rent = rentabilidade(ym);
  const realized = { faturado: rev.faturado, recebido: rev.recebido, novos_clientes: one("SELECT COUNT(*) n FROM clients WHERE kind<>'interno' AND created_at >= ? AND created_at < ?", s, e).n, margem: rent.margem };
  return {
    competencia: ym, metrics: GOAL_METRICS,
    items: Object.keys(GOAL_METRICS).map((k) => {
      const g = goals.find((x) => x.metric === k);
      const real = realized[k];
      // Projeção linear só para valores acumulados no mês (recebido, novos clientes); faturado já é o previsto do mês
      const proj = real == null ? null : k === 'recebido' || k === 'novos_clientes' ? (frac > 0.05 && frac < 1 ? real / frac : real) : real;
      return { metric: k, label: GOAL_METRICS[k], target: g?.target ?? null, realizado: real, projecao: proj, desvio: g && proj != null ? proj - g.target : null,
        state: !g ? 'aguardando_decisao' : real == null ? 'dados_insuficientes' : 'ativo' };
    }),
  };
}
