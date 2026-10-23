// Linguagem visual de status — sempre forma + texto (nunca só cor)
export const STATUS = {
  rascunho: 'Rascunho', em_producao: 'Em produção', revisao_interna: 'Revisão interna', aguardando_cliente: 'Aguardando cliente',
  ajuste_solicitado: 'Ajuste solicitado', em_ajuste: 'Em ajuste', aprovado: 'Liberado para publicação', aprovacao_nao_registrada: 'Aprovação não registrada', liberada_equipe: 'Liberada pela equipe (sem aprovação do cliente)', agendado: 'Agendado', publicado: 'Publicado', bloqueado: 'Bloqueado', cancelado: 'Cancelado',
};
export const STATUS_GLYPH = { aprovado: '✓', agendado: '→', publicado: '●' };
export const FORMATS = { reel: 'Reel', video: 'Vídeo', carrossel: 'Carrossel', estatico: 'Estático', foto: 'Foto', stories: 'Stories' };
export const FUNCTIONS = { estrategia: 'Estrategista', design: 'Design', edicao: 'Edição de vídeo', copy: 'Copy / legenda', revisao: 'Revisão', agendamento: 'Agendamento', atendimento: 'Atendimento', cliente: 'Cliente' };
export const PRIORITY = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
export const RISK = { nenhum: '—', baixo: 'Baixo', medio: 'Médio', alto: 'Alto', critico: 'Crítico' };
export const LEVEL = { info: 'Informativa', atencao: 'Atenção', urgente: 'Urgente' };
export const SEVERITY = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' };
