# THE BOLD OS — Checklist oficial de conferência

**Revisão 2 · 21/10/2026.** Auditoria de consistência depois de:
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
