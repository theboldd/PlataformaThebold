// Agendador: automações baseadas em tempo (prazos, régua de cobrança, follow-ups, publicação, detectores).
// Idempotente: cada disparo é registrado em automation_runs e não se repete para o mesmo marcador.
import { one, all, insert, update, run, uid, now } from '../db.js';
import { notify, log } from '../lib/core.js';
import { STAGES, resolveAssignee, clientUsers, setting } from './process.js';
import { automation, isEnabled, onceFor } from './automations.js';
import { runDetectors } from './intelligence.js';
import { publishDueContent } from '../integrations/meta.js';
import { generateReport } from '../services/reports.js';
import { snapshotHealth, LEVEL_LABEL } from '../services/health.js';
import { detectTranscripts } from '../services/meeting-summaries.js';
import { fmtDay } from '../services/client-view.js';

// Lembretes ao cliente nunca em excesso: intervalo mínimo por cliente e limite por etapa (settings configuráveis)
const reminderGap = () => (setting('lembrete_cliente_intervalo_horas') ?? 24) * H;
const reminderMax = () => setting('lembrete_cliente_max') ?? 3;
function remindClient(c, marker, { title, body, cta = 'Revisar agora', link = '/portal/conteudos?filtro=aguardando' }) {
  const ids = clientUsers(c.client_id);
  if (!ids.length) return false;
  const last = one(`SELECT MAX(created_at) t FROM automation_runs WHERE automation_key IN ('cliente.sem_resposta_24h','cliente.prazo_vencido') AND client_id=? AND status='ok'`, c.client_id)?.t;
  if (last && Date.now() - new Date(last).getTime() < reminderGap()) return false;
  const sent = one(`SELECT COUNT(*) n FROM automation_runs WHERE automation_key IN ('cliente.sem_resposta_24h','cliente.prazo_vencido') AND entity_id=? AND detail LIKE ? AND status='ok'`, c.id, `${marker}%`).n;
  if (sent >= reminderMax()) return false;
  notify(ids, { level: 'atencao', type: 'lembrete', title, body, cta, link, groupKey: `lembrete:${c.client_id}`, client: c.client_id });
  return true;
}

const H = 3600e3;
const cc = () => all("SELECT id FROM users WHERE active=1 AND role_key IN ('operacoes','ceo')").map((r) => r.id);

export function tick() {
  const t = Date.now();
  const nowIso = now();
  // Prazo próximo (< 24h) e vencido
  for (const k of all("SELECT t.*, c.number, c.title ctitle FROM tasks t LEFT JOIN contents c ON c.id=t.content_id WHERE t.status IN ('aberta','em_andamento') AND t.due_at IS NOT NULL AND t.assignee_id IS NOT NULL AND t.function<>'cliente'")) {
    const due = new Date(k.due_at).getTime();
    if (due < t) {
      if (isEnabled('prazo.vencido') && onceFor('prazo.vencido', k.id, k.due_at)) {
        automation('prazo.vencido', { entity: 'task', id: k.id, client: k.client_id, detail: k.due_at });
        notify(k.assignee_id, { level: 'urgente', type: 'atraso', title: `Prazo vencido: ${k.title}`, body: 'Conclua ou avise Operações sobre o novo prazo.', link: k.content_id ? `/conteudos/${k.content_id}` : '/', groupKey: `atraso:${k.assignee_id}`, client: k.client_id, content: k.content_id });
        notify(cc(), { level: 'atencao', type: 'atraso', title: 'Tarefas atrasadas', body: `${k.title}`, link: '/pendencias', groupKey: 'atraso:cc' });
        log({ kind: 'sistema', action: 'risco.prazo_vencido', entity: 'task', id: k.id, client: k.client_id, content: k.content_id, summary: `Prazo vencido: ${k.title}` });
      }
    } else if (due - t < 24 * H && isEnabled('prazo.proximo') && onceFor('prazo.proximo', k.id, k.due_at)) {
      automation('prazo.proximo', { entity: 'task', id: k.id, client: k.client_id, detail: k.due_at });
      notify(k.assignee_id, { level: 'atencao', type: 'prazo', title: `Prazo em menos de 24h`, body: k.title, link: k.content_id ? `/conteudos/${k.content_id}` : '/', groupKey: `prazo:${k.assignee_id}`, client: k.client_id, content: k.content_id });
    }
  }
  // Régua de cobrança do cliente (PDF do processo: dia seguinte → metade do prazo → véspera → último dia)
  const [h1, h2, h3] = setting('followup_cliente_horas');
  for (const c of all("SELECT c.*, cl.name cname FROM contents c JOIN clients cl ON cl.id=c.client_id WHERE c.stage IN ('aprovacao_tema','aprovacao_cliente') AND c.blocked=0")) {
    const waited = (t - new Date(c.stage_entered_at).getTime()) / H;
    const marker = `${c.stage}:${c.stage_entered_at}`;
    if (waited >= h1 && isEnabled('cliente.sem_resposta_24h') && onceFor('cliente.sem_resposta_24h', c.id, marker)) {
      const sent = remindClient(c, marker, { title: 'Você tem conteúdos aguardando aprovação', body: 'Com a sua aprovação, seguimos para o agendamento. Leva poucos minutos: ♡ aprova, ✎ pede ajuste.' });
      automation('cliente.sem_resposta_24h', { entity: 'content', id: c.id, client: c.client_id, detail: marker, status: sent ? 'ok' : 'ignorada' });
    }
    if (waited >= h2 && isEnabled('cliente.sem_resposta_48h') && onceFor('cliente.sem_resposta_48h', c.id, marker)) {
      automation('cliente.sem_resposta_48h', { entity: 'content', id: c.id, client: c.client_id, detail: marker });
      const exists = one("SELECT 1 FROM tasks WHERE client_id=? AND kind='follow_up' AND status='aberta'", c.client_id);
      if (!exists) {
        const who = resolveAssignee(c.client_id, 'atendimento');
        const pending = one("SELECT COUNT(*) n FROM contents WHERE client_id=? AND stage IN ('aprovacao_tema','aprovacao_cliente')", c.client_id).n;
        insert('tasks', { id: uid('t_'), title: `Follow-up de aprovação — ${c.cname}`, client_id: c.client_id, function: 'atendimento', assignee_id: who, status: 'aberta', kind: 'follow_up', origin: 'automacao', priority: 'alta',
          description: `Texto sugerido (WhatsApp): “Oi! Passando para lembrar que ${pending} conteúdo(s) estão aguardando sua aprovação na área The Bold. É só abrir o feed e aprovar ou comentar. Qualquer dúvida estamos aqui ❤”`,
          due_at: new Date(t + 8 * H).toISOString(), created_at: nowIso });
        notify(who, { level: 'atencao', type: 'follow_up', title: `Follow-up: ${c.cname} sem resposta há 48h`, body: `${pending} conteúdo(s) aguardando`, link: '/', groupKey: `fu:${c.client_id}`, client: c.client_id });
      }
    }
    if (waited >= h3 && isEnabled('cliente.sem_resposta_72h') && onceFor('cliente.sem_resposta_72h', c.id, marker)) {
      automation('cliente.sem_resposta_72h', { entity: 'content', id: c.id, client: c.client_id, detail: marker });
      notify(cc(), { level: 'urgente', type: 'escalada', title: `${c.cname}: 72h sem resposta do cliente`, body: 'Decidir: segue para a próxima semana ou para o próximo mês?', link: '/pendencias', groupKey: `esc:${c.client_id}`, client: c.client_id });
    }
  }
  // Prazo de aprovação do cliente vencido → registrar atraso, lembrar (sem excesso), avisar o atendimento, avaliar impacto, escalar se a publicação estiver em risco
  for (const k of all("SELECT t.*, c.title ctitle, c.planned_at, c.stage cstage, c.stage_entered_at, c.number, cl.name cname FROM tasks t JOIN contents c ON c.id=t.content_id JOIN clients cl ON cl.id=c.client_id WHERE t.kind='aprovacao' AND t.status IN ('aberta','em_andamento') AND t.due_at < ? AND c.blocked=0", nowIso)) {
    const marker = `${k.cstage}:${k.stage_entered_at}`;
    if (!isEnabled('cliente.prazo_vencido') || !onceFor('cliente.prazo_vencido', k.content_id, `${marker}:${k.due_at}`)) continue;
    const c = { id: k.content_id, client_id: k.client_id };
    const sent = remindClient(c, marker, { title: 'Precisamos de você', body: `O prazo de aprovação de “${k.ctitle}” passou. Ainda podemos receber sua aprovação, mas a data de publicação poderá precisar ser ajustada.` });
    automation('cliente.prazo_vencido', { entity: 'content', id: k.content_id, client: k.client_id, detail: `${marker}:${k.due_at}`, status: sent ? 'ok' : 'ignorada' });
    // Impacto: o agendamento precisa de ~1 dia útil depois da aprovação; perto da publicação, é risco real de mudar a data
    const hoursToPub = k.planned_at ? (new Date(k.planned_at).getTime() - t) / H : null;
    const impact = hoursToPub == null ? 'sem data de publicação' : hoursToPub < 0 ? 'a data de publicação já passou' : hoursToPub < 48 ? `publicação em ${Math.round(hoursToPub)}h — data em risco` : `publicação em ${fmtDay(k.planned_at)} — ainda dentro do prazo`;
    log({ kind: 'sistema', action: 'cliente.prazo_vencido', entity: 'content', id: k.content_id, client: k.client_id, content: k.content_id, summary: `Prazo de aprovação do cliente vencido (${fmtDay(k.due_at)}): #${k.number} ${k.ctitle} · ${impact}${sent ? ' · lembrete enviado' : ' · lembrete não enviado (intervalo/limite)'}` });
    const atd = resolveAssignee(k.client_id, 'atendimento');
    notify(atd, { level: 'atencao', type: 'cliente_atraso', title: `${k.cname}: prazo de aprovação passou`, body: `#${k.number} ${k.ctitle} · ${impact}`, link: `/conteudos/${k.content_id}`, groupKey: `cli-atraso:${k.client_id}`, client: k.client_id, content: k.content_id });
    if (hoursToPub != null && hoursToPub < 48) notify(cc(), { level: 'urgente', type: 'escalada', title: `${k.cname}: publicação em risco`, body: `#${k.number} ${k.ctitle} ainda sem aprovação · ${impact}. Decidir: nova data ou contato direto.`, link: `/conteudos/${k.content_id}`, groupKey: `pub-risco:${k.client_id}`, client: k.client_id });
  }
  // Lembrete de reunião na véspera (cliente e participantes)
  for (const m of all("SELECT * FROM meetings WHERE status='agendada' AND starts_at BETWEEN ? AND ?", new Date(t + 20 * H).toISOString(), new Date(t + 26 * H).toISOString())) {
    if (onceFor('reuniao.lembrete', m.id, m.starts_at)) {
      insert('automation_runs', { id: uid('ar_'), automation_key: 'reuniao.lembrete', status: 'ok', entity_type: 'meeting', entity_id: m.id, client_id: m.client_id, detail: m.starts_at, created_at: nowIso });
      const hora = new Date(m.starts_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
      const people = all('SELECT a.user_id, u.role_key FROM meeting_attendees a JOIN users u ON u.id=a.user_id WHERE a.meeting_id=?', m.id);
      notify(people.filter((p) => p.role_key === 'cliente').map((p) => p.user_id), { level: 'info', type: 'reuniao', title: 'Sua reunião é amanhã', body: `${hora} · ${m.title}${m.agenda ? ' — veja a pauta' : ''}`, cta: 'Ver reunião', link: `/portal/reunioes?m=${m.id}`, client: m.client_id });
      notify(people.filter((p) => p.role_key !== 'cliente').map((p) => p.user_id), { level: 'info', type: 'reuniao', title: 'Reunião amanhã', body: `${hora} · ${m.title}`, link: '/reunioes', groupKey: `reuniao-amanha:${m.starts_at.slice(0, 10)}`, client: m.client_id });
    }
  }
  // Processo parado (> 3 dias na mesma etapa interna)
  for (const c of all("SELECT c.*, cl.name cname FROM contents c JOIN clients cl ON cl.id=c.client_id WHERE c.blocked=0 AND c.stage IN ('cronograma','analise_cronograma','ajuste_cronograma','producao','analise_producao','ajuste_interno','ajuste_cliente','revisao_ajuste','agendamento') AND c.stage_entered_at < ?", new Date(t - 3 * 864e5).toISOString())) {
    if (isEnabled('processo.parado') && onceFor('processo.parado', c.id, c.stage_entered_at)) {
      automation('processo.parado', { entity: 'content', id: c.id, client: c.client_id, detail: c.stage_entered_at });
      notify(cc(), { level: 'atencao', type: 'parado', title: 'Conteúdos parados há mais de 3 dias', body: `${c.cname} · #${c.number} em ${STAGES[c.stage].label}`, link: '/processos', groupKey: 'parado:cc' });
    }
  }
  // Onboarding: itens atrasados
  for (const o of all("SELECT oi.*, ob.client_id FROM onboarding_items oi JOIN onboarding ob ON ob.id=oi.onboarding_id WHERE oi.status='pendente' AND oi.due_at < ? AND ob.status<>'concluido'", nowIso)) {
    if (isEnabled('onboarding.item_atrasado') && onceFor('onboarding.item_atrasado', o.id, o.due_at)) {
      automation('onboarding.item_atrasado', { entity: 'onboarding_item', id: o.id, client: o.client_id, detail: o.due_at });
      if (o.who === 'cliente') notify(clientUsers(o.client_id), { level: 'atencao', type: 'onboarding', title: 'Falta pouco para começarmos', body: `Ainda precisamos de: ${o.label}`, link: '/portal/projeto', groupKey: `onb:${o.client_id}`, client: o.client_id });
      notify(resolveAssignee(o.client_id, 'atendimento'), { level: 'atencao', type: 'onboarding', title: 'Onboarding com item atrasado', body: o.label, link: `/clientes/${o.client_id}?tab=onboarding`, groupKey: `onb-int:${o.client_id}`, client: o.client_id });
    }
  }
  // CRM: próxima ação vencida → tarefa de follow-up
  for (const d of all("SELECT * FROM deals WHERE stage NOT IN ('fechado','perdido','onboarding') AND next_action_at IS NOT NULL AND next_action_at < ?", nowIso)) {
    if (isEnabled('crm.followup') && onceFor('crm.followup', d.id, d.next_action_at)) {
      automation('crm.followup', { entity: 'deal', id: d.id, detail: d.next_action_at });
      insert('tasks', { id: uid('t_'), title: `Follow-up comercial — ${d.name}`, description: d.next_action, function: 'comercial', assignee_id: d.owner_id, status: 'aberta', kind: 'follow_up', origin: 'automacao', source_type: 'deal', source_id: d.id, priority: 'alta', due_at: new Date(t + 4 * H).toISOString(), created_at: nowIso });
      notify(d.owner_id, { level: 'atencao', type: 'crm', title: `Follow-up vencido: ${d.name}`, body: d.next_action, link: '/crm' });
    }
  }
  // Financeiro: atraso e vencimento próximo
  for (const i of all("SELECT inv.*, cl.name cname FROM invoices inv JOIN clients cl ON cl.id=inv.client_id WHERE inv.status='aberta'")) {
    const fin = all("SELECT id FROM users WHERE active=1 AND role_key IN ('comercial','ceo')").map((r) => r.id);
    if (i.due_at < nowIso) {
      run("UPDATE invoices SET status='atrasada' WHERE id=?", i.id);
      if (isEnabled('financeiro.atraso') && onceFor('financeiro.atraso', i.id, i.due_at)) { automation('financeiro.atraso', { entity: 'invoice', id: i.id, client: i.client_id, detail: i.due_at }); notify(fin, { level: 'atencao', type: 'financeiro', title: 'Parcela em atraso', body: `${i.cname} — ${i.description}`, link: '/financeiro', groupKey: 'fin:atraso' }); }
    } else if (new Date(i.due_at).getTime() - t < 3 * 864e5 && isEnabled('financeiro.vencimento') && onceFor('financeiro.vencimento', i.id, i.due_at)) {
      automation('financeiro.vencimento', { entity: 'invoice', id: i.id, client: i.client_id, detail: i.due_at });
      notify(fin, { level: 'info', type: 'financeiro', title: 'Vencimentos nos próximos 3 dias', body: `${i.cname} — ${i.description}`, link: '/financeiro', groupKey: 'fin:venc' });
    }
  }
}

let last15 = 0, lastPublish = 0;
export function startScheduler() {
  const safe = (fn, name) => { try { return fn(); } catch (e) { console.error(`[scheduler] ${name}:`, e.message); } };
  const loop = async () => {
    safe(tick, 'tick');
    if (Date.now() - lastPublish > 60e3) { lastPublish = Date.now(); try { await publishDueContent(); } catch (e) { console.error('[scheduler] meta:', e.message); } }
    if (Date.now() - last15 > 15 * 60e3) {
      last15 = Date.now();
      safe(() => { if (isEnabled('insights.detectar')) { runDetectors(); automation('insights.detectar', { detail: 'ok' }); } }, 'detectors');
      safe(() => {
        const d = new Date();
        const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7)); monday.setHours(0, 0, 0, 0);
        if (d.getDay() === 1 && d.getHours() >= 8 && isEnabled('relatorio.semanal') && onceFor('relatorio.semanal', 'semana', monday.toISOString().slice(0, 10))) {
          automation('relatorio.semanal', { entity: 'report', id: 'semana', detail: monday.toISOString().slice(0, 10) });
          generateReport('operacao', new Date(monday.getTime() - 7 * 864e5).toISOString(), monday.toISOString());
        }
      }, 'reports');
      safe(() => {
        if (!isEnabled('saude.calcular')) return;
        const ops = all("SELECT id FROM users WHERE active=1 AND role_key IN ('ceo','operacoes')").map((r) => r.id);
        snapshotHealth((c, h, prev) => {
          automation('saude.calcular', { entity: 'client', id: c.id, client: c.id, detail: `${prev}→${h.level}` });
          notify(ops, { level: h.level === 'risco' ? 'urgente' : 'atencao', type: 'saude', title: `${c.name}: saúde do cliente ${LEVEL_LABEL[prev]} → ${LEVEL_LABEL[h.level]}`, body: h.signals.filter((x) => ['risco', 'atencao'].includes(x.level)).map((x) => `${x.label}: ${x.evidence[0]}`).join(' · ').slice(0, 240), link: `/clientes/${c.id}?tab=saude`, client: c.id });
        });
      }, 'health');
      detectTranscripts().catch((e) => console.error('[scheduler] transcrições:', e.message));
    }
  };
  loop();
  return setInterval(loop, 60e3);
}
