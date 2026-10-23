// CICLOS — abrir os meses de produção (ex.: dezembro e janeiro produzidos juntos em novembro) e montar o cronograma de cada cliente.
// Abrir um ciclo cria os ciclos dos clientes com o calendário de marcos do mês de produção e entrega à estrategista a tarefa de
// montar o cronograma. O cronograma é preenchido como no CR EDITORIAL (data, formato, título, objetivo); "Enviar para análise"
// conclui a etapa de cronograma de cada conteúdo e, daí em diante, o Process Engine segue sozinho:
// análise (Rebeca/Raísa) → aprovação do tema pelo cliente → produção (design/edição + legenda) → revisão → aprovação → publicação.
import { Router } from 'express';
import { one, all, insert, update, run, uid, now, tx, parseJSON } from '../db.js';
import { requireInternal, requirePerm } from '../lib/auth.js';
import { assertClient, canAccessClient, can, HttpError } from '../lib/permissions.js';
import { log, notify, userName } from '../lib/core.js';
import { buildMilestones, createContent, completeTask, STAGES, resolveAssignee } from '../engine/process.js';
import { OPERATING } from '../engine/intelligence.js';

export const ciclos = Router();
ciclos.use('/ciclos', requireInternal);

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const monthName = (m) => MONTHS[Number(m.slice(5, 7)) - 1];
const monthsLabel = (ms) => ms.map(monthName).join(' e ');
const FORMATS = ['reel', 'video', 'carrossel', 'estatico', 'foto', 'stories'];
const EDITABLE = ['cronograma', 'ajuste_cronograma'];
const BAND = (s) => (['cronograma', 'ajuste_cronograma'].includes(s) ? 'cronograma' : s === 'analise_cronograma' ? 'analise' : s === 'aprovacao_tema' ? 'tema'
  : ['producao', 'analise_producao', 'ajuste_interno', 'aprovacao_cliente', 'ajuste_cliente', 'revisao_ajuste'].includes(s) ? 'producao' : ['agendamento', 'agendado', 'publicado'].includes(s) ? 'pronto' : 'outro');
const strategistOf = (clientId) => one("SELECT u.id, u.name FROM client_members cm JOIN users u ON u.id=cm.user_id WHERE cm.client_id=? AND cm.function='estrategia' AND u.active=1 LIMIT 1", clientId);
const eligible = (user) => all(`SELECT id, name, requires_theme_approval FROM clients WHERE kind<>'interno' AND status IN (${OPERATING.map(() => '?').join(',')}) ORDER BY name`, ...OPERATING).filter((c) => canAccessClient(user, c.id));

function batchView(batchId, user) {
  const cys = all('SELECT cy.*, cl.name client FROM cycles cy JOIN clients cl ON cl.id=cy.client_id WHERE cy.batch_id=? ORDER BY cl.name, cy.month', batchId).filter((c) => canAccessClient(user, c.client_id));
  if (!cys.length) return null;
  const months = [...new Set(cys.map((c) => c.month))].sort();
  const byClient = new Map();
  for (const cy of cys) {
    const e = byClient.get(cy.client_id) || { client_id: cy.client_id, client: cy.client, strategist: strategistOf(cy.client_id)?.name || null, counts: { total: 0, cronograma: 0, analise: 0, tema: 0, producao: 0, pronto: 0 } };
    for (const r of all("SELECT stage, COUNT(*) n FROM contents WHERE cycle_id=? AND stage<>'cancelado' GROUP BY stage", cy.id)) { e.counts.total += r.n; const b = BAND(r.stage); if (b in e.counts) e.counts[b] += r.n; }
    byClient.set(cy.client_id, e);
  }
  const first = cys[0];
  return { batch_id: batchId, months, label: monthsLabel(months), production_month: first.production_month, opened_at: first.opened_at, opened_by: userName(first.opened_by), milestones: parseJSON(first.milestones, {}), clients: [...byClient.values()] };
}

ciclos.get('/ciclos', requirePerm('processos', 'view'), (req, res) => {
  const batches = all('SELECT batch_id, MAX(opened_at) at FROM cycles WHERE batch_id IS NOT NULL GROUP BY batch_id ORDER BY at DESC').map((b) => batchView(b.batch_id, req.user)).filter(Boolean);
  const d = new Date(); const ym = (k) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1)); return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`; };
  res.json({
    batches, can_open: can(req.user, 'processos', 'edit'),
    suggest: { months: [ym(1), ym(2), ym(3), ym(4)], production: [ym(0), ym(1), ym(2), ym(3)] },
    clients: eligible(req.user).map((c) => ({ ...c, strategist: strategistOf(c.id)?.name || null, existing: all('SELECT month FROM cycles WHERE client_id=?', c.id).map((r) => r.month) })),
  });
});
// Calendário de marcos para os meses escolhidos (prévia antes de abrir)
ciclos.get('/ciclos/previa', requirePerm('processos', 'view'), (req, res) => {
  const prod = String(req.query.producao || '');
  if (!/^\d{4}-\d{2}$/.test(prod)) throw new HttpError(422, 'Informe o mês de produção.');
  res.json({ milestones: buildMilestones(prod, prod) });
});

ciclos.post('/ciclos', requirePerm('processos', 'edit'), (req, res) => {
  const { months = [], production_month, client_ids = [], notify_strategists = true } = req.body || {};
  const ms = [...new Set(months)].filter((m) => /^\d{4}-\d{2}$/.test(m)).sort();
  if (!ms.length) throw new HttpError(422, 'Escolha o(s) mês(es) do ciclo.');
  if (!/^\d{4}-\d{2}$/.test(production_month || '')) throw new HttpError(422, 'Escolha o mês em que o ciclo é produzido.');
  if (ms.some((m) => m <= production_month)) throw new HttpError(422, 'O mês de produção vem antes dos meses de publicação.');
  const allowed = new Set(eligible(req.user).map((c) => c.id));
  const ids = client_ids.filter((id) => allowed.has(id));
  if (!ids.length) throw new HttpError(422, 'Escolha os clientes.');
  const batchId = uid('ciclo_');
  const milestones = JSON.stringify(buildMilestones(ms[0], production_month));
  const deadline = parseJSON(milestones, {}).cronograma_entrega?.end;
  const out = tx(() => {
    const r = { created: 0, updated: 0, skipped: [], tasks: 0 };
    for (const id of ids) {
      for (const m of ms) {
        const ex = one('SELECT * FROM cycles WHERE client_id=? AND month=?', id, m);
        if (ex) {
          // Ciclo que já existe só muda de calendário se ainda não tem conteúdo (o que já está em andamento não muda de prazo sozinho)
          const has = one("SELECT COUNT(*) n FROM contents WHERE cycle_id=? AND stage<>'cancelado'", ex.id).n;
          if (has) { r.skipped.push(`${one('SELECT name FROM clients WHERE id=?', id).name} · ${monthName(m)} (já tem ${has} conteúdo(s))`); update('cycles', { id: ex.id }, { batch_id: batchId, production_month: ex.production_month || production_month, opened_by: req.user.id, opened_at: now() }); continue; }
          update('cycles', { id: ex.id }, { batch_id: batchId, production_month, milestones, opened_by: req.user.id, opened_at: now() }); r.updated++;
        } else {
          insert('cycles', { id: uid('cy_'), client_id: id, month: m, status: 'planejamento', milestones, production_month, batch_id: batchId, opened_by: req.user.id, opened_at: now(), created_at: now() }); r.created++;
        }
      }
      // Tarefa da estrategista: montar o cronograma dos meses do ciclo (prazo = entrega do cronograma no calendário)
      const st = strategistOf(id) || (resolveAssignee(id, 'estrategia') ? { id: resolveAssignee(id, 'estrategia') } : null);
      const name = one('SELECT name FROM clients WHERE id=?', id).name;
      insert('tasks', { id: uid('t_'), title: `Montar cronograma de ${monthsLabel(ms)} — ${name}`, description: `ciclo:${batchId}`, client_id: id, function: 'estrategia', assignee_id: st?.id || null, status: 'aberta', kind: 'manual', origin: 'engine',
        source_type: 'ciclo', source_id: batchId, priority: 'alta', due_at: deadline ? new Date(`${deadline}T18:00:00-03:00`).toISOString() : null, created_by: req.user.id, created_at: now() });
      r.tasks++;
      if (st?.id && notify_strategists) notify(st.id, { level: 'atencao', type: 'ciclo', title: `Cronograma de ${monthsLabel(ms)}: ${name}`, body: `Ciclo aberto por ${req.user.name}. Entrega do cronograma até ${deadline ? deadline.split('-').reverse().slice(0, 2).join('/') : '—'}.`, link: `/ciclos/${batchId}/${id}`, client: id });
    }
    log({ actor: req.user.id, action: 'ciclo.aberto', entity: 'ciclo', id: batchId, summary: `Ciclo de ${monthsLabel(ms)} aberto (produção em ${monthName(production_month)}) para ${ids.length} cliente(s)` });
    return r;
  });
  res.json({ batch_id: batchId, ...out });
});

ciclos.get('/ciclos/:batch', requirePerm('processos', 'view'), (req, res) => {
  const b = batchView(req.params.batch, req.user);
  if (!b) throw new HttpError(404, 'Ciclo não encontrado.');
  res.json(b);
});

// Cronograma de um cliente no ciclo: as linhas são os conteúdos (como o CR EDITORIAL)
const rowOf = (c) => ({ id: c.id, number: c.number, planned_at: c.planned_at, format: c.format, title: c.title, theme: c.theme, objective: c.objective, reference: c.reference, briefing: c.briefing,
  strategy_tags: parseJSON(c.strategy_tags, []), stage: c.stage, stage_label: STAGES[c.stage]?.label, editable: EDITABLE.includes(c.stage), month: c.cycle_month });
ciclos.get('/ciclos/:batch/:clientId', requirePerm('conteudos', 'view'), (req, res) => {
  assertClient(req.user, req.params.clientId);
  const cys = all('SELECT * FROM cycles WHERE batch_id=? AND client_id=? ORDER BY month', req.params.batch, req.params.clientId);
  if (!cys.length) throw new HttpError(404, 'Este cliente não está neste ciclo.');
  const client = one('SELECT id, name, requires_theme_approval FROM clients WHERE id=?', req.params.clientId);
  const rows = all(`SELECT * FROM contents WHERE cycle_id IN (${cys.map(() => '?').join(',')}) AND stage<>'cancelado' ORDER BY planned_at IS NULL, planned_at, number`, ...cys.map((c) => c.id)).map(rowOf);
  const brain = all("SELECT section, label, content FROM client_brain_entries WHERE client_id=? AND section IN ('estrategia','posicionamento','publico','tom','objetivos','regras','preferencias','restricoes') ORDER BY created_at DESC LIMIT 12", client.id);
  res.json({ client, strategist: strategistOf(client.id)?.name || null, months: cys.map((c) => c.month), label: monthsLabel(cys.map((c) => c.month)), milestones: parseJSON(cys[0].milestones, {}),
    rows, brain, can_edit: can(req.user, 'conteudos', 'create') });
});

ciclos.post('/ciclos/:batch/:clientId/linhas', requirePerm('conteudos', 'create'), (req, res) => {
  assertClient(req.user, req.params.clientId);
  const cys = all('SELECT * FROM cycles WHERE batch_id=? AND client_id=?', req.params.batch, req.params.clientId);
  if (!cys.length) throw new HttpError(404, 'Este cliente não está neste ciclo.');
  const byMonth = Object.fromEntries(cys.map((c) => [c.month, c]));
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const out = tx(() => {
    const r = { created: 0, updated: 0, errors: [] };
    rows.forEach((x, i) => {
      const line = `Linha ${i + 1}`;
      if (!x.title?.trim()) return; // linha vazia é ignorada
      if (!FORMATS.includes(x.format)) { r.errors.push(`${line}: escolha o formato.`); return; }
      const planned = x.planned_at ? new Date(x.planned_at.length <= 10 ? `${x.planned_at}T12:00:00-03:00` : x.planned_at).toISOString() : null;
      const month = planned ? new Date(new Date(planned).getTime() - 3 * 3600e3).toISOString().slice(0, 7) : null;
      if (planned && !byMonth[month]) { r.errors.push(`${line}: a data está fora dos meses do ciclo (${monthsLabel(Object.keys(byMonth).sort())}).`); return; }
      const fields = { title: x.title.trim(), format: x.format, theme: x.theme || null, objective: x.objective || null, reference: x.reference || null, briefing: x.briefing || null, strategy_tags: JSON.stringify(Array.isArray(x.strategy_tags) ? x.strategy_tags : String(x.strategy_tags || '').split(',').map((t) => t.trim()).filter(Boolean)), planned_at: planned };
      if (x.id) {
        const c = one('SELECT * FROM contents WHERE id=? AND client_id=?', x.id, req.params.clientId);
        if (!c) { r.errors.push(`${line}: conteúdo não encontrado.`); return; }
        if (!EDITABLE.includes(c.stage)) return; // já saiu do cronograma: muda pela ficha do conteúdo
        const cy = month ? byMonth[month] : null;
        update('contents', { id: c.id }, { ...fields, ...(cy ? { cycle_id: cy.id, cycle_month: cy.month } : {}), updated_at: now() });
        r.updated++;
      } else {
        const cy = month ? byMonth[month] : cys[0];
        createContent({ client_id: req.params.clientId, ...fields, strategy_tags: JSON.parse(fields.strategy_tags), cycle_month: cy.month, stage: 'cronograma' }, req.user);
        r.created++;
      }
    });
    if (r.created || r.updated) log({ actor: req.user.id, action: 'cronograma.salvo', entity: 'client', id: req.params.clientId, client: req.params.clientId, summary: `Cronograma salvo: ${r.created} nova(s) linha(s), ${r.updated} atualizada(s)` });
    return r;
  });
  res.json(out);
});

ciclos.post('/ciclos/:batch/:clientId/linhas/:id/remover', requirePerm('conteudos', 'create'), (req, res) => {
  assertClient(req.user, req.params.clientId);
  const c = one('SELECT * FROM contents WHERE id=? AND client_id=?', req.params.id, req.params.clientId);
  if (!c) throw new HttpError(404, 'Conteúdo não encontrado.');
  if (!EDITABLE.includes(c.stage)) throw new HttpError(409, 'Este conteúdo já saiu do cronograma; cancele pela ficha do conteúdo.');
  tx(() => {
    update('contents', { id: c.id }, { stage: 'cancelado', updated_at: now() });
    run("UPDATE tasks SET status='cancelada', completed_at=? WHERE content_id=? AND status IN ('aberta','em_andamento','agendada')", now(), c.id);
    log({ actor: req.user.id, action: 'conteudo.cancelado', entity: 'content', id: c.id, client: c.client_id, content: c.id, summary: `#${c.number} “${c.title}” removido do cronograma` });
  });
  res.json({ ok: true });
});

// Enviar para análise: conclui a etapa de cronograma de cada linha pronta (tema ou objetivo + data). O resto fica e é listado.
ciclos.post('/ciclos/:batch/:clientId/enviar', requirePerm('conteudos', 'create'), (req, res) => {
  assertClient(req.user, req.params.clientId);
  const cys = all('SELECT id FROM cycles WHERE batch_id=? AND client_id=?', req.params.batch, req.params.clientId);
  if (!cys.length) throw new HttpError(404, 'Este cliente não está neste ciclo.');
  const list = all(`SELECT * FROM contents WHERE cycle_id IN (${cys.map(() => '?').join(',')}) AND stage IN ('cronograma','ajuste_cronograma') ORDER BY planned_at`, ...cys.map((c) => c.id));
  const r = { sent: 0, pending: [] };
  for (const c of list) {
    if (!c.planned_at || !(c.theme || c.objective)) { r.pending.push(`#${c.number} ${c.title}: falta ${!c.planned_at ? 'a data' : 'tema ou objetivo'}`); continue; }
    const t = one("SELECT id FROM tasks WHERE content_id=? AND stage=? AND kind='etapa' AND status IN ('aberta','em_andamento')", c.id, c.stage);
    if (!t) { r.pending.push(`#${c.number} ${c.title}: sem tarefa de cronograma aberta`); continue; }
    try { completeTask(t.id, req.user); r.sent++; } catch (e) { r.pending.push(`#${c.number} ${c.title}: ${e.message}`); }
  }
  // A tarefa "Montar cronograma" se fecha quando tudo foi enviado
  if (r.sent && !r.pending.length) run("UPDATE tasks SET status='concluida', completed_at=?, completed_by=? WHERE source_type='ciclo' AND source_id=? AND client_id=? AND status IN ('aberta','em_andamento')", now(), req.user.id, req.params.batch, req.params.clientId);
  log({ actor: req.user.id, action: 'cronograma.enviado', entity: 'client', id: req.params.clientId, client: req.params.clientId, summary: `Cronograma enviado para análise: ${r.sent} conteúdo(s)${r.pending.length ? ` · ${r.pending.length} pendente(s)` : ''}` });
  res.json(r);
});
