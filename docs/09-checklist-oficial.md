# THE BOLD OS — Checklist oficial de conferência

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
