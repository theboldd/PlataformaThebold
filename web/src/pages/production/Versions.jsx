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

// Diferença de legenda palavra a palavra (LCS): o que saiu da versão A e o que entrou na B
function wordDiff(a = '', b = '') {
  const A = a.split(/(\s+)/), B = b.split(/(\s+)/);
  if (A.length * B.length > 4e6) return null; // legenda enorme: mostra só lado a lado
  const L = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) { out.push(['=', A[i]]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push(['-', A[i++]]); else out.push(['+', B[j++]]);
  }
  while (i < A.length) out.push(['-', A[i++]]);
  while (j < B.length) out.push(['+', B[j++]]);
  return out;
}
export function CaptionDiff({ from, to }) {
  const d = wordDiff(from, to);
  if (!d) return null;
  if (!d.some(([k]) => k !== '=')) return <p className="xs faint" style={{ margin: 0 }}>Legenda igual nas duas versões.</p>;
  return (
    <div className="caption-box cap-diff" aria-label="Mudanças na legenda">
      {d.map(([k, w], n) => (k === '=' ? <span key={n}>{w}</span> : k === '-' ? <del key={n}>{w}</del> : <ins key={n}>{w}</ins>))}
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
      {va && vb && va.id !== vb.id && (
        <div style={{ gridColumn: '1 / -1' }}>
          <div className="caps mb-2">O que mudou na legenda (V{va.number} → V{vb.number})</div>
          <CaptionDiff from={va.caption} to={vb.caption} />
        </div>
      )}
    </div>
  );
}
export const versionStatusLabel = label;
