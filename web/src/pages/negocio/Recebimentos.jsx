// RECEBIMENTOS — o que a The Bold recebe dos clientes: indicadores, calendário, parcelas com status, cobrança por cliente e histórico.
// Sem integração bancária: pagamento é confirmado à mão (quem, quando, valor). Cobrança por e-mail só com Resend e e-mail do cliente.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useApi, useAuth, useToast } from '../../lib/hooks.js';
import { useUrlState } from '../../lib/nav.jsx';
import { Button, Empty, ErrorBox, Field, Loading, Modal, Section, Seg, Tag } from '../../components/ui.jsx';
import { StateTag, StatePanel } from '../../components/State.jsx';
import { I } from '../../components/Icons.jsx';
import { fmtDate, fmtDateTime, money, cleanName } from '../../lib/format.js';

const TONE = { a_vencer: '', lembrete_enviado: 'info', vencendo_hoje: 'warn', pagamento_confirmado: 'ok', pagamento_atrasado: 'err', cobranca_enviada: 'err', em_negociacao: 'info', cancelado: '' };
const EV = { lembrete_d1: 'Lembrete D-1', cobranca_d0: 'Cobrança no dia', cobranca_pos: 'Cobrança após vencimento', pagamento_confirmado: 'Pagamento confirmado', em_negociacao: 'Em negociação', cancelada: 'Parcela cancelada', nao_identificado: 'Pagamento não identificado', reenvio_manual: 'Reenvio manual' };
const EVS = { enviado: ['Enviado', 'ok'], nao_enviado: ['Não enviado', 'warn'], falhou: ['Falhou', 'err'], registrado: ['Registrado', ''] };

export default function Recebimentos() {
  const { data, error, loading, reload } = useApi('/negocio/recebimentos');
  const auth = useAuth();
  const toast = useToast();
  const [view, setView] = useUrlState('ver', 'parcelas');
  const [filter, setFilter] = useUrlState('status', 'todas');
  const [client, setClient] = useUrlState('cliente', '');
  const [modal, setModal] = useState(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const I_ = data.indicators;
  const edit = auth.can('financeiro', 'edit');
  const none = !data.invoices.length;
  const shown = data.invoices.filter((i) => (filter === 'todas' || (filter === 'abertas' ? !['pagamento_confirmado', 'cancelado'].includes(i.display) : i.display === filter)) && (!client || i.client_id === client)).slice().reverse();
  const act = async (i, action, body) => { try { await api.post(`/negocio/parcelas/${i.id}/${action}`, body); toast('Registrado no histórico.'); reload(); } catch (e) { toast(e.message, 'err'); } };
  const routine = async () => { try { const r = await api.post('/negocio/recebimentos/rotina'); toast(`Rotina executada: ${r.lembrete_d1} lembrete(s), ${r.cobranca_d0} cobrança(s) do dia, ${r.cobranca_pos} após vencimento.`); reload(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <div>
      <div className="row wrap gap-3 mb-4" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="row wrap gap-2" style={{ alignItems: 'center' }}>
          <StateTag s={none ? 'dados_insuficientes' : 'ativo'}>{none ? 'Dados insuficientes · nenhum contrato cadastrado' : 'Recebimentos ativos'}</StateTag>
          <StateTag s={data.mail ? 'conectada' : 'aguardando_configuracao'}>{data.mail ? 'E-mail de cobrança ativo' : 'E-mail de cobrança · aguardando configuração (Resend)'}</StateTag>
          <StateTag s={data.config['fin.cobrancas_pos_vencimento'] ? 'ativo' : 'aguardando_decisao'}>{data.config['fin.cobrancas_pos_vencimento'] ? `${data.config['fin.cobrancas_pos_vencimento']} cobrança(s) após vencimento` : 'Cobranças após vencimento · aguardando decisão'}</StateTag>
        </div>
        <div className="row wrap gap-2">
          {auth.can('financeiro', 'admin') && <Button size="sm" variant="ghost" onClick={routine} title="Roda agora a rotina diária (lembrete D-1, cobrança no dia, após vencimento)">Rodar rotina de cobrança</Button>}
          {auth.can('financeiro', 'create') && <Button variant="primary" icon={<I.plus size={15} />} onClick={() => setModal({ kind: 'contrato' })}>Novo contrato</Button>}
        </div>
      </div>

      <div className="fin-grid">
        {[['Receber hoje', I_.receber_hoje], ['A receber', I_.a_receber], ['Atrasados', I_.atrasados], ['Recebidos no mês', I_.recebidos_mes], ['Total recebido', I_.total_recebido], ['Total em aberto', I_.total_aberto]].map(([l, v], i) => (
          <div key={l}><div className="caps">{l}</div><div className={`fin-num tnum mt-2 ${i === 2 && v > 0 ? 'bordo' : ''}`}>{none ? <StateTag s="dados_insuficientes" /> : money(v)}</div></div>
        ))}
      </div>

      <div className="mt-5"><Seg value={view} onChange={setView} options={[{ value: 'parcelas', label: 'Parcelas' }, { value: 'calendario', label: 'Calendário' }, { value: 'clientes', label: 'Cobrança por cliente' }, { value: 'historico', label: 'Histórico de cobranças' }]} /></div>

      {view === 'parcelas' && (
        <Section title="Parcelas" action={<div className="row wrap gap-2">
          <select className="select" style={{ width: 220, minHeight: 34, padding: '4px 10px' }} value={client} onChange={(e) => setClient(e.target.value)} aria-label="Filtrar cliente"><option value="">Todos os clientes</option>{data.clients.map((c) => <option key={c.id} value={c.id}>{cleanName(c.name)}</option>)}</select>
          <select className="select" style={{ width: 220, minHeight: 34, padding: '4px 10px' }} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar status"><option value="todas">Todos os status</option><option value="abertas">Em aberto</option>{Object.entries(data.status).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>}>
          {!shown.length ? <Empty title={none ? 'Nenhuma parcela cadastrada.' : 'Nenhuma parcela neste filtro.'}>{none && 'Crie um contrato: as parcelas são geradas com o dia de vencimento do cliente.'}</Empty> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Vencimento</th><th>Cliente</th><th>Referência</th><th className="right">Valor</th><th>Status</th><th>Pagamento</th><th /></tr></thead>
              <tbody>{shown.map((i) => (
                <tr key={i.id}>
                  <td className="tnum">{fmtDate(i.due_at, { year: '2-digit' })}</td><td>{cleanName(i.client_name)}</td><td className="muted">{i.description}</td>
                  <td className="right tnum">{money(i.amount)}</td><td><Tag tone={TONE[i.display]}>{data.status[i.display]}</Tag></td>
                  <td className="xs muted">{i.paid_at ? `${fmtDate(i.paid_at)} · ${money(i.paid_amount)}` : '—'}</td>
                  <td className="right">{edit && !['pagamento_confirmado', 'cancelado'].includes(i.display) && (
                    <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
                      <Button size="sm" onClick={() => setModal({ kind: 'pagar', inv: i })}>Marcar como pago</Button>
                      <Button size="sm" variant="ghost" onClick={() => act(i, 'reenviar')} title="Envia agora o e-mail de cobrança (ou registra por que não foi enviado)">Reenviar cobrança</Button>
                      {i.display !== 'em_negociacao' && <Button size="sm" variant="ghost" onClick={() => act(i, 'negociacao')}>Em negociação</Button>}
                      <Button size="sm" variant="ghost" onClick={() => setModal({ kind: 'cancelar', inv: i })}>Cancelar</Button>
                    </div>
                  )}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Section>
      )}

      {view === 'calendario' && (
        <Section title="Calendário de recebimentos" kicker="Próximos 45 dias">
          {!data.calendar.length ? <StatePanel compact s="dados_insuficientes" title="Nenhum pagamento previsto nos próximos 45 dias." /> : (
            <ul className="list">{data.calendar.map((d) => (
              <li key={d.day} style={{ alignItems: 'flex-start' }}>
                <span className="tnum strong" style={{ width: 90 }}>{fmtDate(d.day + 'T15:00:00Z')}</span>
                <span className="grow">{d.items.map((x) => <div key={x.id} className="sm"><Link to={`/clientes/${x.client_id}`}>{cleanName(x.client)}</Link> <span className="faint">· {x.description}</span> <span className="tnum">{money(x.amount)}</span></div>)}</span>
                <span className="tnum strong">{money(d.total)}</span>
              </li>
            ))}</ul>
          )}
        </Section>
      )}

      {view === 'clientes' && (
        <Section title="Cobrança por cliente" kicker="E-mail de cobrança, dia de pagamento e recorrência">
          <p className="sm muted" style={{ margin: '0 0 12px' }}>Sem e-mail de cobrança, nenhum lembrete é enviado — e o histórico mostra o motivo. O e-mail é cadastrado aqui, por quem tem permissão; nada é presumido.</p>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Cliente</th><th>E-mail de cobrança</th><th>Dia</th><th>Recorrência</th><th>Cobrança</th><th /></tr></thead>
            <tbody>{data.clients.map((c) => { const b = data.billing[c.id]; return (
              <tr key={c.id}><td className="strong">{cleanName(c.name)}</td><td className="sm">{b?.billing_email || <span className="faint">não cadastrado</span>}</td><td className="sm">{b?.due_day ? `dia ${b.due_day}` : '—'}</td><td className="sm">{b?.recurrence || '—'}</td>
                <td>{b ? <Tag tone={b.status === 'ativo' ? 'ok' : ''}>{b.status === 'ativo' ? 'Ativa' : 'Pausada'}</Tag> : <StateTag s="aguardando_configuracao">Não configurada</StateTag>}</td>
                <td className="right">{edit && <Button size="sm" variant="ghost" onClick={() => setModal({ kind: 'cliente', c, b })}>Configurar</Button>}</td></tr>
            ); })}</tbody>
          </table></div>
        </Section>
      )}

      {view === 'historico' && (
        <Section title="Histórico de cobranças" kicker="Cada lembrete, cobrança, envio, falha e confirmação">
          {!data.events.length ? <StatePanel compact s="dados_insuficientes" title="Nenhuma cobrança registrada ainda." /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Quando</th><th>Cliente</th><th>Evento</th><th>Para</th><th>Status</th><th>Detalhe</th></tr></thead>
              <tbody>{data.events.map((e) => <tr key={e.id}><td className="xs tnum">{fmtDateTime(e.created_at)}</td><td className="sm">{cleanName(e.client || '—')}</td><td className="sm">{EV[e.kind] || e.kind}</td><td className="xs">{e.to_email || '—'}</td><td><Tag tone={EVS[e.status]?.[1]}>{EVS[e.status]?.[0] || e.status}</Tag></td><td className="xs muted">{e.error || e.subject || e.note || ''}</td></tr>)}</tbody>
            </table></div>
          )}
        </Section>
      )}

      {modal?.kind === 'pagar' && <PayModal inv={modal.inv} onClose={() => setModal(null)} onDone={() => { setModal(null); toast('Pagamento confirmado e registrado.'); reload(); }} />}
      {modal?.kind === 'cancelar' && <CancelModal inv={modal.inv} onClose={() => setModal(null)} onDone={() => { setModal(null); toast('Parcela cancelada.'); reload(); }} />}
      {modal?.kind === 'cliente' && <BillingModal c={modal.c} b={modal.b} onClose={() => setModal(null)} onDone={() => { setModal(null); toast('Cobrança do cliente salva.'); reload(); }} />}
      {modal?.kind === 'contrato' && <ContractModal clients={data.clients} onClose={() => setModal(null)} onDone={() => { setModal(null); toast('Contrato criado com as parcelas.'); reload(); }} />}
    </div>
  );
}

function PayModal({ inv, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ amount: inv.amount, paid_at: new Date().toISOString().slice(0, 10), competencia: inv.due_at.slice(0, 7), note: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => { try { await api.post(`/negocio/parcelas/${inv.id}/pagar`, { ...f, amount: Number(f.amount) }); onDone(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <Modal open title="Marcar como pago" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit}>Confirmar pagamento</Button></>}>
      <p className="muted">{cleanName(inv.client_name)} — {inv.description}</p>
      <p className="xs muted">Confirmação manual: fica registrado quem confirmou, quando, o valor e a competência. Nada é confirmado automaticamente.</p>
      <div className="grid-2 mt-4">
        <Field label="Valor recebido"><input className="input" type="number" value={f.amount} onChange={set('amount')} /></Field>
        <Field label="Data do pagamento"><input className="input" type="date" value={f.paid_at} onChange={set('paid_at')} /></Field>
        <Field label="Competência"><input className="input" type="month" value={f.competencia} onChange={set('competencia')} /></Field>
        <Field label="Observação"><input className="input" value={f.note} onChange={set('note')} /></Field>
      </div>
    </Modal>
  );
}
function CancelModal({ inv, onClose, onDone }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const submit = async () => { try { await api.post(`/negocio/parcelas/${inv.id}/cancelar`, { note }); onDone(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <Modal open title="Cancelar parcela" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Voltar</Button><Button variant="danger" onClick={submit} disabled={!note.trim()}>Cancelar parcela</Button></>}>
      <p className="muted">{cleanName(inv.client_name)} — {inv.description} · {money(inv.amount)}</p>
      <Field label="Motivo (obrigatório)"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}
function BillingModal({ c, b, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ billing_email: b?.billing_email || '', due_day: b?.due_day || '', recurrence: b?.recurrence || 'mensal', status: b?.status || 'ativo', notes: b?.notes || '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => { try { await api.put(`/negocio/clientes/${c.id}/cobranca`, f); onDone(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <Modal open title={`Cobrança · ${cleanName(c.name)}`} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit}>Salvar</Button></>}>
      <div className="col gap-4">
        <Field label="E-mail de cobrança" hint="Informado pelo cliente ou pelo contrato. Não é preenchido automaticamente."><input className="input" type="email" value={f.billing_email} onChange={set('billing_email')} /></Field>
        <div className="grid-2">
          <Field label="Dia de pagamento"><input className="input" type="number" min="1" max="28" value={f.due_day} onChange={set('due_day')} /></Field>
          <Field label="Recorrência"><select className="select" value={f.recurrence} onChange={set('recurrence')}><option value="mensal">Mensal</option><option value="trimestral">Trimestral</option><option value="semestral">Semestral</option><option value="avulsa">Avulsa</option></select></Field>
          <Field label="Cobrança automática"><select className="select" value={f.status} onChange={set('status')}><option value="ativo">Ativa</option><option value="pausado">Pausada</option></select></Field>
        </div>
        <Field label="Observações"><textarea className="textarea" value={f.notes} onChange={set('notes')} /></Field>
      </div>
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
