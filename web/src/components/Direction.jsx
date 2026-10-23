// DIRECIONAMENTO da estrategista: como ela pensou o conteúdo — observação, links e imagens/vídeos de referência.
// Opcional. Não é a peça final (não entra em versão). Design/edição e o cliente (ao aprovar) veem o mesmo bloco.
import { useState } from 'react';
import { uploadWithProgress } from '../lib/api.js';
import { useToast } from '../lib/hooks.js';
import { Dropzone } from '../pages/production/Dropzone.jsx';
import '../styles/direction.css';

export function DirectionView({ d, title = 'Direcionamento da estrategista', onRemove }) {
  if (!d) return null;
  return (
    <section className="dir" aria-label={title}>
      <span className="dir-k">{title}</span>
      {d.note && <p className="dir-note">{d.note}</p>}
      {d.links?.length > 0 && <ul className="dir-links">{d.links.map((l) => <li key={l}><a href={l} target="_blank" rel="noreferrer noopener">{l.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)} ↗</a></li>)}</ul>}
      {d.files?.length > 0 && (
        <div className="dir-files">
          {d.files.map((f) => (
            <figure key={f.id}>
              <a href={f.urls.original} target="_blank" rel="noreferrer">
                {f.kind === 'video' ? <video src={f.urls.preview || f.urls.original} poster={f.urls.poster || undefined} muted playsInline preload="metadata" /> : f.urls.thumb ? <img src={f.urls.thumb} alt={f.name} loading="lazy" /> : <span className="dir-doc">{f.name}</span>}
              </a>
              {onRemove && <button type="button" className="dir-x" onClick={() => onRemove(f)} aria-label={`Retirar ${f.name}`}>×</button>}
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}

// Edição: observação + links (um por linha) + arquivos de referência. Salva tudo de uma vez.
export function DirectionEditor({ contentId, d, onSaved }) {
  const toast = useToast();
  const [note, setNote] = useState(d?.note || '');
  const [links, setLinks] = useState((d?.links || []).join('\n'));
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(null);
  const save = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('note', note); fd.append('links', links);
      files.forEach((f) => fd.append('files', f));
      const r = await uploadWithProgress(`/contents/${contentId}/direcionamento`, fd, setPct);
      setFiles([]); toast('Direcionamento salvo.'); onSaved?.(r.direction);
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); setPct(null); }
  };
  return (
    <div className="dir-edit">
      <label className="dir-field"><span>Observação</span><textarea className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Como você pensou este conteúdo: ideia visual, tom, cenário, o que não pode faltar…" /></label>
      <label className="dir-field"><span>Links de referência <small>(um por linha)</small></span><textarea className="textarea" rows={2} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://pinterest.com/… · https://instagram.com/p/…" /></label>
      <div className="dir-field"><span>Imagens ou vídeos de referência</span><Dropzone files={files} onFiles={setFiles} label="Arraste ou clique para anexar referências (não é a peça final)" /></div>
      {files.length > 0 && <p className="xs muted">{files.length} arquivo(s) para anexar: {files.map((f) => f.name).join(', ')}</p>}
      {pct != null && <div className="progress"><span style={{ width: `${Math.round(pct * 100)}%` }} /></div>}
      <div className="row end"><button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar direcionamento'}</button></div>
    </div>
  );
}
