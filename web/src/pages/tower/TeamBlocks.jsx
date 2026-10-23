// Blocos de equipe que saíram da Torre (23/10): capacidade por pessoa e desempenho do período.
// Agora vivem em Equipe & Performance. Mesmos dados da Torre (engine/tower.js), via GET /performance/equipe.
import { Link } from 'react-router-dom';
import { I } from '../../components/Icons.jsx';
import { ago } from '../../lib/format.js';
import { FUNCTIONS } from '../../lib/status.js';
import { n2 } from '../intel/parts.jsx';
import '../../styles/tower.css';

const SITUATION = { sobrecarga: 'Sobrecarga', alta: 'Alta', normal: 'Normal', sem_carga: 'Sem carga', so_herdada: 'Dados insuficientes' };
const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function Capacity({ d }) {
  return (
    <>
      {d.people_insights.length > 0 && (
        <ul className="tw-pins">{d.people_insights.map((p, i) => <li key={i}><span className="tw-label">{p.kind}</span><span>{p.text}</span><Link className="tw-more" to={p.link}>Ver <I.arrow size={13} /></Link></li>)}</ul>
      )}
      <p className="tw-lead">Carga, alertas e situação usam só tarefas nascidas na plataforma. Tarefas herdadas da migração aparecem à parte e não pesam contra ninguém. Capacidade = valor configurado no cadastro, não medido.</p>
      <div className="tw-table tw-cap-table" role="table" aria-label="Capacidade por pessoa">
        <div className="tw-tr tw-th" role="row"><span role="columnheader">Pessoa</span><span role="columnheader">Abertas</span><span role="columnheader">Herdadas</span><span role="columnheader">Atrasadas</span><span role="columnheader">Próx. 7 dias</span><span role="columnheader">Carga × capacidade</span><span role="columnheader">Situação</span></div>
        {d.people.map((p) => {
          const max = Math.max(p.capacity, p.open_real, 1);
          return (
            <Link key={p.id} className="tw-tr" role="row" to={`/processos?assignee_id=${p.id}`} aria-label={`${p.name}: ${p.open_real} abertas da plataforma, ${p.open_inherited} herdadas, ${p.late} atrasadas`}>
              <span className="tw-person" role="cell"><b>{p.name}</b><small>{p.functions.map((f) => FUNCTIONS[f] || f).join(' · ') || 'Sem função operacional'}</small></span>
              <span className="n" role="cell" data-l="Abertas">{p.open_real}</span>
              <span className="n muted" role="cell" data-l="Herdadas" title="Herdadas da migração: fora de alertas e indicadores">{p.open_inherited}{p.inherited ? <small> · {p.inherited} c/ prazo de migração vencido</small> : null}</span>
              <span className={`n ${p.late ? 'alert' : ''}`} role="cell" data-l="Atrasadas">{p.late}</span>
              <span className="n" role="cell" data-l="Próx. 7 dias">{p.next7}{p.next7_inherited ? <small>+ {p.next7_inherited} herdadas</small> : null}</span>
              <span className="tw-cap" role="cell" title={`${p.open_real} de ${p.capacity}/semana (${p.capacity_source})`}><i style={{ width: `${(p.open_real / max) * 100}%` }} /><s style={{ left: `${(p.capacity / max) * 100}%` }} /></span>
              <span className={`tw-sit s-${p.situation}`} role="cell">{SITUATION[p.situation]}</span>
            </Link>
          );
        })}
      </div>
      {d.performance_base && <p className="tw-lead mt-4"><b>Base de performance:</b> {d.performance_base.valid_events ? `${d.performance_base.valid_events} evento(s) operacional(is) válido(s) registrado(s)` : 'DADOS INSUFICIENTES — nenhuma tarefa concluída nascida na plataforma ainda'}{d.performance_base.pending_classification ? ` · ${d.performance_base.pending_classification} item(ns) herdado(s) aguardando classificação, fora da base` : ''}. Score individual não é calculado.</p>}
      {d.fn_load.length > 0 && <p className="tw-lead mt-4">Por função: {d.fn_load.map((f) => `${FUNCTIONS[f.fn] || f.fn} — ${pl(f.open, 'aberta', 'abertas')} para ${pl(f.people, 'pessoa', 'pessoas')}`).join(' · ')}</p>}
    </>
  );
}

const PERF = [
  ['conteudos_criados', 'Conteúdos criados'], ['temas_aprovados', 'Temas aprovados'], ['aprovados_cliente', 'Aprovados pelo cliente'], ['ajustes_internos', 'Ajustes internos', true],
  ['ajustes_cliente', 'Ajustes de cliente', true], ['publicados', 'Publicados'], ['tarefas_concluidas', 'Tarefas concluídas'], ['concluidas_atraso', 'Concluídas com atraso', true], ['prazos_estourados', 'Prazos estourados', true],
];
export function PeriodPerformance({ p }) {
  const c = p.current, v = p.previous;
  const total = PERF.reduce((a, [k]) => a + (c[k] || 0), 0);
  const delta = (k, worse) => {
    if (!p.comparable) return null;
    const dd = (c[k] || 0) - (v[k] || 0);
    if (!dd) return <span className="tw-delta">igual ao período anterior</span>;
    const bad = worse ? dd > 0 : dd < 0;
    return <span className={`tw-delta ${bad ? 'bad' : 'good'}`}>{dd > 0 ? '↑' : '↓'} {Math.abs(dd)} vs. período anterior</span>;
  };
  return (
    <>
      {!p.comparable && <p className="tw-hist">Histórico insuficiente para comparação.</p>}
      {!total && !p.moves_n ? <p className="tw-empty">Nenhuma movimentação registrada no período.</p> : null}
      <div className="tw-perf">
        {PERF.map(([k, l, worse]) => (
          <div key={k} className="tw-pm"><span className="tw-pm-n">{n2(c[k] || 0)}</span><span className="tw-label">{l}</span>{delta(k, worse)}</div>
        ))}
        <div className="tw-pm"><span className="tw-pm-n">{c.tempo_aprovacao != null ? String(c.tempo_aprovacao).replace('.', ',') : '—'}</span><span className="tw-label">Dias até o cliente aprovar</span>
          <span className="tw-delta">{c.tempo_aprovacao_n ? `média de ${pl(c.tempo_aprovacao_n, 'aprovação', 'aprovações')}` : 'sem aprovações no período'}</span></div>
      </div>
      {p.moves.length > 0 && (
        <div className="tw-moves">
          <h3 className="tw-h3">O que mudou · {pl(p.moves_n, 'movimentação', 'movimentações')} de etapa</h3>
          <ul>{p.moves.map((m, i) => <li key={i}>{m.content_id ? <Link to={`/conteudos/${m.content_id}`}>{m.summary}</Link> : m.summary}<small>{ago(m.created_at)}</small></li>)}</ul>
        </div>
      )}
    </>
  );
}
