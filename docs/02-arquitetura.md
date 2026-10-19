# 02 · Arquitetura da THE BOLD OS

## Visão geral
```
React (Vite) ── REST + SSE ──> Node/Express ──> SQLite (node:sqlite, WAL) ── fonte oficial da verdade
                                   │
          ┌───────────────┬────────┼──────────────┬──────────────┬──────────────┐
    Process Engine   Automações   Inteligência   AI Gateway     Integrações
   (determinístico)  + Scheduler  (detectores)   (Claude)       (Google, Meta, Slack, Drive*)
                                                     │
                                       Memória plugável: banco | Obsidian | (V3) sistema próprio
```
- **Estado operacional só no banco.** O Claude interpreta e sugere, mas nunca grava estado.
- **Toda autorização é feita no backend** (`server/lib/permissions.js` + checagens por rota e por ação no engine).
- O schema é portável para **Postgres**: SQL padrão, chaves de texto e JSON em colunas `TEXT`. O SQLite atende o MVP (uma instância). A troca recomendada vem antes de escalar horizontalmente.

## Modelo de dados (server/db.js)

| Domínio | Tabelas |
|---|---|
| Acesso | `users`, `roles`, `role_permissions`, `user_permissions` (grant/deny por usuário), `sessions` |
| Cliente | `clients`, `client_members` (pessoa × função → escopo e atribuição), `client_brain` (seções), `client_memories` (decisões, aprendizados), `projects`, `onboarding`, `onboarding_items` |
| Processo | `cycles` (ciclo mensal com marcos), `contents`, `content_versions`, `version_media`, `tasks`, `reviews`, `adjustments`, `approvals`, `comments`, `mentions` |
| Mídia | `files` (original imutável + sha256 + metadados técnicos), `file_variants` (preview/thumb/poster/publish) |
| Comunicação | `channels` (interno/cliente/direto), `channel_members`, `messages` (threads, `converted_to`) |
| Agenda | `meetings`, `meeting_attendees`, `meeting_items`, `meeting_slots`, `events` |
| Negócio | `deals`, `contracts`, `invoices` |
| Sistema | `notifications` (agrupadas), `activity_logs` (**append-only por trigger**), `automations`, `automation_runs`, `ai_insights`, `ai_actions`, `integrations` (segredos cifrados), `oauth_states`, `settings`, `reports`, `counters` |

**Entidades pedidas → tabelas.** Users, Roles, Permissions, Clients, Projects, Contents, ContentVersions, Tasks, Adjustments, Approvals, Comments, Mentions, Notifications, ActivityLogs, Automations, AutomationRuns, Reviews, Meetings, Files, AIInsights e AIActions têm tabelas próprias. As demais vivem em tabelas já existentes:
- **Deadlines:** campos `due_at` nas tarefas e ajustes + marcos de `cycles`.
- **Events:** `events` + `meetings`.
- **Schedules:** campos `scheduled_at` e `schedule_mode` em `contents`, mais `meeting_slots`.

## Process Engine (server/engine/process.js)
- `STAGES` define, para cada etapa: função responsável, marco do ciclo, SLA, ação esperada, saída e se é visível ao cliente.
- `enterStage()` cancela as tarefas da etapa anterior, cria as novas e as **atribui por função** (pessoa vinculada ao cliente com menor carga, ou fallback). Também define o **prazo** (marco do ciclo, SLA ou limite pela data de publicação), **notifica** (agrupando), registra no **histórico** e marca a **automação**.
- **Avanço automático:** concluir a última tarefa da etapa dispara `advance()`. A conclusão é **validada**: não se entrega sem arquivo final ou legenda, nem se fecha um ajuste sem uma versão nova ("a tarefa só termina quando a próxima pessoa tem tudo de que precisa").
- **Portões:**
  - `reviewDecision` (Sala de Revisão)
  - `clientDecision` (feed: aprovar ou ajustar; a equipe pode registrar em nome do cliente, informando a origem)
  - `schedule` (Meta ou "agendado externamente", sempre explícito)
  - `confirmPublished`
- **Bloqueio** com motivo obrigatório e quem está esperando. **Retorno** a uma etapa anterior com motivo. **Cancelamento**.
- **Versões:** `editableVersion()` nunca sobrescreve uma versão travada. Editar depois do envio cria V+1, copiando legenda e mídia. A aprovação congela a versão (`approved_version_id`).
- **Risco** (`contentRisk`): prazo vencido, sem responsável, bloqueio, espera do cliente (48/72h), proximidade da publicação por etapa e retrabalho.

## Permissões
`can(user, módulo, ação)`, avaliado nesta ordem:
1. Override do usuário (grant/deny).
2. Permissão do role.
3. Regra fixa: **Pendências só CEO/Operações**.

O escopo por cliente vem de `canAccessClient` / `scopeSQL`: roles com `all_clients`, ou vínculo em `client_members`.

Outras regras:
- O quadro **PROCESSOS** mostra a todos os internos os cards de todos os clientes, porém marcados como `restricted`, sem miniatura e sem acesso ao detalhe quando a pessoa não está vinculada.
- O **cliente** só acessa `/api/portal/*` e seu canal. Ele recebe somente:
  - versões enviadas ou aprovadas
  - comentários `client`
  - logs `visibility='client'`
  - mídia de versões enviadas ou com `visibility='client'`

## Regra × IA
| Determinístico (regras) | IA (Claude, via AI Gateway) |
|---|---|
| Status, transições, criação de tarefas, atribuição por função, prazos, notificações, permissões, validações, aprovações, régua de cobrança, detectores de gargalo | Interpretar reuniões, resumir conversas, explicar gargalos, analisar padrões, sugerir melhorias, interpretar feedback, apoiar estratégia, consultar conhecimento, sugerir próximas ações |

**Agentes** (`server/ai/gateway.js`): Brain, Atendimento, Operações, Estratégia, Conteúdo, Gestão, Análise, Financeiro e Comercial. O contexto enviado é a **interseção** entre o escopo do agente, as permissões do usuário e os clientes do usuário. Toda chamada fica em `ai_actions`, com as referências usadas. Sem `ANTHROPIC_API_KEY`, o status é `nao_configurado` e a interface mostra os dados que *seriam* enviados. Nada é simulado.
- Modelo: `claude-opus-5-5`, com esforço configurável e fallback de recusa do lado do servidor (`fallbacks: "default"`).

**Memória** (`server/ai/memory.js`): provider plugável, `banco` (padrão) ou `obsidian` (lê `OBSIDIAN_VAULT_PATH/Clientes/<cliente>/*.md` + exporta o Client Brain em `.md`). O provider usado fica registrado, o que permite comparar A/B. O Obsidian **não** é dependência.

## Mídia (requisito crítico de qualidade)
- **ORIGINAL:** gravado intacto (sha256), nunca recomprimido nem substituído.
- **PREVIEW:**
  - Imagem: WebP q92, lado maior ≤ 2560 px, sRGB.
  - Vídeo H.264/yuv420p: o **próprio original** é usado no player.
  - Outros codecs (ProRes/HEVC): preview H.264 na mesma resolução e fps, CRF 17.
- **PUBLISH:** gerado sob demanda no formato exigido pela Meta (JPEG q95 4:4:4 ou MP4 H.264/AAC). Se o original já atende, é o próprio original.
- Entrega autenticada com **Range** (streaming), zoom e download do original.
- O `StorageDriver` é local no MVP. A interface está pronta para S3/R2 ou Google Drive (ver spec do Drive).

## Integrações (reais, sem simulação)
| Integração | Estado no MVP |
|---|---|
| Google Calendar | OAuth 2.0 + Calendar v3. Criar, alterar e cancelar eventos com convidados, freeBusy para conflitos e leitura no calendário. Exige `GOOGLE_CLIENT_ID/SECRET` e `PUBLIC_BASE_URL`. |
| Meta/Instagram | OAuth + Graph API (container → `media_publish`; imagem, reels, carrossel até 10 itens). **A API não tem agendamento nativo**: a plataforma publica no horário pelo scheduler. Exige URL pública assinada (`PUBLIC_BASE_URL`). Sem Meta conectada, o agendamento fica "externo" e explícito. |
| Slack | OAuth v2 + `chat.postMessage` para espelhar avisos durante a transição. |
| Google Drive | Especificado (`docs/integracoes/google-drive.md`). Implementação aguardando a decisão Workspace × Gmail. |
| Claude | `ANTHROPIC_API_KEY`. |

Os tokens ficam cifrados com **AES-256-GCM**. A chave vem de `BOLD_VAULT_KEY`, nunca do banco.

## Segurança
- Senhas com **scrypt**. Sessão opaca em cookie `httpOnly; SameSite=Lax` (o banco guarda só o hash). Expiração de 14 dias. Sessões são revogadas ao desativar o usuário ou trocar a senha.
- Rate limit de login. **CSRF:** header obrigatório `x-bold-request` em mutações (bloqueado cross-origin sem CORS).
- CSP restritiva, `X-Frame-Options: DENY` e `nosniff`.
- Validação de entrada nas rotas e no engine. Uploads com whitelist de MIME, limite de tamanho e nome sanitizado.
- Histórico append-only (triggers SQL). IP e user agent nas aprovações.

## Tempo real
SSE (`/api/stream`): eventos de notificação, mensagem e atividade, filtrados por permissão no servidor. O quadro de Processos e as telas recarregam sozinhos quando algo muda.

## Migração (Notion/Slack → plataforma)
Arquitetura prevista (V2):
- importadores por fonte que gravam pelas mesmas funções do engine (`startClient`, `createContent`, `client_members`), sem inserir "por fora";
- mapeamento das colunas do Notion para as etapas (tabela em `01-processo-real.md`);
- normalização dos nomes de clientes (hoje não há cadastro mestre);
- importação da DIVISÃO como `client_members`;
- importação do CR EDITORIAL como conteúdos com tema, objetivo, referência e legenda;
- Slack e WhatsApp entram como histórico/memória, não como estado.

Os scripts de importação seguem esse padrão: o que cria conteúdo passa pelo engine.
