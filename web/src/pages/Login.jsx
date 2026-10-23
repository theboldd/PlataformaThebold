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
  // entrar | esqueci (pedir link) | enviado | redefinir (veio do link do e-mail) | pronto
  const resetToken = window.location.pathname === '/redefinir-senha' ? new URLSearchParams(window.location.search).get('t') : null;
  const [mode, setMode] = useState(resetToken ? 'redefinir' : 'entrar');
  const [who, setWho] = useState(null);
  const [next, setNext] = useState({ a: '', b: '' });
  useEffect(() => {
    if (!resetToken) return;
    api.get(`/auth/reset?t=${encodeURIComponent(resetToken)}`).then(setWho).catch((x) => setErr(x.message));
  }, [resetToken]);
  const forgot = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api.post('/auth/forgot', { email }); setMode('enviado'); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const reset = async (e) => {
    e.preventDefault(); setErr(null);
    if (next.a !== next.b) { setErr('As duas senhas não são iguais.'); return; }
    setBusy(true);
    try { await api.post('/auth/reset', { token: resetToken, password: next.a }); setMode('pronto'); setEmail(who?.email || ''); window.history.replaceState(null, '', '/'); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
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

        {mode === 'esqueci' || mode === 'enviado' ? (
          <form className="lg-form" onSubmit={forgot}>
            <div className="lg-form-head"><span className="lg-meta">Acesso</span><span className="lg-meta">Nova senha</span></div>
            <h2 className="lg-enter">Esqueci<span>.</span></h2>
            {mode === 'enviado' ? (
              <p className="lg-note" role="status">Se <b>{email}</b> tiver acesso à The Bold, um link para criar uma nova senha chega nesse e-mail em instantes. Ele vale por 1 hora. Não chegou? Veja a caixa de spam ou fale com a The Bold.</p>
            ) : (
              <>
                <p className="lg-note">Digite o e-mail do seu acesso. Enviamos um link para você criar uma nova senha.</p>
                <label className="lg-field"><span>E-mail</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="voce@email.com" /></label>
                {err && <div className="lg-err" role="alert">{err}</div>}
                <Button variant="ink" size="lg" magnetic arrow disabled={busy} type="submit" className="lg-cta">{busy ? 'Enviando…' : 'Enviar link'}</Button>
              </>
            )}
            <button type="button" className="lg-link" onClick={() => { setMode('entrar'); setErr(null); }}>← Voltar para entrar</button>
          </form>
        ) : mode === 'redefinir' ? (
          <form className="lg-form" onSubmit={reset}>
            <div className="lg-form-head"><span className="lg-meta">Acesso</span><span className="lg-meta">Nova senha</span></div>
            <h2 className="lg-enter">Nova senha<span>.</span></h2>
            {who && <p className="lg-note">Olá, {who.name}. Escolha uma senha nova com pelo menos 10 caracteres.</p>}
            {who && (
              <>
                <label className="lg-field"><span>Nova senha</span><input type="password" autoComplete="new-password" value={next.a} onChange={(e) => setNext({ ...next, a: e.target.value })} required minLength={10} /></label>
                <label className="lg-field"><span>Repita a nova senha</span><input type="password" autoComplete="new-password" value={next.b} onChange={(e) => setNext({ ...next, b: e.target.value })} required minLength={10} /></label>
              </>
            )}
            {err && <div className="lg-err" role="alert">{err}</div>}
            {who && <Button variant="ink" size="lg" magnetic arrow disabled={busy} type="submit" className="lg-cta">{busy ? 'Salvando…' : 'Salvar nova senha'}</Button>}
            <button type="button" className="lg-link" onClick={() => { window.history.replaceState(null, '', '/'); setMode(err ? 'esqueci' : 'entrar'); setErr(null); }}>{err ? 'Pedir um novo link' : '← Voltar para entrar'}</button>
          </form>
        ) : (
          <form className="lg-form" onSubmit={submit}>
            <div className="lg-form-head"><span className="lg-meta">Acesso</span><span className="lg-meta">01 / 01</span></div>
            <h2 className="lg-enter">Entrar<span>.</span></h2>
            {mode === 'pronto' && <p className="lg-note" role="status">Senha nova salva. Entre com ela.</p>}
            <label className="lg-field"><span>Login</span><input type="text" autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="seu nome ou e-mail" /></label>
            <label className="lg-field"><span>Senha</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••••" /></label>
            {err && <div className="lg-err" role="alert">{err}</div>}
            <Button variant="ink" size="lg" magnetic arrow disabled={busy} type="submit" className="lg-cta" cursor="ENTRAR">{busy ? 'Entrando…' : 'Viver o efeito Bold'}</Button>
            <button type="button" className="lg-link" onClick={() => { setMode('esqueci'); setErr(null); }}>Esqueci minha senha</button>
          </form>
        )}
      </main>

      <div className="lg-marquee" aria-hidden>
        <div className="lg-marquee-in">{[...MARQUEE, ...MARQUEE, ...MARQUEE].map((w, i) => <span key={i}>{w}<em>✦</em></span>)}</div>
      </div>
      <div className="lg-word" aria-hidden>THE BOLD<span>.</span></div>
    </div>
  );
}

// PRIMEIRO ACESSO: quem entrou com a senha inicial da equipe cria a própria senha antes de usar a plataforma
export function FirstPassword({ name, onDone, onLogout }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault(); setErr(null);
    if (a.length < 10) return setErr('A senha precisa ter pelo menos 10 caracteres.');
    if (a !== b) return setErr('As duas senhas não são iguais.');
    setBusy(true);
    try { await api.post('/auth/first-password', { password: a }); await onDone(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="fp">
      <form className="fp-card" onSubmit={save}>
        <span className="fp-k">THE BOLD · Primeiro acesso</span>
        <h1 className="fp-t">Olá, {String(name || '').split(' ')[0]}.</h1>
        <p className="fp-p">Para proteger o seu projeto, crie agora uma senha só sua. A senha que você recebeu vale apenas para este primeiro acesso.</p>
        <label className="fp-f"><span>Nova senha</span><input className="input" type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} minLength={10} required /></label>
        <label className="fp-f"><span>Repita a nova senha</span><input className="input" type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} minLength={10} required /></label>
        <p className="fp-h">Pelo menos 10 caracteres. Dica: uma frase curta fácil de lembrar.</p>
        {err && <div className="fp-err" role="alert">{err}</div>}
        <button className="btn btn-primary" disabled={busy} type="submit">{busy ? 'Salvando…' : 'Criar minha senha e entrar'}</button>
        <button type="button" className="fp-link" onClick={onLogout}>Sair</button>
      </form>
    </div>
  );
}
