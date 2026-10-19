# Migração da base real — Notion → THE BOLD OS

**Fluxo:** NOTION (CRONOGRAMA → CLIENTES MKT / CLIENTES ADVS MKT + ESPAÇO CLIENTE) → levantamento → estruturação → migração → Client Brain → plataforma.

## Como rodar
1. O levantamento fica em `storage/migration/notion/*.json`. São dados reais e ficam fora do git. Há um arquivo por cliente, mais `_onboarding_form.json`, `_onboarding_answers.json`, `_team_map.json` e `_issues.json`.
2. `npm run base:real` cria o banco só com a equipe e importa os clientes reais.
   - `npm run migrar:notion` reimporta sem duplicar: identifica cada cliente pela `notion_url`, substitui só o que veio do Notion e preserva o que foi feito na plataforma.
   - `npm run seed` cria só a equipe, sem clientes. Não existe base de exemplo.
3. O relatório de validação, com as 10 checagens, é gerado em `storage/migration/relatorio-migracao.md`.

## Regras aplicadas
- **Procedência:** cada informação vira um registro em `client_brain_entries`. O registro guarda:
  - `origin`: onboarding_cliente, equipe, observacao_interna ou indefinido;
  - a página e o link de origem.
  - A origem não muda quando a equipe edita o registro.
- **Formulário:** respostas do formulário "Sua marca" vão para `onboarding_answers`, ligadas à pergunta oficial. Quando a página do cliente e o cartão do formulário divergem, as duas versões são preservadas e um ponto de revisão é aberto.
- **Nada inventado:** campos vazios ficam vazios.
- **Nada descartado:** o que não tem campo próprio vai para uma seção nova do Brain ou para "outro".
- **Fora desta etapa:** calendários editoriais (só listados no relatório) e credenciais.
- **Equipe:** é vinculada a partir de RESPONSÁVEIS POR CLIENTE e DIVISÃO EQUIPE. Funções com fontes divergentes não são aplicadas e viram ponto de revisão.
- **Decisões da equipe:** `storage/migration/notion/_decisoes.json` (fora do git) registra o que a equipe confirmou, como "dois nomes no Notion são a mesma cliente". Esses nomes viram apelidos de uma ficha só, e equipe e cartões casam com ela em qualquer reimportação.
- **Divisão:** a página `/divisao` mostra a divisão de clientes (pessoa · função · clientes), como na DIVISÃO EQUIPE. Toda a equipe interna pode ver. A fonte é a equipe de cada ficha.
- **Pontos de revisão:** ambiguidades, conflitos, páginas inacessíveis e possíveis duplicados vão para `migration_issues`. Aparecem na aba Ficha → Revisão; nada é escolhido automaticamente.
- **Status:** cliente sem status explícito no Notion recebe `a_confirmar`.

## Onboarding de novos clientes (fluxo oficial)
1. Novo cliente: são criados o onboarding e seus itens. Os itens são o formulário "Sua marca", os acessos e os passos da equipe de MEMÓRIA → CLIENTE NOVO.
2. O cliente preenche o formulário em `/portal/onboarding`. São 6 etapas com as mesmas perguntas do Notion, e cada resposta é salva automaticamente.
3. Cada resposta vai para o cadastro e para o Client Brain com origem "onboarding_cliente". Logins e senhas vão para o cofre cifrado; revelar exige `clientes.admin` e fica no histórico.
4. Enquanto o formulário não é enviado, o portal mostra o onboarding como pendente. O envio:
   - marca o formulário como concluído;
   - notifica estratégia e atendimento;
   - conclui o onboarding quando todos os itens obrigatórios foram recebidos. Isso ativa o cliente e abre o primeiro ciclo.
5. Perguntas obrigatórias são configuráveis em `onboarding_forms.required_keys`. No Notion, nenhuma é obrigatória.
6. **Melhoria proposta:** trocar login/senha por acesso de parceiro via Meta Business.
