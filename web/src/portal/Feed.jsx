// CONTEÚDOS — a experiência editorial do cliente. Visual primeiro.
// Três ações separadas, nunca confundidas:  ♡ APROVAR (ação formal, com confirmação)  ·  ✎ PEDIR AJUSTE (estruturado)  ·  💬 COMENTAR / FAZER PERGUNTA.
// Um comentário sozinho nunca significa aprovação.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi, useToast } from '../lib/hooks.js';
import { fmtDate, fmtDay, fmtMonth, ago, cleanName, initials } from '../lib/format.js';
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
const ASPECTS = [['texto', 'Texto'], ['imagem', 'Imagem'], ['video', 'Vídeo'], ['legenda', 'Legenda'], ['pagina', 'Página do carrossel'], ['outro', 'Outro']];
const fmtT = (s) => `${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}`;
const pad = (n) => String(n).padStart(2, '0');

export default function Feed() {
  const { me, reloadMe } = usePortal() || {};
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState(params.get('filtro') || '');
  const [month, setMonth] = useState(params.get('mes') || '');
  const [view, setView] = useState(params.get('filtro') === 'aguardando' ? 'lista' : 'grade');
  const [openId, setOpenId] = useState(params.get('c'));
  const [single, setSingle] = useState(null); // conteúdo aberto por link direto que não está no filtro atual
  const qs = new URLSearchParams(Object.entries({ filter, month }).filter(([, v]) => v)).toString();
  const feed = useApi(`/portal/feed${qs ? `?${qs}` : ''}`, []);
  const items = feed.data?.items || [];
  const pending = items.filter((x) => x.can_like).length;
  const replace = (it) => { feed.setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === it.id ? it : x)) } : d)); if (single?.id === it.id) setSingle(it); reloadMe?.(); };
  useEffect(() => { const c = params.get('c'); if (c) setOpenId(c); }, [params]);
  useEffect(() => {
    if (!openId || !feed.data || items.some((x) => x.id === openId)) { setSingle(null); return; }
    api.get(`/portal/contents/${openId}`).then(setSingle).catch(() => setOpenId(null));
  }, [openId, feed.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { setOpenId(null); setSingle(null); if (params.get('c')) { params.delete('c'); setParams(params, { replace: true }); } };

  const months = [...new Set(items.map((x) => (x.planned_at || '').slice(0, 7)).filter(Boolean))].sort();
  const firstPending = items.find((x) => x.can_like)?.planned_at?.slice(0, 7);
  const gridMonth = month || (months.includes(firstPending) ? firstPending : months[months.length - 1]);
  const gridItems = items.filter((x) => (x.planned_at || '').slice(0, 7) === gridMonth).sort((a, b) => String(a.planned_at).localeCompare(String(b.planned_at)));
  const listItems = items.slice().sort((a, b) => (b.can_like - a.can_like) || String(a.planned_at).localeCompare(String(b.planned_at)));
  const nav = view === 'grade' ? gridItems : listItems;
  const openIdx = nav.findIndex((x) => x.id === openId);
  const openItem = openIdx >= 0 ? nav[openIdx] : items.find((x) => x.id === openId) || single;

  return (
    <div className="p-page p-feed">
      <header className="p-feed-head">
        <div className="caps">Conteúdos</div>
        <h1 className="ed-xl">{pending ? <>Curta o que<br /><em>está aprovado.</em></> : 'Seus conteúdos'}</h1>
        <p className="p-lede">{pending ? <><b>{pending}</b> {pending === 1 ? 'conteúdo aguarda' : 'conteúdos aguardam'} você. ♡ aprova · ✎ pede ajuste · 💬 pergunta.</> : 'Tudo em dia por aqui. Você recebe um aviso quando houver algo novo.'}</p>
      </header>

      <div className="p-filters" role="toolbar" aria-label="Filtros">
        <div className="p-chips">{FILTERS.map((f) => <button key={f.value} className={filter === f.value ? 'active' : ''} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>{f.label}</button>)}</div>
        <div className="p-viewtoggle" role="group" aria-label="Visualização">
          <button className={view === 'grade' ? 'active' : ''} onClick={() => setView('grade')} aria-pressed={view === 'grade'}>Prévia do feed</button>
          <button className={view === 'lista' ? 'active' : ''} onClick={() => setView('lista')} aria-pressed={view === 'lista'}>Um por um</button>
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
        <div className="p-overlay" role="dialog" aria-modal="true" aria-label={openItem.title} onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div className="p-overlay-in">
            <div className="p-overlay-bar">
              {openIdx >= 0 && <>
                <button className="p-icon-text" onClick={() => openIdx > 0 && setOpenId(nav[openIdx - 1].id)} disabled={openIdx === 0} aria-label="Anterior"><I.left size={18} /></button>
                <span className="caps">{pad(openIdx + 1)} / {pad(nav.length)}</span>
                <button className="p-icon-text" onClick={() => openIdx < nav.length - 1 && setOpenId(nav[openIdx + 1].id)} disabled={openIdx === nav.length - 1} aria-label="Próximo"><I.right size={18} /></button>
              </>}
              <button className="p-icon-text p-close" onClick={close} aria-label="Fechar"><I.x size={20} /></button>
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
        <p>Toque em um post para ver como vai ao ar. ♡ aprova · ✎ pede ajuste.</p>
        <div className="p-grid-legend"><span><I.layers size={13} /> Carrossel</span><span><I.play size={13} /> Reel</span><span><I.content size={13} /> Imagem</span></div>
      </div>
      {!items.length ? <Empty title="Nada neste mês ainda." /> : (
        <div className="p-grid">
          {items.map((it, i) => {
            const Icon = TYPE_ICON[it.format] || I.content;
            const m = it.version?.media?.[0];
            const thumb = m?.urls.thumb || m?.urls.poster || m?.urls.preview;
            return (
              <button key={it.id} className={`p-tile ${it.can_like ? 'pending' : ''}`} onClick={() => onOpen(it.id)} data-cursor="VER" aria-label={`${pad(i + 1)} ${it.title} — ${it.liked ? 'aprovado' : it.can_like ? 'aguardando aprovação' : 'com a equipe'}`}>
                {thumb ? <img src={thumb} alt="" loading="lazy" /> : <span className="p-tile-text"><span className="caps">{it.is_theme ? 'Tema' : FORMATS[it.format]}</span><span className="ed">{it.title}</span></span>}
                <span className="p-tile-n">{pad(i + 1)}</span>
                <span className="p-tile-type"><Icon size={13} /></span>
                <span className={`p-tile-heart ${it.liked ? 'on' : ''}`} aria-hidden><Heart filled={it.liked} size={15} /></span>
                {it.adjust_state === 'solicitado' && <span className="p-tile-state s-ajuste_solicitado">Em ajuste</span>}
                {it.adjust_state === 'concluido' && <span className="p-tile-state s-new">Nova versão</span>}
                {it.deadline?.overdue && it.can_like && <span className="p-tile-state s-new">Precisamos de você</span>}
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
  const { openRequest } = usePortal() || {};
  const root = useRef(null);
  const composer = useRef(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState(false);
  const [confirmLike, setConfirmLike] = useState(false);
  const [notice, setNotice] = useState(null);
  const [vnum, setVnum] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [adjust, setAdjust] = useState(null); // null | { note }
  const [pick, setPick] = useState(null);     // região marcada no modo ajuste
  const [mode, setMode] = useState('comentario');
  const shown = it.versions?.find((v) => v.number === vnum) || null;
  const media = shown ? shown.media : it.version?.media || [];
  const caption = shown ? shown.caption : it.version?.caption || '';
  const long = caption.length > 180 || caption.split('\n').length > 3;
  const isVideo = media[0]?.kind === 'video';
  const curNumber = it.version?.number;
  // Pinos: ajustes (com região) da versão exibida
  const pins = useMemo(() => {
    const vn = shown ? shown.number : curNumber;
    const list = (it.adjustments || []).filter((a) => a.region && a.version_number === vn).map((a, i) => ({ page: a.carousel_page || 1, x: a.region.x, y: a.region.y, n: i + 1, open: a.open, label: a.description }));
    if (pick) list.push({ ...pick, n: '+', draft: true });
    return list;
  }, [it.adjustments, shown, curNumber, pick]);

  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 6000); return () => clearTimeout(t); }, [notice]);
  const tapHeart = () => {
    if (busy) return;
    if (it.liked && it.can_unlike) return unlike();
    if (it.liked) { setNotice({ kind: 'info', text: 'Este conteúdo já seguiu para a próxima etapa. Para mudar algo, peça um ajuste.' }); return; }
    if (!it.can_like) { setNotice({ kind: 'info', text: 'Este conteúdo ainda está com a equipe. Ele chega aqui quando estiver pronto para você aprovar.' }); return; }
    setConfirmLike(true);
  };
  const approve = async () => {
    setBusy(true);
    try {
      const updated = await api.post(`/portal/contents/${it.id}/approve`, { confirm: true, version: curNumber });
      setConfirmLike(false); setBurst(true); setTimeout(() => setBurst(false), 700);
      onUpdate(updated);
      setNotice({ kind: 'ok', text: it.is_theme ? 'Tema aprovado. A The Bold já começa a produção.' : `V${updated.version?.number ?? curNumber} aprovada e congelada. A The Bold segue para o agendamento.` });
    } catch (e) { toast(e.message, 'err'); setConfirmLike(false); } finally { setBusy(false); }
  };
  const unlike = async () => {
    setBusy(true);
    try { onUpdate(await api.del(`/portal/contents/${it.id}/like`)); setNotice({ kind: 'info', text: 'Aprovação desfeita. O conteúdo voltou a aguardar você.' }); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const saveCaption = async () => {
    setBusy(true);
    try { onUpdate(await api.post(`/portal/contents/${it.id}/caption`, { caption: draft })); setEditing(false); toast('Legenda atualizada em uma nova versão. A equipe foi avisada.'); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const startAdjust = (note = '') => { setAdjust({ note }); setVnum(null); setTimeout(() => root.current?.querySelector('.p-adj textarea')?.focus(), 30); };
  const ask = () => { setMode('pergunta'); composer.current?.focus(); };
  const late = it.deadline?.overdue;
  const stateLabel = it.adjust_state === 'solicitado' ? 'Ajuste solicitado' : it.liked ? (it.status === 'publicado' ? 'Publicado' : it.status === 'agendado' ? `Aprovado · agendado ${fmtDate(it.scheduled_at)}` : 'Aprovado') : it.can_like ? (it.adjust_state === 'concluido' ? 'Nova versão para você' : 'Aguardando aprovação') : 'Com a equipe';

  return (
    <article className="p-post" ref={root} aria-labelledby={`t-${it.id}`}>
      <header className="p-post-head">
        <span className="p-brand-avatar" aria-hidden>{initials(cleanName(it.brand.name))}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="p-brand-name clip">{cleanName(it.brand.name)}</div>
          <div className="xs muted clip">{FORMATS[it.format]} · vai ao ar {fmtDate(it.scheduled_at || it.planned_at, { weekday: 'short' })}{curNumber ? ` · V${curNumber}` : ''}</div>
        </div>
      </header>

      {it.can_like && it.deadline && (
        <div className={`p-deadline ${late ? 'late' : ''}`} role="note">
          <b>{it.deadline.title.toUpperCase()}</b>
          <span>{it.deadline.text}</span>
        </div>
      )}

      {it.is_theme ? (
        <div className="p-theme">
          <div className="caps">Tema · {FORMATS[it.format]}</div>
          <h2 className="ed-lg" id={`t-${it.id}`}>{it.title}</h2>
          {it.theme && it.theme !== it.title && <p className="p-theme-line"><span className="caps">Tema</span>{it.theme}</p>}
          {it.objective && <p className="p-theme-line"><span className="caps">Objetivo</span>{it.objective}</p>}
          {it.reference && <p className="p-theme-line"><span className="caps">Referência</span>{it.reference}</p>}
        </div>
      ) : (
        <div className="p-media" onDoubleClick={() => !adjust && !it.liked && it.can_like && setConfirmLike(true)}>
          <MediaView key={vnum || 'cur'} media={media} dark rounded={false} onPage={setPage} pins={pins} onPick={adjust && !isVideo ? (p) => setPick(p) : null} />
          {burst && <span className="p-burst" aria-hidden><Heart filled size={84} /></span>}
          {shown && !shown.current && <div className="p-oldver">V{shown.number} · {shown.state === 'aprovada' ? 'aprovada' : 'substituída'} <button onClick={() => setVnum(null)}>ver atual</button></div>}
          {adjust && !isVideo && <div className="p-pickhint">{pick ? `Marcado na página ${pick.page}. Toque de novo para mudar.` : 'Toque na imagem para marcar o ponto do ajuste (opcional).'}</div>}
        </div>
      )}

      <div className="p-post-body">
        {/* ♡ APROVAR · ✎ PEDIR AJUSTE · 💬 PERGUNTAR — três ações, nunca confundidas */}
        <div className="p-actions-row">
          <button className={`p-like ${it.liked ? 'on' : ''} ${burst ? 'pop' : ''}`} onClick={tapHeart} disabled={busy} aria-pressed={it.liked}
            aria-label={it.liked ? (it.can_unlike ? 'Aprovado — toque para desfazer' : 'Aprovado') : it.can_like ? 'Aprovar (pede confirmação)' : 'Aprovação ainda não disponível'} data-cursor={it.liked ? '' : 'APROVAR'}>
            <Heart filled={it.liked} />
          </button>
          {it.can_request_adjust && !it.is_theme && <button className="p-act-btn" onClick={() => (adjust ? setAdjust(null) : startAdjust())} aria-expanded={!!adjust}><I.edit size={18} /><span>Pedir ajuste</span></button>}
          {it.can_request_adjust && it.is_theme && it.can_like && <button className="p-act-btn" onClick={() => (adjust ? setAdjust(null) : startAdjust())} aria-expanded={!!adjust}><I.edit size={18} /><span>Ajustar tema</span></button>}
          <button className="p-act-btn" onClick={ask}><I.comment size={18} /><span>Perguntar</span>{it.comments.length > 0 && <small>{it.comments.length}</small>}</button>
          <span className={`p-state ${it.liked ? 'ok' : it.adjust_state === 'solicitado' ? 'adj' : it.can_like ? 'wait' : ''}`}>{stateLabel}</span>
        </div>
        {notice && <div className={`p-confirm ${notice.kind}`} role="status">{notice.text}</div>}

        {confirmLike && (
          <div className="p-confirm-like" role="alertdialog" aria-labelledby={`cl-${it.id}`} aria-describedby={`cld-${it.id}`}>
            <div className="ed-md" id={`cl-${it.id}`}>{it.is_theme ? 'Aprovar este tema?' : `Aprovar a V${curNumber}?`}</div>
            <p className="sm" id={`cld-${it.id}`}>{it.next_step} Sua aprovação fica registrada com data e hora.</p>
            <div className="row gap-2 mt-4">
              <button className="p-cta sm" onClick={approve} disabled={busy} autoFocus>{busy ? 'Aprovando…' : <>♥ Aprovar{it.is_theme ? ' tema' : ` V${curNumber}`}</>}</button>
              <button className="p-btn" onClick={() => setConfirmLike(false)} disabled={busy}>Agora não</button>
            </div>
          </div>
        )}

        {adjust && <AdjustPanel it={it} page={page} pages={media.length} isVideo={isVideo} root={root} pick={pick} setPick={setPick} initial={adjust.note}
          onClose={() => { setAdjust(null); setPick(null); }} onDone={(item, mode2) => { onUpdate(item); setAdjust(null); setPick(null); setNotice({ kind: 'ok', text: mode2 === 'reaberto' ? 'Ajuste registrado. A nova versão volta para você aprovar.' : 'Ajuste registrado. A The Bold já está cuidando — a nova versão aparece aqui.' }); }} />}

        {!it.is_theme && <h2 className="p-title ed" id={`t-${it.id}`}>{it.title}</h2>}
        {editing ? (
          <div className="p-caption-edit">
            <textarea className="p-textarea" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus rows={8} maxLength={2200} aria-label="Editar legenda" />
            <div className="xs muted">{draft.length}/2200 · ao salvar, nasce uma nova versão e a equipe é avisada</div>
            <div className="row gap-2 mt-2"><button className="p-btn" onClick={() => setEditing(false)} disabled={busy}>Cancelar</button><button className="p-btn solid" onClick={saveCaption} disabled={busy || !draft.trim() || draft.trim() === caption.trim()}>Salvar legenda</button></div>
          </div>
        ) : caption && (
          <div className={`p-caption ${expanded || !long ? 'open' : ''}`}><b>{it.brand.handle?.replace('@', '') || cleanName(it.brand.name)}</b> {caption}</div>
        )}
        {!editing && <div className="row gap-4 wrap">
          {caption && long && <button className="p-link" onClick={() => setExpanded((e) => !e)}>{expanded ? 'mostrar menos' : 'mais'}</button>}
          {it.can_like && !it.is_theme && !shown && <button className="p-link" onClick={() => { setDraft(caption); setEditing(true); }}><I.edit size={13} /> Editar legenda</button>}
          <button className="p-link" onClick={() => openRequest?.({ kind: 'conteudo', ref: { id: it.id, title: it.title } })}>Pedir algo sobre este conteúdo</button>
        </div>}

        {it.versions?.length > 0 && !it.is_theme && <Versions it={it} vnum={vnum} setVnum={setVnum} />}
        {it.adjustments?.length > 0 && <Adjustments list={it.adjustments} />}

        <Comments it={it} team={team} onUpdate={onUpdate} inputRef={composer} mode={mode} setMode={setMode} onAdjust={startAdjust} />
      </div>
    </article>
  );
}

// VERSIONAMENTO — V3 · ATUAL / V2 · SUBSTITUÍDA / V3 · APROVADA. Nunca uma versão antiga aparece como aprovada depois de uma nova.
function Versions({ it, vnum, setVnum }) {
  const [open, setOpen] = useState(false);
  const label = (v) => (v.state === 'aprovada' ? 'Aprovada' : v.state === 'atual' ? 'Atual' : 'Substituída');
  const cur = it.versions.find((v) => v.current) || it.versions[0];
  return (
    <div className="p-vers">
      <button className="p-vers-h" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="caps">Versões</span><span className="sm">V{cur.number} · {label(cur)}{it.versions.length > 1 ? ` · ${it.versions.length} versões` : ''}</span><I.right size={14} className={open ? 'rot' : ''} />
      </button>
      {open && <ol className="p-vers-list">{it.versions.map((v) => (
        <li key={v.number} className={`s-${v.state} ${(vnum ? vnum === v.number : v.current) ? 'shown' : ''}`}>
          <button onClick={() => setVnum(v.current ? null : v.number)} aria-label={`Ver V${v.number}`}>
            <b>V{v.number} — {label(v).toUpperCase()}</b>
            <span className="xs muted">enviada {fmtDay(v.sent_at)}{v.was_approved && v.state !== 'aprovada' ? ` · aprovada em ${fmtDay(v.approved_at)}, depois substituída` : v.approved_at ? ` · aprovada em ${fmtDay(v.approved_at)}` : ''}</span>
            {v.reason && <span className="sm">“{v.reason}.”</span>}
            {v.adjustments_done?.length > 0 && <span className="xs muted">Ajustes feitos: {v.adjustments_done.join(' · ').slice(0, 220)}</span>}
          </button>
        </li>
      ))}</ol>}
    </div>
  );
}

function Adjustments({ list }) {
  const open = list.filter((a) => a.open);
  const done = list.filter((a) => !a.open);
  return (
    <div className="p-adjust-note">
      {open.length > 0 && <>
        <div className="caps">Ajuste em andamento</div>
        {open.map((a) => <p key={a.id} className="sm">{a.where && <b>{a.where}: </b>}{a.description} <span className="xs muted">· V{a.version_number}</span></p>)}
        <p className="xs muted">A The Bold já está cuidando. A nova versão aparece aqui mesmo.</p>
      </>}
      {done.length > 0 && <details className={open.length ? 'mt-4' : ''}><summary className="xs muted">{done.length} ajuste(s) já feito(s)</summary>
        {done.map((a) => <p key={a.id} className="xs">{a.where && <b>{a.where}: </b>}{a.description}{a.resolved_in ? ` → feito na V${a.resolved_in}` : ''}</p>)}
      </details>}
    </div>
  );
}

// ✎ PEDIR AJUSTE — feedback estruturado: tipo · local (página, tempo, ponto na imagem) · descrição. O sistema define o responsável.
function AdjustPanel({ it, page, pages, isVideo, root, pick, setPick, initial, onClose, onDone }) {
  const toast = useToast();
  const [aspect, setAspect] = useState(isVideo ? 'video' : null);
  const [pg, setPg] = useState(pages > 1 ? page + 1 : null);
  const [t, setT] = useState(null);
  const [note, setNote] = useState(initial || '');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (pick?.page) setPg(pick.page); }, [pick]);
  const where = [pg && pages > 1 ? `Página ${pg}` : null, t != null ? fmtT(t) : null, pick ? 'ponto marcado' : null].filter(Boolean).join(' · ');
  const send = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('note', note.trim());
    if (aspect) fd.append('aspect', aspect);
    if (pg && pages > 1) fd.append('carousel_page', String(pg));
    if (t != null) fd.append('video_timestamp', String(Math.round(t)));
    if (pick) fd.append('region', JSON.stringify({ x: pick.x, y: pick.y }));
    if (it.version?.number) fd.append('version', String(it.version.number));
    if (file) fd.append('file', file);
    try { const r = await api.form(`/portal/contents/${it.id}/adjust`, fd); onDone(r.item, r.mode); } catch (x) { toast(x.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <form className="p-adj" onSubmit={send} aria-label="Pedir ajuste">
      <div className="row between"><div className="caps">Pedir ajuste{it.version?.number ? ` · V${it.version.number}` : ''}</div><button type="button" className="p-link xs" onClick={onClose}>cancelar</button></div>
      <div className="p-adj-chips" role="group" aria-label="O que ajustar">
        {ASPECTS.filter(([k]) => (k === 'pagina' ? pages > 1 : k === 'video' ? isVideo : true)).map(([k, l]) => <button type="button" key={k} className={aspect === k ? 'on' : ''} aria-pressed={aspect === k} onClick={() => setAspect(aspect === k ? null : k)}>{l}</button>)}
      </div>
      <div className="row wrap gap-2">
        {pages > 1 && <select className="p-select sm" value={pg ?? ''} onChange={(e) => setPg(e.target.value ? Number(e.target.value) : null)} aria-label="Página do carrossel"><option value="">Todas as páginas</option>{Array.from({ length: pages }).map((_, i) => <option key={i} value={i + 1}>Página {i + 1}</option>)}</select>}
        {isVideo && <button type="button" className="p-btn sm" onClick={() => setT(currentVideoTime(root.current) ?? 0)}><I.play size={11} /> {t != null ? `Tempo ${fmtT(t)} · marcar de novo` : 'Marcar o tempo do vídeo'}</button>}
        {!isVideo && !it.is_theme && <span className="xs muted">{pick ? <>Ponto marcado <button type="button" className="p-link xs" onClick={() => setPick(null)}>limpar</button></> : 'Toque na imagem para marcar o ponto'}</span>}
      </div>
      <textarea className="p-textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={isVideo ? 'Ex.: “esse trecho poderia ser mais rápido”' : 'Ex.: “trocar a imagem desta página”'} aria-label="Descreva o ajuste" maxLength={4000} />
      {note.trim() && (
        <div className="p-adj-preview" aria-live="polite">
          <span className="caps">Vai ser registrado assim</span>
          <span>AJUSTE · V{it.version?.number ?? '—'}{where ? ` · ${where}` : ''}{aspect ? ` · ${ASPECTS.find(([k]) => k === aspect)[1]}` : ''}: {note.trim().slice(0, 120)}</span>
          <span className="xs muted">A The Bold define quem faz e o prazo. {it.liked ? 'Como o conteúdo já estava aprovado, a nova versão volta para você aprovar.' : ''}</span>
        </div>
      )}
      <div className="row gap-2">
        <label className="p-btn sm"><I.upload size={12} /> {file ? file.name.slice(0, 18) : 'Anexar referência'}<input type="file" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} accept="image/*,video/*,application/pdf" /></label>
        <span className="grow" />
        <button className="p-btn solid" disabled={busy || !note.trim()}>{busy ? 'Enviando…' : 'Enviar ajuste'}</button>
      </div>
    </form>
  );
}

// 💬 COMENTAR / FAZER PERGUNTA — conversa sobre o conteúdo. Pergunta vira pendência da equipe até ser respondida.
function Comments({ it, team, onUpdate, inputRef, mode, setMode, onAdjust }) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [reply, setReply] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const looksAdjust = useMemo(() => !reply && it.can_request_adjust && !it.is_theme && detectAdjustment(body).isAdjustment, [body, reply, it]);
  const roots = it.comments.filter((c) => !c.parent_id);
  const visible = showAll ? roots : roots.slice(-3);
  const replies = (id) => it.comments.filter((c) => c.parent_id === id);
  const q = body.match(/@([\p{L}]*)$/u)?.[1];
  const suggestions = q != null ? team.filter((x) => x.name.toLowerCase().startsWith(q.toLowerCase())).filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i).slice(0, 5) : [];
  const send = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('body', body.trim());
    fd.append('intent', reply ? 'comentario' : mode);
    if (reply) fd.append('parent_id', reply.id);
    try {
      const r = await api.form(`/portal/contents/${it.id}/comments`, fd);
      onUpdate(r.item);
      setBody(''); setReply(null); setShowAll(true);
      toast(r.action?.type === 'pergunta' ? 'Pergunta enviada. A The Bold responde aqui mesmo.' : 'Comentário enviado.');
      setMode('comentario');
    } catch (x) { toast(x.message, 'err'); } finally { setBusy(false); }
  };
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
        {reply ? <div className="xs muted p-replying">Respondendo a {reply.author_name} <button type="button" className="p-link" onClick={() => setReply(null)}>cancelar</button></div> : (
          <div className="p-mode" role="group" aria-label="Tipo de mensagem">
            <button type="button" className={mode === 'comentario' ? 'on' : ''} aria-pressed={mode === 'comentario'} onClick={() => setMode('comentario')}>Comentário</button>
            <button type="button" className={mode === 'pergunta' ? 'on' : ''} aria-pressed={mode === 'pergunta'} onClick={() => setMode('pergunta')}>Pergunta para a equipe</button>
          </div>
        )}
        <div className="row gap-2" style={{ position: 'relative' }}>
          <textarea ref={inputRef} rows={1} className="p-input" placeholder={mode === 'pergunta' && !reply ? 'Faça sua pergunta…' : 'Escreva um comentário…'} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Escrever"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); } }} />
          <button className="p-send" disabled={busy || !body.trim()} aria-label="Enviar"><I.arrow size={16} /></button>
          {suggestions.length > 0 && (
            <div className="p-mentions" role="listbox" aria-label="Pessoas que você pode mencionar">
              {suggestions.map((x) => <button type="button" role="option" aria-selected="false" key={x.id} onClick={() => { setBody(body.replace(/@[\p{L}]*$/u, `@${x.name.split(' ')[0]} `)); inputRef.current?.focus(); }}>@{x.name.split(' ')[0]}</button>)}
            </div>
          )}
        </div>
        {looksAdjust && (
          <div className="p-intent adj">
            <span>Parece um pedido de ajuste. Comentários não mudam o conteúdo.</span>
            <button type="button" className="p-link xs" onClick={() => { onAdjust(body.trim()); setBody(''); }}>transformar em pedido de ajuste</button>
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
        <div className="sm"><b>{c.author_name}</b>{!c.is_client && <span className="p-team">The Bold</span>}{c.is_question && <span className="p-anchor">{c.answered ? 'pergunta · respondida' : 'pergunta'}</span>}{c.is_adjustment && <span className="p-anchor">✎ ajuste</span>} {c.anchor?.page ? <span className="p-anchor">pág. {c.anchor.page}</span> : null}{c.anchor?.t != null ? <span className="p-anchor">{fmtT(c.anchor.t)}</span> : null} {c.body}</div>
        <div className="xs faint">{ago(c.created_at)}{c.version_number ? ` · V${c.version_number}` : ''}{onReply && <> · <button className="p-link xs" onClick={onReply}>responder</button></>}</div>
      </div>
    </div>
  );
}
