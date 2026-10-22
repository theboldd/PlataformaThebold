# THE BOLD OS — Checklist oficial de conferência

## Revisão 4.4 · 22/10/2026 — ficha do cliente redesenhada e camada Notion → The Bold OS

| O que | Onde | Estado |
|---|---|---|
| **Ficha do cliente:** 4 grupos (Visão geral · Conteúdo · Relação · Gestão) com itens do grupo abaixo, em vez de 17 abas; no celular vira um menu de seleção agrupado. Visão geral: nome em destaque, status, 3 indicadores, PRÓXIMO PASSO, calendário editorial do mês (‹ mês anterior · mês · próximo ›, clique abre o conteúdo; CR Editorial do Notion marcado “Notion”), feed de aprovação (prévia + VER FEED), essência da marca e equipe compactas. Cronograma operacional saiu da visão principal → Gestão › Processo do mês. “Excluir cliente” foi para o menu ⋯ | Clientes → cliente | 🟢 |
| **Mapa completo do Notion** com estados SINCRONIZAÇÃO ATIVA · IMPORTADO, MAS NÃO SINCRONIZADO · PARCIAL · AGUARDANDO MAPEAMENTO · AGUARDANDO DECISÃO · DOCUMENTAÇÃO / CONSULTA · FORA DO ESCOPO · BLOQUEADO POR CONFIGURAÇÃO; para cada base: origem, ID, destino, entidade, campos mapeados e não mapeados, direção, frequência real, estado, última alteração, última sincronização, erro, observações. NOVEMBRO mostra a diferença 108 × 106; OUTUBRO, edição posterior à extração | Integrações → Notion | 🟢 |
| **Arquitetura Notion → The Bold OS:** webhook oficial (verificação + assinatura HMAC) ou polling por base (padrão 15 min, configurável), validação, deduplicação, mapeamento. Sem mapeamento: ALTERAÇÃO DETECTADA — AGUARDANDO MAPEAMENTO (guardada, nada criado). CR Editorial/calendários: espelho somente leitura; conteúdo vinculado nunca muda sozinho (CONFLITO); legado continua legado. Bases começam desligadas | Integrações → Notion | 🟡 Token configurado em produção (22/10) e leitura testada pela CEO com “Sincronizar agora”; rotina contínua aguarda hospedagem persistente e a decisão das bases |
| **The Bold OS → Notion:** desativado. O cliente HTTP só lê (GET de páginas e consulta de bases); qualquer escrita é recusada antes de sair (testado) | — | ⚪ por decisão |

**Arquitetura pronta ≠ sincronização operacional ativa.** ✅ NOTION_TOKEN configurado (integração interna “The Bold OS”, só leitura: atualizar/inserir conteúdo desmarcados) e conexão confirmada. ✅ Decisão de 22/10: CR EDITORIAL dos 20 clientes ligado (estado PARCIAL até haver hospedagem persistente; quadros, aprovações e Central continuam desligados). Falta: hospedagem persistente (BOLD_PERSISTENT_HOST=1).

---

## Revisão 4.3 · 22/10/2026 — data de publicação ≠ prazo, classificação em Processos, página PROCESSO do Notion

| O que | Onde | Estado |
|---|---|---|
| **Data de publicação é referência editorial, não prazo operacional.** Removida de: risco do conteúdo (“Data de publicação já passou”, “Publica em menos de N dias”), cálculo de prazo das etapas (antes o prazo era encurtado pela data), impacto ao mover etapa (“Publicação em risco”), severidade de pendências e bloqueios, escalada “publicação em risco”, impacto dos riscos da Torre (“Próxima publicação…”), sinal “Entregas” da saúde do cliente. A data continua no calendário editorial, no feed, na ficha e nos filtros | Torre · Pendências · Insights · Performance · Saúde · Notificações | 🟢 |
| **Operação até LIBERADO PARA PUBLICAÇÃO.** A etapa “Para agendamento” passa a se chamar “Liberado para publicação”, sem prazo; tarefas dessa etapa e das seguintes (agendado/publicado) ficam fora de atraso, pendência, capacidade, performance e gargalo. Publicação manual (Vivian), sem automação nem integração com Instagram/Meta | Process Engine · Processos · Torre | 🟢 |
| **Processos: classificação em destaque.** Coluna: nome da classificação grande com marca (◎ Estratégia, ◆ Design, ▶ Edição, ¶ Legenda, ✓ Revisão, ↺ Ajuste, ○ Aprovação, ■ Bloqueado, ↗ Publicação) + “N conteúdos”; card: classificação no topo; novo filtro “Classificação” com a contagem real. Classificação lida da raia da etapa e da função da trilha — nada recategorizado | Processos (Equipe e Etapas) | 🟢 |
| **Página PROCESSO do Notion** auditada (22/10 12:34): 12 subpáginas e bases com ID, destino, direção, campos mapeados e sem mapeamento, última alteração, última sincronização, erros e limitações; calendário do ciclo de novembro comparado com os marcos da plataforma (só comparação) | Notion & Histórico → Página PROCESSO | 🟡 PARCIAL |

**PROCESSO — honesto:** só OUTUBRO, NOVEMBRO e INÍCIO CLIENTE entraram (uma vez, por extração de 19/10). NOVEMBRO tem 108 cards hoje × 106 extraídos e OUTUBRO foi editado depois. Controle de Aprovações (23), Log de eventos (182), Central de Clientes (22) e Histórico de Eventos (190) não foram importados — aguardam decisão e nunca entram como aprovação, pendência ou fato. PADRÃO e as páginas de documentação são só consulta. Sem `NOTION_TOKEN` não há sincronização viva.

---

## Revisão 4.2 · 22/10/2026 — ficha do conteúdo, aprovações separadas, vínculo com o CR Editorial e feed

| O que | Onde | Estado |
|---|---|---|
| **Ficha do conteúdo:** data, tipo, estratégia, objetivo, referência; responsáveis por função (geral, estrategista, copywriter, designer, editor de vídeo, aprovador) | Conteúdo → Ficha (topo da página) | 🟢 |
| **Etapas de aprovação separadas:** tema, texto/roteiro, legenda, arte, revisão interna e aprovação formal do cliente. “Pedir ajuste” exige nota; alteração depois de aprovado volta para ajuste e a nova versão passa por nova aprovação. Checks do Notion aparecem como informativos e nunca valem como aprovação | Conteúdo → Ficha → Etapas de aprovação | 🟢 |
| **Corpo por formato:** Carrossel = capa + cards; Reels = roteiro; Estático/Foto = briefing; + referências e bloco livre, na ordem, com edição | Conteúdo → Ficha → Corpo do conteúdo | 🟢 |
| **Vincular card do CR Editorial:** clicar no card “Notion” abre as propriedades reais e propõe o conteúdo do mesmo formato no mês; “Vincular” copia tema, data, objetivo, referência, estratégia e legenda; guarda os valores anteriores; “desvincular” (com motivo) restaura | Cliente → Calendário editorial → card Notion | 🟢 |
| **VER FEED PARA APROVAÇÃO:** grade ou um por um, com mídia, legenda, comentários, versão e ação, usando os mesmos registros | Cliente → Calendário editorial | 🟢 |
| Portal do cliente | Só vê a etapa “cliente”, versões e comentários marcados “cliente vê” — nada interno | 🟢 |

**Campos sem mapeamento / pendências (honesto):**
- 🔵 **Corpo do card do Notion** (CAPA, CARD 2…6, links do Pinterest): a extração de 21/10 não trouxe o corpo das páginas → “AGUARDANDO SINCRONIZAÇÃO COM O NOTION”. Depende do `NOTION_TOKEN`.
- ⚪ **Pessoas do Notion** (👤 Responsável Geral, Estrategista, Copywriter, Designer, Editor de Vídeo) vêm como IDs do Notion → “aguardando mapeamento” para usuários da plataforma.
- 🟡 **Tipo** está vazio na maioria dos cards do CR: o formato é proposto pelo prefixo do título (“proposta — confira”).
- 🟡 **“Responsável pela aprovação” e aprovação de texto** não existem no schema do CR Editorial: são campos só da plataforma.
- ⚪ Sincronização viva aguarda as 4 decisões (mapa, write-back, token, hospedagem persistente). Nenhum vínculo foi feito na base real — só na cópia de auditoria.

---

## Revisão 4.1 · 22/10/2026 — calendário editorial como no Notion, agenda com permissão e demandas por pessoa

| O que | Onde | Estado |
|---|---|---|
| **Calendário editorial igual ao do Notion:** mês de domingo a sábado, um cartão por post com o formato no título (CARROSSEL, ÚNICO, REELS), marcas (ENVIAR MATERIAL…) e checks APROVAÇÃO ARTE / LEGENDA / TEMA. Marcados só com registro: tema = aprovação de tema; arte e legenda = versão aprovada pelo cliente | Cliente → Calendário editorial (visão padrão “Calendário”) | 🟢 |
| CR Editorial do Notion no mesmo calendário, marcado “Notion” e somente leitura, com as marcações reais de lá; “+” em cada dia cria conteúdo com a data; arrastar um cartão (ou um “sem data”) muda a data e registra no histórico | Cliente → Calendário editorial | 🟢 |
| **Agenda com permissão:** a equipe só visualiza o Calendário. Criar evento, compromisso ou tarefa exige a permissão “Agenda”, que só a CEO concede. Ao criar: “Toda a equipe” ou “Selecionar pessoas” uma a uma. Só os escolhidos veem e são avisados; tarefa vira uma tarefa real por pessoa; cancelar exige motivo | Calendário → “Novo evento, compromisso ou tarefa” · Usuários → permissões | 🟢 |
| **Adicionar demanda por pessoa:** pessoa, função, cliente, quantidade, valor unitário (ou a regra cadastrada), situação e motivo. Remover só com motivo; nada é apagado | Negócio → Produção & Repasses → “+ Adicionar demanda” | 🟢 |
| Cartões de Riscos & gargalos em tons pastel (rosado, pêssego, manteiga, lavanda, azul), no claro e no escuro | Torre → Riscos & gargalos | 🟢 |

**⚪ Precisa de decisão.** Hoje, para a Gabriela (e os demais), existem duas fontes:
- **CR Editorial (Notion):** os 13 posts de novembro, com tema, data e marcações.
- **Quadro de processo da plataforma:** 12 conteúdos “tema a definir”, sem data.

O calendário mostra as duas, separadas. A decisão é se os temas e datas do CR Editorial passam a alimentar os conteúdos da plataforma: copiar como dado da plataforma ou vincular um a um. Até lá, o CR Editorial continua somente leitura (regra 15).

**Para liberar a Agenda a alguém:** Usuários e permissões → a pessoa → permissão “Agenda” (criar).

---

## Revisão 4 · 22/10/2026 — CRM + Financeiro viram NEGÓCIO e o que estava “em desenvolvimento” foi construído

**Negócio (uma página só, item “Negócio” no menu).** Abas: Pipeline (CRM) · Recebimentos · Produção & Repasses · Custos · Metas · Rentabilidade · Configuração. Os endereços antigos `/crm` e `/financeiro` redirecionam para cá.

| Área | Entregue agora | Estado com a base atual |
|---|---|---|
| Recebimentos | Seis indicadores: receber hoje, a receber, atrasados, recebidos no mês, total recebido, total em aberto. Status por parcela: a vencer, lembrete enviado, vencendo hoje, pagamento confirmado, atrasado, cobrança enviada, em negociação, cancelado. Calendário de recebimentos (45 dias). Cobrança por cliente (e-mail, dia, recorrência, pausar). Marcar como pago (quem, quando, valor, competência), em negociação, cancelar com motivo, reenviar cobrança. Histórico de cobranças. Rotina diária: lembrete D-1, cobrança D0 e D+N só se a CEO definir a quantidade (idempotente) | 🔵 Dados insuficientes (nenhum contrato) · e-mail aguardando Resend · cobranças após vencimento aguardando decisão |
| Produção & Repasses | Permissão própria (só a CEO concede: ver / editar / aprovar). Apuração por competência só com trabalho da plataforma e sem cliente interno. Status de execução e motivos: material do cliente nunca é falha do profissional; prazo vencido não gera desconto. Valores por pessoa / função / tipo / cliente com vigência (a regra mais específica vale; valor novo não muda o histórico). Ajustes com motivo (revogáveis, nunca apagados). Fechamento Rascunho → Em revisão → Aguardando aprovação → Aprovado → Fechado → Reaberto (com motivo): fechar exige aprovação e regra para tudo e congela a apuração. Relatório por e-mail. Apuração diária. “Por que não executou” | 🔵 Regra financeira pendente de configuração (nenhum valor cadastrado) · dia de fechamento aguardando decisão |
| Custos | Únicos ou recorrentes, por categoria, da agência ou diretos de um cliente; desativar sem apagar | 🔵 Nenhum custo cadastrado |
| Metas | Faturado, recebido, novos clientes e margem: meta, realizado, projeção, desvio | ⚪ Aguardando decisão (sem metas) |
| Rentabilidade | Receita, custos, repasses e margem da agência e por cliente; ajustes e custo de retrabalho; evolução de 6 meses. Valores de repasse escondidos de quem não tem a permissão | Dados insuficientes |
| Configuração financeira | Régua de cobrança, textos editáveis dos e-mails, assinatura, dia de fechamento, e-mail do relatório e motivos que entram na apuração. Toda mudança vai para o histórico | ⚪ Valores aguardando decisão da CEO |
| The Bold Brain | **Memória de Decisões**: rascunho → sugerida → confirmada → revogada/substituída, com versões, sem exclusão; decisões confirmadas de reunião entram sozinhas. **Radar de Automações**: padrões manuais repetidos (≥ 5 em 30 dias) viram sugestão; aprovar só registra, nunca cria automação | 🟢 Ativo (dados insuficientes até haver uso) |
| Notificações | Preferências por pessoa em Perfil → Notificações: plataforma e e-mail por categoria, e agrupar. Urgente sempre chega | 🟢 Plataforma ativa · e-mail aguardando Resend · push em desenvolvimento |
| Conteúdo | Faixa **AGORA → VOCÊ → THE BOLD → DEPOIS** na página do conteúdo | 🟢 |
| Portal | Progresso do ciclo (agendados ou publicados sobre o total) | 🟢 com ciclo da plataforma |
| Performance | **Previsão da próxima semana**: demanda × capacidade configurada. Só alerta, nunca redistribui | Dados insuficientes |
| Perfil (celular) | Corrigido: o avatar ocupava a tela inteira (o estilo do login vazava) | 🟢 |

**Continua sem construir.** Depende de serviço externo ou de decisão:
- videochamada própria (LiveKit);
- Central de Arquivos do Google Drive (Workspace × Gmail);
- sincronização do Slack e do Google Calendar nos dois sentidos;
- chat com IA, revisão por IA e previsão de atraso por IA (precisam do Claude e, na revisão, dos critérios);
- push no celular;
- criação automática do ciclo mensal (V2).

Todos aparecem na tela com o estado correspondente.

**Para revisar nesta rodada:**
1. **Negócio:** as 7 abas. Em Recebimentos, as 4 visões. Em Produção & Repasses, as 7 visões, “Cadastrar valor” e “Iniciar fechamento”. Depois Custos (“Cadastrar custo”), Metas (“Definir meta”) e Configuração.
2. **The Bold Brain:** abas Memória de Decisões (criar → confirmar → editar gera versão) e Radar.
3. **Perfil:** Notificações; no celular, o cabeçalho.
4. **Um conteúdo:** a faixa AGORA → VOCÊ → THE BOLD → DEPOIS.
5. **Equipe · Performance:** a previsão da próxima semana.

> A prévia é descartável: valores, custos e decisões cadastrados nela se perdem quando ela reinicia.

---

## Revisão 3.1 · 22/10/2026 — as duas versões combinadas

A revisão 3 foi feita em paralelo por duas conversas. Esta revisão junta as duas, sem perder nada de nenhuma. Base: a versão publicada (`6f757bf`).

**O que entrou além da revisão 3**

| Tela | O que entrou |
|---|---|
| **Mapa do produto** (`/mapa`, novo) | 160 itens definidos, cada um com tela, estado e o que falta. Aba "O que revisar agora". O estado de cada item vem de `web/src/lib/productMap.js` e sai também neste documento (`node scripts/product-map-md.mjs`) |
| **Integrações** | Estado real de cada conexão, vindo do servidor (`/api/status/integrations`): Google Calendar e Meet, Drive, Slack, Meta, e-mail, Claude, Notion, Obsidian, hospedagem, Railway, agendador e endereço público. Mostra o que falta (só nomes de variáveis), onde é usada e do que depende |
| **Automações** | Estado de cada automação, última e próxima execução, último erro e dependência. Aviso do agendador e últimas rotinas. No celular, a tabela vira cartões |
| **Financeiro** | Atraso calculado pela data, igual ao das Pendências (antes dependia do agendador). Cobrança e histórico de recebimentos. Demandas concluídas por pessoa no mês, sem valor. Rentabilidade por cliente com evolução de 6 meses. Metas: AGUARDANDO DECISÃO |
| **Equipe & Performance** | Reaberturas, devoluções e bloqueios por pessoa, contexto dos atrasos, histórico recente, tendência (só com dado suficiente). Mínimo provisório de 20 eventos válidos (`performance_min_eventos`) |
| **Notion & Histórico** | Números da migração (Client Brain, onboarding, histórico, legados, origem), fontes importadas e não importadas com o motivo, visão por cliente com link do Notion |
| **Torre** | Seção Dependências: bloqueios por quem precisa agir e o que aguarda decisão do cliente |
| **Bold Chat** | Caixa de Menções (chat e comentários de conteúdo) |
| **Ficha do cliente** | Aba Comunicação. As abas quebram linha em vez de ficar escondidas |
| **Pendências** | Ao abrir uma pendência: o que aconteceu → por que está parado → quem precisa agir → o que fazer → até quando |
| **Visão geral** | Blocos Financeiro, Capacidade e Minhas pendências na própria tela |
| **Menu** | Todos os módulos, com rolagem visível. Itens Mapa do produto e Meu perfil |
| **Saúde do cliente, relatório, Torre** | O atraso de pagamento passou a ser calculado pela data |
| **Portal no celular** | Corrigida a sobreposição do selo com a data nos blocos do feed |

**Observações**
- **Mínimo de eventos para medir performance:** provisório em 20 por período. A decisão final é da CEO.
- **Reprogramações por pessoa:** o processo não registra mudança de prazo de tarefa, então a tela mostra "—" com o motivo.
- **`reuniao.transcricao_detectada`:** roda pelo agendador e depende do Google. Aparece como AGUARDANDO INTEGRAÇÃO.
- **Relatório semanal:** usa a hora do servidor (UTC). "Segunda 08h" pode não ser o horário de São Paulo.

### Mapa do produto — estado atual por categoria

| Estado | Itens |
|---|---|
| 🟢 ENTREGUE E VISÍVEL | 111 |
| 🟡 VISÍVEL, MAS PARCIAL | 10 |
| 🟠 EXISTE NO CÓDIGO, MAS NÃO ESTÁ VISÍVEL | 0 |
| 🔵 AGUARDANDO CONFIGURAÇÃO | 21 |
| 🔴 NÃO IMPLEMENTADO | 10 |
| ⚪ PRECISA DE DECISÃO | 8 |
| Sem dados na base real (mostram DADOS INSUFICIENTES) | 15 |

### 🟢 ENTREGUE E VISÍVEL

| Requisito | Tela | O que falta |
|---|---|---|
| **Visão geral** — Indicadores executivos (clientes em risco, pendências críticas, em produção, aguardando cliente) | Visão geral · topo (`/`) | — |
| **Visão geral** — Precisa da sua atenção (impacto, responsável, onde, abrir pendência) | Visão geral (`/`) | — |
| **Visão geral** — Próximos compromissos da plataforma | Visão geral · coluna direita (`/`) | — |
| **Visão geral** — Operação: onde o trabalho está, por etapa | Visão geral · Operação (`/`) | — |
| **Visão geral** — Inteligência (fato, padrão, hipótese, recomendação) | Visão geral · Inteligência (`/`) | — |
| **Visão geral** — Financeiro (receita recorrente, recebido, em aberto, em atraso) *(sem dados na base real)* | Visão geral · Financeiro (`/`) | Base real sem contratos: mostra DADOS INSUFICIENTES |
| **Visão geral** — Capacidade (tarefas da plataforma × capacidade configurada) *(sem dados na base real)* | Visão geral · Capacidade (`/`) | Capacidade é configurada, não medida |
| **Visão geral** — Minhas pendências | Visão geral · Minhas pendências (`/`) | — |
| **Visão geral** — O que os dados ainda não permitem afirmar | Visão geral · faixa abaixo do estado (`/`) | — |
| **Visão geral** — Período (hoje, 7 dias, 30 dias, personalizado) | Visão geral · topo (`/`) | — |
| **Torre de Controle** — Estado da operação | Torre · topo (`/torre`) | — |
| **Torre de Controle** — Riscos, gargalos e bloqueios | Torre · Riscos & gargalos (`/torre`) | — |
| **Torre de Controle** — Mapa da operação (etapas do Process Engine) | Torre · Mapa da operação (`/torre`) | — |
| **Torre de Controle** — Pessoas: capacidade, carga, herdadas, atrasadas, próximos 7 dias | Torre · Capacidade da equipe (`/torre`) | — |
| **Torre de Controle** — Concentração, sobrecarga e subutilização | Torre · Capacidade da equipe (`/torre`) | — |
| **Torre de Controle** — Clientes & saúde da operação | Torre · Clientes (`/torre`) | — |
| **Torre de Controle** — Itens sem responsável | Torre · Responsabilidades (`/torre`) | — |
| **Torre de Controle** — Período e comparação *(sem dados na base real)* | Torre · Desempenho do período (`/torre`) | Comparação só quando há histórico |
| **Torre de Controle** — Detalhamento e filtros (cliente, responsável, etapa, formato, status, tipo, origem) | Torre · Detalhamento (`/torre`) | — |
| **Torre de Controle** — Prazos | Torre · Detalhamento (`/torre`) | — |
| **Pendências** — Minhas / Equipe | Pendências · abas (`/pendencias`) | Equipe depende da permissão "pendencias" |
| **Pendências** — Prioridade (crítica, alta, média, baixa) | Pendências (`/pendencias`) | — |
| **Pendências** — Causa, responsável (quem age), cliente, processo | Pendências · filtros e cartões (`/pendencias`) | — |
| **Pendências** — Impacto e próxima ação | Pendências · cartões e detalhe (`/pendencias`) | — |
| **Pendências** — Leitura: o que aconteceu → por que está parado → quem age → o que fazer → até quando | Pendências · abrir uma pendência (`/pendencias`) | — |
| **Pendências** — Origem e histórico (atividades relacionadas, comentários) | Pendências · detalhe (`/pendencias`) | — |
| **Pendências** — Criar tarefa a partir da pendência | Pendências · detalhe (`/pendencias`) | — |
| **Pendências** — Dado migrado não gera pendência (regra 23) | Pendências (`/pendencias`) | — |
| **Clientes** — Carteira e onboarding geral | Clientes · Carteira / Onboarding (`/clientes`) | — |
| **Clientes** — Visão geral do cliente (status, risco, próximos passos) | Cliente · Visão geral (`/clientes`) | — |
| **Clientes** — Onboarding (formulário, migrado parcial, cards por seção) | Cliente · Onboarding (`/clientes`) | — |
| **Clientes** — Calendário editorial e conteúdos (fases, mês, feed, histórico do Notion) | Cliente · Calendário editorial (`/clientes`) | — |
| **Clientes** — Reuniões do cliente | Cliente · Reuniões (`/clientes`) | — |
| **Clientes** — Comunicação do cliente | Cliente · Comunicação (`/clientes`) | — |
| **Clientes** — Pendências do cliente | Cliente · Pendências (`/clientes`) | — |
| **Clientes** — Solicitações e decisões | Cliente · Solicitações / Decisões (`/clientes`) | — |
| **Clientes** — Marca & Pulso | Cliente · Marca & Pulso (`/clientes`) | — |
| **Clientes** — Saúde do cliente (interno) | Cliente · Saúde (`/clientes`) | — |
| **Clientes** — Arquivos, equipe, financeiro e histórico do cliente | Cliente · abas (todas visíveis, sem rolagem escondida) (`/clientes`) | — |
| **Clientes** — Origem dos dados (selo Migrado do Notion, link do Notion) | Cliente · Ficha e Notion & Histórico (`/notion`) | — |
| **Área do cliente (portal)** — Meu Momento Bold: saudação, onde estamos, progresso | Portal · Início | Ver com um login de cliente |
| **Área do cliente (portal)** — O que preciso fazer (com prazo e consequência) | Portal · Início / Decisões | — |
| **Área do cliente (portal)** — The Bold está cuidando · próximo passo (Depois) | Portal · Início | — |
| **Área do cliente (portal)** — O que está acontecendo (timeline / histórico) | Portal · Início e Histórico | — |
| **Área do cliente (portal)** — Calendário e conteúdos (prévia do feed, um por um) | Portal · Calendário / Conteúdos | — |
| **Área do cliente (portal)** — Aprovação por coração (com confirmação, por versão) | Portal · Conteúdos | — |
| **Área do cliente (portal)** — Comentários, perguntas e ajustes estruturados (página, ponto na imagem, timestamp) | Portal · Conteúdos | — |
| **Área do cliente (portal)** — Versões (V1 substituída, V2 atual) | Portal · Conteúdos | — |
| **Área do cliente (portal)** — Solicitações · pedir algo à The Bold | Portal · Solicitações e botão "Nova solicitação" | — |
| **Área do cliente (portal)** — Central de decisões | Portal · Decisões | — |
| **Área do cliente (portal)** — Mensagens com a equipe (com conteúdo anexado) | Portal · Mensagens | — |
| **Área do cliente (portal)** — Reuniões: pauta, resumo publicado, reserva mensal (pós-reunião) | Portal · Reuniões | — |
| **Área do cliente (portal)** — Feedback contextual ("Como foi essa etapa?") | Portal · Início | — |
| **Conteúdos** — Lista, novo conteúdo e página do conteúdo | Conteúdos (`/conteudos`) | — |
| **Conteúdos** — Produção, revisão interna (Sala de Revisão) e ajustes | Conteúdos / Sala de Revisão (`/revisao`) | — |
| **Conteúdos** — Aprovação registrada (regras 14 e 18) | Conteúdo · Aprovações | — |
| **Conteúdos** — Versões V1/V2/V3 e comparação (legenda palavra a palavra) | Conteúdo · Comparar versões | — |
| **Conteúdos** — Comentários internos e visíveis ao cliente, menções | Conteúdo · Comentários | — |
| **Conteúdos** — Legenda | Conteúdo · Legenda | — |
| **Conteúdos** — Materiais e pedir material ao cliente | Conteúdo · Ações | — |
| **Conteúdos** — Agendamento | Conteúdo · Agendar | — |
| **Conteúdos** — Histórico do conteúdo | Conteúdo · Histórico | — |
| **Process Engine** — Quadro de processos (kanban) | Processos (`/processos`) | Estava fora do ar (erro 500) — corrigido nesta etapa |
| **Process Engine** — Etapas, status, responsáveis por função e prazos | Processos / Conteúdo (`/processos`) | — |
| **Process Engine** — Janelas e "pronto ≠ disponível" (regra 20) | Sala de Revisão / Conteúdo (`/revisao`) | — |
| **Process Engine** — Mover etapa com motivo e impacto | Processos (arrastar) / Conteúdo · Mover etapa (`/processos`) | — |
| **Process Engine** — Exceção (bloquear, cancelar) | Conteúdo · Ações | — |
| **Process Engine** — Regras do processo | Automações · Regras do processo (`/automacoes`) | — |
| **Calendário** — Mês, semana, dia, agenda; conteúdos, prazos, ciclos e reuniões | Calendário (`/calendario`) | — |
| **Reuniões** — Agenda, reuniões, pauta e ata *(sem dados na base real)* | Reuniões (`/reunioes`) | — |
| **Reuniões** — Decisões, tarefas e responsáveis gerados pela reunião | Reuniões · reunião aberta | — |
| **Reuniões** — Transcrição colada à mão | Reuniões · Pós-reunião | — |
| **Reuniões** — Resumo interno e resumo do cliente (com bloqueio de vazamento) | Reuniões · Pós-reunião | — |
| **Reuniões** — Reunião alimenta o Client Brain | Reuniões · Transformar em registros | — |
| **Reuniões** — Sala de horários para o cliente reservar | Reuniões · Sala de horários | — |
| **Bold Chat** — Canais, diretas e conversas oficiais com clientes *(sem dados na base real)* | Bold Chat (`/comunicacao`) | — |
| **Bold Chat** — Menções (caixa própria) | Bold Chat · Menções (`/comunicacao?ver=mencoes`) | — |
| **Bold Chat** — Threads e conteúdo relacionado à conversa | Bold Chat | — |
| **Bold Chat** — Transformar mensagem em tarefa, pendência, ajuste ou evento | Bold Chat · Transformar em… | — |
| **CRM** — Pipeline, etapas, negócios, responsável e próxima ação *(sem dados na base real)* | CRM (`/crm`) | — |
| **CRM** — Follow-ups vencidos | CRM (`/crm`) | — |
| **CRM** — Fechamento → cliente + onboarding | CRM · Fechado | — |
| **Financeiro** — Recebimentos: contratos, parcelas, vencimentos, pagamentos *(sem dados na base real)* | Financeiro · Recebimentos (`/financeiro`) | — |
| **Financeiro** — Atraso calculado na hora (mesmo sem o agendador) | Financeiro · Recebimentos (`/financeiro`) | — |
| **Financeiro** — Cobrança: lista de atrasos e quem age | Financeiro · Recebimentos (`/financeiro`) | — |
| **Financeiro** — Histórico de recebimentos *(sem dados na base real)* | Financeiro · Recebimentos (`/financeiro`) | — |
| **Financeiro** — Rentabilidade: receita e retrabalho por cliente *(sem dados na base real)* | Financeiro · Rentabilidade (`/financeiro?aba=rentabilidade`) | — |
| **Equipe & Performance** — Tela por pessoa com período (7/30/90 dias) | Equipe & Performance (`/performance`) | — |
| **Equipe & Performance** — Eventos válidos e aviso DADOS INSUFICIENTES PARA MEDIR PERFORMANCE *(sem dados na base real)* | Equipe & Performance · topo (`/performance`) | — |
| **Equipe & Performance** — Entregas, no prazo, com atraso, atrasadas abertas *(sem dados na base real)* | Equipe & Performance (`/performance`) | — |
| **Equipe & Performance** — Reaberturas, devoluções e bloqueios por pessoa *(sem dados na base real)* | Equipe & Performance (`/performance`) | — |
| **Equipe & Performance** — Capacidade configurada (não medida) e tendência *(sem dados na base real)* | Equipe & Performance (`/performance`) | Tendência só aparece com dados suficientes e período comparável |
| **Equipe & Performance** — Contexto dos atrasos | Equipe & Performance (`/performance`) | — |
| **The Bold Brain** — Interface: pergunta, agentes, escopo por cliente, sugestões, histórico | The Bold Brain (`/brain`) | — |
| **The Bold Brain** — Recomendações sem IA (regras fixas) | Insights / Torre (`/insights`) | — |
| **Insights** — Fatos, padrões observados, hipóteses, recomendações, tendências, evidência *(sem dados na base real)* | Insights (`/insights`) | — |
| **Insights** — Aplicar, descartar, resolvidos sozinhos; rodar detectores | Insights (`/insights`) | — |
| **Notion & Histórico** — Tela única da migração (números, fontes, por cliente) | Notion & Histórico (`/notion`) | — |
| **Notion & Histórico** — Client Brain e onboarding migrados, com origem e link | Notion & Histórico / Cliente · Ficha (`/notion`) | — |
| **Notion & Histórico** — CR Editorial e calendários históricos (somente leitura) | Notion & Histórico / Cliente · Calendário editorial (`/notion`) | — |
| **Notion & Histórico** — Itens legados e revisão de atrasos (um a um) | Itens legados (`/atrasos`) | — |
| **Notion & Histórico** — Decisões da migração (pontos de revisão) | Notion & Histórico / Configurações (`/migracao`) | — |
| **Automações** — Mapa de automações com estado, última e próxima execução, erro e dependência | Automações (`/automacoes`) | — |
| **Automações** — Execuções e regras do processo *(sem dados na base real)* | Automações · abas (`/automacoes`) | — |
| **Integrações** — Painel com estado de cada integração (conectada, não conectada, aguardando, erro) | Integrações (`/integracoes`) | — |
| **Integrações** — Notion (importação somente leitura) | Integrações / Notion & Histórico (`/notion`) | — |
| **Configurações** — Tela única de configurações | Configurações (`/configuracoes`) | — |
| **Configurações** — Usuários, perfis (funções), exceções e acessos dos clientes | Usuários e permissões (`/usuarios`) | — |
| **Configurações** — Notificações na plataforma | Sino | — |
| **Configurações** — Perfil (dados, aparência, senha) | Meu perfil (`/perfil`) | — |
| **Mobile** — Todas as telas abrem no celular, sem rolagem lateral da página | Todas | — |

### 🟡 VISÍVEL, MAS PARCIAL

| Requisito | Tela | O que falta |
|---|---|---|
| **Visão geral** — Gargalos | Visão geral · Operação (`/torre`) | Na home só as barras por etapa; o detalhe fica na Torre |
| **Torre de Controle** — Dependências (bloqueios por quem precisa agir, aguardando decisão do cliente) | Torre · Dependências (`/torre`) | Dependência entre tarefas ainda não é registrada pelo processo |
| **Torre de Controle** — Inteligência e causa raiz (fato · padrão · hipótese não verificada · recomendação) | Torre · Inteligência (`/torre`) | Sem análise de causa raiz por item; hipótese nunca aponta culpado |
| **Clientes** — Client Brain com origem separada | Cliente · Ficha / Resumo do Brain (`/clientes`) | Dois formatos (14 e 22 seções) ainda não unificados |
| **Área do cliente (portal)** — Notificações inteligentes | Portal · sino | E-mail aguarda Resend; sem preferências por pessoa |
| **Conteúdos** — Timestamp do vídeo e região na imagem | Conteúdo / Portal | Hoje só o cliente marca timestamp e região |
| **Process Engine** — Reabertura e correção | Conteúdo · Mover etapa / nova versão | Sem botão "Reabrir" explícito |
| **Financeiro** — Produção & Repasses: estrutura e demandas concluídas por pessoa | Financeiro · Produção & Repasses (`/financeiro?aba=producao`) | Valores de repasse dependem das regras |
| **Mobile** — Tabelas administrativas (Usuários) no celular | Usuários (`/usuarios`) | Tabela larga com rolagem lateral |
| **Mobile** — Torre e Histórico no celular | Torre / Histórico (`/torre`) | Páginas muito longas |

### 🟠 EXISTE NO CÓDIGO, MAS NÃO ESTÁ VISÍVEL

Nenhum item.

### 🔵 AGUARDANDO CONFIGURAÇÃO

| Requisito | Tela | O que falta |
|---|---|---|
| **Visão geral** — Compromissos da agenda Google | Visão geral · coluna direita (`/integracoes`) | Conectar o Google Calendar |
| **Área do cliente (portal)** — Acesso real dos clientes (convites) | Usuários · Acessos dos clientes (`/usuarios`) | E-mail (Resend) e e-mails dos 22 clientes sem acesso |
| **Conteúdos** — Publicação automática no Instagram | Conteúdo (`/integracoes`) | App da Meta |
| **Process Engine** — Avisos por horário (prazo próximo, etapa disponível, processo parado) | Automações (`/automacoes`) | Agendador: CRON_SECRET + hospedagem persistente |
| **Calendário** — Google Calendar no calendário | Calendário · aviso no topo (`/integracoes`) | Conectar o Google |
| **Reuniões** — Evento no Google Calendar e link do Google Meet | Reuniões · avisos no topo (`/integracoes`) | Conectar o Google |
| **Reuniões** — Detecção automática de transcrição | Reuniões (`/integracoes`) | Google |
| **Reuniões** — Resumo e extração por IA | Reuniões · Gerar resumos com IA (`/integracoes`) | ANTHROPIC_API_KEY |
| **Bold Chat** — Slack (envio de avisos) | Bold Chat / Integrações (`/integracoes`) | OAuth do Slack |
| **CRM** — Follow-up automático (vira tarefa) | Automações (`/automacoes`) | Agendador |
| **Financeiro** — Régua de cobrança automática | Financeiro · Recebimentos (`/financeiro`) | Agendador |
| **The Bold Brain** — Respostas, explicação de insights, análise de clientes/operação/gargalos | The Bold Brain (`/integracoes`) | ANTHROPIC_API_KEY |
| **Insights** — Narrativa por IA | Insights (`/integracoes`) | ANTHROPIC_API_KEY |
| **Insights** — Detecção periódica (a cada 15 min) | Automações (`/automacoes`) | Agendador; hoje roda ao abrir Torre/Visão geral |
| **Automações** — Rotinas por horário (prazos, cobrança, relatório, saúde) | Automações · aviso do agendador (`/automacoes`) | CRON_SECRET + hospedagem |
| **Integrações** — Google Calendar e Google Meet | Integrações (`/integracoes`) | OAuth do Google |
| **Integrações** — Slack | Integrações (`/integracoes`) | OAuth do Slack |
| **Integrações** — Meta / Instagram | Integrações (`/integracoes`) | App da Meta + PUBLIC_BASE_URL |
| **Integrações** — E-mail (Resend) | Integrações (`/integracoes`) | RESEND_API_KEY + BOLD_MAIL_FROM com domínio verificado |
| **Integrações** — Anthropic / Claude | Integrações (`/integracoes`) | ANTHROPIC_API_KEY |
| **Configurações** — Domínio próprio | Configurações · Infraestrutura (`/configuracoes`) | Configurar |

### 🔴 NÃO IMPLEMENTADO

| Requisito | Tela | O que falta |
|---|---|---|
| **Conteúdos** — Arrastar conteúdo no calendário para mudar a data | Calendário (`/calendario`) | Construir |
| **Reuniões** — Videochamada nativa | Reuniões · Sala de reunião | Especificada (V2), não construída |
| **Bold Chat** — Espelhamento automático para o Slack | Integrações (`/integracoes`) | Construir |
| **Equipe & Performance** — Reprogramações por pessoa | Equipe & Performance (`/performance`) | O processo ainda não registra mudança de prazo (tarefa.prazo_alterado): aparece "—" com o motivo |
| **Equipe & Performance** — Registro auditável de eventos válidos (perfEvents) e capacidade medida | — | Bloco 6 |
| **The Bold Brain** — Previsão de atraso e feedback recorrente → Brain | — | Construir |
| **Automações** — 6 automações do catálogo (brain.feedback, ciclo.criar, drive.material, estoque.videos, previsao.atraso, slack.espelhar) | Automações (`/automacoes`) | Construir |
| **Integrações** — Google Drive | Integrações (`/integracoes`) | Especificado (docs/integracoes/google-drive.md); aguarda definição Workspace × Gmail |
| **Configurações** — Preferências de notificação por pessoa | Configurações (`/configuracoes`) | Construir |
| **Configurações** — Backup automático com restauração testada | Configurações · Infraestrutura (`/configuracoes`) | Construir com a hospedagem |

### ⚪ PRECISA DE DECISÃO

| Requisito | Tela | O que falta |
|---|---|---|
| **Clientes** — Status dos 23 clientes "a confirmar" | Clientes (`/clientes`) | A CEO definir o status real de cada cliente |
| **Financeiro** — Regras de repasse (valor, competência, fechamento) | Financeiro · Produção & Repasses (`/financeiro?aba=producao`) | A CEO definir |
| **Financeiro** — Custos, repasses e margem por cliente | Financeiro · Rentabilidade (`/financeiro?aba=rentabilidade`) | Sem regra de custo/repasse; margem não é calculada |
| **Equipe & Performance** — Mínimo de eventos válidos para medir performance | Equipe & Performance · topo (`/performance`) | Provisório: 20 por período (configuração performance_min_eventos). A CEO definir |
| **Equipe & Performance** — Score e ranking | — | Fora do escopo por decisão; não exibido |
| **Notion & Histórico** — Ocear — Cronograma editorial | Notion & Histórico · Fontes (`/notion`) | Importar como histórico, trazer para o calendário ou deixar fora |
| **Notion & Histórico** — Sincronização com o Notion | Notion & Histórico (`/notion`) | Nenhuma, por decisão (somente leitura) |
| **Integrações** — Hospedagem persistente (Railway) | Integrações / Configurações (`/configuracoes`) | Aprovar o plano de docs/08 |

## O QUE VOCÊ DEVE REVISAR MANUALMENTE AGORA

Na ordem de navegação. O mesmo roteiro está na plataforma em **Sistema → Mapa do produto → O que revisar agora**.

**1. Visão geral** (`/`)
- [ ] Os 4 indicadores levam a algo ao clicar
- [ ] Precisa da sua atenção abre a pendência certa
- [ ] Os blocos Financeiro, Capacidade e Minhas pendências aparecem (com DADOS INSUFICIENTES se não houver dado)
- [ ] A faixa "o que os dados ainda não permitem afirmar" faz sentido

**2. Torre de Controle** (`/torre`)
- [ ] A ordem estado → riscos → operação → pessoas → clientes → dependências → período → inteligência → detalhamento
- [ ] Filtros (inclusive "Origem")
- [ ] A nova seção Dependências
- [ ] Capacidade marcada como configurada, não medida

**3. Pendências** (`/pendencias`)
- [ ] Minhas × Equipe
- [ ] Abrir uma pendência: a leitura em 5 passos (o que aconteceu → até quando)
- [ ] Criar tarefa a partir da pendência

**4. Clientes** (`/clientes`)
- [ ] Todas as 16 abas aparecem sem rolagem escondida
- [ ] Abas novas: Pendências e Comunicação
- [ ] Ficha: selo de origem e "Migrado do Notion"
- [ ] Saúde (interno)

**5. Área do cliente** (`/usuarios`)
- [ ] Entrar com um login de cliente (Usuários → Acessos dos clientes)
- [ ] Início: onde estamos, o que preciso fazer, The Bold está cuidando, depois
- [ ] Aprovar com ♡ pede confirmação
- [ ] Pedir ajuste com ponto na imagem

**6. Conteúdos** (`/conteudos`)
- [ ] Abrir um conteúdo: versões, comparar, comentários, mover etapa
- [ ] Pedir material, bloquear, cancelar

**7. Processos** (`/processos`)
- [ ] O quadro carrega (estava com erro)
- [ ] Arrastar um card mostra impacto e pede motivo

**8. Calendário** (`/calendario`)
- [ ] Aviso "Google Calendar · aguardando conexão"
- [ ] Mês, semana, dia, agenda

**9. Reuniões** (`/reunioes`)
- [ ] Avisos de Google Calendar, Meet e IA
- [ ] Abrir uma reunião: pauta, ata, pós-reunião, transformar em registros

**10. Bold Chat** (`/comunicacao`)
- [ ] Caixa de Menções
- [ ] Transformar em… (tarefa, ajuste, pendência, evento)
- [ ] Aviso do Slack

**11. CRM** (`/crm`)
- [ ] Pipeline, novo negócio, próxima ação

**12. Financeiro** (`/financeiro`)
- [ ] As 3 abas: Recebimentos, Produção & Repasses, Rentabilidade
- [ ] DADOS INSUFICIENTES e AGUARDANDO DECISÃO onde não há regra
- [ ] Atraso igual ao das Pendências

**13. Equipe & Performance** (`/performance`)
- [ ] Aviso DADOS INSUFICIENTES PARA MEDIR PERFORMANCE
- [ ] Métricas por pessoa, sem score e sem ranking
- [ ] Métricas sem fonte mostram "—" com o motivo

**14. The Bold Brain** (`/brain`)
- [ ] "Sua inteligência operacional." e o aviso para conectar o Claude
- [ ] O botão Perguntar fica desativado com o motivo

**15. Insights** (`/insights`)
- [ ] Fato, padrão, hipótese, recomendação, evidência

**16. Notion & Histórico** (`/notion`)
- [ ] Números da migração, fontes importadas e não importadas, por cliente
- [ ] Ocear aparece como PRECISA DE DECISÃO

**17. Configurações** (`/configuracoes`)
- [ ] Todos os cartões levam à tela certa
- [ ] Integrações: estado de cada uma, o que falta
- [ ] Automações: estado, última/próxima execução, erro, dependência
- [ ] Mapa do produto


---

**Revisão 3 · 21/10/2026 · PRODUTO VISÍVEL.** Esta revisão troca a pergunta “existe no código?” por **“a usuária entra na plataforma e encontra, entende e usa?”**.

**Fonte dos requisitos.** Inventário de **457 requisitos definidos**, reconciliados de três fontes:
- todos os documentos de `docs/`;
- as mensagens da CEO nas duas conversas do projeto, incluindo as enviadas durante um turno;
- os resumos de rodada.

**Como foi conferido.** A plataforma foi percorrida como usuária, em computador (1440 px) e celular (390 px):
- como CEO, todas as telas internas, clicando em todas as abas;
- como cliente, as 13 telas do portal.

A base usada foi uma cópia descartável da base real, a mesma da prévia. A cópia foi apagada ao final e a base real não foi alterada.

**Regra desta revisão:** backend, documentação ou teste passando **não** contam como entrega. Entregue = está no menu, abre, explica para que serve, mostra o estado, mostra os dados ou “dados insuficientes”, diz o que falta para ativar e, quando cabe, deixa agir.

**Estados usados na interface:**
- ATIVO
- DADOS INSUFICIENTES
- AGUARDANDO CONFIGURAÇÃO
- AGUARDANDO INTEGRAÇÃO / CONEXÃO
- AGUARDANDO DECISÃO
- EM DESENVOLVIMENTO
- BLOQUEADO POR DEPENDÊNCIA
- Integrações: CONECTADA, NÃO CONECTADA, AGUARDANDO CONFIGURAÇÃO e ERRO

Todos vêm do mesmo componente (`web/src/components/State.jsx`).

> A prévia na Vercel continua **descartável**: o que se altera nela se perde, e as rotinas contínuas não rodam. A tela Integrações → “Hospedagem e rotinas” mostra isso como **AGUARDANDO DECISÃO**.

## O que mudou nesta rodada (para ficar visível)

| Tela | Antes | Agora |
|---|---|---|
| Processos (Quadro) | Erro 500 (variável engolida por comentário, commit `f05c88a`) | Abre normalmente. Um teste novo abre todas as telas e falha em qualquer erro 500 |
| Equipe · Performance | Não existia | Tela nova no menu (só CEO). Mostra entregas, no prazo, com atraso, devoluções, reaberturas, bloqueios, reprogramações, abertas/vencidas, herdadas à parte, capacidade configurada × medida, tendência e contexto dos atrasos. Com 0 eventos: **DADOS INSUFICIENTES PARA MEDIR PERFORMANCE**. Sem score e sem ranking |
| Configurações | Não existia (espalhada) | Tela nova no menu. Uma área por cartão (usuários, perfis, funções, acessos do portal, integrações, automações, regras, calendário operacional, notificações, financeiro, hospedagem, perfil), cada uma com estado, o que falta e atalho |
| Notion · histórico | Decisões da migração fora do menu | Tela nova no menu: o que veio do Notion, CR Editorial e calendários (somente leitura), itens legados, 251 decisões e conteúdo migrado em andamento (**AGUARDANDO DECISÃO**) |
| Financeiro | Só recebimentos | Três abas: **Recebimentos · Produção & Repasses · Rentabilidade**. Repasses: aguardando decisão, com a produção real por profissional e competência, sem valor. Rentabilidade: receita, custos, repasses, margem, retrabalho, evolução e metas, cada item com seu estado |
| Integrações | 5 cartões | 11 cartões, com estado padronizado e legenda. Novos: Google Meet, Resend, Notion (só importação), push no celular, banco/pagamentos, hospedagem e rotinas |
| Automações | Mapa sem dependência | Coluna **Estado** (ativa, aguardando integração, desligada, em desenvolvimento, erro) com a dependência e o último erro. Nova aba **Rotinas do sistema**: quando roda, última e próxima execução e o que bloqueia no ambiente atual |
| The Bold Brain | “Claude não configurado” pequeno | “THE BOLD BRAIN · Sua inteligência operacional.” e o aviso **Conecte o Claude para ativar consultas inteligentes**, com atalho. Memória de Decisões e Radar de Automações aparecem como **EM DESENVOLVIMENTO** |
| Reuniões | Texto “desconectado” | Quatro estados visíveis: Google Calendar, Google Meet, resumos com IA e videochamada própria (em desenvolvimento) |
| Calendário | “Google Calendar desconectado” | **Google Calendar · AGUARDANDO CONEXÃO**, com “configurar →” |
| Pendências | Com 0 itens, só o número 00 | Estrutura sempre visível: prioridades, o modelo **O que aconteceu → Por que parou → Quem age → O que fazer → Até quando** e o bloco “fora das pendências · regra 23” (tarefas herdadas e conteúdos migrados bloqueados), em **AGUARDANDO DECISÃO** |
| Visão Geral | “6 pessoas acima da capacidade” (contava herdadas) | Mesma regra da Torre: só tarefas nascidas na plataforma, herdadas à parte. Tarefas herdadas em “Precisa da sua atenção” levam o selo **Migrado do Notion**, sem nível crítico. Novo atalho para Performance |
| Cliente (ficha) | 14 abas | Mais duas abas: **Pendências** (do cliente) e **Origem dos dados** (plataforma × Notion, com link da página do Notion) |
| Bold Chat | “Nenhuma.” | Canais e diretas vazios viram ação (“criar canal” / “iniciar”); estado do Slack visível |
| Insights | Só a lista | Estados de detectores, narrativa com IA, tendências e evidência |
| Portal (home) | “Primeiro ciclo começa após o onboarding”, mesmo com conteúdo no feed | Texto coerente com o feed. “Última atualização do seu projeto” e bloco **Próximo passo** sempre visíveis |
| Celular | Títulos cortados (“La Ma”, “Qu”); textos do feed sobrepostos | Título da tela inteiro no topo; quadradinhos do feed sem sobreposição |

## 🟢 ENTREGUE E VISÍVEL

| Área | Requisito | Onde |
|---|---|---|
| Visão Geral | Saudação, data, filtro Hoje/7/30/Personalizado, 4 indicadores clicáveis, “Precisa da sua atenção”, operação, inteligência, financeiro e capacidade resumidos, “o que os dados ainda não permitem afirmar” | Visão geral |
| Torre | Estado, riscos/gargalos/bloqueios, mapa das 13 etapas, acúmulo, clientes & saúde, capacidade com herdadas à parte, responsabilidades, desempenho do período (“histórico insuficiente”), inteligência FATO/PADRÃO/HIPÓTESE/RECOMENDAÇÃO, detalhamento, 7 filtros incluindo origem | Torre de Controle |
| Processos | Quadro com filtros e agrupamento; mover etapa com tipo (manual, retorno, reabertura, correção, exceção), motivo e impacto; janela da etapa (409 até o marco) | Processos · Conteúdo → Mover etapa |
| Pendências | Minhas × Equipe, radar de prioridade, causas, filtros e detalhe completo quando há itens; estrutura visível com 0 | Pendências |
| Itens legados | 144 itens com fatos e fonte; três ações individuais | Itens legados |
| Performance | Estrutura completa, eventos válidos, “dados insuficientes”, sem score | Equipe · Performance |
| Clientes | Carteira, onboarding, 16 abas da ficha (inclui Pendências e Origem dos dados), Divisão | Clientes · Divisão |
| Conteúdos | Lista e filtros, novo conteúdo, página do conteúdo (ações, legenda, arquivos, comentários interno/cliente com @, tarefas, ajustes, aprovações, briefing, histórico), comparar versões e diferença de legenda (a partir da V2) | Conteúdos |
| Sala de Revisão | Revisão por cliente, em rodada | Sala de Revisão |
| Calendário | Mês/Semana/Dia/Agenda, filtros, ciclo, prazos | Calendário |
| Reuniões | Agenda, nova reunião com pauta visível ao cliente, transcrição colada, resumo interno e do cliente com verificação de vazamento e “Aprovar e publicar”, extração em tarefas, sala de horários | Reuniões |
| Bold Chat | Canais do cliente, criar canal, diretas, @menções, threads, conteúdo na mensagem, “Transformar em…” tarefa/pendência/decisão/ajuste/evento | Comunicação |
| CRM | Pipeline com etapas e probabilidade, negócio com responsável e próxima ação, follow-ups vencidos, fechamento cria cliente | CRM |
| Financeiro · Recebimentos | Contratos, parcelas, vencimentos, atrasos, registrar pagamento manual | Financeiro → Recebimentos |
| Insights | Abertos/aplicados/descartados/resolvidos, evidência, “Rodar detectores agora” | Insights |
| Notion | Histórico somente leitura por cliente (com filtro de vazios), resumo da importação, decisões da migração | Notion · histórico · ficha → Calendário editorial |
| Automações | Mapa com estado e dependência, rotinas, execuções, regras do processo editáveis | Automações |
| Integrações | Todas as conexões com estado honesto | Integrações |
| Configurações | Hub de todas as configurações | Configurações |
| Usuários | Pessoas, acessos dos clientes, perfis | Usuários e permissões |
| Portal | Início (Momento Bold), Conteúdos (prévia do feed, um por um, coração = aprovação, ajuste por página/tempo/ponto, comentários, versões), Decisões, Calendário, Reuniões, Mensagens, Solicitações (pedir algo), Materiais, Sua marca, Histórico, Onboarding, Perfil | Portal do cliente |

## 🟡 VISÍVEL, MAS PARCIAL

| Requisito | Tela | O que falta |
|---|---|---|
| Ciclo atual / jornada do cliente | Portal → Início | Só aparece com ciclo criado na plataforma. Os clientes reais só têm conteúdo migrado |
| Progresso do ciclo no portal | Portal → Início | Hoje só aparece o % do onboarding |
| AGORA → VOCÊ → THE BOLD → DEPOIS dentro do conteúdo | Conteúdos → conteúdo | Existe na home do portal, não na página do conteúdo |
| Notificações inteligentes do cliente | Sino do portal | Agrupamento e textos definidos, mas nunca observados com dado real |
| Saúde do cliente | Ficha → Saúde | Só “satisfação contextual”, vazia. Sinais e tendência sem histórico |
| Client Brain | Ficha → Resumo do Brain / Ficha | 495 entradas migradas, mas o resumo de La Marca está vazio. Unificação dos formatos 14 × 22 pendente |
| Sala de Revisão e indicadores com conteúdo migrado em andamento | Sala de Revisão · Torre · Visão Geral | Os 307 migrados contam como operação (ver “Precisa de decisão”) |
| Bold Chat | Comunicação | 0 canais de equipe e 0 diretas; o chat inteligente (IA) não existe |
| Reuniões | Reuniões | 0 reuniões registradas; briefing pré-reunião (IA) não existe |
| Recebimentos | Financeiro | Sem lembrete D-1, cobrança D0 nem régua (dependem de Resend e das regras); calendário de recebimentos não existe |
| Performance | Equipe · Performance | Estrutura pronta; o registro auditável de eventos (Bloco 6) e “ver dados de origem” em cada métrica ainda não existem |
| Tendências | Insights · Torre | Sem histórico para comparar |
| Acesso real da equipe | Configurações → Usuários | 9 pessoas com e-mail provisório `@thebold.demo`: sem acesso até receber o e-mail definitivo |
| Acesso dos clientes | Usuários → Acessos dos clientes | 1 de 23 clientes com acesso ao portal |
| Celular | Todas | Tabela de Automações rola na horizontal; ficha do cliente com 16 abas em faixa rolável; “Excluir cliente” em destaque no topo |

## 🟠 EXISTE NO CÓDIGO, MAS NÃO ESTÁ VISÍVEL

| Requisito | Situação |
|---|---|
| Detalhe da pendência | Existe e abre quando há pendência; hoje há 0. A estrutura agora está descrita na tela |
| Revelar credenciais do onboarding (cofre) | Só para `clientes.admin`, dentro da ficha; não tem entrada própria |
| Relatório semanal | Gerado pela rotina (segunda, 8h), que não roda na prévia; o atalho na Torre lista “nenhum relatório” |

## 🔵 AGUARDANDO CONFIGURAÇÃO

| Requisito | O que falta | Onde aparece |
|---|---|---|
| Google Calendar e Google Meet | `GOOGLE_CLIENT_ID/SECRET` + conectar | Integrações · Calendário · Reuniões |
| Claude (Brain, resumos de reunião, narrativa de insights) | `ANTHROPIC_API_KEY` | Brain · Reuniões · Insights · Integrações |
| Meta/Instagram (publicação no horário) | `META_APP_ID/SECRET`, `PUBLIC_BASE_URL`, conectar | Integrações · Automações |
| Slack (espelhar avisos) | `SLACK_CLIENT_ID/SECRET` + conectar | Integrações · Comunicação |
| Resend (convites, senha, cobranças) | `RESEND_API_KEY` + `BOLD_MAIL_FROM` | Integrações · Financeiro |
| Cron diário na prévia | `CRON_SECRET` | Automações → Rotinas · Integrações |
| Rotinas contínuas (insights 15 min, relatório, publicação, transcrições) | Servidor contínuo (hospedagem) | Automações → Rotinas (BLOQUEADO POR DEPENDÊNCIA) |

## 🔴 NÃO IMPLEMENTADO

| Requisito | Onde vai aparecer | Situação na tela |
|---|---|---|
| Valores e fechamento de repasses (estrutura, status, fechamento, relatório e e-mail) | Financeiro → Produção & Repasses | Mostrado como AGUARDANDO DECISÃO (regras) |
| Custos, margem, metas, evolução | Financeiro → Rentabilidade | AGUARDANDO DECISÃO / DADOS INSUFICIENTES |
| Preferências de notificação por pessoa; e-mail e push | Configurações · Integrações | EM DESENVOLVIMENTO |
| Memória de Decisões e Radar de Automações | The Bold Brain | EM DESENVOLVIMENTO |
| Videochamada própria, gravação com consentimento, reunião assíncrona | Reuniões | EM DESENVOLVIMENTO |
| Google Drive (Central de Arquivos) | Integrações | AGUARDANDO DECISÃO (Workspace × Gmail) |
| Sincronização do Google Calendar nos dois sentidos | Calendário | Depende da conexão (Bloco 10) |
| Chat inteligente com IA; sincronização real do Slack | Comunicação | Não aparece |
| Previsão de capacidade e de atraso | Torre | Não aparece (adiado) |
| Revisão por IA na Sala de Revisão | Sala de Revisão | Não aparece (depende dos critérios e do Claude) |
| Criação automática do ciclo mensal | Automações | Listada como planejada (V2) |
| Score de confiabilidade | — | Proibido por decisão até haver dados |

## ⚪ PRECISA DE DECISÃO

1. Como mostrar os **307 conteúdos migrados em andamento** nos indicadores, na Torre e na Sala de Revisão. Visível em Notion · histórico e em Pendências.
2. **Regras financeiras:** repasse, custos, metas, dia de fechamento, e-mail do relatório, cobranças após o vencimento. Visível em Financeiro e Configurações.
3. **Hospedagem definitiva** (plano de `docs/08`). Visível em Integrações → Hospedagem e em Automações → Rotinas.
4. **144 itens legados**, um a um. Visível em Itens legados.
5. **251 pontos da migração.** Visível em Notion · histórico → Decisões.
6. **Status dos 23 clientes “a confirmar”.**
7. **Ocear — “Cronograma editorial”** (30 registros).
8. **E-mails definitivos da equipe** (9 provisórios) e **convites aos clientes**.
9. **Google Drive:** Workspace × Gmail.
10. **Critérios de revisão** de Rebeca e Raísa.
11. **Perguntas obrigatórias do onboarding.**
12. **E-mail candidato** de cliente (regra 17).
13. **Senha do cliente visível à CEO** (conflita com a segurança: senha não é guardada em claro).
14. **Material fora do prazo;** prazo formal de aprovação de arte/vídeo.
15. **Acesso ao MindMeister.**

## O QUE VOCÊ DEVE REVISAR MANUALMENTE AGORA

Navegue nesta ordem. Em cada tela, confira os itens listados.

1. **Visão Geral**
   - Troque Hoje / 7 / 30 / Personalizado e veja os números mudarem.
   - Clique nos 4 indicadores.
   - Em “Precisa da sua atenção”, confira se as tarefas herdadas aparecem com o selo **Migrado do Notion** e sem “crítico”.
   - No rodapé, “Capacidade da equipe” deve dizer **dados insuficientes · N herdadas à parte**, e não “acima da capacidade”.
   - Abra o atalho **Equipe · Performance**.
2. **Torre de Controle**
   - Use os filtros (cliente, responsável, etapa, origem).
   - Clique em uma etapa do mapa e em um risco.
   - Confira a capacidade com herdadas à parte e o bloco de inteligência (fato/padrão/hipótese/recomendação).
3. **Pendências**
   - Com 0 itens, confira as prioridades, o modelo de leitura em 5 passos e o bloco **Fora das pendências · regra 23** com os números das herdadas.
4. **Itens legados**
   - Abra um item e veja os fatos com a fonte e as três ações.
   - Não decida nada sem querer: a decisão vale na prévia só até ela reiniciar.
5. **Equipe · Performance**
   - Troque 7/30/90 dias.
   - Confira **DADOS INSUFICIENTES PARA MEDIR PERFORMANCE**, a tabela por pessoa com herdadas à parte, “capacidade configurada · medida: dados insuficientes”, o contexto dos atrasos e as regras no rodapé.
6. **Clientes**
   - Carteira e Onboarding.
   - Abra La Marca e percorra as 16 abas, principalmente **Pendências** e **Origem dos dados** (link para o Notion).
7. **Área do Cliente** (entre com um acesso de cliente)
   - No Início: “Última atualização”, o texto de “Você está aqui” e o bloco **Próximo passo**.
   - Em Conteúdos: no celular, a prévia do feed sem sobreposição.
   - Percorra Decisões, Calendário, Reuniões, Mensagens, Solicitações (+), Materiais, Sua marca, Histórico e Onboarding.
8. **Conteúdos**
   - Filtros.
   - Abra um conteúdo: ações, “Mover etapa” (tipo, motivo, impacto), comentários interno × cliente vê, abas.
9. **Processos**
   - O quadro precisa abrir (antes dava erro).
   - Agrupar por responsável/cliente, filtros e arrastar um card (mostra impacto e pede motivo).
10. **Calendário**
    - Mês/Semana/Dia/Agenda.
    - Selo **Google Calendar · AGUARDANDO CONEXÃO** com “configurar →”.
11. **Reuniões**
    - Os 4 estados no topo (Calendar, Meet, resumos com IA, videochamada própria).
    - Nova reunião.
    - Aba Inteligência (transcrição, resumos) e Sala de horários.
12. **Bold Chat**
    - “Nenhum canal da equipe ainda — criar canal” e “iniciar” conversa direta.
    - Estado do Slack.
    - Numa conversa de cliente, “Transformar em…”.
13. **CRM**
    - Pipeline vazio com as 7 etapas.
    - “Novo negócio” (campos responsável e próxima ação).
14. **Financeiro**
    - As três abas.
    - Em Recebimentos: estado e “Novo contrato”.
    - Em Produção & Repasses: AGUARDANDO DECISÃO, mais a tabela de produção real (vazia).
    - Em Rentabilidade: os 7 cartões com estado.
15. **Notion · histórico**
    - Números da importação e tabela de calendários/CR Editorial.
    - Cartões de itens legados, decisões da migração e conteúdo migrado em andamento.
16. **The Bold Brain**
    - Título, aviso **Conecte o Claude para ativar consultas inteligentes** e os 4 estados.
    - Faça uma pergunta: deve responder “nenhuma resposta foi gerada” e mostrar os dados que seriam usados.
17. **Insights**
    - Os 4 estados no topo e as abas.
18. **Automações**
    - Coluna Estado (aguardando integração com a dependência).
    - Aba **Rotinas do sistema** (última e próxima execução, bloqueio da prévia).
19. **Integrações**
    - Legenda e 11 cartões; nada pode aparecer como conectado.
    - Hospedagem: “Prévia · aguardando decisão”.
20. **Configurações**
    - Os cartões, os estados e o aviso dos 9 e-mails provisórios.
    - Abra cada atalho.
21. **No celular**
    - Repita Visão Geral, Torre, cliente, Financeiro, Performance e o portal.
    - O título da tela no topo deve aparecer inteiro.

---

# Anexo — Revisão 2 (auditoria de consistência anterior)

**Revisão 2 · 21/10/2026 (mantida como histórico).** Auditoria de consistência depois de:
- mesclar a área premium do cliente;
- aplicar as regras 22–26;
- tratar os 144 itens legados e criar o campo `data_origin`;
- importar os calendários extras e criar o filtro de linhas vazias;
- fazer a auditoria de hospedagem.

Esta auditoria comparou código, base real (lida sem alterar), testes, telas e rotas, integrações, automações, permissões e documentação. Nenhuma funcionalidade foi criada e nenhum dado foi alterado. Commit auditado: `f05c88a`.

**Classificações usadas:** IMPLEMENTADO · IMPLEMENTADO, MAS COM PENDÊNCIA · AGUARDANDO CONFIGURAÇÃO · NÃO IMPLEMENTADO · PRECISA DE DECISÃO · PENDENTE DE VALIDAÇÃO.
- **IMPLEMENTADO:** funciona e foi testado.
- **PENDENTE DE VALIDAÇÃO:** existe e tem teste automatizado ou de tela, mas nunca foi usado com dado real.

> **Atenção principal:** a Vercel é uma **prévia descartável**. Cada acesso decifra a base numa cópia temporária, e tudo o que se altera ali se perde (decisões, comentários, uploads, reprogramações). As rotinas por horário não rodam. **A plataforma ainda não guarda operação real.**

---

## Confirmações pedidas

| # | Confirmação | Resultado | Evidência |
|---|---|---|---|
| 1 | 144 legados fora de pendências, KPIs, carga, Torre, CEO, portal, calendário operacional e notificações | **CONFIRMADO, com resíduos listados em 1a** | Tarefas com status `legado` não entram em nenhuma consulta de tarefa ativa. Conteúdos com `legacy_status='nao_validado'` saem do quadro, de `/contents`, da Torre, da Visão geral, do calendário operacional, do feed e do calendário do portal. Medido em cópia da base real: Pendências da equipe 0; Vivian com 0 de carga e 0 atrasos; Torre com 0 "herdados"; portal com 12 itens (antes 24); 0 notificações na base |
| 1a | Pontos onde legado ainda aparece | **IMPLEMENTADO, MAS COM PENDÊNCIA** | No portal: seletor de conteúdo das Solicitações (`portal.js` "open_contents"), seletor de conteúdo da Conversa e lista de meses do feed. Internamente: contagem do ciclo na ficha (`ops.js` linha 81), status do ciclo (`process.js` refreshCycleStatus), escolha do "ciclo atual" no portal (`client-view.js`) e relatório semanal (`reports.js`). São listas e contagens, não pendências nem alertas |
| 2 | Só três ações individuais para legado | **CONFIRMADO** | Rotas: reprogramar, cancelar, histórico. Não existe ação em massa (a rota de lote responde 404). Reprogramar exige prazo, responsável, etapa e motivo. Decidir o mesmo item duas vezes dá 409. Só a CEO decide (permissão "atrasos"; Vitória recebe 403). Coberto por teste automático |
| 3 | `data_origin` usado de forma estrutural | **CONFIRMADO** | Colunas `tasks.data_origin` e `contents.data_origin` (notion/plataforma). Usadas em pendências, detectores, carga, capacidade, base de performance, risco do conteúdo, saúde do cliente, avisos do agendador e no filtro "Origem" da Torre |
| 4 | Dados migrados não geram pendências, alertas ou notificações | **CONFIRMADO, com 1 ressalva** | Pendências ignoram tarefa e conteúdo de origem Notion. O agendador filtra por `data_origin='plataforma'` nos avisos de prazo, cobrança e processo parado; etapa migrada que abre não avisa ninguém. **Ressalva:** o lembrete de aprovação vencida (`scheduler.js` linha 109, vindo da área do cliente) não filtra a origem. Hoje não tem efeito, porque nenhuma tarefa migrada é do tipo "aprovação" |
| 5 | Área do cliente respeita legado e regra de aprovação | **IMPLEMENTADO, MAS COM PENDÊNCIA** | Aprovação: "aprovado" só com registro (regras 14 e 18), e "em agendamento" não é descrito como aprovado. Feed, calendário, próximos conteúdos e jornada excluem legado. A pendência são os seletores e o mês listados em 1a |
| 6 | 51 linhas vazias preservadas e ocultas | **CONFIRMADO** | `notion_history.empty=1` em 51 linhas: CR EDITORIAL 46, Tatiana 2, La Marca 2, THE BOLD 1. Ficam fora da lista padrão e o filtro "Mostrar registros vazios" (desligado) as mostra. Nada foi apagado |
| 7 | Tatiana, La Marca e THE BOLD importados como histórico | **CONFIRMADO** | 468 + 726 + 415 itens, somente leitura, com link de cada item no Notion. Tarefas (692) e notificações (0) não mudaram com a importação |
| 8 | Ocear — Cronograma editorial | **PRECISA DE DECISÃO** | 30 registros, de 31/08 a 22/12/2026 (operação atual). Não importado; situação inalterada; os registros estão no export, em "clients_duvida" |
| 9 | Railway só auditado | **CONFIRMADO** | Nenhum Dockerfile, `railway.json` ou serviço foi criado. Mapa ATUAL → DESTINO em `docs/08-arquitetura-railway.md` |
| 10 | 23/23 testes | **CONFIRMADO** | `npm test`: 23 testes, 23 passando (`engine.test.js` 11 · `portal.test.js` 12) |

---

## 1. Estrutura / arquitetura

✅ **IMPLEMENTADO**
* Frontend React 19 + Vite; backend Node 22 + Express 5; banco SQLite (73 tabelas)
* Autenticação com senha (scrypt), cookie de sessão, CSRF e redefinição de senha por link
* Permissões por perfil + usuário + módulo + ação, sempre no servidor. A CEO libera Divisão, Carteira e Atrasos
* Histórico de ações (log) que não aceita alteração nem exclusão
* Base real cifrada no repositório (AES-256-GCM); nenhuma credencial no repositório
* Publicação automática na Vercel
* Trava, timeout e registro das rotinas (`runJob` / `job_runs`), testados
* Origem estrutural `data_origin` em tarefas e conteúdos

⚠️ **IMPLEMENTADO, MAS COM PENDÊNCIA**
* Vercel — prévia descartável: os dados alterados se perdem
* Arquivos e uploads — na prévia ficam em `/tmp` (somem) e sem ffmpeg (vídeo sem capa)
* Rotinas por horário — não rodam na Vercel
* Backups — só o snapshot manual; sem rotina automática nem cópia externa
* Ambientes — só a prévia; não há produção nem staging

❌ **NÃO IMPLEMENTADO**
* Hospedagem persistente (só auditoria)
* Backup automático com restauração testada
* Worker de mídia separado

🔴 **PRECISA DE DECISÃO**
* Hospedagem — aprovar o plano de `docs/08`

🟡 **AGUARDANDO CONFIGURAÇÃO**
* `CRON_SECRET`
* Domínio próprio

## 2. Identidade visual / UX

✅ **IMPLEMENTADO**
* Identidade The Bold: escala vinho e tipografia editorial
* Claro/escuro salvo por usuário
* Navegação filtrada por permissão
* Botão "← Voltar" global, que preserva filtros e posição
* Componentes padrão

🔍 **PENDENTE DE VALIDAÇÃO**
* Mobile em todas as telas — conferido só em parte (Visão geral, Divisão, itens legados, calendário editorial, Torre)
* Área premium do cliente — conferida por script de navegador (`scripts/ux-portal.mjs`), sem uso por cliente real

## 3. Clientes

✅ **IMPLEMENTADO**
* Cadastro e carteira: criar, mudar status e excluir, só a CEO
* THE BOLD como cliente interno, fora das métricas externas
* Escopo por cliente; Divisão restrita, com antes e depois
* Client Brain com origem e selo "Migrado do Notion"
* Histórico por cliente
* Onboarding: formulário oficial, migrado parcial, cards por seção e quadro geral
* Tela "Acessos dos clientes"; e-mail da Dreams Brand como **candidato aguardando confirmação** (nenhum login, nenhum convite)

🔍 **PENDENTE DE VALIDAÇÃO**
* Área do cliente premium — home "Meu momento", aprovação ♡ por versão, ajuste estruturado, pergunta ≠ aprovação, Solicitações, central de Decisões, "Sua marca", Materiais com contexto, pós-reunião, Saúde do cliente
  * Coberta por 12 testes automáticos
  * Nenhum cliente com acesso ativo

⚠️ **IMPLEMENTADO, MAS COM PENDÊNCIA**
* Itens legados ainda aparecem em seletores e na lista de meses do portal — ver confirmação 1a
* Login de cliente — 1 acesso preparado, com convite pendente; o envio depende de e-mail. 22 clientes sem e-mail
* Client Brain — dois formatos (14 e 22 seções) sem unificação
* Migração — 251 pontos de revisão continuam abertos

🔴 **PRECISA DE DECISÃO**
* Status de 23 clientes "a confirmar": 22 externos + THE BOLD. Só La Marca está "ativo"
* Pontos de migração abertos: equipe divergente, possíveis duplicados e escopo

## 4. Conteúdos / calendário

✅ **IMPLEMENTADO**
* Calendário editorial: fases, mês, prévia do feed, grupo "Legado do Notion · não validado" e histórico do Notion somente leitura
* Versões V1/V2/V3 preservadas; comparação; diferença de legenda
* Regra "aprovado só com aprovação registrada" (regras 14 e 18)
* Ajustes com histórico por versão; comentário que vira ajuste, idempotente (regra 19)
* Comentários internos e visíveis ao cliente; pedir material; legenda

🔍 **PENDENTE DE VALIDAÇÃO**
* Aprovação ♡ e ajuste estruturado no portal (testados, sem uso real)
* Mídia: upload e preservação testados, mas sem hospedagem persistente
* Ainda sem dados: 0 versões, 0 arquivos, 0 comentários, 0 aprovações, 0 ajustes

⚠️ **IMPLEMENTADO, MAS COM PENDÊNCIA**
* Timestamp em vídeo — só o cliente marca
* Publicação automática — depende da Meta

❌ **NÃO IMPLEMENTADO**
* Arrastar conteúdo no calendário para mudar a data
* Anotação em região da imagem pela equipe interna — **PENDENTE DE VALIDAÇÃO** se a área premium (ajuste estruturado com região) já cobre isso

## 5. Process Engine

✅ **IMPLEMENTADO**
* Etapas, status e transições
* Pronto ≠ disponível, estrito (regra 20)
* Janelas de revisão
* Mover etapa com tipo, impacto e motivo
* Reabertura, correção e exceção
* Responsável por função, com regra padrão
* Prazos e notificações dentro da plataforma
* Reabertura de item legado (`reopenLegacy`)

⚠️ **IMPLEMENTADO, MAS COM PENDÊNCIA**
* Avisos por horário — dependem do cron e de hospedagem
* Status do ciclo — ainda conta os itens legados (ver 1a)

❌ **NÃO IMPLEMENTADO**
* Notificação por e-mail e push

## 6. Pendências

✅ **IMPLEMENTADO**
* Minhas e Equipe, com permissão no servidor
* Regra de quem precisa agir
* Prioridade e filtros
* Dado migrado não gera pendência (regra 23). Hoje: Pendências da equipe = **0**; Minhas da Vivian = **0**

⚠️ **IMPLEMENTADO, MAS COM PENDÊNCIA**
* Lembrete de aprovação vencida da área do cliente sem filtro de origem (ressalva da confirmação 4)

## 7. Visão geral da CEO

✅ **IMPLEMENTADO**
* Estado da operação, indicadores, atenção, operação e inteligência
* Bloco "o que os dados ainda não permitem afirmar": 144 legados não validados, conteúdos sem data, Performance DADOS INSUFICIENTES, Financeiro DADOS INSUFICIENTES
* Legado e cliente interno fora dos indicadores

⚠️ **IMPLEMENTADO, MAS COM PENDÊNCIA**
* Compromissos — dependem do Google Calendar
* Financeiro — DADOS INSUFICIENTES

## 8. Torre de Controle

✅ **IMPLEMENTADO**
* Ordem: estado → riscos → operação → pessoas → clientes → período → inteligência → detalhamento
* Filtros: período, cliente, responsável, etapa, formato, prioridade, status, tipo e origem (`data_origin`)
* Causa raiz: fato · padrão · hipótese não verificada · recomendação
* Capacidade com migradas à parte; "sem responsável" migrado não vira alerta

## 9. Performance / equipe

✅ **IMPLEMENTADO**
* Base sem score, só com `data_origin='plataforma'`. Eventos válidos = **0** → **DADOS INSUFICIENTES**
* Capacidade **configurada**, identificada como "não medida"
* Sobrecarga e concentração só com dados da plataforma

❌ **NÃO IMPLEMENTADO (Bloco 6)**
* Registro auditável de eventos válidos (`perfEvents`, citado na regra 25 e ainda não criado)
* Tela de Equipe/Performance com fatos e tendência
* Capacidade medida
* Score e ranking — fora do escopo, por decisão

## 10. Reuniões

🔍 **PENDENTE DE VALIDAÇÃO** (0 reuniões na base)
* Cadastro e itens que viram tarefas
* Horários para o cliente agendar
* Transcrição colada à mão
* Resumos para o cliente e interno, com bloqueio de vazamento de informação interna
* Publicação do resumo para o cliente

🟡 **AGUARDANDO CONFIGURAÇÃO**
* Evento no Google Calendar com **link do Google Meet** (código pronto)
* Detecção automática de transcrição — depende do Google
* Resumo e extração por IA — depende do Claude

## 11. Comunicação

✅ **IMPLEMENTADO**
* Notificações dentro da plataforma

🔍 **PENDENTE DE VALIDAÇÃO**
* Bold Chat: canais, DMs, menções, mensagem → tarefa ou ajuste, conversa com o cliente (24 canais, 0 mensagens)

🟡 **AGUARDANDO CONFIGURAÇÃO**
* Slack (envio)

❌ **NÃO IMPLEMENTADO**
* Espelhamento automático para o Slack

## 12. Financeiro

* **Recebimentos** — 🔍 PENDENTE DE VALIDAÇÃO: contratos, faturas e atraso automático (0 contratos, 0 faturas). 🔴 PRECISA DE DECISÃO: as regras
* **Produção & Repasses** — ❌ NÃO IMPLEMENTADO · 🔴 PRECISA DE DECISÃO
* **Rentabilidade** — ❌ NÃO IMPLEMENTADO · 🔴 PRECISA DE DECISÃO

## 13. CRM

🔍 **PENDENTE DE VALIDAÇÃO**
* Pipeline, responsável, próxima ação e "negócio fechado → cliente" (0 negócios)
* Follow-up automático — depende do cron

## 14. The Bold Brain / IA

✅ **IMPLEMENTADO**
* Inteligência por regras fixas com causa raiz
* Limites da IA no código
* Sem chave, nada é simulado

🟡 **AGUARDANDO CONFIGURAÇÃO**
* Brain (perguntas), narrativa de insights e resumo de reunião por IA — `ANTHROPIC_API_KEY`

❌ **NÃO IMPLEMENTADO**
* Previsão de atraso
* Feedback recorrente → sugestão para o Brain

## 15. Notion

| Item | Situação | Números |
|---|---|---|
| Dados migrados | ✅ IMPLEMENTADO | 24 clientes · 451 conteúdos (todos `data_origin=notion`) · 692 tarefas |
| Client Brain | ✅ IMPLEMENTADO | 1.415 entradas |
| Onboarding | ✅ IMPLEMENTADO | 847 respostas · 20 migrado parcial · 4 não iniciados |
| CR EDITORIAL (20 clientes) | ✅ IMPLEMENTADO | 3.783 itens, somente leitura |
| Calendários extras | ✅ IMPLEMENTADO | Tatiana 468 · La Marca 726 · THE BOLD 415 |
| Histórico total | ✅ IMPLEMENTADO | 5.392 itens; 51 vazios ocultos |
| Itens legados | ✅ IMPLEMENTADO | 144 "não validado"; 0 decididos |
| Ocear — Cronograma editorial | 🔴 PRECISA DE DECISÃO | 30 registros, operação atual, não importados |
| Não importados (motivo registrado) | — | Ocear "Datas" (não editorial) · Ocear stories (não é base) · Tatiana STORIES (1.239, fora do pedido) · THE BOLD base 3656… (inacessível) |
| Não migrado de propósito | — | Senhas e credenciais, banco de pautas, páginas de ideias, arquivos anexados (24 casos para revisão) |
| Sincronização / escrita no Notion | Nenhuma (por decisão) | — |

## 16. Automações (55 no catálogo · 49 implementadas · 6 não implementadas)

**✅ Funcionam quando alguém age na plataforma** (0 execuções reais até hoje):
* Conteúdo e aprovação: ajuste.concluido, cliente.ajuste, cliente.aprovou, cliente.notificado_aprovacao, conteudo.agendado, producao.concluida, revisao.ajuste, revisao.aprovada, tema.ajuste, tema.aprovado
* Etapas e tarefas: etapa.agendada, etapa.movida_manual, tarefa.atribuida, tarefa.sem_responsavel, material.pendente
* Comunicação: chat.converter, comentario.cliente, mencao, pergunta.cliente, solicitacao.criada
* Decisões: decisao.pedida, decisao.respondida
* Clientes e onboarding: cliente.novo, onboarding.concluido, onboarding.formulario_incompleto, crm.fechado
* Reuniões: reuniao.itens, reuniao.reservada, reuniao.resumo_cliente, reuniao.resumo_interno, reuniao.transcricao_detectada

**🟡 Aguardando configuração** (precisam do cron/hospedagem):
* Prazos e etapas: etapa.disponivel, prazo.proximo, prazo.vencido, processo.parado
* Cobrança do cliente: cliente.sem_resposta_24h, cliente.sem_resposta_48h, cliente.sem_resposta_72h, cliente.prazo_vencido
* Onboarding e CRM: onboarding.item_atrasado, crm.followup
* Financeiro: financeiro.atraso, financeiro.vencimento
* Relatórios e inteligência: relatorio.semanal, insights.detectar (também roda ao abrir a Torre ou a Visão geral), saude.calcular

**🟡 Aguardando configuração externa:**
* meta.publicar (Meta)
* insights.narrativa e reuniao.extracao_ia (Claude)

**❌ Não implementadas:** brain.feedback, ciclo.criar, drive.material, estoque.videos, previsao.atraso, slack.espelhar

## 17. Integrações (0 conectadas na base)

| Integração | Situação |
|---|---|
| Google Calendar | AGUARDANDO CONFIGURAÇÃO |
| Google Meet (link no evento) | AGUARDANDO CONFIGURAÇÃO (código pronto, depende do Google) |
| Google Drive | NÃO IMPLEMENTADA |
| Slack | AGUARDANDO CONFIGURAÇÃO (o espelhamento não foi implementado) |
| Notion | IMPLEMENTADO, MAS COM PENDÊNCIA (importação somente leitura por exportação; sem sincronização, por decisão; Ocear aguardando decisão) |
| Meta/Instagram | AGUARDANDO CONFIGURAÇÃO |
| E-mail (Resend) | AGUARDANDO CONFIGURAÇÃO |
| Anthropic/Claude | AGUARDANDO CONFIGURAÇÃO |
| Obsidian (opcional) | AGUARDANDO CONFIGURAÇÃO |

## 18. Testes

* **Automáticos:** **23/23 passando**
  * engine (11): process engine, versões, permissões, auditoria, mídia, trava de rotinas, legado, comentário → ajuste, aprovação registrada, causa raiz;
  * portal (12): área do cliente, incluindo permissões.
* **E2E:** existem scripts de navegador no repositório (`scripts/e2e-bloco4.mjs`, `scripts/ux-portal.mjs`) — PENDENTE DE VALIDAÇÃO nesta revisão (não foram executados nesta auditoria)
* **Permissões:** testadas pela API a cada bloco (CEO, Operações, Gestão, Design, Comercial e Cliente) e nos 12 testes do portal
* **Base real:** todas as verificações em cópia; a base mestra só recebeu as importações e marcações previstas pelas regras
* **Ainda não validado:**
  * uso real por cliente;
  * Reuniões, CRM, Financeiro e Chat com dados;
  * mídia em hospedagem persistente;
  * cron em produção;
  * e-mail;
  * mobile completo.

## 19. Base real atual (lida em 21/10/2026, sem alterações)

| Item | Valor |
|---|---|
| Clientes | 24 = 23 externos + 1 interno (THE BOLD) · status: 23 "a confirmar", 1 "ativo" (La Marca) |
| Equipe | 10 · usuários de cliente: 1 (convite pendente) |
| Conteúdos | 451, todos `data_origin=notion`: 241 em produção · 66 em revisão interna · 144 legados não validados |
| Tarefas | 692, todas `data_origin=notion`: 540 abertas · 8 agendadas · 144 legado · 0 concluídas |
| Itens legados | 144 não validados · 0 reprogramados · 0 cancelados · 0 histórico |
| Histórico do Notion | 5.392 itens (51 vazios, ocultos) |
| Client Brain | 1.415 entradas |
| Respostas de onboarding | 847 |
| Ciclos | 45 · canais: 24 |
| Versões, arquivos, comentários, aprovações, ajustes | 0 |
| Reuniões, mensagens | 0 |
| Negócios, contratos, faturas | 0 |
| Eventos de performance válidos | 0 → DADOS INSUFICIENTES |
| Notificações, execuções de automação, execuções de rotina | 0 |
| Integrações conectadas | 0 |
| Pontos de migração abertos | 251 |
| Registros no log | 690 |
| E-mail candidato | dreamsbrand.pi@gmail.com — aguardando confirmação |

## 20. Pontos abertos

**🔴 Decisões da CEO**
1. Hospedagem persistente — aprovar o plano de `docs/08`
2. Ocear — "Cronograma editorial": importar como histórico, trazer para o calendário da plataforma ou deixar fora
3. Status dos 23 clientes "a confirmar"
4. Pontos de migração abertos: equipe, duplicados e escopo
5. Regras financeiras: Recebimentos, Repasses e Rentabilidade
6. Os 144 legados: decisão individual, quando quiser (não bloqueia nada)

**🟡 Configurações e acessos externos**
* `CRON_SECRET`
* `RESEND_API_KEY` + `BOLD_MAIL_FROM` (com domínio verificado)
* `ANTHROPIC_API_KEY`
* Google (OAuth para Calendar e Meet)
* Slack (OAuth)
* Meta (app)
* Domínio próprio
* E-mails dos 22 clientes sem acesso, ou a confirmação do e-mail candidato da Dreams Brand

**Antes do Bloco 6**
1. Corrigir os pontos residuais de legado (confirmação 1a) e a ressalva do lembrete de aprovação (confirmação 4). São ajustes de consulta, sem regra nova.
2. Unificar a documentação: há dois arquivos numerados "06", e a regra 25 cita `perfEvents.js`, que só vai existir no Bloco 6.
3. Rodar os scripts E2E existentes e registrar o resultado.

## PRÓXIMO PASSO RECOMENDADO
1. Aprovar o plano de hospedagem persistente. Sem ele, nada feito na plataforma fica salvo.
2. Corrigir os resíduos de legado no portal, no ciclo e no relatório, e o filtro de origem do lembrete de aprovação.
3. Configurar `CRON_SECRET`, e-mail (Resend) e Google: as rotinas, os convites e as reuniões dependem disso.
4. Decidir o Ocear e o status dos 23 clientes "a confirmar".
5. Iniciar o Bloco 6 (eventos válidos), mantendo performance como DADOS INSUFICIENTES até haver eventos reais.
