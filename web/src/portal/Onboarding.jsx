// ONBOARDING — o formulário "Sua marca" da The Bold, agora dentro da plataforma.
// Mesmas etapas e perguntas do ESPAÇO CLIENTE do Notion. Cada resposta é salva sozinha; o envio libera o próximo passo.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi, useToast } from '../lib/hooks.js';
import { Button, ErrorBox, Loading } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { fmtDateTime } from '../lib/format.js';
import { usePortal } from './PortalApp.jsx';
import '../styles/ficha.css';

const title = (s) => s.charAt(0) + s.slice(1).toLowerCase();

export default function Onboarding() {
  const { data, error, loading, reload } = useApi('/portal/onboarding/form', [], { live: false });
  const { reloadMe: refresh } = usePortal() || {};
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState({});
  const [state, setState] = useState({}); // key → 'salvando' | 'salvo' | 'erro'
  const [count, setCount] = useState(null);
  const [sending, setSending] = useState(false);
  const timers = useRef({});
  const top = useRef(null);

  useEffect(() => {
    if (!data) return;
    setValues(Object.fromEntries(Object.entries(data.answers).filter(([, a]) => a.value !== undefined).map(([k, a]) => [k, a.value])));
    setCount(data.answered);
  }, [data]);
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  if (error) return <div className="p-page"><ErrorBox error={error} /></div>;
  if (loading || !data) return <div className="p-page"><Loading rows={6} /></div>;

  const save = async (key, value) => {
    setState((s) => ({ ...s, [key]: 'salvando' }));
    try { const r = await api.put(`/portal/onboarding/answers/${key}`, { value }); setCount(r.answered); setState((s) => ({ ...s, [key]: 'salvo' })); } catch (e) { setState((s) => ({ ...s, [key]: 'erro' })); toast(e.message, 'err'); }
  };
  const change = (q, value, immediate = false) => {
    setValues((v) => ({ ...v, [q.key]: value }));
    clearTimeout(timers.current[q.key]);
    timers.current[q.key] = setTimeout(() => save(q.key, value), immediate ? 0 : 900);
  };
  const flush = (q) => { if (timers.current[q.key]) { clearTimeout(timers.current[q.key]); delete timers.current[q.key]; save(q.key, values[q.key] ?? ''); } };
  const go = (i) => { setStep(i); top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const submit = async () => {
    setSending(true);
    try { await api.post('/portal/onboarding/submit'); toast('Formulário enviado. A equipe já recebeu suas respostas.'); reload(); refresh?.(); } catch (e) { toast(e.message, 'err'); } finally { setSending(false); }
  };

  const sec = data.sections[step];
  const filled = (q) => (q.sensitive ? data.answers[q.key]?.saved || !!values[q.key] : String(values[q.key] ?? '').trim());
  const done = data.status === 'concluido';
  const total = data.total, answered = count ?? data.answered;

  return (
    <div className="p-page p-ob" ref={top}>
      <div className="caps">Onboarding · {data.title || 'Sua marca'}</div>
      <h1 className="p-hello-t" style={{ fontSize: 'clamp(30px, 7vw, 46px)' }}>Bem-vinda(o) à The Bold.</h1>
      <p className="p-hello-s">{done
        ? `Formulário enviado${data.submitted_at ? ` em ${fmtDateTime(data.submitted_at)}` : ''}. Você ainda pode complementar suas respostas — a equipe é avisada.`
        : 'Suas respostas são salvas automaticamente. Pode parar e voltar quando quiser.'}</p>
      <div className="p-ob-progress" aria-label={`${answered} de ${total} respondidas`}><i style={{ width: `${Math.round((answered / Math.max(1, total)) * 100)}%` }} /></div>
      <div className="xs muted mt-2">{answered} de {total} perguntas respondidas</div>

      <nav className="p-ob-steps" aria-label="Etapas do formulário">
        {data.sections.map((s, i) => (
          <button key={s.title} className={`${i === step ? 'on' : ''} ${s.questions.every(filled) ? 'done' : ''}`} onClick={() => go(i)} aria-current={i === step ? 'step' : undefined}>
            {s.questions.every(filled) ? '✓ ' : ''}{title(s.title)}
          </button>
        ))}
      </nav>

      <h2 className="ed-lg">{title(sec.title)}</h2>
      {sec.questions.some((q) => q.sensitive) && (
        <div className="p-ob-secure mt-4"><I.lock size={13} /> Seus acessos ficam guardados de forma cifrada e só pessoas autorizadas da The Bold podem consultá-los. Se preferir, dê acesso de parceiro pelo Meta Business e deixe estes campos em branco — combinamos com você.</div>
      )}
      {sec.questions.map((q) => (
        <div key={q.key} className="p-ob-q">
          <label htmlFor={`q-${q.key}`}>{q.text}{q.required ? ' *' : ''}</label>
          {q.help && <div className="help">{q.help}</div>}
          {q.sensitive ? (
            <input id={`q-${q.key}`} type={/senha/i.test(q.text) ? 'password' : 'text'} autoComplete="off" value={values[q.key] ?? ''}
              placeholder={data.answers[q.key]?.saved ? 'Já informado — digite para substituir' : ''}
              onChange={(e) => setValues((v) => ({ ...v, [q.key]: e.target.value }))}
              onBlur={() => values[q.key] && save(q.key, values[q.key])} />
          ) : q.type === 'select' || q.type === 'multi_select' ? (
            <div className="p-ob-opts" role="group" aria-label={q.text}>
              {q.options.map((o) => {
                const sel = String(values[q.key] ?? '').split(', ').filter(Boolean);
                const on = sel.includes(o);
                const next = q.type === 'select' ? (on ? [] : [o]) : on ? sel.filter((x) => x !== o) : [...sel, o];
                return <button type="button" key={o} className={on ? 'on' : ''} aria-pressed={on} onClick={() => change(q, next.join(', '), true)}>{o}</button>;
              })}
            </div>
          ) : (
            <textarea id={`q-${q.key}`} rows={q.type === 'text' ? 1 : 4} value={values[q.key] ?? ''} onChange={(e) => change(q, e.target.value)} onBlur={() => flush(q)} />
          )}
          <div className="p-ob-saved" aria-live="polite">{{ salvando: 'Salvando…', salvo: 'Salvo', erro: 'Não foi possível salvar — tente de novo' }[state[q.key]] || (q.sensitive && data.answers[q.key]?.saved ? 'Guardado com segurança' : '')}</div>
        </div>
      ))}

      <div className="p-ob-foot">
        {step > 0 ? <Button variant="ghost" onClick={() => go(step - 1)}>← {title(data.sections[step - 1].title)}</Button> : <Link className="p-link xs" to="/portal">voltar ao início</Link>}
        {step < data.sections.length - 1
          ? <Button variant="primary" onClick={() => go(step + 1)}>{title(data.sections[step + 1].title)} →</Button>
          : done ? <span className="sm muted">✓ Enviado</span>
          : <Button variant="primary" disabled={sending || !answered} onClick={submit}>{sending ? 'Enviando…' : 'Enviar formulário'}</Button>}
      </div>
    </div>
  );
}
