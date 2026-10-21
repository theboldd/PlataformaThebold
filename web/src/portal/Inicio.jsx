// MEU MOMENTO BOLD — a home responde, nesta ordem:
// AGORA (onde está meu projeto?) · VOCÊ (o que precisa de mim?) · THE BOLD (o que estão fazendo?) · DEPOIS (o que acontece?) · HISTÓRICO.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi, useAuth, useToast } from '../lib/hooks.js';
import { fmtDate, fmtDateTime, fmtMonth, ago, cleanName, firstName, greeting } from '../lib/format.js';
import { Loading, ErrorBox } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { usePortal } from './PortalApp.jsx';

export function Track({ track, compact }) {
  if (!track) return null;
  const mark = { done: '✓', partial: '◐', current: '●', you: '●', next: '○' };
  return (
    <ol className={`p-track n${track.steps.length} ${compact ? 'compact' : ''}`} aria-label="Andamento do projeto">
      {track.steps.map((s, i) => (
        <li key={s.label} className={`s-${s.state}`} aria-current={i === track.here ? 'step' : undefined}>
          <span className="p-track-mark" aria-hidden>{mark[s.state]}</span>
          <span className="p-track-label">{s.label}</span>
          <span className="p-track-note">{i === track.here ? <b>você está aqui · </b> : null}{s.note}</span>
        </li>
      ))}
    </ol>
  );
}

const KIND_LABEL = { aprovacao: 'Aprovação', material: 'Material', pergunta: 'Pergunta', escolha: 'Escolha', confirmacao: 'Confirmação', confirmacao_data: 'Data', outro: 'Decisão', solicitacao: 'Solicitação', onboarding: 'Onboarding', reuniao: 'Reunião' };

export function ActionRow({ a, big }) {
  return (
    <li className={`p-act ${big ? 'big' : ''} ${a.overdue ? 'late' : ''}`}>
      <div className="p-act-k caps">{KIND_LABEL[a.kind] || 'Para você'}{a.count > 1 ? ` · ${a.count}` : ''}</div>
      <div className="p-act-t">{a.title}</div>
      {a.context && <p className="p-act-c">{a.context}</p>}
      {(a.due_at || a.consequence) && (
        <p className="p-act-due">
          {a.due_at && !a.overdue && <b>Precisamos de você até {fmtDate(a.due_at)}. </b>}
          {a.overdue && <b>Precisamos de você. </b>}
          {a.consequence}
        </p>
      )}
      <Link to={a.link} className={big ? 'p-cta' : 'p-cta sm'} data-cursor="ABRIR">{a.cta} <I.arrow size={16} /></Link>
    </li>
  );
}

export default function Inicio() {
  const auth = useAuth();
  const { me } = usePortal() || {};
  const { data, error, reload } = useApi('/portal/home');
  if (error) return <div className="p-page"><ErrorBox error={error} /></div>;
  if (!data || !me) return <div className="p-page"><Loading rows={6} /></div>;
  const name = firstName(auth.user.name).toUpperCase();
  const actions = data.actions;
  const [first, ...rest] = actions;
  const p = data.profile;
  return (
    <div className="p-page p-home">
      <section className="p-hello">
        <div className="caps">{cleanName(me.client.name)}{data.journey ? ` · ${fmtMonth(data.journey.month)}` : ''}</div>
        <h1 className="p-hello-t">{greeting()}, {name}.</h1>
        <p className="p-updated xs">{data.history[0] ? `Última atualização do seu projeto: ${ago(data.history[0].at)}` : 'Última atualização do seu projeto: ainda não há eventos registrados.'}</p>
        <p className="p-hello-s">{actions.length ? (actions.length === 1 ? 'Uma coisa espera por você hoje.' : `${actions.length} coisas esperam por você.`) : 'Tudo em dia por aqui.'}</p>
      </section>

      {/* AGORA */}
      <section className="p-now" aria-labelledby="h-now">
        <div className="caps" id="h-now">Você está aqui</div>
        {data.journey ? <Track track={data.journey} /> : <p className="sm muted mt-2">O acompanhamento do ciclo aqui começa no primeiro ciclo criado na nova plataforma. Os conteúdos que já estavam em andamento estão em <Link to="/portal/conteudos" className="p-link">Conteúdos</Link>.</p>}
      </section>

      {/* VOCÊ */}
      <section className="p-need" aria-labelledby="h-need">
        <div className="caps" id="h-need">Precisamos de você</div>
        {first ? (
          <ul className="p-acts">
            <ActionRow a={first} big />
            {rest.slice(0, 4).map((a) => <ActionRow key={a.key} a={a} />)}
          </ul>
        ) : (
          <div className="p-allgood">
            <p className="p-next-t">Tudo em dia.</p>
            <p className="p-hello-s">A The Bold está cuidando da próxima etapa do seu projeto.</p>
          </div>
        )}
        {rest.length > 4 && <Link to="/portal/decisoes" className="p-link mt-4">ver tudo o que depende de você ({actions.length})</Link>}
      </section>

      {data.satisfaction && <Satisfaction s={data.satisfaction} onDone={reload} />}

      {/* THE BOLD × VOCÊ */}
      <div className="p-pair">
        <section aria-labelledby="h-doing">
          <div className="caps" id="h-doing">The Bold está cuidando</div>
          {data.doing.length ? (
            <ul className="p-doing">{data.doing.map((d, i) => <li key={i}><span className="p-doing-m" aria-hidden>✓</span><span><b>{d.label}</b>{d.detail && <small>{d.detail}</small>}</span></li>)}</ul>
          ) : <p className="sm muted mt-2">Assim que o próximo ciclo começar, você acompanha aqui o que está sendo feito.</p>}
        </section>
        <section aria-labelledby="h-you">
          <div className="caps" id="h-you">Você precisa fazer</div>
          {actions.length ? (
            <ul className="p-todo">{actions.map((a) => <li key={a.key}><Link to={a.link}><span aria-hidden>→</span> {a.short}{a.count > 1 && !/\d/.test(a.short) ? ` (${a.count})` : ''}</Link></li>)}</ul>
          ) : <p className="sm muted mt-2">Nada agora. Avisamos você quando algo precisar da sua atenção.</p>}
          {p && p.missing > 0 && !actions.some((a) => a.kind === 'onboarding') && (
            <div className="p-profile">
              <div className="p-profile-bar" aria-hidden><i style={{ width: `${p.percent}%` }} /></div>
              <p className="sm">Seu perfil está <b>{p.percent}% completo</b>. {p.missing === 1 ? 'Falta 1 informação' : `Faltam ${p.missing} informações`} para completar.</p>
              <Link to="/portal/onboarding?faltando=1" className="p-link">Continuar →</Link>
            </div>
          )}
        </section>
      </div>

      {/* DEPOIS */}
      <section className="p-after" aria-labelledby="h-after">
          <div className="caps" id="h-after">Próximo passo</div>
          {!data.next.length && <p className="sm muted mt-2">Nenhum próximo passo com data ainda. Quando houver, ele aparece aqui com o dia.</p>}
          <ul className="p-list">{data.next.map((n, i) => <li key={i}>{n.date && <span className="p-list-date">{n.time ? fmtDateTime(n.date) : fmtDate(n.date)}</span>}<span className="grow">{n.text}</span></li>)}</ul>
        </section>

      {data.pulse && (
        <section className="p-pulse-teaser">
          <div className="caps">The Bold / Pulso</div>
          {data.pulse.focus && <p className="p-next-t"><span className="caps">Foco atual</span> {data.pulse.focus}</p>}
          <Link to="/portal/marca#pulso" className="p-link">Ver o pulso da sua marca →</Link>
        </section>
      )}

      {/* HISTÓRICO */}
      <section className="p-after" aria-labelledby="h-hist">
        <div className="p-sec-h"><span className="caps" id="h-hist">Histórico</span><Link to="/portal/historico" className="p-link xs">ver tudo</Link></div>
        {data.history.length ? <ul className="p-updates">{data.history.map((h) => (
          <li key={h.id}><span className="xs faint">{ago(h.at)}</span>{h.link ? <Link to={h.link} className="sm p-hist-link">{h.text}</Link> : <span className="sm">{h.text}</span>}</li>
        ))}</ul> : <p className="sm muted">Ainda não há eventos.</p>}
      </section>
      {me.team?.length > 0 && <p className="p-team-line xs muted">Sua equipe The Bold: {me.team.filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i).map((t) => firstName(t.name)).join(' · ')}</p>}
    </div>
  );
}

// COMO FOI ESSA ETAPA? — só aparece depois de um momento relevante
function Satisfaction({ s, onDone }) {
  const toast = useToast();
  const [rating, setRating] = useState(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState(false);
  const send = async (r = rating) => {
    setBusy(true);
    try { await api.post(`/portal/satisfaction/${s.id}`, { rating: r, comment }); setThanks(true); setTimeout(onDone, 2200); } catch (x) { toast(x.message, 'err'); } finally { setBusy(false); }
  };
  if (thanks) return <section className="p-sat" role="status"><p className="p-next-t">Obrigado.</p><p className="sm muted">Sua resposta ajuda a The Bold a melhorar cada etapa.</p></section>;
  return (
    <section className="p-sat" aria-labelledby="h-sat">
      <div className="row between"><div className="caps" id="h-sat">Como foi essa etapa?</div><button className="p-link xs" onClick={async () => { await api.post(`/portal/satisfaction/${s.id}/dismiss`).catch(() => {}); onDone(); }}>agora não</button></div>
      <p className="sm" style={{ margin: '6px 0 12px' }}>Sobre {s.label}.</p>
      <div className="p-sat-opts" role="radiogroup" aria-label="Avaliação">
        {[['excelente', 'Excelente'], ['boa', 'Boa'], ['poderia_melhorar', 'Poderia melhorar']].map(([k, l]) => (
          <button key={k} role="radio" aria-checked={rating === k} className={rating === k ? 'on' : ''} disabled={busy} onClick={() => (k === 'poderia_melhorar' ? setRating(k) : send(k))}>{rating === k ? '●' : '○'} {l}</button>
        ))}
      </div>
      {rating === 'poderia_melhorar' && (
        <div className="mt-4">
          <label className="p-field"><span className="caps">Conte o que podemos melhorar</span><textarea className="p-textarea" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} autoFocus /></label>
          <button className="p-btn solid mt-2" disabled={busy} onClick={() => send()}>Enviar</button>
        </div>
      )}
    </section>
  );
}
