// Relatórios periódicos: os números são calculados do banco; a narrativa (opcional) vem do Claude.
import { one, all, insert, uid, now } from '../db.js';
import { STAGES } from '../engine/process.js';
import { computePendencies, teamLoad } from '../engine/intelligence.js';

export function generateReport(kind, start, end) {
  const p = [start, end];
  const data = {
    periodo: { inicio: start, fim: end },
    producao: {
      conteudos_criados: one('SELECT COUNT(*) n FROM contents WHERE created_at BETWEEN ? AND ?', ...p).n,
      aprovados_cliente: one("SELECT COUNT(*) n FROM approvals WHERE kind='cliente' AND decision='aprovado' AND created_at BETWEEN ? AND ?", ...p).n,
      ajustes_internos: one("SELECT COUNT(*) n FROM adjustments WHERE origin='interno' AND created_at BETWEEN ? AND ?", ...p).n,
      ajustes_cliente: one("SELECT COUNT(*) n FROM adjustments WHERE origin='cliente' AND created_at BETWEEN ? AND ?", ...p).n,
      publicados: one("SELECT COUNT(*) n FROM contents WHERE published_at BETWEEN ? AND ?", ...p).n,
      tarefas_concluidas: one("SELECT COUNT(*) n FROM tasks WHERE status='concluida' AND completed_at BETWEEN ? AND ?", ...p).n,
      tarefas_concluidas_com_atraso: one("SELECT COUNT(*) n FROM tasks WHERE status='concluida' AND completed_at BETWEEN ? AND ? AND due_at < completed_at", ...p).n,
    },
    etapas: all("SELECT stage, COUNT(*) n FROM contents WHERE stage NOT IN ('cancelado') GROUP BY stage").map((r) => ({ etapa: STAGES[r.stage]?.label, n: r.n })),
    pendencias_criticas: computePendencies().filter((x) => x.severity === 'critica').length,
    equipe: teamLoad().map(({ name, open, late, done_7d }) => ({ name, abertas: open, atrasadas: late, concluidas_7d: done_7d })),
    insights: all("SELECT problem, suggestion FROM ai_insights WHERE status='aberto' ORDER BY updated_at DESC LIMIT 10"),
  };
  if (kind === 'financeiro' || kind === 'operacao') {
    data.financeiro = {
      recebido: one("SELECT COALESCE(SUM(paid_amount),0) v FROM invoices WHERE paid_at BETWEEN ? AND ?", ...p).v,
      atrasado: one("SELECT COALESCE(SUM(amount),0) v FROM invoices WHERE status='atrasada'").v,
    };
  }
  return insert('reports', { id: uid('rp_'), kind, period_start: start, period_end: end, data: JSON.stringify(data), narrative: null, generated_by: 'sistema', created_at: now() });
}
