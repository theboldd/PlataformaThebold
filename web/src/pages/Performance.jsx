// EQUIPE & PERFORMANCE — fatos por pessoa, só com dados nascidos na plataforma. Sem score e sem ranking (decisão da CEO).
// A tela existe sempre; sem eventos válidos suficientes mostra DADOS INSUFICIENTES PARA MEDIR PERFORMANCE.
import { Link } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { useUrlState } from '../lib/nav.jsx';
import { PageHead, Section, Seg, Loading, ErrorBox, Empty, Avatar } from '../components/ui.jsx';
import { StateBadge, StateNotice } from '../components/State.jsx';
import { fmtDate } from '../lib/format.js';
import '../styles/state.css';
import '../styles/performance.css';

const PERIODS = [{ value: '7', label: '7 dias' }, { value: '30', label: '30 dias' }, { value: '90', label: '90 dias' }];
const FN = { estrategia: 'Estratégia', design: 'Design', edicao: 'Edição', copy: 'Copy', revisao: 'Revisão', agendamento: 'Agendamento', atendimento: 'Atendimento' };
const TREND = { subiu: 'Mais entregas que no período anterior', caiu: 'Menos entregas que no período anterior', estavel: 'Mesmo volume do período anterior' };
const TREND_GLYPH = { subiu: '↑', caiu: '↓', estavel: '→' };
const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Métrica: número real ou "—" com o motivo de não haver valor
function Metric({ label, value, reason, hint }) {
  const missing = value === null || value === undefined;
  return (
    <div className={`pf-m ${missing ? 'missing' : ''}`}>
      <span className="pf-m-l">{label}</span>
      <span className="pf-m-v num" title={missing ? reason : hint}>{missing ? '—' : value}</span>
      {missing ? <span className="pf-m-r"><StateBadge s="dados_insuficientes" label="Sem dado" /><span className="xs muted">{reason}</span></span> : hint ? <span className="xs faint">{hint}</span> : null}
    </div>
  );
}

function Person({ p }) {
  const t = p.trend || {};
  return (
    <article className="pf-card">
      <header className="pf-card-h">
        <Avatar name={p.name} />
        <div className="pf-card-id">
          <div className="pf-name">{p.name}</div>
          <div className="xs muted">{[p.title, ...p.functions.map((f) => FN[f] || f)].filter(Boolean).join(' · ') || 'Sem função operacional cadastrada'}</div>
        </div>
      </header>
      <div className="pf-metrics">
        <Metric label="Entregas no período" value={p.done_in_period} hint={p.done_without_due ? `${p.done_without_due} sem prazo` : null} />
        <Metric label="No prazo" value={p.done_on_time} />
        <Metric label="Com atraso" value={p.done_late} />
        <Metric label="Atrasadas abertas" value={p.overdue_open} hint={`${pl(p.open_tasks, 'tarefa aberta', 'tarefas abertas')}`} />
        <Metric label="Reaberturas" value={p.reopened?.value} reason={p.reopened?.reason} hint={p.reopened?.source} />
        <Metric label="Devoluções" value={p.returned?.value} reason={p.returned?.reason} hint={p.returned?.source} />
        <Metric label="Bloqueios" value={p.blocked?.value} reason={p.blocked?.reason} hint={p.blocked?.source} />
        <Metric label="Reprogramações" value={p.reprogrammed?.value} reason={p.reprogrammed?.reason} hint={p.reprogrammed?.source} />
        <Metric label="Capacidade (configurada, não medida)" value={p.capacity_configured != null ? `${p.capacity_configured}/sem` : null} reason="Capacidade não cadastrada." hint="cadastro do usuário" />
        <Metric label="Tendência" value={t.value ? `${TREND_GLYPH[t.value]} ${t.current} × ${t.previous}` : null} reason={t.reason} hint={t.value ? TREND[t.value] : null} />
      </div>
      {p.inherited_open > 0 && <p className="xs faint pf-note">+ {pl(p.inherited_open, 'tarefa herdada', 'tarefas herdadas')} do Notion em aberto — fora da medição.</p>}
      {p.blocked?.items?.length > 0 && (
        <div className="pf-sub">
          <span className="caps">Bloqueados agora</span>
          <ul className="pf-list">{p.blocked.items.map((b) => <li key={b.id}><Link to={b.content_id ? `/conteudos/${b.content_id}` : '#'}>{b.title}</Link><span className="xs muted"> · {b.client || 'Sem cliente'}{b.reason ? ` · ${b.reason}` : ''}</span></li>)}</ul>
        </div>
      )}
      {p.recent_deliveries?.length > 0 && (
        <div className="pf-sub">
          <span className="caps">Histórico recente</span>
          <ul className="pf-list">{p.recent_deliveries.map((d) => <li key={d.id}><span>{d.title}</span><span className="xs muted"> · {d.client || 'Sem cliente'} · {fmtDate(d.completed_at)}{d.on_time === false ? ' · com atraso' : d.on_time ? ' · no prazo' : ' · sem prazo'}</span></li>)}</ul>
        </div>
      )}
    </article>
  );
}

export default function Performance() {
  useCrumbs('Equipe & Performance');
  const [days, setDays] = useUrlState('dias', '30');
  const { data, error, loading } = useApi(`/performance?days=${days}`, [days]);
  const ve = data?.valid_events;
  const late = (data?.people || []).flatMap((p) => p.late_context.map((l) => ({ ...l, person: p.name })));
  return (
    <div className="page pf">
      <PageHead kicker="EQUIPE" title="Equipe & Performance" sub="Fatos por pessoa, só com dados nascidos na plataforma. Sem score e sem ranking. Itens migrados do Notion e legados nunca contam contra ninguém.">
        <Seg label="Período" options={PERIODS} value={String(days)} onChange={setDays} />
      </PageHead>
      <ErrorBox error={error} />
      {loading && !data ? <Loading rows={6} /> : data && (
        <>
          {ve.sufficient
            ? <div className="pf-state"><StateBadge s="ativo" /><span className="sm muted">{pl(ve.count, 'evento válido', 'eventos válidos')} no período (mínimo {ve.threshold}).</span></div>
            : (
              <StateNotice s="dados_insuficientes" title="DADOS INSUFICIENTES PARA MEDIR PERFORMANCE">
                {pl(ve.count, 'evento válido', 'eventos válidos')} nos últimos {data.period.days} dias — o mínimo para medir é {ve.threshold}. {data.insufficient_reason}
                <span className="pf-def">Evento válido: {ve.definition} Total desde o início da coleta: {ve.all_time}.</span>
              </StateNotice>
            )}

          <div className="pf-team">
            <div><span className="caps">Pessoas</span><b className="num">{data.team.people}</b></div>
            <div><span className="caps">Entregas</span><b className="num">{data.team.done_in_period}</b></div>
            <div><span className="caps">No prazo</span><b className="num">{data.team.done_on_time}</b></div>
            <div><span className="caps">Com atraso</span><b className="num">{data.team.done_late}</b></div>
            <div><span className="caps">Atrasadas abertas</span><b className="num">{data.team.overdue_open}</b></div>
            <div><span className="caps">Capacidade configurada</span><b className="num">{data.team.capacity_configured}/sem</b></div>
          </div>

          <Section title="Pessoas" kicker={data.period.label}>
            {!data.people.length ? <Empty title="Nenhuma pessoa ativa da equipe." /> : <div className="pf-grid">{data.people.map((p) => <Person key={p.id} p={p} />)}</div>}
          </Section>

          <Section title="Contexto dos atrasos" kicker="Atraso não é culpa: o motivo registrado vem junto">
            {!late.length ? <Empty title="Nenhum atraso de tarefa da plataforma no período.">Atrasos de itens herdados do Notion ficam na Revisão de itens legados.</Empty> : (
              <ul className="pf-late">
                {late.sort((a, b) => b.days_late - a.days_late).map((l) => (
                  <li key={`${l.person}-${l.id}`}>
                    <div className="pf-late-t">{l.content_id ? <Link to={`/conteudos/${l.content_id}`}>{l.title}</Link> : l.title}</div>
                    <div className="xs muted">{l.person} · {l.client || 'Sem cliente'} · {l.stage} · {pl(l.days_late, 'dia', 'dias')} de atraso · {l.status === 'aberta' ? 'em aberto' : 'concluída'}</div>
                    <div className="xs">Motivo: {l.reason}</div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Padrões" kicker="Só com evidência nos dados">
            <p className="sm muted">Esta tela não deduz padrões de pessoas. Padrões operacionais (gargalos, retrabalho, sobrecarga, concentração) são detectados com evidência na Inteligência e na Torre de Controle.</p>
            <div className="row wrap gap-2">
              <Link className="btn btn-sm" to="/insights">Ver Insights →</Link>
              <Link className="btn btn-sm" to="/torre">Ver Torre de Controle →</Link>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
