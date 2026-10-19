import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useApi, useToast } from '../../lib/hooks.js';
import { Avatar, Button, Empty } from '../../components/ui.jsx';
import { ago, firstName } from '../../lib/format.js';

// Comentários da equipe: visibilidade "cliente vê" ou "interno". @Nome / @Designer notificam.
export function Comments({ contentId, comments, onChange, mediaCount = 0 }) {
  const toast = useToast();
  const { data: people } = useApi('/users/directory', [], { live: false });
  const [body, setBody] = useState('');
  const [vis, setVis] = useState('internal');
  const [page, setPage] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.post(`/contents/${contentId}/comments`, { body, visibility: replyTo ? replyTo.visibility : vis, parent_id: replyTo?.id, anchor: page ? { page: Number(page) } : null });
      setBody(''); setReplyTo(null); setPage(''); onChange?.();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const roots = comments.filter((c) => !c.parent_id);
  const replies = (id) => comments.filter((c) => c.parent_id === id);
  const one = (c, reply) => (
    <div key={c.id} className={`comment ${c.visibility === 'internal' ? 'internal' : ''} ${reply ? 'reply' : ''}`}>
      <div className="head">
        <Avatar name={c.author_name} tone={c.author_role === 'cliente' ? 'ink' : undefined} />
        <b style={{ color: 'var(--ink)' }}>{c.author_name}</b>
        {c.author_role === 'cliente' && <span className="tag tag-warn">cliente</span>}
        {c.visibility === 'internal' && <span className="tag tag-bordo">interno</span>}
        {c.anchor?.page && <span className="tag">página {c.anchor.page}</span>}
        {c.anchor?.t != null && <span className="tag">{Math.floor(c.anchor.t / 60)}:{String(Math.floor(c.anchor.t % 60)).padStart(2, '0')}</span>}
        {c.version_number && <span className="faint">V{c.version_number}</span>}
        <span className="faint" style={{ marginLeft: 'auto' }}>{ago(c.created_at)}</span>
      </div>
      <div className="body">{c.body}</div>
      {!reply && <button className="btn btn-ghost btn-sm" style={{ marginTop: 4, marginLeft: -10 }} onClick={() => setReplyTo(c)}>Responder</button>}
      {replies(c.id).map((r) => one(r, true))}
    </div>
  );
  return (
    <div>
      {!roots.length ? <Empty title="Sem comentários.">Comentários marcados como “cliente vê” aparecem no feed do cliente.</Empty> : roots.map((c) => one(c))}
      <div className="col gap-2 mt-4">
        {replyTo && <div className="xs muted row">Respondendo a {replyTo.author_name} ({replyTo.visibility === 'internal' ? 'interno' : 'cliente vê'}) <button className="btn btn-ghost btn-sm" onClick={() => setReplyTo(null)}>cancelar</button></div>}
        <textarea className="textarea" placeholder="Escreva um comentário… use @ para mencionar (ex.: @Felipe, @Designer)" value={body} onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }} aria-label="Novo comentário" />
        {people && <div className="row wrap gap-1">{people.slice(0, 12).map((p) => <button key={p.id} type="button" className="tag" style={{ cursor: 'pointer', background: 'none' }} onClick={() => setBody((b) => `${b}${b && !b.endsWith(' ') ? ' ' : ''}@${firstName(p.name)} `)}>@{firstName(p.name)}</button>)}</div>}
        <div className="row between wrap">
          <div className="row gap-2">
            {!replyTo && <div className="seg" role="group" aria-label="Visibilidade"><button className={vis === 'internal' ? 'active' : ''} onClick={() => setVis('internal')}>Interno</button><button className={vis === 'client' ? 'active' : ''} onClick={() => setVis('client')}>Cliente vê</button></div>}
            {mediaCount > 1 && !replyTo && <select className="select" style={{ width: 'auto', minHeight: 32, padding: '4px 8px', fontSize: 12 }} value={page} onChange={(e) => setPage(e.target.value)} aria-label="Página do carrossel"><option value="">Página…</option>{Array.from({ length: mediaCount }).map((_, i) => <option key={i} value={i + 1}>Página {i + 1}</option>)}</select>}
          </div>
          <Button variant="ink" size="sm" disabled={busy || !body.trim()} onClick={send}>Comentar</Button>
        </div>
      </div>
    </div>
  );
}
