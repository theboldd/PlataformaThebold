// Visualizador de mídia profissional: carrossel com swipe, vídeo com player completo, zoom no ORIGINAL.
// Usa o preview otimizado na interface; o original (resolução total) fica a um clique — e nunca é alterado.
import { useEffect, useRef, useState } from 'react';
import { I } from './Icons.jsx';

// pins: [{ page, x, y, n, open }] (x/y de 0 a 1 sobre a imagem) · onPick: modo anotação — tocar marca um ponto em vez de ampliar
export function MediaView({ media = [], aspect, onPage, dark, rounded = true, page: controlledPage, pins = [], onPick = null }) {
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(null);
  const track = useRef(null);
  const p = controlledPage ?? page;
  useEffect(() => { onPage?.(p); }, [p]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!media.length) return <div className="mv-empty" style={{ aspectRatio: aspect || '4 / 5' }}><span className="caps">Sem mídia nesta versão</span></div>;
  const first = media[0];
  const ratio = aspect || (first.width && first.height ? `${first.width} / ${first.height}` : '4 / 5');
  const go = (i) => { const n = Math.max(0, Math.min(media.length - 1, i)); setPage(n); track.current?.children[n]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' }); };
  const onScroll = () => { const el = track.current; if (!el) return; const n = Math.round(el.scrollLeft / el.clientWidth); if (n !== page) setPage(n); };
  return (
    <div className={`mv ${dark ? 'mv-dark' : ''} ${rounded ? 'mv-rounded' : ''}`}>
      <div className="mv-track" ref={track} onScroll={onScroll} style={{ aspectRatio: ratio }} tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'ArrowRight') go(p + 1); if (e.key === 'ArrowLeft') go(p - 1); }} aria-label={media.length > 1 ? `Carrossel, página ${p + 1} de ${media.length}` : 'Mídia'}>
        {media.map((m, i) => (
          <div className="mv-slide" key={m.id + i}>
            {m.kind === 'video' ? <Video m={m} /> : (
              <div className={`mv-pinbox ${onPick ? 'picking' : ''}`} style={m.width && m.height ? { aspectRatio: `${m.width} / ${m.height}` } : undefined}>
                <img src={m.urls.preview || m.urls.original} alt={`${m.name} (${i + 1}/${media.length})`} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" draggable={false}
                  onClick={(e) => {
                    if (!onPick) return setZoom(m);
                    const r = e.currentTarget.getBoundingClientRect();
                    onPick({ page: i + 1, x: Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000, y: Math.round(((e.clientY - r.top) / r.height) * 1000) / 1000 });
                  }} data-cursor={onPick ? 'MARCAR' : 'VER'} style={{ cursor: onPick ? 'crosshair' : 'zoom-in' }} />
                {pins.filter((pin) => (pin.page || 1) === i + 1).map((pin, k) => (
                  <span key={k} className={`mv-pin ${pin.open ? 'open' : ''} ${pin.draft ? 'draft' : ''}`} style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }} title={pin.label || ''} aria-label={pin.label ? `Marcação: ${pin.label}` : 'Marcação'}>{pin.n ?? ''}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {media.length > 1 && (
        <>
          <button className="mv-nav l" onClick={() => go(p - 1)} disabled={p === 0} aria-label="Anterior"><I.left /></button>
          <button className="mv-nav r" onClick={() => go(p + 1)} disabled={p === media.length - 1} aria-label="Próxima"><I.right /></button>
          <div className="mv-dots" aria-hidden>{media.map((_, i) => <span key={i} className={i === p ? 'on' : ''} />)}</div>
          <div className="mv-count">{p + 1}/{media.length}</div>
        </>
      )}
      {zoom && <Zoom m={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}

function Video({ m }) {
  const v = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(m.duration || 0);
  const toggle = () => { const el = v.current; if (!el) return; el.paused ? el.play() : el.pause(); };
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return (
    <div className="mv-video">
      <video ref={v} src={m.urls.preview} poster={m.urls.poster || undefined} playsInline preload="metadata" onClick={toggle}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setDur(e.currentTarget.duration)} data-cursor={playing ? 'PAUSAR' : 'PLAY'} />
      {!playing && <button className="mv-play" onClick={toggle} aria-label="Reproduzir"><I.play size={26} /></button>}
      <div className="mv-controls" onClick={(e) => e.stopPropagation()}>
        <button onClick={toggle} aria-label={playing ? 'Pausar' : 'Reproduzir'}>{playing ? <I.pause size={14} /> : <I.play size={14} />}</button>
        <span className="mv-time">{fmt(t)}</span>
        <input type="range" min={0} max={dur || 0} step={0.05} value={t} onChange={(e) => { v.current.currentTime = Number(e.target.value); }} aria-label="Progresso" />
        <span className="mv-time">{fmt(dur)}</span>
        <button onClick={() => { v.current.muted = !muted; setMuted(!muted); }} aria-label={muted ? 'Ativar som' : 'Silenciar'}>{muted ? <I.mute size={15} /> : <I.sound size={15} />}</button>
        <button onClick={() => (v.current.requestFullscreen?.() || v.current.webkitEnterFullscreen?.())} aria-label="Tela cheia"><I.expand size={14} /></button>
      </div>
    </div>
  );
}
export const currentVideoTime = (root) => root?.querySelector('video')?.currentTime ?? null;

function Zoom({ m, onClose }) {
  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return (
    <div className="mv-zoom" onClick={onClose} role="dialog" aria-label="Imagem em resolução original">
      <img src={m.urls.original} alt={m.name} />
      <div className="mv-zoom-bar" onClick={(e) => e.stopPropagation()}>
        <span>Original · {m.width}×{m.height}px</span>
        <a className="btn btn-sm" href={m.urls.download}><I.download size={14} /> Baixar original</a>
        <button className="btn btn-sm" onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}
