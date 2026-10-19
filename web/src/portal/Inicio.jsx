// INÍCIO — "O que está acontecendo? O que preciso fazer? Qual é o próximo passo?"
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/hooks.js';
import { fmtDate, fmtDateTime, fmtMonth, ago, cleanName, firstName } from '../lib/format.js';
import { FORMATS } from '../lib/status.js';
import { Loading } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { usePortal } from './PortalApp.jsx';

export function Track({ track, compact }) {
  if (!track) return null;
  const mark = { done: '✓', partial: '◐', current: '●', you: '●', next: '○' };
  return (
    <ol className={`p-track ${compact ? 'compact' : ''}`} aria-label="Andamento do projeto">
      {track.steps.map((s) => (
        <li key={s.label} className={`s-${s.state}`}>
          <span className="p-track-mark" aria-hidden>{mark[s.state]}</span>
          <span className="p-track-label">{s.label}</span>
          <span className="p-track-note">{s.note}</span>
        </li>
      ))}
    </ol>
  );
}

export default function Inicio() {
  const auth = useAuth();
  const { me } = usePortal() || {};
  if (!me) return <div className="p-page"><Loading rows={5} /></div>;
  const name = firstName(auth.user.name).toUpperCase();
  const first = me.steps[0];
  const status = me.onboarding?.status && me.onboarding.status !== 'concluido' ? 'Estamos preparando o início do seu projeto.' : 'Seu projeto está em andamento.';
  return (
    <div className="p-page p-home">
      <section className="p-hello">
        <div className="caps">{cleanName(me.client.name)}{me.track ? ` · ${fmtMonth(me.track.month)}` : ''}</div>
        <h1 className="p-hello-t">Olá, {name}.</h1>
        <p className="p-hello-s">{status}</p>
      </section>

      <section className="p-now">
        <div className="caps">Status atual</div>
        <Track track={me.track} />
      </section>

      <section className="p-next">
        <div className="caps">Próximo passo</div>
        {first ? (
          <>
            <p className="p-next-t">{first.text}</p>
            <Link to={first.link} className="p-cta" data-cursor="ABRIR">{first.cta || 'Ver'} <I.arrow size={16} /></Link>
          </>
        ) : (
          <p className="p-next-t">Nada depende de você agora. <span className="muted">A The Bold está cuidando de tudo{me.in_preparation ? ` — ${me.in_preparation} conteúdo(s) em preparação` : ''}.</span></p>
        )}
      </section>

      <div className="p-home-grid">
        <section>
          <div className="p-sec-h"><span className="caps">Próximos conteúdos</span><Link to="/portal/conteudos" className="p-link xs">ver todos</Link></div>
          {!me.upcoming?.length ? <p className="sm muted">{me.in_preparation ? `${me.in_preparation} conteúdo(s) em preparação pela equipe.` : 'Nenhum conteúdo programado.'}</p> : (
            <ul className="p-list">{me.upcoming.map((c) => (
              <li key={c.id}><span className="p-list-date">{fmtDate(c.date)}</span><span className="grow">{c.title}<small>{FORMATS[c.format]}</small></span>
                <span className={`p-mini s-${c.status}`}>{c.status === 'aguardando_cliente' ? '♡ aprovar' : c.status === 'agendado' ? '♥ agendado' : '♥ aprovado'}</span></li>
            ))}</ul>
          )}
        </section>
        <section>
          <div className="p-sec-h"><span className="caps">Próxima reunião</span><Link to="/portal/reunioes" className="p-link xs">reuniões</Link></div>
          {me.next_meeting ? <p className="p-meet"><b>{fmtDateTime(me.next_meeting.starts_at)}</b><span>{me.next_meeting.title}</span></p> : <p className="sm muted">Nenhuma reunião marcada. <Link className="p-link" to="/portal/reunioes">Escolher horário</Link></p>}
          {me.deadlines?.length > 0 && (<>
            <div className="p-sec-h mt-5"><span className="caps">Próximos prazos</span></div>
            <ul className="p-list">{me.deadlines.map((d) => <li key={d.label}><span className="p-list-date">{fmtDate(d.date)}</span><span className="grow">{d.label}</span></li>)}</ul>
          </>)}
        </section>
        <section>
          <div className="p-sec-h"><span className="caps">Últimas atualizações</span><Link to="/portal/projeto" className="p-link xs">histórico</Link></div>
          <ul className="p-updates">{me.timeline.slice(0, 5).map((t, i) => <li key={i}><span className="xs faint">{ago(t.created_at)}</span><span className="sm">{t.summary.replace(/ \[DEMO\]/g, '').replace(/^#\d+\s*/, '')}</span></li>)}</ul>
        </section>
      </div>
      {me.team?.length > 0 && <p className="p-team-line xs muted">Sua equipe The Bold: {me.team.filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i).map((t) => t.name).join(' · ')}</p>}
    </div>
  );
}
