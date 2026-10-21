# THE BOLD OS — Checklist oficial de conferência

## Revisão 3 · 21/10/2026 — produto visível

**Regra desta revisão:** backend, documentação ou teste passando **não** contam como funcionalidade entregue. Só conta o que dá para encontrar no menu, abrir, entender, ver o estado (ou "dados insuficientes"), saber o que falta e, quando aplicável, usar.

**Fontes reconciliadas:**
- o código;
- as auditorias anteriores (revisões 1 e 2, abaixo);
- as regras oficiais (`docs/07`);
- a especificação da área do cliente (`docs/06`);
- os módulos (`docs/modulos`, `docs/integracoes`);
- a arquitetura (`docs/02`, `docs/08`);
- as decisões das conversas.

**Fonte única do estado:** `web/src/lib/productMap.js`. A tela **Sistema → Mapa do produto** (`/mapa`) e esta seção saem do mesmo arquivo. Para regenerar: `node scripts/product-map-md.mjs`.

**Estados honestos na interface:**
- ATIVO
- DADOS INSUFICIENTES
- AGUARDANDO CONFIGURAÇÃO
- AGUARDANDO INTEGRAÇÃO / CONEXÃO
- AGUARDANDO DECISÃO
- EM DESENVOLVIMENTO
- BLOQUEADO POR DEPENDÊNCIA
- SOMENTE LEITURA
- CONECTADA / NÃO CONECTADA / ERRO

Componente: `web/src/components/State.jsx`. Nenhum dado, conexão ou métrica é simulado.

### O que mudou nesta etapa

**Correção urgente**
- O quadro de **Processos** dava erro 500 para todos, inclusive na versão publicada. Uma declaração (`const p = []`) tinha ficado dentro de um comentário em `ops.js`.

**Menu**
- Todos os módulos estão no menu, que agora rola de forma visível, com esmaecido no fim.
- Itens novos: Equipe & Performance, Notion & Histórico, Configurações, Mapa do produto e Meu perfil. "Comunicação" passou a se chamar **Bold Chat**.

**Configurações (nova)**
- Um lugar só: pessoas e acessos, operação, conexões, notificações, financeiro, dados/Notion e infraestrutura.
- Cada cartão mostra o estado real.

**Mapa do produto (novo)**
- Cada requisito definido no projeto, com a tela onde fica, o estado e o que falta.
- Inclui o roteiro "O que revisar agora".

**Clientes**
- Abas que quebram linha em vez de ficar escondidas.
- Novas abas **Pendências** e **Comunicação**.

**Visão geral**
- Blocos **Financeiro**, **Capacidade** e **Minhas pendências** na própria tela, com DADOS INSUFICIENTES quando não há dado.
- A capacidade passou a contar só tarefas da plataforma (regra 25).

**Torre de Controle**
- Nova seção **Dependências**: bloqueios por quem precisa agir e o que aguarda decisão do cliente.

**Pendências**
- Leitura em 5 passos ao abrir uma pendência: o que aconteceu → por que está parado → quem precisa agir → o que fazer → até quando.

**Financeiro**
- Três áreas: **Recebimentos**, **Produção & Repasses** e **Rentabilidade**.
- O atraso passou a ser calculado pela data (antes dependia do agendador). Isso vale também para Visão geral, Torre, Saúde e relatório.
- Cobrança e histórico de recebimentos ficaram visíveis.
- Repasses e custos aparecem como AGUARDANDO DECISÃO. A margem nunca é calculada sem regra.

**Equipe & Performance (nova)**
- Fatos por pessoa: entregas, prazo, atraso, reaberturas, devoluções, bloqueios, capacidade configurada, tendência e contexto dos atrasos.
- Sem score e sem ranking.
- Aviso DADOS INSUFICIENTES PARA MEDIR PERFORMANCE abaixo do mínimo de eventos válidos.

**Notion & Histórico (nova)**
- Números da migração, fontes importadas e não importadas (com motivo), itens legados, decisões da migração e visão por cliente.

**Integrações**
- Painel com o estado real de cada conexão: Google Calendar e Meet, Drive, Slack, Meta, e-mail, Claude, Notion, Obsidian, hospedagem, Railway, agendador e endereço público.
- Mostra o que falta (nomes de variáveis, nunca valores) e onde cada conexão é usada.

**Automações**
- Estado de cada automação, última e próxima execução, último erro e dependência.
- Aviso do agendador.
- No celular, a tabela vira cartões.

**The Bold Brain**
- "Sua inteligência operacional."
- Aviso para conectar o Claude, com o botão de perguntar desativado e o motivo.
- O que já funciona sem IA.

**Agenda e Reuniões**
- Avisos padronizados: Google Calendar, Google Meet, IA e videochamada nativa.

**Bold Chat**
- Caixa de **Menções**.
- Estado do Slack.

**Portal no celular**
- Corrigida a sobreposição do selo com a data nos blocos do feed.

**Verificação:**
- 26/26 testes automáticos e build ok.
- Todas as telas abertas no navegador (computador 1440px e celular 390px) numa cópia local com dados de demonstração.
- Nenhuma tela com erro de API e nenhuma com rolagem lateral da página.
- A base real não foi tocada.

### Observações das frentes desta etapa
- **Mínimo de eventos válidos para medir performance:** não existia; ficou **provisório em 20 por período** (configuração `performance_min_eventos`). A decisão final é da CEO.
- **Reprogramações por pessoa:** o processo não registra mudança de prazo de tarefa, então a tela mostra "—" com esse motivo.
- **`reuniao.transcricao_detectada`:** no código, roda pelo agendador a cada 15 minutos e depende do Google. A revisão 2 a listava como "funciona quando alguém age". Corrigido para AGUARDANDO INTEGRAÇÃO.
- **Relatório semanal:** usa a hora local do servidor (UTC na maioria das hospedagens). "Segunda 08h" pode não ser o horário de São Paulo.

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

# Histórico — Revisão 2

**Revisão 2 · 21/10/2026** (mantida como histórico; o estado atual é a Revisão 3, acima). Auditoria de consistência depois de:
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
