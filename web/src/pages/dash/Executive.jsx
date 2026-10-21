// VISÃO GERAL · CEO — central de decisão. Escaneável em segundos:
// estado → indicadores (clicáveis, com drill-down) → o que precisa da sua atenção → compromissos → operação → inteligência → atalhos.
// Serifada só para personalidade (saudação, títulos de seção, números-chave); dados em sans. Tudo que parece clicável leva a algo real.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi, useAuth } from '../../lib/hooks.js';
import { Drawer, Loading, ErrorBox, Seg, Empty } from '../../components/ui.jsx';
import { I } from '../../components/Icons.jsx';
import { ContentRows } from '../intel/parts.jsx';
import { cleanName, fmtDate, fmtWeekday, greeting, firstName, money } from '../../lib/format.js';
import '../../styles/exec.css';
import { restoredOverlay } from '../../lib/nav.jsx';

const pad = (n) => String(n).padStart(2, '0');
const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const PERIODS = [{ value: 'hoje', label: 'Hoje' }, { value: '7d', label: '7 dias' }, { value: '30d', label: '30 dias' }, { value: 'custom', label: 'Personalizado' }];
const STATE = { ok: 'Em dia', atencao: 'Atenção', critico: 'Crítico' };
const RISK = { critico: 'crítico', alto: 'alto' };

function useCount(target) {
  const [v, setV] = useState(target);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !target) { setV(target); from.current = target; return; }
    const start = performance.now(), a = from.current;
    let raf;
    const step = (t) => { const p = Math.min(1, (t - start) / 600); setV(Math.round(a + (target - a) * (1 - (1 - p) ** 3))); if (p < 1) raf = requestAnimationFrame(step); else from.current = target; };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

function Kpi({ n, label, aux, alert, onClick, to }) {
  const v = useCount(n);
  const body = (<><span className={`ex-kpi-n ${alert ? 'alert' : ''}`}>{pad(v)}</span><span className="ex-kpi-l">{label}</span><span className="ex-kpi-a">{aux}</span></>);
  const aria = `${label}: ${n}. ${aux}. Abrir lista`;
  return to ? <Link className="ex-kpi" to={to} data-cursor="ABRIR" aria-label={aria}>{body}</Link> : <button type="button" className="ex-kpi" onClick={onClick} data-cursor="ABRIR" aria-label={aria}>{body}</button>;
}

export default function Executive() {
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  const qs = useMemo(() => { const p = new URLSearchParams(); for (const k of ['period', 'from', 'to']) if (params.get(k)) p.set(k, params.get(k)); return p.toString(); }, [params]);
  const { data, error, loading } = useApi(`/dashboard${qs ? `?${qs}` : ''}`, [qs]);
  const [drawer, setDrawer] = useState(() => restoredOverlay('visao-geral'));
  const set = (patch) => setParams((p) => { const n = new URLSearchParams(p); for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); } return n; }, { replace: true });
  const period = params.get('period') || '7d';
  const today = new Date();

  const header = (
    <header className="ex-head">
      <div>
        <div className="ex-meta"><span>{fmtWeekday(today)} · {fmtDate(today, { year: 'numeric' })}</span></div>
        <h1 className="ex-hello">{greeting()}, <i>{firstName(auth.user.name)}.</i></h1>
        <p className="ex-q">Como está a operação da The Bold?</p>
      </div>
      <div className="ex-period">
        <Seg options={PERIODS} value={period} onChange={(v) => set({ period: v === '7d' ? '' : v, ...(v !== 'custom' ? { from: '', to: '' } : {}) })} label="Período" />
        {period === 'custom' && (
          <span className="ex-dates">
            <input type="date" className="input" aria-label="De" value={params.get('from') || ''} onChange={(e) => set({ period: 'custom', from: e.target.value })} />
            <span aria-hidden>→</span>
            <input type="date" className="input" aria-label="Até" value={params.get('to') || ''} onChange={(e) => set({ period: 'custom', to: e.target.value })} />
          </span>
        )}
        {data?.exec && <span className="ex-period-l">Compromissos e prazos: {data.exec.window.label.toLowerCase()}</span>}
      </div>
    </header>
  );

  if (error) return <>{header}<ErrorBox error={error} /></>;
  if (!data?.exec) return <>{header}<Loading rows={6} /></>;
  const e = data.exec;
  const k = e.kpis;
  const maxOp = Math.max(1, ...e.operation.map((s) => s.n));

  return (
    <div className={`ex ${loading ? 'is-loading' : ''}`}>
      {header}

      {/* ESTADO */}
      <p className={`ex-state s-${e.state}`} aria-live="polite">
        <span className="ex-state-tag"><span className={`ex-dot d-${e.state}`} aria-hidden /> {STATE[e.state]}</span>
        <span className="ex-state-t">{e.headline}</span>
        <span className="ex-base">{pl(e.base.total, 'cliente na base', 'clientes na base')}{e.base.a_confirmar ? ` · ${e.base.a_confirmar} com status a confirmar` : ''} · {e.base.com_conteudo ? pl(e.base.com_conteudo, 'com conteúdo em andamento', 'com conteúdo em andamento') : 'nenhum com conteúdo em andamento'}</span>
      </p>

      {/* INDICADORES */}
      <section className="ex-kpis" aria-label="Indicadores executivos">
        <Kpi n={k.risk.n} label="Clientes em risco" alert={k.risk.n > 0} onClick={() => setDrawer({ kind: 'risk' })}
          aux={k.risk.n ? (k.risk.critico ? `${k.risk.critico} em risco crítico` : 'risco alto') : 'nenhum cliente em risco'} />
        <Kpi n={k.critical.n} label="Pendências críticas" alert={k.critical.n > 0} to="/pendencias?escopo=equipe&sev=critica"
          aux={k.critical.n ? (k.critical.vencidas ? pl(k.critical.vencidas, 'vencida', 'vencidas') : 'nenhuma vencida') : 'nada travando a operação'} />
        <Kpi n={k.producao.n} label="Em produção" onClick={() => setDrawer({ kind: 'stage', stage: k.producao.stages.join(','), title: 'Em produção' })}
          aux={k.producao.n ? (k.producao.atrasados ? `${k.producao.atrasados} com prazo vencido` : 'todos no prazo') : 'nenhum conteúdo em produção'} />
        <Kpi n={k.aguardando.n} label="Aguardando cliente" alert={k.aguardando.mais_48h > 0} onClick={() => setDrawer({ kind: 'stage', stage: k.aguardando.stages.join(','), title: 'Aguardando cliente' })}
          aux={k.aguardando.n ? (k.aguardando.mais_48h ? `${k.aguardando.mais_48h} há mais de 48h` : 'todos há menos de 48h') : 'nenhuma aprovação pendente'} />
      </section>

      <div className="ex-grid">
        {/* PRECISA DA SUA ATENÇÃO — área principal */}
        <section className="ex-att" aria-labelledby="ex-att-t">
          <div className="ex-sh"><h2 id="ex-att-t" className="ex-title">Precisa da sua atenção</h2>{e.attention_total > 0 && <span className="ex-count">{pl(e.attention_total, 'situação', 'situações')}</span>}</div>
          {!e.attention.length ? <p className="ex-empty">Nada exige sua atenção agora.</p> : (
            <ol className="ex-att-list">
              {e.attention.map((a) => (
                <li key={a.id}>
                  <Link to={a.action.to} className={`ex-att-item l-${a.level}`} data-cursor="ABRIR">
                    <span className="ex-att-head">
                      <span className="ex-prio"><span className={`ex-dot d-${a.level}`} aria-hidden /> {a.level === 'critico' ? 'Crítico' : 'Atenção'}</span>
                      <span className="ex-att-client">{cleanName(a.client || '')}</span>
                      {a.time && <span className="ex-att-time">{a.time}</span>}
                    </span>
                    <span className="ex-att-p">{a.problem}</span>
                    <span className="ex-att-meta">
                      {a.impact && <span><b>Impacto</b>{a.impact}</span>}
                      {a.who && <span><b>Responsável</b>{a.who}</span>}
                      {a.context && <span><b>Onde</b>{a.context}</span>}
                    </span>
                    <span className="ex-att-go">{a.action.label} <I.arrow size={13} /></span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          <div className="ex-foot"><Link className="ex-more" to="/pendencias?escopo=equipe">Ver todas as pendências <I.arrow size={13} /></Link></div>
        </section>

        {/* PRÓXIMOS COMPROMISSOS */}
        <section className="ex-agenda" aria-labelledby="ex-ag-t">
          <div className="ex-sh"><h2 id="ex-ag-t" className="ex-title sm">Próximos compromissos</h2></div>
          {e.agenda.items.length ? (
            <ul className="ex-ag-list">
              {e.agenda.items.map((m) => {
                const dt = new Date(m.starts_at);
                const isToday = dt.toDateString() === new Date().toDateString();
                return (
                  <li key={m.id}>
                    <Link to={`/reunioes?m=${m.id}`} className="ex-ag-item">
                      <span className="ex-ag-time">{dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}<small>{isToday ? 'Hoje' : fmtDate(m.starts_at)}</small></span>
                      <span className="ex-ag-body"><b>{m.title}</b><small>{m.client ? cleanName(m.client) : m.kind === 'interna' ? 'Interna' : 'Sem cliente vinculado'}</small></span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="ex-empty-sm">
              <p>Nenhuma reunião marcada na plataforma {period === 'hoje' ? 'para hoje' : 'neste período'}.</p>
              {e.agenda.google.status !== 'conectado' && <p className="ex-note">Google Agenda não conectada: compromissos de lá não aparecem aqui. <Link className="ex-inline" to="/integracoes">Conectar</Link></p>}
            </div>
          )}
          <div className="ex-foot"><Link className="ex-more" to="/calendario">Abrir calendário <I.arrow size={13} /></Link></div>
        </section>

        {/* OPERAÇÃO */}
        <section className="ex-op" aria-labelledby="ex-op-t">
          <div className="ex-sh"><h2 id="ex-op-t" className="ex-title sm">Operação</h2><span className="ex-count">onde o trabalho está agora</span></div>
          {e.operation.length ? (
            <ul className="ex-bars">
              {e.operation.map((s) => (
                <li key={s.stage}>
                  <Link to={`/processos?stage=${s.stage}`} className="ex-bar" aria-label={`${s.label}: ${pl(s.n, 'conteúdo', 'conteúdos')}${s.blocked ? `, ${pl(s.blocked, 'bloqueado', 'bloqueados')}` : ''}. Abrir em Processos`}>
                    <span className="ex-bar-l">{s.label}</span>
                    <span className="ex-bar-track" aria-hidden><span style={{ '--w': `${(s.n / maxOp) * 100}%` }} /></span>
                    <span className="ex-bar-n">{s.n}{s.blocked ? <small> · {s.blocked} bloq.</small> : null}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="ex-empty-sm">Nenhum conteúdo em andamento no processo. O primeiro ciclo de cada cliente começa em Processos.</p>}
          <div className="ex-foot"><Link className="ex-more" to="/processos">Abrir processos <I.arrow size={13} /></Link></div>
        </section>

        {/* INTELIGÊNCIA */}
        <section className="ex-intel" aria-labelledby="ex-in-t">
          <div className="ex-sh"><h2 id="ex-in-t" className="ex-title sm">Inteligência The Bold</h2>{e.intel_total > 0 && <span className="ex-count">{pl(e.intel_total, 'leitura', 'leituras')}</span>}</div>
          {!e.intel.length ? <p className="ex-empty-sm">Nenhum padrão sustentado pelos dados de hoje.</p> : e.intel.map((x) => (
            <article key={x.id} className="ex-in">
              <span className="ex-in-k">{x.kind}</span>
              <p className="ex-in-t">{x.what}</p>
              {x.why && <p className="ex-in-p"><b>Por que importa</b>{x.why}</p>}
              {x.todo && <p className="ex-in-p"><b>O que fazer</b>{x.todo}</p>}
              {x.records?.length ? (
                <button className="ex-more" onClick={() => setDrawer({ kind: 'records', title: x.kind, intro: x.what, records: x.records })}>{x.records.length === 1 ? 'Ver o registro' : `Ver os ${x.records.length} registros`} <I.arrow size={13} /></button>
              ) : x.link ? <Link className="ex-more" to={x.link}>Investigar <I.arrow size={13} /></Link> : null}
            </article>
          ))}
          {e.intel_total > e.intel.length && <div className="ex-foot"><Link className="ex-more" to="/insights">Todas as leituras <I.arrow size={13} /></Link></div>}
        </section>
      </div>

      {/* ATALHOS — o detalhe mora em outros módulos */}
      <nav className="ex-links" aria-label="Aprofundar">
        <Link to="/torre"><span>Torre de Controle</span><small>Operação inteira, gargalos e investigação</small><I.arrow size={14} /></Link>
        {e.finance && <Link to="/financeiro"><span>Financeiro</span><small>{e.finance.has_data ? `${money(e.finance.recebido_mes)} recebido no mês${e.finance.atrasado ? ` · ${money(e.finance.atrasado)} em atraso` : ''}` : 'Dados insuficientes: nenhum contrato ou fatura cadastrado'}</small><I.arrow size={14} /></Link>}
        <Link to="/torre?tab=pessoas"><span>Capacidade da equipe</span><small>{e.capacity.open ? `${pl(e.capacity.open, 'tarefa aberta', 'tarefas abertas')}${e.capacity.acima ? ` · ${pl(e.capacity.acima, 'pessoa acima', 'pessoas acima')} da capacidade` : ''}` : 'Nenhuma tarefa aberta na equipe'}</small><I.arrow size={14} /></Link>
        <Link to="/automacoes"><span>Automações</span><small>{e.automations.runs_7d ? `${pl(e.automations.runs_7d, 'execução', 'execuções')} em 7 dias${e.automations.errors_7d ? ` · ${pl(e.automations.errors_7d, 'falha', 'falhas')}` : ''}` : 'Nenhuma execução nos últimos 7 dias'}</small><I.arrow size={14} /></Link>
      </nav>

      <ExecDrawer drawer={drawer} risks={e.risks} onClose={() => setDrawer(null)} />
    </div>
  );
}

function ExecDrawer({ drawer, risks, onClose }) {
  if (!drawer) return null;
  return (
    <Drawer open onClose={onClose} restore={drawer} restoreKey="visao-geral" title={drawer.kind === 'risk' ? 'Clientes em risco' : drawer.title} kicker="Visão geral" wide={drawer.kind === 'stage'}>
      {drawer.kind === 'risk' && (!risks.length ? <Empty title="Nenhum cliente em risco." /> : (
        <ul className="ex-rec">{risks.map((r) => (
          <li key={r.id}><Link to={`/clientes/${r.id}`}><b>{cleanName(r.name)}</b><small>Risco {RISK[r.level]} · {r.reasons.slice(0, 3).join(' · ') || 'calculado pelos conteúdos do cliente'}</small><I.arrow size={13} /></Link></li>
        ))}</ul>
      ))}
      {drawer.kind === 'stage' && <StageItems stage={drawer.stage} />}
      {drawer.kind === 'records' && (
        <>
          <p className="sm muted">{drawer.intro}</p>
          <ul className="ex-rec">{drawer.records.map((r, i) => <li key={i}><Link to={r.to}><b>{cleanName(r.label)}</b>{r.meta && <small>{r.meta}</small>}<I.arrow size={13} /></Link></li>)}</ul>
        </>
      )}
    </Drawer>
  );
}

function StageItems({ stage }) {
  const key = new URLSearchParams({ stage }).toString();
  const { data, loading } = useApi(`/process/board?${key}`, [key], { live: false });
  if (loading || !data) return <Loading rows={4} />;
  return <><ContentRows items={data.lanes.flatMap((l) => l.cards)} empty="Nenhum conteúdo aqui agora." /><Link className="btn btn-primary mt-5" to={`/processos?stage=${stage}`}>Abrir em Processos (filtrado)</Link></>;
}
