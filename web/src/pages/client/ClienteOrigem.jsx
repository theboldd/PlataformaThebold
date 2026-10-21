// Abas do cliente: PENDÊNCIAS (as do cliente, derivadas do estado real) e ORIGEM DOS DADOS (plataforma × Notion).
import { Link } from 'react-router-dom';
import { useApi } from '../../lib/hooks.js';
import { Loading, ErrorBox } from '../../components/ui.jsx';
import { StatePanel, StateTag, Metric } from '../../components/State.jsx';

const SEV = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' };

export function ClientePendencias({ clientId }) {
  const team = useApi('/pendencias?escopo=equipe');
  const mine = useApi(team.error?.status === 403 ? '/pendencias?escopo=minhas' : null, [team.error?.status]);
  const data = team.data || mine.data;
  if (!data && (team.loading || mine.loading)) return <Loading />;
  if (!data) return <ErrorBox error={team.error || mine.error} />;
  const items = data.items.filter((i) => i.client_id === clientId);
  if (!items.length) return <StatePanel s="dados_insuficientes" kicker="Pendências do cliente" title="Nenhuma pendência deste cliente agora.">
    <p>Pendências nascem do estado real: tarefa vencida, conteúdo bloqueado, material ou aprovação esperando, item de onboarding atrasado, fatura vencida. Trabalho migrado do Notion não gera pendência (regra 23).</p>
  </StatePanel>;
  return (
    <div className="table-wrap"><table className="table">
      <thead><tr><th>Pendência</th><th>Prioridade</th><th>Causa</th><th>Quem age</th><th>Próxima ação</th><th>Parado há</th></tr></thead>
      <tbody>{items.map((i) => (
        <tr key={i.id}>
          <td><Link to={`/pendencias?escopo=equipe&p=${encodeURIComponent(i.id)}`} className="strong">{i.title}</Link><div className="xs faint">{i.process || ''}</div></td>
          <td className="sm">{SEV[i.severity] || i.severity}</td><td className="sm">{i.cause_label}</td><td className="sm">{i.who || '—'}</td><td className="sm">{i.next || i.action || '—'}</td><td className="sm">{i.late || '—'}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

export function ClienteOrigem({ clientId }) {
  const { data, error, loading } = useApi(`/clients/${clientId}/origem`);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const n = (o, k) => o[k] || 0;
  const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);
  return (
    <div className="col gap-5">
      <div className="row wrap gap-3" style={{ alignItems: 'center' }}>
        <StateTag s="nao_conectada">Notion: histórico somente leitura</StateTag>
        {data.notion_url ? <a href={data.notion_url} target="_blank" rel="noreferrer" className="xs bordo">Página do cliente no Notion →</a> : <span className="xs muted">Sem página do Notion registrada.</span>}
        {data.notion_section && <span className="xs muted">Seção: {data.notion_section}</span>}
      </div>
      <div className="metric-grid">
        <Metric label="Conteúdos · plataforma" value={n(data.conteudos, 'plataforma')} />
        <Metric label="Conteúdos · Notion" value={n(data.conteudos, 'notion')} hint={sum(data.legado) ? `${sum(data.legado)} legados` : null} />
        <Metric label="Tarefas abertas · plataforma" value={n(data.tarefas_abertas, 'plataforma')} />
        <Metric label="Tarefas abertas · herdadas" value={n(data.tarefas_abertas, 'notion')} hint="fora de carga e performance" />
        <Metric label="Client Brain · Notion" value={n(data.brain, 'notion')} hint={`${n(data.brain, 'plataforma') + n(data.brain, 'onboarding')} da plataforma`} />
        <Metric label="Onboarding · Notion" value={n(data.onboarding, 'notion')} hint={`${n(data.onboarding, 'plataforma')} respondidas na plataforma`} />
        <Metric label="Histórico do Notion" value={sum(data.historico)} hint="CR Editorial e calendários" />
      </div>
      {data.decisoes_abertas > 0 && <StatePanel compact s="aguardando_decisao" kicker="Migração" title={`${data.decisoes_abertas} pontos da migração deste cliente aguardam decisão.`} to="/migracao" action="Abrir decisões" />}
    </div>
  );
}
