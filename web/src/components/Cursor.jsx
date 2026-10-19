// Cursor discreto e contextual (desktop). Elementos com data-cursor="VER|ABRIR|APROVAR|B." exibem o rótulo.
import { useEffect, useRef } from 'react';

export function Cursor() {
  const el = useRef(null);
  const label = useRef(null);
  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let x = -100, y = -100, cx = x, cy = y, raf;
    const move = (e) => {
      x = e.clientX; y = e.clientY;
      const t = e.target.closest?.('[data-cursor]');
      const txt = t?.getAttribute('data-cursor');
      if (txt) { label.current.textContent = txt; el.current.classList.add('on'); } else el.current.classList.remove('on');
    };
    const loop = () => { cx += (x - cx) * 0.22; cy += (y - cy) * 0.22; if (el.current) el.current.style.transform = `translate3d(${cx}px, ${cy}px, 0)`; raf = requestAnimationFrame(loop); };
    window.addEventListener('mousemove', move);
    raf = requestAnimationFrame(loop);
    return () => { window.removeEventListener('mousemove', move); cancelAnimationFrame(raf); };
  }, []);
  return <div className="cursor" ref={el} aria-hidden><div className="dot"><span ref={label} /></div></div>;
}
