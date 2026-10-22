// Estado honesto de integrações e automações: o que está conectado, o que falta e o que não roda nesta hospedagem.
// Nunca expõe valores de variáveis/segredos — só NOMES do que falta configurar. Nada é simulado.
import { Router } from 'express';
import path from 'node:path';
import { one, all, now } from '../db.js';
import { requireInternal, requirePerm } from '../lib/auth.js';
import { integrationStatus } from '../integrations/vault.js';
import { aiConfigured } from '../ai/gateway.js';
import { mailConfigured } from '../services/mail.js';
import { knowledgeProvider } from '../ai/memory.js';
import { automationStats } from '../engine/automations.js';

export const status = Router();

const env = (k) => !!process.env[k];
const missingEnv = (keys) => keys.filter((k) => !env(k));
const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
const count = (sql, ...p) => safe(() => one(sql, ...p)?.n ?? 0, null);

// ───────────── Agendador (rotinas por horário) ─────────────
// Processo contínuo: server/index.js chama startScheduler() quando executado diretamente e BOLD_SCHEDULER≠off (não na Vercel).
// Cron externo: /api/cron/tick só aceita chamadas com CRON_SECRET; na Vercel, vercel.json agenda "0 10 * * *" (UTC), e ele roda SÓ o tick.
const VERCEL_CRON = { hour: 10, minute: 0 }; // vercel.json → crons[0].schedule = "0 10 * * *"
function inProcessScheduler() {
  if (env('VERCEL')) return false;
  if (process.env.BOLD_SCHEDULER === 'off') return false;
  return !!process.argv[1] && path.resolve(process.argv[1]) === path.resolve('server/index.js');
}
export function schedulerState() {
  const lastTick = safe(() => one("SELECT status, started_at, finished_at, trigger, error FROM job_runs WHERE job='tick' ORDER BY started_at DESC LIMIT 1"));
  const base = { hosting: env('VERCEL') ? 'vercel' : 'servidor', cron_secret: env('CRON_SECRET'), last_tick: lastTick || null };
  if (inProcessScheduler()) return { ...base, active: true, mode: 'processo', reason: 'Agendador contínuo do servidor: verifica prazos a cada minuto, publicação Meta a cada minuto e detectores/relatório a cada 15 minutos.' };
  if (env('CRON_SECRET') && env('VERCEL')) return { ...base, active: true, mode: 'cron_externo', reason: 'Cron diário da Vercel (10:00 UTC) chama /api/cron/tick: só a rotina de prazos/régua/saúde roda, uma vez por dia. Publicação Meta, detectores a cada 15 min, relatório semanal e detecção de transcrições não rodam nesta hospedagem. A base da prévia é uma cópia temporária.' };
  if (env('CRON_SECRET')) {
    const recent = lastTick?.trigger === 'cron' && Date.now() - new Date(lastTick.started_at).getTime() < 26 * 3600e3;
    return { ...base, active: !!recent, mode: recent ? 'cron_externo' : null, reason: recent ? 'Um cron externo chamou /api/cron/tick nas últimas 26h (só a rotina de prazos/régua/saúde).' : 'CRON_SECRET definido, mas nenhum cron externo chamou /api/cron/tick nas últimas 26h. Agendador do processo não está ativo.' };
  }
  return { ...base, active: false, mode: null, reason: env('VERCEL')
    ? 'Rotinas por horário não rodam nesta hospedagem: a Vercel não mantém o processo vivo e o cron depende de CRON_SECRET (não configurado).'
    : process.env.BOLD_SCHEDULER === 'off' ? 'Agendador desligado por BOLD_SCHEDULER=off e sem CRON_SECRET para cron externo.' : 'Agendador do processo não está ativo neste servidor e não há CRON_SECRET para cron externo.' };
}

// ───────────── Integrações ─────────────
// Estado gravado na tabela integrations: conectado → conectada; erro/token_expirado → erro.
function stored(provider) {
  const s = integrationStatus(provider);
  const row = safe(() => one('SELECT expires_at FROM integrations WHERE provider=?', provider));
  let st = s.status;
  if (provider === 'meta' && st === 'conectado' && row?.expires_at && row.expires_at < now()) st = 'token_expirado';
  return { ...s, stored_status: st };
}
function oauthItem(provider, { name, purpose, used_by, depends_on = [], extraMissing = [], connectedDetail, notConnectedDetail }) {
  const s = stored(provider);
  const needEnv = missingEnv(s.env);
  const common = { provider, account: s.account, updated_at: s.updated_at, last_error: s.last_error, config: s.config, connected: s.stored_status === 'conectado', can_connect: needEnv.length === 0 };
  let state; let detail; let missing = [];
  if (s.stored_status === 'conectado') { state = 'conectada'; detail = connectedDetail; missing = extraMissing; }
  else if (s.stored_status === 'erro' || s.stored_status === 'token_expirado') {
    state = 'erro';
    detail = s.stored_status === 'token_expirado' ? 'O token de acesso expirou. Reconecte a conta.' : `A última tentativa falhou${s.last_error ? `: ${s.last_error}` : '.'} Reconecte a conta.`;
    missing = [...needEnv.map((e) => `Variável ${e} no servidor`), 'Reconectar a conta', ...extraMissing];
  } else if (needEnv.length) {
    state = 'aguardando_configuracao';
    detail = notConnectedDetail || 'Código pronto. Faltam as credenciais do aplicativo no servidor.';
    missing = [...needEnv.map((e) => `Variável ${e} no servidor`), ...extraMissing, 'Conectar a conta pela tela de Integrações'];
  } else {
    state = 'nao_conectada';
    detail = 'Credenciais do aplicativo presentes no servidor. Falta autorizar a conta.';
    missing = [...extraMissing, 'Conectar a conta (botão Conectar)'];
  }
  return { key: provider, group: 'integracao', name, purpose, state, detail, missing, depends_on, used_by, action: state === 'conectada' ? null : 'connect', ...common };
}

function integrationsList() {
  const noBase = env('PUBLIC_BASE_URL') ? [] : ['Variável PUBLIC_BASE_URL (endereço público para o retorno do login)'];
  const gcal = oauthItem('google_calendar', {
    name: 'Google Calendar', purpose: 'Reuniões criadas na plataforma viram eventos com convidados; a reserva de horário confere conflitos (free/busy).',
    used_by: ['Reuniões', 'Calendário', 'Agenda do cliente (portal)'], depends_on: ['Projeto no Google Cloud (OAuth)', 'PUBLIC_BASE_URL'], extraMissing: noBase,
    connectedDetail: 'Conectado. Reuniões criadas aqui geram eventos com convidados.',
  });
  const meetState = gcal.state === 'conectada' ? 'conectada' : gcal.state === 'erro' ? 'erro' : 'aguardando_configuracao';
  const meet = {
    key: 'google_meet', group: 'integracao', name: 'Google Meet', purpose: 'Link do Meet gerado automaticamente nas reuniões sem local físico.',
    state: meetState,
    detail: meetState === 'conectada' ? 'Ativo pelo Google Calendar: reuniões sem local nascem com link do Meet.' : meetState === 'erro' ? 'Depende do Google Calendar, que está com erro.' : 'Código pronto. Depende do Google Calendar conectado.',
    missing: meetState === 'conectada' ? [] : ['Google Calendar conectado'], depends_on: ['Google Calendar'], used_by: ['Reuniões', 'Agenda do cliente (portal)'], action: null,
  };
  const drive = {
    key: 'google_drive', group: 'integracao', name: 'Google Drive', purpose: 'Vincular materiais do cliente e localizar transcrições de reunião.',
    state: 'aguardando_decisao', detail: 'Não implementada. A especificação está pronta (docs/integracoes/google-drive.md); falta decidir Workspace × Gmail, que define o escopo do acesso.',
    missing: ['Decisão Workspace × Gmail', 'Implementação da integração'], depends_on: ['Decisão da CEO', 'Projeto no Google Cloud (OAuth)'], used_by: ['Materiais do cliente', 'Transcrições de reunião'], action: null,
  };
  const slackItem = oauthItem('slack', {
    name: 'Slack', purpose: 'Ponte de transição: avisos-chave em canais do Slack enquanto a comunicação migra para o THE BOLD CHAT.',
    used_by: ['Comunicação (transição)'], depends_on: ['Slack App (OAuth v2)', 'PUBLIC_BASE_URL'], extraMissing: noBase,
    connectedDetail: 'Conta conectada. Atenção: o espelhamento automático de etapas (slack.espelhar) ainda não foi implementado.',
    notConnectedDetail: 'Conexão e envio prontos no código. O espelhamento automático de etapas não foi implementado.',
  });
  const metaItem = oauthItem('meta', {
    name: 'Meta · Instagram', purpose: 'Publicar no horário agendado (imagem, carrossel até 10 itens, reels). A API não agenda: a plataforma publica no momento certo.',
    used_by: ['Agendamento de conteúdos', 'Calendário editorial'], depends_on: ['App Meta (Instagram Graph API)', 'Conta Instagram profissional vinculada a uma Página', 'PUBLIC_BASE_URL', 'Agendador (cron/hospedagem persistente)'],
    extraMissing: env('PUBLIC_BASE_URL') ? [] : ['Variável PUBLIC_BASE_URL (a Meta busca a mídia por link público)'],
    connectedDetail: 'Conta conectada. Vincule cada cliente à conta Instagram abaixo. A publicação no horário depende do agendador.',
  });
  const mail = mailConfigured();
  const email = {
    key: 'email', group: 'integracao', name: 'E-mail (Resend)', purpose: 'Envio de e-mails transacionais, como o link de redefinição de senha.',
    state: mail ? 'conectada' : 'aguardando_configuracao', detail: mail ? 'Configurado no servidor.' : 'Código pronto. Sem as variáveis, nenhum e-mail é enviado (a tela avisa que não foi enviado).',
    missing: missingEnv(['RESEND_API_KEY', 'BOLD_MAIL_FROM']).map((e) => `Variável ${e} no servidor`), depends_on: ['Conta Resend com domínio verificado'], used_by: ['Esqueci minha senha', 'Usuários'], action: null,
  };
  const ai = aiConfigured();
  const lastAi = ai ? safe(() => one("SELECT status, created_at FROM ai_actions WHERE status IN ('ok','erro') ORDER BY created_at DESC LIMIT 1")) : null;
  const claude = {
    key: 'anthropic', group: 'integracao', name: 'Claude (Anthropic)', purpose: 'Respostas do The Bold Brain e dos agentes; narrativa de insights e rascunhos de resumo de reunião.',
    state: !ai ? 'aguardando_configuracao' : lastAi?.status === 'erro' ? 'erro' : 'conectada',
    detail: !ai ? 'Sem a chave, o Brain não responde e nada é simulado.' : lastAi?.status === 'erro' ? 'Chave presente, mas a última consulta falhou. Verifique a chave e o saldo da conta.' : 'Chave presente no servidor.',
    missing: ai ? [] : ['Variável ANTHROPIC_API_KEY no servidor'], depends_on: ['Conta na Anthropic (API)'], used_by: ['The Bold Brain', 'Insights (narrativa)', 'Reuniões (resumo por IA)'], action: null, last_used_at: lastAi?.created_at || null,
  };
  const notionCounts = {
    historico: count('SELECT COUNT(*) n FROM notion_history'),
    conteudos: count("SELECT COUNT(*) n FROM contents WHERE data_origin='notion'"),
    tarefas: count("SELECT COUNT(*) n FROM tasks WHERE data_origin='notion'"),
    clientes: count('SELECT COUNT(*) n FROM clients WHERE notion_url IS NOT NULL'),
  };
  const notion = {
    key: 'notion', group: 'integracao', name: 'Notion', purpose: 'Origem dos dados migrados (clientes, conteúdos, tarefas e histórico editorial).',
    state: process.env.NOTION_TOKEN ? 'aguardando_decisao' : 'bloqueado', detail: process.env.NOTION_TOKEN ? 'Notion → The Bold OS pronto; bases ligam só por decisão da CEO. The Bold OS → Notion: desativado.' : 'BLOQUEADO — NOTION_TOKEN NÃO CONFIGURADO. Arquitetura Notion → The Bold OS pronta; o que existe hoje é importação única (não é sincronização). The Bold OS → Notion: desativado.',
    missing: [...(process.env.NOTION_TOKEN ? [] : ['NOTION_TOKEN (integração interna do Notion, com as bases compartilhadas)']), ...(process.env.BOLD_PERSISTENT_HOST === '1' ? [] : ['Hospedagem persistente para a rotina contínua']), 'Decisão: quais bases entram na sincronização viva'], depends_on: ['NOTION_TOKEN', 'Hospedagem persistente'], link: '/integracoes/notion', link_label: 'Abrir painel do Notion', used_by: ['Clientes', 'Conteúdos', 'Histórico', 'Atrasos (itens herdados)'], action: null, counts: notionCounts,
  };
  const kp = safe(() => knowledgeProvider().name, 'banco');
  const obsidian = {
    key: 'obsidian', group: 'integracao', name: 'Obsidian (opcional)', purpose: 'Memória de conhecimento alternativa ao banco: notas de um cofre Obsidian no contexto do Brain.',
    state: kp === 'obsidian' ? 'ativo' : 'aguardando_configuracao', detail: kp === 'obsidian' ? 'Em uso como memória do Brain.' : 'Opcional. Hoje a memória do Brain é o banco da plataforma.',
    missing: kp === 'obsidian' ? [] : [...missingEnv(['OBSIDIAN_VAULT_PATH']).map((e) => `Variável ${e} no servidor`), 'BOLD_KNOWLEDGE_PROVIDER=obsidian (ou configuração knowledge_provider)'],
    depends_on: ['Cofre Obsidian acessível pelo servidor'], used_by: ['The Bold Brain'], action: null,
  };

  // ── Infraestrutura ──
  const vercel = env('VERCEL');
  const sch = schedulerState();
  const hosting = {
    key: 'hospedagem', group: 'infraestrutura', name: 'Hospedagem atual', purpose: 'Onde a plataforma roda agora.',
    state: 'ativo', detail: vercel ? 'Prévia na Vercel: cada instância usa uma cópia temporária da base (SQLite em /tmp). Alterações feitas aqui não são permanentes.' : 'Servidor Node contínuo com a base SQLite em disco.',
    missing: vercel ? ['Hospedagem persistente (plano Railway aguardando aprovação)'] : [], depends_on: [], used_by: ['Toda a plataforma'], action: null,
  };
  const railway = {
    key: 'railway', group: 'infraestrutura', name: 'Railway (hospedagem definitiva)', purpose: 'Servidor contínuo com volume persistente: base permanente e agendador rodando sozinho.',
    state: 'aguardando_decisao', detail: 'Plano em docs/08-arquitetura-railway.md. Nada vai para o Railway até a CEO aprovar.',
    missing: ['Aprovação da CEO', 'Criar serviço, volume /data e variáveis no Railway'], depends_on: ['Decisão da CEO'], used_by: ['Toda a plataforma', 'Automações por horário'], action: null,
  };
  const cron = {
    key: 'cron', group: 'infraestrutura', name: 'Agendador (rotinas por horário)', purpose: 'Prazos, régua de cobrança do cliente, follow-ups, financeiro, saúde, detectores e publicação no horário.',
    state: sch.active ? 'ativo' : 'aguardando_configuracao', detail: sch.reason,
    missing: sch.active ? (sch.mode === 'cron_externo' ? ['Hospedagem persistente para as rotinas de 15 min e de publicação'] : []) : ['Variável CRON_SECRET (cron externo) ou hospedagem persistente'],
    depends_on: ['Hospedagem'], used_by: ['Automações', 'Pendências', 'Atrasos', 'Financeiro', 'Torre de Controle'], action: null,
  };
  const baseUrl = {
    key: 'public_base_url', group: 'infraestrutura', name: 'Endereço público (PUBLIC_BASE_URL)', purpose: 'Retorno dos logins OAuth, links de mídia para a Meta e links enviados por e-mail.',
    state: env('PUBLIC_BASE_URL') ? 'ativo' : 'aguardando_configuracao', detail: env('PUBLIC_BASE_URL') ? 'Definido no servidor.' : 'Não definido: os retornos de login usam localhost e a publicação via Meta fica indisponível.',
    missing: env('PUBLIC_BASE_URL') ? [] : ['Variável PUBLIC_BASE_URL no servidor'], depends_on: ['Domínio estável'], used_by: ['Google Calendar', 'Meta · Instagram', 'Slack', 'E-mail'], action: null,
  };
  return [gcal, meet, drive, slackItem, metaItem, email, claude, notion, obsidian, hosting, railway, cron, baseUrl];
}

const tally = (items) => items.reduce((m, i) => ({ ...m, [i.state]: (m[i.state] || 0) + 1 }), {});

status.get('/status/integrations', requireInternal, requirePerm('integracoes', 'view'), (_req, res) => {
  const items = integrationsList();
  res.json({ items, summary: tally(items), public_base_url: env('PUBLIC_BASE_URL'),
    clients: all("SELECT id, name, handle FROM clients WHERE status<>'encerrado' ORDER BY name"), generated_at: now() });
});

// ───────────── Automações ─────────────
// Rotinas por horário e de onde rodam (scheduler.js): TICK = dentro de tick() (processo a cada minuto ou /api/cron/tick);
// LOOP = só no laço do processo contínuo (startScheduler), que não roda na Vercel.
const TIMED = {
  'etapa.disponivel': { run: 'tick', every: 1, schedule: 'A cada minuto' },
  'prazo.proximo': { run: 'tick', every: 1, schedule: 'A cada minuto' },
  'prazo.vencido': { run: 'tick', every: 1, schedule: 'A cada minuto' },
  'cliente.sem_resposta_24h': { run: 'tick', every: 1, schedule: 'A cada minuto' },
  'cliente.sem_resposta_48h': { run: 'tick', every: 1, schedule: 'A cada minuto' },
  'cliente.sem_resposta_72h': { run: 'tick', every: 1, schedule: 'A cada minuto' },
  'cliente.prazo_vencido': { run: 'tick', every: 1, schedule: 'A cada minuto' },
  'processo.parado': { run: 'tick', every: 1, schedule: 'A cada minuto' },
  'onboarding.item_atrasado': { run: 'tick', every: 1, schedule: 'A cada minuto' },
  'crm.followup': { run: 'tick', every: 1, schedule: 'A cada minuto' },
  'financeiro.atraso': { run: 'tick', every: 1, schedule: 'A cada minuto' },
  'financeiro.vencimento': { run: 'tick', every: 1, schedule: 'A cada minuto' },
  'saude.calcular': { run: 'tick', every: 1, schedule: 'A cada minuto (uma fotografia por dia)' },
  'meta.publicar': { run: 'loop', every: 1, schedule: 'A cada minuto (processo contínuo)' },
  'insights.detectar': { run: 'loop', every: 15, schedule: 'A cada 15 minutos (também ao abrir a Torre ou a Visão geral)' },
  'reuniao.transcricao_detectada': { run: 'loop', every: 15, schedule: 'A cada 15 minutos (processo contínuo)' },
  'relatorio.semanal': { run: 'loop', weekly: true, schedule: 'Segunda-feira, a partir das 08h' },
};
// Dependências externas (integração/IA) por automação
const NEEDS = {
  'meta.publicar': { label: 'Meta · Instagram conectada', ok: () => stored('meta').stored_status === 'conectado' },
  'insights.narrativa': { label: 'Claude (ANTHROPIC_API_KEY)', ok: aiConfigured },
  'reuniao.extracao_ia': { label: 'Claude (ANTHROPIC_API_KEY)', ok: aiConfigured },
  'reuniao.transcricao_detectada': { label: 'Google Calendar conectado', ok: () => stored('google_calendar').stored_status === 'conectado' },
};
const SOFT = { 'reuniao.reservada': 'Google Calendar (opcional: sem ele, a reunião é criada sem evento)', 'conteudo.agendado': 'Meta · Instagram (opcional: sem ela, agendamento externo)', 'drive.material': 'Google Drive (não implementado)', 'slack.espelhar': 'Slack conectado', 'brain.feedback': 'Claude (ANTHROPIC_API_KEY)', 'previsao.atraso': 'Histórico suficiente + Claude' };

function nextMinute(stepMin, last) {
  const base = last ? new Date(last).getTime() + stepMin * 60e3 : Date.now();
  const t = Math.max(base, Date.now());
  const d = new Date(t); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() + (t > d.getTime() ? 1 : 0));
  return d.toISOString();
}
function nextVercelCron() {
  const d = new Date(); const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), VERCEL_CRON.hour, VERCEL_CRON.minute));
  if (n <= d) n.setUTCDate(n.getUTCDate() + 1);
  return n.toISOString();
}
function nextMonday8() { // mesma regra do scheduler: hora local do servidor
  const d = new Date(); const n = new Date(d); n.setHours(8, 0, 0, 0);
  const add = (8 - d.getDay()) % 7; n.setDate(d.getDate() + add);
  if (n <= d) n.setDate(n.getDate() + 7);
  return n.toISOString();
}

status.get('/status/automations', requireInternal, requirePerm('automacoes', 'view'), (_req, res) => {
  const sch = schedulerState();
  const lastErr = Object.fromEntries(safe(() => all("SELECT automation_key k, MAX(created_at) at FROM automation_runs WHERE status='erro' GROUP BY automation_key"), []).map((r) => [r.k, r.at]));
  const errDetail = (k) => (lastErr[k] ? safe(() => one("SELECT detail, created_at FROM automation_runs WHERE automation_key=? AND status='erro' ORDER BY created_at DESC LIMIT 1", k)) : null);
  const automations = automationStats().map((a) => {
    const timed = TIMED[a.key];
    const need = NEEDS[a.key];
    const depends_on = [];
    if (timed) depends_on.push('Agendador (cron/hospedagem persistente)');
    if (need) depends_on.push(need.label);
    if (SOFT[a.key]) depends_on.push(SOFT[a.key]);
    const covered = timed ? (sch.mode === 'processo' || (sch.mode === 'cron_externo' && timed.run === 'tick')) : true;
    let state; let reason = null;
    if (!a.implemented) { state = 'em_desenvolvimento'; reason = 'Mapeada, ainda não implementada.'; }
    else if (!a.enabled) { state = 'desligada'; reason = 'Desligada na plataforma.'; }
    else if (need && !need.ok()) { state = 'aguardando_integracao'; reason = `Falta: ${need.label}.`; }
    else if (timed && !covered) { state = 'aguardando_configuracao'; reason = sch.mode === 'cron_externo' ? 'O cron externo só roda a rotina diária de prazos; esta precisa do processo contínuo.' : 'Rotina por horário: agendador não roda nesta hospedagem.'; }
    else state = 'ativo';
    let next_run = null; let next_run_reason = null;
    if (timed) {
      if (state !== 'ativo') next_run_reason = state === 'aguardando_configuracao' ? 'agendador não roda nesta hospedagem' : reason;
      else if (sch.mode === 'cron_externo' && env('VERCEL')) next_run = nextVercelCron();
      else if (sch.mode === 'cron_externo') next_run_reason = 'horário definido pelo cron externo (não determinável daqui)';
      else if (timed.weekly) next_run = nextMonday8();
      else next_run = nextMinute(timed.every, timed.every > 1 ? a.last_run : null);
    }
    const e = errDetail(a.key);
    return {
      key: a.key, name: a.event, label: a.event, action: a.action, trigger: timed ? 'horario' : a.engine === 'humano' ? 'acao_humana' : 'evento', schedule: timed?.schedule || null,
      phase: a.phase, implemented: !!a.implemented, enabled: !!a.enabled, state, reason, runs: a.runs, last_run: a.last_run || null,
      last_error: e ? { at: e.created_at, detail: e.detail } : null, next_run, next_run_reason, depends_on,
    };
  });
  const jobs = safe(() => all(`SELECT j.job, j.status, j.started_at, j.finished_at, j.trigger, j.error FROM job_runs j
    WHERE j.started_at = (SELECT MAX(started_at) FROM job_runs x WHERE x.job=j.job) ORDER BY j.started_at DESC`), []);
  res.json({ automations, summary: tally(automations), jobs, scheduler: { active: sch.active, mode: sch.mode, reason: sch.reason, hosting: sch.hosting, cron_secret: sch.cron_secret, last_tick: sch.last_tick }, generated_at: now() });
});
