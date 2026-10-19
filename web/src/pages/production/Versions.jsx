import { useState } from 'react';
import { MediaView } from '../../components/MediaView.jsx';
import { fmtDateTime } from '../../lib/format.js';

const label = (v) => ({ rascunho: 'rascunho', em_revisao: 'em revisão', enviada_cliente: 'enviada ao cliente', aprovada: 'aprovada', substituida: 'substituída' })[v.status] || v.status;

export function VersionChips({ versions, value, onChange, approvedId }) {
  return (
    <div className="versions" role="tablist" aria-label="Versões">
      {versions.map((v) => (
        <button key={v.id} role="tab" aria-selected={value === v.id} className={`vchip ${value === v.id ? 'active' : ''} ${v.id === approvedId ? 'approved' : ''}`} onClick={() => onChange(v.id)} title={`${label(v)} · ${fmtDateTime(v.created_at)}`}>
          V{v.number}{v.id === approvedId ? ' ✓' : v.locked ? ' 🔒' : ''}
        </button>
      ))}
    </div>
  );
}

// Comparação lado a lado de duas versões (nada é sobrescrito: todas ficam no histórico)
export function CompareVersions({ versions, approvedId }) {
  const [a, setA] = useState(versions[1]?.id || versions[0]?.id);
  const [b, setB] = useState(versions[0]?.id);
  const va = versions.find((v) => v.id === a), vb = versions.find((v) => v.id === b);
  const pick = (val, set) => (
    <select className="select" value={val} onChange={(e) => set(e.target.value)} aria-label="Versão">
      {versions.map((v) => <option key={v.id} value={v.id}>V{v.number} — {label(v)}{v.id === approvedId ? ' ✓' : ''}</option>)}
    </select>
  );
  return (
    <div className="compare">
      {[[va, a, setA], [vb, b, setB]].map(([v, val, set], i) => (
        <div key={i} className="col gap-2">
          {pick(val, set)}
          {v && <MediaView media={v.media} />}
          {v && <div className="caption-box" style={{ maxHeight: 220, overflow: 'auto' }}>{v.caption || <span className="faint">Sem legenda</span>}</div>}
          {v && <div className="xs faint">{v.author ? `por ${v.author} · ` : ''}{fmtDateTime(v.created_at)}{v.approved_at ? ` · aprovada por ${v.approver} em ${fmtDateTime(v.approved_at)}` : ''}</div>}
        </div>
      ))}
    </div>
  );
}
export const versionStatusLabel = label;
