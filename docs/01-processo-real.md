# 01 · O processo real da The Bold (reconstruído)

Fontes analisadas em 19/10/2026, em modo **somente leitura**:
- **Notion:** quadros "Controle produção" (SET/OUT/NOV), "PADRÃO", "Controle INÍCIO CLIENTE", "CONTROLE DE APROVAÇÕES", CR EDITORIAL, DIVISÃO, MEMÓRIA, Central de Clientes e CRM.
- **Slack:** os principais canais.
- **Google Calendar:** ~250 eventos, de 30/09 a 25/11.
- **PDFs postados no Slack:** "PROCESSO THE BOLD 2026" (export do mapa mental) e "Como a The Bold Funciona".

> **MindMeister:** os links encontrados (mm.tt/2874791028 e mindmeister.com/app/map/3911031267) **não estavam acessíveis** neste ambiente, porque não há conector. O processo foi reconstruído pelo PDF "PROCESSO THE BOLD 2026", que parece ser um export do mapa. É preciso validar com a equipe se o mapa tem passos além do PDF.

## 1. Pessoas e funções (como operam hoje)

| Pessoa | Função real observada | Perfil na plataforma |
|---|---|---|
| Rebeca | CEO. Direção, qualidade, análise de cronograma e produção, reuniões com clientes | `ceo` (+ função `revisao`) |
| Vitória | Processos, IA e automações. Coordenação dos avisos de aprovação. Destinatária fixa dos alertas | `operacoes` |
| Vivian | Gestão do fluxo, atendimento nos grupos, prazos, agendamento dos posts. Sobrecarregada | `gestao` (funções `atendimento`, `agendamento`) |
| Raísa | Controle de qualidade com a Rebeca, MKT jurídico, reuniões com clientes | `qualidade` (função `revisao`) |
| Juliane, Monique | Estrategistas (cronogramas, grupos, reuniões). Monique também faz design | `estrategia` |
| Felipe | Design | `design` |
| Nicole | Edição de vídeo e design | `edicao` |
| Léo | Edição de vídeo | `edicao` |
| Matheus | Comercial, financeiro, contratos | `comercial` |

## 2. Ciclo mensal (calendário operacional)

O ciclo de um mês **M** é preparado em **M-1**. Exemplo do ciclo NOVEMBRO/26, conforme o Calendar:

| Marco | Dias de M-1 | Chave no engine |
|---|---|---|
| Entrega de cronograma | 1 | `cronograma_entrega` |
| Revisão do cronograma (Rebeca + Raísa) | 2–4 | `revisao_cronograma` |
| Estrategistas ajustam | 5–6 | `ajuste_cronograma` |
| Clientes aprovam temas e enviam pendências | 8–15 | `cliente_aprova_temas` |
| Estrategistas leem comentários | 16 | `leitura_comentarios` |
| Produção (legenda, reels, design) | 16–22 | `producao` |
| Revisão da produção | 23–24 | `revisao_producao` |
| Ajustes da equipe | 25–26 | `ajustes_equipe` |
| "Dia em que tudo precisa estar pronto" | 27 | `tudo_pronto` |
| Liberação + clientes aprovam | 27–28 | `cliente_aprova_final` |
| Comentários e ajustes do cliente | 29–30 | `ajustes_cliente` |
| Agendamento | após aprovação | `agendamento` |

Esse calendário vira o `cycle_template`, editável em **Automações → Regras do processo**. Os prazos das etapas saem desses marcos. Quando o marco já passou ou o conteúdo é avulso, vale o SLA em dias úteis. O prazo nunca ultrapassa a data de publicação.

## 3. Etapas (do quadro do Notion para o Process Engine)

| Coluna no Notion hoje | Etapa no engine | Quem age | Observação |
|---|---|---|---|
| Cronograma | `cronograma` | Estrategista | O card agora é **por conteúdo**, e não por cliente × tipo |
| Análise cronograma | `analise_cronograma` | Rebeca/Raísa | Pode ser desligada: o PDF diz "em breve não teremos essa fase" |
| Aguardando ajustes | `ajuste_cronograma` | Estrategista | |
| Cronograma pronto → Aprovação dos Clientes | `aprovacao_tema` | Cliente | 1º portão do cliente |
| Legenda / Design X / Edição de vídeo X | `producao` com **trilhas** (legenda + design ou edição) | Função atribuída automaticamente | Acabam as colunas por pessoa |
| Análise produção | `analise_producao` | Rebeca/Raísa | |
| (ajuste) → Ajustados pós análise | `ajuste_interno` → volta para `analise_producao` | Quem produziu | |
| *(não existia)* | `aprovacao_cliente` | Cliente | 2º portão. Hoje acontece por comentário no Notion ou no WhatsApp |
| *(implícito)* | `ajuste_cliente` → `revisao_ajuste` | Produtor → estrategista confere | PDF, passo 12 |
| Para agendamento | `agendamento` | Vivian | |
| Agendado | `agendado` | — | |
| *(não existia)* | `publicado` | Sistema/Meta ou confirmação | |
| Pendente por material | **bloqueio** (`blocked` + motivo + `waiting_on`) | Cliente/equipe | O motivo é **obrigatório**. Antes, o card ficava parado sem dizer o que faltava |

## 4. Onboarding (cliente novo)

Fonte: MEMÓRIA → CLIENTE NOVO e o manual.
1. Qualificação e proposta.
2. Reunião com a Rebeca.
3. Grupo do cliente.
4. Dados de contrato, plano e identidade visual.
5. Pasta de material.
6. Contrato.
7. Aniversário no calendário.
8. Formulário de acessos.

Depois vêm as semanas 1 a 4 (onboarding → diagnóstico → primeiro cronograma → produção). A publicação começa no 2º mês.
Na plataforma, isso vira o checklist automático criado em `startClient()`, com itens formulário/material/acesso/interno, quem envia, prazo por semana e baixa automática quando o cliente responde no portal.

## 5. Comunicação (Slack/WhatsApp)

Padrões informais que **viram registros oficiais** na plataforma:

| Hoje (informal) | Na plataforma |
|---|---|
| "@Designer ajuste no post do dia 26/10… já na aba de processos" | Ajuste com responsável, prazo e versão |
| "isso foi arrastado na área processo?" | Desnecessário: o engine move o card |
| "cliente vai enviar novos takes…" / "Pendente por material" sem motivo | Bloqueio com motivo, pendência do cliente e upload no portal que desbloqueia |
| "cliente com mais de 24h sem resposta…" | Régua automática de 24/48/72h, follow-up com texto pronto e escalada |
| "consta você como responsável na divisão…" | Equipe por cliente e por função (fonte única) |
| Aprovação por comentário ou WhatsApp | Aprovação no feed (usuário, data/hora, IP, versão) ou registro pela equipe com origem obrigatória |
| #pendências-*, #resumo-reuniões criados e nunca usados | Centro de Pendências derivado do estado + Central de Reuniões |

## 6. Conflitos e ambiguidades encontrados (decisões tomadas e pontos em aberto)

1. **Responsável em 3 fontes** (DIVISÃO, RESPONSÁVEIS POR CLIENTE, campos do CR EDITORIAL e, além disso, o nome da coluna).
   → **Decisão:** a fonte única passa a ser `client_members` (cliente × pessoa × função).
2. **Card por cliente × tipo** (quadro) × **por conteúdo** (manual).
   → **Decisão:** por conteúdo. Cada conteúdo tem trilhas de produção.
3. Os status do Controle de Aprovações divergem dos da tabela de gatilhos.
   → **Decisão:** um único vocabulário de status (`publicStatus`).
4. **Aprovação por comentário vale?**
   → **Decisão:** vale só se registrada. Ou o cliente clica, ou a equipe registra "em nome do cliente" informando a origem, e tudo fica auditado.
5. **Não há prazo formal para aprovar arte/vídeo.**
   → **Decisão:** marco `cliente_aprova_final` (27–28) + régua de 24/48/72h. ❓ Confirmar com a Rebeca.
6. **Vivian × Vitória.** As notificações vão para Vitória/Rebeca, mas quem opera é a Vivian. O pedido diz "Centro de Pendências: só Rebeca + Vitória".
   → **Implementado assim.** A Vivian recebe follow-ups e tarefas de agendamento e atendimento. ❓ Avaliar se a Vivian também deve ver o Centro de Pendências.
7. **Calendário de referência do manual** (dia 7 cliente, 18–25 produção) **≠ Calendar atual** (8–15, 16–22).
   → **Decisão:** usar o Calendar atual (configurável).
8. **Reenvio ao cliente após ajuste.** O processo real manda direto para agendamento depois da conferência da estrategista. O pedido exige aprovação da versão final.
   → **Configurável** (`reenviar_cliente_apos_ajuste`, padrão: sim). Ajuste marcado como "simples" volta direto ao cliente.
9. **Material fora do prazo** ("vai para a semana seguinte ou para o mês seguinte?"). Quem decide é a Vivian.
   → Escalada de 72h para Operações com essa pergunta. ❓ Formalizar a regra.
10. **Dezembro:** formulário no lugar da reunião mensal.
    → Previsto como "reunião assíncrona" (V2, spec de Reuniões).
11. **MindMeister inacessível.** Validar se há etapas além do PDF.
