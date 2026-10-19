import { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/admin.css';
import { LoadError } from './admin/Guard.jsx';
import { api } from '../lib/api.js';
import { useApi, useAuth, useToast } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Button, Drawer, ErrorBox, Field, Loading, PageHead, Stat } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { fmtDate, money, cleanName } from '../lib/format.js';

const PIPE = ['lead', 'contato', 'qualificacao', 'reuniao', 'proposta', 'negociacao', 'fechado'];

export default function CRM() {
  useCrumbs('CRM');
  const { data, error, loading, reload } = useApi('/crm');
  const auth = useAuth();
  const [edit, setEdit] = useState(null);
  const [showLost, setShowLost] = useState(false);
  if (loading && !data) return <div className="page"><Loading /></div>;
  if (error) return <LoadError error={error} />;
  const open = data.deals.filter((d) => !['fechado', 'perdido', 'onboarding'].includes(d.stage));
  const total = open.reduce((s, d) => s + d.value, 0);
  const weighted = open.reduce((s, d) => s + (d.value * d.probability) / 100, 0);
  const late = open.filter((d) => d.next_action_at && new Date(d.next_action_at) < new Date()).length;
  const cols = [...PIPE.map((k) => data.stages.find((s) => s.key === k)), ...(showLost ? [data.stages.find((s) => s.key === 'onboarding'), data.stages.find((s) => s.key === 'perdido')] : [])];
  const canCreate = auth.can('crm', 'create');
  return (
    <div className="page">
      <PageHead kicker="Comercial" title="Pipeline" sub="Do primeiro contato ao onboarding. Fechar um negócio cria o cliente e inicia o onboarding automaticamente.">
        <Button variant="ghost" onClick={() => setShowLost(!showLost)}>{showLost ? 'Ocultar encerrados' : 'Ver onboarding e perdidos'}</Button>
        {canCreate && <Button variant="primary" magnetic icon={<I.plus size={15} />} onClick={() => setEdit({})}>Novo negócio</Button>}
      </PageHead>
      <div className="stats mb-5 crm-stats">
        <Stat value={open.length} label="Negócios abertos" />
        <Stat value={money(total)} label="Em negociação" hint="Valor mensal [DEMO]" />
        <Stat value={money(weighted)} label="Ponderado" hint="Por probabilidade" />
        <Stat value={late} label="Follow-ups vencidos" alert={late > 0} hint="Viram tarefa automaticamente" />
      </div>
      <div className="pipe mt-6">
        {cols.map((st) => {
          const deals = data.deals.filter((d) => d.stage === st.key);
          return (
            <section key={st.key} className={`pipe-col ${st.key === 'fechado' || st.key === 'onboarding' ? 'closed' : st.key === 'perdido' ? 'lost' : ''}`} aria-label={st.label}>
              <div className="head"><span className="caps" style={{ color: 'var(--ink)' }}>{st.label}</span><span className="n">{String(deals.length).padStart(2, '0')}</span></div>
              <div className="xs faint mb-2">{money(deals.reduce((s, d) => s + d.value, 0))} · {st.p}%</div>
              {deals.map((d) => {
                const isLate = d.next_action_at && new Date(d.next_action_at) < new Date() && !['fechado', 'perdido', 'onboarding'].includes(d.stage);
                return (
                  <button key={d.id} className="deal" onClick={() => setEdit(d)} data-cursor="ABRIR">
                    <div className="val">{money(d.value)}</div>
                    <div className="name">{cleanName(d.company || d.name)}</div>
                    <div className="xs muted">{d.owner_name || '—'} · {d.origin || 'origem —'}</div>
                    <div className="prob" aria-label={`Probabilidade ${d.probability}%`}><span style={{ width: `${d.probability}%` }} /></div>
                    {d.client_id && <div className="xs mt-2"><Link to={`/clientes/${d.client_id}`} className="bordo" onClick={(e) => e.stopPropagation()}>Cliente criado → ficha</Link></div>}
                    {d.next_action && !['fechado', 'onboarding', 'perdido'].includes(d.stage) && <div className={`next ${isLate ? 'late' : ''}`}>{isLate ? '● ' : '→ '}{d.next_action}<br /><span className="faint">{fmtDate(d.next_action_at)}</span></div>}
                    {d.stage === 'perdido' && d.lost_reason && <div className="next">Motivo: {d.lost_reason}</div>}
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>
      {edit && <DealDrawer deal={edit} stages={data.stages} people={data.people} canEdit={auth.can('crm', 'edit')} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

function DealDrawer({ deal, stages, people, canEdit, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !deal.id;
  const [f, setF] = useState({ name: deal.name || '', company: deal.company || '', contact_name: deal.contact_name || '', contact_channel: deal.contact_channel || '', origin: deal.origin || '', owner_id: deal.owner_id || '', value: deal.value || '', service: deal.service || 'Gestão de conteúdo', stage: deal.stage || 'lead', next_action: deal.next_action || '', next_action_at: deal.next_action_at ? deal.next_action_at.slice(0, 16) : '', lost_reason: deal.lost_reason || '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (extra = {}) => {
    setBusy(true);
    try {
      const body = { ...f, ...extra, value: Number(f.value) || 0, next_action_at: f.next_action_at || null, owner_id: f.owner_id || undefined };
      if (isNew) { await api.post('/crm', body); toast('Negócio criado'); }
      else {
        const r = await api.patch(`/crm/${deal.id}`, { ...body, last_interaction_at: new Date().toISOString() });
        toast(r.client_id ? 'Negócio fechado — cliente criado e onboarding iniciado' : 'Negócio atualizado');
      }
      onSaved();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const idx = stages.findIndex((s) => s.key === f.stage);
  const next = stages[idx + 1];
  return (
    <Drawer open title={isNew ? 'Novo negócio' : cleanName(deal.company || deal.name)} kicker={isNew ? 'CRM' : stages[idx]?.label} onClose={onClose}>
      {!isNew && canEdit && !['fechado', 'onboarding', 'perdido'].includes(deal.stage) && next && (
        <div className="panel mb-5 row between wrap">
          <div><div className="caps">Próxima etapa</div><div className="ed-md">{next.label}</div>{next.key === 'fechado' && <div className="xs muted">Cria o cliente e inicia o onboarding automaticamente.</div>}</div>
          <Button variant="primary" magnetic arrow disabled={busy} onClick={() => save({ stage: next.key })}>Avançar</Button>
        </div>
      )}
      <fieldset disabled={!canEdit && !isNew} style={{ border: 0, padding: 0, margin: 0 }} className="col gap-4">
        <div className="grid-2">
          <Field label="Negócio"><input className="input" value={f.name} onChange={set('name')} required /></Field>
          <Field label="Empresa"><input className="input" value={f.company} onChange={set('company')} /></Field>
          <Field label="Contato"><input className="input" value={f.contact_name} onChange={set('contact_name')} /></Field>
          <Field label="Canal do contato"><input className="input" value={f.contact_channel} onChange={set('contact_channel')} placeholder="WhatsApp, e-mail…" /></Field>
          <Field label="Origem"><input className="input" value={f.origin} onChange={set('origin')} placeholder="Indicação, Instagram…" /></Field>
          <Field label="Responsável"><select className="select" value={f.owner_id} onChange={set('owner_id')}><option value="">Eu</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Valor mensal (R$)"><input className="input" type="number" min="0" value={f.value} onChange={set('value')} /></Field>
          <Field label="Serviço"><input className="input" value={f.service} onChange={set('service')} /></Field>
        </div>
        <Field label="Etapa"><select className="select" value={f.stage} onChange={set('stage')}>{stages.map((s) => <option key={s.key} value={s.key}>{s.label} · {s.p}%</option>)}</select></Field>
        {f.stage === 'perdido' && <Field label="Motivo da perda"><input className="input" value={f.lost_reason} onChange={set('lost_reason')} /></Field>}
        <div className="grid-2">
          <Field label="Próxima ação"><input className="input" value={f.next_action} onChange={set('next_action')} /></Field>
          <Field label="Quando" hint="Vencida → vira tarefa de follow-up"><input className="input" type="datetime-local" value={f.next_action_at} onChange={set('next_action_at')} /></Field>
        </div>
      </fieldset>
      {(canEdit || isNew) && <div className="row end mt-6"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="ink" disabled={busy || !f.name.trim()} onClick={() => save()}>{isNew ? 'Criar' : 'Salvar'}</Button></div>}
    </Drawer>
  );
}
