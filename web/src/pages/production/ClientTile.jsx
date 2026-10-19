import { Link } from 'react-router-dom';
import { cleanName, initials } from '../../lib/format.js';
import '../../styles/tiles.css';

// Card de cliente: capa preta, avatar sobreposto, nome + status, segmento e chips de contagem por estado.
export function ClientTile({ to, name, status, segment, chips = [], cover = [], footer, badge }) {
  const clean = cleanName(name).replace(/^Dra?\.\s*/, '');
  return (
    <Link to={to} className="ct" data-cursor="ABRIR">
      <div className="ct-cover">
        {cover.length > 0 && <div className="ct-mosaic">{cover.slice(0, 4).map((src, i) => <img key={i} src={src} alt="" loading="lazy" />)}</div>}
        <span className="ct-ghost" aria-hidden>{clean.split(' ')[0]}</span>
        {badge && <span className="ct-badge">{badge}</span>}
      </div>
      <div className="ct-body">
        <span className="ct-avatar" aria-hidden>{initials(clean)}</span>
        <div className="ct-title"><span className="ct-name">{cleanName(name)}</span>{status && <span className={`ct-status s-${status.key}`}>{status.label}</span>}</div>
        {segment && <span className="ct-seg">{segment}</span>}
        <div className="ct-chips">
          {chips.map((c) => <span key={c.label} className={`ct-chip t-${c.tone || 'neutral'} ${c.n ? '' : 'zero'}`}><i />{c.n} {c.label}</span>)}
        </div>
        {footer && <div className="ct-foot">{footer}</div>}
      </div>
    </Link>
  );
}
