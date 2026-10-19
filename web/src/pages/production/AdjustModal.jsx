import { useState } from 'react';
import { Button, Field, Modal } from '../../components/ui.jsx';
import { I } from '../../components/Icons.jsx';
import { useApi } from '../../lib/hooks.js';

// Solicitar ajuste (revisão interna): múltiplos itens, cada um com trilha (visual/legenda) e responsável opcional.
export function AdjustModal({ open, onClose, onSubmit, title = 'Solicitar ajuste', isCronograma, producers = [], busy }) {
  const { data: people } = useApi(open ? '/users/directory' : null, [open], { live: false });
  const [items, setItems] = useState([{ description: '', track: 'visual', assignee_id: '' }]);
  const [note, setNote] = useState('');
  const upd = (i, k, v) => setItems(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const valid = isCronograma ? note.trim() : items.some((x) => x.description.trim());
  const send = () => onSubmit(isCronograma ? { decision: 'ajuste', note } : { decision: 'ajuste', note: note || undefined, adjustments: items.filter((x) => x.description.trim()).map((x) => ({ ...x, assignee_id: x.assignee_id || null })) });
  const producerIds = new Set(producers.map((p) => p.id));
  const sorted = (people || []).slice().sort((a, b) => (producerIds.has(b.id) - producerIds.has(a.id)) || a.name.localeCompare(b.name));
  return (
    <Modal open={open} onClose={onClose} title={title} wide footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" magnetic disabled={!valid || busy} onClick={send} data-cursor="ENVIAR">Enviar ajuste</Button></>}>
      {isCronograma ? (
        <Field label="O que precisa mudar no tema?"><textarea className="textarea" autoFocus value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      ) : (
        <>
          <p className="sm muted" style={{ marginTop: 0 }}>Cada item vira uma tarefa de ajuste para quem produziu (ou para a pessoa escolhida). A versão atual fica preservada; o ajuste gera uma nova versão.</p>
          {items.map((it, i) => (
            <div className="adj-item" key={i}>
              <input className="input" placeholder={`Ajuste ${i + 1}: o que mudar?`} value={it.description} onChange={(e) => upd(i, 'description', e.target.value)} autoFocus={i === 0} aria-label={`Descrição do ajuste ${i + 1}`} />
              <select className="select" value={it.track} onChange={(e) => upd(i, 'track', e.target.value)} aria-label="Trilha"><option value="visual">Arte / vídeo</option><option value="legenda">Legenda</option></select>
              <select className="select" value={it.assignee_id} onChange={(e) => upd(i, 'assignee_id', e.target.value)} aria-label="Responsável">
                <option value="">Quem produziu (automático)</option>{sorted.map((p) => <option key={p.id} value={p.id}>{p.name}{producerIds.has(p.id) ? ' · produziu' : ''}</option>)}
              </select>
              <Button size="sm" variant="ghost" icon={<I.x />} onClick={() => setItems(items.length > 1 ? items.filter((_, j) => j !== i) : items)} aria-label="Remover item" />
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={<I.plus size={14} />} onClick={() => setItems([...items, { description: '', track: 'visual', assignee_id: '' }])}>Adicionar item</Button>
          <Field label="Observação geral (opcional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </>
      )}
    </Modal>
  );
}
