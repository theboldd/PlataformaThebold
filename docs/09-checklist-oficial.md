# THE BOLD OS — Checklist oficial de conferência (21/10/2026)

Legenda:
- **IMPLEMENTADO** = funciona e foi testado.
- **COM PENDÊNCIA** = existe, mas falta algo para concluir.
- **PENDENTE DE VALIDAÇÃO** = existe no código, mas nunca foi usado com dado real nem testado de ponta a ponta.
- Tudo o que está aqui foi conferido no código e na base real nesta data.

> **Atenção principal:** a Vercel é só uma **prévia**. Cada acesso usa uma cópia temporária da base. O que se altera ali (comentários, aprovações, uploads, mudanças de etapa) **se perde**. As rotinas por horário não rodam lá. A plataforma ainda **não está pronta para operação real** até existir hospedagem persistente.

---

## 1. Estrutura / arquitetura

✅ IMPLEMENTADO
* Frontend em React 19 + Vite
* Backend em Node 22 + Express 5
* Banco SQLite com o esquema completo
* Autenticação:
  * senha com hash (scrypt), sessão em cookie e proteção CSRF;
  * sessão assinada na prévia;
  * redefinição de senha por link (gerado pela CEO).
* Permissões por perfil + usuário + módulo + ação, sempre checadas no servidor
* Módulos que só a CEO libera: Divisão, Carteira e Atrasos
* Histórico (activity_logs) que não aceita alteração nem exclusão
* Base real cifrada no repositório (snapshot AES-256-GCM); credenciais fora do repositório
* Publicação automática na Vercel a cada envio para a branch principal
* `/api/health` com a versão publicada
* Trava, timeout e registro das rotinas automáticas (testados)

⚠️ IMPLEMENTADO, MAS COM PENDÊNCIA
* Vercel (prévia) — os dados alterados se perdem; não serve para a operação real
* Storage de arquivos — na prévia fica temporário e sem ffmpeg (vídeo sem capa)
* Jobs/cron — o agendador interno não roda na Vercel; o cron diário depende do `CRON_SECRET`
* Backups — só o snapshot manual; não existe rotina automática nem cópia externa
* Ambientes — só existe a prévia; não há produção nem staging separados

❌ NÃO IMPLEMENTADO
* Hospedagem persistente (Railway: só relatório, sem migração)
* Backup automático e restauração testada
* Worker de mídia separado

🔴 PRECISA DA MINHA DECISÃO
* Hospedagem — aprovar o plano (Railway ou outro com banco persistente) depois da auditoria arquitetural

🟡 PRECISA DE ACESSO/CONFIGURAÇÃO
* `CRON_SECRET` — para as rotinas automáticas rodarem
* Domínio próprio — para links de e-mail e retornos de login dos serviços externos

## 2. Identidade visual / UX

✅ IMPLEMENTADO
* Identidade The Bold: escala vinho e tipografia editorial
* Modo claro/escuro salvo por usuário (também no portal)
* Navegação lateral filtrada pelas permissões de cada pessoa
* Botão "← Voltar" global, que preserva filtros e posição; o voltar do navegador fecha painéis
* Componentes comuns: painel lateral, janela, abas, tabelas, filtros na URL

⚠️ IMPLEMENTADO, MAS COM PENDÊNCIA
* Responsividade/mobile — conferida em algumas telas (Visão geral, Divisão, Revisão de atrasos, calendário editorial, Torre); falta conferir todas as telas
* Experiência editorial — PENDENTE DE VALIDAÇÃO com uso real da equipe

## 3. Clientes

✅ IMPLEMENTADO
* Cadastro e carteira: criar, mudar status e excluir (com confirmação digitada), só a CEO ou quem ela liberar
* Cliente interno: THE BOLD, fora das métricas de clientes externos
* Escopo por cliente: cada pessoa vê só os clientes dela, exceto perfis com todos os clientes
* Divisão de clientes: restrita, com antes e depois de cada mudança
* Client Brain: 1.415 entradas, com origem e selo "Migrado do Notion"
* Histórico por cliente
* Onboarding:
  * formulário oficial;
  * migrado parcial do Notion;
  * cards por seção e quadro geral na tela Clientes.
* Tela "Acessos dos clientes": status, origem do e-mail e e-mail candidato

⚠️ IMPLEMENTADO, MAS COM PENDÊNCIA
* Portal do cliente (feed, aprovação, comentários, calendário, onboarding, materiais) — testado só numa cópia, com 1 cliente; nenhum cliente tem acesso ativo
* Login de cliente — 1 acesso preparado (convite pendente); o envio do convite depende do e-mail; 22 clientes sem e-mail
* Client Brain — dois formatos convivem (14 seções antigas e 22 seções da migração) sem unificação
* Migração do Notion — 251 pontos de revisão continuam abertos

🔴 PRECISA DA MINHA DECISÃO
* 22 clientes com status "a confirmar" — quais estão ativos, pausados ou encerrados
* Pontos de migração abertos — equipe divergente, possíveis duplicados e escopo

## 4. Conteúdos / calendário

✅ IMPLEMENTADO
* Calendário editorial por cliente: fases, mês, prévia do feed e histórico do Notion
* Conteúdos com etapa, data e origem da data
* Versões V1/V2/V3 preservadas, com comparação lado a lado
* Diferença de legenda palavra por palavra
* Aprovação: interna, do cliente, e registrada pela equipe em nome do cliente
* Regra "aprovado só com aprovação registrada"
* Ajustes com histórico agrupado por versão
* Comentário que vira ajuste
* Comentários internos e visíveis ao cliente, com página do carrossel
* Materiais: pedir material e marcar como recebido
* Legenda editável

⚠️ IMPLEMENTADO, MAS COM PENDÊNCIA
* Mídia — upload e preservação do original testados; na prévia os arquivos se perdem e o vídeo fica sem capa
* Aprovação por coração no portal — PENDENTE DE VALIDAÇÃO com cliente real
* Timestamp em vídeo — o cliente marca no portal; a equipe só visualiza, não marca
* Agendamento — o registro existe; a publicação automática depende da Meta
* Base real ainda sem versões, arquivos, comentários, aprovações ou ajustes — só testado em cópias

❌ NÃO IMPLEMENTADO
* Anotação em imagem (marcar região)
* Arrastar conteúdo para reprogramar no calendário

## 5. Process Engine

✅ IMPLEMENTADO
* Etapas e status, com regras de transição
* Regra "pronto ≠ disponível": a etapa só abre na data
* Janelas de revisão
* Movimentação manual com tipo, impacto calculado e motivo obrigatório
* Reabertura, correção e exceção
* Responsáveis por função, com regra padrão quando o cliente não tem ninguém vinculado
* Prazos por marco do ciclo ou prazo padrão da etapa
* Notificações dentro da plataforma

⚠️ IMPLEMENTADO, MAS COM PENDÊNCIA
* Avisos por horário (prazo próximo/vencido, cobrança do cliente, processo parado) — dependem do cron; não rodam na prévia

❌ NÃO IMPLEMENTADO
* Notificação por e-mail ou push

## 6. Pendências

✅ IMPLEMENTADO
* Abas Minhas e Equipe; Equipe só com permissão (checada no servidor)
* Regra fixa de quem precisa agir em cada tipo de pendência
* Prioridade e filtros
* Itens herdados mostrados à parte, sem severidade crítica

⚠️ IMPLEMENTADO, MAS COM PENDÊNCIA
* Separação migrado × plataforma — a decisão "dados migrados não geram pendência automaticamente" ainda não foi aplicada:
  * 144 itens aparecem como "herdado da migração";
  * 8 "sem responsável" e 12 "material" de dados migrados ainda viram pendência.

## 7. Visão geral da CEO

✅ IMPLEMENTADO
* Estado da operação, indicadores clicáveis e "precisa da sua atenção"
* Operação e inteligência
* Bloco "o que os dados ainda não permitem afirmar"
* DADOS INSUFICIENTES quando não há base
* Cliente interno fora da carteira

⚠️ IMPLEMENTADO, MAS COM PENDÊNCIA
* Próximos compromissos — dependem do Google Calendar (hoje 0 reuniões)
* Financeiro — DADOS INSUFICIENTES (0 contratos)

## 8. Torre de Controle

✅ IMPLEMENTADO
* Seções na ordem: estado → riscos e gargalos → operação → pessoas → clientes → período → inteligência → detalhamento
* Filtros: período, cliente, responsável, etapa, formato, prioridade, status, tipo de tarefa e origem
* Causa raiz em quatro partes: fato, padrão observado, hipótese não verificada e recomendação
* Capacidade com tarefas herdadas à parte e capacidade indicada como "configurada"

⚠️ IMPLEMENTADO, MAS COM PENDÊNCIA
* Origem migrado × plataforma — hoje derivada da marca de importação e da situação de desempenho; a decisão 9 pede um campo de origem explícito no modelo (não aplicada ainda)

## 9. Performance / equipe

✅ IMPLEMENTADO
* Proteção: itens herdados fora de atraso por pessoa, carga, alertas e indicadores
* Base de performance preparada, sem score — hoje 0 eventos válidos, DADOS INSUFICIENTES
* Sobrecarga e concentração calculadas só com tarefas nascidas na plataforma
* Reprogramação na Revisão de atrasos, com motivo e histórico

❌ NÃO IMPLEMENTADO
* Definição e registro de eventos válidos (concluída no prazo/atrasada, reaberta, devolvida, bloqueada, reprogramada)
* Tela de Equipe/Performance com fatos e tendência
* Capacidade medida
* Score e ranking — não serão feitos por decisão sua

## 10. Reuniões

⚠️ IMPLEMENTADO, MAS COM PENDÊNCIA
* Cadastro de reuniões, resumo e notas manuais — PENDENTE DE VALIDAÇÃO (0 reuniões)
* Itens de reunião (decisão, ação, pendência) que viram tarefa — PENDENTE DE VALIDAÇÃO
* Horários para o cliente agendar — PENDENTE DE VALIDAÇÃO
* Criar evento no Google Calendar — código pronto, aguardando configuração

❌ NÃO IMPLEMENTADO
* Link do Google Meet
* Transcrição
* Resumo por IA, com versões para o cliente e interna
* Envio automático de decisões para o Client Brain / The Bold Brain

## 11. Comunicação

✅ IMPLEMENTADO
* Notificações dentro da plataforma, com agrupamento

⚠️ IMPLEMENTADO, MAS COM PENDÊNCIA
* Bold Chat (canais internos, por cliente e privados; DMs; menções; mensagem que vira tarefa ou ajuste) — PENDENTE DE VALIDAÇÃO (24 canais, 0 mensagens)
* Slack — conexão e envio de mensagem prontos, aguardando configuração

❌ NÃO IMPLEMENTADO
* Espelhamento automático para o Slack

## 12. Financeiro

**Recebimentos**
* ⚠️ Contratos, faturas, marcar como paga e atraso automático (depende do cron) — PENDENTE DE VALIDAÇÃO (0 contratos e 0 faturas)
* 🔴 Regras ainda não definidas: valores, contagem, dia de fechamento, e-mail do relatório e cobrança após o vencimento

**Produção & Repasses**
* ❌ Não implementado — depende de regras

**Rentabilidade**
* ❌ Não implementado — depende de regras

## 13. CRM

⚠️ IMPLEMENTADO, MAS COM PENDÊNCIA
* Pipeline de negócios com etapas, responsável e próxima ação — PENDENTE DE VALIDAÇÃO (0 negócios)
* Follow-up automático quando a próxima ação vence — depende do cron
* Negócio fechado vira cliente com onboarding — PENDENTE DE VALIDAÇÃO
* Histórico — registrado no log geral

## 14. The Bold Brain / IA

✅ IMPLEMENTADO
* Inteligência por regra fixa (detectores) com causa raiz: fato, padrão, hipótese não verificada e recomendação
* Limites da IA no código: a IA não decide estado crítico, dinheiro nem nada sobre pessoas
* Sem chave de IA, nada é simulado: a plataforma responde "não configurado"

⚠️ IMPLEMENTADO, MAS COM PENDÊNCIA
* Perguntas ao Brain e narrativa dos insights — aguardando `ANTHROPIC_API_KEY`

❌ NÃO IMPLEMENTADO
* Resumo e extração de reunião por IA
* Previsão de atraso
* Feedback recorrente do cliente → sugestão para o Brain

## 15. Notion

* ✅ **Dados migrados:** 24 clientes; 451 conteúdos dos quadros de outubro e novembro; Divisão da equipe; Client Brain com 1.415 entradas
* ✅ **Onboarding:** 847 respostas, marcado como migrado parcial (20 clientes) ou não iniciado (4)
* ✅ **CR EDITORIAL:** 3.783 itens de 20 calendários, como histórico somente leitura
* ⚠️ **Linhas vazias do CR EDITORIAL:** preservadas, mas ainda aparecem na visualização (o filtro "Mostrar registros vazios" ainda não existe)
* ⚠️ **Itens legados (144):** separados das métricas; o tratamento definitivo como "LEGADO / NÃO VALIDADO", com as 3 ações, ainda não foi aplicado
* ⚠️ **Calendários ainda não importados** (auditoria somente leitura em andamento): Tatiana França (`CALENDÁRIO EDITORIAL FEED`), La Marca (`CRONOGRAMA DE POSTS`), Ocear Resort (`Cronograma editorial`) e as bases sem título da THE BOLD
* **Não migrado de propósito:**
  * senhas e credenciais;
  * calendários de stories;
  * banco de pautas;
  * páginas de ideias;
  * arquivos anexados ao Notion (24 casos registrados para revisão).
* **Regra de sincronização:** nenhuma escrita no Notion e nenhuma sincronização

## 16. Automações

**FUNCIONANDO** (disparam quando alguém age na plataforma; 0 execuções na base real porque ainda não há uso real):
* tema.aprovado, tema.ajuste
* revisao.aprovada, revisao.ajuste
* cliente.aprovou, cliente.ajuste, cliente.notificado_aprovacao
* producao.concluida, ajuste.concluido
* etapa.agendada, etapa.movida_manual
* conteudo.agendado
* material.pendente
* tarefa.atribuida, tarefa.sem_responsavel
* comentario.cliente, mencao
* onboarding.concluido, onboarding.formulario_incompleto
* chat.converter
* reuniao.itens, reuniao.reservada
* cliente.novo, crm.fechado

**IMPLEMENTADA, MAS AGUARDANDO CONFIGURAÇÃO** (dependem do cron ou de hospedagem persistente):
* etapa.disponivel
* prazo.proximo, prazo.vencido
* cliente.sem_resposta_24h, cliente.sem_resposta_48h, cliente.sem_resposta_72h
* processo.parado
* onboarding.item_atrasado
* crm.followup
* financeiro.atraso, financeiro.vencimento
* relatorio.semanal
* insights.detectar (também roda ao abrir a Torre ou a Visão geral)
* meta.publicar (depende também da Meta)
* insights.narrativa (depende da chave do Claude)

**NÃO IMPLEMENTADA:**
* ciclo.criar
* drive.material
* estoque.videos
* reuniao.extracao_ia, reuniao.resumo_cliente
* slack.espelhar
* brain.feedback
* previsao.atraso

## 17. Integrações

| Integração | Situação |
|---|---|
| Google Calendar | AGUARDANDO CONFIGURAÇÃO |
| Google Meet | NÃO IMPLEMENTADA |
| Google Drive | NÃO IMPLEMENTADA |
| Slack | AGUARDANDO CONFIGURAÇÃO (o espelhamento não foi implementado) |
| Notion | PARCIAL (importação somente leitura por exportação; sem sincronização, por decisão) |
| Meta/Instagram | AGUARDANDO CONFIGURAÇÃO |
| E-mail (Resend) | AGUARDANDO CONFIGURAÇÃO |
| Anthropic/Claude | AGUARDANDO CONFIGURAÇÃO |
| Obsidian (fonte de conhecimento opcional) | AGUARDANDO CONFIGURAÇÃO |

## 18. Testes

* **Testes automáticos:** 10, e todos passam (process engine, versões, permissões, auditoria, mídia, trava de rotinas, atrasos, comentário → ajuste, regra de aprovação, causa raiz)
* **E2E automatizado no repositório:** não existe. As telas foram conferidas com scripts de navegador (Playwright) feitos a cada bloco, fora do repositório.
* **Permissões:** testadas pela API a cada bloco (CEO, Operações, Gestão, Design, Comercial e Cliente)
* **Mobile:** conferido em parte das telas
* **Regressão:** as telas principais respondem normalmente a cada bloco, e a suíte automática foi rodada a cada mudança
* **Base real:** todas as contagens e visões conferidas em cópias da base real; nenhuma mudança de teste foi para a base real
* **Ainda não validado:**
  * portal com cliente real;
  * Reuniões, CRM, Financeiro e Chat com uso real;
  * upload de vídeo em hospedagem persistente;
  * cron em produção;
  * envio de e-mail;
  * mobile em todas as telas.

## 19. Dados reais atuais (base mestra)

| Dado | Quantidade |
|---|---|
| Clientes | 24 (23 externos + 1 interno: THE BOLD) |
| Equipe | 10 pessoas |
| Usuários de cliente | 1 (convite pendente) |
| Conteúdos | 451 (todos migrados do Notion) |
| Tarefas | 692 (todas migradas; 0 concluídas) |
| Itens legados em revisão de atraso | 144 |
| Histórico do Notion (CR EDITORIAL) | 3.783 itens |
| Client Brain | 1.415 entradas |
| Respostas de onboarding | 847 |
| Ciclos | 45 |
| Canais | 24 |
| Pontos de migração abertos | 251 |
| Registros no log | 545 |
| Versões, arquivos, comentários, aprovações, ajustes | 0 |
| Reuniões, mensagens | 0 |
| Negócios (CRM), contratos, faturas | 0 |
| Eventos de performance válidos | 0 |
| Integrações conectadas | 0 |

## 20. Pontos abertos

**🔴 Decisões que você precisa tomar**
* Hospedagem persistente — aprovar o plano depois da auditoria arquitetural
* Status dos 22 clientes "a confirmar"
* Pontos de migração abertos — equipe, duplicados e escopo
* Regras financeiras — Recebimentos, Repasses e Rentabilidade

**🟡 Configurações e acessos que dependem de você**
* `CRON_SECRET`
* `RESEND_API_KEY` + `BOLD_MAIL_FROM` (com domínio verificado)
* `ANTHROPIC_API_KEY`
* Google (OAuth para Calendar)
* Slack (OAuth)
* Meta (app para publicação)
* Domínio próprio
* E-mails dos 22 clientes sem acesso, ou confirmação do candidato da Dreams Brand

**🔵 Próximos blocos (ordem recomendada)**
1. Aplicar as decisões já enviadas:
   * itens legados com as 3 ações;
   * "dados migrados não geram pendência";
   * campo de origem explícito no modelo;
   * filtro de linhas vazias;
   * importação auditada dos calendários extras;
   * auditoria arquitetural do Railway.
2. Bloco 6 — Equipe e Performance (eventos válidos, sem score)
3. Hospedagem persistente (depois da sua aprovação)
4. Regras financeiras → Bloco 7 — Negócio e Recebimentos
5. BOLD Chat / Slack
6. Google Calendar + Meet
7. Revisão inteligente, notificações por e-mail/push e Brain
