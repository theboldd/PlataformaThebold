// REVISÃO DE ATRASOS — cada item atrasado herdado com os FATOS levantados (sempre com a fonte) e a classificação feita por pessoa.
// Atraso não é atraso da responsável: sem evidência, fica SEM CONTEXTO / NÃO ATRIBUÍDO e não alimenta nenhum indicador de desempenho.
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi, useToast } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Loading, ErrorBox, Empty, Drawer, Button, Field, Modal } from '../components/ui.jsx';
import { cleanName, fmtDateTime } from '../lib/format.js';
import '../styles/atrasos.css';

const pad = (n) => String(n ?? 0).padStart(2, '0');

export default function Atrasos() {
  useCrumbs('Operação', 'Revisão de atrasos');
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const set = (k, v) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  const cat = params.get('categoria') || '';
  const client = params.get('cliente') || '';
  const only = params.get('situacao') || 'pendentes';
  const open = params.get('item');
  const { data, error, loading, reload } = useApi('/atrasos');
  const [sel, setSel] = useState(new Set());
  const [bulk, setBulk] = useState(false);
  const items = data?.items || [];
  const shown = useMemo(() => items.filter((i) => (!cat || i.category === cat) && (!client || i.client_id === client)
    && (only === 'todos' || (only === 'pendentes' ? !i.decided_by : !!i.decided_by))), [items, cat, client, only]);
  const clients = useMemo(() => [...new Map(items.map((i) => [i.client_id, i.client])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]))), [items]);
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  if (loading || !data) return <div className="page"><Loading rows={8} /></div>;
  const c = data.counts;
  const item = open ? items.find((i) => i.task_id === open) : null;
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = shown.length > 0 && shown.every((i) => sel.has(i.task_id));

  return (
    <div className="page at">
      <header className="at-head">
        <h1 className="at-h1">Revisão de atrasos</h1>
        <p className="at-sub">Itens atrasados herdados da migração. Atraso não é, por si só, atraso de quem está com o item: abaixo estão só os fatos registrados, cada um com a fonte.
          Enquanto não forem classificados por uma pessoa, <b>não entram em nenhum indicador de desempenho</b>.</p>
      </header>

      <div className="at-kpis">
        <button className={`at-k ${only === 'pendentes' ? 'on' : ''}`} onClick={() => set('situacao', 'pendentes')}><b>{pad(c.pendentes)}</b><span>Aguardando classificação</span></button>
        <button className={`at-k ${only === 'classificados' ? 'on' : ''}`} onClick={() => set('situacao', 'classificados')}><b>{pad(c.total - c.pendentes)}</b><span>Classificados</span></button>
        <button className={`at-k ${only === 'todos' ? 'on' : ''}`} onClick={() => set('situacao', 'todos')}><b>{pad(c.total)}</b><span>Total</span></button>
        <div className="at-k info"><b>{pad((c.by_attribution.responsavel || 0))}</b><span>Atribuídos a uma pessoa</span></div>
      </div>

      <div className="at-filters">
        <label>Categoria
          <select className="select" value={cat} onChange={(e) => set('categoria', e.target.value)}>
            <option value="">Todas</option>
            {data.categories.map((k) => <option key={k.key} value={k.key}>{k.label}{c.by_category[k.key] ? ` (${c.by_category[k.key]})` : ''}</option>)}
          </select>
        </label>
        <label>Cliente
          <select className="select" value={client} onChange={(e) => set('cliente', e.target.value)}>
            <option value="">Todos</option>
            {clients.map(([id, name]) => <option key={id} value={id}>{cleanName(name || '—')}</option>)}
          </select>
        </label>
        {data.can_edit && sel.size > 0 && <Button variant="primary" size="sm" onClick={() => setBulk(true)}>Classificar {sel.size} selecionado{sel.size > 1 ? 's' : ''}</Button>}
      </div>

      {!shown.length ? <Empty title="Nenhum item neste filtro." /> : (
        <div className="at-table" role="table" aria-label="Itens em revisão">
          <div className="at-tr at-th" role="row">
            <span role="columnheader">{data.can_edit && <input type="checkbox" aria-label="Selecionar todos" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(shown.map((i) => i.task_id)))} />}</span>
            <span role="columnheader">Cliente · conteúdo</span><span role="columnheader">Etapa</span><span role="columnheader">Com</span><span role="columnheader">Prazo (origem)</span><span role="columnheader">Classificação</span>
          </div>
          {shown.map((i) => (
            <div key={i.task_id} className={`at-tr ${i.decided_by ? 'done' : ''}`} role="row">
              <span role="cell">{data.can_edit && <input type="checkbox" aria-label={`Selecionar #${i.number}`} checked={sel.has(i.task_id)} onChange={() => toggle(i.task_id)} />}</span>
              <button className="at-main" role="cell" onClick={() => set('item', i.task_id)}>
                <small>{cleanName(i.client || '—')}</small><b>#{i.number} {i.content_title}</b>
              </button>
              <span role="cell" data-l="Etapa">{i.facts.find((f) => f.k === 'etapa')?.value}</span>
              <span role="cell" data-l="Com">{i.assignee || 'Sem responsável'}</span>
              <span role="cell" data-l="Prazo">{fmtDateTime(i.due_at)}<small>{i.perf_status === 'migrado' ? 'calculado na migração' : ''}</small></span>
              <span role="cell" data-l="Classificação"><span className={`at-cat c-${i.category}`}>{i.category_label}</span><small>{i.attribution_label}{i.decided_by ? ` · ${i.decided_by_name}` : ' · só regra (fatos)'}</small></span>
            </div>
          ))}
        </div>
      )}

      <ItemDrawer item={item} meta={data} onClose={() => set('item', '')} onDone={() => { reload(); toast('Registrado no histórico.'); }} />
      <BulkModal open={bulk} ids={[...sel]} meta={data} onClose={() => setBulk(false)} onDone={(n) => { setBulk(false); setSel(new Set()); reload(); toast(`${n} itens classificados.`); }} />
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
  const [cat, setCat] = useState('');
  const [note, setNote] = useState('');
  const [due, setDue] = useState('');
  const [mode, setMode] = useState('classificar');
  const [busy, setBusy] = useState(false);
  const { data: hist, reload } = useApi(item ? `/atrasos/${item.task_id}/historico` : null, [item?.task_id, item?.updated_at]);
  if (!item) return null;
  const chosen = meta.categories.find((k) => k.key === (cat || item.category));
  const go = async (fn) => {
    setBusy(true);
    try { await fn(); setNote(''); setDue(''); reload(); onDone(); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const live = !['concluida', 'cancelada'].includes(item.task_status);
  return (
    <Drawer open onClose={onClose} title={`#${item.number} ${item.content_title}`} kicker={`${cleanName(item.client || '')} · ${item.category_label} · ${item.attribution_label}`} wide>
      <div className="col gap-5">
        {item.content_id && <Link className="btn btn-sm btn-ghost" to={`/conteudos/${item.content_id}`} style={{ alignSelf: 'flex-start' }}>Abrir conteúdo</Link>}
        <section><h3 className="at-h3">Fatos registrados na plataforma</h3><Facts list={item.facts} /></section>
        {item.source_facts.length > 0 && <section><h3 className="at-h3">Fatos da fonte original (Notion)</h3><Facts list={item.source_facts} /></section>}
        {item.decided_by && <section><h3 className="at-h3">Classificação atual</h3><p className="sm" style={{ margin: 0 }}><b>{item.category_label}</b> · {item.attribution_label} — por {item.decided_by_name} em {fmtDateTime(item.decided_at)}</p><p className="sm muted" style={{ margin: '4px 0 0' }}>{item.note}</p></section>}

        {meta.can_edit && (
          <section className="at-act">
            <div className="seg" role="group" aria-label="Ação">
              {[['classificar', 'Classificar'], ...(live ? [['reprogramar', 'Reprogramar']] : []), ...(live && meta.can_cancel ? [['cancelar', 'Cancelar conteúdo']] : [])].map(([k, l]) => <button key={k} className={mode === k ? 'active' : ''} aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>)}
            </div>
            {mode === 'classificar' && (
              <Field label="Categoria" hint={chosen ? `Atribuição resultante: ${meta.attributions[chosen.attribution]}${chosen.attribution === 'responsavel' ? ' — entra em indicador individual; descreva a evidência.' : chosen.attribution === 'equipe' ? ' — entra só no agregado da equipe.' : ' — não entra em indicador de desempenho.'}` : null}>
                <select className="select" value={cat || item.category} onChange={(e) => setCat(e.target.value)}>
                  {meta.categories.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                </select>
              </Field>
            )}
            {mode === 'reprogramar' && <Field label="Novo prazo da tarefa"><input className="input" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>}
            {mode === 'cancelar' && <p className="xs muted" style={{ margin: 0 }}>Cancela o conteúdo inteiro (fica no histórico; nada é apagado).</p>}
            <Field label={mode === 'classificar' ? 'Evidência / motivo (obrigatório)' : 'Motivo (obrigatório)'}>
              <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === 'classificar' ? 'O que comprova a classificação (ex.: confirmei no Instagram que foi publicado em 05/10)' : 'Por que'} />
            </Field>
            <Button variant="primary" disabled={busy || !note.trim() || (mode === 'reprogramar' && !due)} onClick={() => go(() => (
              mode === 'classificar' ? api.put(`/atrasos/${item.task_id}`, { category: cat || item.category, note })
                : mode === 'reprogramar' ? api.post(`/atrasos/${item.task_id}/reprogramar`, { due_at: new Date(due).toISOString(), note })
                  : api.post(`/atrasos/${item.task_id}/cancelar`, { note })))}>
              {mode === 'classificar' ? 'Salvar classificação' : mode === 'reprogramar' ? 'Reprogramar' : 'Cancelar conteúdo'}
            </Button>
          </section>
        )}

        <section><h3 className="at-h3">Histórico</h3>
          {!hist?.length ? <p className="xs muted" style={{ margin: 0 }}>Nenhuma classificação feita por pessoa ainda.</p> : (
            <ul className="at-hist">{hist.map((h) => <li key={h.id}><b>{h.actor_name || 'Sistema'}</b> · {fmtDateTime(h.created_at)}<span>{h.summary}</span></li>)}</ul>
          )}
        </section>
      </div>
    </Drawer>
  );
}

function BulkModal({ open, ids, meta, onClose, onDone }) {
  const toast = useToast();
  const [cat, setCat] = useState('dado_migrado');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const chosen = meta.categories.find((k) => k.key === cat);
  const go = async () => {
    setBusy(true);
    try { const r = await api.post('/atrasos/lote', { task_ids: ids, category: cat, note }); setNote(''); onDone(r.ok); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Classificar ${ids.length} itens`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={busy || !note.trim()} onClick={go}>Classificar</Button></>}>
      <div className="col gap-4">
        <Field label="Categoria" hint={chosen ? `Atribuição: ${meta.attributions[chosen.attribution]}` : null}>
          <select className="select" value={cat} onChange={(e) => setCat(e.target.value)}>{meta.categories.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select>
        </Field>
        <Field label="Evidência / motivo (obrigatório — vale para todos os selecionados)"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <p className="xs muted" style={{ margin: 0 }}>Cada item recebe o próprio registro no histórico, com o valor anterior.</p>
      </div>
    </Modal>
  );
}
