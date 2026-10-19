# THE BOLD OS — Módulo de Reuniões e Sala de Reunião
### Especificação funcional e técnica · v0.1 · 19/10/2026

> **Princípio:** uma reunião é uma **fonte estruturada de informação operacional**, não só um evento de agenda. Ela entra com contexto (cliente, ciclo, pendências, arquivos). Ela sai como decisões, tarefas, ajustes, materiais pedidos, memória do cliente e um resumo aprovado para o cliente.

---

## 0. Como as reuniões funcionam hoje (levantado no Slack/Calendar/Notion)

- **Reuniões mensais com clientes:** agendadas via **Calendly**, com título "[Cliente] e Agência Bold" e tipo "Reunião The Bold MKT – Conteúdo [Mês]". Duram 1h no Google Meet. Participam o cliente, Rebeca, Raísa ou Vivian e a estrategista da conta. Ficam concentradas em blocos ("DIA DE REUNIÃO" 9, 10, 11 e 13/11).
- **Cliente novo:** "Reunião [Cliente] – The Bold MKT" e "DIAGNÓSTICO DE MARCA" (1h30).
- **Internas recorrentes:**
  - Alinhamento semanal (seg 10h)
  - Estrategistas (ter 15h30)
  - Designers (qua 13h30)
  - Editores (sex 9h)
  - "VIVIAN → REBECA | Decisões do dia" (diária, 10 min, só decisões, aprovações e riscos)
- **Pós-reunião hoje:**
  - Existe a skill "resumo de reunião", mas o canal #resumo-reuniões **nunca foi usado**.
  - As gravações ficam numa pasta do Drive sem vínculo.
  - Decisões se perdem entre WhatsApp e Slack.
- **Mudança anunciada:** em dezembro, um formulário substitui a reunião mensal. O módulo precisa suportar **"reunião assíncrona"** (formulário + resumo) além da reunião ao vivo.

---

## 1. Decisão de tecnologia de videoconferência

### 1.1 Restrições reais
- **O Google Meet não pode ser embutido em iframe** em sites de terceiros. Dá para criar o espaço (Meet REST API), ler os artefatos depois (registros de conferência, participantes, gravações e transcrições, **com Google Workspace**) e criar um *Meet Add-on* (a The Bold *dentro* do Meet). O que não dá é ter o Meet *dentro* da The Bold OS.
- **Gravação e transcrição nativas do Meet** só existem em edições pagas do Workspace. A conta usada hoje parece ser @gmail.com (a confirmar).
- **WebRTC "puro" (P2P/mesh)** funciona bem até ~3–4 participantes. As reuniões internas têm 10–13 pessoas, então é preciso um **SFU** (servidor que roteia as mídias), além de **TURN** para redes corporativas e 4G.
- Os clientes estão no Brasil e muitos entram pelo celular. Isso exige qualidade adaptativa (simulcast) e servidores com boa latência no Brasil.

### 1.2 Comparativo

| Critério | **A) WebRTC próprio** (mediasoup/Janus + coturn, tudo construído) | **B) Infra de vídeo via API** (LiveKit / Daily / Vonage / Zoom Video SDK) | **C) Google Meet integrado** (Meet API + Calendar + Add-on) | **D) Solução pronta embutível** (Jitsi/JaaS, Whereby Embedded) |
|---|---|---|---|---|
| Experiência dentro da plataforma | Total | **Total**: UI própria com a identidade The Bold | Baixa: abre outra aba/app | Média: iframe com a cara do fornecedor, customização limitada |
| Custo | Infra + **muito** tempo de engenharia | Por minuto de participante. Para o volume estimado da The Bold (abaixo), **dezenas de US$/mês** | Incluso no Workspace (gravação/transcrição só em planos superiores) | Baixo a médio |
| Estabilidade e qualidade | Depende 100% do time | Alta: SFU global, simulcast, TURN incluso | Muito alta | Boa |
| Segurança | Toda sob responsabilidade própria | Tokens curtos por participante, salas privadas, DTLS-SRTP; E2EE opcional | Alta, mas os dados ficam no Google | Boa; varia por fornecedor |
| Escalabilidade | Difícil | Alta | Alta | Média/alta |
| Gravação | Construir (composição server-side) | **Pronta** (*egress* composto e **por participante**) | Nativa (Workspace) | Varia; geralmente pronta |
| Transcrição | Construir | Por STT plugável (lote ou ao vivo); áudio separado por participante dá **atribuição de fala exata** | Nativa (Workspace), em pt-BR, só depois da reunião | Varia |
| Dificuldade | **Muito alta** | Média | Baixa | Baixa |
| Manutenção | Alta e contínua | Baixa (SDK) | Muito baixa | Baixa |
| Dependência de fornecedor | Nenhuma | Baixa com LiveKit (open source, dá para migrar para self-host); média com os outros | Alta (Google) | Média |
| Cliente pelo login The Bold | Sim | **Sim**: o token é emitido pela plataforma depois da autorização | Não: depende de conta/link Google | Parcial |
| Isolamento interno × cliente na tela | Total | **Total**: a UI é da plataforma | Nenhum | Limitado |

**Estimativa de volume** (base: calendário real):
- ~25 reuniões mensais de clientes × 60 min × ~4 pessoas ≈ 6.000 participante-min.
- Internas: ~4 por semana × 60 min × ~10 pessoas ≈ 9.600 participante-min.
- Total: **~15–20 mil participante-min/mês** e ~40–60 h/mês de áudio para transcrever.

O volume é baixo. O custo de uma API de vídeo fica pequeno perto do custo de engenharia da opção A. *(Os preços dos fornecedores precisam ser conferidos na contratação.)*

### 1.3 Recomendação

**Opção B com LiveKit.** Começar no LiveKit Cloud (gerenciado), com caminho aberto para self-host.
- **UI 100% The Bold:** usa os SDKs React/JS com componentes próprios, na identidade bordô, preto e off-white. Funciona no celular pelo navegador, sem instalar app.
- **O cliente entra com o login da plataforma.** O backend da The Bold só emite o **token de sala** (JWT curto, assinado no servidor) depois de checar que o usuário é participante daquela reunião.
- **Gravação por egress:** um composto (para assistir) e **faixas de áudio por participante**. Assim a transcrição sabe *exatamente* quem falou, sem adivinhar por diarização.
- **Transcrição em lote depois da reunião**, por um provedor de STT com bom pt-BR (ex.: Deepgram, AssemblyAI, Google STT ou Whisper; avaliar com amostras reais). Legenda ao vivo fica para a V2 com LiveKit Agents.
- **É open source (Apache 2.0).** Se custo ou soberania de dados exigirem, migra para self-host sem reescrever o front.
- **Alternativa equivalente:** **Daily** (gerenciado, com gravação e transcrição integradas e implementação um pouco mais simples, mas sem caminho self-host).

**Google Meet continua como "modo externo".** Serve quando o cliente exige o Meet ou quando o encontro é presencial. A reunião continua existindo na plataforma, com pauta, contexto e pós-reunião. O link do Meet é guardado. Com Workspace, a transcrição é importada pela Meet API. Sem Workspace, a equipe sobe a gravação/transcrição ou cola anotações, e o pipeline do Claude é o mesmo.

**Não recomendado:**
- **A:** risco e custo de engenharia altos para um time sem foco em infraestrutura de mídia.
- **C como principal:** não entrega a experiência dentro da plataforma nem o isolamento cliente × interno.
- **D:** a identidade visual e o controle de dados ficam limitados.

---

## 2. Experiência do usuário

### 2.1 Navegação
- **REUNIÕES** na sidebar, com três abas:
  - **Agenda**: lista e calendário; filtros por cliente, tipo e responsável.
  - **Salas de horários**: janelas de reunião mensal para clientes reservarem (substitui o Calendly).
  - **Inteligência**: decisões, ações pendentes de confirmação, resumos aguardando aprovação.
- **Cliente → Reuniões → Reunião de [data]**: aparece também na timeline da ficha do cliente.
- **Portal do cliente → Reuniões**: próximas reuniões (botão Entrar), reservar horário, resumos publicados.

### 2.2 Página da reunião (equipe): quatro momentos
1. **PREPARAÇÃO**
   - Objetivo, pauta (tópicos com responsável e visibilidade *cliente/interna*), participantes.
   - Conteúdos relacionados (ex.: os 12 posts do ciclo aguardando aprovação), arquivos do Drive vinculados, pendências do cliente, decisões anteriores e histórico recente.
   - **[Gerar briefing pré-reunião]** (Claude, interno). Fica pronto automaticamente 24h antes.
2. **SALA** (ao vivo): ver §2.4.
3. **DEPOIS**
   - Gravação (se houve), transcrição navegável por fala com busca e timestamps.
   - **Resumo interno**, **Resumo do cliente**, fila de **Ações extraídas** (confirmar/editar/rejeitar).
4. **HISTÓRICO:** tudo que aconteceu com a reunião (criada, remarcada, gravada, resumo aprovado, tarefas criadas…).

### 2.3 Pré-entrada (lobby)
- Teste de câmera e microfone, escolha de dispositivos, nome exibido.
- **Aviso de gravação/transcrição**, quando previsto, com aceite (ver §5).
- Convidado externo sem login (V2, ex.: sócio do cliente) entra por link de uso único + sala de espera; o anfitrião admite.

### 2.4 Sala ao vivo
- **Palco:** grade/orador ativo, tela compartilhada em destaque, indicador de quem fala, qualidade adaptativa.
- **Barra:**
  - microfone, câmera, compartilhar tela
  - chat da reunião, participantes (presentes/ausentes, entradas/saídas)
  - pauta, arquivos
  - **● Gravar** (só quem tem permissão), sair, **encerrar para todos** (anfitrião)
- **Anfitrião:** silenciar, remover, admitir convidados, passar a função de anfitrião.
- **Painel "Pauta"** (todos): tópicos visíveis ao cliente, que a equipe marca como ✓ discutido.
- **Painel "Arquivos"** (todos): só arquivos `visibility=client` para o cliente. A equipe vê todos e pode **apresentar** um arquivo (abre no palco, sem compartilhar a tela inteira).
- **Painel "Bastidores"** (**só equipe**, nunca enviado ao cliente):
  - briefing pré-reunião, pendências internas, notas privadas
  - **chat interno** separado do chat da reunião
  - botão **[⚑ Marcar momento]** (decisão / ação / ajuste), que grava um marcador com timestamp e melhora a extração do Claude
- **Proteção de tela compartilhada:** ao compartilhar, a plataforma recomenda compartilhar **uma aba/arquivo** e mostra o aviso "Você está apresentando para o cliente". O "modo apresentação" esconde os bastidores da própria janela.
- **Indicador permanente** "● GRAVANDO / TRANSCREVENDO" para todos, inclusive quem entra depois.
- **Mobile:** layout vertical com orador ativo e controles grandes. Painéis em gaveta.

### 2.5 Portal do cliente
- **"Sua próxima reunião"**: data, objetivo, pauta (só tópicos do cliente), **materiais que precisamos** e botão **Entrar na sala** (habilitado 10 min antes).
- Depois: **"Resumo da nossa reunião"** quando publicado, com notificação "Seu resumo da reunião está disponível".

---

## 3. Entidades (o que é realmente necessário)

> Avaliação: `MeetingDecision` e `MeetingAction` **não precisam de tabelas separadas**. São o mesmo objeto (um item extraído com tipo, evidência, confiança e status de confirmação). Uma tabela única `meeting_items` com `kind` simplifica a revisão em fila e a conversão. `MeetingTopic` existe como `meeting_agenda_items`, porque a pauta tem ordem, dono e visibilidade.

| Entidade | Campos principais | Relações |
|---|---|---|
| **meetings** | `id`, `title`, `kind` (`mensal_conteudo` · `diagnostico` · `onboarding` · `briefing` · `estrategia` · `cronograma` · `producao` · `acompanhamento` · `interna` · `comercial` · `assincrona`), `client_id?`, `project_id?`, `cycle_id?`, `objective`, `starts_at`, `ends_at`, `duration_min`, `mode` (`sala_bold` · `externa_meet` · `presencial` · `assincrona`), `external_url`, `status` (`agendada` · `em_andamento` · `realizada` · `cancelada` · `nao_compareceu`), `host_id`, `recording_policy` (`nao_gravar` · `perguntar` · `gravar_com_consentimento`), `gcal_event_id`, `gcal_sync`, `slot_id?`, `created_by` | Client, Project, Cycle, User (host), Calendar |
| **meeting_participants** | `meeting_id`, `user_id?` / `guest_email?`, `display_name`, `role` (`anfitriao` · `equipe` · `cliente` · `convidado`), `required`, `rsvp`, `joined_at`, `left_at`, `attendance_seconds` | User |
| **meeting_context_links** | `meeting_id`, `entity_type` (`content` · `task` · `adjustment` · `onboarding` · `cycle` · `deal` · `brain_section`), `entity_id`, `visibility` | Content, Task… (polimórfico) |
| **file_links** *(da spec do Drive)* | `entity_type='meeting'` | Arquivos Drive/plataforma vinculados à reunião (pauta, apresentação, gravação) |
| **meeting_agenda_items** | `meeting_id`, `position`, `title`, `details`, `owner_id`, `visibility` (`client` · `internal`), `source_type/source_id` (ex.: veio de uma pendência), `status` (`pendente` · `discutido` · `adiado`) | Pendências, Conteúdos |
| **meeting_sessions** | `meeting_id`, `provider` (`livekit` · `meet`), `room_name` (aleatório), `started_at`, `ended_at`, `ended_by`, `provider_session_id` | — |
| **meeting_consents** | `meeting_id`, `participant_id`, `scope` (`gravacao` · `transcricao`), `decision` (`aceito` · `recusado`), `at`, `ip`, `policy_version`, `text_shown` | Participant |
| **meeting_recordings** | `meeting_id`, `session_id`, `kind` (`composta` · `audio_participante`), `participant_id?`, `storage` (`bucket` · `drive`), `storage_key` / `drive_item_id`, `duration`, `size`, `sha256`, `started_by`, `consent_snapshot` (JSON), `retention_until`, `deleted_at`, `deleted_by`, `delete_reason` | Drive (opcional) |
| **meeting_transcripts** | `meeting_id`, `source` (`stt_lote` · `meet_api` · `upload` · `notas_manuais`), `provider`, `language`, `status` (`processando` · `pronta` · `erro`), `retention_until`, `deleted_at` | — |
| **transcript_segments** | `transcript_id`, `participant_id`, `speaker_label`, `t_start`, `t_end`, `text` (**cifrado em repouso**), `confidence` | Participant |
| **meeting_markers** | `meeting_id`, `t`, `kind` (`decisao` · `acao` · `ajuste` · `importante`), `note`, `by_user_id` | User |
| **meeting_summaries** | `meeting_id`, `audience` (`internal` · `client`), `version`, `content` (JSON estruturado + markdown), `status` (`rascunho` · `em_revisao` · `aprovado` · `publicado` · `substituido` · `rejeitado`), `generated_by` (`ia` · `humano`), `ai_action_id`, `edited_by`, `approved_by`, `approved_at`, `published_at`, `leak_check` (JSON do resultado) | Claude (ai_actions) |
| **meeting_items** | `meeting_id`, `kind` (`acao` · `decisao` · `solicitacao_cliente` · `ajuste` · `pendencia` · `material` · `prazo` · `mudanca_estrategia` · `informacao` · `sugestao`), `text`, `owner_raw` ("Vitória"), `owner_id?` (resolvido), `due_raw` ("sexta"), `due_at?`, `due_type` (`explicito` · `inferido` · `nenhum`), `clarity` (`definida` · `ambigua`), `ambiguity_reason`, `confidence` (0–1), `evidence` (segmentos + citação + timestamp), `visibility` (`client` · `internal`), `status` (`sugerido` · `confirmado` · `editado` · `rejeitado` · `convertido`), `converted_type/converted_id` (task, adjustment, material_requirement, client_memory, cycle_exception), `confirmed_by`, `confirmed_at` | Task, Adjustment, Content, Client Brain |
| **messages** *(reutiliza o chat)* | canal `kind='reuniao'` (chat com o cliente) e `kind='reuniao_interna'` (bastidores) | — |
| **activity_logs**, **notifications**, **ai_actions** *(existentes)* | — | Histórico, notificações, rastreabilidade do Claude |

**Relacionamentos-chave:**
- `Client 1─N Meeting`, `Project/Cycle 1─N Meeting`.
- `Meeting N─N User` (participants), `Meeting N─N Content/Task` (context_links).
- `Meeting 1─N MeetingItem`. Cada item pode virar `Task` (com `origin='reuniao'`, `source_id=item`), `Adjustment` (em um `Content`), `MaterialRequirement` (Drive) ou `ClientMemory` (decisão/aprendizado no Client Brain).
- `Meeting 1─N Summary` (versões por audiência).
- `Meeting ─ Calendar` (gcal_event_id). Arquivos via `file_links`. O Claude via `ai_actions.context_refs`.

---

## 4. Integrações

### 4.1 Google Calendar
- **Criar** na The Bold OS: `events.insert` com convidados, horário, duração, descrição (objetivo + pauta pública) e **link da Sala The Bold** (em `location`/descrição; um "conference solution" personalizado só existe via add-on do Workspace).
- **Alterar/cancelar:** `events.patch` / `events.delete` com `sendUpdates=all`. O histórico registra antes → depois.
- **Mudanças feitas direto no Google Calendar:** sync incremental (`events.list` com `syncToken`, + `events.watch` na V2). A plataforma detecta alteração de horário ou cancelamento, **atualiza a reunião e registra no histórico** ("horário alterado no Google Calendar por X"). Em conflito (alteração simultânea), **a plataforma pergunta** e não sobrescreve.
- **Disponibilidade:** `freebusy.query` da equipe na hora de abrir janelas e reservar horários (bloqueia conflitos).
- Reuniões internas recorrentes (alinhamento, designers…) podem ser **importadas** e vinculadas ao tipo `interna`.

### 4.2 Google Drive (conforme `docs/integracoes/google-drive.md`)
- **Antes:** a reunião mostra os `file_links` do cliente/ciclo relevantes para o tipo (mensal → cronograma, conteúdos do ciclo; diagnóstico → briefing, identidade, referências).
- **Durante:** "apresentar arquivo" pelo proxy autenticado. O cliente só vê arquivos `visibility=client`.
- **Depois:** documentos citados são vinculados à reunião. Se a política permitir, a gravação é **referenciada** no Drive (pasta `07 Reuniões`, restrita) ou guardada no bucket privado (ver §5.3). Nada é duplicado.

### 4.3 Process Engine
Os itens confirmados viram objetos operacionais **por regra determinística**:

| Item confirmado | Vira | Efeito |
|---|---|---|
| `acao` | `Task` (origem: reunião) | Atribuída ao `owner_id` (ou por função); prazo `due_at`; notifica. |
| `ajuste` com conteúdo identificado | `Adjustment` (origem: cliente) | O conteúdo volta para AJUSTE pelo fluxo normal. |
| `material` | `MaterialRequirement` | Bloqueia/alerta a etapa de produção até o material chegar. |
| `decisao` / `mudanca_estrategia` | `ClientMemory` (Client Brain) | Uma mudança de estratégia gera tarefa para a estrategista revisar o cronograma. |
| `prazo` que altera o ciclo | Exceção de ciclo (`cycles.milestones`) | **Exige aprovação** de Operações/Gestão. |
| Reunião mensal realizada | Marco do ciclo | O ciclo do cliente avança. Se não aconteceu até o prazo, vira pendência/follow-up. |
| `nao_compareceu` | Follow-up | Tarefa para o atendimento remarcar. |

---

## 5. Gravação, transcrição, privacidade (LGPD)

### 5.1 Consentimento
- A política de cada reunião é definida na criação: `nao_gravar` (padrão das internas sensíveis), `perguntar` ou `gravar_com_consentimento` (padrão das mensais de cliente, se a The Bold quiser).
- **No lobby**, todos os participantes veem o aviso: finalidade (gerar resumo e tarefas), quem acessa, retenção, direito de recusa. O aceite fica registrado em `meeting_consents`.
- **Se alguém recusa**, a gravação **não inicia**. Opção: seguir só com "notas assistidas" (marcadores + anotações manuais → Claude).
- **Indicador permanente** de gravação. Quem entra depois passa pelo aviso antes de entrar.
- Gravação e transcrição são **escopos separados**: dá para transcrever sem guardar o vídeo.
- **Contrato com o cliente:** incluir cláusula de tratamento de dados de reuniões (base legal, finalidade, retenção) e manter uma política de privacidade versionada (`policy_version`). *[PLACEHOLDER — validar texto com assessoria jurídica.]*

### 5.2 Quem pode o quê

| Ação | CEO | Operações | Gestão | Qualidade | Anfitrião/Estrategista da conta | Equipe participante | Equipe não participante | Cliente |
|---|---|---|---|---|---|---|---|---|
| Iniciar gravação | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Ver gravação | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (se vinculada ao cliente) | — | **V2, opcional:** só se a política do cliente permitir e após aprovação |
| Ver transcrição | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (se vinculada ao cliente) | — | ✗ (padrão) |
| Ver resumo interno | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (se vinculada) | — | ✗ **nunca** |
| Editar resumos | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — |
| **Aprovar e publicar resumo ao cliente** | ✓ | ✓ | ✓ | ✓ | ✓ *se não houver itens sinalizados como sensíveis*; senão, só "enviar para aprovação" | — | — | — |
| Ver resumo do cliente publicado | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (se vinculada) | ✓ (só o próprio) |
| Excluir gravação/transcrição | ✓ | ✓ | — | — | — | — | — | Pode **solicitar** exclusão |

Toda visualização e download de gravação ou transcrição gera registro no histórico.

### 5.3 Armazenamento, retenção, exclusão, proteção
- **Onde:**
  - Gravações em **bucket privado** com criptografia em repouso e acesso só por URL assinada de curta duração (via backend, com checagem de permissão).
  - Opcional: referenciar no Drive `07 Reuniões` **somente** se for Shared Drive com membros restritos.
  - Transcrições no banco, com `text` **cifrado em nível de campo** (chave fora do banco).
- **Retenção padrão (configurável por cliente):**
  - Áudio por participante: **7 dias**. É apagado depois da transcrição validada.
  - Gravação composta: **90 dias**.
  - Transcrição: **12 meses**.
  - Resumos e itens confirmados: **pelo tempo do contrato + 5 anos**, por serem registro operacional. *[PLACEHOLDER — validar com jurídico.]*
- **Exclusão:**
  - Job diário apaga o que passou de `retention_until`.
  - Exclusão manual (CEO/Operações) ou a pedido do cliente.
  - O conteúdo binário é apagado. O **registro de que existiu e foi excluído** fica no histórico (sem o conteúdo).
- **Proteção:**
  - TLS e DTLS-SRTP em trânsito; tokens de sala de curta duração e por pessoa.
  - Salas com nome aleatório; sala de espera para convidados.
  - Webhooks do provedor validados por assinatura.
  - E2EE do LiveKit **não** é usado em reuniões gravadas/transcritas, porque inviabiliza o processamento no servidor. Pode ser opção para reuniões internas sensíveis sem gravação.
- **Provedor de STT e Claude:** enviar só o necessário e avaliar as políticas de retenção de dados dos provedores antes de ativar. *[PLACEHOLDER — decisão de fornecedor.]*

---

## 6. Claude no ciclo da reunião

O Claude **nunca** grava estado diretamente. Ele produz **saídas estruturadas (JSON validado por schema)**, e a plataforma aplica as regras e as confirmações humanas.

### 6.1 Briefing pré-reunião (interno)
- **Entrada:** dados permitidos do cliente.
  - Client Brain (tom, objetivos, restrições)
  - decisões dos últimos 90 dias
  - pendências abertas
  - conteúdos aguardando aprovação/ajuste
  - itens de reuniões anteriores não concluídos
  - arquivos vinculados (trechos)
  - riscos calculados pelo engine
- **Saída:** `{ultimas_decisoes[], pendencias[], conteudos_aguardando[], pontos_a_discutir[], riscos[], perguntas_sugeridas[], pauta_sugerida[]}`.
- A pauta sugerida pode ser aceita item a item, cada um com `visibility`.

### 6.2 Pipeline pós-reunião
1. `meeting.ended` → egress finaliza (webhook) → **job de transcrição** (STT em lote, áudio por participante, pt-BR).
2. **Extração** (Claude, passo 1). Entrada: transcrição + marcadores + pauta + participantes (com nomes e funções) + data da reunião. Saída: `meeting_items[]`.
   - Cada item traz `kind`, `text`, `owner_raw`, `due_raw`, `due_type`, `clarity`, `confidence` e `evidence` (citação + timestamp).
   - Prazos relativos ("sexta") são resolvidos contra a data da reunião e marcados `inferido`.
3. **Resumo interno** (passo 2), com as seções exigidas:
   - Cliente, data, participantes, objetivo
   - principais pontos, decisões, solicitações do cliente, ajustes
   - pendências, responsáveis, prazos mencionados, próximos passos
   - **pontos que precisam de confirmação**
4. **Resumo do cliente** (passo 3). É gerado **a partir dos itens `visibility=client`** e da pauta pública, **não da transcrição bruta**, para reduzir vazamento.
   - Estrutura: saudação, o que definimos, próximos passos, materiais que precisamos, prazos combinados, próxima etapa.
   - Tom: segue o Client Brain e a voz da The Bold.
5. **Checagem de vazamento** (determinística + Claude):
   - Procura nomes de outros clientes, termos de bastidor ("atrasado por conta de X na equipe"), valores financeiros, nomes de pessoas internas fora da lista autorizada e itens `internal`.
   - Resultado em `leak_check`. Se houver alerta, **a aprovação exige um perfil sênior** (CEO/Operações/Gestão/Qualidade).

### 6.3 Regras para virar tarefa
| Classificação | Comportamento |
|---|---|
| Ação **definida**, dono resolvido sem ambiguidade (interno), prazo **explícito**, confiança ≥ 0,85, sem impacto financeiro/contratual | **Pré-marcada** para conversão. **No MVP**, o anfitrião confirma em 1 clique ("Confirmar ações claras"). **V2:** opção de criação automática por tipo. |
| Prazo **inferido** | Exige confirmação; mostra "sexta 17/10 (inferido)". |
| Dono ambíguo ("alguém da equipe", "vocês") | Exige escolher o responsável; senão, a atribuição vai **por função** do engine. |
| Decisão | Vai para o Client Brain só após confirmação. |
| Sugestão / informação | Não vira tarefa; aparece no resumo interno. |
| Ambígua / contraditória | Vai para "Pontos que precisam de confirmação", com a citação de origem. |
| Envolve cliente fazendo algo (enviar material) | Vira `material_requirement`/pendência do **cliente** (visível no portal) após confirmação. |

### 6.4 Outros usos
- **Brain:** responde perguntas como "quais decisões foram tomadas na última reunião com X?", usando `meeting_items` confirmados (fonte oficial) e citando a reunião.
- **Insights:**
  - reuniões que geram muitos ajustes
  - clientes que faltam
  - ações de reunião que vencem sem conclusão
  - tempo entre reunião e resumo publicado

---

## 7. Aprovação e publicação do resumo do cliente

```
Resumo do cliente gerado (rascunho)
   ↓ notificação "Resumo aguardando revisão" → anfitrião + estrategista da conta
[Editar]  [Revisar diferenças vs. resumo interno]  [Solicitar nova versão (com instrução)]
   ↓
[Aprovar e liberar para o cliente]   ← quem aprova: CEO · Operações · Gestão · Qualidade; anfitrião/estrategista se leak_check limpo
   ↓ (transação)
status=publicado · published_at · approved_by · versão congelada
   ↓
Portal do cliente: Reuniões → Reunião de [data] → Resumo da reunião
   ↓
Notificação ao cliente: "Seu resumo da reunião está disponível." (+ e-mail opcional)
   ↓
Histórico do cliente: "Resumo disponibilizado ao cliente — por Vitória, 15/10 18:42"
```
- **Edição depois de publicado:** cria a versão N+1. A anterior fica `substituido` e o cliente vê a mais recente com o selo "atualizado em…".
- **SLA:** resumo publicado **em até 24h úteis**. Se passar do prazo, vira pendência para Operações.

---

## 8. Notificações

| Evento | Quem recebe | Nível |
|---|---|---|
| Reunião agendada / reservada pelo cliente | participantes; cliente | info |
| Reunião alterada (plataforma ou Google Calendar) | participantes; cliente | atenção |
| Reunião cancelada | participantes; cliente | atenção |
| Reunião começa em 10 min | participantes (inclui cliente, com o botão Entrar) | atenção |
| Briefing pré-reunião pronto | equipe participante | info |
| Gravação iniciada | todos na sala (indicador; não é push) | — |
| Transcrição pronta / falhou | anfitrião | info / atenção |
| Resumo gerado / aguardando aprovação | anfitrião + aprovadores | atenção |
| Resumo liberado ao cliente | cliente; equipe da conta | info |
| Ações extraídas aguardando confirmação | anfitrião | atenção |
| Tarefa criada a partir da reunião | responsável | info (agrupado por reunião) |
| Prazo identificado na reunião | responsável | info → atenção perto do vencimento |
| Resumo não publicado em 24h úteis | Operações | atenção |
| Material pedido pelo cliente não enviado | atendimento + cliente | atenção |

---

## 9. Automações (resumo)

| Evento | Condição | Ação | Tipo | Fase |
|---|---|---|---|---|
| Janela de reuniões aberta | ciclo do mês | Notificar clientes ativos para reservar; follow-up D+2 para quem não reservou | Regra | MVP |
| Reunião criada/alterada | Calendar conectado | Criar/atualizar evento + convidados | Regra | MVP |
| T-24h | reunião de cliente | Gerar briefing pré-reunião | IA | MVP |
| T-10min | — | Notificar e habilitar Entrar | Regra | MVP |
| Reunião encerrada | gravação consentida | Transcrição em lote | Regra | MVP |
| Transcrição pronta | — | Extração + resumos + leak check | IA | MVP |
| Itens confirmados | — | Criar tarefas/ajustes/requisitos/memórias | Regra + humano | MVP |
| Resumo aprovado | — | Publicar, notificar, registrar | Regra | MVP |
| 24h úteis sem resumo publicado | — | Pendência para Operações | Regra | MVP |
| Cliente não compareceu | 15 min sem entrada | Marcar e criar follow-up de remarcação | Regra | MVP |
| Evento alterado no Google | sync | Atualizar a reunião e o histórico; conflito → perguntar | Regra | MVP |
| Retenção vencida | diário | Excluir binários, registrar | Regra | MVP |
| Legenda ao vivo / anotações ao vivo | — | Agent na sala | IA | V2 |
| Reunião assíncrona (formulário) | dezembro | Respostas → mesmo pipeline de extração e resumo | IA + humano | V2 |

---

## 10. Arquitetura (encaixe na The Bold OS)

```
┌──────── Frontend The Bold OS (React) ────────┐
│ Reuniões · Sala (LiveKit SDK + UI própria)   │
│ Portal do cliente (mesma Sala, visão cliente)│
└──────────────┬───────────────────────────────┘
               │ REST + SSE (auth por sessão)
┌──────────────▼───────────────────────────────┐
│ API The Bold OS                              │
│  • MeetingService (CRUD, pauta, participantes, slots)
│  • RoomTokenService → JWT LiveKit curto, por pessoa, com permissões (publicar, gravar, admin)
│  • CalendarAdapter (Google Calendar)         │
│  • DriveAdapter (file_links)                 │
│  • Webhooks: LiveKit (room/egress), Google   │
│  • Jobs: transcrição, extração IA, retenção  │
│  • Process Engine (itens → tarefas/ajustes)  │
│  • AI Gateway (Claude): contexto filtrado por permissão + schemas
└───┬───────────┬───────────┬──────────┬───────┘
    │           │           │          │
 LiveKit     Bucket       STT        Claude
 (SFU/egress) privado    (pt-BR)    (Anthropic API)
```
- **Estado oficial no banco da plataforma.** LiveKit, STT e Claude são processadores. O Google Calendar é espelho sincronizado.
- O **token de sala** carrega identidade e permissões (cliente: publicar áudio/vídeo/tela, sem gravar, sem admin).
- A **separação cliente × interno** é feita no backend: o chat dos bastidores está em outro canal, e o painel de bastidores consome endpoints que exigem `isInternal`.

---

## 11. Fluxo completo

```
CRIAR REUNIÃO (equipe) ─ ou ─ CLIENTE RESERVA HORÁRIO (janela mensal, freebusy, sem conflito)
  ↓
VINCULAR cliente · projeto · ciclo · conteúdos · arquivos do Drive
  ↓
CRIAR PAUTA (tópicos internos/cliente; sugestões a partir de pendências)
  ↓  Google Calendar: evento + convidados + link da Sala · notificações
PREPARAR CONTEXTO COM IA (briefing pré-reunião, T-24h, interno)
  ↓
LOBBY (teste de dispositivos · aviso e consentimento de gravação/transcrição)
  ↓
REUNIÃO NA SALA THE BOLD (vídeo, áudio, tela, chat, pauta, arquivos, bastidores, marcadores)
  ↓
GRAVAÇÃO / TRANSCRIÇÃO — somente se todos consentiram
  ↓
CLAUDE ANALISA → itens extraídos (com evidência, confiança, clareza, tipo de prazo)
  ↓
RESUMO INTERNO            RESUMO DO CLIENTE (a partir de itens client-visible) + leak check
  ↓                          ↓
CONFIRMAÇÃO DE AÇÕES      REVISÃO INTERNA → [Editar] [Nova versão] [Aprovar e liberar]
  ↓                          ↓
TAREFAS · AJUSTES ·       PUBLICAÇÃO NA ÁREA DO CLIENTE → NOTIFICAÇÃO AO CLIENTE
MATERIAIS · MEMÓRIAS
  ↓
ATUALIZAÇÃO DO PROCESSO (marcos do ciclo, bloqueios, prazos com aprovação)
  ↓
HISTÓRICO DO CLIENTE (timeline: agendada → realizada → resumo gerado → resumo publicado → tarefas criadas)
  ↓
RETENÇÃO (exclusão programada de binários; registros permanecem)
```

---

## 12. Riscos e limitações
1. **O Meet não roda dentro da plataforma.** Usá-lo como principal sacrifica a experiência integrada e o isolamento cliente × interno.
2. **Qualidade da transcrição em pt-BR** com termos de marketing e nomes próprios. Mitigar com vocabulário customizado (nomes de clientes e equipe) e um teste comparativo de provedores com gravações reais autorizadas.
3. **Consentimento:** a recusa de um participante desliga a gravação. O processo precisa de "notas assistidas" como alternativa.
4. **Vazamento no resumo do cliente.** Mitigado por: geração a partir de itens filtrados + leak check + aprovação humana obrigatória por padrão.
5. **Compartilhamento de tela** pode expor informação interna. Isso é controle de UX (aviso e modo apresentação), não técnico.
6. **Dependência de fornecedor** (LiveKit Cloud): mitigada por ser open source e permitir self-host.
7. **Celular com rede fraca:** simulcast e modo só áudio ajudam, mas a qualidade depende da rede do cliente.
8. **Sync com o Google Calendar** sem Workspace funciona por conta individual conectada. Mudanças feitas na agenda de outra pessoa podem não ser vistas.
9. **Custos variáveis** (minutos de vídeo, egress, STT, tokens): baixos no volume atual, mas precisam de monitoramento no painel de Integrações.
10. **LGPD:** textos de aviso, contrato e retenção precisam de validação jurídica. *[PLACEHOLDER]*

## 13. Recomendações para o MVP
1. Reuniões na plataforma (CRUD, contexto, pauta com visibilidade, participantes, timeline do cliente) + **janelas de horários** para clientes (substitui o Calendly) + **Google Calendar** bidirecional.
2. **Sala The Bold com LiveKit Cloud:**
   - vídeo, áudio, tela, chat, participantes, controles de anfitrião, sala de espera
   - painel de pauta e arquivos; bastidores só para a equipe; marcadores
3. **Gravação com consentimento** (composta + áudio por participante) e **transcrição em lote** pt-BR.
4. **Claude:** briefing pré-reunião, extração de itens, resumo interno, resumo do cliente, leak check.
5. **Fila de confirmação de ações** → tarefas/ajustes/materiais/memórias pelo Process Engine.
6. **Aprovação e publicação** do resumo do cliente, com notificação e histórico.
7. **Modo externo** (Meet/presencial) com upload de transcrição ou anotações → mesmo pipeline.
8. Retenção e exclusão automáticas e auditoria de acesso.

## 14. Segunda fase
- Legendas e anotações ao vivo (agente na sala).
- Convidados externos sem login.
- Meet Add-on.
- Importação automática de transcrições do Meet (Workspace).
- Reunião assíncrona por formulário (dezembro).
- Criação automática de tarefas de alta confiança.
- Busca semântica em transcrições.
- Métricas de reunião (tempo de fala, temas recorrentes).
- Gravação acessível ao cliente (opcional por contrato).
- Self-host do LiveKit, se o volume ou a soberania de dados exigirem.
