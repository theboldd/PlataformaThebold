# THE BOLD — Operating System

O sistema operacional interno da The Bold: processos, produção, aprovações, clientes, comunicação, agenda e inteligência em um só lugar.
**Princípio:** a plataforma sabe o que precisa acontecer. O Process Engine move o trabalho sozinho; as pessoas só fazem o trabalho.

## Rodar localmente
Requer Node ≥ 22.5 (usa `node:sqlite`) e ffmpeg (para vídeos).
```bash
npm install
npm run seed        # cria o banco de demonstração passando pelo Process Engine (dados fictícios [DEMO])
npm run build       # compila o frontend
npm start           # http://localhost:4000
# desenvolvimento: npm run dev  (API :4000 + Vite :5173)
npm test            # testes do engine, permissões, auditoria e mídia
```
Logins de demonstração (senha `thebold2026`):

| Perfil | E-mail |
|---|---|
| CEO | rebeca@thebold.demo |
| Operações | vitoria@thebold.demo |
| Gestão | vivian@thebold.demo |
| Qualidade | raisa@thebold.demo |
| Estratégia | juliane@thebold.demo, monique@thebold.demo |
| Design | felipe@thebold.demo |
| Edição | leo@thebold.demo, nicole@thebold.demo |
| Comercial | matheus@thebold.demo |
| Clientes | helena@cliente.demo, vertice@cliente.demo, moretti@cliente.demo, atelier@cliente.demo, aurora@cliente.demo, sena@cliente.demo |

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

Sem essas credenciais, as integrações aparecem **desconectadas**. Nada é simulado.

## Documentação
- [`docs/01-processo-real.md`](docs/01-processo-real.md): o processo reconstruído (Notion, Slack, Calendar, PDFs), conflitos e decisões
- [`docs/02-arquitetura.md`](docs/02-arquitetura.md): dados, Process Engine, permissões, regra × IA, mídia, integrações, segurança, migração
- [`docs/03-automacoes.md`](docs/03-automacoes.md): todas as automações mapeadas (MVP/V2/V3), gerado do código
- [`docs/04-mvp-e-roadmap.md`](docs/04-mvp-e-roadmap.md): o que está pronto, próximos passos e decisões em aberto
- [`docs/integracoes/google-drive.md`](docs/integracoes/google-drive.md): especificação da integração com o Google Drive
- [`docs/modulos/reunioes.md`](docs/modulos/reunioes.md): especificação do módulo de Reuniões e videoconferência

## Prévia no Vercel (dados de demonstração)
O repositório já vem pronto para o Vercel: `vercel.json` publica o site (`web/dist`) e a API inteira como uma função (`api/index.js`).
- A prévia usa **dados fictícios** (`demo-snapshot/`, gerados por `npm run seed`). A base real migrada do Notion nunca vai para o repositório.
- Cada instância nova da função copia o banco de demonstração para `/tmp`. Alterações feitas na prévia são temporárias.
- Login: `rebeca@thebold.demo` (CEO), `felipe@thebold.demo` (design), `sena@cliente.demo` (cliente) etc. Senha: `thebold2026`.
- Para atualizar o snapshot: `BOLD_DATA_DIR=/tmp/d BOLD_STORAGE_DIR=/tmp/d npm run seed` e copie `bold.db`, `originals/` e `derived/` para `demo-snapshot/`.
- Versão definitiva (dados reais, persistentes): banco e arquivos no Supabase. Ver docs/04-mvp-e-roadmap.md.
