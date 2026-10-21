# THE BOLD OS — Regras oficiais do projeto

Decisões tomadas pela CEO (Rebeca) em 21/10/2026. Valem para todo o código, os dados e os próximos blocos.
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

## Regras anteriores que continuam valendo
- Regra determinística decide status, prazos, permissões, tarefas, atribuições, sincronização e **todo cálculo financeiro**. A IA interpreta e sugere, mas não decide estado crítico, valores nem nada sobre pessoas.
- Permissão sempre verificada no backend. Esconder botão não é proteção.
- `activity_logs` é *append-only*: nada se apaga.
- O cliente final nunca vê informação interna da The Bold.
- Credenciais nunca vão para o repositório. Dados reais de clientes só entram cifrados (`real-snapshot/`).
