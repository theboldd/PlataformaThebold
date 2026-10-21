// DECISÕES DO CLIENTE · "SUA MARCA, COMO A THE BOLD ENTENDE" · PULSO DA MARCA
// Separação estrita: o cliente só vê o que a equipe marcou como compartilhado (nunca observações internas, nunca hipóteses da IA).
// Toda mudança vira histórico (antes/depois, quem, quando, origem) — nada é sobrescrito em silêncio.
import { one, all, insert, update, run, uid, now, tx, parseJSON } from '../db.js';
import { log, notify, businessDaysFrom, userName } from '../lib/core.js';
import { HttpError } from '../lib/permissions.js';
import { resolveAssignee, clientUsers } from '../engine/process.js';
import { automation } from '../engine/automations.js';

const strategist = (clientId) => resolveAssignee(clientId, 'estrategia') || resolveAssignee(clientId, 'atendimento');
const teamOf = (clientId) => all("SELECT DISTINCT user_id FROM client_members WHERE client_id=? AND function IN ('estrategia','atendimento')", clientId).map((r) => r.user_id);
const followUp = (clientId, actorId, { title, description, assignee, source_type, source_id, days = 1 }) => {
  const due = businessDaysFrom(new Date(now()), days); due.setHours(21, 0, 0, 0);
  return insert('tasks', { id: uid('t_'), title: title.slice(0, 200), description, client_id: clientId, function: 'estrategia', assignee_id: assignee, status: 'aberta', kind: 'follow_up', origin: 'automacao', source_type, source_id, priority: 'media', due_at: due.toISOString(), created_by: actorId, created_at: now() });
};

// Procedência legível (nunca misturar origens)
export function originLabel(e) {
  if (e.origin === 'onboarding_cliente') return ['notion', 'notion_onboarding'].includes(e.source_type) ? 'Cliente · migrado do Notion' : 'Cliente · preenchido na plataforma';
  return { cliente: 'Cliente · preenchido na plataforma', equipe: 'The Bold · registrado pela equipe', observacao_interna: 'Observação interna', ia: 'IA · sugestão (não oficial)', decisao: 'Decisão', indefinido: 'Origem a confirmar' }[e.origin] || 'Origem a confirmar';
}
// Registro no Client Brain com histórico do valor anterior
export function setBrainContent(entry, content, actor, { reason = null, origin = null } = {}) {
  if (entry.content === content) return entry;
  insert('client_brain_history', { id: uid('bh_'), entry_id: entry.id, client_id: entry.client_id, content_before: entry.content, content_after: content, changed_by: actor?.id || null, origin: origin || entry.origin, reason, created_at: now() });
  update('client_brain_entries', { id: entry.id }, { content, updated_by: actor?.id || null, updated_at: now() });
  return one('SELECT * FROM client_brain_entries WHERE id=?', entry.id);
}

// ═════════ CENTRAL DE DECISÕES (decisões pedidas pela equipe) ═════════
export const DECISION_KINDS = { escolha: 'Escolha entre opções', confirmacao: 'Confirmação', resposta: 'Resposta estratégica', data: 'Confirmação de data', outro: 'Outra decisão' };
export function createDecision(clientId, actor, { kind, title, context, consequence, options = [], due_at, brain_section = null, ref_type = null, ref_id = null }) {
  if (!DECISION_KINDS[kind]) throw new HttpError(422, 'Tipo de decisão inválido.');
  if (!String(title || '').trim()) throw new HttpError(422, 'Escreva o título da decisão.');
  options = (Array.isArray(options) ? options : []).map((o) => String(o).trim()).filter(Boolean).slice(0, 8);
  if (kind === 'escolha' && options.length < 2) throw new HttpError(422, 'Uma escolha precisa de ao menos duas opções.');
  if (kind === 'confirmacao' && !options.length) options = ['Confirmo', 'Prefiro conversar'];
  const d = insert('client_decisions', { id: uid('dc_'), client_id: clientId, kind, title: title.trim(), context: context?.trim() || null, consequence: consequence?.trim() || null, options: JSON.stringify(options),
    due_at: due_at ? new Date(due_at).toISOString() : null, brain_section, ref_type, ref_id, status: 'pendente', owner_id: actor.id, created_by: actor.id, created_at: now() });
  log({ actor: actor.id, action: 'decisao.pedida', entity: 'client_decision', id: d.id, client: clientId, visibility: 'client', summary: `A The Bold pediu sua decisão: ${d.title}` });
  automation('decisao.pedida', { entity: 'client_decision', id: d.id, client: clientId, detail: kind });
  notify(clientUsers(clientId), { level: 'atencao', type: 'decisao', title: 'Uma decisão precisa de você', body: `${d.title}${d.consequence ? ` — ${d.consequence}` : ''}`, cta: kind === 'resposta' ? 'Responder' : 'Decidir', link: `/portal/decisoes?d=${d.id}`, client: clientId });
  return d;
}
export const decisionDTO = (d) => ({ ...d, options: parseJSON(d.options, []), kind_label: DECISION_KINDS[d.kind], answered_by_name: d.answered_by ? userName(d.answered_by) : null });

export function answerDecision(id, clientId, actor, { answer, note }) {
  const d = one('SELECT * FROM client_decisions WHERE id=? AND client_id=?', id, clientId);
  if (!d) throw new HttpError(404, 'Decisão não encontrada.');
  if (d.status !== 'pendente') throw new HttpError(409, 'Esta decisão já foi registrada.');
  const opts = parseJSON(d.options, []);
  answer = String(answer || '').trim(); note = String(note || '').trim();
  if (!answer) throw new HttpError(422, d.kind === 'resposta' ? 'Escreva sua resposta.' : 'Escolha uma opção.');
  if (['escolha', 'confirmacao'].includes(d.kind) && opts.length && !opts.includes(answer)) throw new HttpError(422, 'Opção inválida.');
  if (answer.length > 8000 || note.length > 4000) throw new HttpError(422, 'Texto muito longo.');
  const owner = d.owner_id && one('SELECT active FROM users WHERE id=?', d.owner_id)?.active ? d.owner_id : strategist(clientId);
  tx(() => {
    const task = followUp(clientId, actor.id, { title: `Dar sequência à decisão do cliente — ${d.title}`, description: `Resposta: ${answer}${note ? `\nObservação: ${note}` : ''}`, assignee: owner, source_type: 'client_decision', source_id: d.id });
    update('client_decisions', { id }, { status: 'respondida', answer, answer_note: note || null, answered_by: actor.id, answered_at: now(), task_id: task.id });
    insert('client_memories', { id: uid('cm_'), client_id: clientId, kind: 'decisao', body: `${d.title}: ${answer}${note ? ` (${note})` : ''}`, source_type: 'client_decision', source_id: d.id, created_by: actor.id, created_at: now() });
    // Quando aplicável, a resposta vira informação oficial do Client Brain com origem DECISÃO (nunca mistura com dados da equipe)
    if (d.brain_section) insert('client_brain_entries', { id: uid('be_'), client_id: clientId, section: d.brain_section, label: d.title, content: `${answer}${note ? `\n${note}` : ''}`, origin: 'decisao', source_type: 'plataforma', source_ref: `decisao:${d.id}`, created_by: actor.id, created_at: now() });
  });
  log({ actor: actor.id, action: 'decisao.respondida', entity: 'client_decision', id, client: clientId, visibility: 'client', summary: `Decisão registrada: ${d.title} → ${answer.slice(0, 120)}` });
  automation('decisao.respondida', { entity: 'client_decision', id, client: clientId });
  notify([owner, ...teamOf(clientId)], { level: 'atencao', type: 'decisao', title: `${one('SELECT name FROM clients WHERE id=?', clientId).name} decidiu: ${d.title}`, body: answer.slice(0, 160), link: `/clientes/${clientId}?tab=decisoes`, client: clientId, exclude: actor.id });
  return one('SELECT * FROM client_decisions WHERE id=?', id);
}

// ═════════ SUA MARCA, COMO A THE BOLD ENTENDE ═════════
const BRAND_ORDER = ['posicionamento', 'identidade', 'publico', 'persona', 'tom', 'linguagem', 'diferenciais', 'objetivos', 'estrategia'];
export const BRAND_LABEL = { posicionamento: 'Posicionamento', identidade: 'Personalidade', publico: 'Público', persona: 'Público', tom: 'Tom de voz', linguagem: 'Personalidade', diferenciais: 'Diferenciais', objetivos: 'Objetivos', estrategia: 'Direcionamentos estratégicos' };
export function brandForClient(clientId) {
  const rows = all("SELECT * FROM client_brain_entries WHERE client_id=? AND shared=1 AND origin NOT IN ('observacao_interna','ia','indefinido') ORDER BY created_at", clientId);
  const last = (eid) => one('SELECT decision, created_at FROM brand_confirmations WHERE entry_id=? ORDER BY created_at DESC LIMIT 1', eid);
  const groups = {};
  for (const e of rows) (groups[BRAND_LABEL[e.section] || 'Sua marca'] ||= []).push({ id: e.id, label: e.label, content: e.content, updated_at: e.updated_at || e.created_at, last_check: last(e.id) });
  const order = [...new Set(BRAND_ORDER.map((s) => BRAND_LABEL[s]))];
  return Object.entries(groups).sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99)).map(([title, items]) => ({ title, items }));
}
export function confirmBrand(entryId, clientId, actor, { decision, note }) {
  const e = one("SELECT * FROM client_brain_entries WHERE id=? AND client_id=? AND shared=1 AND origin NOT IN ('observacao_interna','ia','indefinido')", entryId, clientId);
  if (!e) throw new HttpError(404, 'Informação não encontrada.');
  if (!['confirmado', 'atualizar'].includes(decision)) throw new HttpError(422, 'Resposta inválida.');
  note = String(note || '').trim();
  if (decision === 'atualizar' && !note) throw new HttpError(422, 'Conte o que mudou.');
  const label = BRAND_LABEL[e.section] || 'Sua marca';
  let taskId = null;
  tx(() => {
    if (decision === 'atualizar') {
      // A atualização do cliente entra como informação do CLIENTE (preenchida na plataforma); a da equipe não é sobrescrita
      insert('client_brain_entries', { id: uid('be_'), client_id: clientId, section: e.section, label: `Atualização do cliente${e.label ? ` · ${e.label}` : ''}`, content: note, origin: 'cliente', source_type: 'plataforma', source_ref: `marca:${e.id}`, created_by: actor.id, created_at: now() });
      taskId = followUp(clientId, actor.id, { title: `Avaliar atualização da marca (${label}) e impacto na estratégia`, description: `Como a The Bold entendia: ${e.content}\n\nO cliente diz: ${note}`, assignee: strategist(clientId), source_type: 'brand_entry', source_id: e.id, days: 2 }).id;
    }
    insert('brand_confirmations', { id: uid('bc_'), client_id: clientId, entry_id: e.id, decision, note: note || null, entry_content: e.content, user_id: actor.id, task_id: taskId, created_at: now() });
  });
  log({ actor: actor.id, action: decision === 'confirmado' ? 'marca.confirmada' : 'marca.atualizacao', entity: 'brand', id: e.id, client: clientId, visibility: 'client',
    summary: decision === 'confirmado' ? `Você confirmou: ${label}` : `Você pediu atualização em ${label}`, before: e.content, after: note || null });
  if (decision === 'atualizar') notify(teamOf(clientId), { level: 'atencao', type: 'marca', title: `${one('SELECT name FROM clients WHERE id=?', clientId).name} atualizou a marca (${label})`, body: note.slice(0, 160), link: `/clientes/${clientId}?tab=ficha`, client: clientId, exclude: actor.id });
  return { ok: true, decision };
}

// ═════════ PULSO DA MARCA (estado estratégico atual — só quando a equipe publicou dados reais) ═════════
const PULSE_FIELDS = ['focus', 'objective', 'direction', 'learning', 'next_focus'];
export function pulseForClient(clientId) {
  const p = one("SELECT * FROM brand_pulse WHERE client_id=? AND status='publicado'", clientId);
  if (!p) return null;
  const fields = Object.fromEntries(PULSE_FIELDS.filter((k) => String(p[k] || '').trim()).map((k) => [k, p[k]]));
  return Object.keys(fields).length ? { ...fields, published_at: p.published_at } : null;
}
export function savePulse(clientId, actor, body, publish = false) {
  const prev = one('SELECT * FROM brand_pulse WHERE client_id=?', clientId);
  const patch = Object.fromEntries(PULSE_FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, String(body[k] || '').trim() || null]));
  if (String(Object.values(patch).join('')).length > 6000) throw new HttpError(422, 'Texto muito longo.');
  const ts = now();
  const merged = { ...(prev || {}), ...patch };
  if (publish && !PULSE_FIELDS.some((k) => String(merged[k] || '').trim())) throw new HttpError(422, 'Preencha ao menos um campo antes de publicar.');
  const row = { ...patch, updated_by: actor.id, updated_at: ts, ...(publish ? { status: 'publicado', published_by: actor.id, published_at: ts } : {}) };
  if (prev) update('brand_pulse', { client_id: clientId }, row); else insert('brand_pulse', { client_id: clientId, status: 'rascunho', ...row });
  log({ actor: actor.id, action: publish ? 'pulso.publicado' : 'pulso.editado', entity: 'brand', id: clientId, client: clientId, visibility: publish ? 'client' : 'internal',
    summary: publish ? 'Pulso da marca atualizado pela The Bold' : 'Pulso da marca editado (rascunho)', before: prev ? JSON.stringify(Object.fromEntries(PULSE_FIELDS.map((k) => [k, prev[k]]))) : null, after: JSON.stringify(Object.fromEntries(PULSE_FIELDS.map((k) => [k, merged[k] ?? null]))) });
  if (publish) notify(clientUsers(clientId), { level: 'info', type: 'pulso', title: 'O Pulso da sua marca foi atualizado', body: 'Veja o foco estratégico atual e o próximo passo.', cta: 'Ver pulso', link: '/portal/marca', client: clientId });
  return one('SELECT * FROM brand_pulse WHERE client_id=?', clientId);
}
export function unpublishPulse(clientId, actor) {
  run("UPDATE brand_pulse SET status='rascunho', updated_by=?, updated_at=? WHERE client_id=?", actor.id, now(), clientId);
  log({ actor: actor.id, action: 'pulso.despublicado', entity: 'brand', id: clientId, client: clientId, summary: 'Pulso da marca retirado do portal' });
}
