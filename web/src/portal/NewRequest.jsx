// + NOVA SOLICITAÇÃO — o cliente pede algo à The Bold. Ao enviar, o servidor cria a solicitação, atribui o responsável
// pelo tipo, cria a tarefa, notifica a equipe e registra no histórico. Aqui só mostramos a confirmação: RECEBEMOS.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useToast } from '../lib/hooks.js';
import { fmtDate } from '../lib/format.js';
import { I } from '../components/Icons.jsx';

export const REQUEST_KINDS = [
  ['conteudo', 'Conteúdo', 'Uma ideia, um post, uma data especial'], ['alteracao', 'Alteração', 'Mudar algo já planejado ou publicado'],
  ['material', 'Material', 'Enviar fotos, vídeos ou arquivos'], ['duvida', 'Dúvida', 'Uma pergunta para a equipe'],
  ['reuniao', 'Reunião', 'Conversar com a The Bold'], ['estrategia', 'Estratégia', 'Um novo objetivo, campanha ou direção'],
  ['financeiro', 'Financeiro', 'Contrato, nota, pagamento'], ['outro', 'Outro', 'Qualquer outro pedido'],
];

export default function NewRequest({ ctx = {}, onClose, onDone }) {
  const toast = useToast();
  const [kind, setKind] = useState(ctx.kind || null);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const first = useRef(null);
  useEffect(() => { first.current?.focus(); const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const send = async (e) => {
    e.preventDefault();
    if (!kind || (!title.trim() && !desc.trim())) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('kind', kind); fd.append('title', title.trim()); fd.append('description', desc.trim());
    if (ctx.ref) { fd.append('ref_type', 'conteudo'); fd.append('ref_id', ctx.ref.id); }
    if (file) fd.append('file', file);
    try { const r = await api.form('/portal/requests', fd); setDone(r); onDone?.(); } catch (x) { toast(x.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-labelledby="nr-t">
      <div className="modal p-sheet p-nr">
        <div className="p-sheet-grip" aria-hidden />
        {done ? (
          <div className="p-received" role="status" aria-live="polite">
            <span className="p-received-mark" aria-hidden><I.check size={26} /></span>
            <h2 className="ed-xl" id="nr-t">Recebemos.</h2>
            <p className="p-lede">A The Bold vai analisar sua solicitação.{done.expected_at ? ` Você recebe um retorno até ${fmtDate(done.expected_at)}.` : ''}</p>
            <div className="p-nr-foot">
              <button className="p-btn" onClick={onClose}>Fechar</button>
              <Link className="p-btn solid" to={`/portal/solicitacoes?r=${done.id}`} onClick={onClose}>Acompanhar <I.arrow size={14} /></Link>
            </div>
          </div>
        ) : (
          <form onSubmit={send}>
            <div className="caps">Pedir algo à The Bold</div>
            <h2 className="ed-lg" id="nr-t" style={{ margin: '6px 0 18px' }}>Nova solicitação</h2>
            {ctx.ref && <p className="sm muted" style={{ marginTop: -8 }}>Sobre o conteúdo “{ctx.ref.title}”</p>}
            <fieldset className="p-kinds">
              <legend className="caps">Sobre o quê?</legend>
              {REQUEST_KINDS.map(([k, label, hint], i) => (
                <button type="button" key={k} ref={i === 0 ? first : null} className={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => setKind(k)}>
                  <b>{label}</b><small>{hint}</small>
                </button>
              ))}
            </fieldset>
            <label className="p-field">
              <span className="caps">Título (opcional)</span>
              <input className="p-input sq" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Em poucas palavras" />
            </label>
            <label className="p-field">
              <span className="caps">Conte o que você precisa</span>
              <textarea className="p-textarea" rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={8000} />
            </label>
            <div className="p-nr-foot">
              <label className="p-btn sm"><I.upload size={12} /> {file ? file.name.slice(0, 22) : 'Anexar arquivo'}<input type="file" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} accept="image/*,video/*,application/pdf,.zip" /></label>
              <span className="grow" />
              <button type="button" className="p-btn" onClick={onClose}>Cancelar</button>
              <button className="p-btn solid" disabled={busy || !kind || (!title.trim() && !desc.trim())}>{busy ? 'Enviando…' : 'Enviar'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
