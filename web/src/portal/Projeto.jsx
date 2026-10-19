// MEU PROJETO — andamento simplificado, o que depende de você e o histórico do que já aconteceu.
import { usePortal } from './PortalApp.jsx';
import { ago, fmtMonth, cleanName } from '../lib/format.js';
import { Loading } from '../components/ui.jsx';
import { Track } from './Inicio.jsx';
import Pendencias from './Pendencias.jsx';

export default function Projeto() {
  const { me } = usePortal() || {};
  if (!me) return <div className="p-page"><Loading /></div>;
  return (
    <div className="p-page">
      <header className="p-page-head">
        <div className="caps">Meu projeto · {cleanName(me.client.name)}</div>
        <h1 className="ed-xl">{me.track ? fmtMonth(me.track.month).replace(/^./, (c) => c.toUpperCase()) : 'Seu projeto'}</h1>
        {me.client.services?.length > 0 && <p className="p-lede">{me.client.services.join(' · ')}</p>}
      </header>
      <section className="p-now"><div className="caps">Andamento</div><Track track={me.track} /></section>
      <section className="p-mat-sec"><Pendencias embedded /></section>
      <section className="p-mat-sec">
        <div className="p-sec-h"><span className="caps">Histórico</span></div>
        <ul className="p-updates">{me.timeline.map((t, i) => <li key={i}><span className="xs faint">{ago(t.created_at)}</span><span className="sm">{t.summary.replace(/ \[DEMO\]/g, '').replace(/^#\d+\s*/, '')}</span></li>)}</ul>
      </section>
    </div>
  );
}
