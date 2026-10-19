// FEED — "Meu conteúdo". Conteúdo → legenda → interação → comentários → aprovação → próximo conteúdo.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import { useApi, useToast } from '../lib/hooks.js';
import { fmtDate, fmtDateTime, fmtMonth, ago, cleanName, initials } from '../lib/format.js';
import { FORMATS } from '../lib/status.js';
import { Button, Status, Modal, Empty, Loading, ErrorBox } from '../components/ui.jsx';
import { MediaView, currentVideoTime } from '../components/MediaView.jsx';
import { I } from '../components/Icons.jsx';
import { usePortal } from './PortalApp.jsx';

const FILTERS = [
  { value: '', label: 'Todos' }, { value: 'aguardando', label: 'Aguardando aprovação' }, { value: 'aprovados', label: 'Aprovados' },
  { value: 'ajuste', label: 'Em ajuste' }, { value: 'agendados', label: 'Agendados' }, { value: 'publicados', label: 'Publicados' },
];

export default function Feed() {
  const { me, reloadMe } = usePortal() || {};
  const [filter, setFilter] = useState('');
  const [month, setMonth] = useState('');
  const [format, setFormat] = useState('');
  const qs = new URLSearchParams(Object.entries({ filter, month, format }).filter(([, v]) => v)).toString();
  const feed = useApi(`/portal/feed${qs ? `?${qs}` : ''}`, []);
  const items = feed.data?.items || [];
  const counts = me?.counts || {};
  const total = (counts.aguardando || 0) + (counts.em_ajuste || 0) + (counts.aprovados || 0) + (counts.publicados || 0);
  const pending = counts.aguardando || 0;

  const replace = (it) => feed.setData((d) => ({ ...d, items: d.items.map((x) => (x.id === it.id ? it : x)) }));
  const afterDecision = (it) => { replace(it); reloadMe?.(); };

  return (
    <div className="p-page p-feed">
      <header className="p-feed-head">
        <div className="caps">Meu conteúdo</div>
        <h1 className="ed-xl">Feed</h1>
        <p className="p-lede">É aqui que você vê e aprova tudo que a The Bold está criando para você.</p>
        {total > 0 && (
          <div className="p-progress" aria-live="polite">
            <div className="row between sm">
              <span>{pending > 0 ? <><b className="num p-progress-n">{pending}</b> de {total} aguardando sua aprovação</> : counts.em_ajuste ? <>Nada aguardando você agora. <span className="muted">{counts.em_ajuste} em ajuste pela equipe.</span></> : <>Tudo aprovado por aqui. <span className="muted">Obrigado!</span></>}</span>
              {pending > 0 && filter !== 'aguardando' && <button className="p-link" onClick={() => setFilter('aguardando')}>Ver só os pendentes</button>}
            </div>
            <div className="p-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={total - pending}><span style={{ width: `${((total - pending) / total) * 100}%` }} /></div>
          </div>
        )}
      </header>

      <div className="p-filters" role="toolbar" aria-label="Filtros do feed">
        <div className="p-chips">
          {FILTERS.map((f) => <button key={f.value} className={filter === f.value ? 'active' : ''} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>{f.label}</button>)}
        </div>
        <div className="row gap-2">
          <select className="p-select" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mês">
            <option value="">Todos os meses</option>
            {(feed.data?.months || []).map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
          </select>
          <select className="p-select" value={format} onChange={(e) => setFormat(e.target.value)} aria-label="Formato">
            <option value="">Todos os formatos</option>
            {Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      <ErrorBox error={feed.error} />
      {feed.loading && !feed.data ? <div className="p-post"><Loading rows={6} /></div> : !items.length ? (
        <Empty title={filter === 'aguardando' ? 'Nada aguardando você.' : 'Nenhum conteúdo aqui ainda.'}>{filter === 'aguardando' ? 'Assim que novos conteúdos estiverem prontos, eles aparecem aqui e você recebe uma notificação.' : 'Tente outro filtro.'}</Empty>
      ) : (
        <div className="p-stream">
          {items.map((it) => <Post key={it.id} it={it} team={me?.team || []} onUpdate={replace} onDecided={afterDecision} />)}
          <div className="p-end caps">Você chegou ao fim · THE BOLD<span className="bordo">.</span></div>
        </div>
      )}
    </div>
  );
}

function Post({ it, team, onUpdate, onDecided }) {
  const toast = useToast();
  const root = useRef(null);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [justApproved, setJustApproved] = useState(null);
  const [showComments, setShowComments] = useState(it.comments.length > 0 && it.comments.length <= 3);
  const media = it.version?.media || [];
  const isVideo = media[0]?.kind === 'video';
  const caption = it.version?.caption || '';
  const long = caption.length > 180 || caption.split('\n').length > 3;

  const approve = async () => {
    setBusy(true);
    try {
      const updated = await api.post(`/portal/contents/${it.id}/approve`);
      setJustApproved({ v: updated.version?.number, at: new Date() });
      onDecided(updated);
      // conduz suavemente para o próximo conteúdo pendente
      setTimeout(() => {
        const next = [...document.querySelectorAll('[data-pending="1"]')].find((el) => el.compareDocumentPosition(root.current) & Node.DOCUMENT_POSITION_PRECEDING);
        next?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      }, 1600);
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  const approved = it.version?.approved || (it.approval && ['agendamento', 'agendado', 'publicado'].includes(it.stage)) || (it.is_theme === false && it.status === 'aprovado');
  return (
    <article className={`p-post ${justApproved ? 'is-approved' : ''}`} ref={root} data-pending={it.can_decide ? '1' : '0'} aria-labelledby={`t-${it.id}`}>
      <header className="p-post-head">
        <span className="p-brand-avatar" aria-hidden>{initials(cleanName(it.brand.name))}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="p-brand-name clip">{cleanName(it.brand.name)}</div>
          <div className="xs muted clip">{it.brand.handle || 'Instagram'} · {FORMATS[it.format]}</div>
        </div>
        <Status s={it.status} label={it.status === 'aguardando_cliente' ? 'Aguardando você' : undefined} />
      </header>

      {it.is_theme ? (
        <div className="p-theme">
          <div className="caps">Tema para aprovação · {FORMATS[it.format]}</div>
          <h2 className="ed-lg" id={`t-${it.id}`}>{it.title}</h2>
          {it.theme && it.theme !== it.title && <p className="p-theme-line"><span className="caps">Tema</span>{it.theme}</p>}
          {it.objective && <p className="p-theme-line"><span className="caps">Objetivo</span>{it.objective}</p>}
          {it.reference && <p className="p-theme-line"><span className="caps">Referência</span>{it.reference}</p>}
          <p className="p-theme-line"><span className="caps">Publicação prevista</span>{fmtDate(it.planned_at, { weekday: 'short' })}</p>
          <div className="p-theme-mark ed" aria-hidden>“</div>
        </div>
      ) : (
        <div className="p-media"><MediaView media={media} dark rounded={false} onPage={setPage} /></div>
      )}

      <div className="p-post-body">
        {!it.is_theme && (
          <div className="row between p-meta">
            <button className="p-icon-text" onClick={() => setShowComments((s) => !s)} aria-expanded={showComments}><I.comment size={18} /> {it.comments.length || ''}<span className="sr-only"> comentários</span></button>
            <span className="xs muted">Publicação prevista · <b className="p-ink">{fmtDate(it.scheduled_at || it.planned_at, { weekday: 'short' })}</b></span>
          </div>
        )}
        {!it.is_theme && <h2 className="p-title ed" id={`t-${it.id}`}>#{it.number} {it.title}</h2>}
        {caption && (
          <div className={`p-caption ${expanded || !long ? 'open' : ''}`}>
            <b>{it.brand.handle?.replace('@', '') || cleanName(it.brand.name)}</b> {caption}
          </div>
        )}
        {caption && long && <button className="p-link" onClick={() => setExpanded((e) => !e)}>{expanded ? 'mostrar menos' : 'mais'}</button>}
        {it.version && <div className="xs faint mt-2">Versão V{it.version.number}{it.version.approved ? ' · ✓ versão aprovada' : ''}</div>}

        {it.open_adjustments?.length > 0 && (
          <div className="p-adjust-note">
            <div className="caps">Ajuste em andamento</div>
            {it.open_adjustments.map((a, i) => <p key={i} className="sm">{a.carousel_page ? <b>Página {a.carousel_page}: </b> : null}{a.description}</p>)}
            <p className="xs muted">A equipe já está cuidando disso. Você recebe a nova versão aqui mesmo.</p>
          </div>
        )}

        {/* Aprovação */}
        {it.can_decide ? (
          <div className="p-decide">
            <Button magnetic className="p-approve" onClick={approve} disabled={busy} cursor="APROVAR" aria-label={it.is_theme ? 'Aprovar tema' : 'Aprovar conteúdo'}>
              <span className="p-box" aria-hidden />{busy ? 'Aprovando…' : it.is_theme ? 'Aprovar tema' : 'Aprovar'}
            </Button>
            <Button magnetic className="p-adjust" onClick={() => setAdjustOpen(true)} disabled={busy}>Solicitar ajuste</Button>
          </div>
        ) : approved || justApproved ? (
          <div className="p-approved" aria-live="polite">
            <span className="p-box checked" aria-hidden><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
            <div>
              <div className="p-approved-t">{justApproved ? (it.is_theme ? 'Tema aprovado.' : 'Conteúdo aprovado.') : 'Aprovado'}</div>
              <div className="xs muted">
                {justApproved ? <>Versão V{justApproved.v || it.version?.number || '—'} · {fmtDateTime(justApproved.at)}</> : it.approval ? <>por {it.approval.name}{it.approval.number ? ` · V${it.approval.number}` : ''} · {fmtDateTime(it.approval.created_at)}</> : null}
                {it.status === 'agendado' && <> · agendado para {fmtDateTime(it.scheduled_at)}</>}
                {it.status === 'publicado' && <> · publicado</>}
              </div>
            </div>
          </div>
        ) : null}

        <Comments it={it} team={team} open={showComments} setOpen={setShowComments} onUpdate={onUpdate} />
      </div>

      <AdjustSheet open={adjustOpen} onClose={() => setAdjustOpen(false)} it={it} page={page} isVideo={isVideo} root={root} team={team}
        onDone={(updated) => { setAdjustOpen(false); onDecided(updated); toast('Ajuste enviado. A equipe foi avisada.'); }} />
    </article>
  );
}

function Comments({ it, team, open, setOpen, onUpdate }) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [reply, setReply] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const tops = it.comments.filter((c) => !c.parent_id);
  const replies = (id) => it.comments.filter((c) => c.parent_id === id);
  const mentionQuery = body.match(/@([\p{L}]*)$/u)?.[1];
  const suggestions = mentionQuery !== undefined ? team.filter((t) => t.name.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 5) : [];
  const send = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try { onUpdate(await api.post(`/portal/contents/${it.id}/comments`, { body: body.trim(), parent_id: reply?.id })); setBody(''); setReply(null); setOpen(true); }
    catch (x) { toast(x.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="p-comments">
      {it.comments.length > 0 && !open && <button className="p-link" onClick={() => setOpen(true)}>Ver {it.comments.length === 1 ? 'o comentário' : `os ${it.comments.length} comentários`}</button>}
      {open && tops.map((c) => (
        <div key={c.id} className="p-comment">
          <Bubble c={c} onReply={() => { setReply(c); inputRef.current?.focus(); }} />
          {replies(c.id).map((r) => <div key={r.id} className="p-reply"><Bubble c={r} /></div>)}
        </div>
      ))}
      <form className="p-compose" onSubmit={send}>
        {reply && <div className="xs muted p-replying">Respondendo a {reply.author_name} <button type="button" className="p-link" onClick={() => setReply(null)}>cancelar</button></div>}
        <div className="row gap-2" style={{ position: 'relative' }}>
          <input ref={inputRef} className="p-input" placeholder={team.length ? `Comente ou mencione @${team[0].name.split(' ')[0]}…` : 'Escreva um comentário…'} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Escrever comentário" />
          <button className="p-send" disabled={busy || !body.trim()} aria-label="Enviar comentário"><I.arrow size={16} /></button>
          {suggestions.length > 0 && (
            <div className="p-mentions" role="listbox" aria-label="Pessoas que você pode mencionar">
              {suggestions.map((t) => <button type="button" role="option" key={t.id} onClick={() => { setBody(body.replace(/@[\p{L}]*$/u, `@${t.name.split(' ')[0]} `)); inputRef.current?.focus(); }}>@{t.name.split(' ')[0]} <span className="xs muted">{t.function}</span></button>)}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
function Bubble({ c, onReply }) {
  return (
    <div className="p-bubble">
      <span className={`p-c-avatar ${c.is_client ? 'me' : ''}`} aria-hidden>{initials(c.author_name)}</span>
      <div className="grow">
        <div className="sm"><b>{c.is_client ? c.author_name.replace(' (cliente)', '') : c.author_name}</b>{!c.is_client && <span className="p-team">The Bold</span>} {c.anchor?.page ? <span className="p-anchor">pág. {c.anchor.page}</span> : null}{c.anchor?.t != null ? <span className="p-anchor">{Math.floor(c.anchor.t / 60)}:{String(Math.floor(c.anchor.t % 60)).padStart(2, '0')}</span> : null} {c.body}</div>
        <div className="xs faint">{ago(c.created_at)}{c.version_number ? ` · V${c.version_number}` : ''}{onReply && <> · <button className="p-link xs" onClick={onReply}>responder</button></>}</div>
      </div>
    </div>
  );
}

function AdjustSheet({ open, onClose, it, page, isVideo, root, team, onDone }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [file, setFile] = useState(null);
  const [pg, setPg] = useState(null);
  const [t, setT] = useState(null);
  const [busy, setBusy] = useState(false);
  const pages = it.version?.media?.length || 0;
  useEffect(() => { if (open) { setPg(pages > 1 ? page + 1 : null); setT(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('note', note.trim());
    if (file) fd.append('file', file);
    if (pg) fd.append('carousel_page', String(pg));
    if (t != null) fd.append('video_timestamp', String(Math.round(t * 10) / 10));
    try { const updated = await api.form(`/portal/contents/${it.id}/adjust`, fd); setNote(''); setFile(null); onDone(updated); }
    catch (x) { toast(x instanceof ApiError ? x.message : 'Não foi possível enviar.', 'err'); } finally { setBusy(false); }
  };
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return (
    <Modal open={open} onClose={onClose} title={it.is_theme ? 'Ajuste no tema' : 'Solicitar ajuste'}>
      <form onSubmit={submit} className="col gap-4">
        <label className="field">
          <span className="label">O que você gostaria de alterar?</span>
          <textarea className="textarea" rows={5} autoFocus value={note} onChange={(e) => setNote(e.target.value)} required
            placeholder={team.length ? `Ex.: “Podemos trocar essa frase?” Você pode mencionar @${team[0].name.split(' ')[0]}.` : 'Explique o ajuste necessário.'} />
        </label>
        {pages > 1 && (
          <div className="field">
            <span className="label">Em qual página do carrossel?</span>
            <div className="seg" role="group" aria-label="Página">
              <button type="button" className={pg == null ? 'active' : ''} onClick={() => setPg(null)}>Geral</button>
              {Array.from({ length: pages }).map((_, i) => <button type="button" key={i} className={pg === i + 1 ? 'active' : ''} onClick={() => setPg(i + 1)} aria-pressed={pg === i + 1}>{i + 1}</button>)}
            </div>
          </div>
        )}
        {isVideo && (
          <div className="row gap-2 wrap">
            <Button type="button" size="sm" icon={<I.play size={12} />} onClick={() => { const v = currentVideoTime(root.current); setT(v ?? 0); }}>Marcar tempo atual do vídeo</Button>
            {t != null && <span className="tag tag-bordo">{fmt(t)} <button type="button" className="p-link xs" onClick={() => setT(null)} aria-label="Remover tempo">✕</button></span>}
          </div>
        )}
        <label className="field">
          <span className="label">Anexar arquivo (opcional)</span>
          <input type="file" className="input" onChange={(e) => setFile(e.target.files?.[0] || null)} accept="image/*,video/*,application/pdf" />
        </label>
        <p className="xs muted">O conteúdo não será considerado aprovado. A equipe recebe seu pedido na hora, e a nova versão aparece aqui no feed.</p>
        <div className="row end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" magnetic disabled={busy || !note.trim()} arrow>{busy ? 'Enviando…' : 'Enviar ajuste'}</Button>
        </div>
      </form>
    </Modal>
  );
}
