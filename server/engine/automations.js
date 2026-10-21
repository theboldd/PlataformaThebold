// Catálogo de automações (EVENTO → CONDIÇÃO → AÇÃO → RESPONSÁVEL → NOTIFICAÇÃO → PRAZO → MOTOR → LOG)
// class: 1 simples · 2 baseada em regras · 3 precisa de IA · 4 precisa de aprovação humana
// implemented=1 → executa nesta versão. As demais estão mapeadas e aparecem como planejadas (V2/V3) na tela de Automações.
import { one, all, insert, run, uid, now } from '../db.js';

export const CATALOG = [
  // ── Process Engine (conteúdo) ──
  ['tarefa.atribuida', 'Etapa iniciada', 'Função da etapa tem pessoa vinculada ao cliente', 'Criar tarefa, atribuir por função (menor carga), definir prazo pelo ciclo', 'Função da etapa', 'Responsável (info, agrupada)', 'Marco do ciclo ou SLA', 'regra', 2, 'MVP', 1],
  ['tema.aprovado', 'Cliente aprovou tema', 'Etapa = aprovação do tema', 'Registrar aprovação → criar trilhas de produção (design/edição + legenda)', 'Designer/Editor + Copy', 'Responsáveis + estrategista', 'Marco “produção”', 'regra', 2, 'MVP', 1],
  ['tema.ajuste', 'Cliente comentou/pediu ajuste no tema', 'Comentário com pedido', 'Voltar para ajuste do cronograma com o pedido anexado', 'Estrategista', 'Estrategista (atenção)', 'Marco “leitura de comentários”', 'regra', 2, 'MVP', 1],
  ['producao.concluida', 'Última trilha de produção entregue', 'Arquivo final + legenda presentes', 'Travar versão → criar revisão interna', 'Revisão (Rebeca/Raísa)', 'Revisores (agrupada)', 'Marco “revisão produção”', 'regra', 2, 'MVP', 1],
  ['revisao.ajuste', 'Revisão solicitou ajuste', '—', 'Criar ajuste interno para quem produziu (ou pessoa escolhida)', 'Produtor', 'Produtor', 'Marco “ajustes equipe”', 'regra', 2, 'MVP', 1],
  ['ajuste.concluido', 'Ajuste concluído', 'Nova versão criada', 'Retornar para revisão (interno) / conferência ou cliente (ajuste do cliente)', 'Revisor / Estrategista', 'Revisor', 'SLA 1 dia útil', 'regra', 2, 'MVP', 1],
  ['revisao.aprovada', 'Revisão interna aprovada', '—', 'Enviar versão ao cliente (feed) e travar versão', 'Cliente', 'Cliente (agrupada por lote)', 'Marco “cliente aprova final”', 'regra', 2, 'MVP', 1],
  ['cliente.notificado_aprovacao', 'Conteúdo entrou em “aguardando cliente”', '—', 'Notificar cliente no portal (agrupado)', 'Cliente', 'Cliente', '—', 'regra', 1, 'MVP', 1],
  ['cliente.aprovou', 'Cliente aprovou conteúdo', 'Versão enviada', 'Congelar versão aprovada → liberar agendamento', 'Agendamento (Vivian)', 'Agendamento + estrategista + Vitória', 'Até 2h antes da publicação', 'regra', 2, 'MVP', 1],
  ['cliente.ajuste', 'Cliente solicitou ajuste', 'Texto obrigatório', 'Criar ajuste do cliente → produtor; status “ajuste solicitado”', 'Produtor', 'Produtor + estrategista', 'Marco “ajustes cliente”', 'regra', 2, 'MVP', 1],
  ['conteudo.agendado', 'Agendamento confirmado', 'Versão aprovada existe', 'Meta conectada: publicar no horário; senão: marcar agendado externamente', 'Agendamento', '—', 'Data/hora definida', 'regra', 2, 'MVP', 1],
  ['meta.publicar', 'Horário de publicação chegou', 'Meta conectada e conteúdo agendado via Meta', 'Criar container e publicar via Instagram Graph API; confirmar status', 'Sistema', 'Agendamento (sucesso/erro)', 'Horário agendado', 'regra', 2, 'MVP', 1],
  ['material.pendente', 'Conteúdo bloqueado por material do cliente', 'Motivo informado', 'Criar pendência do cliente com o que falta', 'Cliente / Atendimento', 'Cliente', 'Antes do marco de produção', 'regra', 2, 'MVP', 1],
  // ── Prazos e régua de cobrança ──
  ['prazo.proximo', 'Prazo de tarefa em < 24h', 'Tarefa aberta', 'Alertar responsável (uma vez)', 'Responsável', 'Responsável (atenção)', '—', 'regra', 1, 'MVP', 1],
  ['etapa.agendada', 'Conteúdo pronto antes de a etapa abrir (ex.: revisão de produção)', 'Etapa com janela no ciclo e início no futuro', 'Tarefa nasce AGENDADA: sem atraso, sem pendência, sem evento; aviso antecipado a revisores e Operações', 'Process Engine', 'Revisores + Operações (aviso agrupado)', 'Abre no início do marco', 'regra', 2, 'MVP', 1],
  ['etapa.disponivel', 'Janela da etapa abriu', 'Tarefa agendada com data de abertura atingida', 'Tarefa vira operacional e entra em prazos/pendências', 'Responsável da função', 'Responsável (info) · sem responsável → Operações (urgente)', 'Prazo = fim do marco', 'regra', 2, 'MVP', 1],
  ['etapa.movida_manual', 'Conteúdo movido manualmente de etapa', 'Pessoa autorizada move o card', 'Registra quem/de onde/para onde/motivo, refaz tarefas da etapa, avalia impacto (prazo, aprovação, agendamento) e avisa responsáveis', 'Quem moveu', 'Responsável anterior e atual · Operações se houver impacto', 'Imediato', 'regra', 2, 'MVP', 1],
  ['prazo.vencido', 'Prazo de tarefa ultrapassado', 'Tarefa aberta', 'Alerta de risco + entra no Centro de Pendências', 'Responsável', 'Responsável (urgente) + Vitória', '—', 'regra', 2, 'MVP', 1],
  ['cliente.sem_resposta_24h', 'Cliente 24h sem responder aprovação', 'Etapa de cliente', 'Lembrete ao cliente no portal (régua: dia seguinte)', 'Cliente', 'Cliente', '—', 'regra', 2, 'MVP', 1],
  ['cliente.sem_resposta_48h', 'Cliente 48h sem responder', 'Etapa de cliente', 'Follow-up para o atendimento com texto pronto para WhatsApp', 'Atendimento (Vivian)', 'Atendimento (atenção)', '1 dia útil', 'regra', 2, 'MVP', 1],
  ['cliente.sem_resposta_72h', 'Cliente 72h sem responder', 'Etapa de cliente', 'Escalar para Operações / CEO', 'Operações', 'Vitória + Rebeca (urgente)', '—', 'regra', 2, 'MVP', 1],
  ['tarefa.sem_responsavel', 'Tarefa criada sem responsável', 'Função sem pessoa vinculada', 'Pendência crítica + notificação', 'Operações', 'Vitória (urgente)', 'Imediato', 'regra', 2, 'MVP', 1],
  ['processo.parado', 'Conteúdo parado > 3 dias úteis na mesma etapa interna', 'Não bloqueado', 'Alertar Operações', 'Operações', 'Vitória (atenção)', '—', 'regra', 2, 'MVP', 1],
  // ── Onboarding ──
  ['cliente.novo', 'Novo cliente cadastrado', '—', 'Iniciar onboarding: projeto, ficha, checklist (formulário, materiais, acessos), canal do cliente', 'Atendimento', 'Equipe vinculada', 'Semana 1–4', 'regra', 2, 'MVP', 1],
  ['onboarding.item_atrasado', 'Item de onboarding passou do prazo', 'Pendente', 'Pendência + lembrete a quem precisa enviar', 'Cliente ou equipe', 'Cliente / atendimento', '—', 'regra', 2, 'MVP', 1],
  ['onboarding.formulario_incompleto', 'Formulário de onboarding com campos faltantes', 'Campos obrigatórios vazios', 'Pendência com a lista exata do que falta', 'Cliente', 'Cliente + atendimento', '—', 'regra', 2, 'MVP', 1],
  ['onboarding.concluido', 'Todos os itens obrigatórios recebidos', '—', 'Marcar onboarding concluído, status do cliente → ativo, criar ciclo', 'Estrategista', 'Estrategista + Rebeca', '—', 'regra', 2, 'MVP', 1],
  // ── Comunicação ──
  ['mencao', 'Alguém foi @mencionado', 'Pessoa autorizada no contexto', 'Notificar a pessoa mencionada', 'Mencionado', 'Mencionado', '—', 'regra', 1, 'MVP', 1],
  ['chat.converter', 'Mensagem marcada como tarefa/pendência/decisão/ajuste', 'Ação humana', 'Criar registro oficial vinculado à mensagem', 'Escolhido', 'Responsável', 'Definido', 'humano', 4, 'MVP', 1],
  ['comentario.cliente', 'Cliente comentou em conteúdo', '—', 'Notificar estrategista da conta (agrupado)', 'Estrategista', 'Estrategista', '—', 'regra', 1, 'MVP', 1],
  // ── Reuniões / agenda ──
  ['reuniao.reservada', 'Cliente reservou horário', 'Horário livre (sem conflito)', 'Criar reunião, convidados, evento Google Calendar (se conectado)', 'Equipe da conta', 'Participantes + cliente', '—', 'regra', 2, 'MVP', 1],
  ['reuniao.itens', 'Ata registrada com ações', 'Ação com responsável', 'Criar tarefa com origem reunião', 'Responsável', 'Responsável', 'Prazo informado', 'regra', 2, 'MVP', 1],
  ['reuniao.extracao_ia', 'Transcrição disponível', 'Consentimento registrado', 'Claude extrai decisões/ações/prazos (sugestões) + resumos', 'Anfitrião confirma', 'Anfitrião', '24h úteis', 'ia', 3, 'V2', 0],
  ['reuniao.resumo_cliente', 'Resumo do cliente aprovado', 'Aprovação interna', 'Publicar no portal e notificar', 'Aprovador', 'Cliente', '—', 'humano', 4, 'V2', 0],
  // ── Comercial / financeiro ──
  ['crm.followup', 'Próxima ação do negócio venceu', 'Negócio aberto', 'Criar tarefa de follow-up para o dono', 'Comercial', 'Dono do negócio', 'Hoje', 'regra', 2, 'V2', 1],
  ['crm.fechado', 'Negócio fechado', '—', 'Criar cliente e iniciar onboarding', 'Operações', 'Rebeca + Vitória', '—', 'humano', 4, 'V2', 1],
  ['financeiro.atraso', 'Parcela vencida sem pagamento', '—', 'Marcar atrasada, alertar financeiro', 'Comercial/Financeiro', 'Financeiro + Rebeca', '—', 'regra', 2, 'V2', 1],
  ['financeiro.vencimento', 'Parcela vence em 3 dias', '—', 'Alertar financeiro', 'Financeiro', 'Financeiro', '—', 'regra', 1, 'V2', 1],
  // ── Inteligência ──
  ['insights.detectar', 'A cada 15 minutos', '—', 'Detectores determinísticos de gargalo, retrabalho, carga, espera', 'Sistema', 'Torre de Controle', '—', 'regra', 2, 'MVP', 1],
  ['insights.narrativa', 'Insight detectado', 'IA configurada', 'Claude explica causa provável e sugere ação', 'Sistema', '—', '—', 'ia', 3, 'V2', 1],
  ['relatorio.semanal', 'Segunda-feira 08h', '—', 'Gerar relatório de operação, produção, clientes e riscos', 'Sistema', 'Rebeca + Vitória', '—', 'regra', 2, 'V2', 1],
  ['brain.feedback', 'Feedback recorrente de cliente', 'IA configurada', 'Sugerir regra/preferência para o Client Brain', 'Estrategista aprova', 'Estrategista', '—', 'ia', 3, 'V3', 0],
  ['estoque.videos', 'Estoque de vídeos brutos do cliente < 1 mês', 'Contagem de materiais', 'Pendência de gravação presencial', 'Estrategista', 'Estrategista + atendimento', '—', 'regra', 2, 'V2', 0],
  ['ciclo.criar', 'Início do ciclo (dia 25 do mês M-2)', 'Cliente ativo', 'Criar ciclo e cards de cronograma conforme pacote mensal', 'Estrategista', 'Estrategistas', 'Marco cronograma', 'regra', 2, 'V2', 0],
  ['drive.material', 'Arquivo novo na pasta de materiais do cliente', 'Drive conectado', 'Vincular ao cliente/ciclo e atender requisito de material', 'Estrategista', 'Estrategista', '—', 'regra', 2, 'V2', 0],
  ['slack.espelhar', 'Etapa-chave concluída', 'Slack conectado', 'Publicar resumo em #aprovações (transição)', 'Sistema', 'Canal', '—', 'regra', 1, 'V2', 0],
  ['previsao.atraso', 'Diário', 'Histórico suficiente', 'Prever conteúdos com risco de atraso', 'Sistema', 'Torre', '—', 'ia', 3, 'V3', 0],
];

export function seedAutomations() {
  for (const [key, event, condition, action, owner, notification, deadline, engine, cls, phase, implemented] of CATALOG) {
    run(`INSERT INTO automations (key,event,condition,action,owner,notification,deadline,engine,class,phase,implemented,enabled) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)
      ON CONFLICT(key) DO UPDATE SET event=excluded.event, condition=excluded.condition, action=excluded.action, owner=excluded.owner, notification=excluded.notification,
      deadline=excluded.deadline, engine=excluded.engine, class=excluded.class, phase=excluded.phase, implemented=excluded.implemented`,
    key, event, condition, action, owner, notification, deadline, engine, cls, phase, implemented);
  }
}

const enabled = (key) => { const a = one('SELECT enabled, implemented FROM automations WHERE key=?', key); return !!(a && a.enabled && a.implemented); };
export const isEnabled = enabled;

// Registra a execução (AutomationRuns). Retorna false se a automação estiver desligada.
export function automation(key, { entity = null, id = null, client = null, detail = null, status = 'ok' } = {}) {
  if (!enabled(key)) return false;
  insert('automation_runs', { id: uid('ar_'), automation_key: key, status, entity_type: entity, entity_id: id, client_id: client, detail, created_at: now() });
  return true;
}
// Idempotência para automações agendadas: só executa uma vez por (chave, entidade, marcador)
export function onceFor(key, entityId, marker) {
  return !one('SELECT 1 FROM automation_runs WHERE automation_key=? AND entity_id=? AND detail=?', key, entityId, marker);
}
export function automationStats() {
  return all(`SELECT a.*, (SELECT COUNT(*) FROM automation_runs r WHERE r.automation_key=a.key) runs,
    (SELECT MAX(created_at) FROM automation_runs r WHERE r.automation_key=a.key) last_run FROM automations a ORDER BY phase, class, key`);
}
