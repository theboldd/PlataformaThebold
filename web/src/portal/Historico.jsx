// HISTÓRICO — o que já aconteceu no projeto. Cada evento abre o seu registro original.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { fmtDay, fmtTime } from '../lib/format.js';
import { Loading, ErrorBox, Empty } from '../components/ui.jsx';

const dayKey = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

export default function Historico() {
  const { data, error } = useApi('/portal/history?limit=80');
  const [more, setMore] = useState([]);
  const [end, setEnd] = useState(false);
  if (error) return <div className="p-page"><ErrorBox error={error} /></div>;
  if (!data) return <div className="p-page"><Loading rows={8} /></div>;
  const items = [...data, ...more];
  const groups = items.reduce((acc, h) => ((acc[dayKey(h.at)] ||= []).push(h), acc), {});
  const loadMore = async () => {
    const last = items[items.length - 1];
    const r = await api.get(`/portal/history?limit=80&before=${encodeURIComponent(last.at)}`);
    if (!r.length) setEnd(true); else setMore((m) => [...m, ...r]);
  };
  return (
    <div className="p-page" style={{ maxWidth: 820 }}>
      <header className="p-page-head"><div className="caps">Seu projeto</div><h1 className="ed-xl">Histórico</h1><p className="p-lede">Tudo o que aconteceu, do mais recente ao mais antigo. Toque para abrir.</p></header>
      {!items.length ? <Empty title="Ainda não há eventos." /> : Object.entries(groups).map(([k, list]) => (
        <section key={k} className="p-hday">
          <h2 className="p-hday-d">{fmtDay(`${k}T12:00:00-03:00`)}</h2>
          <ul>{list.map((h) => (
            <li key={h.id}>{h.link ? <Link to={h.link}><span className="xs faint">{fmtTime(h.at)}</span><span>{h.text}</span><span aria-hidden className="faint">→</span></Link> : <div><span className="xs faint">{fmtTime(h.at)}</span><span>{h.text}</span></div>}</li>
          ))}</ul>
        </section>
      ))}
      {items.length >= 80 && !end && <button className="p-btn mt-5" onClick={loadMore}>Carregar mais</button>}
    </div>
  );
}
