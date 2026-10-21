// CONTEÚDOS — a principal experiência do cliente.
// ♡ → ♥ é a aprovação formal (LIKE = APROVAÇÃO). Comentário = conversa ou pedido de ajuste (o sistema entende e encaminha).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi, useToast } from '../lib/hooks.js';
import { fmtDate, fmtDateTime, fmtMonth, ago, cleanName, initials } from '../lib/format.js';
import { FORMATS } from '../lib/status.js';
import { detectAdjustment } from '../lib/intent.js';
import { Empty, Loading, ErrorBox } from '../components/ui.jsx';
import { MediaView, currentVideoTime } from '../components/MediaView.jsx';
import { I } from '../components/Icons.jsx';
import { usePortal } from './PortalApp.jsx';

const FILTERS = [
  { value: '', label: 'Todos' }, { value: 'aguardando', label: 'Aguardando aprovação' }, { value: 'aprovados', label: 'Aprovados' },
  { value: 'ajuste', label: 'Em ajuste' }, { value: 'publicados', label: 'Publicados' },
];
const TYPE_ICON = { carrossel: I.layers, reel: I.play, video: I.play, estatico: I.content, foto: I.content, stories: I.content };

export default function Feed() {
  const { me, reloadMe } = usePortal() || {};
  const [filter, setFilter] = useState('');
  const [month, setMonth] = useState('');
  const [view, setView] = useState('grade');
  const [openId, setOpenId] = useState(null);
  const qs = new URLSearchParams(Object.entries({ filter, month }).filter(([, v]) => v)).toString();
  const feed = useApi(`/portal/feed${qs ? `?${qs}` : ''}`, []);
  const items = feed.data?.items || [];
  const pending = items.filter((x) => x.can_like).length;
  // Vindo do calendário (?post=id): abre direto aquele conteúdo, no mês dele
  const [sp, setSp] = useSearchParams();
  useEffect(() => {
    const id = sp.get('post');
    const it = id && items.find((x) => x.id === id);
    if (!it) return;
    setView('grade'); if (it.planned_at) setMonth(it.planned_at.slice(0, 7)); setOpenId(id);
    setSp((p) => { const n = new URLSearchParams(p); n.delete('post'); return n; }, { replace: true });
  }, [sp, items]); // eslint-disable-line react-hooks/exhaustive-deps
  const replace = (it) => { feed.setData((d) => ({ ...d, items: d.items.map((x) => (x.id === it.id ? it : x)) })); reloadMe?.(); };

  const months = [...new Set(items.map((x) => (x.planned_at || '').slice(0, 7)).filter(Boolean))].sort();
  const firstPending = items.find((x) => x.can_like)?.planned_at?.slice(0, 7);
  const gridMonth = month || (months.includes(firstPending) ? firstPending : months[months.length - 1]);
  const gridItems = items.filter((x) => (x.planned_at || '').slice(0, 7) === gridMonth).sort((a, b) => String(a.planned_at).localeCompare(String(b.planned_at)));
  const listItems = items.slice().sort((a, b) => (b.can_like - a.can_like) || String(a.planned_at).localeCompare(String(b.planned_at)));
  const nav = view === 'grade' ? gridItems : listItems;
  const openIdx = nav.findIndex((x) => x.id === openId);
  const openItem = nav[openIdx];

  return (
    <div className="p-page p-feed">
      <header className="p-feed-head">
        <div className="caps">Conteúdos</div>
        <h1 className="ed-xl">{pending ? <>Curta o que<br /><em>está aprovado.</em></> : 'Seus conteúdos'}</h1>
        <p className="p-lede">{pending ? <><b>{pending}</b> {pending === 1 ? 'conteúdo aguarda' : 'conteúdos aguardam'} você. ♡ aprova · 💬 comenta ou pede ajuste.</> : 'Tudo em dia por aqui. Você recebe um aviso quando houver algo novo.'}</p>
      </header>

      <div className="p-filters" role="toolbar" aria-label="Filtros">
        <div className="p-chips">{FILTERS.map((f) => <button key={f.value} className={filter === f.value ? 'active' : ''} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>{f.label}</button>)}</div>
        <div className="p-viewtoggle" role="group" aria-label="Visualização">
          <button className={view === 'grade' ? 'active' : ''} onClick={() => setView('grade')} aria-pressed={view === 'grade'}>Prévia do feed</button>
          <button className={view === 'lista' ? 'active' : ''} onClick={() => setView('lista')} aria-pressed={view === 'lista'}>Sequência</button>
        </div>
      </div>

      <ErrorBox error={feed.error} />
      {feed.loading && !feed.data ? <div className="p-post"><Loading rows={6} /></div> : !items.length ? (
        <Empty title={filter === 'aguardando' ? 'Nada aguardando você.' : 'Nenhum conteúdo aqui ainda.'}>{filter ? 'Tente outro filtro.' : 'Assim que um conteúdo estiver pronto, ele aparece aqui.'}</Empty>
      ) : view === 'grade' ? (
        <FeedGrid month={gridMonth} months={months} onMonth={setMonth} items={gridItems} brand={me?.client} onOpen={setOpenId} />
      ) : (
        <div className="p-stream">
          {listItems.map((it) => <Post key={it.id} it={it} team={me?.team || []} onUpdate={replace} />)}
          <div className="p-end caps">Você chegou ao fim · THE BOLD<span className="bordo">.</span></div>
        </div>
      )}

      {openItem && (
        <div className="p-overlay" role="dialog" aria-modal="true" aria-label={openItem.title} onMouseDown={(e) => e.target === e.currentTarget && setOpenId(null)}>
          <div className="p-overlay-in">
            <div className="p-overlay-bar">
              <button className="p-icon-text" onClick={() => openIdx > 0 && setOpenId(nav[openIdx - 1].id)} disabled={openIdx === 0} aria-label="Anterior"><I.left size={18} /></button>
              <span className="caps">{String(openIdx + 1).padStart(2, '0')} / {String(nav.length).padStart(2, '0')}</span>
              <button className="p-icon-text" onClick={() => openIdx < nav.length - 1 && setOpenId(nav[openIdx + 1].id)} disabled={openIdx === nav.length - 1} aria-label="Próximo"><I.right size={18} /></button>
              <button className="p-icon-text p-close" onClick={() => setOpenId(null)} aria-label="Fechar"><I.x size={20} /></button>
            </div>
            <Post key={openItem.id} it={openItem} team={me?.team || []} onUpdate={replace} />
          </div>
        </div>
      )}
    </div>
  );
}

function FeedGrid({ month, months, onMonth, items, brand, onOpen }) {
  const title = month ? fmtMonth(month).replace(/^./, (c) => c.toUpperCase()).replace(' de ', ' ') : '';
  return (
    <section className="p-grid-wrap">
      <header className="p-grid-head">
        <span className="p-grid-logo ed" aria-hidden>{initials(cleanName(brand?.name || 'B'))}</span>
        <div className="grow"><div className="caps">Prévia do feed · Aprovação</div><h2 className="ed-lg">{title}</h2></div>
        {months.length > 1 && <div className="p-grid-months">{months.map((m) => <button key={m} className={m === month ? 'active' : ''} onClick={() => onMonth(m)}>{fmtMonth(m).split(' ')[0].slice(0, 3)}</button>)}</div>}
      </header>
      <div className="p-grid-hint">
        <p>Toque em um post para ver tudo como vai ao ar. Curta para aprovar.</p>
        <div className="p-grid-legend"><span><I.layers size={13} /> Carrossel</span><span><I.play size={13} /> Reel</span><span><I.content size={13} /> Imagem</span></div>
      </div>
      {!items.length ? <Empty title="Nada neste mês ainda." /> : (
        <div className="p-grid">
          {items.map((it, i) => {
            const Icon = TYPE_ICON[it.format] || I.content;
            const m = it.version?.media?.[0];
            const thumb = m?.urls.thumb || m?.urls.poster || m?.urls.preview;
            return (
              <button key={it.id} className={`p-tile ${it.can_like ? 'pending' : ''}`} onClick={() => onOpen(it.id)} data-cursor="VER" aria-label={`${String(i + 1).padStart(2, '0')} ${it.title} — ${it.liked ? 'aprovado' : it.can_like ? 'aguardando aprovação' : ''}`}>
                {thumb ? <img src={thumb} alt="" loading="lazy" /> : <span className="p-tile-text"><span className="caps">{it.is_theme ? 'Tema' : FORMATS[it.format]}</span><span className="ed">{it.title}</span></span>}
                <span className="p-tile-n">{String(i + 1).padStart(2, '0')}</span>
                <span className="p-tile-type"><Icon size={13} /></span>
                <span className={`p-tile-heart ${it.liked ? 'on' : ''}`} aria-hidden><Heart filled={it.liked} size={15} /></span>
                {it.adjust_state === 'solicitado' && <span className="p-tile-state s-ajuste_solicitado">Em ajuste</span>}
                {it.adjust_state === 'concluido' && <span className="p-tile-state s-new">Nova versão</span>}
                <span className="p-tile-date">{fmtDate(it.scheduled_at || it.planned_at)}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

const Heart = ({ filled, size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.2s-7.6-4.6-7.6-10.2A4.4 4.4 0 0 1 12 7.1a4.4 4.4 0 0 1 7.6 2.9c0 5.6-7.6 10.2-7.6 10.2Z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
);

function Post({ it, team, onUpdate }) {
  const toast = useToast();
  const root = useRef(null);
  const composer = useRef(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [vnum, setVnum] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const shown = it.versions?.find((v) => v.number === vnum) || null;
  const media = shown ? shown.media : it.version?.media || [];
  const caption = shown ? shown.caption : it.version?.caption || '';
  const long = caption.length > 180 || caption.split('\n').length > 3;
  const isVideo = media[0]?.kind === 'video';

  const like = async () => {
    if (busy) return;
    if (it.liked && !it.can_unlike) { setConfirm({ kind: 'info', text: 'Este conteúdo já seguiu para a próxima etapa. Para mudar algo, é só comentar.' }); return; }
    if (!it.liked && !it.can_like) return;
    setBusy(true);
    try {
      if (it.liked) { onUpdate(await api.del(`/portal/contents/${it.id}/like`)); setConfirm({ kind: 'info', text: 'Aprovação desfeita.' }); }
      else {
        setBurst(true); setTimeout(() => setBurst(false), 700);
        const updated = await api.post(`/portal/contents/${it.id}/like`);
        onUpdate(updated);
        setConfirm({ kind: 'ok', text: it.is_theme ? 'Tema aprovado. A The Bold já pode seguir para a produção.' : `Conteúdo aprovado · V${updated.version?.number ?? ''}. A The Bold já pode seguir para a próxima etapa.` });
      }
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  useEffect(() => { if (!confirm) return; const t = setTimeout(() => setConfirm(null), 5000); return () => clearTimeout(t); }, [confirm]);
  const saveCaption = async () => {
    setBusy(true);
    try { onUpdate(await api.post(`/portal/contents/${it.id}/caption`, { caption: draft })); setEditing(false); toast('Legenda atualizada. A equipe foi avisada.'); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const stateLabel = it.adjust_state === 'solicitado' ? 'Ajuste solicitado' : it.liked ? (it.status === 'publicado' ? 'Publicado' : it.status === 'agendado' ? `Aprovado · agendado ${fmtDate(it.scheduled_at)}` : 'Aprovado') : it.can_like ? (it.adjust_state === 'concluido' ? 'Ajuste concluído · nova versão para você' : 'Aguardando aprovação') : 'Com a equipe';

  return (
    <article className="p-post" ref={root} aria-labelledby={`t-${it.id}`}>
      <header className="p-post-head">
        <span className="p-brand-avatar" aria-hidden>{initials(cleanName(it.brand.name))}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="p-brand-name clip">{cleanName(it.brand.name)}</div>
          <div className="xs muted clip">{FORMATS[it.format]} · vai ao ar {fmtDate(it.scheduled_at || it.planned_at, { weekday: 'short' })}</div>
        </div>
      </header>

      {it.is_theme ? (
        <div className="p-theme">
          <div className="caps">Tema · {FORMATS[it.format]}</div>
          <h2 className="ed-lg" id={`t-${it.id}`}>{it.title}</h2>
          {it.theme && it.theme !== it.title && <p className="p-theme-line"><span className="caps">Tema</span>{it.theme}</p>}
          {it.objective && <p className="p-theme-line"><span className="caps">Objetivo</span>{it.objective}</p>}
          {it.reference && <p className="p-theme-line"><span className="caps">Referência</span>{it.reference}</p>}
        </div>
      ) : (
        <div className="p-media" onDoubleClick={() => !it.liked && it.can_like && like()}>
          <MediaView key={vnum || 'cur'} media={media} dark rounded={false} onPage={setPage} />
          {burst && <span className="p-burst" aria-hidden><Heart filled size={84} /></span>}
          {shown && !shown.current && <div className="p-oldver">Versão anterior · V{shown.number} <button onClick={() => setVnum(null)}>ver atual</button></div>}
        </div>
      )}

      <div className="p-post-body">
        {/* ♡ aprovar · 💬 comentar · estado */}
        <div className="p-actions-row">
          <button className={`p-like ${it.liked ? 'on' : ''} ${burst ? 'pop' : ''}`} onClick={like} disabled={busy || (!it.can_like && !it.liked)} aria-pressed={it.liked}
            aria-label={it.liked ? (it.can_unlike ? 'Aprovado — toque para desfazer' : 'Aprovado') : 'Curtir para aprovar'} data-cursor={it.liked ? '' : 'APROVAR'}>
            <Heart filled={it.liked} />
          </button>
          <button className="p-like-c" onClick={() => composer.current?.focus()} aria-label="Comentar"><I.comment size={22} />{it.comments.length > 0 && <span>{it.comments.length}</span>}</button>
          <span className={`p-state ${it.liked ? 'ok' : it.adjust_state === 'solicitado' ? 'adj' : it.can_like ? 'wait' : ''}`}>{stateLabel}</span>
        </div>
        {confirm && <div className={`p-confirm ${confirm.kind}`} role="status">{confirm.text}</div>}

        {!it.is_theme && <h2 className="p-title ed" id={`t-${it.id}`}>{it.title}</h2>}
        {editing ? (
          <div className="p-caption-edit">
            <textarea className="p-textarea" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus rows={8} maxLength={2200} aria-label="Editar legenda" />
            <div className="xs muted">{draft.length}/2200 · ao salvar, uma nova versão é criada e a equipe é avisada</div>
            <div className="row gap-2 mt-2"><button className="p-btn" onClick={() => setEditing(false)} disabled={busy}>Cancelar</button><button className="p-btn solid" onClick={saveCaption} disabled={busy || !draft.trim() || draft.trim() === caption.trim()}>Salvar legenda</button></div>
          </div>
        ) : caption && (
          <div className={`p-caption ${expanded || !long ? 'open' : ''}`}><b>{it.brand.handle?.replace('@', '') || cleanName(it.brand.name)}</b> {caption}</div>
        )}
        {!editing && <div className="row gap-4 wrap">
          {caption && long && <button className="p-link" onClick={() => setExpanded((e) => !e)}>{expanded ? 'mostrar menos' : 'mais'}</button>}
          {it.can_like && !it.is_theme && !shown && <button className="p-link" onClick={() => { setDraft(caption); setEditing(true); }}><I.edit size={13} /> Editar legenda</button>}
        </div>}

        {it.versions?.length > 1 && (
          <div className="p-versions" aria-label="Versões">
            {it.versions.map((v) => (
              <button key={v.number} className={(vnum ? vnum === v.number : v.current) ? 'active' : ''} onClick={() => setVnum(v.current ? null : v.number)}>
                V{v.number}{v.current ? ' · atual' : ''}{v.approved ? ' — aprovada' : ''}
              </button>
            ))}
          </div>
        )}
        {it.open_adjustments?.length > 0 && (
          <div className="p-adjust-note">
            <div className="caps">Ajuste em andamento</div>
            {it.open_adjustments.map((a, i) => <p key={i} className="sm">{a.carousel_page ? <b>Página {a.carousel_page}: </b> : null}{a.description}</p>)}
            <p className="xs muted">A equipe já está cuidando disso. A nova versão aparece aqui mesmo.</p>
          </div>
        )}

        <Comments it={it} team={team} onUpdate={onUpdate} inputRef={composer} page={page} isVideo={isVideo} root={root} pages={media.length} />
      </div>
    </article>
  );
}

function Comments({ it, team, onUpdate, inputRef, page, isVideo, root, pages }) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [reply, setReply] = useState(null);
  const [force, setForce] = useState(null); // null = automático · 'comentario' · 'ajuste'
  const [pg, setPg] = useState(null);
  const [t, setT] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const detected = useMemo(() => detectAdjustment(body), [body]);
  const isAdj = !reply && it.can_request_adjust && (force ? force === 'ajuste' : detected.isAdjustment);
  const roots = it.comments.filter((c) => !c.parent_id);
  const visible = showAll ? roots : roots.slice(-3);
  const replies = (id) => it.comments.filter((c) => c.parent_id === id);
  const q = body.match(/@([\p{L}]*)$/u)?.[1];
  const suggestions = q != null ? team.filter((x) => x.name.toLowerCase().startsWith(q.toLowerCase())).slice(0, 5) : [];
  const send = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('body', body.trim());
    fd.append('intent', reply ? 'comentario' : isAdj ? 'ajuste' : 'comentario');
    if (reply) fd.append('parent_id', reply.id);
    const pageOut = pg ?? detected.page ?? (isAdj && pages > 1 ? page + 1 : null);
    if (pageOut) fd.append('page', String(pageOut));
    if (t != null) fd.append('t', String(Math.round(t)));
    if (file) fd.append('file', file);
    try {
      const r = await api.form(`/portal/contents/${it.id}/comments`, fd);
      onUpdate(r.item);
      setBody(''); setReply(null); setForce(null); setPg(null); setT(null); setFile(null); setShowAll(true);
      toast(r.action ? 'Ajuste encaminhado à equipe. Você recebe a nova versão aqui.' : 'Comentário enviado.');
    } catch (x) { toast(x.message, 'err'); } finally { setBusy(false); }
  };
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return (
    <div className="p-comments">
      {roots.length > 3 && !showAll && <button className="p-link xs" onClick={() => setShowAll(true)}>ver os {roots.length} comentários</button>}
      {visible.map((c) => (
        <div key={c.id}>
          <Bubble c={c} onReply={() => { setReply(c); inputRef.current?.focus(); }} />
          {replies(c.id).map((r) => <div key={r.id} className="p-reply"><Bubble c={r} /></div>)}
        </div>
      ))}
      <form className="p-compose" onSubmit={send}>
        {reply && <div className="xs muted p-replying">Respondendo a {reply.author_name} <button type="button" className="p-link" onClick={() => setReply(null)}>cancelar</button></div>}
        <div className="row gap-2" style={{ position: 'relative' }}>
          <textarea ref={inputRef} rows={1} className="p-input" placeholder="Comente ou peça um ajuste…" value={body} onChange={(e) => setBody(e.target.value)} aria-label="Escrever comentário"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); } }} />
          <button className="p-send" disabled={busy || !body.trim()} aria-label="Enviar"><I.arrow size={16} /></button>
          {suggestions.length > 0 && (
            <div className="p-mentions" role="listbox" aria-label="Pessoas que você pode mencionar">
              {suggestions.map((x) => <button type="button" role="option" key={x.id} onClick={() => { setBody(body.replace(/@[\p{L}]*$/u, `@${x.name.split(' ')[0]} `)); inputRef.current?.focus(); }}>@{x.name.split(' ')[0]}</button>)}
            </div>
          )}
        </div>
        {body.trim() && !reply && it.can_request_adjust && (
          <div className={`p-intent ${isAdj ? 'adj' : ''}`}>
            {isAdj ? <>
              <span>↺ Vamos encaminhar como <b>pedido de ajuste</b>{(pg ?? detected.page) ? ` · página ${pg ?? detected.page}` : ''}{t != null ? ` · ${fmt(t)}` : detected.t != null ? ` · ${fmt(detected.t)}` : ''}.{it.liked ? ' O conteúdo volta para você aprovar a nova versão.' : ''}</span>
              <button type="button" className="p-link xs" onClick={() => setForce('comentario')}>é só um comentário</button>
            </> : <>
              <span>Será enviado como comentário.</span>
              <button type="button" className="p-link xs" onClick={() => setForce('ajuste')}>é um pedido de ajuste</button>
            </>}
          </div>
        )}
        {isAdj && body.trim() && (
          <div className="row wrap gap-2 p-adj-tools">
            {pages > 1 && <select className="p-select sm" value={pg ?? ''} onChange={(e) => setPg(e.target.value ? Number(e.target.value) : null)} aria-label="Página"><option value="">Página…</option>{Array.from({ length: pages }).map((_, i) => <option key={i} value={i + 1}>Página {i + 1}</option>)}</select>}
            {isVideo && <button type="button" className="p-btn sm" onClick={() => setT(currentVideoTime(root.current) ?? 0)}><I.play size={11} /> {t != null ? fmt(t) : 'Marcar tempo do vídeo'}</button>}
            <label className="p-btn sm"><I.upload size={12} /> {file ? file.name.slice(0, 18) : 'Anexar'}<input type="file" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} accept="image/*,video/*,application/pdf" /></label>
          </div>
        )}
      </form>
    </div>
  );
}

function Bubble({ c, onReply }) {
  return (
    <div className="p-bubble">
      <span className={`p-c-avatar ${c.is_client ? 'me' : ''}`} aria-hidden>{initials(c.author_name)}</span>
      <div className="grow">
        <div className="sm"><b>{c.author_name}</b>{!c.is_client && <span className="p-team">The Bold</span>} {c.anchor?.page ? <span className="p-anchor">pág. {c.anchor.page}</span> : null}{c.anchor?.t != null ? <span className="p-anchor">{Math.floor(c.anchor.t / 60)}:{String(Math.floor(c.anchor.t % 60)).padStart(2, '0')}</span> : null} {c.body}</div>
        <div className="xs faint">{ago(c.created_at)}{c.version_number ? ` · V${c.version_number}` : ''}{c.is_adjustment && <span className="p-adj-tag"> · ↺ ajuste encaminhado</span>}{onReply && <> · <button className="p-link xs" onClick={onReply}>responder</button></>}</div>
      </div>
    </div>
  );
}
