// CENTRAL DE DECISÕES — o cliente nunca precisa descobrir onde uma decisão está.
// Cada decisão: título · contexto · prazo · consequência · ação · status. Responder registra, avisa a equipe e cria o próximo passo.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi, useToast } from '../lib/hooks.js';
import { fmtDate, ago } from '../lib/format.js';
import { Loading, ErrorBox } from '../components/ui.jsx';
import { ActionRow } from './Inicio.jsx';
import { usePortal } from './PortalApp.jsx';

export default function Decisoes() {
  const { data, error, reload } = useApi('/portal/decisions');
  const { reloadMe } = usePortal() || {};
  const [params] = useSearchParams();
  const focus = params.get('d');
  useEffect(() => { if (focus && data) document.getElementById(`d-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [focus, data]);
  if (error) return <div className="p-page"><ErrorBox error={error} /></div>;
  if (!data) return <div className="p-page"><Loading rows={6} /></div>;
  const asked = data.decisions.filter((d) => d.status === 'pendente');
  const others = data.pending.filter((a) => !a.decision_id);
  const total = asked.length + others.length;
  const refresh = () => { reload(); reloadMe?.(); };
  return (
    <div className="p-page" style={{ maxWidth: 860 }}>
      <header className="p-page-head">
        <div className="caps">Central de decisões</div>
        <h1 className="ed-xl">{total ? <>Decisões<br /><em>pendentes.</em></> : 'Tudo decidido.'}</h1>
        <p className="p-lede">{total ? `${total === 1 ? 'Uma decisão espera' : `${total} decisões esperam`} por você. Cada uma mostra o prazo e o que acontece depois.` : 'Nada depende de você agora. Quando a The Bold precisar de uma decisão, ela aparece aqui.'}</p>
      </header>

      {asked.length > 0 && (
        <section className="p-dsec">
          <h2 className="caps">A The Bold perguntou</h2>
          {asked.map((d) => <Decision key={d.id} d={d} focus={d.id === focus} onDone={refresh} />)}
        </section>
      )}
      {others.length > 0 && (
        <section className="p-dsec">
          <h2 className="caps">Aprovações, materiais e confirmações</h2>
          <ul className="p-acts">{others.map((a) => <ActionRow key={a.key} a={a} />)}</ul>
        </section>
      )}

      <section className="p-dsec">
        <h2 className="caps">Já decidido</h2>
        {!data.decided.length ? <p className="sm muted">Suas decisões aparecem aqui, com data.</p> : (
          <ul className="p-updates">{data.decided.map((x, i) => (
            <li key={i}><span className="xs faint">{ago(x.at)}</span><Link className="sm p-hist-link" to={x.link}>✓ {x.title}{x.answer ? ` → ${x.answer}` : ''}</Link></li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}

function Decision({ d, focus, onDone }) {
  const toast = useToast();
  const [answer, setAnswer] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const choice = ['escolha', 'confirmacao'].includes(d.kind) && d.options.length > 0;
  const send = async (a = answer) => {
    if (!String(a).trim()) return;
    setBusy(true);
    try { await api.post(`/portal/decisions/${d.id}/answer`, { answer: a, note }); toast('Decisão registrada. A The Bold já foi avisada.'); onDone(); } catch (x) { toast(x.message, 'err'); } finally { setBusy(false); }
  };
  const late = d.due_at && d.due_at < new Date().toISOString();
  return (
    <article id={`d-${d.id}`} className={`p-dec ${focus ? 'focus' : ''} ${late ? 'late' : ''}`}>
      <div className="p-act-k caps">{d.kind_label}{d.due_at ? ` · ${late ? 'prazo passou' : `até ${fmtDate(d.due_at)}`}` : ''}</div>
      <h3 className="p-act-t">{d.title}</h3>
      {d.context && <p className="p-act-c">{d.context}</p>}
      {d.consequence && <p className="p-act-due">{d.consequence}</p>}
      {choice ? (
        <div className="p-dec-opts" role="group" aria-label="Opções">
          {d.options.map((o) => <button key={o} className={answer === o ? 'on' : ''} aria-pressed={answer === o} onClick={() => setAnswer(o)} disabled={busy}>{o}</button>)}
        </div>
      ) : (
        <label className="p-field"><span className="caps">{d.kind === 'data' ? 'Data que funciona para você' : 'Sua resposta'}</span>
          <textarea className="p-textarea" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} /></label>
      )}
      {(choice ? answer : true) && (
        <label className="p-field"><span className="caps">Observação (opcional)</span><input className="p-input sq" value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} /></label>
      )}
      <button className="p-cta sm" disabled={busy || !answer.trim()} onClick={() => send()}>{busy ? 'Registrando…' : 'Confirmar decisão'}</button>
    </article>
  );
}
