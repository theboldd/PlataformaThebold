import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth, useToast } from '../lib/hooks.js';
import { cleanName } from '../lib/format.js';
import { Button, Field, Avatar } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { usePortal } from './PortalApp.jsx';

export default function Perfil() {
  const auth = useAuth();
  const toast = useToast();
  const { client } = usePortal() || {};
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api.post('/auth/password', { current: cur, next }); setCur(''); setNext(''); toast('Senha alterada.'); } catch (x) { toast(x.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="p-page" style={{ maxWidth: 640 }}>
      <header className="p-page-head row gap-4">
        <Avatar name={auth.user.name} size="lg" />
        <div><div className="caps">{cleanName(client?.name || '')}</div><h1 className="ed-xl">{auth.user.name.replace(' (cliente)', '')}</h1><div className="sm muted">{auth.user.email}</div></div>
      </header>
      <form onSubmit={save} className="col gap-4">
        <h2 className="ed-md">Alterar senha</h2>
        <Field label="Senha atual"><input className="input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required /></Field>
        <Field label="Nova senha" hint="Mínimo de 10 caracteres."><input className="input" type="password" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required /></Field>
        <div><Button variant="primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar nova senha'}</Button></div>
      </form>
      <hr className="rule" />
      <Button onClick={auth.logout} icon={<I.logout size={16} />}>Sair da conta</Button>
    </div>
  );
}
