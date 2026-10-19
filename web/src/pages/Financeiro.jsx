import { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/admin.css';
import { LoadError } from './admin/Guard.jsx';
import { api } from '../lib/api.js';
import { useApi, useAuth, useToast } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Button, Empty, ErrorBox, Field, Loading, Modal, PageHead, Section, Seg, Tag } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { fmtDate, money, cleanName } from '../lib/format.js';
import { useUrlState } from '../lib/nav.jsx';

const INV = { aberta: ['Em aberto', 'info'], paga: ['Paga', 'ok'], atrasada: ['Atrasada', 'err'], cancelada: ['Cancelada', ''] };

export default function Financeiro() {
  useCrumbs('Financeiro');
  const { data, error, loading, reload } = useApi('/finance');
  const auth = useAuth();
  const toast = useToast();
  const [filter, setFilter] = useUrlState('status', 'todas');
  const [client, setClient] = useUrlState('cliente', '');
  const [pay, setPay] = useState(null);
  const [newContract, setNewContract] = useState(false);
  if (loading && !data) return <div className="page"><Loading /></div>;
  if (error) return <LoadError error={error} />;
  const s = data.summary;
  const invoices = data.invoices.filter((i) => (filter === 'todas' || i.status === filter) && (!client || i.client_id === client));
  const debtors = Object.values(data.overdue.reduce((acc, i) => { (acc[i.client_id] ||= { id: i.client_id, name: i.client_name, total: 0, n: 0, since: i.due_at }).total += i.amount; acc[i.client_id].n++; return acc; }, {}));
  return (
    <div className="page">
      <PageHead kicker="Acesso restrito" title="Financeiro" sub="Contratos, parcelas e recebimentos.">
        {auth.can('financeiro', 'create') && <Button variant="primary" icon={<I.plus size={15} />} onClick={() => setNewContract(true)}>Novo contrato</Button>}
      </PageHead>
      <div className="fin-grid">
        {[['Receita recorrente', s.receita_recorrente, 'contratos ativos / mês'], ['Faturado no mês', s.faturado_mes, 'vencimentos do mês'], ['Recebido no mês', s.recebido_mes, 'pagamentos registrados'], ['Pendente', s.pendente, 'em aberto'], ['Atrasado', s.atrasado, `${debtors.length} cliente(s)`]].map(([l, v, h], i) => (
          <div key={l}><div className="caps">{l}</div><div className={`fin-num tnum mt-2 ${i === 4 && v > 0 ? 'bordo' : ''}`}>{money(v)}</div><div className="xs muted mt-2">{h}</div></div>
        ))}
      </div>
      <div className="grid-2 section">
        <div>
          <div className="section-head"><h2 className="ed-md">Próximos vencimentos</h2></div>
          {!data.upcoming.length ? <Empty title="Nada a vencer." /> : (
            <ul className="list">{data.upcoming.slice(0, 8).map((i) => (
              <li key={i.id}><span className="xs tnum muted" style={{ width: 64 }}>{fmtDate(i.due_at)}</span><span className="grow clip">{cleanName(i.client_name)} <span className="faint">· {i.description}</span></span><span className="tnum">{money(i.amount)}</span></li>
            ))}</ul>
          )}
        </div>
        <div>
          <div className="section-head"><h2 className="ed-md">Inadimplência</h2><span className="xs muted">regra automática: alerta no vencimento</span></div>
          {!debtors.length ? <Empty title="Nenhum atraso." /> : (
            <ul className="list">{debtors.map((d) => (
              <li key={d.id}><span className="grow"><Link to={`/clientes/${d.id}`} className="strong">{cleanName(d.name)}</Link><div className="xs muted">{d.n} parcela(s) desde {fmtDate(d.since)}</div></span><span className="tnum bordo strong">{money(d.total)}</span></li>
            ))}</ul>
          )}
        </div>
      </div>
      <Section title="Parcelas" action={<div className="row wrap"><select className="select" style={{ width: 220, minHeight: 34, padding: '4px 10px' }} value={client} onChange={(e) => setClient(e.target.value)} aria-label="Filtrar cliente"><option value="">Todos os clientes</option>{data.clients.map((c) => <option key={c.id} value={c.id}>{cleanName(c.name)}</option>)}</select><Seg value={filter} onChange={setFilter} options={[{ value: 'todas', label: 'Todas' }, { value: 'aberta', label: 'Em aberto' }, { value: 'atrasada', label: 'Atrasadas' }, { value: 'paga', label: 'Pagas' }]} /></div>}>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Vencimento</th><th>Cliente</th><th>Descrição</th><th className="right">Valor</th><th>Status</th><th>Pagamento</th><th /></tr></thead>
          <tbody>{invoices.map((i) => (
            <tr key={i.id}>
              <td className="tnum">{fmtDate(i.due_at, { year: '2-digit' })}</td><td>{cleanName(i.client_name)}</td><td className="muted">{i.description}</td>
              <td className="right tnum">{money(i.amount)}</td><td><Tag tone={INV[i.status]?.[1]}>{INV[i.status]?.[0] || i.status}</Tag></td>
              <td className="xs muted">{i.paid_at ? `${fmtDate(i.paid_at)} · ${money(i.paid_amount)}` : '—'}</td>
              <td className="right">{i.status !== 'paga' && auth.can('financeiro', 'edit') && <Button size="sm" onClick={() => setPay(i)}>Registrar pagamento</Button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
        {!invoices.length && <Empty title="Nenhuma parcela neste filtro." />}
      </Section>
      <Section title="Contratos">
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Cliente</th><th>Serviço</th><th className="right">Mensal</th><th>Início</th><th>Vencimento</th><th>Status</th></tr></thead>
          <tbody>{data.contracts.map((k) => <tr key={k.id}><td>{cleanName(k.client_name)}</td><td className="muted">{k.service}</td><td className="right tnum">{money(k.monthly_value)}</td><td className="tnum">{fmtDate(k.starts_at, { year: '2-digit' })}</td><td>dia {k.due_day}</td><td><Tag tone={k.status === 'ativo' ? 'ok' : ''}>{k.status}</Tag></td></tr>)}</tbody>
        </table></div>
      </Section>
      {pay && <PayModal inv={pay} onClose={() => setPay(null)} onDone={() => { setPay(null); toast('Pagamento registrado'); reload(); }} />}
      {newContract && <ContractModal clients={data.clients} onClose={() => setNewContract(false)} onDone={() => { setNewContract(false); toast('Contrato criado com as parcelas'); reload(); }} />}
    </div>
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
