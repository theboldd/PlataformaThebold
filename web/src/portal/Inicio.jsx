import { Link } from 'react-router-dom';
import { useAuth } from '../lib/hooks.js';
import { fmtDate, fmtDateTime, fmtMonth, ago, cleanName, greeting, firstName } from '../lib/format.js';
import { FUNCTIONS } from '../lib/status.js';
import { Stat, Loading, Empty, Avatar } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { usePortal } from './PortalApp.jsx';

const MILESTONE = { cliente_aprova_temas: 'Você aprova os temas', cliente_aprova_final: 'Você aprova a produção', ajustes_cliente: 'Ajustes finais' };

export default function Inicio() {
  const { me } = usePortal() || {};
  const auth = useAuth();
  if (!me) return <div className="p-page"><Loading rows={6} /></div>;
  const c = me.counts || {};
  const name = firstName(auth.user.name.replace(' (cliente)', ''));
  return (
    <div className="p-page">
      <header className="p-hero">
        <div className="caps">{cleanName(me.client.name)} · {me.client.status === 'onboarding' ? 'Em onboarding' : 'Projeto ativo'}</div>
        <h1 className="ed-xxl">{greeting()}, <i>{name}.</i></h1>
        <p className="p-lede">Seu projeto em um só lugar: o que precisa de você, o que está sendo criado e o que vem a seguir.</p>
      </header>

      <div className="stats mt-6">
        <Stat value={c.aguardando || 0} label="Aguardando sua aprovação" to="/portal" alert={c.aguardando > 0} />
        <Stat value={c.em_ajuste || 0} label="Em ajuste pela equipe" />
        <Stat value={c.aprovados || 0} label="Aprovados e agendados" />
        <Stat value={c.publicados || 0} label="Publicados" />
      </div>

      <div className="grid-2 mt-7" style={{ gap: 48 }}>
        <section>
          <div className="section-head"><h2 className="ed-md">Próximos passos</h2></div>
          {me.steps.length ? (
            <ol className="p-steps">{me.steps.map((s, i) => <li key={i}><Link to={s.link} data-cursor="ABRIR"><span className="t">{s.text}</span><I.arrow /></Link></li>)}</ol>
          ) : <Empty title="Nada pendente com você.">A equipe está trabalhando. Avisamos assim que algo precisar da sua atenção.</Empty>}

          {me.cycle && (
            <div className="mt-6">
              <div className="section-head"><h2 className="ed-md">Ciclo de {fmtMonth(me.cycle.month)}</h2></div>
              {Object.entries(me.cycle.milestones).map(([k, m]) => {
                const now = new Date().toISOString().slice(0, 10);
                const state = m.end < now ? 'done' : m.start <= now ? 'now' : 'next';
                return (
                  <div key={k} className="row between" style={{ padding: '14px 0', borderBottom: '1px solid var(--line)' }}>
                    <span className="row gap-2"><span className={`tag ${state === 'now' ? 'tag-bordo' : ''}`}>{state === 'done' ? 'Concluído' : state === 'now' ? 'Agora' : 'Em breve'}</span>{MILESTONE[k] || k}</span>
                    <span className="sm muted">{fmtDate(m.start)}{m.end !== m.start ? ` – ${fmtDate(m.end)}` : ''}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="section-head"><h2 className="ed-md">Próxima reunião</h2><Link to="/portal/reunioes" className="p-link">Reuniões</Link></div>
          {me.next_meeting ? (
            <div className="p-card">
              <div className="caps">{fmtDate(me.next_meeting.starts_at, { weekday: 'long' })}</div>
              <div className="ed-lg mt-2">{fmtDateTime(me.next_meeting.starts_at).split(' ')[1] || ''} · {me.next_meeting.title.replace(/\s*\[DEMO\]/, '')}</div>
              <div className="sm muted mt-2">{me.next_meeting.location}</div>
            </div>
          ) : <div className="p-card"><p className="sm muted" style={{ margin: 0 }}>Nenhuma reunião marcada.</p><Link className="p-link" to="/portal/reunioes">Reservar horário da reunião mensal</Link></div>}

          <div className="section-head mt-6"><h2 className="ed-md">Sua equipe The Bold</h2><Link to="/portal/conversa" className="p-link">Conversar</Link></div>
          {me.team.length ? [...new Map(me.team.map((t) => [t.id, { ...t, fns: me.team.filter((x) => x.id === t.id).map((x) => FUNCTIONS[x.function]) }])).values()].map((t) => (
            <div key={t.id} className="p-person"><Avatar name={t.name} /><div className="grow"><div>{t.name}</div><div className="xs muted">{t.fns.join(' · ')}</div></div></div>
          )) : <p className="sm muted">Equipe sendo definida.</p>}
        </section>
      </div>

      <section className="section">
        <div className="section-head"><h2 className="ed-md">Histórico do projeto</h2></div>
        {me.timeline.length ? (
          <ol className="list">{me.timeline.map((l, i) => <li key={i}><span className="xs faint" style={{ width: 90, flex: 'none' }}>{ago(l.created_at)}</span><span className="sm grow">{l.summary.replace(/\s*\[DEMO\]/g, '')}</span></li>)}</ol>
        ) : <Empty title="O histórico aparece aqui." />}
      </section>
    </div>
  );
}
