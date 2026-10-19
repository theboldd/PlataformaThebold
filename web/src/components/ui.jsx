import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { STATUS, STATUS_GLYPH, RISK, FORMATS } from '../lib/status.js';
import { initials, fmtDate, ago } from '../lib/format.js';
import { I } from './Icons.jsx';

// Botão com magnetismo sutil (usar só nas ações principais: APROVAR, SOLICITAR AJUSTE, CRIAR, AGENDAR)
export function Button({ variant, size, magnetic, cursor, className = '', children, icon, arrow, ...p }) {
  const ref = useRef(null);
  const onMove = (e) => {
    if (!magnetic || !ref.current || window.matchMedia('(pointer: coarse)').matches) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left - r.width / 2) * 0.18, y = (e.clientY - r.top - r.height / 2) * 0.28;
    ref.current.style.transform = `translate(${x}px, ${y}px)`;
  };
  const onLeave = () => { if (ref.current) ref.current.style.transform = ''; };
  const cls = ['btn', variant && `btn-${variant}`, size && `btn-${size}`, magnetic && 'magnetic', !children && icon && 'btn-icon', className].filter(Boolean).join(' ');
  return (
    <button ref={ref} className={cls} onMouseMove={onMove} onMouseLeave={onLeave} data-cursor={cursor} {...p}>
      {icon}{children}{arrow && <I.arrow className="arrow" size={14} />}
    </button>
  );
}

export const Status = ({ s, label }) => (
  <span className={`status s-${s}`}>{STATUS_GLYPH[s] ? <span aria-hidden>{STATUS_GLYPH[s]}</span> : <span className="mark" aria-hidden />}{label || STATUS[s] || s}</span>
);
export const Risk = ({ level }) => (level && level !== 'nenhum' && level !== 'baixo' ? <span className={`risk risk-${level}`}>Risco {RISK[level]}</span> : null);
export const Tag = ({ tone, children }) => <span className={`tag ${tone ? `tag-${tone}` : ''}`}>{children}</span>;
export const Format = ({ f }) => <span className="tag">{FORMATS[f] || f}</span>;
export const Avatar = ({ name, size, tone }) => <span className={`avatar ${size || ''} ${tone || ''}`} title={name}>{initials(name || '?')}</span>;

export function Stat({ value, label, hint, alert, to, onClick }) {
  const body = (<><span className={`value num ${alert ? 'alert' : ''}`}>{typeof value === 'number' ? String(value).padStart(2, '0') : value}</span><span className="label">{label}</span>{hint && <span className="hint">{hint}</span>}</>);
  if (to) return <Link to={to} className="stat link" data-cursor="ABRIR">{body}</Link>;
  if (onClick) return <button onClick={onClick} className="stat link" style={{ background: 'none', border: 0, borderTop: '1px solid var(--ink)', textAlign: 'left', color: 'inherit' }} data-cursor="ABRIR">{body}</button>;
  return <div className="stat">{body}</div>;
}

export function PageHead({ kicker, title, sub, children }) {
  return (
    <header className="page-head">
      <div>
        {kicker && <div className="caps kicker">{kicker}</div>}
        <h1 className="ed-xl">{title}</h1>
        {sub && <p className="muted mt-2" style={{ margin: '8px 0 0', maxWidth: 640 }}>{sub}</p>}
      </div>
      {children && <div className="row wrap">{children}</div>}
    </header>
  );
}
export const Section = ({ title, kicker, action, children, className = '' }) => (
  <section className={`section ${className}`}>
    <div className="section-head"><div>{kicker && <div className="caps">{kicker}</div>}<h2 className="ed-md">{title}</h2></div>{action}</div>
    {children}
  </section>
);
export const Empty = ({ title = 'Nada por aqui.', children }) => <div className="empty"><div className="ed-md">{title}</div>{children && <div className="sm">{children}</div>}</div>;
export const Loading = ({ rows = 4 }) => <div className="col" aria-busy="true">{Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton" style={{ height: i === 0 ? 48 : 22, width: `${90 - i * 9}%` }} />)}</div>;
export const ErrorBox = ({ error }) => (error ? <div className="panel" style={{ borderColor: 'var(--err)', color: 'var(--err)' }}>{error.message}</div> : null);

export function Modal({ open, onClose, title, children, wide, footer }) {
  useEffect(() => { if (!open) return; const h = (e) => e.key === 'Escape' && onClose?.(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="row between mb-5"><h2 className="ed-lg">{title}</h2><Button variant="ghost" icon={<I.x />} onClick={onClose} aria-label="Fechar" /></div>
        {children}
        {footer && <div className="row end mt-5">{footer}</div>}
      </div>
    </div>
  );
}
export function Drawer({ open, onClose, title, kicker, children, wide }) {
  useEffect(() => { if (!open) return; const h = (e) => e.key === 'Escape' && onClose?.(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()} role="dialog" aria-modal="true" aria-label={title}>
      <aside className={`drawer ${wide ? 'wide' : ''}`}>
        <div className="row between mb-5"><div>{kicker && <div className="caps">{kicker}</div>}<h2 className="ed-lg">{title}</h2></div><Button variant="ghost" icon={<I.x />} onClick={onClose} aria-label="Fechar" /></div>
        {children}
      </aside>
    </div>
  );
}
export function Tabs({ tabs, value, onChange }) {
  return <div className="tabs" role="tablist">{tabs.map((t) => <button key={t.key} role="tab" aria-selected={value === t.key} className={`tab ${value === t.key ? 'active' : ''}`} onClick={() => onChange(t.key)}>{t.label}{t.count ? <span className="faint"> {t.count}</span> : null}</button>)}</div>;
}
export function Seg({ options, value, onChange, label }) {
  return <div className="seg" role="group" aria-label={label}>{options.map((o) => <button key={o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)} aria-pressed={value === o.value}>{o.label}</button>)}</div>;
}
export const Field = ({ label, children, hint }) => <div className="field"><label>{label}</label>{children}{hint && <span className="xs muted">{hint}</span>}</div>;

// Card de conteúdo usado no board e em listas
export function ContentCard({ c, compact }) {
  const inner = (
    <>
      <div className="row between"><span className="client clip">{c.client?.replace(' [DEMO]', '')}</span>{c.priority === 'alta' || c.priority === 'critica' ? <span className="sev sev-alta">● {c.priority}</span> : null}</div>
      <div className="row-top" style={{ gap: 10 }}>
        <div className="grow"><div className="title">#{c.number} {c.title}</div></div>
        {c.thumb && !compact && <img className="thumb" src={c.thumb} alt="" loading="lazy" />}
      </div>
      {c.blocked && <div className="xs" style={{ color: 'var(--err)', marginBottom: 8 }}>■ {c.block_reason}</div>}
      <div className="meta">
        <span className={c.owner === 'SEM RESPONSÁVEL' ? 'strong' : ''} style={c.owner === 'SEM RESPONSÁVEL' ? { color: 'var(--err)' } : null}>{c.owner || '—'}</span>
        <span>{c.due_at ? `prazo ${fmtDate(c.due_at)}` : c.planned_at ? `pub. ${fmtDate(c.planned_at)}` : ''}</span>
      </div>
      <div className="meta mt-2"><span className="faint">{c.stage_label} · {c.hours_in_stage < 24 ? `${c.hours_in_stage}h` : `${Math.floor(c.hours_in_stage / 24)}d`} parado</span><Risk level={c.risk} /></div>
    </>
  );
  const cls = `ccard ${c.restricted ? 'restricted' : ''} ${['critico', 'alto'].includes(c.risk) ? `risk-edge-${c.risk}` : ''}`;
  if (c.restricted) return <div className={cls} title="Você não está vinculado(a) a este cliente — detalhes restritos.">{inner}<div className="xs faint mt-2 row gap-1"><I.lock size={12} /> detalhes restritos</div></div>;
  return <Link to={`/conteudos/${c.id}`} className={cls} data-cursor="ABRIR">{inner}</Link>;
}

export function Timeline({ items, empty = 'Sem histórico ainda.' }) {
  if (!items?.length) return <Empty title={empty} />;
  return (
    <ol className="list">
      {items.map((l) => (
        <li key={l.id || l.created_at + l.summary} style={{ alignItems: 'flex-start' }}>
          <span className="xs faint" style={{ width: 92, flex: 'none', paddingTop: 2 }}>{ago(l.created_at)}</span>
          <div className="grow">
            <div className="sm">{l.summary}</div>
            <div className="xs faint">{l.actor_name || (l.actor_kind === 'sistema' || l.origin === 'automatica' ? 'Sistema' : l.actor_kind === 'integracao' ? 'Integração' : '—')}{l.origin === 'automatica' ? ' · automático' : ''}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
