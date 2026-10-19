// Formulário oficial de onboarding — reproduz o "Sua marca" (PADRÃO 2026) do Notion da The Bold.
// Respostas → onboarding_answers (com autor/data) → Client Brain (com procedência "onboarding_cliente").
// Acessos (login/senha) nunca ficam em texto aberto: vão para o cofre cifrado (client_secrets).
import fs from 'node:fs';
import path from 'node:path';
import { one, all, insert, update, run, uid, now, parseJSON, tx } from '../db.js';
import { log, notify } from '../lib/core.js';
import { seal } from '../integrations/vault.js';
import { HttpError } from '../lib/permissions.js';

const FORM_FILE = path.resolve('server/data/onboarding-form-2026.json');

export function activeForm() {
  let f = one('SELECT * FROM onboarding_forms WHERE active=1 ORDER BY created_at DESC LIMIT 1');
  if (!f && fs.existsSync(FORM_FILE)) {
    const src = JSON.parse(fs.readFileSync(FORM_FILE, 'utf8'));
    f = insert('onboarding_forms', { id: uid('of_'), version: src.version, title: src.title, source: src.source, structure: JSON.stringify(src.sections), required_keys: '[]', active: 1, created_at: now() });
  }
  return f ? { ...f, sections: parseJSON(f.structure, []), required_keys: parseJSON(f.required_keys, []) } : null;
}

// Pergunta do formulário → seção do Client Brain
export function brainSectionFor(key) {
  if (key.startsWith('acesso_')) return null;
  if (key === 'pos_tom_voz') return 'tom';
  if (key.startsWith('pos_attr_')) return 'linguagem';
  if (key.startsWith('pos_dif_')) return 'diferenciais';
  if (key === 'pos_universo_inspiracoes' || key === 'des_perfis_referencia') return 'referencias';
  if (/^pos_(mood|rit|play)_|^pos_(cheiro|bebida)$/.test(key)) return 'identidade';
  if (key.startsWith('pos_')) return 'posicionamento';
  if (key.startsWith('per_')) return 'persona';
  if (key.startsWith('prod_')) return 'produtos';
  if (key.startsWith('rot_')) return 'identidade';
  if (key.startsWith('des_')) return 'identidade_visual';
  return 'outro';
}

export function questionOf(form, key) {
  for (const s of form.sections) for (const q of s.questions) if (q.key === key) return { ...q, section_title: s.title };
  return null;
}

// Salva/atualiza uma resposta, sincroniza o Client Brain e registra antes/depois no histórico
export function saveAnswer(clientId, key, value, actor, { origin = 'onboarding_cliente', source_type = 'plataforma', source_ref = null, question_text = null, silent = false } = {}) {
  const form = activeForm();
  const q = questionOf(form, key);
  const text = question_text || q?.text || key;
  const val = Array.isArray(value) ? value.join(', ') : String(value ?? '').trim();
  return tx(() => {
    if (q?.sensitive || key.startsWith('acesso_')) {
      if (!val) return null;
      const ex = one('SELECT id FROM client_secrets WHERE client_id=? AND label=?', clientId, text);
      if (ex) update('client_secrets', { id: ex.id }, { secret_enc: seal({ value: val }), provided_by: actor?.id || null, updated_at: now() });
      else insert('client_secrets', { id: uid('cs_'), client_id: clientId, label: text, secret_enc: seal({ value: val }), provided_by: actor?.id || null, created_at: now() });
      run(`INSERT INTO onboarding_answers (id, client_id, form_id, question_key, question_text, answer, origin, source_type, source_ref, answered_by, answered_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(client_id, question_key) DO UPDATE SET answer=excluded.answer, updated_at=excluded.updated_at, answered_by=excluded.answered_by`,
        uid('oa_'), clientId, form?.id, key, text, '[registrado no cofre de acessos]', origin, source_type, source_ref, actor?.id || null, now(), now());
      if (!silent) log({ actor: actor?.id, action: 'onboarding.acesso', entity: 'client', id: clientId, client: clientId, summary: `Acesso informado: ${text.replace(/:$/, '')} (guardado cifrado)` });
      return { secret: true };
    }
    const prev = one('SELECT * FROM onboarding_answers WHERE client_id=? AND question_key=?', clientId, key);
    if (prev && prev.answer === val) return prev;
    if (prev) update('onboarding_answers', { id: prev.id }, { answer: val, answered_by: actor?.id || prev.answered_by, updated_at: now() });
    else insert('onboarding_answers', { id: uid('oa_'), client_id: clientId, form_id: form?.id, question_key: key, question_text: text, answer: val, origin, source_type, source_ref, answered_by: actor?.id || null, answered_at: now(), updated_at: now() });
    const section = brainSectionFor(key);
    const entry = one("SELECT id FROM client_brain_entries WHERE client_id=? AND source_type IN ('onboarding','notion_onboarding') AND source_ref=?", clientId, `onboarding:${key}`);
    if (entry) update('client_brain_entries', { id: entry.id }, { content: val, updated_by: actor?.id || null, updated_at: now() });
    else if (val) insert('client_brain_entries', { id: uid('be_'), client_id: clientId, section, label: text, content: val, origin, source_type: source_type === 'notion' ? 'notion_onboarding' : 'onboarding', source_ref: `onboarding:${key}`, source_page: q?.section_title || null, created_by: actor?.id || null, created_at: now() });
    if (!silent) log({ actor: actor?.id, action: prev ? 'onboarding.resposta_alterada' : 'onboarding.resposta', entity: 'client', id: clientId, client: clientId, summary: `${prev ? 'Resposta alterada' : 'Respondeu'}: ${text.slice(0, 90)}`, before: prev?.answer ?? null, after: val, visibility: 'client' });
    return one('SELECT * FROM onboarding_answers WHERE client_id=? AND question_key=?', clientId, key);
  });
}

export function formStatus(clientId) {
  const form = activeForm();
  if (!form) return null;
  const answers = Object.fromEntries(all('SELECT question_key, answer, answered_at, updated_at, origin, source_type FROM onboarding_answers WHERE client_id=?', clientId).map((a) => [a.question_key, a]));
  const keys = form.sections.flatMap((s) => s.questions.map((q) => q.key));
  const answered = keys.filter((k) => answers[k]?.answer?.trim());
  const missingRequired = form.required_keys.filter((k) => !answers[k]?.answer?.trim());
  const ob = one('SELECT form_status, form_submitted_at FROM onboarding WHERE client_id=?', clientId);
  return { form_id: form.id, version: form.version, total: keys.length, answered: answered.length, missing_required: missingRequired, status: ob?.form_status || 'nao_iniciado', submitted_at: ob?.form_submitted_at || null, answers };
}

// Cliente conclui o formulário → onboarding avança sozinho
export function submitForm(clientId, actor, onComplete) {
  const st = formStatus(clientId);
  if (st.missing_required.length) throw new HttpError(422, `Faltam ${st.missing_required.length} resposta(s) obrigatória(s).`);
  if (!st.answered) throw new HttpError(422, 'Responda ao menos uma pergunta antes de enviar.');
  tx(() => {
    run("UPDATE onboarding SET form_status='concluido', form_submitted_at=? WHERE client_id=?", now(), clientId);
    run("UPDATE onboarding_items SET status='recebido', received_at=?, value=? WHERE onboarding_id=(SELECT id FROM onboarding WHERE client_id=?) AND kind='formulario' AND status='pendente'", now(), `${st.answered}/${st.total} respostas`, clientId);
  });
  log({ actor: actor.id, action: 'onboarding.formulario_enviado', entity: 'client', id: clientId, client: clientId, summary: `Formulário de onboarding enviado por ${actor.name} (${st.answered} de ${st.total} perguntas respondidas)`, visibility: 'client' });
  const team = all("SELECT DISTINCT user_id FROM client_members WHERE client_id=? AND function IN ('estrategia','atendimento')", clientId).map((r) => r.user_id);
  notify(team, { level: 'atencao', type: 'onboarding', title: 'Formulário de onboarding recebido', body: `${st.answered} de ${st.total} perguntas respondidas — já no Client Brain.`, link: `/clientes/${clientId}?tab=onboarding`, client: clientId });
  onComplete?.();
  return formStatus(clientId);
}
