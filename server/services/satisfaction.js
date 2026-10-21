// SATISFAÇÃO CONTEXTUAL — "Como foi essa etapa?" só depois de momentos relevantes, nunca em excesso.
// Um convite aberto por vez e intervalo mínimo entre convites (configurável em settings: satisfacao_intervalo_dias).
import { one, all, insert, update, uid, now, parseJSON } from '../db.js';
import { log, notify } from '../lib/core.js';
import { HttpError } from '../lib/permissions.js';

export const RATINGS = { excelente: 'Excelente', boa: 'Boa', poderia_melhorar: 'Poderia melhorar' };
const intervalDays = () => parseJSON(one("SELECT value FROM settings WHERE key='satisfacao_intervalo_dias'")?.value, 14);

export function offerSatisfaction(clientId, moment, refId, label) {
  if (one('SELECT 1 FROM satisfaction_prompts WHERE client_id=? AND answered_at IS NULL AND dismissed_at IS NULL', clientId)) return null;
  const last = one('SELECT created_at FROM satisfaction_prompts WHERE client_id=? ORDER BY created_at DESC LIMIT 1', clientId);
  if (last && Date.now() - new Date(last.created_at).getTime() < intervalDays() * 864e5) return null;
  if (one('SELECT 1 FROM satisfaction_prompts WHERE client_id=? AND moment=? AND ref_id=?', clientId, moment, refId)) return null;
  return insert('satisfaction_prompts', { id: uid('sp_'), client_id: clientId, moment, label, ref_type: moment, ref_id: refId, created_at: now() });
}
export const pendingPrompt = (clientId) => one('SELECT id, moment, label, created_at FROM satisfaction_prompts WHERE client_id=? AND answered_at IS NULL AND dismissed_at IS NULL ORDER BY created_at DESC LIMIT 1', clientId);

export function answerSatisfaction(promptId, clientId, actor, { rating, comment }) {
  const p = one('SELECT * FROM satisfaction_prompts WHERE id=? AND client_id=?', promptId, clientId);
  if (!p) throw new HttpError(404, 'Pesquisa não encontrada.');
  if (p.answered_at) throw new HttpError(409, 'Você já respondeu. Obrigado!');
  if (!RATINGS[rating]) throw new HttpError(422, 'Escolha uma avaliação.');
  comment = String(comment || '').trim().slice(0, 4000);
  insert('satisfaction_responses', { id: uid('sr_'), prompt_id: p.id, client_id: clientId, moment: p.moment, rating, comment: comment || null, user_id: actor.id, created_at: now() });
  update('satisfaction_prompts', { id: p.id }, { answered_at: now() });
  log({ actor: actor.id, action: 'satisfacao.resposta', entity: 'satisfaction', id: p.id, client: clientId, summary: `Satisfação (${p.label}): ${RATINGS[rating]}${comment ? ` — ${comment.slice(0, 140)}` : ''}` });
  if (rating === 'poderia_melhorar') {
    const team = [...new Set([...all("SELECT user_id FROM client_members WHERE client_id=? AND function IN ('atendimento','estrategia')", clientId).map((r) => r.user_id), ...all("SELECT id user_id FROM users WHERE active=1 AND role_key IN ('ceo','operacoes')").map((r) => r.user_id)])];
    notify(team, { level: 'atencao', type: 'satisfacao', title: `${one('SELECT name FROM clients WHERE id=?', clientId).name}: “poderia melhorar”`, body: `${p.label}${comment ? ` — ${comment.slice(0, 140)}` : ''}`, link: `/clientes/${clientId}?tab=saude`, client: clientId });
  }
  return { ok: true };
}
export function dismissSatisfaction(promptId, clientId) {
  const p = one('SELECT * FROM satisfaction_prompts WHERE id=? AND client_id=?', promptId, clientId);
  if (!p) throw new HttpError(404, 'Pesquisa não encontrada.');
  update('satisfaction_prompts', { id: p.id }, { dismissed_at: now() });
  return { ok: true };
}
