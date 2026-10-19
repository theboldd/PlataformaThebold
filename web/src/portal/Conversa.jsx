import { Fragment, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth, useToast } from '../lib/hooks.js';
import { ago } from '../lib/format.js';
import { Loading, Empty, Avatar } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { usePortal } from './PortalApp.jsx';

const withMentions = (text) => text.split(/(@[\p{L}][\p{L}\d_.-]*)/u).map((p, i) => (p.startsWith('@') ? <span key={i} className="p-mention">{p}</span> : <Fragment key={i}>{p}</Fragment>));

export default function Conversa() {
  const auth = useAuth();
  const toast = useToast();
  const { me } = usePortal() || {};
  const [channel, setChannel] = useState(undefined);
  const [msgs, setMsgs] = useState(null);
  const [threads, setThreads] = useState({});
  const [openThread, setOpenThread] = useState(null);
  const [body, setBody] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  const fileIn = useRef(null);
  const load = async (id = channel) => { if (!id) return; const r = await api.get(`/chat/channels/${id}/messages`); setMsgs(r.messages); };
  const loadThread = async (pid) => { const r = await api.get(`/chat/channels/${channel}/messages?parent=${pid}`); setThreads((t) => ({ ...t, [pid]: r.messages })); };
  useEffect(() => { api.get('/portal/channel').then((r) => { setChannel(r.channel_id); if (r.channel_id) load(r.channel_id); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const h = (e) => { if (e.detail?.channel_id === channel) { load(); if (openThread) loadThread(openThread); } };
    window.addEventListener('bold:message', h);
    return () => window.removeEventListener('bold:message', h);
  }); // reassina a cada render para usar o estado atual
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' }); }, [msgs?.length]);

  const send = async (e) => {
    e?.preventDefault();
    if (!body.trim() && !file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('body', body.trim());
    if (file) fd.append('file', file);
    if (openThread) fd.append('parent_id', openThread);
    try { await api.form(`/chat/channels/${channel}/messages`, fd); setBody(''); setFile(null); if (fileIn.current) fileIn.current.value = ''; await load(); if (openThread) loadThread(openThread); }
    catch (x) { toast(x.message, 'err'); } finally { setBusy(false); }
  };
  const team = [...new Map((me?.team || []).map((t) => [t.id, t])).values()];
  const mentionQ = body.match(/@([\p{L}]*)$/u)?.[1];
  const sugg = mentionQ !== undefined ? team.filter((t) => t.name.toLowerCase().startsWith(mentionQ.toLowerCase())).slice(0, 5) : [];

  const Msg = ({ m, inThread }) => {
    const mine = m.author_id === auth.user.id;
    return (
      <div className={`p-msg ${mine ? 'mine' : ''}`}>
        {!mine && <Avatar name={m.author_name} />}
        <div style={{ minWidth: 0 }}>
          <div className="b">
            {!mine && <div className="xs" style={{ color: 'var(--ink-2)', fontWeight: 600, marginBottom: 2 }}>{m.author_name}{m.author_role !== 'cliente' ? ' · The Bold' : ''}</div>}
            {m.body !== '(arquivo)' && withMentions(m.body)}
            {m.file && <a href={m.file.urls.download} className="row gap-2 sm mt-2" style={{ textDecoration: 'underline' }}><I.file size={14} /> {m.file.name}</a>}
          </div>
          <div className="meta">{ago(m.created_at)}{!inThread && <> · <button className="p-link xs" onClick={() => { const n = openThread === m.id ? null : m.id; setOpenThread(n); if (n) loadThread(n); }}>{m.replies ? `${m.replies} resposta(s)` : 'responder'}</button></>}</div>
          {openThread === m.id && !inThread && (
            <div className="p-thread">
              {(threads[m.id] || []).map((r) => <Msg key={r.id} m={r} inThread />)}
              <div className="xs muted">Respondendo nesta conversa · <button className="p-link xs" onClick={() => setOpenThread(null)}>fechar</button></div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-page" style={{ maxWidth: 860 }}>
      <header className="p-page-head" style={{ marginBottom: 18 }}>
        <div className="caps">Fale com a equipe</div>
        <h1 className="ed-xl">Conversa</h1>
      </header>
      {channel === undefined ? <Loading /> : !channel ? <Empty title="Conversa ainda não disponível." /> : (
        <div className="p-chat">
          <div className="p-msgs" ref={box} aria-live="polite">
            {!msgs ? <Loading /> : !msgs.length ? <Empty title="Comece a conversa.">Pergunte, peça, combine. Tudo fica registrado aqui.</Empty> : msgs.map((m) => <Msg key={m.id} m={m} />)}
          </div>
          <form className="p-chat-compose" onSubmit={send}>
            <input ref={fileIn} type="file" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button type="button" className="p-icon-btn" onClick={() => fileIn.current?.click()} aria-label="Anexar arquivo"><I.upload size={18} /></button>
            <div className="grow" style={{ position: 'relative' }}>
              {file && <div className="xs muted mb-2">📎 {file.name} <button type="button" className="p-link xs" onClick={() => setFile(null)}>remover</button></div>}
              {openThread && <div className="xs muted mb-2">Respondendo em thread</div>}
              <textarea rows={1} value={body} onChange={(e) => setBody(e.target.value)} placeholder={team[0] ? `Mensagem · @${team[0].name.split(' ')[0]}` : 'Mensagem…'} aria-label="Mensagem"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} style={{ width: '100%' }} />
              {sugg.length > 0 && <div className="p-mentions">{sugg.map((t) => <button type="button" key={t.id} onClick={() => setBody(body.replace(/@[\p{L}]*$/u, `@${t.name.split(' ')[0]} `))}>@{t.name.split(' ')[0]}</button>)}</div>}
            </div>
            <button className="p-send" disabled={busy || (!body.trim() && !file)} aria-label="Enviar"><I.arrow size={16} /></button>
          </form>
        </div>
      )}
    </div>
  );
}
