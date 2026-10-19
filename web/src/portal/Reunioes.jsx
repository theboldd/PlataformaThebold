import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApi, useToast } from '../lib/hooks.js';
import { fmtTime, fmtDateTime, pad2 } from '../lib/format.js';
import { Button, Loading, ErrorBox, Empty, Modal } from '../components/ui.jsx';
import { usePortal } from './PortalApp.jsx';

const dayKey = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const dayLabel = (k) => { const s = new Date(`${k}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }); return s.charAt(0).toUpperCase() + s.slice(1); };

export default function Reunioes() {
  const { data, error, reload } = useApi('/portal/meetings');
  const { reloadMe } = usePortal() || {};
  const toast = useToast();
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [booked, setBooked] = useState(null);
  if (error) return <div className="p-page"><ErrorBox error={error} /></div>;
  if (!data) return <div className="p-page"><Loading rows={6} /></div>;
  const now = new Date().toISOString();
  const upcoming = data.meetings.filter((m) => m.starts_at >= now && m.status === 'agendada').sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = data.meetings.filter((m) => m.starts_at < now || m.status !== 'agendada');
  const byDay = data.slots.reduce((acc, s) => ((acc[dayKey(s.starts_at)] ||= []).push(s), acc), {});
  const book = async () => {
    setBusy(true);
    try {
      const r = await api.post('/portal/meetings/book', { slot_id: sel.id });
      setBooked(r); setSel(null); reload(); reloadMe?.();
    } catch (x) {
      toast(x.status === 409 ? `${x.message} Atualizamos os horários disponíveis.` : x.message, 'err');
      setSel(null); reload();
    } finally { setBusy(false); }
  };
  const Meet = ({ m }) => {
    const d = new Date(m.starts_at);
    return (
      <div className="p-meeting">
        <div className="date"><div className="d">{pad2(d.getDate())}</div><div className="caps">{d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</div></div>
        <div className="grow">
          <div className="ed-md" style={{ fontSize: 22 }}>{m.title.replace(/\s*\[DEMO\]/, '')}</div>
          <div className="sm muted">{fmtTime(m.starts_at)}–{fmtTime(m.ends_at)}{m.location ? ` · ${m.location}` : ''}</div>
          {m.status === 'cancelada' && <span className="tag tag-err mt-2">Cancelada</span>}
          {m.summary && m.status === 'realizada' && <p className="sm mt-2" style={{ color: 'var(--ink-2)' }}>{m.summary}</p>}
        </div>
      </div>
    );
  };
  return (
    <div className="p-page" style={{ maxWidth: 900 }}>
      <header className="p-page-head">
        <div className="caps">Sala de reuniões</div>
        <h1 className="ed-xl">Reuniões</h1>
        <p className="p-lede">Reserve o horário da sua reunião mensal. Você só vê horários realmente livres.</p>
      </header>

      {booked && (
        <div className="p-card mb-5" role="status" aria-live="polite" style={{ borderColor: 'var(--bordo-line)' }}>
          <div className="ed-lg">Reunião reservada.</div>
          <p className="sm" style={{ margin: '6px 0 0', color: 'var(--ink-2)' }}>{fmtDateTime(booked.starts_at)} · {booked.gcal_sync === 'sincronizado' ? 'O convite foi enviado pelo Google Calendar.' : 'Registrada na The Bold. A equipe envia o convite com o link da chamada.'}</p>
        </div>
      )}

      <section className="mb-5">
        <div className="section-head"><h2 className="ed-md">Próximas</h2></div>
        {upcoming.length ? upcoming.map((m) => <Meet key={m.id} m={m} />) : <Empty title="Nenhuma reunião marcada." />}
      </section>

      <section className="section">
        <div className="section-head"><h2 className="ed-md">Reservar reunião mensal</h2>{data.has_upcoming && <span className="tag">Você já tem uma reunião mensal marcada</span>}</div>
        {!Object.keys(byDay).length ? <Empty title="Sem horários abertos no momento.">Avisamos quando a próxima janela de reuniões abrir.</Empty> : Object.entries(byDay).map(([k, slots]) => (
          <div key={k} className="p-slots-day">
            <div className="sm mb-2" style={{ color: 'var(--ink-2)' }}>{dayLabel(k)}</div>
            <div className="row wrap gap-2">{slots.map((s) => <button key={s.id} className={`p-slot ${sel?.id === s.id ? 'sel' : ''}`} onClick={() => setSel(s)} aria-pressed={sel?.id === s.id}>{fmtTime(s.starts_at)}</button>)}</div>
          </div>
        ))}
      </section>

      {past.length > 0 && (
        <section className="section">
          <div className="section-head"><h2 className="ed-md">Anteriores</h2></div>
          {past.map((m) => <Meet key={m.id} m={m} />)}
        </section>
      )}

      <Modal open={!!sel} onClose={() => setSel(null)} title="Confirmar reunião">
        {sel && <>
          <p className="ed-lg">{dayLabel(dayKey(sel.starts_at))}</p>
          <p className="sm muted">{fmtTime(sel.starts_at)}–{fmtTime(sel.ends_at)} · {sel.window_label}</p>
          <p className="xs muted">Ao confirmar, o horário fica reservado para você e a equipe responsável é convidada.</p>
          <div className="row end gap-2 mt-5">
            <Button variant="ghost" onClick={() => setSel(null)}>Escolher outro</Button>
            <Button variant="primary" magnetic arrow disabled={busy} onClick={book}>{busy ? 'Reservando…' : 'Confirmar reserva'}</Button>
          </div>
        </>}
      </Modal>
    </div>
  );
}
