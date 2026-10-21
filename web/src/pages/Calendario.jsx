import { useMemo, useState } from 'react';
import { StateBadge, StateNotice } from '../components/State.jsx';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Button, Seg, Loading, Empty, ErrorBox, Tag } from '../components/ui.jsx';
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
  const { data, error, loading } = useApi(`/calendar?${qs}`, [qs.toString()]);

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
  const open = (it) => { if (!it.link) return; if (it.external) window.open(it.link, '_blank', 'noopener'); else nav(it.link); };
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
