# THE BOLD — Operating System

O sistema operacional interno da The Bold: processos, produção, aprovações, clientes, comunicação, agenda e inteligência em um só lugar.
**Princípio:** a plataforma sabe o que precisa acontecer. O Process Engine move o trabalho sozinho; as pessoas só fazem o trabalho.

## Rodar localmente
Requer Node ≥ 22.5 (usa `node:sqlite`) e ffmpeg (para vídeos).
```bash
npm install
npm run base:real   # cria o banco com a equipe e importa os clientes reais do Notion (storage/migration/notion, fora do git)
npm run build       # compila o frontend
npm start           # http://localhost:4000
# desenvolvimento: npm run dev  (API :4000 + Vite :5173)
npm test            # testes do engine, permissões, auditoria e mídia
```
Não existe base de exemplo: nenhum cliente, conteúdo ou texto fictício. Sem o levantamento do Notion, `npm run seed` cria só a equipe.
Acesso da equipe: e-mail `<primeiro-nome>@thebold.demo` (provisório). Senha inicial local `thebold2026`; na cópia publicada, a senha forte de `storage/.team-password`.

## Variáveis de ambiente
| Variável | Para quê |
|---|---|
| `PORT` | Porta HTTP (padrão 4000) |
| `PUBLIC_BASE_URL` | URL pública. Necessária para os callbacks OAuth e para a Meta baixar mídia |
| `BOLD_VAULT_KEY` | 32 bytes em base64 para cifrar os tokens de integração (**obrigatória em produção**) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Calendar (e Drive, quando implementado) |
| `META_APP_ID` / `META_APP_SECRET` / `META_GRAPH_VERSION` | Instagram Graph API |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | Espelhamento no Slack durante a transição |
| `ANTHROPIC_API_KEY` / `BOLD_AI_MODEL` | Claude (padrão `claude-opus-5-5`) |
| `OBSIDIAN_VAULT_PATH` / `BOLD_KNOWLEDGE_PROVIDER` | Teste de memória com Obsidian |
| `BOLD_STORAGE_DIR` / `BOLD_DB_PATH` | Local do banco e das mídias |
| `RESEND_API_KEY` / `BOLD_MAIL_FROM` | E-mail de redefinição de senha (Resend; remetente de domínio verificado, ex.: `The Bold <acesso@seudominio.com.br>`) |

Sem essas credenciais, as integrações aparecem **desconectadas**. Nada é simulado.

## Documentação
- [`docs/01-processo-real.md`](docs/01-processo-real.md): o processo reconstruído (Notion, Slack, Calendar, PDFs), conflitos e decisões
- [`docs/02-arquitetura.md`](docs/02-arquitetura.md): dados, Process Engine, permissões, regra × IA, mídia, integrações, segurança, migração
- [`docs/03-automacoes.md`](docs/03-automacoes.md): todas as automações mapeadas (MVP/V2/V3), gerado do código
- [`docs/04-mvp-e-roadmap.md`](docs/04-mvp-e-roadmap.md): o que está pronto, próximos passos e decisões em aberto
- [`docs/integracoes/google-drive.md`](docs/integracoes/google-drive.md): especificação da integração com o Google Drive
- [`docs/modulos/reunioes.md`](docs/modulos/reunioes.md): especificação do módulo de Reuniões e videoconferência

## Prévia no Vercel
O repositório já vem pronto para o Vercel: `vercel.json` publica o site (`web/dist`) e a API inteira como uma função (`api/index.js`).
- **Base real (clientes migrados do Notion):** vai para o repositório só **criptografada** (`real-snapshot/bold.db.enc`, AES-256-GCM).
  - A prévia usa a base real quando a variável `BOLD_SNAPSHOT_KEY` está configurada no Vercel (Settings → Environment Variables).
  - A chave fica em `storage/.snapshot-key`, fora do git.
  - Para regerar depois de alterar a base: `node scripts/pack-real.mjs`.
  - A senha da equipe nessa cópia é forte e própria (`storage/.team-password`); a senha de testes não funciona nela.
- **Sem a chave:** a API responde 503 ("base real não configurada"). Não existe base de exemplo.
- **Instâncias:** cada instância da função trabalha numa cópia em `/tmp`, então as alterações feitas na prévia são temporárias. A versão definitiva, com dados persistentes, é banco e arquivos no Supabase.
