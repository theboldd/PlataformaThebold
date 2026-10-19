import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi, useAuth, useToast } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { useCrumbs } from '../components/Shell.jsx';
import { PageHead, Section, Loading, ErrorBox, Empty, Drawer, Button, Seg } from '../components/ui.jsx';
import { money, fmtDateTime, fmtDate, cleanName, ago } from '../lib/format.js';
import { FUNCTIONS } from '../lib/status.js';
import { Meter, RiskList, MeetingRows, InsightMini, n2 } from './intel/parts.jsx';

const AUTO_LABEL = { 'tarefa.atribuida': 'Tarefas atribuídas por função', 'tema.aprovado': 'Temas aprovados → produção', 'producao.concluida': 'Produção → revisão interna', 'cliente.notificado_aprovacao': 'Clientes notificados', 'revisao.aprovada': 'Revisão → cliente', 'ajuste.concluido': 'Ajustes devolvidos à revisão', 'cliente.aprovou': 'Aprovado → agendamento', 'cliente.ajuste': 'Ajustes do cliente criados', 'prazo.vencido': 'Alertas de prazo vencido', 'prazo.proximo': 'Alertas de prazo próximo', 'insights.detectar': 'Detectores de gargalo', 'conteudo.agendado': 'Agendamentos', 'material.pendente': 'Pendências de material', 'mencao': 'Menções notificadas' };

export default function Torre() {
  useCrumbs('Torre de Controle');
  const auth = useAuth();
  const { data: d, error, loading } = useApi('/torre');
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab');
  const open = (t) => setParams(t ? { tab: t } : {});
  if (loading && !d) return <div className="page"><Loading rows={8} /></div>;
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  const m = d.metrics;
  const overload = d.team.filter((t) => t.open > t.capacity).length;
  const cells = [
    { k: 'operacao', label: 'Operação', big: m.em_producao + m.em_revisao + m.aguardando_cliente, d: <><b>{m.em_producao}</b> em produção · <b>{m.em_revisao}</b> em revisão · <b>{m.aguardando_cliente}</b> com clientes</> },
    { k: 'clientes', label: 'Clientes ativos', big: m.clientes_ativos, d: <><b>{d.risks.length}</b> em risco</>, alert: false },
    { k: 'producao', label: 'Produção', big: m.em_producao, d: <><b>{m.bloqueados}</b> bloqueados · <b>{m.agendados}</b> agendados · <b>{m.publicados_mes}</b> publicados no mês</> },
    { k: 'pessoas', label: 'Pessoas', big: d.team.length, d: overload ? <><b>{overload}</b> acima da capacidade</> : 'carga dentro da capacidade' },
    { k: 'prazos', label: 'Prazos', big: m.atrasadas, alert: m.atrasadas > 0, d: <>atrasados · <b>{m.prazos_hoje}</b> vencem hoje · <b>{m.sem_responsavel}</b> sem responsável</> },
    { k: 'riscos', label: 'Riscos', big: d.risks.length + (d.pendencias_criticas || 0), alert: d.risks.length > 0, d: <><b>{d.risks.length}</b> clientes{d.pendencias_criticas != null && <> · <b>{d.pendencias_criticas}</b> pendências críticas</>}</> },
    d.finance ? { k: 'financeiro', label: 'Financeiro', big: money(d.finance.recebido_mes), small: true, d: <>recebido no mês · <b>{money(d.finance.atrasado)}</b> em atraso</> } : null,
    d.crm ? { k: 'comercial', label: 'Comercial', big: d.crm.abertos.n, d: <>negócios · <b>{money(d.crm.ponderado)}</b> ponderado · <b>{d.crm.followups_vencidos}</b> follow-ups vencidos</> } : null,
    { k: 'automacoes', label: 'Automações', big: d.automations.runs_24h, d: <>execuções em 24h · <b>{d.automations.active}</b> regras ativas</> },
    { k: 'ia', label: 'IA · Insights', big: d.insights.length, d: <>gargalos e padrões identificados</> },
    { k: 'reunioes', label: 'Reuniões', big: d.meetings.length, d: <>nos próximos 7 dias</> },
  ].filter(Boolean);
  return (
    <div className="page">
      <PageHead kicker="Torre de Controle The Bold" title="O que está acontecendo agora." />
      <p className="brief" style={{ marginTop: 0 }}>{d.brief}</p>
      <div className="tower-grid mt-6">
        {cells.map((c) => (
          <button key={c.k} className="tower-cell" onClick={() => open(c.k)} data-cursor="EXPLORAR" aria-label={`${c.label}: detalhar`}>
            <span className="k">{c.label}</span>
            <span className={`big num ${c.alert ? 'alert' : ''}`} style={c.small ? { fontSize: 'clamp(36px,3.6vw,56px)' } : null}>{typeof c.big === 'number' ? n2(c.big) : c.big}</span>
            <span className="d">{c.d}</span>
          </button>
        ))}
      </div>
      <Reports finance={!!d.finance} />
      <TowerDrawer tab={tab} d={d} onClose={() => open(null)} />
    </div>
  );
}

function TowerDrawer({ tab, d, onClose }) {
  if (!tab) return null;
  const T = { operacao: 'Operação', clientes: 'Clientes em risco', producao: 'Produção por etapa', pessoas: 'Pessoas e capacidade', prazos: 'Próximos prazos', riscos: 'Riscos', financeiro: 'Financeiro', comercial: 'Comercial', automacoes: 'Automações', ia: 'Insights', reunioes: 'Reuniões' };
  const maxStage = Math.max(1, ...d.stages.map((s) => s.n));
  const maxTeam = Math.max(1, ...d.team.map((t) => Math.max(t.open, t.capacity)));
  return (
    <Drawer open onClose={onClose} title={T[tab] || 'Detalhe'} kicker="Torre de Controle" wide>
      {(tab === 'operacao' || tab === 'producao') && (
        <>
          <div className="caps mb-2">Conteúdos por etapa</div>
          {d.stages.filter((s) => s.n).sort((a, b) => b.n - a.n).map((s) => <Meter key={s.stage} label={s.label} value={s.n} max={maxStage} display={`${s.n}${s.blocked ? ` · ${s.blocked} bloq.` : ''}`} to={`/processos?stage=${s.stage}`} />)}
          <div className="row mt-5"><Link className="btn btn-primary" to="/processos">Abrir quadro de processos</Link></div>
        </>
      )}
      {(tab === 'clientes' || tab === 'riscos') && (
        <>
          <RiskList risks={d.risks} />
          {d.pendencias_criticas != null && <div className="row mt-5"><Link className="btn btn-primary" to="/pendencias">{d.pendencias_criticas} pendências críticas →</Link></div>}
        </>
      )}
      {tab === 'pessoas' && (
        <>
          <div className="caps mb-2">Tarefas abertas · traço = capacidade semanal</div>
          {d.team.map((t) => <Meter key={t.id} label={t.name} value={t.open} max={maxTeam} mark={t.capacity} display={`${t.open}/${t.capacity}`} title={`${t.name}: ${t.open} abertas · ${t.late} atrasadas · ${t.done_7d} concluídas em 7 dias`} />)}
          <div className="table-wrap mt-5">
            <table className="table"><thead><tr><th>Pessoa</th><th>Funções</th><th>Abertas</th><th>Atrasadas</th><th>Concluídas 7d</th></tr></thead>
              <tbody>{d.team.map((t) => <tr key={t.id}><td>{t.name}</td><td className="muted">{t.functions.map((f) => FUNCTIONS[f] || f).join(', ') || '—'}</td><td>{t.open}</td><td style={t.late ? { color: 'var(--err)' } : null}>{t.late}</td><td>{t.done_7d}</td></tr>)}</tbody></table>
          </div>
        </>
      )}
      {tab === 'prazos' && (d.deadlines.length ? d.deadlines.map((t) => (
        <Link key={t.id} to={t.content_id ? `/conteudos/${t.content_id}` : '/processos'} className="erow link" style={{ gridTemplateColumns: '84px minmax(0,1fr)' }}>
          <div className="ed" style={{ fontSize: 22, color: t.overdue ? 'var(--err)' : undefined }}>{fmtDate(t.due_at)}</div>
          <div><div className="t">{t.title}</div><div className="s">{cleanName(t.client || '')} · {t.overdue ? 'vencido' : ago(t.due_at)}</div></div>
        </Link>
      )) : <Empty title="Sem prazos." />)}
      {tab === 'financeiro' && d.finance && (
        <div className="grid-2">
          {[['Receita recorrente', d.finance.mrr], ['Faturado no mês', d.finance.faturado_mes], ['Recebido no mês', d.finance.recebido_mes], ['Pendente', d.finance.pendente], ['Em atraso', d.finance.atrasado, true]].map(([l, v, a]) => (
            <div className="stat" key={l}><span className={`value num ${a && v ? 'alert' : ''}`} style={{ fontSize: 40 }}>{money(v)}</span><span className="label">{l}</span></div>
          ))}
          <div className="stat"><span className="value num" style={{ fontSize: 40 }}>{n2(d.finance.inadimplentes)}</span><span className="label">Clientes inadimplentes</span></div>
          <div><Link className="btn btn-primary" to="/financeiro">Abrir financeiro</Link></div>
        </div>
      )}
      {tab === 'comercial' && d.crm && (
        <div className="grid-2">
          <div className="stat"><span className="value num" style={{ fontSize: 48 }}>{n2(d.crm.abertos.n)}</span><span className="label">Negócios abertos</span><span className="hint">{money(d.crm.abertos.v)} em valor</span></div>
          <div className="stat"><span className="value num" style={{ fontSize: 40 }}>{money(d.crm.ponderado)}</span><span className="label">Pipeline ponderado</span></div>
          <div className="stat"><span className={`value num ${d.crm.followups_vencidos ? 'alert' : ''}`} style={{ fontSize: 48 }}>{n2(d.crm.followups_vencidos)}</span><span className="label">Follow-ups vencidos</span></div>
          <div><Link className="btn btn-primary" to="/crm">Abrir CRM</Link></div>
        </div>
      )}
      {tab === 'automacoes' && (
        <>
          <div className="caps mb-2">Mais executadas nos últimos 7 dias</div>
          {d.automations.top.map((a) => <Meter key={a.automation_key} label={AUTO_LABEL[a.automation_key] || a.automation_key} value={a.n} max={d.automations.top[0]?.n || 1} />)}
          <p className="sm muted mt-4">Cada execução é uma ação que antes dependia de alguém lembrar — mover card, avisar, atribuir, cobrar.</p>
          <Link className="btn btn-primary mt-2" to="/automacoes">Ver catálogo de automações</Link>
        </>
      )}
      {tab === 'ia' && <><InsightMini items={d.insights} /><Link className="btn btn-primary mt-5" to="/insights">Abrir Insights</Link></>}
      {tab === 'reunioes' && <><MeetingRows items={d.meetings} /><Link className="btn btn-primary mt-5" to="/reunioes">Abrir Reuniões</Link></>}
    </Drawer>
  );
}

const KINDS = [{ value: 'operacao', label: 'Operação' }, { value: 'producao', label: 'Produção' }, { value: 'financeiro', label: 'Financeiro' }];
function Reports({ finance }) {
  const toast = useToast();
  const { data, reload } = useApi('/reports');
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
    <Section title="Relatórios" kicker="Gerados automaticamente toda segunda às 8h · ou sob demanda"
      action={<div className="row wrap"><Seg options={KINDS.filter((k) => finance || k.value !== 'financeiro')} value={kind} onChange={setKind} label="Tipo" /><Seg options={[{ value: 7, label: '7 dias' }, { value: 30, label: '30 dias' }]} value={days} onChange={setDays} label="Período" /><Button variant="primary" size="sm" magnetic onClick={gen} disabled={busy}>{busy ? 'Gerando…' : 'Gerar relatório'}</Button></div>}>
      <div className="cols-even">
        <div>
          {!data?.length ? <Empty title="Nenhum relatório ainda." /> : data.map((r) => (
            <button key={r.id} className={`erow link`} style={{ gridTemplateColumns: 'minmax(0,1fr) auto', width: '100%', background: sel?.id === r.id ? 'var(--bordo-soft)' : 'none', border: 0, borderBottom: '1px solid var(--line)', textAlign: 'left', color: 'inherit' }} onClick={() => setSel(r)}>
              <div><div className="t" style={{ textTransform: 'capitalize' }}>Relatório de {r.kind}</div><div className="s">{fmtDate(r.period_start)} → {fmtDate(r.period_end)} · {r.generated_by}</div></div>
              <span className="r">{ago(r.created_at)}</span>
            </button>
          ))}
        </div>
        <div>{sel && <ReportView r={sel} />}</div>
      </div>
    </Section>
  );
}
function ReportView({ r }) {
  const p = r.data.producao || {};
  const rows = [['Conteúdos criados', p.conteudos_criados], ['Aprovados pelo cliente', p.aprovados_cliente], ['Ajustes internos', p.ajustes_internos], ['Ajustes do cliente', p.ajustes_cliente], ['Publicados', p.publicados], ['Tarefas concluídas', p.tarefas_concluidas], ['…com atraso', p.tarefas_concluidas_com_atraso]];
  return (
    <div>
      <div className="caps">Período {fmtDateTime(r.period_start)} → {fmtDateTime(r.period_end)}</div>
      <div className="grid-3 mt-4">{rows.map(([l, v]) => <div className="stat" key={l}><span className="value num" style={{ fontSize: 44 }}>{n2(v)}</span><span className="label">{l}</span></div>)}
        <div className="stat"><span className={`value num ${r.data.pendencias_criticas ? 'alert' : ''}`} style={{ fontSize: 44 }}>{n2(r.data.pendencias_criticas)}</span><span className="label">Pendências críticas</span></div>
      </div>
      {r.data.financeiro && <div className="grid-2 mt-4"><div className="stat"><span className="value num" style={{ fontSize: 34 }}>{money(r.data.financeiro.recebido)}</span><span className="label">Recebido</span></div><div className="stat"><span className="value num alert" style={{ fontSize: 34 }}>{money(r.data.financeiro.atrasado)}</span><span className="label">Em atraso</span></div></div>}
      {r.data.equipe?.length > 0 && (
        <div className="table-wrap mt-5"><table className="table"><thead><tr><th>Pessoa</th><th>Abertas</th><th>Atrasadas</th><th>Concluídas 7d</th></tr></thead>
          <tbody>{r.data.equipe.map((e) => <tr key={e.name}><td>{e.name}</td><td>{e.abertas}</td><td style={e.atrasadas ? { color: 'var(--err)' } : null}>{e.atrasadas}</td><td>{e.concluidas_7d}</td></tr>)}</tbody></table></div>
      )}
      {r.data.insights?.length > 0 && <><div className="caps mt-5 mb-2">Insights do período</div><ul className="list">{r.data.insights.map((x, i) => <li key={i} className="sm" style={{ display: 'block' }}><b>{x.problem}</b><div className="muted">→ {x.suggestion}</div></li>)}</ul></>}
      {r.narrative ? <p className="mt-4">{r.narrative}</p> : <p className="xs faint mt-4">Narrativa por IA: disponível quando o Claude estiver configurado (V2).</p>}
    </div>
  );
}
