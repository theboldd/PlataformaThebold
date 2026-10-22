// Relatórios periódicos: os números são calculados do banco; a narrativa (opcional) vem do Claude.
import { one, all, insert, uid, now } from '../db.js';
import { STAGES, NOT_LEGACY, PLATFORM_CONTENT } from '../engine/process.js';
import { computePendencies } from '../engine/intelligence.js';

// Regras 22–24: a parte OPERACIONAL usa só conteúdo/tarefa da plataforma (filtro estrutural por data_origin/legacy_status).
// O que veio do Notion aparece à parte, em "historico_migrado", nunca somado à operação.
export function generateReport(kind, start, end) {
  const p = [start, end];
  const PC = PLATFORM_CONTENT('c.'), NL = NOT_LEGACY('c.');
  const data = {
    periodo: { inicio: start, fim: end },
    producao: {
      conteudos_criados: one(`SELECT COUNT(*) n FROM contents c WHERE c.created_at BETWEEN ? AND ? AND ${PC}`, ...p).n,
      aprovados_cliente: one(`SELECT COUNT(*) n FROM approvals a JOIN contents c ON c.id=a.content_id WHERE a.kind='cliente' AND a.decision='aprovado' AND a.created_at BETWEEN ? AND ? AND ${PC}`, ...p).n,
      ajustes_internos: one(`SELECT COUNT(*) n FROM adjustments a JOIN contents c ON c.id=a.content_id WHERE a.origin='interno' AND a.created_at BETWEEN ? AND ? AND ${PC}`, ...p).n,
      ajustes_cliente: one(`SELECT COUNT(*) n FROM adjustments a JOIN contents c ON c.id=a.content_id WHERE a.origin='cliente' AND a.created_at BETWEEN ? AND ? AND ${PC}`, ...p).n,
      publicados: one(`SELECT COUNT(*) n FROM contents c WHERE c.published_at BETWEEN ? AND ? AND ${PC}`, ...p).n,
      tarefas_concluidas: one("SELECT COUNT(*) n FROM tasks WHERE status='concluida' AND completed_at BETWEEN ? AND ? AND data_origin='plataforma'", ...p).n,
      tarefas_concluidas_com_atraso: one("SELECT COUNT(*) n FROM tasks WHERE status='concluida' AND completed_at BETWEEN ? AND ? AND due_at < completed_at AND data_origin='plataforma' AND COALESCE(stage,'') NOT IN ('agendamento','agendado','publicado')", ...p).n,
    },
    etapas: all(`SELECT c.stage, COUNT(*) n FROM contents c WHERE c.stage NOT IN ('cancelado') AND ${PC} AND ${NL} GROUP BY c.stage`).map((r) => ({ etapa: STAGES[r.stage]?.label, n: r.n })),
    pendencias_criticas: computePendencies().filter((x) => x.severity === 'critica').length,
    equipe: all(`SELECT u.name,
        (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id=u.id AND t.status IN ('aberta','em_andamento') AND t.data_origin='plataforma') abertas,
        (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id=u.id AND t.status IN ('aberta','em_andamento') AND t.due_at < ? AND t.data_origin='plataforma' AND COALESCE(t.stage,'') NOT IN ('agendamento','agendado','publicado')) atrasadas,
        (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id=u.id AND t.status='concluida' AND t.completed_at > ? AND t.data_origin='plataforma') concluidas_7d
      FROM users u WHERE u.active=1 AND u.role_key<>'cliente' ORDER BY u.name`, now(), new Date(Date.now() - 7 * 864e5).toISOString()),
    insights: all("SELECT problem, suggestion FROM ai_insights WHERE status='aberto' ORDER BY updated_at DESC LIMIT 10"),
    // Histórico da migração — informativo, separado da operação
    historico_migrado: {
      nota: 'Dados vindos do Notion. Não entram em contagens, status, alertas ou indicadores da operação.',
      conteudos_migrados_em_andamento: one(`SELECT COUNT(*) n FROM contents c WHERE c.data_origin='notion' AND c.legacy_status IS NULL AND c.stage NOT IN ('cancelado','publicado')`).n,
      itens_legados_nao_validados: one("SELECT COUNT(*) n FROM contents WHERE legacy_status='nao_validado'").n,
      tarefas_migradas_abertas: one("SELECT COUNT(*) n FROM tasks WHERE data_origin='notion' AND status IN ('aberta','em_andamento','agendada')").n,
    },
  };
  if (kind === 'financeiro' || kind === 'operacao') {
    data.financeiro = {
      recebido: one("SELECT COALESCE(SUM(paid_amount),0) v FROM invoices WHERE paid_at BETWEEN ? AND ?", ...p).v,
      atrasado: one("SELECT COALESCE(SUM(amount),0) v FROM invoices WHERE (status='atrasada' OR (status='aberta' AND due_at < strftime('%Y-%m-%dT%H:%M:%fZ','now')))").v,
    };
  }
  return insert('reports', { id: uid('rp_'), kind, period_start: start, period_end: end, data: JSON.stringify(data), narrative: null, generated_by: 'sistema', created_at: now() });
}
