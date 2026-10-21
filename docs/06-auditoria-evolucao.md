# THE BOLD OS — Auditoria para a rodada de evolução

Data: 21/10/2026. Esta auditoria cobre os 27 requisitos da rodada, os adicionais (Produção & Repasses, Recebimentos) e as camadas de inteligência (capacidade, rentabilidade, causa raiz, radar de automações, memória de decisões, performance).

Tudo abaixo foi verificado no código e na base real. Nada foi suposto.

---

## 1. Auditoria do estado atual

### Base real (hoje)

| Dado | Quantidade | Observação |
|---|---|---|
| Clientes | 24 | Todos vindos do Notion (CLIENTES MKT / ADVS MKT) |
| Equipe | 10 | Nomes reais. E-mails `@thebold.demo` provisórios; só a Rebeca tem e-mail real |
| Conteúdos | 451 | Quadros de outubro (218) e novembro (233) do Notion |
| Tarefas | ~900 abertas | Criadas pelo Process Engine na importação |
| Tarefas **concluídas** | **0** | Não existe histórico de execução ainda |
| Contratos / faturas | **0 / 0** | Financeiro vazio |
| Negócios (CRM) | **0** | |
| Reuniões | **0** | |
| Acessos de cliente | **0** | Só **1** dos 24 clientes tem e-mail na ficha (veio do formulário) |

**Consequência direta:** performance, confiabilidade, tempo médio, rentabilidade, causa raiz histórica e previsão por histórico **não têm dados para calcular**. A estrutura pode ser construída agora, mas os números vão mostrar "dados insuficientes" até a operação rodar dentro da plataforma por algumas semanas. Não há como acelerar isso sem inventar.

### Infraestrutura (o ponto mais crítico)

- A prévia na **Vercel** roda a API como função *serverless*. Cada instância decifra uma **cópia** da base em `/tmp`.
- **Tudo o que é gravado na prévia é temporário.** Some quando a instância reinicia ou num novo deploy, e não aparece nas outras instâncias. Isso vale para pagamento marcado, valor cadastrado, fechamento, senha redefinida, comentário e mudança de etapa.
- **Nenhuma rotina automática roda na Vercel.** O agendador (`server/engine/scheduler.js`: prazos, régua de cobrança, detectores, publicação) só funciona com processo contínuo, e `vercel.json` não tem *cron*.
- Quase toda a rodada depende disso:
  - cobrança automática diária;
  - apuração diária e fechamento no dia configurado;
  - ativação de etapas na data (req. 21);
  - sincronização com Google e Slack;
  - processamento de transcrição;
  - notificações por e-mail.

**Sem banco permanente e rotina agendada, esses recursos podem ser construídos e testados, mas não funcionam em produção.**

### Arquitetura (o que está de pé)

- **Servidor:** Node 22 + Express 5 + SQLite (`node:sqlite`, síncrono), 51 tabelas.
- **Frontend:** React 19 + Vite.
- **Process Engine** (`server/engine/process.js`):
  - 14 etapas com função, ação, saída e SLA;
  - marcos do ciclo mensal (`cycle_template`);
  - tarefas criadas e atribuídas pela função do cliente;
  - prazos pelo marco ou por SLA.
- **Permissões** (`server/lib/permissions.js`):
  - modelo ROLE + USUÁRIO + CLIENTE + MÓDULO + AÇÃO, checado no backend;
  - exceções por usuário (`user_permissions`);
  - escopo de clientes por vínculo.
- **Auditoria:** `activity_logs` é *append-only*, protegido por gatilho no banco (não aceita UPDATE nem DELETE).
- **Notificações:** tabela `notifications` com nível, agrupamento e lido/não lido. Aparecem em tempo real na plataforma (SSE). **Não há** e-mail nem push.
- **IA:** `server/ai/gateway.js` é o único ponto de acesso ao Claude.
  - Agentes têm escopo de dados e o contexto respeita a permissão do usuário.
  - Toda chamada fica registrada em `ai_actions`.
  - Sem `ANTHROPIC_API_KEY`, devolve "não configurado".
- **Integrações** (`server/integrations/`):
  - **Google Calendar:** OAuth real, criar/editar/excluir/listar eventos e livre-ocupado. **Só na direção plataforma → Google**, nas reuniões.
  - **Slack:** OAuth real, mas só **espelha avisos** (`chat.postMessage`). Não lê canais.
  - **Meta (Instagram):** publicação.
  - Nenhuma está conectada hoje (faltam as credenciais no servidor).
- **E-mail:** Resend (`server/services/mail.js`), criado para a redefinição de senha. Falta configurar `RESEND_API_KEY`.

---

## 2. O que já existe (será reutilizado, não recriado)

| Requisito | Já existe | Onde |
|---|---|---|
| 02 Modo claro/escuro | Tokens de tema claro/escuro e opção em Perfil (salva **só no navegador**) | `tokens.css`, `Perfil.jsx` |
| 04 Visão da equipe | Dashboard por papel: produção, estratégia, revisão, comercial | `pages/dash/*` |
| 05 Torre | Torre com estado, riscos, gargalos, mapa, saúde, pessoas, desempenho e inteligência com evidência | `engine/tower.js`, `Torre.jsx` |
| 06 Processos | Quadro (Equipe/Etapas), filtros, "Devolver etapa" com motivo, histórico de etapa | `Processos.jsx`, `returnToStage` |
| 08 Pendências | Radar por severidade e causa, quem age, detalhe com ações. Derivado do estado real | `routes/pendencias.js` |
| 09 Ficha | Abas: visão, ficha (com origem), brain, onboarding, conteúdos, reuniões, equipe, arquivos, financeiro, histórico | `ClienteDetalhe.jsx` |
| 10/11 Calendário e feed | **No portal do cliente:** feed com aprovar, ajuste, legenda, curtir e comentar; calendário | `portal/Feed.jsx`, `portal/Calendario.jsx` |
| 12 Comentários | Comentários por versão com âncora (página/tempo/região); menções; ajustes com página do carrossel; detector de intenção de ajuste no comentário do cliente | `comments`, `adjustments`, `/portal/intent` |
| 13 Onboarding | Formulário oficial "Sua marca" (estrutura real do Notion), respostas → Client Brain, itens obrigatórios, conclusão automática | `services/onboarding.js`, `portal/Onboarding.jsx` |
| 14 Reuniões | Reuniões, itens (decisão, ação), sala de horários. Criar no Google quando conectado | `comms.js`, `Reunioes.jsx` |
| 15 Chat | Canais (interno, cliente, direto), threads, arquivos, menções, converter mensagem em tarefa/ajuste/evento, não lidas | `comms.js`, `Comunicacao.jsx` |
| 18 Divisão | Permissão `divisao` (só CEO; só ela libera), vincular e desvincular, backend protegido | `routes/divisao.js` |
| 19 Revisão | Sala de Revisão com sessão, rascunho por conteúdo, ajuste por página e finalização em lote | `routes/review.js`, `Revisao.jsx` |
| 20 Calendário | Visões mês, semana, dia e agenda; tipos de evento; filtro por cliente | `Calendario.jsx`, `/calendar` |
| 22 Financeiro | Tabelas `contracts` (com `due_day`!) e `invoices` (aberta, paga, atrasada); régua de cobrança no agendador; CRM com funil | `routes/business.js`, `Financeiro.jsx`, `CRM.jsx` |
| 23 Usuários | Perfis, exceções por usuário, vínculos, ativar/desativar, último acesso, senha provisória, link de redefinição | `Usuarios.jsx`, `core.js` |
| 25 Regra × IA | Separação já documentada; automações classificadas em regra, IA ou humano | `docs/02-arquitetura.md`, `automations` |
| Brain | The Bold Brain (perguntas), insights por regra, relatórios | `Brain.jsx`, `intelligence.js` |

---

## 3. O que precisa ser alterado

1. **Cor principal:** o "bordô" que aparece no **modo escuro** é `#8E2238` e `#C4566C`, que puxam para rosa e framboesa. O bordô-base `#4A1725` é correto. Vou criar uma escala **vinho** única e trocar os acentos espalhados por variáveis.
2. **Tema:** hoje a preferência fica só no navegador. Precisa ficar **salva por usuário** e ter um seletor visível no topo, sem perder a tela em que a pessoa está.
3. **Process Engine (req. 21, a regra mais importante):** hoje, ao entrar numa etapa, a tarefa é criada **na hora**.
   - Precisa existir o estado **"pronto para a próxima etapa, mas a etapa só abre em DD/MM"**.
   - Até lá: nada de tarefa operacional, atraso ou evento. Pode avisar CEO/Operações e postar no canal.
   - Na data: a tarefa é ativada.
4. **Movimento manual (req. 6):** existe "Devolver etapa". Falta:
   - mover para qualquer etapa;
   - classificar o movimento (normal, manual, retorno, bloqueio, reabertura, correção, exceção);
   - registrar responsável anterior e atual;
   - avaliar impacto (prazo em risco, dependências);
   - avisar o responsável;
   - pedir motivo quando for relevante.
5. **Pendências:** separar **Minhas** e **Equipe**. A visão Equipe depende de permissão.
6. **Visão geral CEO e Torre:** papéis definidos na seção 4, recompostas visualmente.
7. **Ficha do cliente:** abas de Processo, Calendário editorial, Feed, Aprovações, Comunicação e Materiais. Calendário e feed vêm **da mesma tabela de conteúdos**, sem duplicar.
8. **Comunicação → BOLD CHAT:** faltam mensagens fixadas, busca, grupos, conteúdo como objeto na conversa e o assistente com regras.
9. **CRM + Financeiro → NEGÓCIO**, com abas. Recebimentos e Produção & Repasses ficam como módulos separados.
10. **Usuários:** tela mais visual. Acesso por cliente depende dos e-mails reais (ver seção 7).
11. **Calendário Google:** hoje é só plataforma → Google, nas reuniões. Precisa ir nos dois sentidos, com identificador externo.
12. **Notificações:** preferências por usuário, canal e-mail e push (PWA).

---

## 4. Novos componentes necessários

### Papéis definidos (req. 3 × 5)

| Tela | Pergunta | O que faz | Decisões que permite |
|---|---|---|---|
| **Visão geral (CEO)** | "Rebeca, isso é o que você precisa saber **agora**." | Máximo de 5 itens que pedem você; estado em uma frase; agenda de hoje e amanhã; números-chave clicáveis | Agir já: decidir, cobrar, destravar |
| **Torre de Controle** | "Aqui está a operação inteira. Investigue." | Fluxo ONDE ESTAMOS → O QUE ESTÁ ERRADO → ONDE → QUEM → O QUE FAZER; causa raiz com FATO / PADRÃO / HIPÓTESE / AÇÃO; filtros e *drill-down* até a origem | Redistribuir, mudar prazo e processo, priorizar clientes |
| **Visão geral (equipe)** | "O que **eu** preciso fazer hoje?" | Minhas tarefas, prazos, aprovações, reuniões e mensagens; "Você está aqui" (cliente → processo → etapa → próxima ação) | Executar |

### Componentes

- **Tema e marca:** escala vinho, seletor claro/escuro no topo, preferência no usuário.
- **Process Engine:**
  - janela de etapa (`available_at`) e tarefa "agendada" ativada pelo agendador;
  - classificação de movimento;
  - avaliação de impacto.
- **Rotina agendada:** endpoint protegido `/api/cron/tick` (para Vercel Cron, *cron* do Railway, etc.). É **o mesmo agendador**, só que pode ser chamado de fora.
- **Equipe:**
  - página **Equipe**: operação para todos;
  - camada **Performance** só para quem tiver permissão, com indicadores explicáveis e "ver dados de origem".
- **Pendências** Minhas / Equipe.
- **Ficha do cliente:**
  - Calendário editorial (igual ao Notion, mês com cards);
  - Feed (grade do Instagram);
  - Aprovações, Materiais e Processo;
  - os mesmos componentes no portal, com as permissões do cliente.
- **Comentário → ajuste:** botão "Transformar em ajuste" (responsável, prazo, origem). A sugestão automática usa o detector que já existe.
- **BOLD CHAT:** fixar, buscar, grupos, "+ Conteúdo" (objeto com prévia que abre o conteúdo) e assistente com escopo e regra de encaminhamento.
- **Reuniões:**
  - modelo do resumo (THE BOLD · RESUMO DE REUNIÃO);
  - estados "encerrada / aguardando transcrição / processando / resumo pronto";
  - publicação em `#resumo-reuniões`.
- **Revisão inteligente:**
  - cadastro de critérios (Visual / Técnico / Estratégico);
  - modo manual com motivo;
  - modo IA em **treinamento** (IA analisa → humano confere → diferença registrada).
- **NEGÓCIO:** abas CRM · Financeiro · Recebimentos · Custos · Metas · Rentabilidade · Produção & Repasses.
- **Notificações:** preferências (canal, prioridade, agrupamento), e-mail e push PWA.
- **Brain:** Memória de Decisões (com versões), Radar de Automações (sugestão → aprovação → regra → teste → ativação).

---

## 5. Novas entidades e dados necessários

Só onde não existe equivalente:

| Entidade | Por quê | Reaproveita |
|---|---|---|
| `users.theme` (coluna) | Tema salvo por usuário | `users` |
| `tasks.available_at` + status `agendada` | Etapa disponível só na data (req. 21) | `tasks`, marcos do ciclo |
| `stage_moves` | Movimento classificado: de/para, tipo, motivo, responsável antes/depois, impacto | complementa `activity_logs` |
| `notification_prefs` | Canal e prioridade por usuário e tipo | `notifications` |
| `push_subscriptions` | Push PWA | — |
| `channel_pins`, `channels.kind='grupo'` | Fixadas e grupos no chat | `channels`, `messages` |
| `messages.content_ref` | Conteúdo como objeto no chat | `messages` |
| `review_criteria`, `review_ai_assessments` | Critérios reais e treinamento da IA | `reviews` |
| `meeting_transcripts` | Transcrição e estado do processamento | `meetings`, `meeting_items` |
| `decisions` (com versões) | Memória de decisões | `meeting_items(kind='decisao')` vira origem |
| `automation_suggestions` | Radar de automações | `automations`, `activity_logs` |
| `costs` (fixos e recorrentes) | Custos, margem e rentabilidade | — |
| `goals` | Metas: meta, realizado, projeção, desvio | — |
| `billing_profiles` | E-mail de cobrança, valor, dia, recorrência e instruções por cliente | `contracts.due_day` já existe e será usado |
| `billing_events` | Histórico de lembrete, cobrança, atraso e pagamento, com status de envio | `invoices` |
| `email_templates`, `email_log` | Templates editáveis e registro de envio | `services/mail.js` |
| `payout_rates` (com vigência) | Valor por pessoa, função, tipo, serviço e cliente | — |
| `payout_demands` | Demanda apurável ligada à tarefa/conteúdo, com status de execução e motivo | `tasks`, `contents`, `adjustments` |
| `payout_runs` (cálculo diário) e `payout_closings` (fechamento congelado) | Apuração auditável, que não é recalculada em silêncio | — |
| `improvement_plans`, `management_notes` | Planos de melhoria e histórico de gestão (restrito) | — |

---

## 6. Integrações necessárias

| Integração | Estado | O que falta | Limitação real |
|---|---|---|---|
| **Banco permanente + rotina agendada** | Não existe | Decisão de hospedagem (seção 7) | Bloqueia cobrança, apuração, sincronização e e-mails |
| **E-mail (Resend)** | Código pronto | `RESEND_API_KEY`, `BOLD_MAIL_FROM` e domínio verificado | — |
| **Google Calendar** | OAuth e escrita prontos | `GOOGLE_CLIENT_ID/SECRET`; para receber mudanças do Google: *watch channel* (webhook público) ou consulta periódica | Recorrência e exceções precisam de mapeamento cuidadoso |
| **Google Meet + transcrição** | Não existe | Escopos `meetings.space.created`/`readonly` e `drive.readonly`; API Meet `conferenceRecords.transcripts` | Exige **Google Workspace com transcrição** (Business Standard ou superior) e transcrição ligada na reunião. O arquivo sai como Google Doc e leva minutos para ficar pronto. Por isso o estado "aguardando transcrição" e a consulta periódica |
| **Slack (sincronização)** | Só espelha avisos | App Slack com Events API (webhook público e persistente) e escopos `channels:history`, `groups:history`, `im:history`, `users:read`, `files:read` | **DMs** só com token de **cada usuário** (cada pessoa autoriza). Mensagens antigas exigem importação paginada com limite de taxa. Editar ou apagar no Slack chega por evento. Anexos ficam como referência |
| **Push (PWA)** | Não existe | Chaves VAPID, *service worker*, manifesto | iPhone só recebe com o app **instalado na tela inicial** (iOS 16.4+) |
| **Claude** | Gateway pronto | `ANTHROPIC_API_KEY` | Sem a chave, recursos de IA mostram "não configurado" |
| **Pagamentos (banco ou gateway)** | Não existe | Fora desta rodada | Confirmação **manual** ("Marcar como pago") até haver integração |

---

## 7. Conflitos e limitações (preciso de decisão)

1. **Hospedagem permanente (bloqueante para produção).** As opções:
   - **(A) Servidor Node contínuo com disco** (Railway, Render, Fly). Quase **nenhuma mudança de código**: o SQLite continua e o agendador roda sozinho. **Minha recomendação.**
   - **(B) Supabase Postgres.** Exige reescrever a camada de dados inteira (hoje síncrona) para assíncrona. É um projeto grande por si só.
   - **(C) Ficar só na Vercel.** Não serve para financeiro, cobrança ou apuração: os dados se perdem.
2. **Divisão: quem visualiza.** Antes você pediu que **toda a equipe** pudesse ver a Divisão. Agora o req. 18 pede que **visualizar** também seja restrito à CEO e a autorizados. Vale o novo?
3. **"Isa"** (req. 21): não há ninguém chamado Isa na equipe cadastrada (Rebeca, Vitória, Vivian, Raísa, Juliane, Monique, Felipe, Nicole, Léo, Matheus). É a **Raísa**?
4. **Logins dos clientes (req. 23):** só **1** cliente tem e-mail na ficha. Preciso da lista real de e-mails de acesso. Não vou inventar e-mails.
5. **Critérios de revisão (req. 19):** a estrutura será criada **vazia**, aguardando os critérios reais da Rebeca e da Raísa.
6. **Regras financeiras:** ficam como "regra pendente de configuração" até a CEO definir:
   - valor por pessoa/tipo;
   - quais status contam ou descontam;
   - dia do fechamento;
   - e-mail do relatório;
   - cobranças após o vencimento.
7. **Performance:** **0 tarefas concluídas** até hoje. Indicadores, comparações e score vão mostrar "dados insuficientes" até haver histórico real. Os pesos do score são configuráveis e começam vazios.
8. **Nome do chat:** recomendo **BOLD CHAT**. Diz o que é. "Talk" soa informal e "Space" é vago. O código já usa "THE BOLD CHAT" na ponte com o Slack.
9. **Vercel Hobby:** o plano gratuito permite *cron* **1 vez por dia**. Prazos, ativação de etapas e cobrança das 9h funcionam com 1×/dia. Avisos de prazo em menos de 24h precisam de frequência maior (opção A resolve).

---

## 8. Ordem ideal de implementação

Cada bloco preserva o que funciona e é testado antes do próximo.

| Bloco | Conteúdo | Depende de |
|---|---|---|
| **1** | Sistema visual (escala vinho) + tema claro/escuro salvo por usuário | — |
| **2** | Process Engine: etapa disponível na data (req. 21) + movimento manual classificado com impacto (req. 6) + endpoint de rotina agendada | — |
| **3** | Permissões novas (pendências da equipe, financeiro de repasses, recebimentos, performance) + Pendências Minhas/Equipe + Visão geral da equipe ("Você está aqui") | Bloco 2 |
| **4** | Ficha do cliente em abas + Calendário editorial + Feed (mesmos dados no portal) + comentário → ajuste + onboarding em cards | — |
| **5** | Visão geral CEO (central executiva) + Torre (investigação, causa raiz FATO/PADRÃO/HIPÓTESE) + previsão de capacidade | Blocos 2 e 3 |
| **6** | Página Equipe (operacional) + camada Performance (restrita, explicável, "dados insuficientes" quando faltar amostra) | Bloco 3 |
| **7** | NEGÓCIO: CRM + Financeiro + **Recebimentos com cobrança automática** + Custos + Metas + Rentabilidade | Hospedagem (7.1) e e-mail para envio real |
| **8** | **Produção & Repasses**: tabela de valores com vigência, demandas apuráveis, apuração diária, fechamento congelado, relatório e e-mail | Bloco 7 e decisões financeiras (7.6) |
| **9** | BOLD CHAT: fixar, buscar, grupos, conteúdo no chat, assistente com regra de encaminhamento + arquitetura de sincronização com o Slack | App Slack |
| **10** | Calendário Google nos dois sentidos + Meet e transcrição → resumo → `#resumo-reuniões` | Credenciais Google Workspace |
| **11** | Revisão inteligente: critérios, modo manual com motivo, modo IA em treinamento | Critérios reais (7.5) e chave Claude |
| **12** | Notificações: preferências, e-mail, push PWA | E-mail configurado e chaves VAPID |
| **13** | Brain: Memória de Decisões (com versões) + Radar de Automações; Planos de melhoria e Histórico de gestão (restritos) | Blocos 3 e 6 |

### Regras que valem para todos os blocos

- A plataforma é a fonte de verdade. **Regra determinística** decide status, prazos, permissões, tarefas, atribuições, notificações simples, sincronização, transições e **todo cálculo financeiro**.
- **IA** interpreta, resume, sugere e detecta. Nunca altera valor, estado crítico ou decisão sobre pessoas sem aprovação humana.
- Permissão sempre no backend, em cada consulta, agregação e exportação.
- Tudo com histórico; nada de dado fictício. Sem dado, a tela mostra o que falta configurar.
