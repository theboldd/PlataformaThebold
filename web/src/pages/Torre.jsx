// TORRE DE CONTROLE — "o que está acontecendo na operação e por quê?"
// Camadas: estado → riscos & gargalos → mapa do processo → clientes → responsabilidades → pessoas → inteligência → período → detalhamento.
// Período e filtros vivem na URL (compartilháveis) e mudam os dados no servidor. Todo número abre o detalhe.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi, useToast } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Loading, ErrorBox, Empty, Drawer, Button, Seg } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { money, fmtDateTime, fmtDate, cleanName, ago } from '../lib/format.js';
import { FUNCTIONS, FORMATS } from '../lib/status.js';
import { ContentRows, MeetingRows, n2 } from './intel/parts.jsx';
import '../styles/tower.css';
import { restoredOverlay } from '../lib/nav.jsx';

const PERIODS = [{ value: 'hoje', label: 'Hoje' }, { value: '7d', label: '7 dias' }, { value: '30d', label: '30 dias' }, { value: 'custom', label: 'Personalizado' }];
const FILTERS = ['client_id', 'assignee_id', 'stage', 'format', 'priority', 'status', 'kind', 'origin'];
const PRIO = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
const SITUATION = { sobrecarga: 'Sobrecarga', alta: 'Alta', normal: 'Normal', sem_carga: 'Sem carga', so_herdada: 'Dados insuficientes' };
const RISK = { critico: 'Crítico', alto: 'Alto', medio: 'Médio', baixo: 'Baixo' };
const STATUS = { ativo: 'Ativo', onboarding: 'Onboarding', a_confirmar: 'A confirmar' };
const LEGACY = { pessoas: 'pessoas', riscos: 'riscos', clientes: 'clientes', operacao: 'operacao', producao: 'operacao', ia: 'inteligencia' };
const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

export default function Torre() {
  useCrumbs('Torre de Controle');
  const [params, setParams] = useSearchParams();
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
    if (LEGACY[tab]) setTimeout(() => go(LEGACY[tab]), 80);
    else if (['prazos', 'automacoes', 'reunioes'].includes(tab)) setDrawer({ kind: tab });
    else if (tab === 'financeiro' || tab === 'comercial') setTimeout(() => go('detalhe'), 80);
  }, [d, tab]);

  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  if (!d) return <div className="page"><Loading rows={10} /></div>;
  const s = d.state;
  const period = params.get('period') || '7d';
  const activeFilters = FILTERS.filter((k) => params.get(k));

  return (
    <div className={`page tw ${loading ? 'is-loading' : ''}`}>
      {/* HEADER + RESUMO */}
      <header className="tw-head">
        <div className="tw-kicker">Torre de Controle The Bold</div>
        <h1 className="tw-h1">O que está acontecendo agora.</h1>
        <p className="tw-sum">{d.summary.lines.map((l, i) => <span key={i}>{l}.</span>)}</p>
        {d.summary.focus && <p className="tw-focus"><span className="tw-label">Principal ponto de atenção</span>{d.summary.focus}</p>}
      </header>

      {/* PERÍODO E FILTROS */}
      <div className="tw-controls" role="region" aria-label="Período e filtros">
        <Seg options={PERIODS} value={period} onChange={(v) => set({ period: v === '7d' ? '' : v, ...(v !== 'custom' ? { from: '', to: '' } : {}) })} label="Período" />
        {period === 'custom' && (
          <span className="tw-dates">
            <input type="date" className="input" aria-label="De" value={params.get('from') || ''} onChange={(e) => set({ period: 'custom', from: e.target.value })} />
            <span aria-hidden>→</span>
            <input type="date" className="input" aria-label="Até" value={params.get('to') || ''} onChange={(e) => set({ period: 'custom', to: e.target.value })} />
          </span>
        )}
        <span className="tw-period-l">{d.period.label}</span>
        <div className="tw-filters">
          <Select label="Cliente" value={params.get('client_id')} onChange={(v) => set({ client_id: v })} options={d.filters.clients.map((c) => [c.id, cleanName(c.name)])} />
          <Select label="Responsável" value={params.get('assignee_id')} onChange={(v) => set({ assignee_id: v })} options={d.filters.people.map((p) => [p.id, p.name])} />
          {d.filters.stages.length > 0 && <Select label="Etapa" value={params.get('stage')} onChange={(v) => set({ stage: v })} options={d.filters.stages.map((x) => [x.key, x.label])} />}
          {d.filters.formats.length > 0 && <Select label="Formato" value={params.get('format')} onChange={(v) => set({ format: v })} options={d.filters.formats.map((f) => [f, FORMATS[f] || f])} />}
          {d.filters.priorities.length > 1 && <Select label="Prioridade" value={params.get('priority')} onChange={(v) => set({ priority: v })} options={d.filters.priorities.map((p) => [p, PRIO[p] || p])} />}
          {d.filters.statuses.length > 0 && <Select label="Status" value={params.get('status')} onChange={(v) => set({ status: v })} options={d.filters.statuses.map((x) => [x.key, x.label])} />}
          {d.filters.kinds.length > 0 && <Select label="Tipo de tarefa" value={params.get('kind')} onChange={(v) => set({ kind: v })} options={d.filters.kinds.map((x) => [x.key, x.label])} />}
          <Select label="Origem" value={params.get('origin')} onChange={(v) => set({ origin: v })} options={d.filters.origins.map((x) => [x.key, x.label])} />
          {activeFilters.length > 0 && <button className="tw-clear" onClick={() => set(Object.fromEntries(FILTERS.map((k) => [k, ''])))}>Limpar filtros</button>}
        </div>
      </div>

      {/* ESTADO DA OPERAÇÃO */}
      <section id="estado" className="tw-sec">
        <h2 className="tw-h2">Estado da operação</h2>
        <div className="tw-state">
          <State n={s.operacao.n} label="Itens em operação" onClick={() => go('operacao')} lines={[`${s.operacao.producao} em produção`, `${s.operacao.revisao} em revisão`, `${s.operacao.clientes} com clientes`]} />
          <State n={s.clientes.n} label="Clientes na base" onClick={() => go('clientes')} lines={[`${s.clientes.ativos} ativos · ${s.clientes.a_confirmar} a confirmar`, `${s.clientes.com_operacao} com conteúdo no processo`]} />
          <State n={s.producao.n} label="Em produção" onClick={() => setDrawer({ kind: 'stage', stage: 'producao,analise_producao,ajuste_interno,ajuste_cliente,revisao_ajuste', label: 'Em produção' })} lines={[`${s.producao.bloqueados} bloqueados · ${s.producao.agendados} agendados`, `${s.producao.publicados} publicados no período`]} />
          <State n={s.prazos.n} label="Tarefas atrasadas" alert={s.prazos.n > 0} onClick={() => setDrawer({ kind: 'prazos' })} lines={[`${s.prazos.hoje} vencem hoje${s.prazos.hoje_herdados ? ` (+ ${s.prazos.hoje_herdados} herdadas)` : ''}`, `${s.prazos.sem_responsavel} sem responsável`].concat(s.prazos.herdados ? [`+ ${s.prazos.herdados} herdadas da migração (fora da conta de desempenho)`] : [])} />
          <State n={s.riscos.n} label="Riscos" alert={s.riscos.n > 0} onClick={() => go('riscos')} lines={[`${pl(s.riscos.clientes, 'cliente envolvido', 'clientes envolvidos')}`, s.riscos.criticas != null ? `${pl(s.riscos.criticas, 'pendência crítica', 'pendências críticas')}` : 'pendências: acesso restrito']} />
          <State n={s.pessoas.n} label="Pessoas" onClick={() => go('pessoas')} lines={[`${s.pessoas.abertas} tarefas abertas`, `${s.pessoas.sobrecarga} em sobrecarga · ${s.pessoas.sem_carga} sem carga`]} />
        </div>
      </section>

      {/* RISCOS & GARGALOS */}
      <section id="riscos" className="tw-sec">
        <h2 className="tw-h2">Riscos &amp; gargalos</h2>
        <div className="tw-rgb">
          <div>
            <h3 className="tw-h3">Riscos <span>{n2(d.risks.length)}</span></h3>
            {!d.risks.length ? <p className="tw-empty">Nenhum risco aberto na operação.</p> : d.risks.slice(0, 3).map((r) => (
              <Link key={r.id} to={r.link} className="tw-item">
                <span className={`tw-sev s-${r.level}`}><i aria-hidden /> Risco {RISK[r.level] || r.level}</span>
                {r.client && <span className="tw-item-client">{cleanName(r.client)}</span>}
                <span className="tw-item-t">{r.problem}</span>
                {r.impact && <span className="tw-item-m"><b>Impacto</b> {r.impact}</span>}
                {(r.who || r.due || r.late) && <span className="tw-item-m">{r.who && <><b>Responsável</b> {r.who}</>}{r.who && (r.due || r.late) ? ' · ' : ''}{r.late ? <><b>Atraso</b> {r.late}</> : r.due ? <><b>Prazo</b> {fmtDate(r.due)}</> : null}</span>}
                <span className="tw-go">Ver contexto <I.arrow size={13} /></span>
              </Link>
            ))}
            {d.risks.length > 3 && <Link className="tw-more" to="/pendencias?escopo=equipe">Ver todos · {d.risks.length} <I.arrow size={13} /></Link>}
          </div>
          <div>
            <h3 className="tw-h3">Gargalos <span>{n2(d.bottlenecks.length)}</span></h3>
            {!d.bottlenecks.length ? <p className="tw-empty">Nenhuma etapa acumulando além do prazo.</p> : d.bottlenecks.slice(0, 3).map((b) => (
              <button key={b.stage} className="tw-item" onClick={() => setDrawer({ kind: 'stage', stage: b.stage, label: b.label })}>
                <span className="tw-sev s-alto"><i aria-hidden /> Gargalo</span>
                <span className="tw-item-client">{b.label}</span>
                <span className="tw-item-t">{pl(b.n, 'item parado', 'itens parados')} nesta etapa{b.late ? ` · ${pl(b.late, 'atrasado', 'atrasados')}` : ''}.</span>
                {b.avg_days != null && <span className="tw-item-m"><b>Tempo médio</b> {String(b.avg_days).replace('.', ',')} dias{b.sla_days ? ` (prazo da etapa: ${b.sla_days} dias úteis)` : ''}</span>}
                {b.evidence && <span className="tw-item-m"><b>Evidência</b> {b.evidence}</span>}
                <span className="tw-go">Ver itens <I.arrow size={13} /></span>
              </button>
            ))}
          </div>
          <div>
            <h3 className="tw-h3">Bloqueios <span>{n2(d.blocks.length)}</span></h3>
            {!d.blocks.length ? <p className="tw-empty">Nenhum conteúdo bloqueado.</p> : d.blocks.slice(0, 3).map((b) => (
              <Link key={b.id} to={b.link} className="tw-item">
                <span className="tw-sev s-medio"><i aria-hidden /> Bloqueio</span>
                <span className="tw-item-client">{cleanName(b.client)}</span>
                <span className="tw-item-t">{b.reason || 'Bloqueado'}</span>
                <span className="tw-item-m"><b>Bloqueado por</b> {b.by} · {b.stage} · {b.title}</span>
                <span className="tw-go">Resolver <I.arrow size={13} /></span>
              </Link>
            ))}
            {d.blocks.length > 3 && <Link className="tw-more" to="/pendencias?escopo=equipe">Ver todos · {d.blocks.length} <I.arrow size={13} /></Link>}
          </div>
        </div>
      </section>

      {/* MAPA DA OPERAÇÃO */}
      <section id="operacao" className="tw-sec">
        <div className="tw-sec-head"><h2 className="tw-h2">Mapa da operação</h2><Link className="tw-more" to="/processos">Abrir processos <I.arrow size={13} /></Link></div>
        <p className="tw-lead">As etapas reais do Process Engine, na ordem do fluxo: quantidade, atrasos, bloqueios e tempo médio na etapa. Clique para ver os itens.</p>
        <ol className="tw-flow">
          {d.lanes.map((l) => (
            <li key={l.key} className="tw-lane">
              <div className="tw-lane-h"><span>{l.label}</span><b className="num">{n2(l.n)}</b></div>
              {l.stages.map((k) => d.stages.find((x) => x.stage === k)).filter(Boolean).map((x) => (
                <button key={x.stage} className={`tw-station ${x.n ? '' : 'zero'} ${x.late ? 'late' : ''}`} onClick={() => setDrawer({ kind: 'stage', stage: x.stage, label: x.label })} disabled={!x.n} aria-label={`${x.label}: ${pl(x.n, 'item', 'itens')}`}>
                  <span className="tw-st-l">{x.label}</span>
                  <span className="tw-st-n">{x.n}</span>
                  <span className="tw-st-m">
                    {x.late ? <em>{pl(x.late, 'atrasado', 'atrasados')}</em> : null}
                    {x.blocked ? <em>{pl(x.blocked, 'bloqueado', 'bloqueados')}</em> : null}
                    {x.avg_days != null && x.n ? <span>{String(x.avg_days).replace('.', ',')}d na etapa</span> : null}
                    {x.entered ? <span>+{x.entered} no período</span> : null}
                  </span>
                </button>
              ))}
            </li>
          ))}
        </ol>
        <Accumulation stages={d.stages} open={(x) => setDrawer({ kind: 'stage', stage: x.stage, label: x.label })} />
      </section>

      {/* PESSOAS */}
      <section id="pessoas" className="tw-sec">
        <h2 className="tw-h2">Capacidade da equipe</h2>
        {d.people_insights.length > 0 && (
          <ul className="tw-pins">{d.people_insights.map((p, i) => <li key={i}><span className="tw-label">{p.kind}</span><span>{p.text}</span><Link className="tw-more" to={p.link}>Ver <I.arrow size={13} /></Link></li>)}</ul>
        )}
        <p className="tw-lead">Carga, alertas e situação usam só tarefas nascidas na plataforma. Tarefas herdadas da migração aparecem à parte e não pesam contra ninguém. Capacidade = valor configurado no cadastro, não medido.</p>
        <div className="tw-table tw-cap-table" role="table" aria-label="Capacidade por pessoa">
          <div className="tw-tr tw-th" role="row"><span role="columnheader">Pessoa</span><span role="columnheader">Abertas</span><span role="columnheader">Herdadas</span><span role="columnheader">Atrasadas</span><span role="columnheader">Próx. 7 dias</span><span role="columnheader">Carga × capacidade</span><span role="columnheader">Situação</span></div>
          {d.people.map((p) => {
            const max = Math.max(p.capacity, p.open_real, 1);
            return (
              <button key={p.id} className="tw-tr" role="row" onClick={() => setDrawer({ kind: 'person', id: p.id, label: p.name })} aria-label={`${p.name}: ${p.open_real} abertas da plataforma, ${p.open_inherited} herdadas, ${p.late} atrasadas`}>
                <span className="tw-person" role="cell"><b>{p.name}</b><small>{p.functions.map((f) => FUNCTIONS[f] || f).join(' · ') || 'Sem função operacional'}</small></span>
                <span className="n" role="cell" data-l="Abertas">{p.open_real}</span>
                <span className="n muted" role="cell" data-l="Herdadas" title="Herdadas da migração: fora de alertas e indicadores">{p.open_inherited}{p.inherited ? <small> · {p.inherited} c/ prazo de migração vencido</small> : null}</span>
                <span className={`n ${p.late ? 'alert' : ''}`} role="cell" data-l="Atrasadas">{p.late}</span>
                <span className="n" role="cell" data-l="Próx. 7 dias">{p.next7}{p.next7_inherited ? <small>+ {p.next7_inherited} herdadas</small> : null}</span>
                <span className="tw-cap" role="cell" title={`${p.open_real} de ${p.capacity}/semana (${p.capacity_source})`}><i style={{ width: `${(p.open_real / max) * 100}%` }} /><s style={{ left: `${(p.capacity / max) * 100}%` }} /></span>
                <span className={`tw-sit s-${p.situation}`} role="cell">{SITUATION[p.situation]}</span>
              </button>
            );
          })}
        </div>
        {d.performance_base && <p className="tw-lead mt-4"><b>Base de performance:</b> {d.performance_base.valid_events ? `${d.performance_base.valid_events} evento(s) operacional(is) válido(s) registrado(s)` : 'DADOS INSUFICIENTES — nenhuma tarefa concluída nascida na plataforma ainda'}{d.performance_base.pending_classification ? ` · ${d.performance_base.pending_classification} item(ns) herdado(s) aguardando classificação, fora da base` : ''}. Score individual não é calculado.</p>}
        {d.fn_load.length > 0 && <p className="tw-lead mt-4">Por função: {d.fn_load.map((f) => `${FUNCTIONS[f.fn] || f.fn} — ${pl(f.open, 'aberta', 'abertas')} para ${pl(f.people, 'pessoa', 'pessoas')}`).join(' · ')}</p>}
      </section>

      {/* CLIENTES + RESPONSABILIDADES */}
      <div className="tw-two">
        <section id="clientes" className="tw-sec">
          <h2 className="tw-h2">Clientes &amp; saúde da operação</h2>
          <Health rows={d.health} />
        </section>
        <section id="responsabilidades" className="tw-sec">
          <h2 className="tw-h2">Responsabilidades</h2>
          <Responsibilities r={d.responsibilities} />
        </section>
      </div>

      {/* PERÍODO */}
      <section id="periodo" className="tw-sec">
        <div className="tw-sec-head"><h2 className="tw-h2">Desempenho do período</h2><span className="tw-period-l">{d.period.label}</span></div>
        <Performance p={d.performance} />
      </section>

      {/* INTELIGÊNCIA */}
      <section id="inteligencia" className="tw-sec">
        <div className="tw-sec-head"><h2 className="tw-h2">Inteligência The Bold</h2><Link className="tw-more" to="/insights">Todos os insights <I.arrow size={13} /></Link></div>
        <p className="tw-lead">Leituras automáticas sobre os dados da plataforma, separadas em fato, padrão observado, hipótese e recomendação. Correlação não é causa: a hipótese nunca aponta uma pessoa ou um cliente como culpado.</p>
        {!d.intel.length ? <p className="tw-empty">Nenhum padrão relevante nos dados atuais.</p> : (
          <div className="tw-intel">{d.intel.map((x) => (
            <article key={x.id} className="tw-in">
              <div className="tw-label">{x.kind}</div>
              <h3 className="tw-in-t">{x.fact || x.what}</h3>
              <dl className="tw-rc">
                <div><dt>Fato</dt><dd>{x.evidence?.length > 0 ? <ul>{x.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul> : 'Medido na base agora.'}</dd></div>
                <div><dt>Padrão observado</dt><dd>{x.pattern || <span className="muted">Nenhum padrão além do fato com os dados atuais.</span>}</dd></div>
                <div><dt>Hipótese <small>não verificada</small></dt><dd>{x.hypothesis?.text || <span className="muted">Sem hipótese registrada.</span>}</dd></div>
                <div><dt>Recomendação</dt><dd>{x.recommendation || x.suggestion || '—'}</dd></div>
                {x.why && <div><dt>Impacto esperado</dt><dd>{x.why}</dd></div>}
              </dl>
              {x.action.to.startsWith('#') ? <button className="tw-more" onClick={() => go(x.action.to.slice(1))}>{x.action.label} <I.arrow size={13} /></button> : <Link className="tw-more" to={x.action.to}>{x.action.label} <I.arrow size={13} /></Link>}
            </article>
          ))}</div>
        )}
      </section>

      {/* DETALHAMENTO */}
      <section id="detalhe" className="tw-sec">
        <h2 className="tw-h2">Detalhamento</h2>
        <div className="tw-detail">
          {d.finance && (
            <div className="tw-mini">
              <div className="tw-label">Financeiro</div>
              {d.finance.has_data ? (
                <dl>
                  <div><dt>Recebido no período</dt><dd>{money(d.finance.recebido)}</dd></div>
                  <div><dt>Em aberto</dt><dd>{money(d.finance.em_aberto)}</dd></div>
                  <div><dt>Em atraso</dt><dd className={`${d.finance.atrasado ? 'alert' : ''}`}>{money(d.finance.atrasado)}</dd></div>
                  <div><dt>A receber em 30 dias</dt><dd>{money(d.finance.a_receber_30d)}</dd></div>
                </dl>
              ) : <p className="tw-empty">Nenhum contrato ou fatura cadastrado ainda.</p>}
              <Link className="tw-more" to="/financeiro">Ver financeiro <I.arrow size={13} /></Link>
            </div>
          )}
          {d.crm && (
            <div className="tw-mini">
              <div className="tw-label">Comercial</div>
              {d.crm.has_data ? (
                <dl>
                  <div><dt>Leads</dt><dd>{d.crm.leads}</dd></div>
                  <div><dt>Oportunidades</dt><dd>{d.crm.oportunidades}</dd></div>
                  <div><dt>Em negociação</dt><dd>{d.crm.negociacao}</dd></div>
                  <div><dt>Ganhos no período</dt><dd>{d.crm.ganhos}</dd></div>
                  <div><dt>Follow-ups vencidos</dt><dd className={`${d.crm.followups_vencidos ? 'alert' : ''}`}>{d.crm.followups_vencidos}</dd></div>
                  <div><dt>Valor do pipeline</dt><dd>{money(d.crm.pipeline)}</dd></div>
                </dl>
              ) : <p className="tw-empty">Nenhum negócio cadastrado no CRM ainda.</p>}
              <Link className="tw-more" to="/crm">Ver CRM <I.arrow size={13} /></Link>
            </div>
          )}
          <div className="tw-mini">
            <div className="tw-label">Automações</div>
            <dl>
              <div><dt>Execuções no período</dt><dd>{d.automations.runs}</dd></div>
              <div><dt>Regras ativas</dt><dd>{d.automations.active}<small> de {d.automations.catalog} no catálogo</small></dd></div>
              <div><dt>Falhas</dt><dd className={`${d.automations.errors ? 'alert' : ''}`}>{d.automations.errors}</dd></div>
              <div><dt>Ignoradas (condição não atendida)</dt><dd>{d.automations.ignored}</dd></div>
            </dl>
            <button className="tw-more" onClick={() => setDrawer({ kind: 'automacoes' })}>Investigar execuções <I.arrow size={13} /></button>
          </div>
          <div className="tw-mini">
            <div className="tw-label">Relatórios</div>
            {d.report ? (
              <dl>
                <div><dt>Último relatório</dt><dd className="cap">{d.report.kind}</dd></div>
                <div><dt>Período</dt><dd>{fmtDate(d.report.period_start)} → {fmtDate(d.report.period_end)}</dd></div>
                <div><dt>Gerado em</dt><dd>{fmtDateTime(d.report.created_at)} · {d.report.generated_by}</dd></div>
              </dl>
            ) : <p className="tw-empty">Nenhum relatório gerado ainda.</p>}
            <button className="tw-more" onClick={() => setDrawer({ kind: 'reports' })}>{d.report ? 'Abrir · gerar novo' : 'Gerar relatório'} <I.arrow size={13} /></button>
          </div>
          <div className="tw-mini">
            <div className="tw-label">Agenda · 7 dias</div>
            {d.meetings.length ? <p className="tw-mini-p">{pl(d.meetings.length, 'reunião marcada', 'reuniões marcadas')}. Próxima: {fmtDateTime(d.meetings[0].starts_at)}{d.meetings[0].client_name ? ` · ${cleanName(d.meetings[0].client_name)}` : ''}.</p> : <p className="tw-empty">Nenhuma reunião marcada na plataforma.</p>}
            <button className="tw-more" onClick={() => setDrawer({ kind: 'reunioes' })}>Ver reuniões <I.arrow size={13} /></button>
          </div>
        </div>
      </section>

      <TowerDrawer drawer={drawer} d={d} params={params} onClose={() => { setDrawer(null); if (tab) set({}); }} />
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <select className="tw-select" value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{label}: todos</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

function State({ n, label, lines, alert, onClick }) {
  return (
    <button className="tw-st" onClick={onClick} data-cursor="EXPLORAR">
      <span className={`tw-st-big num ${alert ? 'alert' : ''}`}>{n2(n)}</span>
      <span className="tw-label">{label}</span>
      {lines.map((l, i) => <span key={i} className="tw-st-line">{l}</span>)}
    </button>
  );
}

function Accumulation({ stages, open }) {
  const rows = stages.filter((s) => s.n && !['agendado', 'publicado'].includes(s.stage)).sort((a, b) => b.n - a.n);
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

function Health({ rows }) {
  const [showAll, setShowAll] = useState(false);
  const flagged = rows.filter((r) => r.score > 0);
  const shown = showAll ? rows : flagged.slice(0, 6);
  if (!rows.length) return <p className="tw-empty">Nenhum cliente no filtro atual.</p>;
  return (
    <>
      <p className="tw-lead">{flagged.length ? `${pl(flagged.length, 'cliente pede', 'clientes pedem')} atenção, por prioridade.` : 'Nenhum cliente com risco, atraso, bloqueio ou responsabilidade em aberto.'}</p>
      <ul className="tw-health">
        {shown.map((c) => {
          const flags = [
            ['alto', 'critico'].includes(c.risk) && `Risco ${RISK[c.risk].toLowerCase()}`,
            c.pendencias ? pl(c.pendencias, 'pendência', 'pendências') : null,
            c.atrasos ? pl(c.atrasos, 'tarefa atrasada', 'tarefas atrasadas') : null,
            c.bloqueados ? pl(c.bloqueados, 'bloqueio', 'bloqueios') : null,
            c.aguardando ? `${c.aguardando} aguardando resposta` : null,
            c.sem_funcao.length ? `Sem ${c.sem_funcao.join(', ').toLowerCase()}` : null,
            c.decisoes ? pl(c.decisoes, 'decisão da migração', 'decisões da migração') : null,
          ].filter(Boolean);
          return (
            <li key={c.id}>
              <Link to={`/clientes/${c.id}`} className="tw-hrow">
                <span className="tw-h-name">{cleanName(c.name)}<small>{STATUS[c.status] || c.status} · {c.ativos ? pl(c.ativos, 'conteúdo ativo', 'conteúdos ativos') : 'sem conteúdo no processo'}</small></span>
                <span className="tw-h-flags">{flags.length ? flags.map((f) => <span key={f}>{f}</span>) : <span className="ok">Sem pontos abertos</span>}</span>
                {c.next && <span className="tw-h-next"><b>Próxima ação</b> {c.next}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
      {rows.length > flagged.slice(0, 6).length && <button className="tw-more" onClick={() => setShowAll(!showAll)}>{showAll ? 'Mostrar só os que pedem atenção' : `Ver todos os ${rows.length} clientes`} <I.arrow size={13} /></button>}
    </>
  );
}

function Responsibilities({ r }) {
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? r.no_owner : r.no_owner.slice(0, 8);
  return (
    <>
      {!r.no_owner.length && !r.unassigned.length ? <p className="tw-empty">Todas as funções essenciais têm responsável e nenhuma tarefa está sem dono.</p> : null}
      {r.no_owner.length > 0 && (
        <>
          <p className="tw-lead">{pl(r.no_owner.length, 'cliente sem', 'clientes sem')} pessoa vinculada em função essencial do processo (estratégia, design, edição).</p>
          <ul className="tw-resp">
            {list.map((x) => (
              <li key={x.client_id}>
                <span><b>{cleanName(x.client)}</b><small>{x.functions.join(' · ')} — sem responsável</small></span>
                <Link className="tw-more" to={`/clientes/${x.client_id}?tab=equipe`}>Vincular <I.arrow size={13} /></Link>
              </li>
            ))}
          </ul>
          {r.no_owner.length > 8 && <button className="tw-more" onClick={() => setShowAll(!showAll)}>{showAll ? 'Mostrar menos' : `Ver todos · ${r.no_owner.length}`} <I.arrow size={13} /></button>}
        </>
      )}
      {r.unassigned.length > 0 && (
        <>
          <h3 className="tw-h3 mt-5">Tarefas sem responsável <span>{n2(r.unassigned.length)}</span></h3>
          <ul className="tw-resp">{r.unassigned.slice(0, 6).map((t) => (
            <li key={t.id}><span><b>{t.title}</b><small>{cleanName(t.client || '')} · função {FUNCTIONS[t.function] || t.function}</small></span>
              <Link className="tw-more" to={t.content_id ? `/conteudos/${t.content_id}` : `/clientes/${t.client_id}?tab=equipe`}>Atribuir <I.arrow size={13} /></Link></li>
          ))}</ul>
        </>
      )}
      {r.team_conflicts > 0 && <p className="tw-lead mt-4">{pl(r.team_conflicts, 'vínculo de equipe aguarda', 'vínculos de equipe aguardam')} decisão (fontes do Notion divergentes). <Link className="tw-inline" to="/migracao?kind=equipe">Decidir</Link></p>}
    </>
  );
}

const PERF = [
  ['conteudos_criados', 'Conteúdos criados'], ['temas_aprovados', 'Temas aprovados'], ['aprovados_cliente', 'Aprovados pelo cliente'], ['ajustes_internos', 'Ajustes internos', true],
  ['ajustes_cliente', 'Ajustes de cliente', true], ['publicados', 'Publicados'], ['tarefas_concluidas', 'Tarefas concluídas'], ['concluidas_atraso', 'Concluídas com atraso', true], ['prazos_estourados', 'Prazos estourados', true],
];
function Performance({ p }) {
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
        <div className="tw-pm"><span className="tw-pm-n">{p.pendencias_abertas != null ? n2(p.pendencias_abertas) : '—'}</span><span className="tw-label">Pendências abertas agora</span><span className="tw-delta">calculadas em tempo real; o histórico de resolvidas ainda não é guardado</span></div>
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

function TowerDrawer({ drawer, d, params, onClose }) {
  if (!drawer) return null;
  const titles = { stage: drawer.label, person: drawer.label, prazos: 'Prazos', automacoes: 'Execuções de automação', reports: 'Relatórios', reunioes: 'Reuniões · próximos 7 dias' };
  return (
    <Drawer open onClose={onClose} restore={drawer} restoreKey="torre" title={titles[drawer.kind]} kicker="Torre de Controle" wide>
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
