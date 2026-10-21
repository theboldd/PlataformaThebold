# 06 · Área do cliente — experiência premium ligada à operação

**Regra central:** toda ação do cliente gera AÇÃO → REGISTRO → PROCESSO → RESPONSÁVEL → PRÓXIMO PASSO → NOTIFICAÇÃO → HISTÓRICO.
O cliente vê clareza; a equipe vê operação. Nenhuma tela existe só visualmente.

## 1. Auditoria (antes de implementar)
Já existia e foi **reaproveitado** (não recriado): aprovação por like com usuário/IP/versão e congelamento; ajustes com página e timestamp; versionamento V1…Vn;
Process Engine (atribuição por função, prazos pelo ciclo, régua 24/48/72h); onboarding “Sua marca” com as perguntas reais do Notion e migração com procedência;
materiais; reunião com Google Calendar; chat do cliente; histórico append-only; permissões no backend.

Lacunas encontradas e corrigidas:
| Lacuna | Correção |
|---|---|
| Versão antiga continuava “aprovada” depois de nascer V+1 | `editableVersion` marca a anterior como `substituida` e grava o motivo da nova versão |
| Comentário era convertido em ajuste por detecção automática | Três ações separadas: ♡ aprovar · ✎ pedir ajuste · 💬 comentar/perguntar. Comentário nunca aprova nem ajusta |
| Like aprovava sem confirmação | `POST /portal/contents/:id/approve` exige `confirm: true` e a versão exata (409 se chegou versão nova) |
| Clientes migrados nunca viam o que faltava | % do perfil e “só o que falta” para todos (inclui `form_status=migrado_parcial`); respostas do Notion com o selo “Migrado do Notion” |
| `meetings.summary` (ata interna) era enviado ao portal | Portal só mostra o **resumo do cliente aprovado** (`meeting_summaries`) |
| Rascunhos internos (“V2 criada”) apareciam no histórico do cliente | `versao.criada` passou a ser interno |
| Materiais podiam ficar “soltos” | Todo envio exige contexto; material avulso vira solicitação |

## 2. O que foi construído
| Área | Onde |
|---|---|
| **Meu Momento Bold** (AGORA · VOCÊ · THE BOLD · DEPOIS · HISTÓRICO) | `services/client-view.js`, `GET /portal/home`, `portal/Inicio.jsx` |
| Jornada em 6 etapas (Planejamento → Publicação) | `journey()` — traduz as etapas do engine |
| Precisamos de você / Você precisa fazer (prazo real da tarefa de aprovação) | `clientActions()` |
| The Bold está cuidando (sem nomes, prioridades ou bloqueios) | `boldIsDoing()` |
| Central de Decisões (decisões pedidas pela equipe + aprovações, materiais, confirmações) | `client_decisions`, `portal/Decisoes.jsx`, aba **Decisões** no dossiê |
| Conteúdos: confirmação, prazo, versões (atual/substituída/aprovada), ajuste estruturado (tipo, página, tempo do vídeo, ponto na imagem), pergunta | `portal/Feed.jsx`, `MediaView` (pinos), `adjustments.aspect/region` |
| + Nova solicitação e status simples | `client_requests`, `services/requests.js`, `portal/Solicitacoes.jsx`, aba **Solicitações** |
| Sua marca, como a The Bold entende + “Isso ainda está correto?” | `client_brain_entries.shared`, `brand_confirmations`, `client_brain_history`, `portal/Marca.jsx` |
| Pulso da marca (só publicado e com dados reais) | `brand_pulse`, aba **Marca & Pulso** |
| Pós-reunião: transcrição → resumo do cliente + resumo interno, verificação de vazamento, aplicação item a item | `meeting_transcripts`, `meeting_summaries`, `services/meeting-summaries.js`, painel em Reuniões |
| Pauta visível, participantes, Google Meet no convite | `meetings.agenda`, `conferenceData` no Google Calendar |
| Conteúdo incorporado na conversa | `messages.ref_type/ref_id` (cliente só vê se o conteúdo for visível a ele) |
| Notificações com “o que aconteceu · por que importa · [FAZER AGORA →]” | `notifications.cta` |
| Cliente não respondeu (prazo real, intervalo e limite de lembretes, impacto, escalada) | `scheduler.js` → `cliente.prazo_vencido`; settings `lembrete_cliente_intervalo_horas`, `lembrete_cliente_max` |
| Saúde do cliente (interno, com evidências e tendência) | `services/health.js`, `client_health_snapshots`, aba **Saúde** |
| Satisfação contextual (no máximo a cada 14 dias) | `satisfaction_prompts/responses` |
| Histórico com link para o registro original | `clientHistory()`, `portal/Historico.jsx` |
| Modo claro e escuro | tema salvo por usuário (`lib/theme.js`, botão no topo) + `portal-x.css` |

## 3. Procedência das informações (nunca misturadas)
`client_brain_entries.origin` + `source_type`:
- **Cliente · migrado do Notion** — `onboarding_cliente` + `notion`/`notion_onboarding`
- **Cliente · preenchido na plataforma** — `onboarding_cliente` + `plataforma`/`onboarding`, ou `cliente` (atualização em “Sua marca”)
- **The Bold · equipe** — `equipe` · **Observação interna** — `observacao_interna`
- **IA · sugestão (não oficial)** — `ia` · **Decisão** — `decisao` (resposta do cliente na Central de Decisões)

Observação interna, IA e origem indefinida **não podem** ser compartilhadas com o cliente (bloqueado no backend).
Alteração de valor grava antes/depois em `client_brain_history` e no histórico.

## 4. Testes
- `npm test` — 19 testes: engine, permissões, mídia e **12 testes da área do cliente pelo HTTP real** (login, cookie, CSRF), incluindo acesso cruzado entre clientes, rotas internas negadas ao cliente, notificações internas nunca entregues ao cliente e vazamento do resumo interno.
- `npm run ux` — roteiro no Chromium (celular 390px escuro e desktop 1440px claro): saudação, onde está, o que precisa, prazo, o que a The Bold faz, o que vem depois, aprovação em 3 toques, ajuste marcando a imagem, nova solicitação, sem rolagem horizontal, sem erros de JS. 32/32.
Ambos rodam num **banco temporário** com equipe e cliente de teste descartáveis — a base real nunca é usada nem alterada.

## 5. Limites conhecidos e pendências
1. **Auditoria de ponta a ponta com cliente real:** a base real está cifrada (`real-snapshot/bold.db.enc`) e a chave não está no repositório. Falta rodar o roteiro LOGIN → … → HISTÓRICO com um cliente real de teste autorizado.
2. **Transcrição do Meet:** a conta Google é Gmail (sem Workspace). A plataforma detecta a transcrição anexada ao evento quando ela existe, mas o escopo atual não lê documentos do Drive: a equipe cola o texto. Com Workspace + escopo `drive.readonly`, a leitura vira automática.
3. **IA:** sem `ANTHROPIC_API_KEY`, os resumos são escritos à mão (o fluxo de aprovação é o mesmo). Nada é simulado.
4. **Migração do Notion:** o importador (`npm run migrar:notion`) já preserva procedência e registra conflitos; o levantamento (`storage/migration/notion`) fica fora do git. A tela de onboarding agora mostra ao cliente migrado exatamente o que já existe e o que falta.

## 6. Validação real (TESTE_E2E_BLOCO_4)
`npm run e2e:bloco4` (precisa de `BOLD_SNAPSHOT_KEY`) roda o fluxo completo sobre uma **cópia isolada** da base real:
- bloqueia toda chamada de rede externa;
- marca tudo com `TESTE_E2E_BLOCO_4`;
- age com as pessoas reais que o engine atribui;
- remove o que foi criado e reverte o que foi alterado;
- prova o antes = depois tabela por tabela.

Registros sem origem comprovada não são apagados: aparecem no relatório como “incertos”. O relatório sai em `relatorio.json`, com as capturas de celular e desktop.

Correções feitas durante a preparação:
- a V2 que resolve o ajuste do cliente volta para o cliente aprovar;
- versão liberada sem o cliente nunca aparece como aprovada;
- comentário → ajuste só uma vez;
- mensagem do chat não vira o mesmo registro duas vezes;
- notificação de aprovação ligada ao conteúdo.
