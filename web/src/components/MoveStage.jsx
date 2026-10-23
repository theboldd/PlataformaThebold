// Mover etapa manualmente (detalhe do conteúdo e arrastar no quadro de Processos).
// Mostra ANTES de confirmar: tipo do movimento, impacto calculado pelo servidor e quem estava responsável.
// O motivo é obrigatório quando o movimento é relevante (retorno, reabertura, correção, exceção).
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useApi, useToast } from '../lib/hooks.js';
import { Modal, Button, Field } from './ui.jsx';

export function MoveStageModal({ open, content, contents, initialTo, targets, onClose, onDone }) {
  // Cartão do cliente arrastado: move todas as demandas dele (a prévia e o motivo valem para todas)
  const many = contents?.length > 1 ? contents : null;
  const toast = useToast();
  const { data: def } = useApi(open ? '/process/definition' : null, [open], { live: false });
  const [to, setTo] = useState(initialTo || '');
  const [kind, setKind] = useState('auto');
  const [reason, setReason] = useState('');
  const [pv, setPv] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTo(initialTo || ''); setKind('auto'); setReason(''); setPv(null); setErr(null); } }, [open, initialTo]);
  useEffect(() => {
    if (!open || !to || !content) return;
    setErr(null);
    api.get(`/contents/${content.id}/move-preview?to=${to}${kind !== 'auto' ? `&kind=${kind}` : ''}`).then(setPv).catch((e) => { setPv(null); setErr(e.message); });
  }, [open, to, kind, content]);
  if (!open || !content) return null;
  const options = (def?.order || []).filter((k) => k !== 'cancelado' && k !== content.stage && (!targets || targets.includes(k)));
  const go = async () => {
    setBusy(true);
    try {
      if (many) {
        let ok = 0; const fails = [];
        for (const c of many) { try { await api.post(`/contents/${c.id}/move`, { to, reason, kind: kind === 'auto' ? undefined : kind }); ok++; } catch (e) { fails.push(`#${c.number}: ${e.message}`); } }
        toast(fails.length ? `${ok} movida(s). Não deu em ${fails.length}: ${fails[0]}` : `${ok} demandas movidas para ${def?.stages?.[to]?.label || to}. Os responsáveis foram avisados.`, fails.length ? 'err' : undefined);
        onDone?.({ ok });
        return;
      }
      const r = await api.post(`/contents/${content.id}/move`, { to, reason, kind: kind === 'auto' ? undefined : kind });
      toast(`${r.kind_label}: ${r.from_label} → ${r.to_label}.`);
      onDone?.(r);
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Mover etapa"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={busy || !pv || (pv.reason_required && !reason.trim())} onClick={go}>Mover</Button></>}>
      <div className="col gap-4">
        {many ? (
          <div className="sm"><b>{many.length} demandas{content.client ? ` de ${content.client}` : ''}</b><ul className="xs muted" style={{ margin: '6px 0 0', paddingLeft: 18, maxHeight: 120, overflow: 'auto' }}>{many.map((c) => <li key={c.id}>#{c.number} {c.title}</li>)}</ul></div>
        ) : <p className="sm" style={{ margin: 0 }}><b>#{content.number} {content.title}</b></p>}
        <Field label="Para qual etapa">
          <select className="select" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Escolha</option>
            {options.map((k) => <option key={k} value={k}>{def.stages[k].label}</option>)}
          </select>
        </Field>
        {pv && (
          <div className="mv-preview">
            <div className="mv-route"><span>{pv.from_label}</span><span aria-hidden>→</span><b>{pv.to_label}</b><span className={`mv-kind k-${pv.kind}`}>{pv.kind_label}</span></div>
            <Field label="Tipo do movimento" hint="O sistema classifica sozinho; marque Correção quando o card estava na etapa errada, ou Exceção quando é um caso aprovado fora da regra.">
              <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="auto">Automático ({pv.auto_kind === 'manual' ? 'Avanço manual' : pv.auto_kind === 'retorno' ? 'Retorno' : pv.auto_kind === 'reabertura' ? 'Reabertura' : 'Exceção'})</option>
                <option value="correcao">Correção (estava na etapa errada)</option>
                <option value="excecao">Exceção aprovada</option>
              </select>
            </Field>
            {many && <p className="xs muted" style={{ margin: 0 }}>A prévia abaixo é da primeira demanda; o mesmo movimento é aplicado a cada uma e o servidor confere uma a uma.</p>}
            {pv.impacts.length ? (
              <ul className="mv-impacts">{pv.impacts.map((i, n) => <li key={n} className={`l-${i.level}`}>{i.text}</li>)}</ul>
            ) : <p className="xs muted" style={{ margin: 0 }}>Sem impacto em prazo, aprovação ou agendamento.</p>}
            {pv.prev_assignees.length > 0 && <p className="xs muted" style={{ margin: 0 }}>Com o conteúdo agora: {pv.prev_assignees.join(', ')}. Quem estava e quem passa a estar com ele recebem aviso.</p>}
          </div>
        )}
        {err && <p className="xs" style={{ color: 'var(--err)', margin: 0 }}>{err}</p>}
        <Field label={pv?.reason_required ? 'Motivo (obrigatório)' : 'Motivo (opcional)'}>
          <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="O que aconteceu e por que mover" />
        </Field>
      </div>
    </Modal>
  );
}
