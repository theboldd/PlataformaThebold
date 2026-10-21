# THE BOLD OS — Auditoria arquitetural (hospedagem)

**Status: auditoria apenas.** Nada foi migrado, nenhuma infraestrutura foi criada e a produção não foi alterada (regra oficial 26). A migração só acontece com aprovação explícita da CEO.

## A. Mapa: ATUAL → DESTINO PROPOSTO → MOTIVO → RISCO → IMPACTO/CUSTO

| Componente | ATUAL (Vercel, prévia) | DESTINO PROPOSTO | MOTIVO | RISCO | IMPACTO / CUSTO |
|---|---|---|---|---|---|
| Frontend | React 19 + Vite, estático no CDN da Vercel | Servido pelo próprio serviço Node (web/dist) no Railway; CDN opcional depois | Um único deploy, sem CORS nem configuração dupla | Baixo; sem CDN no início, um pouco mais lento fora do Brasil | Sem custo à parte |
| Backend/API | Express 5 dentro de uma função serverless (`api/index.js`), até 60 s por requisição | Processo Node 22 contínuo (`npm start`), 1 réplica | O agendador interno e as conexões persistentes precisam de processo contínuo | Médio: ponto único de falha (mitigado com reinício automático e healthcheck) | ~US$ 5–15/mês de uso |
| Banco | SQLite **cifrado no repositório** (~11 MB), decifrado em `/tmp` a cada instância: **as alterações se perdem** | O mesmo SQLite (~14 MB) num **volume persistente** `/data` | É a única mudança que torna os dados permanentes; não exige reescrever nada | Médio: um escritor por vez (suficiente hoje); o volume precisa de backup | Volume de 5 GB ~US$ 1/mês |
| Storage, uploads e arquivos | `/tmp` da função: uploads somem; sem ffmpeg (vídeo sem capa) | Volume `/data/originals` e `/data/derived`; ffmpeg na imagem Docker; interface `storage` pronta para R2/S3 | Originais preservados e capas de vídeo geradas | Baixo; o volume cresce com a mídia | Incluído no volume; R2/S3 quando passar de alguns GB |
| Autenticação e sessões | Sessão **assinada sem estado**, porque cada instância tem a própria cópia do banco | Sessão com registro no banco (o logout revoga de verdade) | Mais segura, e é o modo nativo do código | Baixo: todos precisam entrar de novo uma vez | Nenhum |
| APIs (~160 rotas) | Uma função na Vercel | As mesmas rotas, sem mudança | — | Nenhum | Nenhum |
| Integrações (Google, Slack, Meta, Resend, Claude, Notion export) | Código pronto; nenhuma conectada; os retornos de login usam `PUBLIC_BASE_URL` | As mesmas, com `PUBLIC_BASE_URL` apontando para o domínio final | Os retornos de login precisam de um domínio estável | Médio: trocar o domínio exige atualizar as URLs de retorno em cada serviço | Planos gratuitos ou por uso |
| Webhooks | Prefixo `/api/integrations/webhooks/*` reservado; **nenhum implementado** | Igual | — | Nenhum hoje | Nenhum |
| Jobs (agendador interno, a cada minuto) | **Não rodam na Vercel** | Rodam no processo contínuo, com a trava `runJob` (lease + timeout + registro em `job_runs`) | Prazos, cobrança, etapas, relatório, detectores e transcrições exigem processo vivo | Baixo: idempotentes (`onceFor`) | Incluído |
| Cron | Cron diário da Vercel (`0 10 * * *` UTC), que **depende do `CRON_SECRET`** (não configurado) | Serviço de cron do Railway (UTC) que só chama `/api/cron/tick` por HTTP | Garante a execução mesmo se o processo reiniciar; o cron não acessa o volume | Baixo: execução ainda ativa pode pular a próxima, o que é tratado pela trava e pela idempotência | Desprezível |
| Workers | Não existem | Ainda não são necessários (mídia em segundo plano no próprio processo) | Volume baixo de vídeo | Médio, se o volume de vídeo crescer | Depois: worker + R2/S3 |
| Variáveis e secrets | `BOLD_SNAPSHOT_KEY` (os demais segredos são derivados dela) | Variáveis do Railway: `BOLD_VAULT_KEY`, `BOLD_SESSION_SECRET`, `CRON_SECRET`, `PUBLIC_BASE_URL`, `BOLD_DATA_DIR=/data`, `BOLD_STORAGE_DIR=/data`, e as chaves das integrações | Segredos próprios, fora do repositório | Médio: perder `BOLD_VAULT_KEY` inutiliza os tokens salvos (hoje não há nenhum) | Nenhum |
| Domínio | `*.vercel.app` | Domínio temporário `*.up.railway.app` → domínio próprio depois da validação | Links de e-mail e retornos de login | Baixo | Custo do domínio |
| Vercel | Prévia com dados descartáveis | Fica como prévia/staging ou é desligada depois da virada | — | Duas fontes de verdade se usada como produção (não usar) | Gratuito |
| Dependências externas | npm (express, multer, sharp, cookie-parser, @anthropic-ai/sdk); ffmpeg ausente | Dockerfile com Node 22 + ffmpeg fixos | Build reproduzível | Baixo | Nenhum |
| Rotinas automáticas | Só disparam com ação de usuário; as de horário não rodam | Todas ativas (a lista está no checklist oficial, seção 16) | Operação sem ninguém online | Baixo | Incluído |
| Serviços de IA | Claude via `ANTHROPIC_API_KEY` (não configurado): responde "não configurado", nada é simulado | Igual, com a chave no Railway | — | Custo por uso | Por uso |
| Backups | Só o snapshot cifrado manual no Git | 3 camadas: backup do volume + `VACUUM INTO` noturno (7 diários + 4 semanais) + cópia cifrada externa (R2/S3) | Hoje não há backup automático | Alto **hoje**; baixo depois | Centavos (R2/S3) |

## B. Plano de migração (só depois da aprovação)
1. **Código, sem efeito em produção:**
   - `Dockerfile` com ffmpeg;
   - `railway.json` com healthcheck;
   - carga única da base a partir do snapshot;
   - rotina de backup;
   - versão do Railway no `/api/health`.
2. **Congelar a base mestra:** contagens (clientes, conteúdos, tarefas, legados, histórico do Notion, logs) e sha256 do arquivo.
3. **Criar no Railway:** serviço web, volume `/data`, variáveis e cron (pausado).
4. **Primeira subida** em domínio temporário; a base é carregada do snapshot e depois a chave de carga é removida.
5. **Validação** (seção 13): contagens, integridade, login, permissões, rotinas (`ok` e `ignorado`), mídia, reinício e backup/restauração.
6. **Virada:** domínio próprio; ativar o cron do Railway; remover o cron da Vercel.

## C. Rollback
- **Antes da virada:** nada muda na Vercel. Basta não virar.
- **Depois da virada:**
  1. apontar o domínio de volta para a Vercel;
  2. gerar um snapshot novo a partir do `/data/bold.db`;
  3. publicar esse snapshot;
  4. pausar o cron do Railway.
- **Deploy com defeito:** reverter para o deploy anterior no painel; o volume não é afetado.
- **Dados corrompidos:** restaurar o último `backups/bold-*.db`.

> Os detalhes de cada item (serviços, variáveis, riscos e custo) estão nas seções abaixo, do relatório anterior.

---

# Relatório de arquitetura para o Railway (detalhamento)

**Status: relatório aprovado para elaboração. Migração NÃO aprovada.** Nada foi migrado nem será sem aprovação explícita deste plano pela CEO.
A Vercel continua como prévia até lá. Itens marcados com **[confirmar]** dependem de conferência no painel do Railway/Vercel na hora de executar.

---

## 1. Arquitetura atual

| Peça | Como funciona hoje | Onde roda |
|---|---|---|
| Frontend | React 19 + Vite, compilado em `web/dist` (estático) | Vercel (CDN) · local |
| Backend/API | Express 5 em Node 22 (`server/index.js`). Um processo serve a API e, fora da Vercel, também o frontend | Vercel (uma função serverless, `api/index.js`) · local (`npm start`) |
| Banco | SQLite via `node:sqlite` (síncrono), **um arquivo** `bold.db` (~3,7 MB) | Local em `storage/`. Na Vercel: cópia cifrada `real-snapshot/bold.db.enc` decifrada em `/tmp` em cada instância |
| Armazenamento | Originais e variações de mídia (sharp, ffmpeg) em disco: `originals/`, `derived/`, atrás da interface `storage` (`server/services/media.js`) já preparada para S3/R2 | Local. Na Vercel, `/tmp` (temporário) |
| Autenticação | Senha scrypt. Sessão em cookie httpOnly registrada na tabela `sessions`; CSRF por cabeçalho `x-bold-request` | Na Vercel: sessão **assinada sem estado** (`BOLD_STATELESS_SESSIONS`), porque cada instância tem a própria cópia do banco |
| Rotinas | Agendador no processo (`startScheduler`, a cada minuto) + rota externa `/api/cron/tick` | Na Vercel o agendador **não roda**; só o cron diário da Vercel |
| Cofre | Tokens de integração cifrados (AES-256-GCM) com `BOLD_VAULT_KEY` | — |

## 2. Dependências da Vercel (o que muda ao sair dela)

| Dependência | Arquivo | No Railway |
|---|---|---|
| Adaptador serverless que decifra o snapshot para `/tmp` e deriva segredos da `BOLD_SNAPSHOT_KEY` | `api/index.js` | Não é usado: o servidor normal (`npm start`) roda direto |
| Rewrites, inclusão de arquivos na função, `maxDuration` 60 s | `vercel.json` | Não é usado |
| Cron diário `0 10 * * *` (UTC) chamando `/api/cron/tick` | `vercel.json` | Substituído pelo serviço de cron do Railway |
| Banco e arquivos em `/tmp` (perdidos a cada instância nova) | `api/index.js` | Volume persistente |
| Sessões sem estado | `server/lib/auth.js` | Volta a sessão com registro no banco (logout revoga de verdade) |
| `VERCEL_GIT_COMMIT_SHA` no `/api/health` | `server/index.js` | Trocar por `RAILWAY_GIT_COMMIT_SHA` **[confirmar nome]** |
| Sem ffmpeg na função | — | ffmpeg instalado na imagem |

Nenhuma dessas mudanças altera regra de negócio, esquema do banco ou dados.

## 3. Backend atual (inventário)

- **Endpoints:** ~150 rotas em `server/routes/` (core 27, ops 50, portal 20, business 14, comms 12, review 6, ficha 6, atrasos 6, pendências 5, divisão 3) + rotas no `server/index.js`.
- **Rotas especiais:**
  - `GET /api/health`: healthcheck (banco + versão).
  - `GET /api/cron/tick`: rotinas, protegida por `CRON_SECRET`.
  - `GET /api/cron/status`: últimas execuções; exige a permissão `automacoes`.
  - `GET /api/integrations/:provider/callback`: retorno de OAuth (Google, Meta, Slack).
  - `/api/integrations/webhooks/*`: prefixo reservado e isento de CSRF. **Nenhum webhook está implementado hoje.**
  - `GET /api/media/:id/...`: entrega de mídia com checagem de permissão.
- **Jobs e rotinas** (todos em `server/engine/scheduler.js`):
  - ativação das etapas agendadas;
  - avisos de prazo próximo e vencido;
  - régua de cobrança do cliente (24/48/72 h);
  - lembrete de reunião;
  - processo parado;
  - onboarding atrasado;
  - follow-up de CRM;
  - faturas vencidas;
  - detectores de inteligência (15 min);
  - relatório semanal (segunda);
  - publicação agendada na Meta (1 min);
  - inclusão diária dos itens herdados vencidos na Revisão de atrasos.
- **Processamento de mídia:** assíncrono no mesmo processo (sharp, ffmpeg).

## 4. Integrações

| Integração | Situação | Credenciais |
|---|---|---|
| Resend (e-mail: redefinir senha, cobranças, relatórios) | Código pronto, **sem chave** | `RESEND_API_KEY`, `BOLD_MAIL_FROM` |
| Google Calendar/Meet | Código de OAuth pronto, não conectado | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Slack | Código de OAuth pronto, não conectado | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` |
| Meta (Instagram) | Código pronto, não conectado | `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION` |
| Anthropic (Claude) | Código pronto | `ANTHROPIC_API_KEY`, `BOLD_AI_MODEL` |
| Notion | **Só leitura**, por exportação feita na migração (`storage/migration/`). O código **não tem nenhuma escrita no Notion** | — |

## 5. Domínio

- Hoje: domínio `*.vercel.app` do projeto `plataforma-thebold`. O repositório não configura domínio próprio. **[confirmar no painel da Vercel se há domínio próprio apontado]**
- No Railway:
  1. Subir primeiro no domínio temporário `*.up.railway.app`.
  2. Validar.
  3. Só então apontar o domínio próprio (CNAME no DNS) e trocar `PUBLIC_BASE_URL`.
  4. Atualizar as URLs de retorno de OAuth no Google, Meta e Slack.

## 6. Arquitetura proposta (separada por função)

```
                    ┌──────────────────────── Railway · projeto "the-bold-os" ────────────────────────┐
 equipe e clientes  │ (1) SERVIÇO WEB/API  Node 22 · 1 réplica                                          │
 ──── HTTPS ──────▶ │     Express: /api/* + frontend (web/dist) · agendador interno a cada minuto       │
                    │     processamento de mídia (sharp + ffmpeg) em segundo plano                       │
                    │        │                                                                           │
                    │        ▼                                                                           │
                    │ (2) BANCO = (5) VOLUME /data  →  bold.db · originals/ · derived/ · backups/        │
                    │     (montado SÓ no serviço web — volume do Railway liga a um serviço apenas)       │
                    │                                                                                    │
                    │ (4) SERVIÇO CRON  (imagem mínima com curl; roda e encerra)                         │
                    │     curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<web>/api/cron/tick  │
                    └──────────────────────────────────────────────────────────────────────────────────┘
 (6) Externos: Resend · Google · Slack · Meta · Anthropic · cópia externa dos backups (R2/S3)
```

### (1) Serviço web/API
Um processo só (API + frontend + agendador). Separar não traz ganho nesta escala.

### (2) Banco
SQLite no volume, **sem migração de banco**. Só uma réplica, porque o SQLite aceita um escritor por vez. Postgres só quando houver necessidade real de várias réplicas, e isso exige reescrever a camada de dados para assíncrona. Seria uma decisão separada.

### (3) Worker
**Não é necessário agora.** A mídia é processada em segundo plano no próprio serviço web, e o volume é baixo. Vira serviço próprio se o volume de vídeo crescer. Detalhe: como o volume liga a um serviço só, um worker separado exigiria levar os arquivos para R2/S3.

### (4) Cron jobs
- O cron do Railway **não acessa o banco** (o volume é do serviço web). Ele só chama `/api/cron/tick` por HTTP e encerra.
- **Horário:** o cron do Railway usa **UTC**. Exemplo: `0 * * * *` (de hora em hora). As 7h de Brasília são `0 10 * * *`.
- **Execução ainda ativa:** se uma execução do cron ainda estiver ativa, o Railway pode **pular a próxima**. Por isso o cron só faz a chamada HTTP, que retorna rápido. O trabalho pesado fica no serviço web.
- **Já implementado** (`server/engine/jobs.js`):
  - **Trava com prazo (lease):** a rotina `tick` nunca roda duas vezes ao mesmo tempo, seja chamada pelo agendador interno ou pelo cron externo. A segunda chamada é **ignorada** e registrada.
  - **Timeout:** 50 s. Se o processo morrer no meio, o lease vence e a próxima execução marca a anterior como **expirada** e segue.
  - **Idempotência:** cada efeito (aviso, cobrança, tarefa) usa um marcador próprio em `automation_runs` (`onceFor`). Repetir a rotina não duplica nada.
  - **Registro:** cada execução fica em `job_runs` (rodando, ok, erro, ignorado ou expirado), com 30 dias de retenção, e pode ser consultada em `/api/cron/status`.
- **Fuso:** datas guardadas em UTC (ISO). Regras de dia e semana usam `America/Sao_Paulo` de forma explícita.

### (5) Armazenamento persistente
Um volume em `/data`: banco, mídia e backups locais. A interface `storage` permite levar a mídia para R2/S3 depois, sem mudar as regras.

### (6) Serviços externos
Resend, Google, Slack, Meta, Anthropic e bucket R2/S3 para a cópia externa cifrada dos backups. Todos por variável de ambiente.

## 7. Serviços necessários no Railway

| Serviço | Tipo | Recursos sugeridos |
|---|---|---|
| `the-bold-os` | Web service a partir do GitHub (`main`), via Dockerfile | 1 vCPU · 1 GB RAM · **1 réplica** · healthcheck `/api/health` |
| Volume `data` | Volume em `/data`, ligado ao `the-bold-os` | 5 GB para começar |
| `cron-tick` | Cron service | `0 * * * *` (UTC) |

## 8. Variáveis de ambiente

| Variável | Obrigatória | Para quê |
|---|---|---|
| `NODE_ENV=production` | sim | Cookie seguro |
| `PORT` | automática | O Railway define |
| `PUBLIC_BASE_URL` | sim | Links de e-mail e retornos de OAuth |
| `BOLD_DATA_DIR=/data` · `BOLD_STORAGE_DIR=/data` | sim | Banco e arquivos no volume |
| `BOLD_VAULT_KEY` | sim | 32 bytes base64. **Atenção:** na Vercel ela é derivada da chave do snapshot. Se houver token salvo, usar o mesmo valor; hoje não há integração conectada |
| `BOLD_SESSION_SECRET` | recomendado | Assinatura de tokens (redefinição de senha) |
| `CRON_SECRET` | sim | Protege `/api/cron/tick` (o mesmo valor no serviço de cron) |
| `RESEND_API_KEY` · `BOLD_MAIL_FROM` | para e-mail | — |
| `ANTHROPIC_API_KEY` · `BOLD_AI_MODEL` | para IA | — |
| `GOOGLE_*` · `SLACK_*` · `META_*` | para cada integração | — |
| `BOLD_SNAPSHOT_KEY` | só na 1ª subida | Carga única da base (seção 11) |

**Não usar no Railway:** `BOLD_STATELESS_SESSIONS`, `BOLD_SCHEDULER=off`, `BOLD_DEMO`, `BOLD_DEMO_PASSWORD`.

## 9. Backups

| Camada | Como | Frequência e retenção |
|---|---|---|
| Volume (Railway) | Backups de volume do Railway **[confirmar disponibilidade no plano]** | Diário |
| Aplicação | Rotina noturna `VACUUM INTO /data/backups/bold-AAAA-MM-DD.db` (cópia consistente com o sistema no ar), via `runJob` com trava | 7 diários + 4 semanais |
| Externa | Mesmo arquivo cifrado (AES-256-GCM) enviado para R2/S3 | Diário · 30 dias |

A rotina de backup **ainda não está no código**. Entra com a migração aprovada.

## 10. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Instância única | Fora do ar enquanto reinicia | Healthcheck + reinício automático; o cron externo recupera as rotinas; backups |
| SQLite com um escritor | Não escala horizontalmente | Suficiente para a operação atual |
| Volume perdido ou corrompido | Perda de dados | 3 camadas de backup, uma fora do Railway |
| Cron pulado (execução anterior ativa) ou sobreposto ao agendador interno | Rotina atrasa ou roda em dobro | Cron só faz a chamada HTTP; trava + idempotência no servidor |
| Fuso UTC × Brasília | Rotina na hora errada | Cron em UTC documentado; regras de negócio com fuso explícito |
| Duas fontes de verdade na transição | Dados divergentes | A Vercel é só prévia; dados alterados nela **não migram**. Depois da virada, o Railway é a única base |
| Mudança de domínio | OAuth e links de e-mail quebrados | Atualizar `PUBLIC_BASE_URL` e as URLs de retorno antes de conectar integrações |
| Deploy reinicia o serviço | Alguns segundos fora do ar | Deploy fora de pico |
| Segredos | Vazamento | Só em variáveis do Railway; nunca no repositório |

## 11. Plano de migração (executar só após aprovação)

1. **Código, sem efeito em produção:**
   - `Dockerfile` (Node 22 slim + ffmpeg);
   - `railway.json` com healthcheck;
   - carga única da base: se `/data/bold.db` não existir e houver `BOLD_SNAPSHOT_KEY`, o servidor decifra o snapshot uma vez;
   - rotina de backup;
   - `/api/health` com a versão do Railway.
2. **Congelar a base mestra:**
   - gerar o snapshot a partir da cópia mestra local;
   - anotar contagens: clientes, conteúdos, tarefas, logs, revisões de atraso;
   - anotar o hash (sha256) do arquivo.
3. **Criar no Railway:** projeto, serviço web, volume em `/data`, variáveis e serviço de cron (ainda pausado).
4. **Primeira subida no domínio temporário:** a base é carregada do snapshot. Depois, remover `BOLD_SNAPSHOT_KEY`.
5. **Validação** (seção 13) com a CEO.
6. **Virada:**
   - domínio próprio;
   - ativar o cron do Railway;
   - remover o cron da Vercel (`vercel.json`);
   - a Vercel fica como *staging* ou é desligada.

## 12. Plano de rollback

- **Até a virada (passo 6):** nada muda para quem usa a Vercel. Rollback = não virar; apagar o projeto do Railway se quiser.
- **Depois da virada:**
  1. Apontar o domínio de volta para a Vercel.
  2. Gerar um snapshot novo a partir de `/data/bold.db` (para não perder o que foi feito no Railway).
  3. Publicar o snapshot na Vercel.
  4. Pausar o cron do Railway.
  5. O volume continua guardado como cópia.
- **Deploy com defeito no Railway:** reverter para o deploy anterior no painel. O volume não é alterado pelo deploy.
- **Dados corrompidos:** parar o serviço, restaurar o último `backups/bold-*.db` e subir.

## 13. Validação pós-migração

| Verificação | Critério |
|---|---|
| Contagens | Clientes, conteúdos, tarefas, `activity_logs` e `delay_reviews` iguais às anotadas no passo 2 |
| Integridade | `PRAGMA integrity_check` = ok; os triggers de append-only de `activity_logs` existem |
| Login | Equipe e cliente; logout revoga a sessão |
| Permissões | Divisão, Carteira e Atrasos negados (403) para quem não tem; cliente não vê dado interno |
| Rotinas | Chamada manual ao `/api/cron/tick` → `ok`; segunda chamada simultânea → `ignorado`; `job_runs` registrando |
| Etapas | Uma tarefa `agendada` vira `aberta` na data certa |
| Mídia | Upload de imagem e vídeo; poster gerado (ffmpeg) |
| Persistência | Reiniciar o serviço sem perder nenhum dado |
| Backup | Gerar, restaurar numa cópia e conferir as contagens |
| E-mail | Redefinição de senha chega (depois da chave do Resend) |

## 14. Estimativa de custo [confirmar na calculadora do Railway]

| Item | Custo estimado |
|---|---|
| Plano Hobby | US$ 5/mês (inclui US$ 5 de uso) |
| Plano Pro | US$ 20/mês |
| Serviço web contínuo (~0,25–0,5 vCPU, 0,5–1 GB) | ~US$ 5–15/mês |
| Volume de 5 GB | ~US$ 1/mês |
| Cron de hora em hora | Desprezível |
| **Total** | **US$ 10–25/mês** |

Fora do Railway: Resend (o gratuito cobre o início), R2/S3 (centavos) e Claude (por uso).

## 15. Fonte de verdade na migração

Ver a regra 11 em `docs/07-regras-oficiais.md`:

| Momento | Fonte de verdade |
|---|---|
| Antes da migração | Notion (fonte existente) |
| Durante a migração | Notion → The Bold OS |
| Depois da migração | The Bold OS |

Sem sincronização bidirecional e sem escrita automática no Notion.
