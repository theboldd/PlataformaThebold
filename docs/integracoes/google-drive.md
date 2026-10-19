# THE BOLD OS — Integração Google Drive
### Especificação funcional e técnica · v0.1 · 19/10/2026

> **Princípio:** a plataforma é a fonte da verdade da **operação** (quem, o quê, quando, em que etapa, com que permissão). O Google Drive é a fonte da verdade do **conteúdo binário e dos metadados do arquivo**. A plataforma guarda **referências + relações + estado**, nunca uma segunda cópia do Drive.

---

## 0. Contexto e decisões que esta spec resolve

**O que existe hoje** (levantado no Notion/Slack nesta sessão):
- O material do cliente chega pelo WhatsApp e alguém sobe manualmente para o Drive ("vídeos já no drive [link]").
- O cliente sobe arquivo no Notion sem avisar, e por isso ninguém é notificado.
- A coluna "Pendente por material" do quadro PROCESSO não diz **o que** falta.
- Gravações de reunião ficam em uma pasta do Drive sem ligação com o cliente nem com as decisões.
- Não existe estrutura padronizada de pastas ligada a cliente/ciclo.

**Conflito com o módulo Feed de Aprovação.** O módulo de aprovação pede "upload direto na plataforma, sem passar pelo Drive". Esta spec pede "não duplicar arquivos". Resolução proposta:

| Camada | Onde vive | Observação |
|---|---|---|
| **Original** de entregas de produção (arte final, vídeo final) enviado pela plataforma | **Google Drive**, na pasta `05 Produção/AAAA-MM/#034` do cliente, gravado pela plataforma via upload resumable | O upload acontece *na* The Bold OS. A equipe não precisa abrir o Drive. |
| **Preview / poster** (otimizados para o feed) | Cache da plataforma (object storage) | É derivado e pode ser regenerado. Nunca substitui o original. |
| **Publishing asset** (JPEG/MP4 no padrão Meta) | Cache da plataforma, gerado sob demanda | Exigência da API da Meta (URL pública temporária). |
| Materiais, briefings, referências, identidade visual | **Drive**, como referência | A plataforma só vincula e sincroniza metadados. |
| Fallback com Drive desconectado | Storage local da plataforma, em fila de envio | O arquivo sobe para o Drive quando a conexão volta, e o registro passa a apontar para o Drive. |

Isso é possível porque a camada de arquivos da plataforma usa um **StorageDriver** (`local | s3 | gdrive`). O Drive vira o driver padrão dos originais quando está conectado.

---

## 1. Autenticação OAuth

### 1.1 Modelo de conexão
- **MVP: conexão organizacional única.** Um administrador (CEO/Operações) conecta a conta Google "dona" da estrutura de pastas da agência. Todas as chamadas à API usam essa credencial, e **a plataforma aplica as permissões dos seus próprios usuários** antes de qualquer chamada.
- **V2: conexão por usuário (opcional).** Cada membro conecta a própria conta Google. Serve para (a) o Google Picker com a visão de cada pessoa e (b) o modo "respeitar permissão do Drive": antes de abrir um arquivo, a plataforma confirma com o token do próprio usuário que ele também tem acesso no Drive.

### 1.2 Fluxo
1. Integrações → Google Drive → **Conectar**.
2. O backend gera um `state` aleatório (anti-CSRF, guardado em `oauth_states` com TTL de 10 min) e um `code_verifier` PKCE.
3. Redireciona para `accounts.google.com/o/oauth2/v2/auth` com `access_type=offline`, `prompt=consent`, `include_granted_scopes=true` e os escopos escolhidos.
4. Callback `/api/integrations/google/callback`: valida o `state`, troca o `code` por `access_token + refresh_token` e lê `about.get` (e-mail da conta, cota).
5. O refresh token é guardado **criptografado** (AES-256-GCM, chave fora do banco: KMS ou variável `BOLD_VAULT_KEY`). O access token fica só em memória ou cache curto.
6. Status → `CONECTADO`. Logs: `integration.connected`.

### 1.3 Escopos: decisão crítica
| Opção | Escopo | Exigência do Google | O que permite |
|---|---|---|---|
| **A** | `drive` (completo) ou `drive.readonly` | É **escopo restrito**. Em app *External*, exige verificação do Google e avaliação de segurança anual. Em app *Internal* de Google Workspace, não exige. | Navegar, pesquisar e sincronizar qualquer pasta da conta. |
| **B** | `drive.file` + **Google Picker** | Escopo não restrito, com verificação simples. | Só arquivos **criados pela plataforma** ou **escolhidos pelo usuário no Picker**. Arquivos que alguém coloca direto numa pasta pelo Drive **não ficam visíveis** para a plataforma. |

**Recomendação.** Se a The Bold usa **Google Workspace**, configure o app OAuth como *Internal* e use a Opção A (`drive`). Se a conta da agência for **@gmail.com** (pessoal), use a Opção B e faça **todo upload novo passar pela plataforma**. Em modo "Testing", um app External com escopo restrito tem refresh tokens que **expiram em 7 dias**, o que inviabiliza a operação.

> ❓ **Pergunta em aberto:** a The Bold opera em Google Workspace (domínio próprio) ou em conta Gmail? Essa resposta define o escopo, o uso de Shared Drives e a viabilidade de detectar arquivos colocados direto no Drive.

### 1.4 Ciclo de vida do token
- **Refresh automático** antes da expiração.
- **`invalid_grant`** (revogado, senha trocada, conta removida): status `TOKEN_EXPIRADO`, notificação **urgente** para CEO/Operações, sync pausada. A plataforma continua funcionando com os metadados em cache.
- **Desconectar:** revoga o token em `oauth2.googleapis.com/revoke`, apaga o segredo e mantém os vínculos e metadados (histórico).
- **Reconexão com outra conta Google:** a plataforma alerta "os vínculos existentes apontam para arquivos da conta X". Ela confere o acesso a cada arquivo antes de reativar a sync.

---

## 2. Google Drive API — recursos usados

| Necessidade | Endpoint (Drive API v3) | Notas |
|---|---|---|
| Info da conta/cota | `about.get` (`user, storageQuota`) | |
| Listar pasta | `files.list` `q="'<folderId>' in parents and trashed=false"` | Sempre com `fields` mínimos e `pageSize=1000`, paginado. `supportsAllDrives=true` e `includeItemsFromAllDrives=true` para Shared Drives. |
| Pesquisar | `files.list` com `name contains '…'` / `fullText contains '…'` / `mimeType=…` | A pesquisa é restrita às pastas mapeadas que o usuário pode ver (ver §6). |
| Metadados | `files.get` `fields=id,name,mimeType,size,md5Checksum,parents,createdTime,modifiedTime,lastModifyingUser,owners,webViewLink,iconLink,trashed,headRevisionId,version,driveId,capabilities` | Arquivos Google nativos (Docs, Sheets) não têm `size` nem `md5Checksum`. |
| Criar pasta | `files.create` `mimeType=application/vnd.google-apps.folder` | |
| Upload | `files.create` com **upload resumable** (`uploadType=resumable`) | Obrigatório para vídeo. Retoma depois de falha. |
| Download/stream | `files.get?alt=media` (com header `Range`) | Proxy autenticado da plataforma. Vídeo com range requests. |
| Exportar Google Docs | `files.export` (`text/plain`, `application/pdf`) | Limite de **10 MB** por exportação. |
| Mover/organizar | `files.update` `addParents/removeParents` | Só com permissão `arquivos:organizar`. |
| Mudanças incrementais | `changes.getStartPageToken` + `changes.list` | Base da sincronização. |
| Push (V2) | `changes.watch` → webhook HTTPS | A notificação só avisa "algo mudou", sem dizer o quê. Depois chama `changes.list`. O canal expira e precisa ser renovado. |
| Revisões | `revisions.list`, `revisions.update keepForever=true` | Congelar a revisão aprovada (só arquivos binários, não Docs nativos). |
| Picker | Google Picker API (frontend) | Selecionar do Drive. Na Opção B, é o que concede o acesso. |

**Não usar `thumbnailLink` como preview permanente.** É uma URL de curta duração. Para previews, a plataforma gera e guarda seu próprio preview derivado (§3, `file_derivatives`).

---

## 3. Estrutura de dados

> Chave primária interna sempre é um ID da plataforma (`drv_…`). O `drive_file_id` é atributo indexado e único **por conexão**, nunca PK.

### 3.1 Entidades

**`drive_connections`**: uma linha por conta conectada (MVP: uma da organização).
`id`, `scope_mode` (`full|file`), `google_account_email`, `google_account_id`, `secret_enc`, `scopes`, `status` (`conectado|desconectado|erro|token_expirado`), `start_page_token`, `watch_channel_id`, `watch_resource_id`, `watch_expires_at`, `root_folder_item_id`, `last_sync_at`, `last_error`, `connected_by`, `created_at`, `updated_at`.

**`drive_items`**: espelho de **metadados** (nunca do conteúdo) de arquivos e pastas relevantes.
`id` (PK interna), `connection_id`, `drive_file_id` (UNIQUE com `connection_id`), `drive_id` (Shared Drive), `is_folder`, `name`, `mime_type`, `file_category` (`imagem|video|documento|planilha|apresentacao|pdf|audio|design|outro`), `size`, `md5_checksum`, `head_revision_id`, `drive_version`, `parent_drive_ids` (JSON), `parent_item_id`, `path_cache` (ex.: `Clientes/Atelier/05 Produção/2026-11`), `web_view_link`, `icon_link`, `owner_email`, `last_modifying_user`, `drive_created_at`, `drive_modified_at`, `width`, `height`, `duration` (de `imageMediaMetadata`/`videoMediaMetadata`), `trashed`, `sync_status` (`ok|desatualizado|removido|sem_acesso|fora_do_escopo|erro`), `last_synced_at`, `first_seen_at`, `removed_at`.

**`drive_folders`**: mapeamento **semântico** de pastas para o contexto operacional.
`id`, `drive_item_id`, `client_id`, `project_id`, `cycle_id` (opcional), `role` (`raiz_agencia|raiz_cliente|briefing|identidade_visual|materiais_cliente|referencias|producao|producao_ciclo|aprovados|reunioes|contratos|interno`), `default_purpose`, `default_visibility` (`internal|client`), `auto_link` (bool: arquivos novos nesta pasta são vinculados automaticamente ao contexto), `watch` (bool), `created_by_platform` (bool), `created_at`.

**`file_links`**: a **relação**. É o coração da integração: um arquivo pode ter N vínculos.
`id`, `source` (`drive|plataforma`), `drive_item_id` ou `file_id`, `entity_type` (`client|project|cycle|content|content_version|task|adjustment|approval|meeting|onboarding_item|stage|brain_section`), `entity_id`, `client_id` (desnormalizado para escopo), `purpose` (`briefing|referencia|identidade_visual|material_cliente|foto|video|producao|entrega_final|aprovado|contrato|ata|outro`), `stage` (etapa do processo em que é relevante, ex.: `producao`), `visibility` (`internal|client`), `origin` (`manual|automacao|pasta|ia_confirmada`), `pinned_revision_id` (revisão do Drive congelada, ex.: na aprovação), `linked_by`, `linked_at`, `unlinked_by`, `unlinked_at` (soft delete: o vínculo nunca é apagado fisicamente), `note`.

**`file_derivatives`**: previews/posters/publishing assets derivados, com cache regenerável.
`id`, `drive_item_id` ou `file_id`, `variant` (`preview|poster|thumb|publish|text_extract`), `source_revision_id` (invalida quando o arquivo muda no Drive), `storage_key`, `mime`, `width`, `height`, `size`, `created_at`, `expires_at`.

**`material_requirements`**: o que **precisa existir** para uma etapa andar. É isso que permite detectar material faltante.
`id`, `entity_type` (`content|onboarding|cycle`), `entity_id`, `client_id`, `purpose` (ex.: `video`, `foto`, `identidade_visual`), `description`, `required_for_stage` (ex.: `producao`), `who_provides` (`cliente|equipe`), `status` (`pendente|atendido|dispensado`), `fulfilled_by_link_id`, `due_at`, `created_at`, `fulfilled_at`.

**`drive_sync_runs`**: `id`, `connection_id`, `kind` (`inicial|periodica|webhook|reconciliacao|manual`), `status` (`executando|ok|parcial|erro`), `started_at`, `finished_at`, `items_seen`, `items_created`, `items_updated`, `items_removed`, `error`, `next_page_token`.

**`drive_change_events`**: diário bruto e deduplicado das mudanças processadas.
`id`, `connection_id`, `drive_file_id`, `change_type` (`criado|modificado|renomeado|movido|lixeira|removido|permissao|acesso_perdido`), `before` (JSON), `after` (JSON), `processed_at`, `sync_run_id`.

**`drive_jobs`**: fila de operações com retry, para que a plataforma funcione com o Drive fora do ar.
`id`, `kind` (`upload|criar_estrutura|mover|sync|refresh_item|extrair_texto|keep_revision`), `payload`, `status` (`pendente|executando|ok|erro|desistiu`), `attempts`, `next_attempt_at`, `last_error`, `created_by`, `created_at`.

**Reutilizadas:** `activity_logs` (histórico), `notifications`, `ai_actions` (com `context_refs` listando `drive_item_id + revision` que o Claude recebeu), `tasks`, `integrations` (status visível na tela de Integrações).

### 3.2 Diagrama de relação
```
drive_connections 1─N drive_items ─┬─ 1─N file_links N─1 (client | project | content | task | adjustment | meeting | …)
                                   ├─ 1─N file_derivatives
                                   └─ 1─1 drive_folders (quando é pasta mapeada) ──> client / project / cycle
material_requirements ──(atendido por)──> file_links
```

### 3.3 Estrutura padrão de pastas (criada ou localizada pela plataforma)
```
THE BOLD OS/                         (raiz_agencia; idealmente um Shared Drive)
└── Clientes/
    └── {Cliente}/                   (raiz_cliente)
        ├── 01 Briefing/             (briefing · internal)
        ├── 02 Identidade Visual/    (identidade_visual · client)
        ├── 03 Materiais do Cliente/ (materiais_cliente · client · auto_link)
        ├── 04 Referências/          (referencias · internal)
        ├── 05 Produção/
        │   └── 2026-11/             (producao_ciclo · internal · auto_link)
        │       └── #034 Reel …/     (entrega da produção, gerada pela plataforma)
        ├── 06 Aprovados/            (aprovados · client)
        ├── 07 Reuniões/             (reunioes · internal)
        └── 99 Interno/              (interno · internal; nunca client)
```
`default_visibility` é **sugestão de vínculo**. O cliente só vê um arquivo quando existe um `file_link` com `visibility=client`. **Estar na mesma pasta nunca concede acesso.**

---

## 4. Sincronização

### 4.1 Escopo da sync
A plataforma sincroniza **só as árvores de pastas mapeadas** em `drive_folders` e os arquivos avulsos vinculados. Não indexa o Drive inteiro.

### 4.2 Sincronização inicial (ao mapear uma pasta)
1. Chamar `changes.getStartPageToken` **antes** de listar, para não perder mudanças que aconteçam durante a listagem.
2. Fazer listagem recursiva BFS da pasta (paginada, `fields` mínimos) e fazer upsert em `drive_items`.
3. Pastas com `auto_link`: criar `file_links` para os arquivos novos com `origin=pasta`.
4. Gravar o `drive_sync_runs` (`inicial`).

### 4.3 Sincronização incremental
- **Polling (MVP):** a cada **5–10 min**, `changes.list(pageToken)`. Para cada mudança:
  - **Arquivo conhecido:** comparar `modifiedTime / headRevisionId / name / parents / trashed`. Classificar como `modificado | renomeado | movido | lixeira`.
  - **Arquivo novo** cujo pai é uma pasta mapeada (ou descendente): criar o `drive_item` e aplicar `auto_link`.
  - **`removed=true`** ou erro 404 em `files.get`: marcar `sync_status=removido` ou `sem_acesso`, guardar `removed_at` e **manter os vínculos** (histórico).
  - **Movido para fora** de todas as árvores mapeadas: `fora_do_escopo`. O vínculo continua válido, porque o ID não muda quando o arquivo é movido.
  - Salvar o `newStartPageToken` só depois de processar o lote (idempotente; deduplicação por `drive_file_id + modifiedTime`).
- **Push (V2):** `changes.watch` com webhook HTTPS chama a mesma rotina na hora. Renovar o canal antes de `watch_expires_at`. O polling continua como rede de segurança.
- **Reconciliação diária** (madrugada): relistar as pastas mapeadas e comparar com `drive_items`, para pegar mudanças perdidas e itens órfãos.
- **Atualizar sob demanda:** o botão **[Atualizar]** faz `files.get` do item e atualiza o registro.

### 4.4 Permissões alteradas
- A conexão perde acesso a um arquivo (404/403 em `files.get`): `sem_acesso`, com alerta para quem tem vínculo ativo.
- **V2:** snapshot de `permissions.list` dos arquivos com `visibility=client`, com alerta quando um arquivo passa a ter compartilhamento público ("qualquer pessoa com o link"). É controle de vazamento.

### 4.5 Falhas e resiliência
- `429`, `403 userRateLimitExceeded/rateLimitExceeded` e `5xx`: **backoff exponencial com jitter** (1s, 2s, 4s… até 64s) e no máximo N tentativas. Depois disso, o job fica `erro` e é reprocessado na próxima rodada.
- **Circuit breaker:** depois de X falhas seguidas, a integração fica `ERRO`, com banner discreto "Google Drive indisponível — exibindo dados sincronizados em {hora}".
- **Drive fora do ar:** a navegação contextual continua funcionando com os metadados em cache. Previews já gerados continuam disponíveis. Uploads vão para staging local e entram em `drive_jobs`. "Abrir no Drive" continua sendo só um link.
- **Conflitos:**
  - Metadados do arquivo (nome, conteúdo, pasta): **o Drive vence**.
  - Relações, visibilidade, etapa e propósito: **a plataforma vence**, porque o Drive não conhece esses dados.
  - Rename feito pela plataforma: primeiro `files.update` e, só com sucesso, atualizar o registro local.
  - **Arquivo aprovado alterado no Drive depois da aprovação** (`headRevisionId` diferente de `pinned_revision_id`): **alerta urgente**. A aprovação continua valendo para a revisão congelada. A plataforma pergunta: "criar nova versão para reaprovação?".

---

## 5. Integração com o Process Engine

O Drive gera **eventos**. O Process Engine aplica **regras determinísticas**. Nenhuma decisão de fluxo depende de IA.

| Gatilho | Condição | Ação | Responsável / Notificação | Tipo | Fase |
|---|---|---|---|---|---|
| `client.created` | Drive conectado + regra ativa | Criar ou localizar a estrutura `Clientes/{Cliente}/…`, registrar `drive_folders` | Operações (info) | Regra | MVP |
| `client.created` | Drive desconectado | Criar `drive_job` pendente + tarefa "Estrutura de pastas pendente" | Operações (atenção) | Regra | MVP |
| `drive.file.created` em `03 Materiais` | `auto_link` | Vincular ao cliente e ao ciclo ativo (`material_cliente`). Atender `material_requirements` compatíveis. | Estrategista da conta (info, agrupado) | Regra | MVP |
| `material_requirement.atendido` | Conteúdo estava bloqueado "Pendente por material" | Desbloquear o conteúdo e notificar o produtor da trilha | Designer/Editor (atenção) | Regra | MVP |
| `content.stage → producao` | Sem `file_link` que atenda os requisitos do formato (ex.: reel sem `video`) | Criar pendência "Material ausente: vídeo bruto", bloquear o conteúdo com o motivo e criar follow-up para o cliente | Atendimento (Vivian) + cliente | Regra | MVP |
| `onboarding_item` "Identidade visual" | Arquivo surge em `02 Identidade Visual` | Marcar o item como recebido e registrar no histórico | Estrategista (info) | Regra | MVP |
| `drive.file.linked` com `purpose=briefing` | Arquivo é Google Doc ou PDF | **Sugerir** extração para o Client Brain (Claude). Um humano confirma. | Estrategista (info) | IA + humano | V2 |
| `content_version.uploaded` (entrega) | Drive conectado | Upload resumable para `05 Produção/AAAA-MM/#NNN`, `file_link` com a versão, gerar preview | Sistema | Regra | MVP |
| `drive.file.updated` | Vínculo ativo, revisão nova | Registrar no histórico e invalidar previews. Se o arquivo estiver em conteúdo em revisão, notificar o revisor. | Revisor (info) | Regra | MVP |
| `drive.file.updated` | `pinned_revision_id` ≠ `head` (aprovado) | Alerta urgente "arquivo aprovado foi alterado" | Operações + Estrategista (urgente) | Regra | MVP |
| `drive.file.removed / sem_acesso` | Vínculo com conteúdo não publicado | Alerta "material indisponível". Se for requisito, reabrir a pendência. | Responsável da etapa (atenção) | Regra | MVP |
| `approval.client.approved` | Entrega no Drive | `keepForever` na revisão aprovada e `pinned_revision_id` | Sistema | Regra | V2 |
| `approval.client.approved` | Regra "organizar aprovados" ativa | Adicionar o arquivo a `06 Aprovados` (addParents, sem duplicar) | Sistema | Regra + permissão | V2 |
| `meeting.recorded` | Gravação aparece em `07 Reuniões` | Vincular à reunião do dia/cliente correspondente | Sistema | Regra | V2 |
| `drive.sync.failed` | 3 falhas seguidas | Status ERRO e notificação | Operações (atenção) | Regra | MVP |
| `integration.token_expired` | — | Pausar a sync, pedir reconexão | CEO + Operações (urgente) | Regra | MVP |
| Arquivo novo sem contexto | Em pasta mapeada sem `auto_link` | Fila "Arquivos para classificar". A IA sugere cliente, conteúdo e propósito; um humano confirma. | Gestão | IA + humano | V2 |

---

## 6. Permissões e segurança

### 6.1 Novo módulo `arquivos` (ações)
| Ação | Significado |
|---|---|
| `view` | Ver arquivos vinculados a contextos aos quais tem acesso |
| `link` | Vincular e desvincular arquivos (Picker / pastas mapeadas) |
| `upload` | Enviar arquivos (vão para o Drive pela plataforma) |
| `browse` | Navegar e pesquisar **pastas mapeadas** dos seus clientes no Drive |
| `organize` | Criar pastas, mover, mapear pastas a clientes |
| `admin` | Conectar/desconectar a conta, ver o Drive raiz, configurar regras |

| Role | view | link | upload | browse | organize | admin |
|---|---|---|---|---|---|---|
| CEO / Operações | ✓ | ✓ | ✓ | ✓ (todas) | ✓ | ✓ |
| Gestão (Vivian) | ✓ | ✓ | ✓ | ✓ (todas) | ✓ | — |
| Qualidade (Raísa) | ✓ | ✓ | ✓ | ✓ | — | — |
| Estratégia | ✓ seus clientes | ✓ | ✓ | ✓ seus clientes | — | — |
| Design / Edição / Copy | ✓ seus clientes | ✓ (em conteúdos atribuídos) | ✓ | ✓ seus clientes | — | — |
| Comercial | contratos/financeiro | ✓ (contratos) | ✓ | — | — | — |
| Cliente | só `visibility=client` do próprio cliente | — | ✓ (materiais) | — | — | — |

### 6.2 Regra de acesso a um arquivo
Um usuário acessa um `drive_item` **somente se**:
1. existe ao menos um `file_link` ativo para uma entidade que ele pode ver (`canAccessClient` + permissão do módulo da entidade); **e**
2. se o usuário for **cliente**: esse vínculo tem `visibility=client` **e** pertence ao seu cliente **e** a entidade é visível ao cliente (ex.: conteúdo em etapa de cliente); **e**
3. o item não está `removido/sem_acesso`; **e**
4. (V2, modo estrito) o token Google do próprio usuário também tem acesso ao arquivo.

**Implicações de segurança:**
- As rotas usam o **ID interno do vínculo/item**, nunca o `drive_file_id`. Mesmo assim, toda rota revalida as regras 1–3. Saber o nome ou o ID do arquivo não concede nada.
- **Clientes nunca recebem links do Drive.** Eles veem, baixam e assistem pelo **proxy autenticado** da plataforma (`/api/files/:linkId/stream`, com Range). Não precisam de conta Google, e a plataforma **não altera o compartilhamento no Drive**.
- O link "Abrir no Drive" só aparece para internos. Ele depende da permissão nativa do Google da pessoa (a plataforma não concede acesso no Drive).
- O browse/pesquisa no Drive é sempre filtrado pelas **pastas mapeadas** dos clientes do usuário. Navegar na raiz do Drive é só para `admin`.
- Pastas `99 Interno` e o propósito `contrato` nunca aceitam `visibility=client` (validação no backend).
- Tokens são criptografados em repouso. O segredo nunca vai para o frontend. O Picker usa um access token curto emitido sob demanda e restrito ao escopo.
- Uploads de cliente passam por validação de tipo/tamanho, antivírus (V2) e nome sanitizado.
- Toda leitura de conteúdo (stream/download/extração) por usuário ou IA vai para o histórico.

---

## 7. Claude + Drive (acesso mediado)

**Claude nunca recebe credenciais nem faz chamadas ao Drive.** Ele só recebe trechos que a plataforma já filtrou.

### 7.1 Fluxo
```
Pedido (usuário + agente + cliente/conteúdo/etapa + objetivo)
  → Policy check: permissões do usuário ∩ escopo do agente (ex.: Agente de Conteúdo não vê contratos)
  → Seleção: file_links ativos do contexto, ranqueados por purpose/stage (ex.: produção → briefing, referências, identidade)
  → Extração: files.export (Docs→texto) ou extração de PDF, em cache por revisão (file_derivatives.text_extract)
  → Minimização: só trechos relevantes, limite de tokens, sem arquivos internos se o pedido vier do portal do cliente
  → Claude (tarefa: resumir, extrair, verificar, sugerir)
  → Saída = SUGESTÃO estruturada (JSON validado)
  → Humano confirma ações (ex.: gravar no Client Brain, vincular arquivo, criar pendência)
  → ai_actions.context_refs = [{drive_item_id, revision, trechos}] + activity_log "arquivo utilizado pelo Claude"
```

### 7.2 Capacidades ("ferramentas" que a plataforma expõe ao Claude, todas de leitura)
- `listar_arquivos_contexto(client_id, content_id?, purpose?)`: só vínculos permitidos.
- `ler_documento(link_id, max_chars)`: texto extraído e truncado.
- `verificar_material(content_id)`: compara `material_requirements` × vínculos.
- `buscar_nas_pastas_do_cliente(client_id, termo)`: metadados apenas, em pastas mapeadas.

**Casos de uso:**
- Resumir briefing.
- Extrair tom, público e restrições para o Client Brain.
- Checar se o material de um reel existe.
- Listar materiais faltantes do ciclo.
- Sugerir os arquivos relevantes para a tarefa de um designer.
- Cruzar o briefing com o cronograma ("o tema 07 contradiz a restrição X do briefing").

### 7.3 Proteções
- **Conteúdo de documento é dado, não instrução.** O prompt isola os trechos. Um arquivo que diz "ignore as regras" não muda o comportamento, porque o Claude não tem ferramentas de escrita.
- **Nenhuma escrita automática no Drive ou no estado operacional** a partir da IA. Toda ação passa por confirmação humana ou regra determinística.
- Agentes que atendem cliente usam só vínculos `visibility=client`.
- Limite de volume por pedido e registro do custo (`tokens_in/out`).

---

## 8. Interface

**Central de Arquivos** (novo item na navegação):
- Filtros: cliente · projeto · ciclo · conteúdo · tipo · propósito · pasta · responsável (quem vinculou/enviou) · data (modificação no Drive) · etapa do processo · status de sync.
- Visões: **Contexto** (padrão; agrupado Cliente → Ciclo → Conteúdo), **Recentes** e **Atenção** (removidos, alterados após aprovação, sem contexto, material faltante).
- O status de sync aparece por arquivo (● sincronizado · ◐ desatualizado · ✕ removido · ⊘ sem acesso).

**Bloco "Arquivos relacionados"**, que aparece sozinho em: ficha do cliente · conteúdo · tarefa · ajuste · reunião · item de onboarding · Sala de Revisão.
- O bloco é agrupado por propósito: Briefing · Referências · Fotos · Vídeos · Identidade visual · Entregas.
- Ações: **[+ Adicionar arquivo do Drive]** (abre o Picker filtrado para a pasta do cliente) · **[Enviar arquivo]** · **[Visualizar]** (preview in-app: imagem, vídeo, PDF, texto de Docs) · **[Abrir no Drive]** (internos) · **[Desvincular]** · **[Atualizar]** (refresh de metadados).
- Requisitos de material aparecem como lacunas: "▢ Vídeo bruto — aguardando cliente desde 14/10".

**Área do cliente:** a aba **Materiais** mostra só vínculos `visibility=client`, com upload que cai em `03 Materiais`. No feed, a mídia da entrega vem pelo proxy/preview.

**Integrações → Google Drive:**
- Mostra status (CONECTADO / DESCONECTADO / ERRO / TOKEN EXPIRADO), conta, escopo, última sync, fila de jobs e erros recentes.
- Ações: mapear pasta raiz, mapear pastas existentes de cliente e "Criar estrutura para clientes sem pasta".

---

## 9. Eventos disparáveis

```
integration.drive.connected · .disconnected · .token_expired · .error · .reconnected
drive.sync.started · .completed · .partial · .failed
drive.folder.created · .mapped · .unmapped
drive.file.discovered     (novo em pasta mapeada)
drive.file.linked · .unlinked · .link_visibility_changed
drive.file.uploaded       (pela plataforma)
drive.file.updated        (nova revisão) · .renamed · .moved · .moved_out_of_scope
drive.file.trashed · .removed · .access_lost · .permission_changed (V2)
drive.file.approved_revision_changed
drive.file.viewed · .downloaded · .streamed       (auditoria; agregados)
drive.file.used_by_automation · .used_by_ai
material.required · .fulfilled · .missing · .overdue
```
Todos geram `activity_logs` (com `origin=automatica` quando vêm do sistema). Os relevantes também geram `notifications`, agrupadas por `group_key` (ex.: 12 arquivos novos do mesmo cliente viram "12 novos materiais de Cliente X").

---

## 10. Fluxo completo (resumo)

```
CONECTAR (OAuth + PKCE, token cifrado)
   ↓
MAPEAR (raiz da agência → criar/localizar Clientes/{Cliente}/… → drive_folders)
   ↓
SYNC INICIAL (startPageToken → listagem → drive_items → auto_link → file_links)
   ↓
OPERAÇÃO
   ├─ equipe vincula (Picker) ou envia (upload resumable → Drive) no contexto: conteúdo/tarefa/ajuste
   ├─ cliente envia material no portal → 03 Materiais → vínculo client-visible → requisito atendido → desbloqueio
   ├─ Process Engine consulta requisitos ao entrar em PRODUÇÃO → pendência se faltar
   ├─ telas mostram "Arquivos relacionados" por contexto; cliente vê só o permitido via proxy
   └─ Claude recebe trechos minimizados de arquivos permitidos → sugestões → humano confirma
   ↓
SYNC CONTÍNUA (changes.list a cada 5–10 min [+ webhook V2] + reconciliação diária)
   ├─ novo → descobrir/vincular · alterado → histórico/invalidar preview/alertar se aprovado
   ├─ movido → atualizar caminho · fora do escopo → marcar · removido/sem acesso → alertar
   └─ falha → backoff → fila → banner "dados de {hora}" (plataforma segue funcionando)
   ↓
APROVAÇÃO → congelar revisão (pinned/keepForever) → [V2] organizar em 06 Aprovados
```

---

## 11. Riscos e limitações

1. **Escopo restrito × conta Gmail.** Sem Google Workspace, o escopo `drive` exige verificação do Google (com avaliação de segurança) ou fica preso no modo Testing, com token que expira em 7 dias. Com `drive.file`, a plataforma **não enxerga** arquivos colocados direto no Drive por outras pessoas. Isso muda o hábito da equipe: "subir pela plataforma".
2. **Propriedade dos arquivos.** Arquivos que pertencem a contas pessoais de freelancers somem quando a pessoa sai. Recomenda-se um **Shared Drive** da agência (requer Workspace).
3. **Cotas e limites da API.** Há rate limits por usuário/projeto, e a exportação de Docs é limitada a 10 MB. Sincronizar árvores grandes exige paginação e backoff.
4. **Banda do proxy.** Fazer streaming de vídeos 4K pelo backend consome banda e CPU. Mitigar com previews em cache/CDN e streaming direto do Drive com range.
5. **Push notifications** exigem endpoint HTTPS público e renovação dos canais, e não informam o que mudou.
6. **Arquivos Google nativos** (Docs, Slides) não têm `md5`/`size` nem versões "fixáveis" com `keepForever`. A aprovação de um Doc congela o texto exportado como derivado.
7. **Permissões do Drive divergentes das da plataforma.** No MVP vale a permissão da plataforma (conta organizacional). Alguém com acesso no Drive mas sem vínculo na plataforma não verá o arquivo na plataforma, e o contrário também vale (o "Abrir no Drive" pode falhar).
8. **Prompt injection e LGPD.** Documentos de clientes podem conter dados pessoais. É preciso minimizar o que vai para a IA, registrar o uso e avaliar a política de retenção de dados do provedor de IA antes de enviar documentos sensíveis.
9. **Exclusão real** no Drive é irreversível para a plataforma. O vínculo histórico fica, mas o conteúdo se perde (exceto previews em cache).
10. **Disciplina de pastas.** O `auto_link` depende de a equipe respeitar a estrutura. A reconciliação e a fila "para classificar" reduzem, mas não eliminam, o risco.

---

## 12. Recomendações para o MVP

1. Conexão **organizacional única**. O escopo segue a resposta à pergunta Workspace × Gmail (§1.3).
2. **Criação/localização automática** da estrutura de pastas por cliente e mapeamento de pastas existentes (migração).
3. Entidades: `drive_connections`, `drive_items`, `drive_folders`, `file_links`, `file_derivatives`, `material_requirements`, `drive_sync_runs`, `drive_jobs`.
4. **Picker** para vincular arquivos e **upload resumable** de entregas da produção para o Drive (com fallback local em fila).
5. **Central de Arquivos** com os filtros pedidos e o bloco **Arquivos relacionados** em cliente, conteúdo, tarefa, ajuste e Sala de Revisão.
6. **Proxy autenticado** para visualização (imagem, vídeo com range, PDF), com previews derivados em cache e o original intacto no Drive.
7. **Sync por polling** (`changes.list` a cada 5–10 min) + reconciliação diária + botão Atualizar. Detectar novos, alterados, movidos e removidos.
8. Automações MVP da tabela §5: estrutura de pastas, material do cliente → requisito → desbloqueio, material ausente → pendência, arquivo alterado/removido → alerta, aprovado alterado → urgente.
9. Histórico completo e status de conexão na tela de Integrações.
10. **Claude só leitura**, sobre vínculos permitidos (resumir briefing, verificar material). Toda saída é sugestão confirmada por humano.

## 13. Segunda fase (V2/V3)
- Push (`changes.watch`) com renovação automática de canais.
- **OAuth por usuário** e modo estrito de permissão do Drive.
- `keepForever` na revisão aprovada e organização automática em `06 Aprovados`.
- Classificação de arquivos sem contexto por IA, com confirmação humana.
- Snapshot de permissões e alertas de compartilhamento público.
- Extração de briefing → Client Brain com revisão humana.
- Vincular gravações de reunião automaticamente e gerar ata por IA.
- OCR, transcrição de vídeo bruto e busca semântica nos documentos permitidos.
- Múltiplas conexões (ex.: Shared Drives por cliente) e Drive do próprio cliente conectado ao portal.
- Antivírus em uploads e CDN para previews.
- Comentários do Drive espelhados como comentários contextuais (avaliar necessidade).
