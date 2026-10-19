import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { Button } from '../components/ui.jsx';
import '../styles/login.css';

const PHRASES = ['quem precisa agir.', 'o que está atrasado.', 'qual é a próxima etapa.', 'o que está faltando.', 'o que precisa acontecer.'];
const STAGES = ['Estratégia', 'Produção', 'Revisão', 'Cliente', 'Agendamento', 'Publicação'];
const MARQUEE = ['Estratégia', 'Conteúdo', 'Aprovação', 'Processo', 'Inteligência', 'Criatividade', 'Controle', 'Personalidade'];

function useClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  const tz = { timeZone: 'America/Sao_Paulo' };
  return {
    time: t.toLocaleTimeString('pt-BR', { ...tz, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    date: t.toLocaleDateString('pt-BR', { ...tz, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }),
  };
}

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [phrase, setPhrase] = useState(0);
  const root = useRef(null);
  const clock = useClock();

  useEffect(() => { const i = setInterval(() => setPhrase((p) => (p + 1) % PHRASES.length), 2600); return () => clearInterval(i); }, []);
  // Brilho bordô que acompanha o ponteiro
  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia('(pointer: coarse)').matches) return;
    const h = (e) => { el.style.setProperty('--mx', `${e.clientX}px`); el.style.setProperty('--my', `${e.clientY}px`); };
    window.addEventListener('mousemove', h);
    return () => window.removeEventListener('mousemove', h);
  }, []);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api.post('/auth/login', { email, password }); await onLogin(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <div className="lg" ref={root}>
      <div className="lg-glow" aria-hidden />
      <div className="lg-grain" aria-hidden />

      <header className="lg-top">
        <span className="lg-mark">B.</span>
        <span className="lg-meta">Nº 01 — Operating System</span>
        <span className="lg-meta lg-clock" aria-label="Horário de São Paulo">{clock.date} · <b>{clock.time}</b> SP</span>
      </header>

      <main className="lg-grid">
        <section className="lg-hero">
          <p className="lg-kicker"><span className="lg-line" />A plataforma da agência</p>
          <h1 className="lg-title">
            <span className="lg-row"><span>O sistema</span></span>
            <span className="lg-row"><span>sabe</span></span>
            <span className="lg-row lg-rot" aria-live="polite"><span key={phrase} className="lg-phrase">{PHRASES[phrase]}</span></span>
          </h1>
          <div className="lg-track" aria-hidden>
            {STAGES.map((s, i) => <span key={s} className="lg-stage" style={{ '--i': i }}><i />{s}</span>)}
            <span className="lg-runner" />
          </div>
        </section>

        <form className="lg-form" onSubmit={submit}>
          <div className="lg-form-head"><span className="lg-meta">Acesso</span><span className="lg-meta">01 / 01</span></div>
          <h2 className="lg-enter">Entrar<span>.</span></h2>
          <label className="lg-field"><span>E-mail</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="voce@thebold.com.br" /></label>
          <label className="lg-field"><span>Senha</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••••" /></label>
          {err && <div className="lg-err" role="alert">{err}</div>}
          <Button variant="ink" size="lg" magnetic arrow disabled={busy} type="submit" className="lg-cta" cursor="ENTRAR">{busy ? 'Entrando…' : 'Viver o efeito Bold'}</Button>
        </form>
      </main>

      <div className="lg-marquee" aria-hidden>
        <div className="lg-marquee-in">{[...MARQUEE, ...MARQUEE, ...MARQUEE].map((w, i) => <span key={i}>{w}<em>✦</em></span>)}</div>
      </div>
      <div className="lg-word" aria-hidden>THE BOLD<span>.</span></div>
    </div>
  );
}
