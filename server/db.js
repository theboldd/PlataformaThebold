// THE BOLD OS — banco de dados (fonte oficial da verdade).
// SQLite embutido (node:sqlite) para o MVP. O schema é relacional e portável para Postgres.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = process.env.BOLD_DATA_DIR || path.resolve('storage');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.BOLD_DB_PATH || path.join(DATA_DIR, 'bold.db');

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

export const uid = (p = '') => p + crypto.randomBytes(9).toString('base64url');
// Relógio da aplicação (setClock permite fixar o horário em scripts e testes).
let clockOffset = 0;
export const setClock = (iso) => { clockOffset = iso ? new Date(iso).getTime() - Date.now() : 0; };
export const nowMs = () => Date.now() + clockOffset;
export const now = () => new Date(nowMs()).toISOString();

const SCHEMA = `
-- ───────────── PESSOAS, ACESSO E PERMISSÕES ─────────────
CREATE TABLE IF NOT EXISTS roles (
  key TEXT PRIMARY KEY, label TEXT NOT NULL, internal INTEGER NOT NULL DEFAULT 1,
  dashboard TEXT NOT NULL DEFAULT 'producao', all_clients INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS role_permissions (
  role_key TEXT NOT NULL REFERENCES roles(key) ON DELETE CASCADE,
  module TEXT NOT NULL, action TEXT NOT NULL, PRIMARY KEY (role_key, module, action)
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL, role_key TEXT NOT NULL REFERENCES roles(key),
  title TEXT, functions TEXT NOT NULL DEFAULT '[]',        -- funções operacionais: estrategia, design, edicao, copy, revisao, agendamento, atendimento
  active INTEGER NOT NULL DEFAULT 1, avatar_color TEXT, capacity INTEGER NOT NULL DEFAULT 12, -- conteúdos/semana
  created_at TEXT NOT NULL, last_login_at TEXT
);
-- Exceções por usuário (grant/deny) sobre as permissões do role
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module TEXT NOT NULL, action TEXT NOT NULL, effect TEXT NOT NULL CHECK (effect IN ('grant','deny')),
  PRIMARY KEY (user_id, module, action)
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, ip TEXT, user_agent TEXT
);

-- ───────────── CLIENTES ─────────────
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, handle TEXT, segment TEXT, status TEXT NOT NULL DEFAULT 'ativo', -- onboarding | ativo | pausado | encerrado
  services TEXT NOT NULL DEFAULT '[]', color TEXT, started_at TEXT, requires_theme_approval INTEGER NOT NULL DEFAULT 1,
  monthly_posts INTEGER NOT NULL DEFAULT 12, created_at TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0
);
-- Equipe vinculada ao cliente, por função. É a base do controle de acesso por cliente e da atribuição automática.
CREATE TABLE IF NOT EXISTS client_members (
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  function TEXT NOT NULL, -- estrategia | design | edicao | copy | revisao | agendamento | atendimento | cliente
  PRIMARY KEY (client_id, user_id, function)
);
-- CLIENT BRAIN: memória estruturada do cliente (consultável pela IA)
CREATE TABLE IF NOT EXISTS client_brain (
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  section TEXT NOT NULL, -- posicionamento | publico | persona | tom | linguagem | oferta | produtos | objetivos | estrategia | preferencias | restricoes | referencias | regras | importante
  body TEXT NOT NULL DEFAULT '', updated_by TEXT, updated_at TEXT,
  visibility TEXT NOT NULL DEFAULT 'internal', PRIMARY KEY (client_id, section)
);
-- Memórias pontuais: decisões, aprendizados, feedbacks (append-only)
CREATE TABLE IF NOT EXISTS client_memories (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, -- decisao | aprendizado | feedback | preferencia | restricao | informacao
  body TEXT NOT NULL, source_type TEXT, source_id TEXT, created_by TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'recorrente', status TEXT NOT NULL DEFAULT 'ativo',
  cycle_month TEXT, created_at TEXT NOT NULL
);

-- Memória do cliente com PROCEDÊNCIA: cada informação guarda de onde veio (onboarding do cliente, equipe, observação interna, Notion)
CREATE TABLE IF NOT EXISTS client_brain_entries (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  section TEXT NOT NULL, label TEXT, content TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'equipe', -- onboarding_cliente | equipe | observacao_interna | indefinido
  source_type TEXT NOT NULL DEFAULT 'plataforma', -- plataforma | notion | onboarding
  source_ref TEXT, source_page TEXT, created_by TEXT, created_at TEXT NOT NULL, updated_by TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_brain_entries ON client_brain_entries(client_id, section);
CREATE TABLE IF NOT EXISTS client_links (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  label TEXT, url TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'link', -- link | arquivo
  source_page TEXT, source_type TEXT NOT NULL DEFAULT 'plataforma', created_at TEXT NOT NULL
);
-- Cofre de acessos do cliente (logins/senhas): sempre cifrado; revelar exige permissão e fica auditado
CREATE TABLE IF NOT EXISTS client_secrets (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  label TEXT NOT NULL, secret_enc TEXT NOT NULL, provided_by TEXT, created_at TEXT NOT NULL, updated_at TEXT
);
-- Formulário oficial de onboarding (estrutura real do Notion "Sua marca", versionada)
CREATE TABLE IF NOT EXISTS onboarding_forms (
  id TEXT PRIMARY KEY, version TEXT NOT NULL, title TEXT NOT NULL, source TEXT, structure TEXT NOT NULL,
  required_keys TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS onboarding_answers (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE, form_id TEXT,
  question_key TEXT NOT NULL, question_text TEXT, answer TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL DEFAULT 'onboarding_cliente', source_type TEXT NOT NULL DEFAULT 'plataforma', source_ref TEXT,
  answered_by TEXT, answered_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (client_id, question_key)
);
-- Pontos da migração que precisam de revisão humana (conflitos, ambiguidades, dados não migrados)
CREATE TABLE IF NOT EXISTS migration_issues (
  id TEXT PRIMARY KEY, client_id TEXT REFERENCES clients(id) ON DELETE CASCADE, client_name TEXT,
  kind TEXT NOT NULL, description TEXT NOT NULL, source TEXT, status TEXT NOT NULL DEFAULT 'aberto', created_at TEXT NOT NULL
);

-- Movimentos de etapa feitos por pessoas (o engine registra os automáticos em activity_logs)
CREATE TABLE IF NOT EXISTS stage_moves (
  id TEXT PRIMARY KEY, content_id TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE, client_id TEXT,
  from_stage TEXT NOT NULL, to_stage TEXT NOT NULL,
  kind TEXT NOT NULL, -- manual | retorno | reabertura | correcao | excecao
  reason TEXT, actor_id TEXT, prev_assignees TEXT, new_assignees TEXT, impacts TEXT, created_at TEXT NOT NULL
);

-- E-mails de cliente encontrados em fontes reais que NÃO são cadastro de acesso (ex.: contato publicado num post):
-- ficam para a equipe confirmar antes de virar login (regra oficial 4 — nada é inventado nem usado sem origem)
CREATE TABLE IF NOT EXISTS client_email_candidates (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE, email TEXT NOT NULL,
  source TEXT NOT NULL, source_url TEXT, confidence TEXT NOT NULL, -- cadastro | conteudo
  status TEXT NOT NULL DEFAULT 'a_confirmar', -- a_confirmar | usado | descartado
  decided_by TEXT, decided_at TEXT, created_at TEXT NOT NULL, UNIQUE (client_id, email)
);

-- Classificação operacional de itens atrasados (regra oficial: atraso ≠ culpa da responsável).
-- A regra só registra FATOS com fonte; a categoria/atribuição final é de uma pessoa autorizada.
-- Histórico de cada mudança fica em activity_logs (append-only).
CREATE TABLE IF NOT EXISTS delay_reviews (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE, content_id TEXT, client_id TEXT,
  category TEXT NOT NULL DEFAULT 'sem_contexto', -- atraso_cliente | aguardando_cliente | atraso_equipe | atraso_responsavel | processo_antigo | dado_migrado | responsabilidade_alterada | sem_contexto | reprogramado | cancelado | outro
  attribution TEXT NOT NULL DEFAULT 'nao_atribuido', -- nao_atribuido | cliente | equipe | responsavel
  facts TEXT NOT NULL DEFAULT '[]', -- [{k, label, value, source}] fatos levantados por regra a partir da base, cada um com a fonte
  source_facts TEXT NOT NULL DEFAULT '[]', -- fatos lidos da fonte original (export do Notion), gravados só pelo script de migração
  decided_by TEXT, -- NULL = só a regra (fatos); preenchido quando uma pessoa classifica
  decided_at TEXT, note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
-- Controle de execução das rotinas automáticas (cron idempotente com trava e timeout)
CREATE TABLE IF NOT EXISTS job_runs (
  id TEXT PRIMARY KEY, job TEXT NOT NULL, status TEXT NOT NULL, -- rodando | ok | erro | ignorado | expirado
  started_at TEXT NOT NULL, finished_at TEXT, lease_until TEXT, trigger TEXT, result TEXT, error TEXT
);
CREATE INDEX IF NOT EXISTS ix_job_runs ON job_runs(job, started_at);

-- ───────────── ONBOARDING ─────────────
CREATE TABLE IF NOT EXISTS onboarding (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'em_andamento', form_token TEXT, form_sent_at TEXT, started_at TEXT NOT NULL, completed_at TEXT
);
CREATE TABLE IF NOT EXISTS onboarding_items (
  id TEXT PRIMARY KEY, onboarding_id TEXT NOT NULL REFERENCES onboarding(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, -- formulario | material | acesso | interno
  label TEXT NOT NULL, brain_section TEXT, who TEXT NOT NULL DEFAULT 'cliente', -- cliente | equipe
  required INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'pendente', -- pendente | recebido | dispensado
  value TEXT, requested_at TEXT NOT NULL, due_at TEXT, received_at TEXT, sort INTEGER NOT NULL DEFAULT 0
);

-- ───────────── CICLO MENSAL (calendário operacional) ─────────────
-- Cada cliente tem um ciclo por mês de publicação (ex.: 2026-11). Os marcos do ciclo definem os prazos das etapas.
CREATE TABLE IF NOT EXISTS cycles (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  month TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'planejamento', -- planejamento | aprovacao_temas | producao | aprovacao_final | agendamento | publicando | encerrado
  milestones TEXT NOT NULL, -- JSON {chave: {start,end}} copiado do calendário operacional (pode ter exceções por cliente)
  created_at TEXT NOT NULL, UNIQUE (client_id, month)
);
-- Configurações globais (calendário operacional, regras do engine)
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_by TEXT, updated_at TEXT);

-- ───────────── CONTEÚDO, VERSÕES, MÍDIA ─────────────
CREATE TABLE IF NOT EXISTS contents (
  id TEXT PRIMARY KEY, number INTEGER NOT NULL, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id), cycle_id TEXT REFERENCES cycles(id), title TEXT NOT NULL,
  format TEXT NOT NULL, -- reel | video | carrossel | estatico | foto | stories
  channel TEXT NOT NULL DEFAULT 'instagram', theme TEXT, objective TEXT, strategy_tags TEXT NOT NULL DEFAULT '[]', reference TEXT, briefing TEXT, internal_notes TEXT,
  material_status TEXT NOT NULL DEFAULT 'nao_necessario', -- nao_necessario | aguardando | recebido
  stage TEXT NOT NULL, stage_entered_at TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'media', -- baixa | media | alta | critica
  planned_at TEXT, -- data/hora prevista de publicação
  current_version_id TEXT, approved_version_id TEXT,
  blocked INTEGER NOT NULL DEFAULT 0, block_reason TEXT, waiting_on TEXT, -- informacao | cliente | equipe
  cycle_month TEXT, revision_rounds INTEGER NOT NULL DEFAULT 0, client_adjust_rounds INTEGER NOT NULL DEFAULT 0,
  scheduled_at TEXT, schedule_mode TEXT, external_post_id TEXT, published_at TEXT,
  created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_contents_client ON contents(client_id, stage);
CREATE TABLE IF NOT EXISTS content_versions (
  id TEXT PRIMARY KEY, content_id TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  number INTEGER NOT NULL, caption TEXT NOT NULL DEFAULT '', notes TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho', -- rascunho | em_revisao | enviada_cliente | aprovada | substituida
  locked INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL,
  sent_to_client_at TEXT, approved_by TEXT, approved_at TEXT, UNIQUE (content_id, number)
);
-- Arquivos: o ORIGINAL nunca é alterado nem substituído. Variantes (preview/poster/publish) são derivadas.
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY, client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  original_name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL,
  kind TEXT NOT NULL, -- image | video | document | other
  width INTEGER, height INTEGER, duration REAL, fps REAL, codec TEXT, audio_codec TEXT, meta TEXT,
  storage_key TEXT NOT NULL, processing TEXT NOT NULL DEFAULT 'pendente', -- pendente | pronto | erro
  visibility TEXT NOT NULL DEFAULT 'internal', -- internal | client
  uploaded_by TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS file_variants (
  id TEXT PRIMARY KEY, file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  variant TEXT NOT NULL, -- preview | poster | publish | thumb
  storage_key TEXT NOT NULL, mime TEXT NOT NULL, width INTEGER, height INTEGER, size INTEGER, created_at TEXT NOT NULL,
  UNIQUE (file_id, variant)
);
CREATE TABLE IF NOT EXISTS version_media (
  version_id TEXT NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES files(id), position INTEGER NOT NULL, PRIMARY KEY (version_id, position)
);

-- ───────────── FLUXO: TAREFAS, REVISÕES, AJUSTES, APROVAÇÕES ─────────────
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT,
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE, content_id TEXT REFERENCES contents(id) ON DELETE CASCADE,
  stage TEXT, function TEXT, assignee_id TEXT REFERENCES users(id), -- assignee nulo = sem responsável (gera pendência)
  status TEXT NOT NULL DEFAULT 'aberta', -- aberta | em_andamento | agendada (etapa ainda não abriu: available_at) | concluida | cancelada
  kind TEXT NOT NULL DEFAULT 'etapa', -- etapa | ajuste | follow_up | onboarding | reuniao | manual | agendamento
  origin TEXT NOT NULL DEFAULT 'engine', -- engine | manual | reuniao | chat | automacao
  source_type TEXT, source_id TEXT, priority TEXT NOT NULL DEFAULT 'media',
  due_at TEXT, created_by TEXT, created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT, completed_by TEXT
  -- perf_status (ALTER): NULL = nasceu na plataforma · migrado = herdado, fora da performance até classificar · excluido | equipe | individual = classificado
);
CREATE INDEX IF NOT EXISTS ix_tasks_assignee ON tasks(assignee_id, status);
CREATE INDEX IF NOT EXISTS ix_tasks_content ON tasks(content_id, status);
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY, content_id TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL REFERENCES content_versions(id), kind TEXT NOT NULL, -- producao | ajuste_interno | ajuste_cliente
  reviewer_id TEXT REFERENCES users(id), status TEXT NOT NULL DEFAULT 'pendente', -- pendente | aprovada | ajuste
  note TEXT, created_at TEXT NOT NULL, decided_at TEXT
);
-- Sala de Revisão por cliente: a rodada guarda decisões, ajustes e comentários em rascunho;
-- nada é aplicado nem fica visível para a equipe até a rodada do cliente ser finalizada.
CREATE TABLE IF NOT EXISTS review_sessions (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'aberta', -- aberta | finalizada
  opened_by TEXT REFERENCES users(id), opened_at TEXT NOT NULL, finished_by TEXT REFERENCES users(id), finished_at TEXT, summary TEXT
);
CREATE TABLE IF NOT EXISTS review_drafts (
  session_id TEXT NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE, content_id TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  decision TEXT, -- aprovar | ajuste | NULL (só comentários)
  note TEXT, adjustments TEXT NOT NULL DEFAULT '[]', comments TEXT NOT NULL DEFAULT '[]',
  reviewer_id TEXT REFERENCES users(id), updated_at TEXT NOT NULL, PRIMARY KEY (session_id, content_id)
);
CREATE TABLE IF NOT EXISTS adjustments (
  id TEXT PRIMARY KEY, content_id TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  version_id TEXT REFERENCES content_versions(id), origin TEXT NOT NULL, -- interno | cliente
  size TEXT NOT NULL DEFAULT 'normal', -- simples | normal
  description TEXT NOT NULL, carousel_page INTEGER, video_timestamp REAL, region TEXT, -- region: JSON {x,y,w,h} (V2)
  requested_by TEXT REFERENCES users(id), assigned_to TEXT REFERENCES users(id), task_id TEXT,
  status TEXT NOT NULL DEFAULT 'aberto', -- aberto | concluido | verificado
  due_at TEXT, created_at TEXT NOT NULL, done_at TEXT, resolved_version_id TEXT,
  reapproval INTEGER NOT NULL DEFAULT 0 -- 1 = pedido após aprovação: a nova versão volta para o cliente aprovar
);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, content_id TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  version_id TEXT REFERENCES content_versions(id), kind TEXT NOT NULL, -- tema | interna | cliente
  decision TEXT NOT NULL, -- aprovado | ajuste
  user_id TEXT NOT NULL REFERENCES users(id), note TEXT, ip TEXT, user_agent TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY, content_id TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  version_id TEXT REFERENCES content_versions(id), parent_id TEXT REFERENCES comments(id),
  author_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'client', -- client (visível ao cliente) | internal (somente equipe)
  anchor TEXT, -- JSON: {page} | {t} | {region} (preparado para comentários contextuais)
  adjustment_id TEXT, file_id TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mentions (
  id TEXT PRIMARY KEY, source_type TEXT NOT NULL, source_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, by_user_id TEXT, created_at TEXT NOT NULL
);

-- ───────────── COMUNICAÇÃO ─────────────
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, -- interno | cliente | direto
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE, name TEXT NOT NULL, topic TEXT,
  is_private INTEGER NOT NULL DEFAULT 0, slack_channel_id TEXT, created_by TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS channel_members (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, last_read_at TEXT, PRIMARY KEY (channel_id, user_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES messages(id), author_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL,
  file_id TEXT REFERENCES files(id), converted_to TEXT, -- JSON [{type,id}] quando virou tarefa/decisão/ajuste/evento
  source TEXT NOT NULL DEFAULT 'plataforma', -- plataforma | slack
  created_at TEXT NOT NULL, edited_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_messages_channel ON messages(channel_id, created_at);

-- ───────────── NOTIFICAÇÕES ─────────────
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info', -- info | atencao | urgente
  type TEXT NOT NULL, title TEXT NOT NULL, body TEXT, link TEXT, group_key TEXT, count INTEGER NOT NULL DEFAULT 1,
  client_id TEXT, content_id TEXT, read_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_notif_user ON notifications(user_id, read_at, updated_at);

-- ───────────── AGENDA: REUNIÕES, HORÁRIOS, EVENTOS ─────────────
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY, client_id TEXT REFERENCES clients(id) ON DELETE CASCADE, title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'mensal', -- mensal | alinhamento | interna | comercial | onboarding
  starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, location TEXT, status TEXT NOT NULL DEFAULT 'agendada', -- agendada | realizada | cancelada
  booked_by TEXT, gcal_event_id TEXT, gcal_sync TEXT NOT NULL DEFAULT 'nao_sincronizado', -- sincronizado | nao_sincronizado | erro
  summary TEXT, notes TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meeting_attendees (
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (meeting_id, user_id)
);
-- Itens extraídos de reuniões: decisão | acao | pendencia | mudanca_estrategia | solicitacao | informacao
CREATE TABLE IF NOT EXISTS meeting_items (
  id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, body TEXT NOT NULL, owner_id TEXT REFERENCES users(id), due_at TEXT, task_id TEXT,
  origin TEXT NOT NULL DEFAULT 'manual', -- manual | ia (sugerido, precisa confirmação humana)
  confirmed INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meeting_slots (
  id TEXT PRIMARY KEY, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, host_id TEXT REFERENCES users(id),
  window_label TEXT, meeting_id TEXT REFERENCES meetings(id) ON DELETE SET NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL, -- prazo | producao | ciclo | evento | compromisso
  starts_at TEXT NOT NULL, ends_at TEXT, all_day INTEGER NOT NULL DEFAULT 0, client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
  content_id TEXT, user_id TEXT, gcal_event_id TEXT, created_by TEXT, created_at TEXT NOT NULL
);

-- ───────────── COMERCIAL E FINANCEIRO ─────────────
CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, company TEXT, contact_name TEXT, contact_channel TEXT, origin TEXT,
  owner_id TEXT REFERENCES users(id), value REAL NOT NULL DEFAULT 0, service TEXT,
  stage TEXT NOT NULL DEFAULT 'lead', probability INTEGER NOT NULL DEFAULT 10,
  last_interaction_at TEXT, next_action TEXT, next_action_at TEXT, client_id TEXT, lost_reason TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE, service TEXT NOT NULL,
  monthly_value REAL NOT NULL DEFAULT 0, starts_at TEXT NOT NULL, ends_at TEXT, due_day INTEGER NOT NULL DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'ativo', notes TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY, contract_id TEXT REFERENCES contracts(id) ON DELETE CASCADE, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  description TEXT NOT NULL, amount REAL NOT NULL, due_at TEXT NOT NULL, paid_at TEXT, paid_amount REAL,
  status TEXT NOT NULL DEFAULT 'aberta', -- aberta | paga | atrasada | cancelada
  created_at TEXT NOT NULL
);

-- ───────────── AUTOMAÇÃO, AUDITORIA, IA, INTEGRAÇÕES ─────────────
CREATE TABLE IF NOT EXISTS automations (
  key TEXT PRIMARY KEY, event TEXT NOT NULL, condition TEXT NOT NULL, action TEXT NOT NULL,
  owner TEXT NOT NULL, notification TEXT NOT NULL, deadline TEXT NOT NULL,
  engine TEXT NOT NULL, -- regra | ia | humano
  class INTEGER NOT NULL, -- 1 simples | 2 regras | 3 IA | 4 aprovação humana
  phase TEXT NOT NULL, -- MVP | V2 | V3
  implemented INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY, automation_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ok', -- ok | ignorada | erro
  entity_type TEXT, entity_id TEXT, client_id TEXT, detail TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_runs_key ON automation_runs(automation_key, created_at);
-- Activity log: append-only (triggers impedem UPDATE/DELETE)
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY, actor_id TEXT, actor_kind TEXT NOT NULL DEFAULT 'usuario', -- usuario | sistema | ia | integracao
  action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, client_id TEXT, content_id TEXT,
  summary TEXT NOT NULL, before TEXT, after TEXT, origin TEXT NOT NULL DEFAULT 'manual', -- manual | automatica
  visibility TEXT NOT NULL DEFAULT 'internal', ip TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ix_logs_client ON activity_logs(client_id, created_at);
CREATE TRIGGER IF NOT EXISTS activity_logs_no_update BEFORE UPDATE ON activity_logs BEGIN SELECT RAISE(ABORT, 'activity_logs é append-only'); END;
CREATE TRIGGER IF NOT EXISTS activity_logs_no_delete BEFORE DELETE ON activity_logs BEGIN SELECT RAISE(ABORT, 'activity_logs é append-only'); END;
CREATE TABLE IF NOT EXISTS ai_insights (
  id TEXT PRIMARY KEY, detector TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'operacao', client_id TEXT,
  severity TEXT NOT NULL DEFAULT 'media', problem TEXT NOT NULL, cause TEXT, impact TEXT, suggestion TEXT,
  action TEXT, action_payload TEXT, metric REAL, source TEXT NOT NULL DEFAULT 'regra', -- regra | ia
  status TEXT NOT NULL DEFAULT 'aberto', -- aberto | aplicado | descartado
  fingerprint TEXT UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_actions (
  id TEXT PRIMARY KEY, agent TEXT NOT NULL, user_id TEXT, client_id TEXT, prompt TEXT NOT NULL, response TEXT,
  status TEXT NOT NULL, -- ok | erro | nao_configurado
  context_refs TEXT, model TEXT, tokens_in INTEGER, tokens_out INTEGER, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS integrations (
  provider TEXT PRIMARY KEY, -- google_calendar | meta | slack | google_drive
  status TEXT NOT NULL DEFAULT 'desconectado', -- conectado | desconectado | erro | token_expirado
  account_label TEXT, secret_enc TEXT, -- tokens criptografados (AES-256-GCM)
  scopes TEXT, expires_at TEXT, last_error TEXT, config TEXT, connected_by TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS oauth_states (state TEXT PRIMARY KEY, provider TEXT NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL,
  data TEXT NOT NULL, narrative TEXT, generated_by TEXT NOT NULL DEFAULT 'sistema', created_at TEXT NOT NULL
);
`;
db.exec(SCHEMA);
// Migrações leves (colunas adicionadas depois da primeira versão)
for (const sql of ['ALTER TABLE adjustments ADD COLUMN reapproval INTEGER NOT NULL DEFAULT 0', 'ALTER TABLE clients ADD COLUMN notion_url TEXT', 'ALTER TABLE clients ADD COLUMN notion_section TEXT', 'ALTER TABLE clients ADD COLUMN aliases TEXT', "ALTER TABLE onboarding ADD COLUMN form_status TEXT NOT NULL DEFAULT 'nao_iniciado'", 'ALTER TABLE onboarding ADD COLUMN form_submitted_at TEXT', 'ALTER TABLE client_brain_entries ADD COLUMN source_url TEXT', 'ALTER TABLE contents ADD COLUMN material_url TEXT', "ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'system'", 'ALTER TABLE tasks ADD COLUMN available_at TEXT', 'ALTER TABLE users ADD COLUMN email_source TEXT', 'ALTER TABLE users ADD COLUMN email_source_url TEXT', 'ALTER TABLE tasks ADD COLUMN perf_status TEXT']) { try { db.exec(sql); } catch { /* já existe */ } }

// ── helpers ───────────────────────────────────────────
export const one = (sql, ...p) => db.prepare(sql).get(...p);
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

export function insert(table, row) {
  const keys = Object.keys(row);
  db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
    .run(...keys.map((k) => norm(row[k])));
  return row;
}
export function update(table, where, patch) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const wk = Object.keys(where);
  db.prepare(`UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(',')} WHERE ${wk.map((k) => `${k}=?`).join(' AND ')}`)
    .run(...keys.map((k) => norm(patch[k])), ...wk.map((k) => where[k]));
}
const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v !== null && typeof v === 'object' ? JSON.stringify(v) : v);

let txDepth = 0;
export function tx(fn) {
  if (txDepth > 0) return fn();
  txDepth++;
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
  finally { txDepth--; }
}
export function nextNumber(key) {
  run('INSERT INTO counters (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1', key);
  return one('SELECT value FROM counters WHERE key=?', key).value;
}
export const parseJSON = (s, d = null) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
