import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import '../styles/admin.css';
import { api } from '../lib/api.js';
import { useAuth, useToast } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Avatar, Button, Empty, Field, Loading, Modal, Tag } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { fmtTime, cleanName } from '../lib/format.js';

const TZ = 'America/Sao_Paulo';
const dayKey = (v) => new Date(v).toLocaleDateString('pt-BR', { timeZone: TZ });
function dayLabel(v) {
  const k = dayKey(v);
  if (k === dayKey(Date.now())) return 'Hoje';
  if (k === dayKey(Date.now() - 864e5)) return 'Ontem';
  return new Date(v).toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
}
const CONV_LABEL = { tarefa: 'virou tarefa', pendencia: 'virou pendência', decisao: 'virou decisão', ajuste: 'virou ajuste', evento: 'virou evento' };
const channelTitle = (c) => (c.kind === 'cliente' ? cleanName(c.client_name || c.name) : c.kind === 'direto' ? c.direct_name || 'Conversa direta' : c.name);

function Body({ text }) {
  const parts = String(text).split(/(@[\p{L}][\p{L}\d_.-]*)/u);
  return <div className="body">{parts.map((p, i) => (p.startsWith('@') ? <span key={i} className="mention">{p}</span> : p))}</div>;
}

export default function Comunicacao() {
  const { channelId } = useParams();
  const [sp, setSp] = useSearchParams();
  const threadId = sp.get('thread');
  const nav = useNavigate();
  const [channels, setChannels] = useState(null);
  const [modal, setModal] = useState(null);
  const current = channels?.find((c) => c.id === channelId);
  useCrumbs('Comunicação', current ? channelTitle(current) : null);
  const loadChannels = () => api.get('/chat/channels').then(setChannels).catch(() => setChannels([]));
  useEffect(() => { loadChannels(); const h = () => loadChannels(); window.addEventListener('bold:message', h); return () => window.removeEventListener('bold:message', h); }, []);
  useEffect(() => { if (!channelId && channels?.length && window.innerWidth > 720) nav(`/comunicacao/${[...channels].sort((a, b) => String(b.last?.created_at || '').localeCompare(String(a.last?.created_at || '')))[0].id}`, { replace: true }); }, [channelId, channels]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!channels) return <div className="page"><Loading /></div>;
  const groups = [
    { key: 'interno', label: 'Canais' },
    { key: 'cliente', label: 'Clientes', hint: 'visível ao cliente' },
    { key: 'direto', label: 'Diretas' },
  ];
  return (
    <div className={`chat ${threadId ? 'with-thread' : ''} ${channelId ? '' : 'show-list'}`}>
      <aside className="chat-side" aria-label="Canais">
        <div className="mb-4"><div className="caps">The Bold</div><div className="ed-lg">Chat</div></div>
        {groups.map((g) => (
          <div key={g.key}>
            <h4 className="caps">{g.label}{g.key !== 'cliente' && <button className="btn btn-ghost btn-sm btn-icon" aria-label={g.key === 'interno' ? 'Novo canal' : 'Nova conversa direta'} onClick={() => setModal(g.key)}><I.plus size={14} /></button>}</h4>
            {g.hint && <div className="xs faint mb-2" style={{ marginTop: -4 }}>Conversas oficiais · {g.hint}</div>}
            {channels.filter((c) => c.kind === g.key).map((c) => (
              <button key={c.id} className={`ch-link ${c.id === channelId ? 'active' : ''} ${c.unread ? 'has-unread' : ''}`} onClick={() => nav(`/comunicacao/${c.id}`)}>
                <span className="hash">{c.kind === 'interno' ? (c.is_private ? '◦' : '#') : c.kind === 'cliente' ? '◆' : '·'}</span>
                <span className="clip">{channelTitle(c)}</span>
                {c.unread > 0 && <span className="unread">{c.unread}</span>}
              </button>
            ))}
            {!channels.some((c) => c.kind === g.key) && <div className="xs faint" style={{ padding: '4px 10px' }}>Nenhuma.</div>}
          </div>
        ))}
        <p className="xs faint mt-6" style={{ lineHeight: 1.5 }}>Transição do Slack: avisos-chave podem ser espelhados em um canal do Slack — configure em <Link to="/integracoes" className="bordo">Integrações</Link>. Decisões e pedidos importantes devem virar registro oficial (“Transformar em…”).</p>
      </aside>
      {channelId ? <Conversation key={channelId} channelId={channelId} channel={current} threadId={threadId} openThread={(id) => setSp(id ? { thread: id } : {})} onRead={loadChannels} /> : <div className="chat-main"><Empty title="Escolha uma conversa." /></div>}
      {modal === 'interno' && <NewChannel onClose={() => setModal(null)} onDone={(id) => { setModal(null); loadChannels(); nav(`/comunicacao/${id}`); }} />}
      {modal === 'direto' && <NewDirect onClose={() => setModal(null)} onDone={(id) => { setModal(null); loadChannels(); nav(`/comunicacao/${id}`); }} />}
    </div>
  );
}

function Conversation({ channelId, channel, threadId, openThread, onRead }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [convert, setConvert] = useState(null);
  const [tick, setTick] = useState(0);
  const nav = useNavigate();
  const listRef = useRef(null);
  const load = async () => {
    try { const d = await api.get(`/chat/channels/${channelId}/messages`); setData(d); setErr(null); onRead?.(); } catch (e) { setErr(e); }
  };
  useEffect(() => { load(); const h = (e) => e.detail?.channel_id === channelId && load(); window.addEventListener('bold:message', h); return () => window.removeEventListener('bold:message', h); }, [channelId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [data?.messages?.length]);
  if (err) return <div className="chat-main"><Empty title="Conversa indisponível.">{err.message}</Empty></div>;
  if (!data) return <div className="chat-main" style={{ padding: 32 }}><Loading /></div>;
  const ch = data.channel;
  const isClient = ch.kind === 'cliente';
  return (
    <>
      <section className="chat-main" aria-label="Conversa">
        <header className="chat-head">
          <Button variant="ghost" size="sm" className="back-btn" icon={<I.back />} onClick={() => nav('/comunicacao')} aria-label="Voltar aos canais" />
          <div className="grow">
            <div className="row gap-2 wrap"><span className="ed-md">{ch.kind === 'interno' ? `#${ch.name}` : channelTitle(channel || ch)}</span>{isClient && <span className="client-flag">◆ Visível ao cliente</span>}</div>
            {ch.topic && <div className="xs muted mt-2">{ch.topic}</div>}
          </div>
          <span className="xs faint">{data.people.length} pessoas</span>
        </header>
        <div className="msgs" ref={listRef}>
          {!data.messages.length && <Empty title="Comece a conversa.">{isClient ? 'Tudo que for escrito aqui fica no histórico do cliente.' : 'Use @ para mencionar alguém.'}</Empty>}
          <MessageList messages={data.messages} onThread={openThread} onConvert={setConvert} />
        </div>
        <Composer channelId={channelId} people={data.people} onSent={load} placeholder={isClient ? `Mensagem para ${channelTitle(channel || ch)} (o cliente vê)` : `Mensagem em ${ch.kind === 'interno' ? '#' + ch.name : 'conversa'}`} />
      </section>
      {threadId && <Thread tick={tick} channelId={channelId} threadId={threadId} people={data.people} onClose={() => openThread(null)} onConvert={setConvert} />}
      {convert && <ConvertModal msg={convert} channel={ch} onClose={() => setConvert(null)} onDone={() => { setConvert(null); load(); setTick((t) => t + 1); }} />}
    </>
  );
}

function MessageList({ messages, onThread, onConvert, inThread }) {
  let lastDay = null, lastAuthor = null, lastAt = 0;
  return messages.map((m) => {
    const day = dayKey(m.created_at);
    const newDay = day !== lastDay;
    const grouped = !newDay && lastAuthor === m.author_id && new Date(m.created_at) - lastAt < 5 * 60e3;
    lastDay = day; lastAuthor = m.author_id; lastAt = new Date(m.created_at);
    return (
      <div key={m.id}>
        {newDay && <div className="day-sep"><span>{dayLabel(m.created_at)}</span></div>}
        <article className="msg" style={grouped ? { paddingTop: 0 } : null}>
          <div className="gutter">{!grouped ? <Avatar name={m.author_name} tone={m.author_role === 'cliente' ? 'ink' : ''} /> : <span className="xs faint" style={{ display: 'block', paddingTop: 4 }}>{fmtTime(m.created_at)}</span>}</div>
          <div className="grow">
            {!grouped && <div className="head"><span className="author">{m.author_name}</span>{m.author_role === 'cliente' && <span className="client-author">cliente</span>}<span className="xs faint">{fmtTime(m.created_at)}</span></div>}
            <Body text={m.body} />
            {m.file && (
              <a className="att" href={m.file.urls.original} target="_blank" rel="noreferrer">
                {m.file.kind === 'image' ? <img src={m.file.urls.thumb || m.file.urls.original} alt={m.file.name} /> : <><I.file size={16} /> {m.file.name}</>}
              </a>
            )}
            {m.converted_to?.length > 0 && <div className="chips">{m.converted_to.map((c, i) => <Tag key={i} tone="bordo">✓ {CONV_LABEL[c.type] || c.type} · {c.by}</Tag>)}</div>}
            {!inThread && m.replies > 0 && <button className="replies" onClick={() => onThread(m.id)}>{m.replies} resposta{m.replies > 1 ? 's' : ''} →</button>}
          </div>
          <div className="actions">
            {!inThread && <Button size="sm" variant="ghost" icon={<I.comment size={14} />} onClick={() => onThread(m.id)} aria-label="Responder em thread" title="Responder em thread" />}
            <Button size="sm" variant="ghost" onClick={() => onConvert(m)} title="Transformar em registro oficial">Transformar em…</Button>
          </div>
        </article>
      </div>
    );
  });
}

function Composer({ channelId, parentId, people, onSent, placeholder }) {
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mq, setMq] = useState(null);
  const [sel, setSel] = useState(0);
  const ta = useRef(null);
  const toast = useToast();
  const auth = useAuth();
  const matches = useMemo(() => {
    if (mq == null) return [];
    const f = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return people.filter((p) => p.id !== auth.user.id && f(p.name).startsWith(f(mq))).slice(0, 6);
  }, [mq, people, auth.user.id]);
  const onChange = (e) => {
    setText(e.target.value);
    const before = e.target.value.slice(0, e.target.selectionStart);
    const m = before.match(/@([\p{L}\d_.-]*)$/u);
    setMq(m ? m[1] : null); setSel(0);
    e.target.style.height = 'auto'; e.target.style.height = `${Math.min(160, e.target.scrollHeight)}px`;
  };
  const pick = (p) => {
    const el = ta.current; const pos = el.selectionStart;
    const before = text.slice(0, pos).replace(/@([\p{L}\d_.-]*)$/u, `@${p.name.split(' ')[0]} `);
    flushSync(() => { setText(before + text.slice(pos)); setMq(null); });
    el.focus(); el.selectionStart = el.selectionEnd = before.length;
  };
  const send = async () => {
    if ((!text.trim() && !file) || busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('body', text.trim()); if (parentId) fd.append('parent_id', parentId); if (file) fd.append('file', file);
    try { await api.form(`/chat/channels/${channelId}/messages`, fd); setText(''); setFile(null); if (ta.current) ta.current.style.height = 'auto'; onSent?.(); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const onKey = (e) => {
    if (matches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => (s + 1) % matches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => (s - 1 + matches.length) % matches.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(matches[sel]); return; }
      if (e.key === 'Escape') { setMq(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };
  return (
    <div className="composer">
      {matches.length > 0 && <div className="mention-pop" role="listbox">{matches.map((p, i) => <button key={p.id} className={i === sel ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); pick(p); }}><Avatar name={p.name} tone={p.role_key === 'cliente' ? 'ink' : ''} /> {p.name}</button>)}</div>}
      {file && <div className="row gap-2 mb-2 sm"><I.file size={14} /> {file.name} <button className="btn btn-ghost btn-sm" onClick={() => setFile(null)}>remover</button></div>}
      <div className="composer-box">
        <textarea ref={ta} rows={1} value={text} onChange={onChange} onKeyDown={onKey} placeholder={placeholder} aria-label="Escrever mensagem" />
        <label className="btn btn-ghost btn-sm btn-icon" title="Anexar arquivo" style={{ cursor: 'pointer' }}><I.upload size={15} /><input type="file" hidden onChange={(e) => setFile(e.target.files[0] || null)} /></label>
        <Button size="sm" variant="primary" onClick={send} disabled={busy || (!text.trim() && !file)} aria-label="Enviar">Enviar</Button>
      </div>
      <div className="xs faint mt-2">Enter envia · Shift+Enter quebra linha · @ menciona</div>
    </div>
  );
}

function Thread({ channelId, threadId, people, onClose, onConvert, tick }) {
  const [data, setData] = useState(null);
  const load = () => api.get(`/chat/channels/${channelId}/messages?parent=${threadId}`).then(setData).catch(() => setData({ messages: [], parent: null }));
  useEffect(() => { load(); const h = (e) => e.detail?.channel_id === channelId && load(); window.addEventListener('bold:message', h); return () => window.removeEventListener('bold:message', h); }, [threadId, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <aside className="thread" aria-label="Thread">
      <header className="chat-head" style={{ padding: '16px' }}><div className="grow"><div className="caps">Thread</div></div><Button variant="ghost" size="sm" icon={<I.x />} onClick={onClose} aria-label="Fechar thread" /></header>
      <div className="msgs">
        {!data ? <Loading rows={3} /> : (
          <>
            {data.parent && <MessageList messages={[data.parent]} inThread onConvert={onConvert} />}
            <div className="xs faint" style={{ margin: '10px 0' }}>{data.messages.length} resposta(s)</div>
            <MessageList messages={data.messages} inThread onConvert={onConvert} />
          </>
        )}
      </div>
      <Composer channelId={channelId} parentId={threadId} people={people} onSent={load} placeholder="Responder na thread" />
    </aside>
  );
}

function ConvertModal({ msg, channel, onClose, onDone }) {
  const toast = useToast();
  const [type, setType] = useState('tarefa');
  const [f, setF] = useState({ title: msg.body.slice(0, 160), assignee_id: '', due_at: '', client_id: channel.client_id || '', content_id: '', starts_at: '', waiting_on: 'cliente' });
  const [people, setPeople] = useState([]);
  const [clients, setClients] = useState([]);
  const [contents, setContents] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/users/directory').then(setPeople).catch(() => {}); api.get('/clients').then(setClients).catch(() => {}); }, []);
  useEffect(() => { if (f.client_id && ['ajuste', 'pendencia'].includes(type)) api.get(`/contents?client_id=${f.client_id}`).then(setContents).catch(() => setContents([])); }, [f.client_id, type]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    setBusy(true);
    try {
      const body = { type, title: f.title, client_id: f.client_id || null };
      if (['tarefa', 'pendencia'].includes(type)) Object.assign(body, { assignee_id: f.assignee_id || null, due_at: f.due_at || null, content_id: f.content_id || null, waiting_on: f.waiting_on });
      if (type === 'ajuste') body.content_id = f.content_id;
      if (type === 'evento') body.starts_at = f.starts_at;
      await api.post(`/chat/messages/${msg.id}/convert`, body);
      toast(`Registrado: ${CONV_LABEL[type].replace('virou ', '')}`);
      onDone();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const TYPES = [['tarefa', 'Tarefa'], ['pendencia', 'Pendência'], ['decisao', 'Decisão'], ['ajuste', 'Ajuste'], ['evento', 'Evento']];
  return (
    <Modal open title="Transformar em registro oficial" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" magnetic onClick={submit} disabled={busy}>{busy ? 'Registrando…' : 'Registrar'}</Button></>}>
      <blockquote className="note mb-5" style={{ margin: '0 0 20px' }}>“{msg.body.slice(0, 280)}” <span className="xs faint">— {msg.author_name}</span></blockquote>
      <div className="seg mb-5" role="group">{TYPES.map(([k, l]) => <button key={k} className={type === k ? 'active' : ''} onClick={() => setType(k)}>{l}</button>)}</div>
      <div className="col gap-4">
        {type !== 'ajuste' && <Field label="Título"><input className="input" value={f.title} onChange={set('title')} /></Field>}
        {(!channel.client_id || type === 'decisao') && (
          <Field label={type === 'decisao' ? 'Cliente (decisão vai para o Client Brain)' : 'Cliente (opcional)'}>
            <select className="select" value={f.client_id} onChange={set('client_id')} disabled={!!channel.client_id}><option value="">—</option>{clients.map((c) => <option key={c.id} value={c.id}>{cleanName(c.name)}</option>)}</select>
          </Field>
        )}
        {['tarefa', 'pendencia'].includes(type) && (
          <div className="grid-2">
            <Field label="Responsável"><select className="select" value={f.assignee_id} onChange={set('assignee_id')}><option value="">Sem responsável</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Prazo"><input className="input" type="datetime-local" value={f.due_at} onChange={set('due_at')} /></Field>
          </div>
        )}
        {(type === 'ajuste' || (type === 'pendencia' && f.client_id)) && (
          <Field label={type === 'ajuste' ? 'Conteúdo do ajuste' : 'Conteúdo bloqueado por esta pendência (opcional)'} hint={type === 'ajuste' ? 'Ajustes entram em conteúdos em revisão ou aguardando o cliente.' : 'O conteúdo fica bloqueado com o motivo até ser resolvido.'}>
            <select className="select" value={f.content_id} onChange={set('content_id')}><option value="">{f.client_id ? 'Selecione…' : 'Escolha o cliente primeiro'}</option>{contents.map((c) => <option key={c.id} value={c.id}>#{c.number} {c.title} — {c.stage_label}</option>)}</select>
          </Field>
        )}
        {type === 'evento' && <Field label="Data e hora"><input className="input" type="datetime-local" value={f.starts_at} onChange={set('starts_at')} /></Field>}
        {type === 'decisao' && <p className="xs muted">A decisão fica registrada na memória do cliente (Client Brain) com a origem desta mensagem.</p>}
      </div>
    </Modal>
  );
}

function NewChannel({ onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', topic: '', is_private: false });
  const submit = async () => { try { const c = await api.post('/chat/channels', f); onDone(c.id); } catch (e) { toast(e.message, 'err'); } };
  return (
    <Modal open title="Novo canal" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit}>Criar canal</Button></>}>
      <div className="col gap-4">
        <Field label="Nome"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="ex.: lancamentos-dezembro" autoFocus /></Field>
        <Field label="Propósito"><input className="input" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} /></Field>
        <label className="check"><input type="checkbox" checked={f.is_private} onChange={(e) => setF({ ...f, is_private: e.target.checked })} /> Canal privado (só membros)</label>
      </div>
    </Modal>
  );
}
function NewDirect({ onClose, onDone }) {
  const auth = useAuth();
  const toast = useToast();
  const [people, setPeople] = useState([]);
  useEffect(() => { api.get('/users/directory').then((p) => setPeople(p.filter((x) => x.id !== auth.user.id))); }, [auth.user.id]);
  const open = async (id) => { try { const c = await api.post('/chat/channels', { kind: 'direto', members: [id] }); onDone(c.id); } catch (e) { toast(e.message, 'err'); } };
  return (
    <Modal open title="Conversa direta" onClose={onClose}>
      <div className="list">{people.map((p) => <button key={p.id} className="list-item link" style={{ width: '100%', border: 0, borderBottom: '1px solid var(--line)', background: 'none', cursor: 'pointer', textAlign: 'left' }} onClick={() => open(p.id)}><Avatar name={p.name} /><span className="grow">{p.name}</span><span className="xs muted">{p.title || p.role_key}</span></button>)}</div>
    </Modal>
  );
}
