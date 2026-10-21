# THE BOLD OS — Regras oficiais do projeto

Decisões tomadas pela CEO (Rebeca) em 21/10/2026 (regras 1–10) e complementadas no mesmo dia (11–22). Valem para todo o código, os dados e os próximos blocos.
Quando uma regra daqui conflitar com um pedido antigo, **esta vale**.

## 1. Hospedagem: Railway
- A aplicação vai para o **Railway**.
- Nenhuma migração estrutural nem mudança de banco por causa dessa decisão. Primeiro vem o relatório de arquitetura (`docs/08-arquitetura-railway.md`); a migração só acontece depois da validação.
- As rotinas automáticas precisam funcionar **com ninguém usando a plataforma**.
- Nenhuma migração irreversível sem validação.

## 2. Divisão de clientes
- **Ver** a Divisão: só a Rebeca e quem ela autorizar explicitamente.
- Quem for autorizado pode ver, adicionar e remover clientes, editar a divisão e gerenciar os acessos ligados a ela.
- A equipe comum **não vê** essa área. Cliente também não.
- A proteção fica no **backend**: sem permissão, nem a URL nem a API devolvem dados.
- Toda alteração registra quem alterou, o quê, data e hora, valor anterior e valor novo.

## 3. "Isa" = Raísa
- Onde um requisito falar em "Isa" no contexto da revisão interna, é a **Raísa** (perfil Qualidade).
- Não se cria pessoa nova nem cadastro duplicado.

## 4. Logins dos clientes
- O e-mail vem só de **dados reais** (Notion e plataforma), com a **origem registrada**.
- Cliente com e-mail válido: o acesso é preparado (usuário de perfil CLIENTE, ligado ao cliente certo).
- Cliente sem e-mail: **nada é inventado nem criado**. O acesso fica **SEM E-MAIL (pendente)**.
- Status do acesso: **ACESSO ATIVO**, **CONVITE PENDENTE**, **SEM E-MAIL**, **BLOQUEADO**.
- A tela administrativa "Acessos dos clientes" mostra cliente, e-mail, usuário, status, origem do e-mail, último acesso e permissão.

## 5. Onboarding dos clientes existentes vem do Notion
- O onboarding de quem já é cliente **não começa vazio**.
- O que existe no Notion é importado, e o que não existe fica vazio.
- Proibido inventar, inferir ou completar com IA.
- Nunca pedir de novo ao cliente o que ele já respondeu.
- A origem fica registrada como **"MIGRADO DO NOTION"**, com link para a página de origem sempre que possível.

## 6. Onboarding parcial
- Entra só o que foi preenchido (ex.: 22 de 30). Os campos vazios ficam vazios.
- O cliente completa o que falta pela plataforma.

## 7. Cliente sem login
- A falta de e-mail não bloqueia a migração. Dados, onboarding, Client Brain e histórico são migrados normalmente.
- Só o acesso do cliente fica como **SEM E-MAIL**.

## 8. Dados reais, sempre
- Proibido: clientes, tarefas, pessoas, números, indicadores, e-mails e histórico fictícios.
- Sem histórico suficiente, a tela mostra **DADOS INSUFICIENTES** e não inventa métrica. Vale em especial para performance, confiabilidade, rentabilidade, capacidade, tendências e saúde dos clientes.

## 9. Performance
- A falta de histórico de execução hoje é aceitável. Não se cria histórico artificial.
- A coleta correta começa na implantação, e os indicadores aparecem com semanas ou meses de operação real.

## 10. Rito de cada bloco
AUDITAR → IDENTIFICAR O QUE JÁ EXISTE → REAPROVEITAR → IMPLEMENTAR SÓ O QUE FALTA → TESTAR → VALIDAR DADOS REAIS → VALIDAR PERMISSÕES → VALIDAR HISTÓRICO → PUBLICAR.

O relatório de cada bloco traz: **IMPLEMENTADO · REAPROVEITADO · DADOS UTILIZADOS · TESTES · PENDÊNCIAS · PRÓXIMO BLOCO**.
Nunca se avança sobre uma decisão que ainda depende da CEO.

## 11. Fonte de verdade
| Momento | Fonte |
|---|---|
| Antes da migração | **Notion** = fonte existente |
| Durante a migração | **Notion → The Bold OS** (só leitura do Notion, por exportação) |
| Depois da migração | **The Bold OS** = fonte de verdade |

- Não existe sincronização bidirecional com o Notion. Criar uma exige decisão específica da CEO.
- Uso normal da plataforma não altera nada no Notion. Escrita no Notion só quando a CEO pedir explicitamente. Hoje o código não tem nenhuma escrita no Notion.
- O calendário e o processo operam sobre o modelo de dados do The Bold OS. O Notion não é segunda fonte.

## 12. Atraso não é culpa: classificação operacional
- Item atrasado **não** é, por si só, atraso da responsável.
- Cada item atrasado herdado tem os **fatos** levantados por regra, cada um com a fonte, em **Revisão de atrasos** (`/atrasos`):
  - origem, cliente, conteúdo e etapa;
  - responsável atual e como foi definido, e responsável histórico;
  - data original e prazo (e de onde ele veio);
  - motivo, dependências, mudanças de responsabilidade e situação real;
  - evidência para atribuir.
- A categoria é escolhida por uma **pessoa autorizada** (permissão `atrasos`, só a CEO libera), com evidência escrita. A IA não decide causalidade.
- Categorias: ATRASO DO CLIENTE · AGUARDANDO CLIENTE · ATRASO DA EQUIPE · ATRASO DO RESPONSÁVEL · PROCESSO ANTIGO · DADO MIGRADO · RESPONSABILIDADE ALTERADA · SEM CONTEXTO · REPROGRAMADO · CANCELADO · OUTRO.
- Sem evidência, o item fica **SEM CONTEXTO / NÃO ATRIBUÍDO**. Atribuir à pessoa exige a evidência descrita.
- Nada é alterado ou excluído sem motivo. Toda classificação, reprogramação e cancelamento fica em `activity_logs`, com valor anterior e novo.

## 13. Proteção do histórico de performance
- Tarefa herdada da migração (`tasks.perf_status = migrado`) e tarefa classificada como não atribuível (`excluido`) **não alimentam**:
  - score de confiabilidade;
  - percentual de atraso;
  - comparação entre profissionais;
  - ranking;
  - alertas de performance;
  - indicadores de risco individual.
- Nesses casos, também não disparam aviso de "prazo vencido".
- Só entram em indicador individual as tarefas nascidas na plataforma e as classificadas como ATRASO DO RESPONSÁVEL. ATRASO DA EQUIPE conta só no agregado da equipe.
- Na operação, esses itens continuam visíveis, à parte, como "herdados da migração".

## 14. Aprovação do cliente
- Só existe **APROVADO** quando há **registro de aprovação do cliente na plataforma** (`contents.approved_version_id` + linha em `approvals`).
- Aprovação não registrada aparece como **APROVAÇÃO NÃO REGISTRADA**.
- Estar em "Para agendar" **não** significa que o cliente aprovou. A aprovação nunca é deduzida de etapa, de coluna antiga do Notion nem de qualquer outro sinal indireto.
- Os 144 conteúdos herdados de "Para agendamento" continuam **sem aprovação registrada**. Ficam fora das métricas de performance até a classificação (regras 12 e 13).

## 15. CR EDITORIAL do Notion = histórico somente leitura
- Os calendários "CR EDITORIAL" do Notion entram como **HISTÓRICO DO NOTION · SOMENTE LEITURA**, com a origem e o link de cada item.
- Eles **não**:
  - geram pendência, atraso, cobrança ou tarefa;
  - alteram etapas;
  - viram calendário editorial ativo;
  - substituem o calendário do The Bold OS.
- O calendário editorial oficial e operacional é o do The Bold OS. Não existe sincronização com esses calendários históricos.

## 16. THE BOLD = cliente interno
- "THE BOLD" continua na base, classificada como **CLIENTE INTERNO** (`clients.kind = interno`).
- Pode ter conteúdos, processos e histórico próprios, para a operação institucional da agência.
- **Não** aparece para clientes externos.
- **Não** conta como cliente externo em métricas comerciais, de carteira, de retenção, de receita ou de performance de clientes.

## 17. Dreams Brand
- `dreamsbrand.pi@gmail.com` é **E-MAIL CANDIDATO / AGUARDANDO CONFIRMAÇÃO**.
- Não é e-mail oficial de acesso: não se cria login e não se envia convite até a confirmação explícita da CEO.

## 18. Itens legados (os 144 herdados de "Para agendamento")
- Ficam como **LEGADO / MIGRADO DO NOTION — NÃO VALIDADO**.
- **Não** são: pendência, atraso, tarefa ativa, tarefa vencida, carga, sobrecarga, evento de performance, KPI, produtividade, capacidade, notificação, aprovação nem conteúdo operacional atual.
- Não se presume que foram cancelados, concluídos ou abandonados. Não há classificação em massa.
- Na Revisão de atrasos, uma pessoa autorizada analisa um a um. São só três ações:
  - **REPROGRAMAR:** volta à operação. Exige novo prazo, responsável, etapa e motivo, e registra quem fez e quando. A partir daí, é demanda operacional válida.
  - **ENCERRAR COMO CANCELADO:** ação explícita. Registra motivo, usuário, data, estado anterior e estado posterior.
  - **MANTER COMO HISTÓRICO:** o item fica preservado e totalmente fora da operação.

## 19. Dados migrados não geram nada automaticamente
- **DADOS MIGRADOS NÃO GERAM PENDÊNCIA AUTOMATICAMENTE.**
- Também não geram notificação, alerta, KPI, performance, capacidade nem inteligência, salvo regra explícita escrita aqui.
- Calendários históricos do Notion (CR EDITORIAL e equivalentes auditados) seguem a regra 15. Linhas vazias ficam guardadas no banco e só aparecem com o filtro "Mostrar registros vazios" (desligado por padrão).

## 20. Origem estrutural: migrado do Notion × nascido na plataforma
- Toda tarefa e todo conteúdo têm a origem gravada no banco: `data_origin = notion | plataforma`.
- KPIs, detectores, alertas, performance, capacidade e inteligência usam esse campo e não misturam as duas origens sem regra explícita.
- Item legado reprogramado passa a ter tarefa nascida na plataforma. O conteúdo continua com origem Notion, e o histórico registra a reabertura.

## 21. Evento válido de performance
- Só conta evento operacional de tarefa com `data_origin = plataforma`, com a definição auditável em `server/services/perfEvents.js`.
- Eventos migrados nunca entram automaticamente.
- Sem eventos válidos, a tela mostra **DADOS INSUFICIENTES**. Não há score nem ranking, e não se infere produtividade.
- Capacidade **configurada** (cadastro) ≠ capacidade **medida** (histórico). A utilização real só é afirmada com histórico suficiente.

## 22. Hospedagem
- Nada vai para o Railway até a CEO aprovar.
- A auditoria arquitetural fica em `docs/08-arquitetura-railway.md`, no formato ATUAL → DESTINO → MOTIVO → RISCO → IMPACTO/CUSTO → PLANO → ROLLBACK.

## Regras anteriores que continuam valendo
- Regra determinística decide status, prazos, permissões, tarefas, atribuições, sincronização e **todo cálculo financeiro**. A IA interpreta e sugere, mas não decide estado crítico, valores nem nada sobre pessoas.
- Permissão sempre verificada no backend. Esconder botão não é proteção.
- `activity_logs` é *append-only*: nada se apaga.
- O cliente final nunca vê informação interna da The Bold.
- Credenciais nunca vão para o repositório. Dados reais de clientes só entram cifrados (`real-snapshot/`).
