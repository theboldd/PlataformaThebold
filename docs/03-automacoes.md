# 03 · Automações

Gerado de `server/engine/automations.js` (`node scripts/gen-automations-doc.mjs`). Toda execução é registrada em **AutomationRuns** e no **histórico**.

Classes: 1 = simples · 2 = baseada em regras · 3 = precisa de IA · 4 = precisa de aprovação humana.

## MVP (30)

| Evento | Condição | Ação | Responsável | Notificação | Prazo | Motor | Classe | Status |
|---|---|---|---|---|---|---|---|---|
| **Etapa iniciada**<br><sub>`tarefa.atribuida`</sub> | Função da etapa tem pessoa vinculada ao cliente | Criar tarefa, atribuir por função (menor carga), definir prazo pelo ciclo | Função da etapa | Responsável (info, agrupada) | Marco do ciclo ou SLA | Regra determinística | Regras | ✅ implementada |
| **Cliente aprovou tema**<br><sub>`tema.aprovado`</sub> | Etapa = aprovação do tema | Registrar aprovação → criar trilhas de produção (design/edição + legenda) | Designer/Editor + Copy | Responsáveis + estrategista | Marco “produção” | Regra determinística | Regras | ✅ implementada |
| **Cliente comentou/pediu ajuste no tema**<br><sub>`tema.ajuste`</sub> | Comentário com pedido | Voltar para ajuste do cronograma com o pedido anexado | Estrategista | Estrategista (atenção) | Marco “leitura de comentários” | Regra determinística | Regras | ✅ implementada |
| **Última trilha de produção entregue**<br><sub>`producao.concluida`</sub> | Arquivo final + legenda presentes | Travar versão → criar revisão interna | Revisão (Rebeca/Raísa) | Revisores (agrupada) | Marco “revisão produção” | Regra determinística | Regras | ✅ implementada |
| **Revisão solicitou ajuste**<br><sub>`revisao.ajuste`</sub> | — | Criar ajuste interno para quem produziu (ou pessoa escolhida) | Produtor | Produtor | Marco “ajustes equipe” | Regra determinística | Regras | ✅ implementada |
| **Ajuste concluído**<br><sub>`ajuste.concluido`</sub> | Nova versão criada | Retornar para revisão (interno) / conferência ou cliente (ajuste do cliente) | Revisor / Estrategista | Revisor | SLA 1 dia útil | Regra determinística | Regras | ✅ implementada |
| **Revisão interna aprovada**<br><sub>`revisao.aprovada`</sub> | — | Enviar versão ao cliente (feed) e travar versão | Cliente | Cliente (agrupada por lote) | Marco “cliente aprova final” | Regra determinística | Regras | ✅ implementada |
| **Conteúdo entrou em “aguardando cliente”**<br><sub>`cliente.notificado_aprovacao`</sub> | — | Notificar cliente no portal (agrupado) | Cliente | Cliente | — | Regra determinística | Simples | ✅ implementada |
| **Cliente aprovou conteúdo**<br><sub>`cliente.aprovou`</sub> | Versão enviada | Congelar versão aprovada → liberar agendamento | Agendamento (Vivian) | Agendamento + estrategista + Vitória | Até 2h antes da publicação | Regra determinística | Regras | ✅ implementada |
| **Cliente solicitou ajuste**<br><sub>`cliente.ajuste`</sub> | Texto obrigatório | Criar ajuste do cliente → produtor; status “ajuste solicitado” | Produtor | Produtor + estrategista | Marco “ajustes cliente” | Regra determinística | Regras | ✅ implementada |
| **Agendamento confirmado**<br><sub>`conteudo.agendado`</sub> | Versão aprovada existe | Meta conectada: publicar no horário; senão: marcar agendado externamente | Agendamento | — | Data/hora definida | Regra determinística | Regras | ✅ implementada |
| **Horário de publicação chegou**<br><sub>`meta.publicar`</sub> | Meta conectada e conteúdo agendado via Meta | Criar container e publicar via Instagram Graph API; confirmar status | Sistema | Agendamento (sucesso/erro) | Horário agendado | Regra determinística | Regras | ✅ implementada |
| **Conteúdo bloqueado por material do cliente**<br><sub>`material.pendente`</sub> | Motivo informado | Criar pendência do cliente com o que falta | Cliente / Atendimento | Cliente | Antes do marco de produção | Regra determinística | Regras | ✅ implementada |
| **Prazo de tarefa em < 24h**<br><sub>`prazo.proximo`</sub> | Tarefa aberta | Alertar responsável (uma vez) | Responsável | Responsável (atenção) | — | Regra determinística | Simples | ✅ implementada |
| **Prazo de tarefa ultrapassado**<br><sub>`prazo.vencido`</sub> | Tarefa aberta | Alerta de risco + entra no Centro de Pendências | Responsável | Responsável (urgente) + Vitória | — | Regra determinística | Regras | ✅ implementada |
| **Cliente 24h sem responder aprovação**<br><sub>`cliente.sem_resposta_24h`</sub> | Etapa de cliente | Lembrete ao cliente no portal (régua: dia seguinte) | Cliente | Cliente | — | Regra determinística | Regras | ✅ implementada |
| **Cliente 48h sem responder**<br><sub>`cliente.sem_resposta_48h`</sub> | Etapa de cliente | Follow-up para o atendimento com texto pronto para WhatsApp | Atendimento (Vivian) | Atendimento (atenção) | 1 dia útil | Regra determinística | Regras | ✅ implementada |
| **Cliente 72h sem responder**<br><sub>`cliente.sem_resposta_72h`</sub> | Etapa de cliente | Escalar para Operações / CEO | Operações | Vitória + Rebeca (urgente) | — | Regra determinística | Regras | ✅ implementada |
| **Tarefa criada sem responsável**<br><sub>`tarefa.sem_responsavel`</sub> | Função sem pessoa vinculada | Pendência crítica + notificação | Operações | Vitória (urgente) | Imediato | Regra determinística | Regras | ✅ implementada |
| **Conteúdo parado > 3 dias úteis na mesma etapa interna**<br><sub>`processo.parado`</sub> | Não bloqueado | Alertar Operações | Operações | Vitória (atenção) | — | Regra determinística | Regras | ✅ implementada |
| **Novo cliente cadastrado**<br><sub>`cliente.novo`</sub> | — | Iniciar onboarding: projeto, ficha, checklist (formulário, materiais, acessos), canal do cliente | Atendimento | Equipe vinculada | Semana 1–4 | Regra determinística | Regras | ✅ implementada |
| **Item de onboarding passou do prazo**<br><sub>`onboarding.item_atrasado`</sub> | Pendente | Pendência + lembrete a quem precisa enviar | Cliente ou equipe | Cliente / atendimento | — | Regra determinística | Regras | ✅ implementada |
| **Formulário de onboarding com campos faltantes**<br><sub>`onboarding.formulario_incompleto`</sub> | Campos obrigatórios vazios | Pendência com a lista exata do que falta | Cliente | Cliente + atendimento | — | Regra determinística | Regras | ✅ implementada |
| **Todos os itens obrigatórios recebidos**<br><sub>`onboarding.concluido`</sub> | — | Marcar onboarding concluído, status do cliente → ativo, criar ciclo | Estrategista | Estrategista + Rebeca | — | Regra determinística | Regras | ✅ implementada |
| **Alguém foi @mencionado**<br><sub>`mencao`</sub> | Pessoa autorizada no contexto | Notificar a pessoa mencionada | Mencionado | Mencionado | — | Regra determinística | Simples | ✅ implementada |
| **Mensagem marcada como tarefa/pendência/decisão/ajuste**<br><sub>`chat.converter`</sub> | Ação humana | Criar registro oficial vinculado à mensagem | Escolhido | Responsável | Definido | Humano | Aprovação humana | ✅ implementada |
| **Cliente comentou em conteúdo**<br><sub>`comentario.cliente`</sub> | — | Notificar estrategista da conta (agrupado) | Estrategista | Estrategista | — | Regra determinística | Simples | ✅ implementada |
| **Cliente reservou horário**<br><sub>`reuniao.reservada`</sub> | Horário livre (sem conflito) | Criar reunião, convidados, evento Google Calendar (se conectado) | Equipe da conta | Participantes + cliente | — | Regra determinística | Regras | ✅ implementada |
| **Ata registrada com ações**<br><sub>`reuniao.itens`</sub> | Ação com responsável | Criar tarefa com origem reunião | Responsável | Responsável | Prazo informado | Regra determinística | Regras | ✅ implementada |
| **A cada 15 minutos**<br><sub>`insights.detectar`</sub> | — | Detectores determinísticos de gargalo, retrabalho, carga, espera | Sistema | Torre de Controle | — | Regra determinística | Regras | ✅ implementada |

## V2 (12)

| Evento | Condição | Ação | Responsável | Notificação | Prazo | Motor | Classe | Status |
|---|---|---|---|---|---|---|---|---|
| **Transcrição disponível**<br><sub>`reuniao.extracao_ia`</sub> | Consentimento registrado | Claude extrai decisões/ações/prazos (sugestões) + resumos | Anfitrião confirma | Anfitrião | 24h úteis | Claude (IA) | IA | ◻ planejada |
| **Resumo do cliente aprovado**<br><sub>`reuniao.resumo_cliente`</sub> | Aprovação interna | Publicar no portal e notificar | Aprovador | Cliente | — | Humano | Aprovação humana | ◻ planejada |
| **Próxima ação do negócio venceu**<br><sub>`crm.followup`</sub> | Negócio aberto | Criar tarefa de follow-up para o dono | Comercial | Dono do negócio | Hoje | Regra determinística | Regras | ✅ implementada |
| **Negócio fechado**<br><sub>`crm.fechado`</sub> | — | Criar cliente e iniciar onboarding | Operações | Rebeca + Vitória | — | Humano | Aprovação humana | ✅ implementada |
| **Parcela vencida sem pagamento**<br><sub>`financeiro.atraso`</sub> | — | Marcar atrasada, alertar financeiro | Comercial/Financeiro | Financeiro + Rebeca | — | Regra determinística | Regras | ✅ implementada |
| **Parcela vence em 3 dias**<br><sub>`financeiro.vencimento`</sub> | — | Alertar financeiro | Financeiro | Financeiro | — | Regra determinística | Simples | ✅ implementada |
| **Insight detectado**<br><sub>`insights.narrativa`</sub> | IA configurada | Claude explica causa provável e sugere ação | Sistema | — | — | Claude (IA) | IA | ✅ implementada |
| **Segunda-feira 08h**<br><sub>`relatorio.semanal`</sub> | — | Gerar relatório de operação, produção, clientes e riscos | Sistema | Rebeca + Vitória | — | Regra determinística | Regras | ✅ implementada |
| **Estoque de vídeos brutos do cliente < 1 mês**<br><sub>`estoque.videos`</sub> | Contagem de materiais | Pendência de gravação presencial | Estrategista | Estrategista + atendimento | — | Regra determinística | Regras | ◻ planejada |
| **Início do ciclo (dia 25 do mês M-2)**<br><sub>`ciclo.criar`</sub> | Cliente ativo | Criar ciclo e cards de cronograma conforme pacote mensal | Estrategista | Estrategistas | Marco cronograma | Regra determinística | Regras | ◻ planejada |
| **Arquivo novo na pasta de materiais do cliente**<br><sub>`drive.material`</sub> | Drive conectado | Vincular ao cliente/ciclo e atender requisito de material | Estrategista | Estrategista | — | Regra determinística | Regras | ◻ planejada |
| **Etapa-chave concluída**<br><sub>`slack.espelhar`</sub> | Slack conectado | Publicar resumo em #aprovações (transição) | Sistema | Canal | — | Regra determinística | Simples | ◻ planejada |

## V3 (2)

| Evento | Condição | Ação | Responsável | Notificação | Prazo | Motor | Classe | Status |
|---|---|---|---|---|---|---|---|---|
| **Feedback recorrente de cliente**<br><sub>`brain.feedback`</sub> | IA configurada | Sugerir regra/preferência para o Client Brain | Estrategista aprova | Estrategista | — | Claude (IA) | IA | ◻ planejada |
| **Diário**<br><sub>`previsao.atraso`</sub> | Histórico suficiente | Prever conteúdos com risco de atraso | Sistema | Torre | — | Claude (IA) | IA | ◻ planejada |

