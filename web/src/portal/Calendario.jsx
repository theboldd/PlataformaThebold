import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi, useMediaQuery } from '../lib/hooks.js';
import { fmtMonth, fmtTime, pad2 } from '../lib/format.js';
import { FORMATS, STATUS } from '../lib/status.js';
import { Loading, ErrorBox, Button, Empty } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';

const GLYPH = { aprovado: '✓', agendado: '→', publicado: '●', aguardando_cliente: '⏳', ajuste_solicitado: '✎', em_ajuste: '✎' };
const DOW = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const dayKey = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

export default function Calendario() {
  const { data, error } = useApi('/portal/calendar');
  const mobile = useMediaQuery('(max-width: 860px)');
  const today = new Date();
  const [ym, setYm] = useState(() => { const d = new Date(today.getTime() + 12 * 864e5); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; });
  if (error) return <div className="p-page"><ErrorBox error={error} /></div>;
  if (!data) return <div className="p-page"><Loading rows={8} /></div>;
  const [y, m] = ym.split('-').map(Number);
  const shift = (n) => { const d = new Date(y, m - 1 + n, 1); setYm(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`); };
  const events = [
    ...data.items.map((i) => ({ ...i, key: dayKey(i.date), kind: 'content' })),
    ...data.meetings.map((mt) => ({ id: mt.id, title: mt.title.replace(/\s*\[DEMO\]/, ''), date: mt.starts_at, key: dayKey(mt.starts_at), kind: 'meeting' })),
    ...(data.deadlines || []).map((d) => ({ id: `dl-${d.label}`, title: d.label, date: `${d.end}T12:00:00-03:00`, key: d.end, kind: 'deadline' })),
  ].filter((e) => e.key.startsWith(ym)).sort((a, b) => a.date.localeCompare(b.date));
  const byDay = events.reduce((acc, e) => ((acc[e.key] ||= []).push(e), acc), {});
  const first = new Date(y, m - 1, 1);
  const offset = (first.getDay() + 6) % 7;
  const daysIn = new Date(y, m, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + daysIn) / 7) * 7 }, (_, i) => { const d = new Date(y, m - 1, i - offset + 1); return { d, key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, out: d.getMonth() !== m - 1 }; });
  const todayKey = dayKey(today.toISOString());
  const Ev = ({ e }) => e.kind === 'meeting'
    ? <Link to={`/portal/reunioes?m=${e.id}`} className="p-ev meeting"><I.meeting size={11} /> {fmtTime(e.date)} {e.title}</Link>
    : e.kind === 'deadline' ? <span className="p-ev deadline">Prazo · {e.title}</span>
    : <Link to={`/portal/conteudos?c=${e.id}`} className={`p-ev s-${e.status}`} title={`${e.title} — ${STATUS[e.status] || e.status}`}><span aria-hidden>{GLYPH[e.status] || '·'}</span> {FORMATS[e.format]} · {e.title}</Link>;

  return (
    <div className="p-page">
      <header className="p-page-head row between wrap">
        <div><div className="caps">Calendário editorial</div><h1 className="ed-xl">{cap(fmtMonth(ym))}</h1></div>
        <div className="row gap-2">
          <Button size="sm" icon={<I.left size={14} />} onClick={() => shift(-1)} aria-label="Mês anterior" />
          <Button size="sm" onClick={() => setYm(`${today.getFullYear()}-${pad2(today.getMonth() + 1)}`)}>Hoje</Button>
          <Button size="sm" icon={<I.right size={14} />} onClick={() => shift(1)} aria-label="Próximo mês" />
        </div>
      </header>
      <div className="row wrap gap-4 xs muted mb-4" aria-label="Legenda">
        <span>Toque em um conteúdo para ver, comentar ou aprovar. As datas são definidas pela The Bold.</span>
        <span>✓ Aprovado</span><span>→ Agendado</span><span>● Publicado</span><span>⏳ Aguardando você</span><span>✎ Em ajuste</span>
        {data.in_preparation > 0 && <span className="tag tag-bordo">{data.in_preparation} conteúdos em preparação pela equipe</span>}
      </div>
      {mobile ? (
        events.length ? Object.entries(byDay).map(([k, list]) => {
          const d = new Date(`${k}T12:00:00`);
          return (
            <div key={k} className="p-agenda-day">
              <div><div className="d">{pad2(d.getDate())}</div><div className="w">{d.toLocaleDateString('pt-BR', { weekday: 'short' })}</div></div>
              <div className="col gap-2">{list.map((e) => <Ev key={e.id} e={e} />)}</div>
            </div>
          );
        }) : <Empty title="Nada neste mês." />
      ) : (
        <div className="p-cal" role="grid" aria-label={`Calendário de ${fmtMonth(ym)}`}>
          {DOW.map((d) => <div key={d} className="dow">{d}</div>)}
          {cells.map((c) => (
            <div key={c.key} className={`day ${c.out ? 'out' : ''} ${c.key === todayKey ? 'today' : ''}`} role="gridcell">
              <span className="n">{c.d.getDate()}</span>
              {(byDay[c.key] || []).map((e) => <Ev key={e.id} e={e} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
