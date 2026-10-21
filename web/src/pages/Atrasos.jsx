// ITENS LEGADOS (regra oficial 18) — LEGADO / MIGRADO DO NOTION — NÃO VALIDADO.
// Fatos de cada item (sempre com a fonte) e decisão individual: REPROGRAMAR · ENCERRAR COMO CANCELADO · MANTER COMO HISTÓRICO.
// Nada aqui é atraso, pendência ou dado de performance. Não existe ação em massa.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi, useToast } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { useUrlState } from '../lib/nav.jsx';
import { Loading, ErrorBox, Empty, Drawer, Button, Field } from '../components/ui.jsx';
import { cleanName, fmtDateTime } from '../lib/format.js';
import '../styles/atrasos.css';

const pad = (n) => String(n ?? 0).padStart(2, '0');

export default function Atrasos() {
  useCrumbs('Operação', 'Itens legados');
  const toast = useToast();
  const [only, setOnly] = useUrlState('situacao', 'nao_validado');
  const [client, setClient] = useUrlState('cliente', '');
  const [open, setOpen] = useUrlState('item', '');
  const { data, error, loading, reload } = useApi('/atrasos');
  const items = data?.items || [];
  const shown = useMemo(() => items.filter((i) => (!client || i.client_id === client) && (only === 'todos' || i.decision === only)), [items, client, only]);
  const clients = useMemo(() => [...new Map(items.map((i) => [i.client_id, i.client])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]))), [items]);
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  if (loading || !data) return <div className="page"><Loading rows={8} /></div>;
  const c = data.counts.by_decision;
  const item = open ? items.find((i) => i.task_id === open) : null;

  return (
    <div className="page at">
      <header className="at-head">
        <h1 className="at-h1">Itens legados</h1>
        <p className="at-sub">Itens herdados da coluna “Para agendamento” do Notion: <b>LEGADO · MIGRADO DO NOTION · NÃO VALIDADO</b>. Não são pendência, atraso, tarefa ativa, carga, aprovação nem dado de performance.
          Abaixo estão só os fatos registrados, cada um com a fonte. A decisão é sempre individual.</p>
      </header>

      <div className="at-kpis">
        {Object.entries(data.decisions).map(([k, l]) => (
          <button key={k} className={`at-k ${only === k ? 'on' : ''}`} onClick={() => setOnly(k)}><b>{pad(c[k])}</b><span>{l}</span></button>
        ))}
      </div>

      <div className="at-filters">
        <label>Cliente
          <select className="select" value={client} onChange={(e) => setClient(e.target.value)}>
            <option value="">Todos</option>
            {clients.map(([id, name]) => <option key={id} value={id}>{cleanName(name || '—')}</option>)}
          </select>
        </label>
        <button className={`at-k-link ${only === 'todos' ? 'on' : ''}`} onClick={() => setOnly('todos')}>Ver todos ({data.counts.total})</button>
      </div>

      {!shown.length ? <Empty title="Nenhum item nesta situação." /> : (
        <div className="at-table" role="table" aria-label="Itens legados">
          <div className="at-tr at-th" role="row">
            <span role="columnheader" /><span role="columnheader">Cliente · conteúdo</span><span role="columnheader">Etapa de origem</span><span role="columnheader">Com</span><span role="columnheader">Data no Notion</span><span role="columnheader">Situação</span>
          </div>
          {shown.map((i) => (
            <div key={i.task_id} className={`at-tr ${i.decision !== 'nao_validado' ? 'done' : ''}`} role="row">
              <span role="cell" />
              <button className="at-main" role="cell" onClick={() => setOpen(i.task_id)}><small>{cleanName(i.client || '—')}</small><b>#{i.number} {i.content_title}</b></button>
              <span role="cell" data-l="Etapa">{i.facts.find((f) => f.k === 'etapa')?.value}</span>
              <span role="cell" data-l="Com">{i.assignee || 'Sem responsável'}</span>
              <span role="cell" data-l="Data">{i.facts.find((f) => f.k === 'data_original')?.value}</span>
              <span role="cell" data-l="Situação"><span className={`at-cat c-${i.decision}`}>{i.decision_label}</span>{i.decided_by && <small>{i.decided_by_name} · {fmtDateTime(i.decided_at)}</small>}</span>
            </div>
          ))}
        </div>
      )}

      <ItemDrawer item={item} meta={data} onClose={() => setOpen('')} onDone={() => { reload(); toast('Decisão registrada no histórico.'); }} />
    </div>
  );
}

function Facts({ list }) {
  return (
    <dl className="at-facts">
      {list.map((f) => (
        <div key={f.k}><dt>{f.label}</dt><dd>{/^https?:\/\//.test(f.value) ? <a href={f.value} target="_blank" rel="noreferrer">{f.value}</a> : f.value}<small>Fonte: {f.source}</small></dd></div>
      ))}
    </dl>
  );
}

function ItemDrawer({ item, meta, onClose, onDone }) {
  const toast = useToast();
  const [mode, setMode] = useState('reprogramar');
  const [f, setF] = useState({ due: '', assignee_id: '', stage: 'agendamento', note: '' });
  const [busy, setBusy] = useState(false);
  const { data: hist, reload } = useApi(item ? `/atrasos/${item.task_id}/historico` : null, [item?.task_id, item?.updated_at]);
  if (!item) return null;
  const pending = item.decision === 'nao_validado';
  const go = async () => {
    setBusy(true);
    try {
      if (mode === 'reprogramar') await api.post(`/atrasos/${item.task_id}/reprogramar`, { due_at: f.due ? new Date(f.due).toISOString() : null, assignee_id: f.assignee_id, stage: f.stage, note: f.note });
      else if (mode === 'cancelar') await api.post(`/atrasos/${item.task_id}/cancelar`, { note: f.note });
      else await api.post(`/atrasos/${item.task_id}/historico`, { note: f.note });
      setF({ due: '', assignee_id: '', stage: 'agendamento', note: '' }); reload(); onDone();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const ready = mode === 'reprogramar' ? f.due && f.assignee_id && f.stage && f.note.trim() : mode === 'cancelar' ? f.note.trim() : true;
  return (
    <Drawer open onClose={onClose} title={`#${item.number} ${item.content_title}`} kicker={`${cleanName(item.client || '')} · ${item.decision_label}`} wide>
      <div className="col gap-5">
        {item.content_id && <Link className="btn btn-sm btn-ghost" to={`/conteudos/${item.content_id}`} style={{ alignSelf: 'flex-start' }}>Abrir conteúdo</Link>}
        <section><h3 className="at-h3">Fatos registrados na plataforma</h3><Facts list={item.facts} /></section>
        {item.source_facts.length > 0 && <section><h3 className="at-h3">Fatos da fonte original (Notion)</h3><Facts list={item.source_facts} /></section>}
        {!pending && <section><h3 className="at-h3">Decisão</h3><p className="sm" style={{ margin: 0 }}><b>{item.decision_label}</b> — por {item.decided_by_name} em {fmtDateTime(item.decided_at)}</p>{item.note && <p className="sm muted" style={{ margin: '4px 0 0' }}>{item.note}</p>}</section>}

        {meta.can_edit && pending && (
          <section className="at-act">
            <div className="seg" role="group" aria-label="Decisão">
              {[['reprogramar', 'Reprogramar'], ...(meta.can_cancel ? [['cancelar', 'Encerrar como cancelado']] : []), ['historico', 'Manter como histórico']].map(([k, l]) => <button key={k} className={mode === k ? 'active' : ''} aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>)}
            </div>
            {mode === 'reprogramar' && (
              <>
                <p className="xs muted" style={{ margin: 0 }}>O item volta à operação e passa a ser demanda válida (nascida na plataforma a partir de agora).</p>
                <div className="grid-2">
                  <Field label="Etapa"><select className="select" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}>{meta.stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
                  <Field label="Responsável"><select className="select" value={f.assignee_id} onChange={(e) => setF({ ...f, assignee_id: e.target.value })}><option value="">Escolha</option>{meta.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
                </div>
                <Field label="Novo prazo"><input className="input" type="datetime-local" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
              </>
            )}
            {mode === 'cancelar' && <p className="xs muted" style={{ margin: 0 }}>Encerra o conteúdo como cancelado. Nada é apagado; o estado anterior fica no histórico.</p>}
            {mode === 'historico' && <p className="xs muted" style={{ margin: 0 }}>O item fica preservado e totalmente fora da operação.</p>}
            <Field label={mode === 'historico' ? 'Observação (opcional)' : 'Contexto / motivo (obrigatório)'}>
              <textarea className="textarea" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
            </Field>
            <Button variant="primary" disabled={busy || !ready} onClick={go}>{mode === 'reprogramar' ? 'Reprogramar' : mode === 'cancelar' ? 'Encerrar como cancelado' : 'Manter como histórico'}</Button>
          </section>
        )}

        <section><h3 className="at-h3">Histórico</h3>
          {!hist?.length ? <p className="xs muted" style={{ margin: 0 }}>Sem registros.</p> : (
            <ul className="at-hist">{hist.map((h) => <li key={h.id}><b>{h.actor_name || 'Sistema'}</b> · {fmtDateTime(h.created_at)}<span>{h.summary}</span></li>)}</ul>
          )}
        </section>
      </div>
    </Drawer>
  );
}
