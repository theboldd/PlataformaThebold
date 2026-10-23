// TORRE DE CONTROLE — "o que está acontecendo na operação e por quê?"
// Camadas (23/10): estado → riscos & gargalos (por cliente) → mapa da operação → clientes (gráfico) → responsabilidades (notas).
// Capacidade e desempenho foram para Equipe & Performance; inteligência fica em Insights; detalhamento e dependências saíram.
// Período e filtros vivem na URL (compartilháveis) e mudam os dados no servidor. Todo número abre o detalhe.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApi, useToast } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Loading, ErrorBox, Empty, Drawer, Button, Seg } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { money, fmtDateTime, fmtDate, cleanName, ago } from '../lib/format.js';
import { FUNCTIONS, FORMATS } from '../lib/status.js';
import { ContentRows, MeetingRows, n2 } from './intel/parts.jsx';
import '../styles/tower.css';
import '../styles/tower2.css';
import { restoredOverlay } from '../lib/nav.jsx';

const PERIODS = [{ value: 'hoje', label: 'Hoje' }, { value: '7d', label: '7 dias' }, { value: '30d', label: '30 dias' }, { value: 'custom', label: 'Personalizado' }];
const FILTERS = ['client_id', 'assignee_id', 'stage', 'format', 'priority', 'status', 'kind', 'origin'];
const PRIO = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
const RISK = { critico: 'Crítico', alto: 'Alto', medio: 'Médio', baixo: 'Baixo' };
const LEGACY = { riscos: 'riscos', clientes: 'clientes', operacao: 'operacao', producao: 'operacao' };
// saíram da Torre (23/10): capacidade e desempenho → Equipe & Performance · inteligência → Insights · detalhamento removido
const MOVED = { pessoas: '/performance#capacidade', periodo: '/performance', ia: '/insights', inteligencia: '/insights', financeiro: '/negocio?aba=recebimentos', comercial: '/negocio?aba=pipeline' };
const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

export default function Torre() {
  useCrumbs('Torre de Controle');
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    for (const k of ['period', 'from', 'to', ...FILTERS]) if (params.get(k)) p.set(k, params.get(k));
    return p.toString();
  }, [params]);
  const { data: d, error, loading } = useApi(`/torre${qs ? `?${qs}` : ''}`, [qs]);
  const [drawer, setDrawer] = useState(() => restoredOverlay('torre'));
  const set = (patch) => setParams((p) => { const n = new URLSearchParams(p); for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); } n.delete('tab'); return n; }, { replace: true });

  // Links antigos (?tab=pessoas, ?tab=prazos…) continuam funcionando
  const tab = params.get('tab');
  useEffect(() => {
    if (!d || !tab) return;
    if (MOVED[tab]) navigate(MOVED[tab], { replace: true });
    else if (LEGACY[tab]) setTimeout(() => go(LEGACY[tab]), 80);
    else if (['prazos', 'automacoes', 'reunioes'].includes(tab)) setDrawer({ kind: tab });
  }, [d, tab]);

  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  if (!d) return <div className="page"><Loading rows={10} /></div>;
  const s = d.state;
  const period = params.get('period') || '7d';
  const activeFilters = FILTERS.filter((k) => params.get(k));

  // Ponto de atenção = a seção da página que mais precisa de olhar agora (ordem: riscos → bloqueios/gargalos → prazos → clientes → responsabilidades)
  const flaggedClients = d.health.filter((c) => c.score > 0).length;
  const focus = d.risks.length ? { id: 'riscos', title: 'Riscos & gargalos', text: `${pl(d.risks.length, 'risco aberto', 'riscos abertos')} na operação.` }
    : d.blocks.length || d.bottlenecks.length ? { id: 'riscos', title: 'Riscos & gargalos', text: d.summary.focus || `${pl(d.blocks.length, 'bloqueio', 'bloqueios')} esperando alguém agir.` }
    : s.prazos.n ? { id: 'estado', title: 'Prazos', text: `${pl(s.prazos.n, 'tarefa atrasada', 'tarefas atrasadas')}.` }
    : flaggedClients ? { id: 'clientes', title: 'Clientes & saúde', text: `${pl(flaggedClients, 'cliente pede', 'clientes pedem')} atenção.` }
    : d.responsibilities.no_owner.length ? { id: 'responsabilidades', title: 'Responsabilidades', text: `${pl(d.responsibilities.no_owner.length, 'cliente sem', 'clientes sem')} pessoa em função essencial.` }
    : null;

  return (
    <div className={`page tw tw2 ${loading ? 'is-loading' : ''}`}>
      {/* HEADER + RESUMO EM UMA LINHA + POST-IT */}
      <header className="tw-head tw2-head">
        <div className="tw2-head-main">
          <div className="tw-kicker">Torre de Controle The Bold</div>
          <h1 className="tw-h1">O que está acontecendo agora.</h1>
        </div>
        {focus && (
          <button className="tw2-postit" onClick={() => go(focus.id)} data-cursor="IR">
            <span className="tw2-postit-k">Principal ponto de atenção</span>
            <span className="tw2-postit-t">{focus.title}</span>
            <span className="tw2-postit-x">{focus.text}</span>
            <span className="tw2-postit-go">Ver seção →</span>
          </button>
        )}
      </header>

      <SummaryLine lines={d.summary.lines} />

      {/* PERÍODO E FILTROS — uma linha, controles delicados */}
      <div className="tw-controls tw2-controls" role="region" aria-label="Período e filtros">
        <Seg options={PERIODS} value={period} onChange={(v) => set({ period: v === '7d' ? '' : v, ...(v !== 'custom' ? { from: '', to: '' } : {}) })} label="Período" />
        {period === 'custom' && (
          <span className="tw-dates">
            <input type="date" className="input" aria-label="De" value={params.get('from') || ''} onChange={(e) => set({ period: 'custom', from: e.target.value })} />
            <span aria-hidden>→</span>
            <input type="date" className="input" aria-label="Até" value={params.get('to') || ''} onChange={(e) => set({ period: 'custom', to: e.target.value })} />
          </span>
        )}
        <div className="tw-filters">
          <Select label="Cliente" value={params.get('client_id')} onChange={(v) => set({ client_id: v })} options={d.filters.clients.map((c) => [c.id, cleanName(c.name)])} />
          <Select label="Responsável" value={params.get('assignee_id')} onChange={(v) => set({ assignee_id: v })} options={d.filters.people.map((p) => [p.id, p.name])} />
          {d.filters.stages.length > 0 && <Select label="Etapa" value={params.get('stage')} onChange={(v) => set({ stage: v })} options={d.filters.stages.map((x) => [x.key, x.label])} />}
          {d.filters.formats.length > 0 && <Select label="Formato" value={params.get('format')} onChange={(v) => set({ format: v })} options={d.filters.formats.map((f) => [f, FORMATS[f] || f])} />}
          {d.filters.priorities.length > 1 && <Select label="Prioridade" value={params.get('priority')} onChange={(v) => set({ priority: v })} options={d.filters.priorities.map((p) => [p, PRIO[p] || p])} />}
          {d.filters.statuses.length > 0 && <Select label="Status" value={params.get('status')} onChange={(v) => set({ status: v })} options={d.filters.statuses.map((x) => [x.key, x.label])} />}
          {d.filters.kinds.length > 0 && <Select label="Tarefa" value={params.get('kind')} onChange={(v) => set({ kind: v })} options={d.filters.kinds.map((x) => [x.key, x.label])} />}
          <Select label="Origem" value={params.get('origin')} onChange={(v) => set({ origin: v })} options={d.filters.origins.map((x) => [x.key, x.label])} />
          {activeFilters.length > 0 && <button className="tw-clear" onClick={() => set(Object.fromEntries(FILTERS.map((k) => [k, ''])))}>Limpar</button>}
        </div>
      </div>

      {/* ESTADO DA OPERAÇÃO — cartões com cor */}
      <section id="estado" className="tw-sec">
        <h2 className="tw-h2">Estado da operação</h2>
        <div className="tw2-state">
          <State tone="azul" n={s.operacao.n} label="Itens em operação" onClick={() => go('operacao')} lines={[`${s.operacao.producao} em produção · ${s.operacao.revisao} em revisão`, `${s.operacao.clientes} com clientes`]} />
          <State tone="verde" n={s.clientes.n} label="Clientes na base" onClick={() => go('clientes')} lines={[`${s.clientes.ativos} ativos · ${s.clientes.a_confirmar} a confirmar`, `${s.clientes.com_operacao} com conteúdo no processo`]} />
          <State tone="lavanda" n={s.producao.n} label="Em produção" onClick={() => setDrawer({ kind: 'stage', stage: 'producao,analise_producao,ajuste_interno,ajuste_cliente,revisao_ajuste', label: 'Em produção' })} lines={[`${s.producao.bloqueados} bloqueados`]} />
          <State tone={s.prazos.n ? 'rosa' : 'neutro'} n={s.prazos.n} label="Tarefas atrasadas" alert={s.prazos.n > 0} onClick={() => setDrawer({ kind: 'prazos' })} lines={[`${s.prazos.hoje} vencem hoje · ${s.prazos.sem_responsavel} sem responsável`].concat(s.prazos.herdados ? [`+ ${s.prazos.herdados} herdadas (fora da conta)`] : [])} />
          <State tone={s.riscos.n ? 'pessego' : 'neutro'} n={s.riscos.n} label="Riscos" alert={s.riscos.n > 0} onClick={() => go('riscos')} lines={[pl(s.riscos.clientes, 'cliente envolvido', 'clientes envolvidos'), s.riscos.criticas != null ? pl(s.riscos.criticas, 'pendência crítica', 'pendências críticas') : 'pendências: acesso restrito']} />
          <State tone="manteiga" n={s.pessoas.n} label="Pessoas" to="/performance#capacidade" lines={[`${s.pessoas.abertas} tarefas abertas`, `${s.pessoas.sobrecarga} em sobrecarga · ${s.pessoas.sem_carga} sem carga`]} />
        </div>
      </section>

      {/* RISCOS & GARGALOS — por cliente; o cartão abre o detalhe aqui; “ir para” leva à origem */}
      <section id="riscos" className="tw-sec">
        <h2 className="tw-h2">Riscos &amp; gargalos</h2>
        <ClientRisks risks={d.risks} blocks={d.blocks} open={(g) => setDrawer({ kind: 'client', group: g, label: cleanName(g.client) })} />
        <h3 className="tw-h3 mt-6">Gargalos por etapa <span>{n2(d.bottlenecks.length)}</span></h3>
        {!d.bottlenecks.length ? <p className="tw-empty">Nenhuma etapa acumulando além do prazo.</p> : (
          <div className="tw2-gargalos">{d.bottlenecks.map((b) => (
            <button key={b.stage} className="tw2-garg" onClick={() => setDrawer({ kind: 'stage', stage: b.stage, label: b.label })}>
              <span className="tw2-garg-n">{b.n}</span>
              <span className="tw2-garg-t"><b>{b.label}</b>{b.late ? `${pl(b.late, 'atrasado', 'atrasados')} · ` : ''}{b.avg_days != null ? `${String(b.avg_days).replace('.', ',')} dias em média` : 'itens parados'}{b.sla_days ? ` (prazo ${b.sla_days})` : ''}</span>
              <span className="tw2-garg-go">Ver itens →</span>
            </button>
          ))}</div>
        )}
      </section>

      {/* MAPA DA OPERAÇÃO — leitura rápida */}
      <section id="operacao" className="tw-sec">
        <div className="tw-sec-head"><h2 className="tw-h2">Mapa da operação</h2><Link className="tw-more" to="/processos">Abrir processos <I.arrow size={13} /></Link></div>
        <OpMap lanes={d.lanes} stages={d.stages} open={(x) => setDrawer({ kind: 'stage', stage: x.stage, label: x.label })} />
        <Accumulation stages={d.stages} open={(x) => setDrawer({ kind: 'stage', stage: x.stage, label: x.label })} />
      </section>

      {/* CLIENTES + RESPONSABILIDADES */}
      <div className="tw-two">
        <section id="clientes" className="tw-sec">
          <h2 className="tw-h2">Clientes &amp; saúde da operação</h2>
          <HealthDonut rows={d.health} />
        </section>
        <section id="responsabilidades" className="tw-sec">
          <h2 className="tw-h2">Responsabilidades</h2>
          <Notes r={d.responsibilities} />
        </section>
      </div>

      <TowerDrawer drawer={drawer} d={d} params={params} onClose={() => { setDrawer(null); if (tab) set({}); }} />
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <select className="tw-select" value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{label}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

function State({ n, label, lines, alert, onClick, to, tone = 'neutro' }) {
  const body = (
    <>
      <span className="tw2-st-top"><span className="tw2-st-l">{label}</span><span className="tw2-st-go" aria-hidden>→</span></span>
      <span className={`tw2-st-n ${alert ? 'alert' : ''}`}>{n}</span>
      {lines.map((l, i) => <span key={i} className="tw2-st-line">{l}</span>)}
    </>
  );
  return to ? <Link className={`tw2-st t-${tone}`} to={to} data-cursor="ABRIR">{body}</Link> : <button className={`tw2-st t-${tone}`} onClick={onClick} data-cursor="EXPLORAR">{body}</button>;
}

// Resumo em uma linha: número em destaque + texto; o que é herdado fica menor
function SummaryLine({ lines }) {
  return (
    <p className="tw2-sum">{lines.map((l, i) => {
      const m = l.match(/^(\d[\d.]*)\s(.*)$/);
      const [main, extra] = (m ? m[2] : l).split(/\s(?=\()/);
      return <span key={i} className="tw2-sum-i">{m && <b>{m[1]}</b>}{main}{extra && <small>{extra}</small>}</span>;
    })}</p>
  );
}

// Riscos e bloqueios agrupados por cliente. O cartão abre o detalhe na própria Torre; o nome do cliente leva direto à ficha.
const LEVEL_ORDER = { critico: 0, alto: 1, medio: 2, baixo: 3 };
// motivo do bloqueio em poucas palavras (o texto completo fica no detalhe)
const shortReason = (r) => { const t = String(r || 'Bloqueio').split(' (')[0].replace(/^Pendente por /i, ''); return t.length > 26 ? `${t.slice(0, 25)}…` : t; };
function ClientRisks({ risks, blocks, open }) {
  const by = new Map();
  const get = (id, name) => { if (!by.has(id)) by.set(id, { client_id: id, client: name, risks: [], blocks: [] }); return by.get(id); };
  for (const r of risks) get(r.client_id || 'sem', r.client || 'Sem cliente').risks.push(r);
  for (const b of blocks) get(b.client_id || 'sem', b.client || 'Sem cliente').blocks.push(b);
  const groups = [...by.values()].sort((a, b) => (Math.min(...a.risks.map((r) => LEVEL_ORDER[r.level] ?? 9), 9) - Math.min(...b.risks.map((r) => LEVEL_ORDER[r.level] ?? 9), 9)) || (b.risks.length + b.blocks.length) - (a.risks.length + a.blocks.length));
  if (!groups.length) return <p className="tw-empty">Nenhum risco ou bloqueio aberto na operação.</p>;
  return (
    <div className="tw2-clients">{groups.map((g) => {
      const worst = g.risks.map((r) => r.level).sort((a, b) => (LEVEL_ORDER[a] ?? 9) - (LEVEL_ORDER[b] ?? 9))[0];
      const tone = worst === 'critico' ? 'rosa' : worst === 'alto' ? 'pessego' : g.risks.length ? 'manteiga' : 'azul';
      const items = [...g.risks.map((r) => ({ k: `r${r.id}`, tag: `Risco ${RISK[r.level] || r.level}`, text: r.problem })), ...g.blocks.map((b) => ({ k: `b${b.id}`, tag: shortReason(b.reason), text: `${b.title} · espera ${String(b.by).toLowerCase()}` }))];
      return (
        <div key={g.client_id} className={`tw2-cc t-${tone}`} role="button" tabIndex={0} onClick={() => open(g)} onKeyDown={(e) => e.key === 'Enter' && open(g)} data-cursor="ABRIR">
          <div className="tw2-cc-h">
            {g.client_id !== 'sem' ? <Link to={`/clientes/${g.client_id}`} className="tw2-cc-name" onClick={(e) => e.stopPropagation()} title="Ir para a ficha do cliente">{cleanName(g.client)} ↗</Link> : <span className="tw2-cc-name">{g.client}</span>}
            <span className="tw2-cc-n">{g.risks.length ? `${g.risks.length} risco${g.risks.length > 1 ? 's' : ''}` : ''}{g.risks.length && g.blocks.length ? ' · ' : ''}{g.blocks.length ? `${g.blocks.length} bloqueio${g.blocks.length > 1 ? 's' : ''}` : ''}</span>
          </div>
          <ul className="tw2-cc-list">{items.slice(0, 3).map((x) => <li key={x.k}><em>{x.tag}</em>{x.text}</li>)}</ul>
          <span className="tw2-cc-more">{items.length > 3 ? `+${items.length - 3} · ` : ''}Ver detalhes</span>
        </div>
      );
    })}</div>
  );
}

// Mapa da operação: barra proporcional das 4 fases + etapas como chips (só número e nome; clique abre os itens)
const PHASE_TONE = { planejamento: 'azul', producao: 'lavanda', cliente: 'pessego', publicacao: 'verde' };
function OpMap({ lanes, stages, open }) {
  const total = lanes.reduce((a, l) => a + l.n, 0);
  const st = (k) => stages.find((x) => x.stage === k);
  return (
    <div className="tw2-map">
      <div className="tw2-map-bar" aria-hidden>{lanes.map((l) => <span key={l.key} className={`t-${PHASE_TONE[l.key] || 'neutro'}`} style={{ flexGrow: Math.max(l.n, total * 0.04 || 1) }} />)}</div>
      <div className="tw2-map-cols">{lanes.map((l, i) => {
        const list = l.stages.map(st).filter(Boolean);
        const late = list.reduce((a, x) => a + (x.late || 0), 0), blocked = list.reduce((a, x) => a + (x.blocked || 0), 0);
        return (
          <div key={l.key} className={`tw2-phase t-${PHASE_TONE[l.key] || 'neutro'}`}>
            <div className="tw2-phase-h"><span className="tw2-phase-i">{String(i + 1).padStart(2, '0')}</span><span className="tw2-phase-l">{l.label}</span></div>
            <div className="tw2-phase-n">{l.n}<small>{total ? `${Math.round((l.n / total) * 100)}%` : '—'}</small></div>
            {(late || blocked) ? <div className="tw2-phase-flags">{late ? <span className="late">{late} atrasado{late > 1 ? 's' : ''}</span> : null}{blocked ? <span className="blk">{blocked} bloqueado{blocked > 1 ? 's' : ''}</span> : null}</div> : <div className="tw2-phase-flags"><span className="ok">sem atraso</span></div>}
            <div className="tw2-chips">{list.map((x) => (
              <button key={x.stage} className={`tw2-chip ${x.n ? '' : 'zero'} ${x.late ? 'late' : ''}`} disabled={!x.n} onClick={() => open(x)} title={x.avg_days != null && x.n ? `${String(x.avg_days).replace('.', ',')} dias em média na etapa` : undefined}><b>{x.n}</b>{x.label}</button>
            ))}</div>
          </div>
        );
      })}</div>
    </div>
  );
}

// Clientes & saúde: gráfico redondo por situação + clientes como pílulas coloridas; clique numa fatia filtra
const HEALTH = [
  ['risco', 'Em risco', 'var(--err)'], ['atencao', 'Pedem atenção', 'var(--warn)'], ['acompanhar', 'Acompanhar', '#C9B458'],
  ['em_dia', 'Em dia', 'var(--ok)'], ['sem_op', 'Sem conteúdo no processo', 'var(--faint)'],
];
const healthOf = (c) => (['alto', 'critico'].includes(c.risk) ? 'risco' : c.pendencias || c.atrasos || c.bloqueados ? 'atencao' : c.aguardando || c.sem_funcao.length || c.decisoes ? 'acompanhar' : c.ativos ? 'em_dia' : 'sem_op');
function HealthDonut({ rows }) {
  const [sel, setSel] = useState('');
  if (!rows.length) return <p className="tw-empty">Nenhum cliente no filtro atual.</p>;
  const groups = HEALTH.map(([k, l, c]) => ({ k, l, c, list: rows.filter((r) => healthOf(r) === k) })).filter((g) => g.list.length);
  const R = 52, C = 2 * Math.PI * R;
  let acc = 0;
  const shown = sel ? groups.filter((g) => g.k === sel) : groups;
  return (
    <div className="tw2-health">
      <div className="tw2-donut-wrap">
        <svg viewBox="0 0 140 140" className="tw2-donut" role="img" aria-label={groups.map((g) => `${g.l}: ${g.list.length}`).join(', ')}>
          <circle cx="70" cy="70" r={R} fill="none" stroke="var(--line)" strokeWidth="16" />
          {groups.map((g) => { const len = (g.list.length / rows.length) * C; const el = (
            <circle key={g.k} cx="70" cy="70" r={R} fill="none" stroke={g.c} strokeWidth={sel === g.k ? 20 : 16} strokeDasharray={`${Math.max(len - 2, 1)} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)" style={{ cursor: 'pointer', opacity: sel && sel !== g.k ? 0.35 : 1 }} onClick={() => setSel(sel === g.k ? '' : g.k)} />
          ); acc += len; return el; })}
          <text x="70" y="66" textAnchor="middle" className="tw2-donut-n">{rows.length}</text>
          <text x="70" y="86" textAnchor="middle" className="tw2-donut-l">clientes</text>
        </svg>
        <ul className="tw2-legend">{groups.map((g) => (
          <li key={g.k}><button className={sel === g.k ? 'on' : ''} onClick={() => setSel(sel === g.k ? '' : g.k)}><i style={{ background: g.c }} /><span>{g.l}</span><b>{g.list.length}</b></button></li>
        ))}</ul>
      </div>
      {shown.map((g) => (
        <div key={g.k} className="tw2-pills-g">
          <span className="tw2-pills-l"><i style={{ background: g.c }} />{g.l}</span>
          <div className="tw2-pills">{g.list.map((c) => <Link key={c.id} to={`/clientes/${c.id}`} className="tw2-pill" style={{ '--c': g.c }} title={c.next ? `Próxima ação: ${c.next}` : undefined}>{cleanName(c.name)}</Link>)}</div>
        </div>
      ))}
    </div>
  );
}

// Responsabilidades no visual do app Notas: título, uma linha objetiva, ação
function Notes({ r }) {
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? r.no_owner : r.no_owner.slice(0, 6);
  if (!r.no_owner.length && !r.unassigned.length && !r.team_conflicts) return <div className="tw2-notes"><div className="tw2-notes-h"><span>Notas</span><b>0</b></div><p className="tw2-note-empty">Todas as funções essenciais têm responsável e nenhuma tarefa está sem dono.</p></div>;
  return (
    <div className="tw2-notes">
      <div className="tw2-notes-h"><span>Sem responsável</span><b>{r.no_owner.length + r.unassigned.length}</b></div>
      <ul>
        {list.map((x) => (
          <li key={x.client_id}><Link to={`/clientes/${x.client_id}?tab=equipe`}><b>{cleanName(x.client)}</b><span>Falta: {x.functions.join(' · ')}</span><em>Vincular</em></Link></li>
        ))}
        {r.unassigned.slice(0, 4).map((t) => (
          <li key={t.id}><Link to={t.content_id ? `/conteudos/${t.content_id}` : `/clientes/${t.client_id}?tab=equipe`}><b>{t.title}</b><span>{cleanName(t.client || '')} · tarefa de {(FUNCTIONS[t.function] || t.function || '').toLowerCase()}</span><em>Atribuir</em></Link></li>
        ))}
      </ul>
      {r.no_owner.length > 6 && <button className="tw2-notes-more" onClick={() => setShowAll(!showAll)}>{showAll ? 'Mostrar menos' : `Ver todos · ${r.no_owner.length}`}</button>}
      {r.team_conflicts > 0 && <Link className="tw2-notes-foot" to="/migracao?kind=equipe">{pl(r.team_conflicts, 'vínculo de equipe aguarda', 'vínculos de equipe aguardam')} decisão →</Link>}
    </div>
  );
}

// Detalhe de um cliente na própria Torre, com o atalho para onde cada item está
function ClientItems({ g }) {
  return (
    <div className="tw2-drawer">
      <Link className="btn btn-sm" to={`/clientes/${g.client_id}`}>Abrir ficha do cliente</Link>
      {g.risks.map((r) => (
        <div key={r.id} className="tw2-di">
          <span className={`tw-sev s-${r.level}`}><i aria-hidden /> Risco {RISK[r.level] || r.level}</span>
          <b>{r.problem}</b>
          {r.impact && <span><em>Impacto</em> {r.impact}</span>}
          {(r.who || r.late || r.due) && <span>{r.who && <><em>Responsável</em> {r.who}</>}{r.late ? <> · <em>Atraso</em> {r.late}</> : r.due ? <> · <em>Prazo</em> {fmtDate(r.due)}</> : null}</span>}
          <Link className="tw-more" to={r.link}>Ir para onde está <I.arrow size={13} /></Link>
        </div>
      ))}
      {g.blocks.map((b) => (
        <div key={b.id} className="tw2-di">
          <span className="tw-sev s-medio"><i aria-hidden /> Bloqueio</span>
          <b>{b.reason || 'Bloqueado'}</b>
          <span><em>Conteúdo</em> {b.title} · {b.stage}</span>
          <span><em>Espera</em> {b.by}{b.since ? ` · desde ${fmtDate(b.since)}` : ''}</span>
          <Link className="tw-more" to={b.link}>Ir para o conteúdo <I.arrow size={13} /></Link>
        </div>
      ))}
    </div>
  );
}

function Accumulation({ stages, open }) {
  const rows = stages.filter((s) => s.n && !['agendamento', 'agendado', 'publicado'].includes(s.stage)).sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="tw-acc">
      <h3 className="tw-h3">Onde o trabalho está acumulando?</h3>
      {!rows.length ? <p className="tw-empty">Nenhum conteúdo em andamento no processo. O mapa se preenche quando o primeiro ciclo de cada cliente começar em Processos.</p> : rows.map((r) => (
        <button key={r.stage} className="tw-bar" onClick={() => open(r)} aria-label={`${r.label}: ${r.n}`}>
          <span>{r.label}</span><span className="tw-bar-t"><i style={{ width: `${(r.n / max) * 100}%` }} /></span><b>{r.n}</b>
        </button>
      ))}
    </div>
  );
}

function TowerDrawer({ drawer, d, params, onClose }) {
  if (!drawer) return null;
  const titles = { client: drawer.label, stage: drawer.label, person: drawer.label, prazos: 'Prazos', automacoes: 'Execuções de automação', reports: 'Relatórios', reunioes: 'Reuniões · próximos 7 dias' };
  return (
    <Drawer open onClose={onClose} restore={drawer} restoreKey="torre" title={titles[drawer.kind]} kicker="Torre de Controle" wide>
      {drawer.kind === 'client' && <ClientItems g={drawer.group} />}
      {drawer.kind === 'stage' && <StageItems stage={drawer.stage} params={params} />}
      {drawer.kind === 'person' && <PersonTasks id={drawer.id} />}
      {drawer.kind === 'prazos' && (d.deadlines.length ? d.deadlines.map((t) => (
        <Link key={t.id} to={t.content_id ? `/conteudos/${t.content_id}` : t.client_id ? `/clientes/${t.client_id}` : '/processos'} className="erow link" style={{ gridTemplateColumns: '84px minmax(0,1fr)' }}>
          <div className="ed" style={{ fontSize: 22, color: t.overdue ? 'var(--err)' : undefined }}>{fmtDate(t.due_at)}</div>
          <div><div className="t">{t.title}</div><div className="s">{cleanName(t.client || '')}{t.assignee ? ` · ${t.assignee}` : ' · sem responsável'} · {t.overdue ? 'vencido' : ago(t.due_at)}{t.inherited ? ' · herdada da migração' : ''}</div></div>
        </Link>
      )) : <Empty title="Nenhuma tarefa aberta com prazo." />)}
      {drawer.kind === 'automacoes' && <Runs params={params} />}
      {drawer.kind === 'reports' && <Reports finance={!!d.finance} />}
      {drawer.kind === 'reunioes' && <><MeetingRows items={d.meetings} /><Link className="btn btn-primary mt-5" to="/reunioes">Abrir Reuniões</Link></>}
    </Drawer>
  );
}

function StageItems({ stage, params }) {
  const p = new URLSearchParams({ stage, include_published: '1' });
  for (const k of ['client_id', 'assignee_id', 'priority']) if (params.get(k)) p.set(k, params.get(k));
  const key = p.toString();
  const { data, loading } = useApi(`/process/board?${key}`, [key], { live: false });
  if (loading || !data) return <Loading rows={5} />;
  const items = data.lanes.flatMap((l) => l.cards);
  return <><ContentRows items={items} empty="Nenhum conteúdo nesta etapa." /><Link className="btn btn-primary mt-5" to={`/processos?stage=${stage}`}>Abrir no quadro de processos</Link></>;
}

function PersonTasks({ id }) {
  const { data, loading } = useApi(`/torre/people/${id}/tasks`, [id], { live: false });
  if (loading || !data) return <Loading rows={5} />;
  if (!data.length) return <Empty title="Nenhuma tarefa aberta." />;
  const nowIso = new Date().toISOString();
  return (
    <>
      {data.map((t) => (
        <Link key={t.id} to={t.content_id ? `/conteudos/${t.content_id}` : t.client_id ? `/clientes/${t.client_id}` : '/processos'} className="erow link" style={{ gridTemplateColumns: '84px minmax(0,1fr)' }}>
          <div className="ed" style={{ fontSize: 22, color: t.due_at && t.due_at < nowIso ? 'var(--err)' : undefined }}>{t.due_at ? fmtDate(t.due_at) : '—'}</div>
          <div><div className="t">{t.title}</div><div className="s">{cleanName(t.client || '')} · {FUNCTIONS[t.function] || t.function || '—'} · {t.status === 'em_andamento' ? 'em andamento' : 'aberta'}</div></div>
        </Link>
      ))}
      <Link className="btn btn-primary mt-5" to={`/processos?assignee_id=${id}`}>Ver no quadro de processos</Link>
    </>
  );
}

function Runs({ params }) {
  const [status, setStatus] = useState('');
  const p = new URLSearchParams();
  for (const k of ['period', 'from', 'to']) if (params.get(k)) p.set(k, params.get(k));
  if (status) p.set('status', status);
  const key = p.toString();
  const { data, loading } = useApi(`/torre/automations?${key}`, [key], { live: false });
  return (
    <>
      <Seg options={[{ value: '', label: 'Todas' }, { value: 'ok', label: 'Executadas' }, { value: 'ignorada', label: 'Ignoradas' }, { value: 'erro', label: 'Falhas' }]} value={status} onChange={setStatus} label="Resultado" />
      <div className="mt-4">
        {loading || !data ? <Loading rows={5} /> : !data.length ? <Empty title="Nenhuma execução no período.">Cada execução real de automação fica registrada; quando a operação rodar, elas aparecem aqui.</Empty> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Quando</th><th>Automação</th><th>Sobre</th><th>Resultado</th></tr></thead>
            <tbody>{data.map((r) => (
              <tr key={r.id}><td className="muted">{fmtDateTime(r.created_at)}</td><td><b>{r.label}</b>{r.action && <div className="xs muted">{r.action}</div>}</td>
                <td>{r.client ? cleanName(r.client) : '—'}{r.detail && <div className="xs muted">{r.detail}</div>}</td>
                <td style={r.status === 'erro' ? { color: 'var(--err)' } : null}>{r.status}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      <Link className="btn btn-primary mt-5" to="/automacoes">Ver catálogo de automações</Link>
    </>
  );
}

const KINDS = [{ value: 'operacao', label: 'Operação' }, { value: 'producao', label: 'Produção' }, { value: 'financeiro', label: 'Financeiro' }];
function Reports({ finance }) {
  const toast = useToast();
  const { data, reload } = useApi('/reports', [], { live: false });
  const [kind, setKind] = useState('operacao');
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(null);
  useEffect(() => { if (data?.length && !sel) setSel(data[0]); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const gen = async () => {
    setBusy(true);
    try { const r = await api.post('/reports', { kind, days }); toast('Relatório gerado.'); await reload(); setSel(r); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="row wrap gap-2"><Seg options={KINDS.filter((k) => finance || k.value !== 'financeiro')} value={kind} onChange={setKind} label="Tipo" /><Seg options={[{ value: 7, label: '7 dias' }, { value: 30, label: '30 dias' }]} value={days} onChange={setDays} label="Período" /><Button variant="primary" size="sm" onClick={gen} disabled={busy}>{busy ? 'Gerando…' : 'Gerar novo'}</Button></div>
      <p className="xs muted mt-2">Também gerado automaticamente toda segunda às 8h.</p>
      {data?.length > 0 && (
        <div className="mt-4"><Seg options={data.slice(0, 6).map((r) => ({ value: r.id, label: `${r.kind} · ${fmtDate(r.created_at)}` }))} value={sel?.id} onChange={(id) => setSel(data.find((r) => r.id === id))} label="Relatórios" /></div>
      )}
      {!data?.length && <Empty title="Nenhum relatório ainda." />}
      {sel && <ReportView r={sel} />}
    </>
  );
}
function ReportView({ r }) {
  const p = r.data.producao || {};
  const rows = [['Conteúdos criados', p.conteudos_criados], ['Aprovados pelo cliente', p.aprovados_cliente], ['Ajustes internos', p.ajustes_internos], ['Ajustes do cliente', p.ajustes_cliente], ['Publicados', p.publicados], ['Tarefas concluídas', p.tarefas_concluidas], ['…com atraso', p.tarefas_concluidas_com_atraso]];
  return (
    <div className="mt-5">
      <div className="caps">Período {fmtDateTime(r.period_start)} → {fmtDateTime(r.period_end)} · gerado {fmtDateTime(r.created_at)} por {r.generated_by}</div>
      <div className="grid-3 mt-4">{rows.map(([l, v]) => <div className="stat" key={l}><span className="value num" style={{ fontSize: 40 }}>{n2(v)}</span><span className="label">{l}</span></div>)}
        <div className="stat"><span className={`value num ${r.data.pendencias_criticas ? 'alert' : ''}`} style={{ fontSize: 40 }}>{n2(r.data.pendencias_criticas)}</span><span className="label">Pendências críticas</span></div>
      </div>
      {r.data.financeiro && <div className="grid-2 mt-4"><div className="stat"><span className="value num" style={{ fontSize: 32 }}>{money(r.data.financeiro.recebido)}</span><span className="label">Recebido</span></div><div className="stat"><span className="value num alert" style={{ fontSize: 32 }}>{money(r.data.financeiro.atrasado)}</span><span className="label">Em atraso</span></div></div>}
      {r.data.equipe?.length > 0 && (
        <div className="table-wrap mt-5"><table className="table"><thead><tr><th>Pessoa</th><th>Abertas</th><th>Atrasadas</th><th>Concluídas 7d</th></tr></thead>
          <tbody>{r.data.equipe.map((e) => <tr key={e.name}><td>{e.name}</td><td>{e.abertas}</td><td style={e.atrasadas ? { color: 'var(--err)' } : null}>{e.atrasadas}</td><td>{e.concluidas_7d}</td></tr>)}</tbody></table></div>
      )}
      {r.data.insights?.length > 0 && <><div className="caps mt-5 mb-2">Insights do período</div><ul className="list">{r.data.insights.map((x, i) => <li key={i} className="sm" style={{ display: 'block' }}><b>{x.problem}</b><div className="muted">→ {x.suggestion}</div></li>)}</ul></>}
      {r.narrative ? <p className="mt-4">{r.narrative}</p> : <p className="xs faint mt-4">Narrativa por IA: disponível quando o Claude estiver configurado.</p>}
    </div>
  );
}
