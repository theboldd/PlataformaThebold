// BOLDBOARD · CEO — central de decisão. Escaneável em segundos:
// estado → indicadores (clicáveis, com drill-down) → o que precisa da sua atenção (por cliente) → compromissos (post-it) → financeiro/capacidade/minhas → atalhos.
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
import { StateBadge } from '../../components/State.jsx';

const pad = (n) => String(n).padStart(2, '0');
const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const PERIODS = [{ value: 'hoje', label: 'Hoje' }, { value: '7d', label: '7 dias' }, { value: '30d', label: '30 dias' }, { value: 'custom', label: 'Personalizado' }];
const STATE = { ok: 'Em dia', atencao: 'Atenção', critico: 'Crítico' };
const STATE_TONE = { ok: 't-verde', atencao: 't-manteiga', critico: 't-rosa' };
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

function Kpi({ n, label, aux, alert, onClick, to, tone }) {
  const v = useCount(n);
  const body = (<><span className="ex-kpi-top"><span className="ex-kpi-l">{label}</span><span className="ex-kpi-go" aria-hidden>↗</span></span><span className={`ex-kpi-n ${alert ? 'alert' : ''}`}>{pad(v)}</span><span className="ex-kpi-a">{aux}</span></>);
  const aria = `${label}: ${n}. ${aux}. Abrir lista`;
  const cls = `ex-kpi ${tone}`;
  return to ? <Link className={cls} to={to} data-cursor="ABRIR" aria-label={aria}>{body}</Link> : <button type="button" className={cls} onClick={onClick} data-cursor="ABRIR" aria-label={aria}>{body}</button>;
}

// Um cliente que pede atenção: a próxima coisa a resolver, o resumo do que há e a bolinha com o total
function AttCard({ g, onOpen }) {
  const x = g.next;
  const key = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpen(); } };
  return (
    <article className={`ex-ac ${g.level === 'critico' ? 't-rosa' : 't-manteiga'}`} role="button" tabIndex={0} onClick={onOpen} onKeyDown={key} aria-label={`${cleanName(g.client)}: ${pl(g.n, 'situação', 'situações')}. Abrir detalhe`}>
      <span className="ex-ac-dot" aria-hidden>{g.n > 99 ? '99+' : g.n}</span>
      <span className="ex-ac-h">
        {g.client_id ? <Link className="ex-ac-name" to={`/clientes/${g.client_id}`} onClick={(ev) => ev.stopPropagation()} title="Abrir a ficha do cliente">{cleanName(g.client)} ↗</Link> : <span className="ex-ac-name">{cleanName(g.client)}</span>}
        <span className="ex-ac-lvl"><span className={`ex-dot d-${g.level}`} aria-hidden /> {g.level === 'critico' ? 'Crítico' : 'Atenção'}</span>
      </span>
      <span className="ex-ac-k">{g.n > 1 ? 'Próximo a resolver' : 'O que resolver'}</span>
      <span className="ex-ac-p">{x.problem}</span>
      <span className="ex-ac-meta">
        {x.time && <b className={x.level === 'critico' ? 'late' : ''}>{x.time}</b>}
        {x.who && <span>{x.who === 'Você' ? 'Com você' : x.who}</span>}
        {x.context && <span>{x.context}</span>}
      </span>
      <span className="ex-ac-f">
        <span className="ex-ac-sum">{g.summary}{g.inherited ? ` · ${g.inherited === g.n ? (g.n === 1 ? 'herdada' : 'todas herdadas') : `${g.inherited} herdadas`} do Notion` : ''}</span>
        <Link className="ex-ac-go" to={x.action.to} onClick={(ev) => ev.stopPropagation()}>{x.action.label} →</Link>
      </span>
    </article>
  );
}

export default function Executive() {
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  const qs = useMemo(() => { const p = new URLSearchParams(); for (const k of ['period', 'from', 'to']) if (params.get(k)) p.set(k, params.get(k)); return p.toString(); }, [params]);
  const { data, error, loading } = useApi(`/dashboard${qs ? `?${qs}` : ''}`, [qs]);
  const [drawer, setDrawer] = useState(() => restoredOverlay('visao-geral'));
  const [showAll, setShowAll] = useState(false);
  const set = (patch) => setParams((p) => { const n = new URLSearchParams(p); for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); } return n; }, { replace: true });
  const period = params.get('period') || '7d';
  const today = new Date();

  const header = (
    <header className="ex-head">
      <div className="ex-top">
        <span className="ex-meta">{fmtWeekday(today)} · {fmtDate(today, { year: 'numeric' })}</span>
        <div className="ex-period">
          <Seg options={PERIODS} value={period} onChange={(v) => set({ period: v === '7d' ? '' : v, ...(v !== 'custom' ? { from: '', to: '' } : {}) })} label="Período" />
          {period === 'custom' && (
            <span className="ex-dates">
              <input type="date" className="input" aria-label="De" value={params.get('from') || ''} onChange={(e) => set({ period: 'custom', from: e.target.value })} />
              <span aria-hidden>→</span>
              <input type="date" className="input" aria-label="Até" value={params.get('to') || ''} onChange={(e) => set({ period: 'custom', to: e.target.value })} />
            </span>
          )}
        </div>
      </div>
      <h1 className="ex-hello">{greeting()}, <i>{firstName(auth.user.name)}.</i></h1>
      {data?.exec && <span className="ex-period-l">Compromissos e prazos: {data.exec.window.label.toLowerCase()}</span>}
    </header>
  );

  if (error) return <>{header}<ErrorBox error={error} /></>;
  if (!data?.exec) return <>{header}<Loading rows={6} /></>;
  const e = data.exec;
  const k = e.kpis;

  return (
    <div className={`ex ${loading ? 'is-loading' : ''}`}>
      {header}

      {/* ESTADO — a pergunta no centro e, logo abaixo, a resposta em cor */}
      <section className="ex-status" aria-live="polite">
        <p className="ex-q">Como está a operação da The Bold?</p>
        <div className={`ex-state ${STATE_TONE[e.state]}`}>
          <span className="ex-state-tag"><span className={`ex-dot d-${e.state}`} aria-hidden /> {STATE[e.state]}</span>
          <span className="ex-state-t">{e.headline}</span>
          <span className="ex-base">{pl(e.base.total, 'cliente na base', 'clientes na base')}{e.base.a_confirmar ? ` · ${e.base.a_confirmar} com status a confirmar` : ''} · {e.base.com_conteudo ? pl(e.base.com_conteudo, 'com conteúdo em andamento', 'com conteúdo em andamento') : 'nenhum com conteúdo em andamento'}</span>
        </div>
      </section>

      {/* INDICADORES */}
      <section className="ex-kpis" aria-label="Indicadores executivos">
        <Kpi tone="t-rosa" n={k.risk.n} label="Clientes em risco" alert={k.risk.n > 0} onClick={() => setDrawer({ kind: 'risk' })}
          aux={k.risk.n ? (k.risk.critico ? `${k.risk.critico} em risco crítico` : 'risco alto') : 'nenhum cliente em risco'} />
        <Kpi tone="t-pessego" n={k.critical.n} label="Pendências críticas" alert={k.critical.n > 0} to="/pendencias?escopo=equipe&sev=critica"
          aux={k.critical.n ? (k.critical.vencidas ? pl(k.critical.vencidas, 'vencida', 'vencidas') : 'nenhuma vencida') : 'nada travando a operação'} />
        <Kpi tone="t-azul" n={k.producao.n} label="Em produção" onClick={() => setDrawer({ kind: 'stage', stage: k.producao.stages.join(','), title: 'Em produção' })}
          aux={k.producao.n ? (k.producao.atrasados ? `${k.producao.atrasados} com prazo vencido` : 'todos no prazo') : 'nenhum conteúdo em produção'} />
        <Kpi tone="t-lavanda" n={k.aguardando.n} label="Aguardando cliente" alert={k.aguardando.mais_48h > 0} onClick={() => setDrawer({ kind: 'stage', stage: k.aguardando.stages.join(','), title: 'Aguardando cliente' })}
          aux={k.aguardando.n ? (k.aguardando.mais_48h ? `${k.aguardando.mais_48h} há mais de 48h` : 'todos há menos de 48h') : 'nenhuma aprovação pendente'} />
      </section>

      <div className="ex-grid">
        {/* PRECISA DA SUA ATENÇÃO — um cartão por cliente; a bolinha diz quantas situações há nele */}
        <section className="ex-att" aria-labelledby="ex-att-t">
          <div className="ex-sh"><h2 id="ex-att-t" className="ex-title">Precisa da sua atenção</h2>{e.attention_total > 0 && <span className="ex-count">{pl(e.attention_total, 'situação', 'situações')} · {pl(e.attention_groups.length, 'frente', 'frentes')}</span>}</div>
          {!e.attention_groups.length ? <p className="ex-empty">Nada exige sua atenção agora.</p> : (
            <div className="ex-acc">
              {(showAll ? e.attention_groups : e.attention_groups.slice(0, 6)).map((g) => <AttCard key={g.key} g={g} onOpen={() => setDrawer({ kind: 'client', group: g })} />)}
            </div>
          )}
          <div className="ex-foot">
            {e.attention_groups.length > 6 && <button className="ex-more" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Mostrar menos' : `Ver as ${e.attention_groups.length} frentes`} <I.arrow size={13} /></button>}
            <Link className="ex-more" to="/pendencias?escopo=equipe">Ver todas as pendências <I.arrow size={13} /></Link>
          </div>
        </section>

        {/* PRÓXIMOS COMPROMISSOS — post-it preso por um alfinete */}
        <section className="ex-agenda" aria-labelledby="ex-ag-t">
          <div className="ex-pin-note">
            <span className="ex-pin-dot" aria-hidden />
            <h2 id="ex-ag-t" className="ex-pn-t">Próximos compromissos</h2>
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
              <div className="ex-pn-empty">
                <p>Nenhuma reunião marcada na plataforma {period === 'hoje' ? 'para hoje' : 'neste período'}.</p>
                {e.agenda.google.status !== 'conectado' && <p className="ex-pn-note">Google Agenda não conectada: compromissos de lá não aparecem aqui. <Link to="/integracoes">Conectar</Link></p>}
              </div>
            )}
            <Link className="ex-pn-go" to="/calendario">Abrir calendário →</Link>
          </div>
        </section>
      </div>

      {/* FINANCEIRO · CAPACIDADE · MINHAS PENDÊNCIAS — sempre visíveis; sem dado, dizem que não há dado */}
      <div className="ex-trio">
        <section className="ex-mini" aria-labelledby="ex-fin-t">
          <div className="ex-sh"><h2 id="ex-fin-t" className="ex-title sm">Financeiro</h2>{e.finance ? (e.finance.has_data ? <StateBadge s="ativo" /> : <StateBadge s="dados_insuficientes" />) : <StateBadge s="bloqueado" label="Acesso restrito" />}</div>
          {!e.finance ? <p className="ex-empty-sm">Sem permissão para o financeiro.</p> : e.finance.has_data ? (
            <dl className="ex-kv">
              <div><dt>Receita recorrente</dt><dd>{money(e.finance.recorrente)}</dd></div>
              <div><dt>Recebido no mês</dt><dd>{money(e.finance.recebido_mes)}</dd></div>
              <div><dt>Em aberto</dt><dd>{money(e.finance.pendente)}</dd></div>
              <div><dt>Em atraso</dt><dd className={e.finance.atrasado ? 'late' : ''}>{money(e.finance.atrasado)}</dd></div>
            </dl>
          ) : <p className="ex-empty-sm">Nenhum contrato ou parcela cadastrado. Repasses e rentabilidade aguardam a definição das regras financeiras.</p>}
          <div className="ex-foot"><Link className="ex-more" to="/financeiro">Abrir financeiro <I.arrow size={13} /></Link></div>
        </section>
        <section className="ex-mini" aria-labelledby="ex-cap-t">
          <div className="ex-sh"><h2 id="ex-cap-t" className="ex-title sm">Capacidade</h2>{e.capacity.open ? <StateBadge s="ativo" /> : <StateBadge s="dados_insuficientes" />}</div>
          <dl className="ex-kv">
            <div><dt>Tarefas abertas (plataforma)</dt><dd>{e.capacity.open}</dd></div>
            <div><dt>Capacidade configurada</dt><dd>{e.capacity.configured ?? '—'}</dd></div>
            <div><dt>Pessoas acima da capacidade</dt><dd className={e.capacity.acima ? 'late' : ''}>{e.capacity.acima}</dd></div>
          </dl>
          <p className="ex-note">Capacidade configurada no cadastro, não medida. Tarefas herdadas do Notion não contam{e.capacity.inherited ? ` (${e.capacity.inherited} herdadas à parte)` : ''}.</p>
          <div className="ex-foot"><Link className="ex-more" to="/performance">Equipe & performance <I.arrow size={13} /></Link></div>
        </section>
        <MyPendencies />
      </div>

      {/* ATALHOS — o detalhe mora em outros módulos */}
      <nav className="ex-links" aria-label="Aprofundar">
        <Link to="/torre"><span>Torre de Controle</span><small>Operação inteira, gargalos e investigação</small><I.arrow size={14} /></Link>
        {e.finance && <Link to="/negocio?aba=recebimentos"><span>Financeiro</span><small>{e.finance.has_data ? `${money(e.finance.recebido_mes)} recebido no mês${e.finance.atrasado ? ` · ${money(e.finance.atrasado)} em atraso` : ''}` : 'Dados insuficientes: nenhum contrato ou fatura cadastrado'}</small><I.arrow size={14} /></Link>}
        <Link to="/performance#capacidade"><span>Capacidade da equipe</span><small>{e.capacity.open ? `${pl(e.capacity.open, 'tarefa aberta', 'tarefas abertas')}${e.capacity.acima ? ` · ${pl(e.capacity.acima, 'pessoa acima', 'pessoas acima')} da capacidade` : ''}` : `Dados insuficientes: nenhuma tarefa nascida na plataforma${e.capacity.inherited ? ` · ${e.capacity.inherited} herdadas do Notion, à parte` : ''}`}</small><I.arrow size={14} /></Link>
        <Link to="/performance"><span>Equipe · Performance</span><small>Entregas, prazos, reaberturas e capacidade por pessoa</small><I.arrow size={14} /></Link>
        <Link to="/automacoes"><span>Automações</span><small>{e.automations.runs_7d ? `${pl(e.automations.runs_7d, 'execução', 'execuções')} em 7 dias${e.automations.errors_7d ? ` · ${pl(e.automations.errors_7d, 'falha', 'falhas')}` : ''}` : 'Nenhuma execução nos últimos 7 dias'}</small><I.arrow size={14} /></Link>
      </nav>

      <ExecDrawer drawer={drawer} risks={e.risks} onClose={() => setDrawer(null)} />
    </div>
  );
}

function ExecDrawer({ drawer, risks, onClose }) {
  if (!drawer) return null;
  return (
    <Drawer open onClose={onClose} restore={drawer} restoreKey="visao-geral" title={drawer.kind === 'risk' ? 'Clientes em risco' : drawer.kind === 'client' ? cleanName(drawer.group.client) : drawer.title} kicker="BoldBoard" wide={drawer.kind === 'stage'}>
      {drawer.kind === 'risk' && (!risks.length ? <Empty title="Nenhum cliente em risco." /> : (
        <ul className="ex-rec">{risks.map((r) => (
          <li key={r.id}><Link to={`/clientes/${r.id}`}><b>{cleanName(r.name)}</b><small>Risco {RISK[r.level]} · {r.reasons.slice(0, 3).join(' · ') || 'calculado pelos conteúdos do cliente'}</small><I.arrow size={13} /></Link></li>
        ))}</ul>
      ))}
      {drawer.kind === 'stage' && <StageItems stage={drawer.stage} />}
      {drawer.kind === 'client' && (
        <>
          <p className="sm muted">{pl(drawer.group.n, 'situação pede', 'situações pedem')} sua atenção · {drawer.group.summary}</p>
          <ol className="ex-dl">{drawer.group.items.map((a) => (
            <li key={a.id} className={`l-${a.level}`}>
              <span className="ex-prio"><span className={`ex-dot d-${a.level}`} aria-hidden /> {a.level === 'critico' ? 'Crítico' : 'Atenção'}{a.time && <em>{a.time}</em>}{a.origin === 'notion' && <span className="tag tag-mig">Migrado do Notion</span>}</span>
              <b>{a.problem}</b>
              {a.impact && <small><i>Impacto</i>{a.impact}</small>}
              {(a.who || a.context) && <small>{a.who && <><i>Responsável</i>{a.who}</>}{a.context && <><i>Onde</i>{a.context}</>}</small>}
              <Link className="ex-more" to={a.action.to}>{a.action.label} <I.arrow size={13} /></Link>
            </li>
          ))}</ol>
          {drawer.group.client_id && <Link className="btn btn-primary mt-5" to={`/clientes/${drawer.group.client_id}`}>Abrir a ficha do cliente</Link>}
        </>
      )}
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

// MINHAS PENDÊNCIAS — o que depende da própria CEO (a visão da equipe fica em "Precisa da sua atenção")
function MyPendencies() {
  const { data } = useApi('/pendencias?escopo=minhas');
  const items = data?.items || [];
  return (
    <section className="ex-mini" aria-labelledby="ex-my-t">
      <div className="ex-sh"><h2 id="ex-my-t" className="ex-title sm">Minhas pendências</h2>{data && <span className="ex-count">{pl(items.length, 'item', 'itens')}</span>}</div>
      {!data ? <p className="ex-empty-sm">Carregando…</p> : !items.length ? <p className="ex-empty-sm">Nada depende de você agora.</p> : (
        <ul className="ex-mylist">{items.slice(0, 4).map((p) => <li key={p.id}><Link to={`/pendencias?p=${encodeURIComponent(p.id)}`}><b>{p.problem || p.title}</b><small>{cleanName(p.client || 'The Bold')}{p.late ? ` · há ${p.late}` : ''}</small></Link></li>)}</ul>
      )}
      <div className="ex-foot"><Link className="ex-more" to="/pendencias">Abrir minhas pendências <I.arrow size={13} /></Link></div>
    </section>
  );
}
