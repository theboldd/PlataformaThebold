// PÁGINA "PROCESSO" DO NOTION (workspace THE BOLD MKT) — auditoria somente leitura feita em 22/10/2026 às 12:34 UTC.
// Lido pela integração (MCP do Notion): a página, as 6 subpáginas/blocos e as 10 bases com esquema e contagem de linhas.
// Este arquivo NÃO contém dados de clientes: só estrutura, contagens e o mapeamento proposto para a The Bold OS.
// Nada aqui executa sincronização: a sincronização viva aguarda NOTION_TOKEN + hospedagem persistente + aprovação do mapa.
//
// papel: operacional (alimenta funcionalidade) · documentacao (só consulta) · historico (somente leitura) · fora (não sincronizar)
// estado: importado_extracao (veio uma vez por exportação; sem sync viva) · nao_sincronizado · sem_mapeamento · aguardando_decisao · fora_do_escopo
export const AUDIT = { at: '2026-10-22T12:34:05Z', via: 'MCP do Notion (leitura de páginas, esquemas e contagem por SQL)' };

export const PROCESSO = {
  notion_id: '3c06957a-41e3-80f4-91ca-f3c49e08383f',
  url: 'https://app.notion.com/p/3c06957a41e380f491caf3c49e08383f',
  path: 'THE BOLD MKT / PROCESSO',
  last_edited: '2026-10-14T15:22:47Z',
};

export const ITEMS = [
  {
    key: 'padrao', name: 'Controle produção PADRÃO', container: 'PADRÃO', kind: 'base',
    notion_id: '3c06957a-41e3-8064-ab9c-d665e85b923b', data_source: '3c06957a-41e3-806b-b0e3-000b2f63d4de',
    rows: 93, last_edited: '2026-09-30T19:43:30Z', extracted_at: null,
    role: 'documentacao', state: 'nao_sincronizado', direction: 'Notion → The Bold (só leitura)',
    destination: 'Process Engine · etapas (referência)',
    mapped: [
      ['Cronograma', 'cronograma'], ['Análise cronograma', 'analise_cronograma'], ['Análise produção', 'analise_producao'],
      ['Aguardando ajustes', 'ajuste_interno'], ['Para agendamento', 'agendamento'], ['Agendado', 'agendado'],
      ['Legenda · Design Felipe/Moni/Nicole · Edição de vídeo Leo/Nicole', 'producao (trilhas legenda e design/vídeo; o nome da coluna é o responsável)'],
      ['Pendente por material', 'bloqueio “Pendente por material do cliente” (não é etapa)'],
    ],
    unmapped: ['Cronograma pronto (saída do ajuste do cronograma, sem etapa própria)', 'Ajustados pós análise (saída do ajuste interno, sem etapa própria)', 'Aprovação dos Clientes (ambíguo: aprovação do tema ou aprovação final)', 'Selecionar (LEGENDA/DESIGN/REELS/Cronograma) — tipo do card'],
    note: 'Modelo de quadro (93 cards de exemplo). Serve de referência das etapas; os cards não viram conteúdos. Mudança aqui nunca altera etapas do Process Engine sozinha.',
  },
  {
    key: 'setembro', name: 'Controle produção SETEMBRO', container: 'CONTROLES CRONOGRAMAS - MESES 2026', kind: 'base',
    notion_id: '3d76957a-41e3-80b5-a6c2-caecb16ed697', data_source: 'ef46957a-41e3-82a6-9abb-8770603db901',
    rows: 82, last_edited: '2026-09-30T19:48:12Z', extracted_at: null,
    role: 'historico', state: 'aguardando_decisao', direction: 'Notion → The Bold (histórico)',
    destination: 'Notion & Histórico (somente leitura), se aprovado',
    mapped: [['Nome', 'cliente (por nome)'], ['Cronograma (coluna)', 'etapa da época'], ['Selecionar', 'tipo do card']],
    unmapped: ['Corpo dos cards (não extraído)'],
    note: 'Mês encerrado. Não importado. Decisão: trazer como histórico somente leitura ou deixar fora.',
  },
  {
    key: 'outubro', name: 'Controle produção OUTUBRO', container: 'PROCESSO', kind: 'base',
    notion_id: '3eb6957a-41e3-8029-97a5-f868d1c4d0bd', data_source: '1266957a-41e3-8225-bb0f-074e01ea33d4',
    rows: 109, rows_extracted: 109, last_edited: '2026-10-22T02:13:00Z', extracted_at: '2026-10-19T18:26:47Z',
    role: 'operacional', state: 'importado_extracao', direction: 'Notion → The Bold',
    destination: 'Conteúdos e tarefas (data_origin=notion) · Client Brain operacional · pontos de revisão', platform_ref: 'notion-out:', issues_source: 'notion:outubro',
    mapped: [['Nome', 'cliente'], ['Cronograma (coluna)', 'etapa / responsável'], ['Selecionar', 'tipo (LEGENDA/DESIGN/REELS/Cronograma)'], ['Lista de checagem', 'quantidade de conteúdos'], ['Texto e comentários', 'observações internas']],
    unmapped: ['Pessoas mencionadas como usuário do Notion (sem mapeamento para usuários da plataforma)'],
    note: 'Importado uma vez. A base foi editada no Notion depois da extração — essas mudanças não estão na plataforma.',
  },
  {
    key: 'novembro', name: 'Controle produção NOVEMBRO', container: 'PROCESSO', kind: 'base',
    notion_id: '3eb6957a-41e3-806a-a6a8-d0cdad0094f1', data_source: '8b46957a-41e3-827b-9403-07548e2476b7',
    rows: 108, rows_extracted: 106, last_edited: '2026-10-22T12:34:00Z', extracted_at: '2026-10-19T17:24:28Z',
    role: 'operacional', state: 'importado_extracao', direction: 'Notion → The Bold',
    destination: 'Conteúdos e tarefas (data_origin=notion) · Client Brain operacional · pontos de revisão', platform_ref: 'notion-nov:', issues_source: 'notion:novembro',
    mapped: [['Nome', 'cliente'], ['Cronograma (coluna)', 'etapa / responsável'], ['Selecionar', 'tipo'], ['Lista de checagem', 'quantidade de conteúdos'], ['Texto e comentários', 'observações internas']],
    unmapped: ['Pessoas mencionadas como usuário do Notion'],
    note: '108 cards no Notion hoje × 106 extraídos em 19/10: 2 cards novos e edições posteriores não estão na plataforma.',
  },
  {
    key: 'inicio', name: 'Controle INÍCIO CLIENTE', container: 'PROCESSO', kind: 'base',
    notion_id: '3c26957a-41e3-800d-8d5d-f740a60ac31b', data_source: '6c36957a-41e3-83cc-9f73-874203aee377',
    rows: 3, rows_extracted: 3, last_edited: null, extracted_at: '2026-10-19T18:26:47Z',
    role: 'operacional', state: 'importado_extracao', direction: 'Notion → The Bold',
    destination: 'Onboarding / Client Brain (entrada operacional do cliente)', platform_ref: 'notion-inicio:',
    mapped: [['Nome', 'cliente'], ['Coluna (Semana 1…5)', 'semana do início'], ['Selecionar', 'equipe marcada'], ['Texto e comentários', 'observação interna']],
    unmapped: ['Semana do início não vira etapa do onboarding da plataforma (registrado só como entrada no Client Brain)', 'Data da última edição da base não lida nesta auditoria'],
    note: 'Fluxo de entrada de cliente. Importado como observação; não cria nem altera o onboarding sozinho.',
  },
  {
    key: 'aprov_doc', name: 'CONTROLE DE APROVAÇÕES (página)', container: 'PROCESSO', kind: 'pagina',
    notion_id: '3f46957a-41e3-813e-b549-db4aff05d8c9', rows: null, last_edited: '2026-10-09T22:19:14Z', extracted_at: null,
    role: 'documentacao', state: 'nao_sincronizado', direction: 'Notion → The Bold (só leitura)',
    destination: 'Referência: calendário do ciclo (marcos), regras de gatilho de aprovação, modelo de lembrete',
    mapped: [['Calendário do ciclo NOVEMBRO/2026', 'marcos do ciclo (comparação abaixo)'], ['Regras do gatilho', 'comparar com as automações de aprovação da plataforma']],
    unmapped: ['Tabela de destinatários no Slack (Slack não conectado; não sincronizar IDs)', 'Modelo de mensagem de lembrete (texto de referência)', '“Prazo arte/vídeo” — a própria página diz que não existe no calendário'],
    note: 'Documentação. Uma mudança aqui NÃO altera prazos, regras ou notificações da plataforma sem validação.',
  },
  {
    key: 'aprov_db', name: 'Controle de Aprovações', container: 'CONTROLE DE APROVAÇÕES', kind: 'base',
    notion_id: '2e2c7650-b0fd-4083-8950-2d9ad094bd08', data_source: 'bf28711a-5dcc-49c0-a48b-144ea17110a9',
    rows: 23, last_edited: '2026-10-16T11:52:15Z', extracted_at: null,
    role: 'operacional', state: 'sem_mapeamento', direction: 'Notion → The Bold (informativo)',
    destination: 'Ciclo do cliente · estado de aprovação (somente informativo — regra 14: aprovação só com registro na plataforma)',
    mapped: [],
    unmapped: ['Status / Status automático (fórmula)', 'Tema aprovado · Arte/vídeo aprovado · Pediu ajuste', 'Progresso tema / arte-reels', '⏱ Prazo tema · Prazo arte/vídeo · Liberação arte/reels · Próximo follow-up', '👤 Estrategista · 🎨 Designer · 🎬 Editor(a) (pessoas do Notion)', 'Verificação · Acesso · Pendência de responsável', 'Chave / Identificador do evento (deduplicação)'],
    note: 'Camada de controle mantida por automação externa. Não importado. Se entrar, entra como informação ao lado do ciclo — nunca como aprovação.',
  },
  {
    key: 'aprov_log', name: '📜 Log de eventos de aprovação', container: 'CONTROLE DE APROVAÇÕES', kind: 'base',
    notion_id: '333d4989-111b-4cdf-9ea1-4e1e34a8014e', data_source: 'ca993e85-1667-4dd3-953d-d6f04c377e0d',
    rows: 182, last_edited: '2026-10-21T18:56:11Z', extracted_at: null,
    role: 'historico', state: 'aguardando_decisao', direction: 'Notion → The Bold (histórico)',
    destination: 'Histórico do conteúdo/cliente (somente leitura), se aprovado',
    mapped: [],
    unmapped: ['Evento · Tipo (tema/arte_reels) · Ciclo · Cliente (texto) · Conteúdo aprovado · Data do post · Origem · Página de origem · Notificado no Slack'],
    note: 'Registro de checkboxes marcados no CR Editorial. Informativo: não vale como aprovação na plataforma.',
  },
  {
    key: 'aprov_teste', name: '🧪 TESTE — CR EDITORIAL (base de teste)', container: 'CONTROLE DE APROVAÇÕES', kind: 'base',
    notion_id: '4019b505-c6c9-413e-8282-578f11dc3e0d', data_source: '232fff4b-f0f9-4a7f-83d0-32954ef6bbd5',
    rows: null, last_edited: null, extracted_at: null,
    role: 'fora', state: 'fora_do_escopo', direction: '—', destination: '—', mapped: [], unmapped: [],
    note: 'Base de teste. Não sincronizar.',
  },
  {
    key: 'central_doc', name: 'CENTRAL DE CLIENTES — MEMÓRIA OPERACIONAL (página)', container: 'PROCESSO', kind: 'pagina',
    notion_id: '3f46957a-41e3-8101-9268-dfd19cb17788', rows: null, last_edited: '2026-10-09T23:49:44Z', extracted_at: null,
    role: 'documentacao', state: 'nao_sincronizado', direction: 'Notion → The Bold (só leitura)',
    destination: 'Referência: regras de interpretação, níveis de atenção, deduplicação (comparar com Torre de Controle / Insights)',
    mapped: [],
    unmapped: ['Configuração da tarefa automática (VALIDAÇÃO/APROVADO, PILOTO/TODOS) — pertence à rotina externa, não à plataforma', 'Classificação de atenção 24h/48h/72h — proposta, não regra da plataforma'],
    note: 'Documentação de uma rotina externa (Claude lendo Notion/Slack/Calendar/Drive). Não altera regras da plataforma.',
  },
  {
    key: 'central_db', name: 'Central de Clientes', container: 'CENTRAL DE CLIENTES', kind: 'base',
    notion_id: '9dd0d703-0ecc-40c0-86ae-aa33e3d73ff4', data_source: 'a799f5d0-9a0f-47ee-82de-996511dfb519',
    rows: 22, last_edited: '2026-10-22T12:00:22Z', extracted_at: null,
    role: 'operacional', state: 'aguardando_decisao', direction: 'Notion → The Bold (informativo)',
    destination: 'Cliente · visão geral (leitura externa), se aprovado',
    mapped: [],
    unmapped: ['Status atual · Nível de atenção · Aguardando · Pendências · Pontos de atenção · Próxima ação · Responsável pela próxima ação · Prazo · Conflitos e não confirmados · Fontes lidas/não acessíveis'],
    note: 'Interpretações de uma rotina externa (contém inferências). Não entra como fato nem gera pendência automaticamente.',
  },
  {
    key: 'central_hist', name: 'Histórico de Eventos', container: 'CENTRAL DE CLIENTES', kind: 'base',
    notion_id: 'a4c47bd4-d0ff-434b-9c2b-69a096594f34', data_source: '84b1b8b2-1e4b-444e-93a1-8f5f260a9027',
    rows: 190, last_edited: '2026-10-22T12:00:15Z', extracted_at: null,
    role: 'historico', state: 'aguardando_decisao', direction: 'Notion → The Bold (histórico)',
    destination: 'Linha do tempo do cliente (somente leitura), se aprovado',
    mapped: [],
    unmapped: ['Evento · Tipo de evento (32 tipos) · Fonte (Notion/Slack/Calendar/Drive) · Lado · Confiança · Nível de atenção · Status · Prazo · Pessoa responsável · Chave · Link da origem'],
    note: 'Eventos de várias fontes com grau de confiança. Só entraria como histórico; nunca como pendência ou decisão automática.',
  },
];

// milestone: marco(s) da plataforma possivelmente correspondentes (lista = correspondência ambígua, todas mostradas)
// Calendário do ciclo NOVEMBRO/2026 escrito na página CONTROLE DE APROVAÇÕES (lido do Google Calendar em 09/10, segundo a página)
export const CYCLE_NOV_2026 = [
  { etapa: 'Clientes aprovam crono (tema) + pedem alterações', start: '2026-10-08', end: '2026-10-15', milestone: 'cliente_aprova_temas' },
  { etapa: 'Estrategistas visualizam comentários', start: '2026-10-16', end: '2026-10-16', milestone: null },
  { etapa: 'Produção (legenda, reels, design)', start: '2026-10-16', end: '2026-10-22', milestone: 'producao' },
  { etapa: 'Revisão produção', start: '2026-10-23', end: '2026-10-24', milestone: 'revisao_producao' },
  { etapa: 'Ajustes equipe', start: '2026-10-25', end: '2026-10-26', milestone: 'ajustes_equipe' },
  { etapa: 'Tudo pronto / Revisão e liberação para clientes', start: '2026-10-27', end: '2026-10-28', milestone: ['tudo_pronto', 'cliente_aprova_final'] },
  { etapa: 'Clientes comentam entrega + ajustes', start: '2026-10-29', end: '2026-10-30', milestone: ['cliente_aprova_final', 'ajustes_cliente'] },
];
