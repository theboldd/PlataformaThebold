import { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/admin.css';
import '../styles/finance.css';
import { LoadError } from './admin/Guard.jsx';
import { api } from '../lib/api.js';
import { useApi, useAuth, useToast } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Button, Empty, Field, Loading, Modal, PageHead, Section, Seg, Tabs, Tag } from '../components/ui.jsx';
import { StateBadge, StateNotice, Insufficient } from '../components/State.jsx';
import { I } from '../components/Icons.jsx';
import { fmtDate, money, cleanName } from '../lib/format.js';
import { useUrlState } from '../lib/nav.jsx';

const INV = { aberta: ['Em aberto', 'info'], paga: ['Paga', 'ok'], atrasada: ['Atrasada', 'err'], cancelada: ['Cancelada', ''] };
const TABS = [{ key: 'recebimentos', label: 'Recebimentos' }, { key: 'producao', label: 'Produção & Repasses' }, { key: 'rentabilidade', label: 'Rentabilidade' }];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const monthLabel = (ym) => { const [y, m] = ym.split('-'); return `${MONTHS[Number(m) - 1]}/${y.slice(2)}`; };

export default function Financeiro() {
  useCrumbs('Financeiro');
  const auth = useAuth();
  const [tab, setTab] = useUrlState('aba', 'recebimentos');
  const [newContract, setNewContract] = useState(false);
  const current = TABS.some((t) => t.key === tab) ? tab : 'recebimentos';
  return (
    <div className="page">
      <PageHead kicker="Acesso restrito" title="Financeiro" sub="Recebimentos, produção & repasses e rentabilidade por cliente.">
        {current === 'recebimentos' && auth.can('financeiro', 'create') && <Button variant="primary" icon={<I.plus size={15} />} onClick={() => setNewContract(true)}>Novo contrato</Button>}
      </PageHead>
      <Tabs tabs={TABS} value={current} onChange={setTab} />
      <div className="fin-body">
        {current === 'recebimentos' && <Recebimentos newContract={newContract} closeNewContract={() => setNewContract(false)} />}
        {current === 'producao' && <Producao />}
        {current === 'rentabilidade' && <Rentabilidade />}
      </div>
    </div>
  );
}

// ───────────── RECEBIMENTOS ─────────────
function Recebimentos({ newContract, closeNewContract }) {
  const { data, error, loading, reload } = useApi('/finance');
  const auth = useAuth();
  const toast = useToast();
  const [filter, setFilter] = useUrlState('status', 'todas');
  const [client, setClient] = useUrlState('cliente', '');
  const [pay, setPay] = useState(null);
  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} />;
  const s = data.summary;
  const empty = !data.contracts.length && !data.invoices.length;
  const invoices = data.invoices.filter((i) => (filter === 'todas' || i.status === filter) && (!client || i.client_id === client));
  const debtors = Object.values(data.overdue.reduce((acc, i) => { (acc[i.client_id] ||= { id: i.client_id, name: i.client_name, total: 0, n: 0, since: i.due_at }).total += i.amount; acc[i.client_id].n++; return acc; }, {}));
  const col = data.collection || {};
  const autosOn = (col.automations || []).filter((a) => a.enabled).map((a) => a.key);
  const modal = newContract && <ContractModal clients={data.clients} onClose={closeNewContract} onDone={() => { closeNewContract(); toast('Contrato criado com as parcelas'); reload(); }} />;
  return (
    <>
      <div className="fin-grid">
        {[['Receita recorrente', s.receita_recorrente, 'contratos ativos / mês'], ['Faturado no mês', s.faturado_mes, 'vencimentos do mês'], ['Recebido no mês', s.recebido_mes, 'pagamentos registrados'], ['Pendente', s.pendente, 'em aberto, a vencer'], ['Atrasado', s.atrasado, `${debtors.length} cliente(s)`]].map(([l, v, h], i) => (
          <div key={l}><div className="caps">{l}</div><div className={`fin-num tnum mt-2 ${i === 4 && v > 0 ? 'bordo' : ''}`}>{empty ? '—' : money(v)}</div><div className="xs muted mt-2">{h}</div></div>
        ))}
      </div>
      {empty && (
        <div className="section">
          <Insufficient items={['Contratos ativos e receita recorrente', 'Parcelas geradas a partir de cada contrato (vencimento, valor, status)', 'Próximos vencimentos e inadimplência por cliente', 'Cobrança: parcelas vencidas, dias de atraso e quem age', 'Histórico de recebimentos registrados']}>
            Nenhum contrato ou parcela cadastrado ainda. Ao criar um contrato em “Novo contrato”, as parcelas são geradas e esta área passa a mostrar:
          </Insufficient>
        </div>
      )}
      {!empty && (
        <div className="grid-2 section">
          <div>
            <div className="section-head"><h2 className="ed-md">Próximos vencimentos</h2></div>
            {!data.upcoming.length ? <Empty title="Nada a vencer." /> : (
              <ul className="list">{data.upcoming.slice(0, 8).map((i) => (
                <li key={i.id}><span className="xs tnum muted" style={{ width: 64, flex: 'none' }}>{fmtDate(i.due_at)}</span><span className="grow clip">{cleanName(i.client_name)} <span className="faint">· {i.description}</span></span><span className="tnum">{money(i.amount)}</span></li>
              ))}</ul>
            )}
          </div>
          <div>
            <div className="section-head"><h2 className="ed-md">Inadimplência</h2><span className="xs muted">atraso calculado pela data de vencimento</span></div>
            {!debtors.length ? <Empty title="Nenhum atraso." /> : (
              <ul className="list">{debtors.map((d) => (
                <li key={d.id}><span className="grow"><Link to={`/clientes/${d.id}`} className="strong">{cleanName(d.name)}</Link><div className="xs muted">{d.n} parcela(s) desde {fmtDate(d.since)}</div></span><span className="tnum bordo strong">{money(d.total)}</span></li>
              ))}</ul>
            )}
          </div>
        </div>
      )}
      <Section title="Cobrança">
        {col.scheduler_configured
          ? <StateNotice compact s="ativo" title="Régua de cobrança automática">Agendador configurado (CRON_SECRET). Alertas de vencimento (3 dias antes) e de atraso disparam quando a rotina externa chama o agendador{autosOn.length ? ` · automações ligadas: ${autosOn.join(', ')}` : ' · nenhuma das automações financeiras está ligada'}.</StateNotice>
          : <StateNotice s="aguardando_configuracao" title="Régua de cobrança automática" to="/automacoes" action="Ver automações">Os alertas automáticos <b>financeiro.vencimento</b> (3 dias antes) e <b>financeiro.atraso</b> dependem do agendador, que precisa de <b>CRON_SECRET</b> e de uma hospedagem/rotina que chame <code>/api/cron/tick</code>. No preview da Vercel o agendador não roda: a cobrança é manual. O atraso abaixo é calculado na hora, pela data de vencimento.</StateNotice>}
        {!data.overdue.length ? <div className="mt-4">{empty ? <Insufficient>Sem parcelas cadastradas — não há o que cobrar.</Insufficient> : <Empty title="Nenhuma parcela vencida." />}</div> : (
          <div className="table-wrap mt-4"><table className="table fin-table">
            <thead><tr><th>Cliente</th><th>Parcela</th><th>Vencimento</th><th className="right">Dias de atraso</th><th className="right">Valor</th><th>Quem age</th><th /></tr></thead>
            <tbody>{data.overdue.map((i) => (
              <tr key={i.id}>
                <td data-label="Cliente"><Link to={`/clientes/${i.client_id}`}>{cleanName(i.client_name)}</Link></td>
                <td data-label="Parcela" className="muted">{i.description}</td>
                <td data-label="Vencimento" className="tnum">{fmtDate(i.due_at, { year: '2-digit' })}</td>
                <td data-label="Dias de atraso" className="right tnum bordo strong">{i.days_late}</td>
                <td data-label="Valor" className="right tnum">{money(i.amount)}</td>
                <td data-label="Quem age"><span className="strong">Financeiro</span> <span className="xs muted">cobra</span> → <span className="strong">Cliente</span> <span className="xs muted">paga</span></td>
                <td className="right fin-act">{auth.can('financeiro', 'edit') && <Button size="sm" onClick={() => setPay(i)}>Registrar pagamento</Button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Section>
      {!empty && (
        <Section title="Parcelas" action={<div className="row wrap fin-filters"><select className="select" style={{ minHeight: 34, padding: '4px 10px' }} value={client} onChange={(e) => setClient(e.target.value)} aria-label="Filtrar cliente"><option value="">Todos os clientes</option>{data.clients.map((c) => <option key={c.id} value={c.id}>{cleanName(c.name)}</option>)}</select><Seg value={filter} onChange={setFilter} options={[{ value: 'todas', label: 'Todas' }, { value: 'aberta', label: 'Em aberto' }, { value: 'atrasada', label: 'Atrasadas' }, { value: 'paga', label: 'Pagas' }]} /></div>}>
          <div className="table-wrap"><table className="table fin-table">
            <thead><tr><th>Vencimento</th><th>Cliente</th><th>Descrição</th><th className="right">Valor</th><th>Status</th><th>Pagamento</th><th /></tr></thead>
            <tbody>{invoices.map((i) => (
              <tr key={i.id}>
                <td data-label="Vencimento" className="tnum">{fmtDate(i.due_at, { year: '2-digit' })}</td><td data-label="Cliente">{cleanName(i.client_name)}</td><td data-label="Descrição" className="muted">{i.description}</td>
                <td data-label="Valor" className="right tnum">{money(i.amount)}</td><td data-label="Status"><Tag tone={INV[i.status]?.[1]}>{INV[i.status]?.[0] || i.status}</Tag></td>
                <td data-label="Pagamento" className="xs muted">{i.paid_at ? `${fmtDate(i.paid_at)} · ${money(i.paid_amount)}` : '—'}</td>
                <td className="right fin-act">{i.status !== 'paga' && i.status !== 'cancelada' && auth.can('financeiro', 'edit') && <Button size="sm" onClick={() => setPay(i)}>Registrar pagamento</Button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
          {!invoices.length && <Empty title="Nenhuma parcela neste filtro." />}
        </Section>
      )}
      <Section title="Histórico de recebimentos">
        {!data.paid.length ? <Insufficient>Nenhum pagamento registrado ainda. Cada “Registrar pagamento” aparece aqui com data, valor recebido e parcela.</Insufficient> : (
          <div className="table-wrap"><table className="table fin-table">
            <thead><tr><th>Recebido em</th><th>Cliente</th><th>Parcela</th><th>Vencimento</th><th className="right">Valor da parcela</th><th className="right">Recebido</th></tr></thead>
            <tbody>{data.paid.map((i) => (
              <tr key={i.id}>
                <td data-label="Recebido em" className="tnum">{fmtDate(i.paid_at, { year: '2-digit' })}</td><td data-label="Cliente">{cleanName(i.client_name)}</td><td data-label="Parcela" className="muted">{i.description}</td>
                <td data-label="Vencimento" className="tnum">{fmtDate(i.due_at, { year: '2-digit' })}</td><td data-label="Valor da parcela" className="right tnum">{money(i.amount)}</td><td data-label="Recebido" className="right tnum strong">{money(i.paid_amount)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Section>
      <Section title="Contratos">
        {!data.contracts.length ? <Insufficient>Nenhum contrato cadastrado. Use “Novo contrato” para registrar serviço, valor mensal, início, dia de vencimento e duração.</Insufficient> : (
          <div className="table-wrap"><table className="table fin-table">
            <thead><tr><th>Cliente</th><th>Serviço</th><th className="right">Mensal</th><th>Início</th><th>Vencimento</th><th>Status</th></tr></thead>
            <tbody>{data.contracts.map((k) => <tr key={k.id}><td data-label="Cliente">{cleanName(k.client_name)}</td><td data-label="Serviço" className="muted">{k.service}</td><td data-label="Mensal" className="right tnum">{money(k.monthly_value)}</td><td data-label="Início" className="tnum">{fmtDate(k.starts_at, { year: '2-digit' })}</td><td data-label="Vencimento">dia {k.due_day}</td><td data-label="Status"><Tag tone={k.status === 'ativo' ? 'ok' : ''}>{k.status}</Tag></td></tr>)}</tbody>
          </table></div>
        )}
      </Section>
      {pay && <PayModal inv={pay} onClose={() => setPay(null)} onDone={() => { setPay(null); toast('Pagamento registrado'); reload(); }} />}
      {modal}
    </>
  );
}

// ───────────── PRODUÇÃO & REPASSES ─────────────
const REPASSE_COLS = ['Profissional', 'Demanda', 'Valor', 'Competência', 'Status', 'Fechamento', 'Motivo'];
function Producao() {
  const { data, error, loading } = useApi('/finance/production');
  return (
    <>
      <div className="section">
        <StateNotice s="aguardando_decisao" title="Produção & Repasses">
          As regras de repasse ainda não foram definidas (checklist oficial §12 e §20 — “Regras financeiras: Recebimentos, Repasses e Rentabilidade”). O CEO precisa decidir: valor por demanda ou por profissional, competência (mês de produção ou de entrega), data e forma de fechamento, e motivos de ajuste/glosa. Até lá, nenhum valor de repasse é calculado ou exibido.
        </StateNotice>
      </div>
      <Section title="Repasses" action={<StateBadge s="aguardando_decisao" />}>
        <div className="table-wrap"><table className="table fin-table fin-skeleton">
          <thead><tr>{REPASSE_COLS.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody><tr><td colSpan={REPASSE_COLS.length} className="fin-norule"><StateBadge s="dados_insuficientes" /> <span className="sm muted">nenhuma regra de repasse definida</span></td></tr></tbody>
        </table></div>
      </Section>
      <Section title="Demandas concluídas na plataforma" action={<span className="xs muted">base para repasse, sem valor</span>}>
        {loading && !data ? <Loading /> : error ? <LoadError error={error} /> : !data.people.length ? (
          <Insufficient>Nenhuma tarefa concluída na plataforma em {monthLabel(data.month)} (clientes externos). Quando a equipe concluir etapas pela plataforma, a contagem por profissional aparece aqui — sem valor em R$.</Insufficient>
        ) : (
          <>
            <p className="sm muted" style={{ margin: '0 0 var(--sp-3)' }}>Competência {monthLabel(data.month)} · {data.total} tarefa(s) concluída(s) na plataforma, clientes externos. Contagem real; sem valor até a regra de repasse ser decidida.</p>
            <div className="table-wrap"><table className="table fin-table">
              <thead><tr><th>Profissional</th><th className="right">Demandas concluídas</th><th className="right">Clientes</th><th>Valor</th></tr></thead>
              <tbody>{data.people.map((p) => (
                <tr key={p.id}><td data-label="Profissional" className="strong">{p.name}</td><td data-label="Demandas concluídas" className="right tnum">{p.n}</td><td data-label="Clientes" className="right tnum">{p.clients}</td><td data-label="Valor"><StateBadge s="aguardando_decisao" label="SEM REGRA" /></td></tr>
              ))}</tbody>
            </table></div>
          </>
        )}
      </Section>
    </>
  );
}

// ───────────── RENTABILIDADE ─────────────
function Rentabilidade() {
  const { data, error, loading } = useApi('/finance/profitability');
  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} />;
  const max = Math.max(1, ...data.evolution.map((e) => Math.max(e.faturado, e.recebido)));
  return (
    <>
      <div className="section">
        <StateNotice compact s="aguardando_decisao" title="Custos e repasses">Sem regra de custo/repasse definida. Receita e retrabalho são dados reais; a margem só será calculada quando custos e repasses tiverem regra.</StateNotice>
        <div className="mt-2"><StateNotice compact s="aguardando_decisao" title="Metas financeiras">Meta · realizado · projeção · desvio aparecem aqui quando a CEO definir as metas.</StateNotice></div>
      </div>
      <Section title={`Por cliente · ${monthLabel(data.month)}`}>
        {!data.clients.length ? <Insufficient>Nenhum cliente externo ativo.</Insufficient> : (
          <div className="table-wrap"><table className="table fin-table">
            <thead><tr><th>Cliente</th><th className="right">Receita (mês)</th><th className="right">Recebido</th><th>Custos</th><th>Repasses</th><th>Margem</th><th className="right">Retrabalho (90d)</th></tr></thead>
            <tbody>{data.clients.map((c) => (
              <tr key={c.id}>
                <td data-label="Cliente"><Link to={`/clientes/${c.id}`} className="strong">{cleanName(c.name)}</Link></td>
                <td data-label="Receita (mês)" className="right tnum">{c.invoices_n ? money(c.receita_mes) : <StateBadge s="dados_insuficientes" label="SEM PARCELAS" />}</td>
                <td data-label="Recebido" className="right tnum">{c.invoices_n ? money(c.recebido_mes) : '—'}</td>
                <td data-label="Custos"><StateBadge s="aguardando_decisao" label="SEM REGRA" /></td>
                <td data-label="Repasses"><StateBadge s="aguardando_decisao" label="SEM REGRA" /></td>
                <td data-label="Margem"><span className="muted">—</span> <StateBadge s="dados_insuficientes" /></td>
                <td data-label="Retrabalho (90d)" className="right tnum" title="Pedidos de ajuste em conteúdos criados na plataforma, últimos 90 dias">{c.retrabalho_90d}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="xs muted mt-2">Receita = parcelas com vencimento no mês (exceto canceladas) · Recebido = pagamentos registrados no mês · Retrabalho = pedidos de ajuste em conteúdos da plataforma nos últimos 90 dias. Cliente interno não entra.</p>
      </Section>
      <Section title="Evolução da receita · 6 meses">
        {!data.has_invoices ? <Insufficient>Nenhuma parcela de cliente externo cadastrada. A evolução mensal (faturado × recebido) aparece quando houver contratos e parcelas.</Insufficient> : (
          <div className="fin-evo" role="table" aria-label="Receita mensal">
            {data.evolution.map((e) => (
              <div key={e.month} className="fin-evo-row" role="row">
                <span className="xs tnum muted fin-evo-m" role="cell">{monthLabel(e.month)}</span>
                <span className="fin-evo-bars" role="cell">
                  <span className="fin-bar fat" style={{ width: `${(e.faturado / max) * 100}%` }} />
                  <span className="fin-bar rec" style={{ width: `${(e.recebido / max) * 100}%` }} />
                </span>
                <span className="xs tnum fin-evo-v" role="cell">{money(e.faturado)}<br /><span className="muted">{money(e.recebido)} rec.</span></span>
              </div>
            ))}
            <div className="xs muted mt-2"><span className="fin-key fat" /> faturado · <span className="fin-key rec" /> recebido</div>
          </div>
        )}
      </Section>
    </>
  );
}

function PayModal({ inv, onClose, onDone }) {
  const toast = useToast();
  const [amount, setAmount] = useState(inv.amount);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const submit = async () => { try { await api.post(`/finance/invoices/${inv.id}/pay`, { amount: Number(amount), paid_at: date }); onDone(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <Modal open title="Registrar pagamento" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit}>Confirmar</Button></>}>
      <p className="muted">{cleanName(inv.client_name)} — {inv.description}</p>
      <div className="grid-2 mt-4"><Field label="Valor recebido"><input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field><Field label="Data"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
    </Modal>
  );
}
function ContractModal({ clients, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ client_id: '', service: 'Gestão de conteúdo', monthly_value: '', starts_at: new Date().toISOString().slice(0, 10), due_day: 10, months: 6 });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => { try { await api.post('/finance/contracts', f); onDone(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <Modal open title="Novo contrato" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit}>Criar e gerar parcelas</Button></>}>
      <div className="col gap-4">
        <Field label="Cliente"><select className="select" value={f.client_id} onChange={set('client_id')}><option value="">Selecione…</option>{clients.map((c) => <option key={c.id} value={c.id}>{cleanName(c.name)}</option>)}</select></Field>
        <Field label="Serviço"><input className="input" value={f.service} onChange={set('service')} /></Field>
        <div className="grid-2">
          <Field label="Valor mensal (R$)"><input className="input" type="number" value={f.monthly_value} onChange={set('monthly_value')} /></Field>
          <Field label="Início"><input className="input" type="date" value={f.starts_at} onChange={set('starts_at')} /></Field>
          <Field label="Dia de vencimento"><input className="input" type="number" min="1" max="28" value={f.due_day} onChange={set('due_day')} /></Field>
          <Field label="Duração (meses)" hint="Planos de 3 ou 6 meses"><input className="input" type="number" min="1" max="24" value={f.months} onChange={set('months')} /></Field>
        </div>
      </div>
    </Modal>
  );
}
