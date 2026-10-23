import { useState } from 'react';
import '../styles/admin.css';
import { api } from '../lib/api.js';
import { useAuth, useToast } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Avatar, Button, Field, PageHead, Section, Seg, Tag } from '../components/ui.jsx';
import { FUNCTIONS } from '../lib/status.js';
import { ago } from '../lib/format.js';
import { saveTheme } from '../lib/theme.js';
import NotificationPrefs from '../components/NotificationPrefs.jsx';

export default function Perfil() {
  useCrumbs('Perfil');
  const auth = useAuth();
  const toast = useToast();
  const [theme, setTheme] = useState(auth.user.theme || 'system');
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const u = auth.user;
  const changePw = async (e) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) return toast('As senhas novas não conferem.', 'err');
    try { await api.post('/auth/password', { current: pw.current, next: pw.next }); toast('Senha alterada'); setPw({ current: '', next: '', confirm: '' }); } catch (x) { toast(x.message, 'err'); }
  };
  const mods = Object.entries(auth.permissions);
  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <PageHead kicker="Sua conta" title={u.name} sub={`${auth.role.label}${u.title ? ` · ${u.title}` : ''}`}><Avatar name={u.name} size="lg" /></PageHead>
      <div className="grid-2">
        <div>
          <Section title="Dados">
            <ul className="list">
              <li><span className="caps" style={{ width: 120 }}>E-mail</span><span>{u.email}</span></li>
              <li><span className="caps" style={{ width: 120 }}>Perfil</span><span>{auth.role.label}</span></li>
              {u.functions?.length > 0 && <li><span className="caps" style={{ width: 120 }}>Funções</span><span className="row wrap gap-2">{u.functions.map((f) => <Tag key={f}>{FUNCTIONS[f] || f}</Tag>)}</span></li>}
              <li><span className="caps" style={{ width: 120 }}>Clientes</span><span>{auth.role.all_clients ? 'Todos os clientes' : 'Somente clientes vinculados'}</span></li>
              <li><span className="caps" style={{ width: 120 }}>Último acesso</span><span>{u.last_login_at ? ago(u.last_login_at) : '—'}</span></li>
            </ul>
          </Section>
          <Section title="Aparência">
            <Seg label="Tema" value={theme} onChange={(t) => { setTheme(t); saveTheme(t); }} options={[{ value: 'system', label: 'Padrão (escuro)' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Escuro' }]} />
            <p className="xs faint mt-4">Preferência salva neste navegador.</p>
          </Section>
        </div>
        <div>
          <Section title="Alterar senha">
            <form className="col gap-4" onSubmit={changePw}>
              <Field label="Senha atual"><input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Field>
              <Field label="Nova senha" hint="Mínimo 10 caracteres"><input className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required minLength={10} /></Field>
              <Field label="Confirmar nova senha"><input className="input" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required /></Field>
              <Button variant="ink" type="submit">Alterar senha</Button>
            </form>
          </Section>
          <Section title="Seus acessos">
            <ul className="list">{mods.map(([m, acts]) => <li key={m} className="sm"><span className="grow">{m}</span><span className="xs muted">{acts.join(' · ')}</span></li>)}</ul>
          </Section>
        </div>
      </div>
      {u.role_key !== 'cliente' && <NotificationPrefs />}
      <div className="row end mt-7"><Button variant="danger" onClick={auth.logout}>Sair da conta</Button></div>
    </div>
  );
}
