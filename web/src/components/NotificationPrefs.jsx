// Perfil → Notificações: a própria pessoa escolhe o que chega por categoria e canal.
// URGENTE sempre chega na plataforma. E-mail depende do servidor (Resend); push ainda não existe — estados honestos.
import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApi, useToast } from '../lib/hooks.js';
import { Section, Loading, ErrorBox, Button } from './ui.jsx';
import { StateTag } from './State.jsx';

const Switch = ({ on, onClick, label, disabled }) => <button type="button" className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={!!on} aria-label={label} disabled={disabled} onClick={onClick} />;

export default function NotificationPrefs() {
  const toast = useToast();
  const { data, error, setData } = useApi('/me/notification-prefs', [], { live: false });
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  if (error) return <Section title="Notificações"><ErrorBox error={error} /></Section>;
  if (!data) return <Section title="Notificações"><Loading rows={3} /></Section>;
  const cur = draft || { categories: Object.fromEntries(data.categories.map((c) => [c.key, { platform: c.platform, email: c.email }])), group_similar: data.group_similar };
  const set = (k, ch) => setDraft({ ...cur, categories: { ...cur.categories, [k]: { ...cur.categories[k], [ch]: !cur.categories[k][ch] } } });
  const emailOn = data.channels.email.state === 'ativo';
  const save = async () => {
    setBusy(true);
    try { setData(await api.put('/me/notification-prefs', cur)); setDraft(null); toast('Preferências salvas.'); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Section title="Notificações" kicker="O que chega para você">
      <ul className="list">
        <li className="sm"><span className="grow strong">Canais</span></li>
        <li className="sm"><span className="grow">Plataforma</span><StateTag s="ativo" /></li>
        <li className="sm"><span className="grow">E-mail{!emailOn && <div className="xs muted">Sua escolha fica salva e passa a valer quando o e-mail for configurado.</div>}</span><StateTag s={data.channels.email.state} /></li>
        <li className="sm"><span className="grow">Push (celular/navegador)</span><StateTag s="em_desenvolvimento" /></li>
      </ul>
      <div className="row between mt-5 mb-2"><span className="caps">Categoria</span><span className="row" style={{ gap: 18 }}><span className="caps" style={{ width: 84, textAlign: 'center' }}>Plataforma</span><span className="caps" style={{ width: 60, textAlign: 'center' }}>E-mail</span></span></div>
      <ul className="list">
        {data.categories.map((c) => (
          <li key={c.key} className="sm">
            <span className="grow">{c.label}</span>
            <span className="row" style={{ gap: 18 }}>
              <span style={{ width: 84, display: 'flex', justifyContent: 'center' }}><Switch on={cur.categories[c.key].platform} onClick={() => set(c.key, 'platform')} label={`${c.label}: plataforma`} /></span>
              <span style={{ width: 60, display: 'flex', justifyContent: 'center' }}><Switch on={cur.categories[c.key].email} onClick={() => set(c.key, 'email')} label={`${c.label}: e-mail`} /></span>
            </span>
          </li>
        ))}
        <li className="sm"><span className="grow">Agrupar notificações parecidas não lidas<div className="xs muted">Ex.: várias mensagens da mesma conversa viram uma notificação com contador.</div></span><Switch on={cur.group_similar} onClick={() => setDraft({ ...cur, group_similar: !cur.group_similar })} label="Agrupar notificações parecidas" /></li>
      </ul>
      <p className="xs faint mt-4">{data.channels.plataforma.note}</p>
      <div className="row end mt-4"><Button variant="ink" disabled={busy || !draft} onClick={save}>Salvar preferências</Button></div>
    </Section>
  );
}
