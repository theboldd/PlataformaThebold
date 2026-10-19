# 04 · MVP e roadmap

## MVP (implementado nesta versão)
| # | Item | Onde |
|---|---|---|
| 1–3 | Login, usuários, permissões (role + usuário + cliente + módulo + ação) | `server/lib/auth.js`, `permissions.js`, tela Usuários |
| 4, 6 | Clientes + ficha / Client Brain | `routes/ops.js`, Clientes → dossiê |
| 5 | Dashboard por função (CEO, Operações, Revisão, Estratégia, Produção, Comercial, Cliente) | `/api/dashboard`, portal |
| 7–8 | Processos (quadro automático) + Process Engine | `engine/process.js`, tela Processos |
| 9–12 | Conteúdos, versões, aprovação, ajustes, tarefas automáticas | engine + Conteúdo (visão da equipe) |
| 13 | Notificações agrupadas por nível + tempo real (SSE) | `lib/core.js`, sino |
| 14 | Histórico append-only | `activity_logs`, tela Histórico |
| 15 | Área do cliente + **Feed de aprovação** | `routes/portal.js`, `web/src/portal` |
| 16 | Sala de Revisão | tela Revisão |
| 17–18 | Calendário + integração real com Google Calendar (OAuth; ativa ao configurar) | `/api/calendar`, `integrations/google.js` |
| 19 | Centro de Pendências (CEO + Operações) | `engine/intelligence.js` |
| 20–21 | Chat interno + chat com o cliente (threads, menções, arquivos, "transformar em…") | `routes/comms.js` |
| 22 | Torre de Controle | `/api/torre` |
| + | Onboarding automático, régua de cobrança 24/48/72h, sala de horários para reunião mensal, CRM e financeiro básicos, detectores de gargalo, relatórios, AI Gateway, Meta (publicação real quando conectada) | |

## V2
- **Reuniões:** sala de vídeo própria (LiveKit), gravação com consentimento, transcrição, resumos interno e do cliente com aprovação (spec em `docs/modulos/reunioes.md`).
- **Google Drive** completo (spec em `docs/integracoes/google-drive.md`).
- Agentes com ações sugeridas (rascunho de follow-up, legenda, pauta) e narrativa de insights com Claude.
- Importadores do Notion (quadros PROCESSO, DIVISÃO, CR EDITORIAL) e criação automática do ciclo mensal (`ciclo.criar`).
- Comentários com região na imagem e timestamp no vídeo, com marcação visual (o schema já guarda `anchor`/`region`).
- Push (PWA) e e-mail transacional. Notificações de resumo diário às 8h45 (como a Central de Clientes atual).
- Relatórios agendados por e-mail.
- Migração para Postgres + storage S3/R2/Drive.

## V3
- The Bold Brain com busca semântica sobre decisões, reuniões e documentos permitidos.
- Client Brain avançado (sugestões de preferências a partir de feedbacks recorrentes).
- Análise preditiva de atraso, previsão de capacidade da equipe e performance de conteúdo (Insights da Meta).
- Teste A/B de memória: banco × Obsidian × sistema próprio.

## Pendências de decisão (precisam de resposta da The Bold)
1. Google **Workspace ou Gmail?** Define o escopo do Drive, o Shared Drive e a gravação/transcrição do Meet.
2. Fonte editorial oficial (arquivo `.woff2`) e logo vetorial. `[PLACEHOLDER]` em `web/src/styles/tokens.css`.
3. A Vivian deve ver o Centro de Pendências?
4. Prazo formal de aprovação de arte/vídeo pelo cliente (hoje: 27–28 + régua).
5. Depois do ajuste do cliente, a nova versão volta ao cliente (padrão) ou vai direto para agendamento (processo atual)?
6. Acesso ao MindMeister para validar as etapas.
