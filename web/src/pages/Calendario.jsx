import { useMemo, useState } from 'react';
import { StateBadge, StateNotice } from '../components/State.jsx';
import { Link, useNavigate } from 'react-router-dom';
import { useApi, useToast } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { StateTag } from '../components/State.jsx';
import { useCrumbs } from '../components/Shell.jsx';
import { Button, Seg, Loading, Empty, ErrorBox, Tag, Modal, Field } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { fmtTime, cleanName } from '../lib/format.js';
import { STATUS, STATUS_GLYPH, FORMATS } from '../lib/status.js';
import '../styles/intel.css';
import { useUrlState } from '../lib/nav.jsx';

const TZ = 'America/Sao_Paulo';
const key = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
const addDays = (k, n) => { const d = new Date(`${k}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (k) => (new Date(`${k}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = segunda
const TYPES = [{ value: 'conteudo', label: 'Conteúdos', g: '◆' }, { value: 'prazo', label: 'Prazos', g: '◷' }, { value: 'reuniao', label: 'Reuniões', g: '▶' }, { value: 'ciclo', label: 'Ciclo', g: '▬' }, { value: 'evento', label: 'Eventos', g: '✦' }, { value: 'google', label: 'Google', g: 'G' }];
const GLYPH = Object.fromEntries(TYPES.map((t) => [t.value, t.g]));
const DOW = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

export default function Calendario() {
  useCrumbs('Calendário');
  const nav = useNavigate();
  const today = key(new Date());
  const [view, setView] = useUrlState('ver', window.innerWidth < 720 ? 'agenda' : 'mes');
  const [anchor, setAnchor] = useUrlState('data', today);
  const [client, setClient] = useUrlState('cliente', '');
  const [mine, setMine] = useUrlState('meus', false);
  const [types, setTypes] = useState(TYPES.map((t) => t.value));
  const { data: clients } = useApi('/clients', [], { live: false });

  const range = useMemo(() => {
    if (view === 'mes') { const first = `${anchor.slice(0, 8)}01`; const s = addDays(first, -dow(first)); return [s, addDays(s, 41)]; }
    if (view === 'semana') { const s = addDays(anchor, -dow(anchor)); return [s, addDays(s, 6)]; }
    if (view === 'dia') return [anchor, anchor];
    return [anchor, addDays(anchor, 34)];
  }, [view, anchor]);
  const qs = new URLSearchParams({ start: new Date(`${range[0]}T00:00:00-03:00`).toISOString(), end: new Date(`${range[1]}T23:59:59-03:00`).toISOString(), ...(client ? { client_id: client } : {}), ...(mine ? { mine: '1' } : {}) });
  const { data, error, loading, reload } = useApi(`/calendar?${qs}`, [qs.toString()]);
  const opts = useApi('/agenda/opcoes', [], { live: false });
  const [novo, setNovo] = useState(false);
  const [sel, setSel] = useState(null);

  const byDay = useMemo(() => {
    const m = {};
    for (const it of (data?.items || []).filter((x) => types.includes(x.type === 'ciclo' ? 'ciclo' : x.type))) {
      const isBand = it.type === 'ciclo' && it.end;
      if (isBand || (it.all_day && it.end)) {
        const s = it.start.slice(0, 10), e = (it.end || it.start).slice(0, 10);
        for (let k = s, i = 0; k <= e && i < 40; k = addDays(k, 1), i++) (m[k] ||= []).push({ ...it, band: true, first: k === s || dow(k) === 0, last: k === e });
      } else (m[it.all_day ? it.start.slice(0, 10) : key(it.start)] ||= []).push(it);
    }
    for (const k in m) m[k].sort((a, b) => (b.band ? 1 : 0) - (a.band ? 1 : 0) || String(a.start).localeCompare(String(b.start)));
    return m;
  }, [data, types]);

  const step = (n) => setAnchor(view === 'mes' ? (() => { const [y, mo] = anchor.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return d.toISOString().slice(0, 10); })() : addDays(anchor, n * (view === 'semana' ? 7 : view === 'dia' ? 1 : 35)));
  const title = view === 'mes' ? new Date(`${anchor.slice(0, 8)}15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    : view === 'dia' ? new Date(`${anchor}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC' })
    : `${new Date(`${range[0]}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' })} — ${new Date(`${range[1]}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' })}`;
  const titleCap = title.charAt(0).toUpperCase() + title.slice(1);
  const open = (it) => { if (it.event_id) { setSel(it); return; } if (!it.link) return; if (it.external) window.open(it.link, '_blank', 'noopener'); else nav(it.link); };
  const g = data?.google;

  return (
    <div className="page">
      <div className="cal-bar">
        <div>
          <div className="caps mb-2">Calendário operacional</div>
          <div className="row gap-4 wrap"><h1 className="cal-title" style={{ margin: 0 }}>{titleCap}</h1>
            <div className="row gap-2"><Button size="sm" icon={<I.left size={14} />} onClick={() => step(-1)} aria-label="Anterior" /><Button size="sm" onClick={() => setAnchor(today)}>Hoje</Button><Button size="sm" icon={<I.right size={14} />} onClick={() => step(1)} aria-label="Próximo" /></div>
          </div>
        </div>
        <div className="col" style={{ alignItems: 'flex-end', gap: 10 }}>
          {opts.data?.can_create ? <Button variant="primary" icon={<I.plus size={15} />} onClick={() => setNovo(true)}>Novo evento, compromisso ou tarefa</Button>
            : opts.data && <span className="xs muted">Somente visualização · criar eventos é liberado pela CEO</span>}
          <Seg options={[{ value: 'mes', label: 'Mês' }, { value: 'semana', label: 'Semana' }, { value: 'dia', label: 'Dia' }, { value: 'agenda', label: 'Agenda' }]} value={view} onChange={setView} label="Visualização" />
          <span className="gstatus">
            {g?.status === 'conectado' ? <Tag tone="ok">Google Calendar conectado · {g.items} eventos</Tag>
              : g?.status === 'erro' ? <Tag tone="err">Google Calendar com erro: {g.error}</Tag>
              : <StateBadge s="aguardando_conexao" label="Google Calendar · aguardando conexão" />}
          </span>
        </div>
      </div>
      {g && g.status !== 'conectado' && (
        <div className="mb-4"><StateNotice s={g.status === 'erro' ? 'erro' : 'aguardando_conexao'} title="Google Calendar" action="Configurar em Integrações" to="/integracoes" compact>
          {g.status === 'erro' ? `A conexão falhou: ${g.error}.` : 'O calendário abaixo já mostra conteúdos, prazos, ciclos e reuniões da plataforma. Os compromissos da sua agenda Google entram aqui quando a conexão for feita.'}
        </StateNotice></div>
      )}
      <div className="row wrap between mb-5">
        <div className="row wrap gap-2">
          <select className="select" style={{ maxWidth: 240, minHeight: 34, padding: '6px 10px' }} value={client} onChange={(e) => setClient(e.target.value)} aria-label="Cliente"><option value="">Todos os clientes</option>{(clients || []).map((c) => <option key={c.id} value={c.id}>{cleanName(c.name)}</option>)}</select>
          <label className="check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Só meus prazos</label>
        </div>
        <div className="legend">{TYPES.map((t) => (
          <label key={t.value} className="check" style={{ fontSize: 12 }}><input type="checkbox" checked={types.includes(t.value)} onChange={(e) => setTypes(e.target.checked ? [...types, t.value] : types.filter((x) => x !== t.value))} /><span className={`ev t-${t.value}`} style={{ width: 'auto', padding: '0 4px' }}><span className="g">{t.g}</span></span>{t.label}</label>
        ))}</div>
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading rows={6} /> : (
        view === 'mes' ? <Month range={range} anchor={anchor} today={today} byDay={byDay} open={open} onDay={(k) => { setAnchor(k); setView('dia'); }} />
          : view === 'semana' ? <Week range={range} today={today} byDay={byDay} open={open} />
          : <Agenda range={range} byDay={byDay} open={open} single={view === 'dia'} />
      )}
      {novo && <NewAgendaItem opts={opts.data} anchor={anchor} onClose={() => setNovo(false)} onDone={() => { setNovo(false); reload(); }} />}
      {sel && <EventDetail it={sel} onClose={() => setSel(null)} onDone={() => { setSel(null); reload(); }} />}
    </div>
  );
}

function Ev({ it, open, wide }) {
  if (it.band) return <div className={`band ${it.first ? '' : 'cont'}`} title={it.title}>{it.first ? it.title : '·'}</div>;
  const glyph = it.type === 'conteudo' ? (STATUS_GLYPH[it.status] || GLYPH.conteudo) : GLYPH[it.type] || '•';
  const label = it.type === 'conteudo' ? `${FORMATS[it.format] || ''} · ${cleanName(it.title)}` : it.type === 'reuniao' || it.type === 'google' ? `${fmtTime(it.start)} ${it.title}` : cleanName(it.title);
  return (
    <button className={`ev t-${it.type} ${it.overdue ? 'overdue' : ''}`} onClick={() => open(it)} title={`${it.title}${it.status ? ` — ${STATUS[it.status]}` : ''}${it.stage ? ` (${it.stage})` : ''}${it.assignee ? ` · ${it.assignee}` : ''}`} data-cursor={it.link ? 'ABRIR' : undefined}>
      <span className="g" aria-hidden>{glyph}</span><span className="tx">{label}{wide && it.type === 'conteudo' && it.status ? ` — ${STATUS[it.status]}` : ''}{wide && it.assignee ? ` · ${it.assignee}` : ''}</span>
    </button>
  );
}

function Month({ range, anchor, today, byDay, open, onDay }) {
  const days = Array.from({ length: 42 }, (_, i) => addDays(range[0], i));
  return (
    <div className="cal-month" role="grid">
      {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
      {days.map((k) => {
        const items = byDay[k] || [];
        const out = k.slice(0, 7) !== anchor.slice(0, 7);
        return (
          <div key={k} className={`cal-day ${out ? 'out' : ''} ${k === today ? 'today' : ''}`} role="gridcell">
            <button className="dn" onClick={() => onDay(k)} aria-label={`Abrir dia ${k}`}>{Number(k.slice(8))}</button>
            <div className="evs">{items.slice(0, 5).map((it, i) => <Ev key={it.id + i} it={it} open={open} />)}</div>
            {items.length > 5 && <button className="more" onClick={() => onDay(k)}>+{items.length - 5} itens</button>}
          </div>
        );
      })}
    </div>
  );
}

function Week({ range, today, byDay, open }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(range[0], i));
  return (
    <div className="cal-week">
      {days.map((k, i) => (
        <div key={k} style={k === today ? { background: 'var(--bordo-soft)' } : null}>
          <div className="caps">{DOW[i]}</div><div className="ed" style={{ fontSize: 34, lineHeight: 1, marginBottom: 10 }}>{Number(k.slice(8))}</div>
          <div className="col gap-1">{(byDay[k] || []).map((it, j) => <Ev key={it.id + j} it={it} open={open} wide />)}{!(byDay[k] || []).length && <span className="xs faint">—</span>}</div>
        </div>
      ))}
    </div>
  );
}

function Agenda({ range, byDay, open, single }) {
  const days = [];
  for (let k = range[0]; k <= range[1]; k = addDays(k, 1)) if (byDay[k]?.length || single) days.push(k);
  if (!days.length) return <Empty title="Nada no período." />;
  return days.map((k) => (
    <div className="agenda-day" key={k}>
      <div><div className="d">{k.slice(8)}</div><div className="w">{new Date(`${k}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', month: 'short', timeZone: 'UTC' })}</div></div>
      <div className="col gap-1">{(byDay[k] || []).map((it, j) => it.band ? <div key={it.id + j} className="band" style={{ alignSelf: 'flex-start' }}>{it.title}</div> : <Ev key={it.id + j} it={it} open={open} wide />)}{!(byDay[k] || []).length && <span className="sm faint">Nada agendado.</span>}</div>
    </div>
  ));
}

// NOVO NA AGENDA: evento, compromisso ou tarefa · para toda a equipe ou para pessoas selecionadas uma a uma
function NewAgendaItem({ opts, anchor, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ tipo: 'evento', title: '', description: '', date: anchor || new Date().toISOString().slice(0, 10), time: '09:00', end_time: '', all_day: false, client_id: '', audience: 'todos', members: [], priority: 'media' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const toggle = (id) => setF({ ...f, members: f.members.includes(id) ? f.members.filter((x) => x !== id) : [...f.members, id] });
  const submit = async () => {
    const starts_at = new Date(`${f.date}T${f.all_day ? '12:00' : f.time || '09:00'}:00-03:00`).toISOString();
    const ends_at = !f.all_day && f.end_time ? new Date(`${f.date}T${f.end_time}:00-03:00`).toISOString() : null;
    if (f.tipo === 'tarefa' && f.audience === 'todos' && !confirm(`Criar uma tarefa para cada pessoa da equipe (${opts.people.length})?`)) return;
    try { const r = await api.post('/agenda/itens', { ...f, starts_at, ends_at }); toast(r.tasks ? `${r.tasks} tarefa(s) criada(s) e avisada(s).` : `Criado e avisado para ${r.recipients} pessoa(s).`); onDone(); } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <Modal open wide title="Novo na agenda" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit} disabled={!f.title.trim() || (f.audience === 'selecionados' && !f.members.length)}>Criar</Button></>}>
      <div className="col gap-4">
        <Seg value={f.tipo} onChange={(v) => setF({ ...f, tipo: v })} options={Object.entries(opts.tipos).map(([value, label]) => ({ value, label }))} label="Tipo" />
        {f.tipo === 'tarefa' && <p className="xs muted" style={{ margin: 0 }}>Tarefa vira uma tarefa real para cada pessoa escolhida, com prazo nesta data (aparece em Pendências e no Calendário).</p>}
        <Field label="Título"><input className="input" value={f.title} onChange={set('title')} /></Field>
        <div className="grid-2">
          <Field label="Data"><input className="input" type="date" value={f.date} onChange={set('date')} /></Field>
          {f.tipo !== 'tarefa' && <Field label="Dia inteiro"><label className="row gap-2 sm"><input type="checkbox" checked={f.all_day} onChange={set('all_day')} /> Sem horário</label></Field>}
          {!f.all_day && <Field label={f.tipo === 'tarefa' ? 'Prazo (hora)' : 'Início'}><input className="input" type="time" value={f.time} onChange={set('time')} /></Field>}
          {!f.all_day && f.tipo !== 'tarefa' && <Field label="Fim (opcional)"><input className="input" type="time" value={f.end_time} onChange={set('end_time')} /></Field>}
          <Field label="Cliente (opcional)"><select className="select" value={f.client_id} onChange={set('client_id')}><option value="">Sem cliente</option>{opts.clients.map((c) => <option key={c.id} value={c.id}>{cleanName(c.name)}</option>)}</select></Field>
          {f.tipo === 'tarefa' && <Field label="Prioridade"><select className="select" value={f.priority} onChange={set('priority')}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></Field>}
        </div>
        <Field label="Descrição (opcional)"><textarea className="textarea" value={f.description} onChange={set('description')} /></Field>
        <div className="col gap-2">
          <div className="caps">{f.tipo === 'tarefa' ? 'Para quem é a tarefa' : 'Quem vê'}</div>
          <div className="row wrap gap-2">
            <Button size="sm" variant={f.audience === 'todos' ? 'primary' : 'ghost'} onClick={() => setF({ ...f, audience: 'todos' })}>Toda a equipe</Button>
            <Button size="sm" variant={f.audience === 'selecionados' ? 'primary' : 'ghost'} onClick={() => setF({ ...f, audience: 'selecionados' })}>Selecionar pessoas</Button>
          </div>
          {f.audience === 'selecionados' && (
            <div className="ag-people">{opts.people.map((p) => (
              <label key={p.id} className={`ag-person ${f.members.includes(p.id) ? 'on' : ''}`}><input type="checkbox" checked={f.members.includes(p.id)} onChange={() => toggle(p.id)} /> {p.name}</label>
            ))}</div>
          )}
          <span className="xs muted">{f.audience === 'todos' ? `Aparece para as ${opts.people.length} pessoas da equipe, que são avisadas.` : `${f.members.length} pessoa(s) selecionada(s). Só elas (e você) veem e são avisadas.`}</span>
        </div>
      </div>
    </Modal>
  );
}

function EventDetail({ it, onClose, onDone }) {
  const toast = useToast();
  const cancel = async () => {
    const reason = prompt('Motivo do cancelamento (as pessoas são avisadas):');
    if (!reason) return;
    try { await api.post(`/agenda/eventos/${it.event_id}/cancelar`, { reason }); toast('Cancelado e avisado.'); onDone(); } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <Modal open title={it.title} onClose={onClose} footer={<>{it.can_cancel && <Button variant="danger" onClick={cancel}>Cancelar evento</Button>}<Button onClick={onClose}>Fechar</Button></>}>
      <div className="col gap-2 sm">
        <div><span className="caps">{it.kind === 'compromisso' ? 'Compromisso' : 'Evento'}</span></div>
        <div>{new Date(it.start).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: it.all_day ? undefined : 'short' })}{it.end && !it.all_day ? ` até ${fmtTime(it.end)}` : ''}</div>
        {it.description && <p style={{ margin: 0 }}>{it.description}</p>}
        <div className="muted">Quem vê: {it.audience === 'selecionados' ? (it.members || []).join(', ') : 'toda a equipe'}</div>
        {it.creator && <div className="xs faint">Criado por {it.creator}</div>}
      </div>
    </Modal>
  );
}
