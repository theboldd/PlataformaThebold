# THE BOLD OS — Arquitetura de produção no Railway

**Status: proposta para validação.** Nada foi migrado. A prévia na Vercel continua como está até a CEO aprovar.

## 1. Mapa da arquitetura atual

| Peça | Como funciona hoje | Onde está |
|---|---|---|
| Frontend | React 19 + Vite, compilado em `web/dist` | Vercel (estático) / local |
| Backend/API | Express 5 em Node 22 (`server/index.js`). Um único processo serve a API **e** o frontend compilado | Vercel (função) / local (`npm start`) |
| Banco | SQLite (`node:sqlite`, síncrono): **um arquivo** `bold.db` de ~3,7 MB hoje | Local em `storage/`; na Vercel, cópia cifrada `real-snapshot/bold.db.enc` decifrada em `/tmp` a cada instância |
| Arquivos | Originais e variações (sharp, ffmpeg) em disco local (`storage/originals`, `storage/derived`), atrás de uma interface `storage` já pronta para S3/R2 | Local; na Vercel, `/tmp` (temporário) |
| Autenticação | Senha scrypt; sessão em cookie httpOnly com registro na tabela `sessions` | Na Vercel: "sessão assinada" sem estado (`BOLD_STATELESS_SESSIONS`), porque cada instância tem sua própria cópia da base |
| Rotinas | `startScheduler()` dentro do processo, a cada minuto: prazos, ativação de etapas, cobrança, detectores, publicação | Só funciona com processo contínuo. Na Vercel **não roda**; existe o `/api/cron/tick` com cron diário |
| Integrações | Google Calendar, Slack (avisos), Meta, Resend, Claude: todas por variável de ambiente e OAuth | Nenhuma conectada ainda |
| Cofre | Tokens de integração cifrados (AES-256-GCM) com `BOLD_VAULT_KEY` (ou `storage/.vault-key`) | — |

## 2. O que hoje depende da Vercel (e muda no Railway)

1. `api/index.js`: adaptador serverless que decifra o snapshot para `/tmp` e liga as sessões sem estado. **No Railway não é usado**: o servidor normal (`npm start`) roda direto.
2. `vercel.json`: *rewrites*, inclusão de arquivos na função, cron diário. **Não é usado no Railway.**
3. Dados temporários em `/tmp` → no Railway ficam num **volume persistente**.
4. **ffmpeg:** a função da Vercel não tem ffmpeg, então vídeos não são processados lá. No Railway ele é instalado na imagem.
5. Sessões sem estado: no Railway, com uma instância e banco persistente, volta a sessão normal (pode ser revogada no logout).

Nenhuma dessas mudanças exige alterar o código de negócio nem o banco.

## 3. Arquitetura proposta

```
                        ┌───────────────────────────── Railway (projeto "the-bold-os") ─────────────────────────────┐
  usuários  ──HTTPS──▶  │  SERVIÇO WEB  (Node 22, 1 réplica)                                                         │
  (equipe e clientes)   │   • Express: API /api/* + frontend compilado (web/dist)                                    │
                        │   • Agendador interno (a cada minuto): prazos, etapas, cobrança, apuração, sincronizações   │
  GitHub (main) ─deploy▶│   • Processamento de mídia (sharp + ffmpeg) em segundo plano no mesmo processo             │
                        │   • VOLUME /data  →  bold.db · originals/ · derived/ · backups/ · .vault-key               │
                        │                                                                                            │
                        │  SERVIÇO CRON  (Railway Cron, ex.: a cada hora)                                            │
                        │   • curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/tick               │
                        │   • rede de segurança: as rotinas rodam mesmo se o agendador interno travar                │
                        └────────────────────────────────────────────────────────────────────────────────────────────┘
        Externos: Resend (e-mail) · Google (Calendar/Meet) · Slack · Meta · Anthropic (Claude) · cópia externa dos backups (R2/S3)
```

### Por que essa separação (e não mais serviços)

- **Web e API juntos.** Já é um processo só, e separar não traz ganho nesta escala. O frontend pode ir para CDN depois sem mexer no backend.
- **Rotinas no mesmo processo + Cron externo.** O agendador interno roda a cada minuto e cobre "ninguém está com a plataforma aberta". O Cron do Railway chama `/api/cron/tick`, que é idempotente (`onceFor`), e garante que nada se perde se o processo reiniciar.
- **Worker separado: ainda não.** O processamento de mídia é assíncrono e o volume é baixo. Vira serviço próprio se o volume de vídeos crescer.
- **Banco: SQLite no volume, sem migração.** Uma réplica só, porque o SQLite aceita um escritor por vez. Postgres só faz sentido quando precisar de várias réplicas, e isso exige reescrever a camada de dados para assíncrona.
- **Arquivos no volume.** A interface `storage` já está pronta para R2/S3 quando o volume de mídia justificar.

## 4. Serviços necessários

| Serviço | Tipo no Railway | Recursos sugeridos |
|---|---|---|
| `the-bold-os` | Web service a partir do GitHub (`main`) | 1 vCPU · 1 GB RAM (ffmpeg pede memória) · **1 réplica** |
| Volume `data` | Volume montado em `/data` | 5 GB para começar (hoje: ~4 MB de banco + mídia futura) |
| `cron-tick` | Cron service (imagem mínima com curl) | Agenda `0 * * * *` (de hora em hora) |

## 5. Dependências

- Node 22 (exige `node:sqlite`) e as dependências do `package.json` (express, multer, sharp, cookie-parser, @anthropic-ai/sdk).
- **ffmpeg** na imagem, para posters e prévias de vídeo. Recomendo um **Dockerfile** próprio (Node 22 Debian slim + ffmpeg) em vez de detecção automática, para a versão ficar fixa.
- Build: `npm ci && npm run build`. Start: `npm start`.

## 6. Variáveis de ambiente

| Variável | Obrigatória | Para quê |
|---|---|---|
| `NODE_ENV=production` | sim | Cookie seguro e otimizações |
| `PORT` | automática | O Railway define |
| `PUBLIC_BASE_URL` | sim | Links em e-mails e retornos de OAuth (ex.: `https://os.thebold.com.br`) |
| `BOLD_DATA_DIR=/data` · `BOLD_STORAGE_DIR=/data` | sim | Banco e arquivos no volume |
| `BOLD_VAULT_KEY` | sim | 32 bytes em base64 para cifrar tokens de integração (gerar uma vez e guardar fora do repositório) |
| `CRON_SECRET` | sim | Protege `/api/cron/tick` |
| `RESEND_API_KEY` · `BOLD_MAIL_FROM` | para e-mail | Redefinição de senha, cobranças, relatórios |
| `ANTHROPIC_API_KEY` · `BOLD_AI_MODEL` | para IA | Brain, resumos, revisão inteligente |
| `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` | para agenda/Meet | OAuth do Google |
| `SLACK_CLIENT_ID` · `SLACK_CLIENT_SECRET` | para Slack | OAuth do Slack |
| `META_APP_ID` · `META_APP_SECRET` | para Instagram | Publicação |
| `BOLD_SNAPSHOT_KEY` | só na 1ª subida | Decifrar a base real para o volume, se essa for a estratégia escolhida (seção 9) |

Não usar no Railway: `BOLD_STATELESS_SESSIONS` e `BOLD_SCHEDULER=off`. O agendador fica **ligado**.

## 7. Estratégia de deploy

1. Criar o projeto no Railway, ligado ao repositório `theboldd/PlataformaThebold`, branch `main`.
2. Criar o volume em `/data` e as variáveis da seção 6.
3. Primeira subida em um **domínio temporário do Railway**, com a base real carregada (seção 9).
4. **Validação** (checklist abaixo) com a Rebeca. Só depois: domínio próprio e desligar a prévia da Vercel.
5. Depois disso, cada push na `main` faz deploy automático, com *healthcheck* em `/api/health`. Com volume, o Railway troca a instância com alguns segundos de indisponibilidade; não há perda de dados.

**Checklist de validação:**
- login da equipe;
- 24 clientes e 451 conteúdos presentes;
- ativação de etapa agendada;
- cron respondendo;
- upload de imagem e de vídeo (gera poster);
- reinício do serviço sem perder dados;
- backup e restauração testados.

## 8. Estratégia de backup

| Camada | Como | Frequência e retenção |
|---|---|---|
| Backup do volume (Railway) | Recurso de backups do volume do Railway | Diário · conforme o plano |
| Backup da aplicação | Rotina noturna faz `VACUUM INTO /data/backups/bold-AAAA-MM-DD.db` (cópia consistente com o sistema rodando) | 7 diários + 4 semanais |
| Cópia externa | O mesmo arquivo, **cifrado** (AES-256-GCM, mesma técnica do snapshot), enviado para R2/S3 | Diário · 30 dias |
| Arquivos de mídia | Ficam no volume. Cópia externa quando migrarem para R2/S3 | — |

**Restauração:** parar o serviço, trocar o `bold.db` pelo backup e subir de novo. O procedimento será testado na validação.

A rotina de backup ainda não existe no código. Ela entra junto com a migração aprovada.

## 9. O que precisa ser migrado (e como)

| Item | Origem | Destino | Como |
|---|---|---|---|
| Base real (`bold.db`) | Cópia mestra local + `real-snapshot/bold.db.enc` | `/data/bold.db` | **Opção A (recomendada):** na 1ª subida, se `/data/bold.db` não existir e houver `BOLD_SNAPSHOT_KEY`, o servidor decifra o snapshot uma única vez. Depois a variável é removida. **Opção B:** enviar o arquivo pelo terminal do Railway |
| Senhas da equipe | No snapshot já estão as senhas fortes (`storage/.team-password`) | Igual | Nada a fazer |
| Arquivos de mídia | Ainda não há mídia enviada na base real | `/data/originals`, `/data/derived` | Nada a migrar hoje |
| Chave do cofre | Nenhuma integração conectada | `BOLD_VAULT_KEY` nova | Gerar no Railway |
| Variáveis e segredos | — | Variáveis do Railway | Cadastrar (seção 6) |

**Atenção:** o que foi alterado **na prévia da Vercel** (comentários, senhas trocadas, mudanças de etapa) é temporário e **não será migrado**. A fonte é a base mestra.

## 10. O que pode permanecer como está

- Todo o código de negócio, o banco SQLite e o esquema. Nenhuma mudança estrutural.
- O repositório e o fluxo de commits.
- A **Vercel**, como prévia ou ambiente de teste, até a validação. Depois pode ser desligada ou ficar como *staging*.
- `api/index.js` e `vercel.json` continuam no repositório e não atrapalham o Railway.
- Os dados de migração do Notion (`storage/migration/`) ficam **fora** da produção, guardados com a cópia mestra.

## 11. Riscos e como tratar

| Risco | Impacto | Mitigação |
|---|---|---|
| Instância única (ponto único de falha) | Plataforma fora do ar enquanto reinicia | *Healthcheck* + reinício automático; cron externo recupera as rotinas; backups |
| SQLite com um escritor | Limita escala horizontal | Suficiente para a operação atual. Postgres quando houver necessidade real |
| Volume corrompido ou perdido | Perda de dados | 3 camadas de backup, uma delas fora do Railway |
| ffmpeg sem memória em vídeos grandes | Falha no processamento | 1 GB de RAM; fila de mídia vira worker se crescer |
| Deploy com breve indisponibilidade | Alguns segundos fora do ar | Deploy fora do horário de pico |
| Segredos | Vazamento | Só em variáveis do Railway; nunca no repositório |
| Duas fontes de verdade durante a transição | Confusão | Até a validação a Vercel é **só prévia**; depois, o Railway é a única fonte |

## 12. Estimativa de custo (confirmar na calculadora do Railway antes de assinar)

- O plano **Hobby** custa US$ 5/mês com US$ 5 de uso incluídos. O **Pro** custa US$ 20/mês, com mais recursos e colaboração em equipe.
- Serviço web contínuo (cerca de 0,25–0,5 vCPU média e 0,5–1 GB de RAM): **~US$ 5–15/mês** de uso.
- Volume de 5 GB: **~US$ 1/mês**. O cron de hora em hora é desprezível. Tráfego de saída é baixo neste volume.
- **Total estimado: US$ 10–25/mês**, conforme o plano e o uso real.
- Fora do Railway: Resend (plano gratuito cobre o volume inicial), R2/S3 para a cópia externa (centavos), Claude (por uso).

Os valores são aproximados e os preços mudam. A conferência é feita na hora de criar o projeto.

## 13. Próximo passo (depende de aprovação)

Com o "ok" da CEO, entram no código, sem nada irreversível:
- `Dockerfile` com ffmpeg;
- `railway.json` com *healthcheck*;
- carga única da base a partir do snapshot;
- rotina de backup noturno;
- serviço de cron.

Depois: subida em domínio temporário → validação → domínio próprio.
