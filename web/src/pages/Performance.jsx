// EQUIPE · PERFORMANCE — entregas, prazo, atraso, devolução, reabertura, bloqueio, reprogramação e capacidade por pessoa.
// Só eventos válidos (nascidos na plataforma). Sem score e sem ranking: pessoas em ordem alfabética e o contexto de cada atraso.
// Com 0 eventos, a estrutura aparece inteira e diz "dados insuficientes" — nunca um número inventado.
import { Link } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { useUrlState } from '../lib/nav.jsx';
import { Loading, ErrorBox, PageHead, Seg, Section } from '../components/ui.jsx';
import { StateTag, StatePanel, Metric } from '../components/State.jsx';
import { FUNCTIONS } from '../lib/status.js';
import { fmtDate, cleanName } from '../lib/format.js';

const COLS = [
  ['entregas', 'Entregas'], ['no_prazo', 'No prazo'], ['com_atraso', 'Com atraso'], ['devolucoes', 'Devoluções'], ['reaberturas', 'Reaberturas'],
  ['bloqueios', 'Bloqueios agora'], ['reprogramacoes', 'Reprogramações'], ['abertas', 'Abertas'], ['vencidas', 'Vencidas'],
];

export default function Performance() {
  useCrumbs('Equipe · Performance');
  const [dias, setDias] = useUrlState('dias', '30');
  const { data, error, loading } = useApi(`/performance?dias=${dias}`, [dias]);
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  if (loading && !data) return <div className="page"><Loading rows={8} /></div>;
  const none = data.state !== 'ativo';
  const sum = (k) => data.people.reduce((s, p) => s + p[k], 0);
  return (
    <div className="page">
      <PageHead kicker="Equipe" title="Performance" sub="Como o trabalho da equipe está fluindo: entregas, prazos, devoluções, reaberturas, bloqueios, reprogramações e capacidade. Sem nota e sem ranking — números brutos, com o contexto de cada atraso.">
        <Seg label="Período" value={dias} onChange={setDias} options={[{ value: '7', label: '7 dias' }, { value: '30', label: '30 dias' }, { value: '90', label: '90 dias' }]} />
      </PageHead>

      <div className="row wrap gap-3 mb-4" style={{ alignItems: 'center' }}>
        <StateTag s={data.state}>{none ? 'Dados insuficientes para medir performance' : `${data.valid_events} eventos válidos no período`}</StateTag>
        <span className="xs muted">{fmtDate(data.period.start)} → {fmtDate(data.period.end)}</span>
      </div>

      {none && (
        <StatePanel s="dados_insuficientes" kicker="Por que não há números" title="Nenhum evento válido no período.">
          <p>Eventos válidos são tarefas concluídas, devoluções, reaberturas e reprogramações de trabalho que <b>nasceu na plataforma</b>. Hoje a operação ainda roda sobre o que veio do Notion{data.migrated_open ? ` (${data.migrated_open} tarefas herdadas abertas)` : ''}, que fica à parte e nunca pesa contra ninguém.</p>
          <p>Assim que o primeiro ciclo rodar na plataforma, esta tela passa a mostrar os números reais de cada pessoa.</p>
        </StatePanel>
      )}

      <Section kicker="Equipe" title="Visão do período">
        <div className="metric-grid">
          {COLS.slice(0, 7).map(([k, l]) => <Metric key={k} label={l} value={sum(k)} s={none ? 'dados_insuficientes' : 'ativo'} />)}
          <Metric label="Tendência" s={data.people.some((p) => p.tendencia) ? 'ativo' : 'dados_insuficientes'} value={data.people.filter((p) => p.tendencia).length ? `${data.people.reduce((s, p) => s + (p.tendencia?.atual || 0), 0)} vs ${data.people.reduce((s, p) => s + (p.tendencia?.anterior || 0), 0)}` : null} hint="entregas: período atual vs anterior" />
        </div>
      </Section>

      <Section kicker="Por pessoa" title="Pessoas">
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Pessoa</th>{COLS.map(([k, l]) => <th key={k} className="num">{l}</th>)}<th className="num">Herdadas</th><th>Capacidade</th><th>Tendência</th></tr></thead>
          <tbody>{data.people.map((p) => (
            <tr key={p.id}>
              <td><div className="strong">{p.name}</div><div className="xs faint">{p.functions.map((f) => FUNCTIONS[f] || f).join(' · ') || 'Sem função operacional'}</div></td>
              {COLS.map(([k]) => <td key={k} className="num tnum">{p.eventos_validos || ['bloqueios', 'abertas', 'vencidas'].includes(k) ? p[k] : <span className="faint">—</span>}</td>)}
              <td className="num tnum faint" title="Herdadas do Notion: à parte, não pesam">{p.herdadas || '—'}</td>
              <td className="xs"><span className="tnum">{p.capacidade_configurada}/semana</span><div className="faint">configurada · medida: dados insuficientes</div></td>
              <td className="xs">{p.tendencia ? `${p.tendencia.atual} vs ${p.tendencia.anterior}` : <StateTag s="dados_insuficientes" />}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <p className="xs muted mt-2">“—” = sem evento válido no período. Pessoas em ordem alfabética: não existe ranking.</p>
      </Section>

      <Section kicker="Previsão · próximos 7 dias" title="Quem pode ficar sobrecarregado">
        <p className="sm muted" style={{ margin: '0 0 12px' }}>Demanda com prazo na próxima semana × capacidade configurada. Confiança {data.forecast.confianca}. É só um alerta: nada é redistribuído sozinho.</p>
        {data.forecast.state !== 'ativo' ? <StatePanel compact s="dados_insuficientes" title="Nenhuma tarefa nascida na plataforma com prazo nos próximos 7 dias." /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Pessoa</th><th className="num">Demanda (7 dias)</th><th className="num">Capacidade configurada</th><th>Clientes</th><th>Situação</th></tr></thead>
            <tbody>{data.forecast.items.filter((f) => f.demanda).map((f) => <tr key={f.id}><td className="strong">{f.name}</td><td className="num tnum">{f.demanda}</td><td className="num tnum">{f.capacidade}</td><td className="xs">{f.clientes.map(cleanName).join(' · ')}</td><td className="xs">{f.alerta ? <StateTag s="aguardando_decisao">Pode ficar sobrecarregado</StateTag> : 'Dentro da capacidade configurada'}</td></tr>)}</tbody>
          </table></div>
        )}
      </Section>

      <Section kicker="Contexto" title="Atrasos e o que estava acontecendo">
        {!data.late.length ? <StatePanel compact s="dados_insuficientes" title="Nenhum atraso de trabalho nascido na plataforma no período." /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Tarefa</th><th>Pessoa</th><th>Prazo</th><th>Situação</th><th>Contexto</th></tr></thead>
            <tbody>{data.late.map((t) => (
              <tr key={t.id}>
                <td><div className="strong">{t.title}</div><div className="xs faint">{cleanName(t.client || '')}{t.number ? ` · #${t.number}` : ''}</div></td>
                <td className="sm">{t.pessoa || 'Sem responsável'}</td>
                <td className="sm">{fmtDate(t.due_at)}</td>
                <td className="sm">{t.status === 'concluida' ? `Concluída em ${fmtDate(t.completed_at)}` : 'Em aberto, vencida'}</td>
                <td className="sm">{t.blocked ? `Bloqueado: ${t.block_reason || 'sem motivo'}` : t.waiting_on ? `Aguardando ${t.waiting_on}` : 'Sem bloqueio registrado'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Section>

      <Section kicker="Regras" title="Como esta tela conta">
        <ul className="sm muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>{data.rules.map((r) => <li key={r}>{r}</li>)}</ul>
        <p className="xs muted mt-2">Itens herdados do Notion ainda não validados: <Link to="/atrasos" className="bordo">Itens legados</Link>.</p>
      </Section>
    </div>
  );
}
