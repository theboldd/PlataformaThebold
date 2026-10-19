import { useState } from 'react';
import { api } from '../lib/api.js';
import { Button, Field } from '../components/ui.jsx';

const DEMO = [
  ['rebeca@thebold.demo', 'Rebeca · CEO'], ['vitoria@thebold.demo', 'Vitória · Operações'], ['vivian@thebold.demo', 'Vivian · Gestão'], ['raisa@thebold.demo', 'Raísa · Qualidade'],
  ['juliane@thebold.demo', 'Juliane · Estratégia'], ['felipe@thebold.demo', 'Felipe · Design'], ['leo@thebold.demo', 'Léo · Edição'], ['matheus@thebold.demo', 'Matheus · Comercial'],
  ['helena@cliente.demo', 'Cliente · Dra. Helena'], ['vertice@cliente.demo', 'Cliente · Vértice'],
];

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api.post('/auth/login', { email, password }); await onLogin(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="login">
      <div className="login-art">
        <div className="glow" aria-hidden />
        <div className="row" style={{ position: 'relative' }}><span className="ed" style={{ fontSize: 28 }}>THE BOLD<span style={{ color: '#C9708A' }}>.</span></span><span className="caps" style={{ color: 'rgba(246,243,240,.5)' }}>Operating System</span></div>
        <div className="big" style={{ position: 'relative' }}>O sistema<br />sabe o que<br /><i>precisa acontecer.</i></div>
        <div className="caps" style={{ color: 'rgba(246,243,240,.45)', position: 'relative' }}>Estratégia · Produção · Aprovação · Operação</div>
      </div>
      <form className="login-form" onSubmit={submit}>
        <div><div className="caps">Acesso</div><h1 className="ed-xl mt-2">Entrar</h1></div>
        <Field label="E-mail"><input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="Senha"><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        {err && <div className="hint-err" role="alert">{err}</div>}
        <Button variant="primary" size="lg" magnetic arrow disabled={busy} type="submit">{busy ? 'Entrando…' : 'Entrar'}</Button>
        <details className="sm muted" style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
          <summary style={{ cursor: 'pointer' }}>Ambiente de demonstração — perfis de teste</summary>
          <p className="xs">Senha de todos: <code>thebold2026</code>. Dados de clientes são fictícios [DEMO].</p>
          <div className="row wrap gap-2">{DEMO.map(([e, l]) => <button type="button" key={e} className="tag" style={{ cursor: 'pointer', background: 'none' }} onClick={() => { setEmail(e); setPassword('thebold2026'); }}>{l}</button>)}</div>
        </details>
      </form>
    </div>
  );
}
