// CENTRO DE PENDÊNCIAS — radar operacional: quantos problemas → quais urgentes → o que trava → quem age → próxima ação.
// Pendências são derivadas do estado real; agir aqui = agir na origem (tarefa, conteúdo, item de onboarding).
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi, useToast } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Loading, Empty, ErrorBox, Drawer, Button } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { fmtDateTime, ago, cleanName } from '../lib/format.js';
import { FUNCTIONS } from '../lib/status.js';
import '../styles/pend.css';
import { useDetailParam } from '../lib/nav.jsx';

const SEV = [['critica', 'Críticas'], ['alta', 'Altas'], ['media', 'Médias'], ['baixa', 'Baixas']];
const SEV1 = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const KEYS = ['sev', 'cause', 'client', 'who', 'process'];
const pad = (n) => String(n).padStart(2, '0');
const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export default function Pendencias() {
  useCrumbs('Centro de Pendências');
  const [params, setParams] = useSearchParams();
  // MINHAS (o que exige ação minha) × EQUIPE (operação inteira — só com permissão)
  const scope = params.get('escopo') === 'equipe' ? 'equipe' : 'minhas';
  const { data, error, loading, reload } = useApi(`/pendencias?escopo=${scope}`, [scope]);
  const f = Object.fromEntries(KEYS.map((k) => [k, params.get(k) || '']));
  const set = (k, v) => setParams((p) => { const n = new URLSearchParams(p); if (v && n.get(k) !== v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  const [open, openDetail, closeDetail] = useDetailParam('p'); // detalhe no histórico: voltar fecha e devolve a lista
  const items = data?.items || [];
  const shown = useMemo(() => items.filter((i) => (!f.sev || i.severity === f.sev) && (!f.cause || i.cause === f.cause) && (!f.client || i.client_id === f.client) && (!f.who || i.who === f.who) && (!f.process || i.process === f.process)),
    [items, f.sev, f.cause, f.client, f.who, f.process]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error?.status === 403) return <div className="page"><div className="pd-head"><h1 className="pd-h1">Centro de Pendências</h1></div><Empty title="Visão restrita.">{error.message} <a className="link" href="/pendencias">Ver as minhas</a></Empty></div>;
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  if (loading && !data) return <div className="page"><Loading rows={8} /></div>;
  const C = data.counts;
  const maxCause = Math.max(1, ...data.causes.map((c) => c.n));
  const active = KEYS.some((k) => f[k]);
  const whoCount = [...shown.reduce((m, i) => m.set(i.who, (m.get(i.who) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]);

  return (
    <div className="page pd">
      <header className="pd-head">
        <div>
          <h1 className="pd-h1">{scope === 'minhas' ? 'O que depende de você?' : 'O que está travando a operação?'}</h1>
          <p className="pd-sub">{scope === 'minhas' ? 'Só o que exige ação sua' : 'Pendências de toda a operação'} · derivadas do estado real · {pl(C.total, 'pendência', 'pendências')}</p>
        </div>
        <div className="pd-scope" role="tablist" aria-label="Escopo">
          <button role="tab" aria-selected={scope === 'minhas'} className={scope === 'minhas' ? 'on' : ''} onClick={() => setParams({}, { replace: true })}>Minhas <b>{data.tab_counts.minhas}</b></button>
          {data.can_team && <button role="tab" aria-selected={scope === 'equipe'} className={scope === 'equipe' ? 'on' : ''} onClick={() => setParams({ escopo: 'equipe' }, { replace: true })}>Equipe <b>{data.tab_counts.equipe}</b></button>}
        </div>
      </header>

      {!C.total ? (
        <div className="pd-clear"><span className="pd-big">00</span><p>{scope === 'minhas' ? 'Nada depende de você agora. Quando uma tarefa sua atrasar, um conteúdo seu travar ou um cliente seu esperar resposta, aparece aqui.' : 'Nada travando a operação agora. Tarefas atrasadas, bloqueios, onboarding parado e pagamentos vencidos aparecem aqui sozinhos.'}</p></div>
      ) : (
        <>
          {/* RADAR DE PRIORIDADE */}
          <section className="pd-radar" aria-label="Prioridade">
            {SEV.map(([k, label]) => (
              <button key={k} className={`pd-sev s-${k} ${f.sev === k ? 'on' : ''} ${!C[k] ? 'zero' : ''}`} onClick={() => set('sev', k)} aria-pressed={f.sev === k} disabled={!C[k]}>
                <span className="pd-big">{pad(C[k])}</span>
                <span className="pd-sev-l"><i aria-hidden />{label}</span>
                <span className="pd-sev-bar" aria-hidden><span style={{ width: `${C.total ? (C[k] / C.total) * 100 : 0}%` }} /></span>
              </button>
            ))}
          </section>

          {/* O QUE ESTÁ TRAVANDO */}
          <section className="pd-causes" aria-labelledby="pd-c-t">
            <h2 id="pd-c-t" className="pd-h2">O que está travando</h2>
            <div className="pd-cause-grid">
              {data.causes.map((c) => (
                <button key={c.key} className={`pd-cause ${f.cause === c.key ? 'on' : ''}`} onClick={() => set('cause', c.key)} aria-pressed={f.cause === c.key}>
                  <span className="pd-cause-n">{pad(c.n)}</span>
                  <span className="pd-cause-l">{c.label}</span>
                  <span className="pd-cause-bar" aria-hidden><span style={{ width: `${(c.n / maxCause) * 100}%` }} /></span>
                  {c.critical > 0 && <span className="pd-cause-c">{c.critical} crítica{c.critical > 1 ? 's' : ''}</span>}
                </button>
              ))}
            </div>
          </section>

          {/* FILTROS */}
          <div className="pd-filters" role="region" aria-label="Filtros">
            <div className="pd-tabs" role="group" aria-label="Prioridade">
              <button className={!f.sev ? 'on' : ''} onClick={() => set('sev', '')}>Todas · {C.total}</button>
              {SEV.filter(([k]) => C[k]).map(([k, l]) => <button key={k} className={f.sev === k ? 'on' : ''} onClick={() => set('sev', k)}>{l} · {C[k]}</button>)}
            </div>
            <div className="pd-selects">
              <Sel label="Cliente" value={f.client} onChange={(v) => set('client', v)} options={data.filters.clients.map((c) => [c.id, cleanName(c.name)])} />
              <Sel label="Quem age" value={f.who} onChange={(v) => set('who', v)} options={data.filters.who.map((w) => [w, w])} />
              <Sel label="Tipo" value={f.cause} onChange={(v) => set('cause', v)} options={data.causes.map((c) => [c.key, c.label])} />
              <Sel label="Processo" value={f.process} onChange={(v) => set('process', v)} options={data.filters.processes.map((p) => [p, p])} />
              {active && <button className="pd-clear-btn" onClick={() => setParams(scope === 'equipe' ? { escopo: 'equipe' } : {}, { replace: true })}>Limpar</button>}
            </div>
          </div>

          {/* LISTA + QUEM PRECISA AGIR */}
          <div className="pd-body">
            <section aria-label="Pendências">
              {!shown.length ? <Empty title="Nenhuma pendência com esses filtros." /> : (
                <ol className="pd-list">
                  {shown.map((p, i) => (
                    <li key={p.id}>
                      {(i === 0 || shown[i - 1].severity !== p.severity) && <div className={`pd-group s-${p.severity}`}>{SEV.find(([k]) => k === p.severity)[1]} · {shown.filter((x) => x.severity === p.severity).length}</div>}
                      <button className={`pd-item s-${p.severity}`} onClick={() => openDetail(p.id)} aria-label={`${SEV1[p.severity]}: ${p.problem || p.title}. Abrir detalhe`}>
                        <span className="pd-rail" aria-hidden />
                        <span className="pd-i-top">
                          <span className={`pd-badge s-${p.severity}`}><i aria-hidden />{SEV1[p.severity]}</span>
                          <span className="pd-client">{p.client ? cleanName(p.client) : 'The Bold'}</span>
                          <span className="pd-type">{p.cause_label}</span>
                        </span>
                        <span className="pd-problem">{p.problem || p.title}</span>
                        <span className="pd-facts">
                          {p.late && <span className="pd-late">há {p.late}</span>}
                          <span><b>Quem age</b> {p.who || '—'}</span>
                          {p.process && <span className="pd-proc">{p.process}</span>}
                        </span>
                        <span className="pd-ia"><span><b>Impacto</b> {p.impact}</span><span className="pd-next"><b>Próxima ação</b> {p.action || p.next}</span></span>
                        <span className="pd-open">Abrir <I.arrow size={13} /></span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <aside className="pd-who" aria-label="Quem precisa agir">
              <h2 className="pd-h2">Quem precisa agir</h2>
              <ul>{whoCount.map(([w, n]) => (
                <li key={w}><button className={f.who === w ? 'on' : ''} onClick={() => set('who', w)}><span>{w}</span><b>{n}</b></button></li>
              ))}</ul>
            </aside>
          </div>
        </>
      )}

      {open && <Detail id={open} onClose={closeDetail} onChanged={reload} />}
    </div>
  );
}

function Sel({ label, value, onChange, options }) {
  if (!options.length) return null;
  return (
    <select className="pd-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{label}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

const toLocal = (iso) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '');

function Detail({ id, onClose, onChanged }) {
  const toast = useToast();
  const { data, error, loading, reload } = useApi(`/pendencias/item?id=${encodeURIComponent(id)}`, [id], { live: false });
  const [note, setNote] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn, ok) => { setBusy(true); try { await fn(); toast(ok); reload(); onChanged(); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); } };
  if (error) return <Drawer open history={false} onClose={onClose} title="Pendência" kicker="Centro de Pendências"><ErrorBox error={error} /><p className="sm muted mt-4">Se ela foi resolvida, já saiu do radar.</p></Drawer>;
  const d = data;
  const p = d?.item;
  return (
    <Drawer open history={false} onClose={onClose} title={p ? (p.problem || p.title) : 'Pendência'} kicker={p ? `${SEV1[p.severity]} · ${p.cause_label}` : 'Centro de Pendências'} wide>
      {loading || !d ? <Loading rows={6} /> : (
        <div className="pd-detail">
          <dl className="pd-dl">
            <div><dt>Cliente</dt><dd>{p.client_id ? <Link className="link" to={`/clientes/${p.client_id}`}>{cleanName(p.client)}</Link> : 'The Bold'}</dd></div>
            <div><dt>Origem</dt><dd>{{ task: 'Tarefa', content: 'Bloqueio de conteúdo', onboarding_item: 'Item de onboarding', invoice: 'Fatura' }[p.source?.type] || '—'}</dd></div>
            <div><dt>Processo</dt><dd>{p.content_id ? <Link className="link" to={`/conteudos/${p.content_id}`}>{p.content}</Link> : p.process || '—'}{p.content_id && p.process ? ` · ${p.process}` : ''}</dd></div>
            <div><dt>Quem age</dt><dd>{p.who || '—'}</dd></div>
            <div><dt>Prazo</dt><dd>{p.due ? fmtDateTime(p.due) : 'sem prazo'}</dd></div>
            <div><dt>Pendente há</dt><dd className={p.late ? 'late' : ''}>{p.late || (p.since ? ago(p.since) : '—')}</dd></div>
          </dl>
          <div className="pd-ia-big">
            <div><span className="pd-k">Impacto</span><p>{p.impact}</p></div>
            <div><span className="pd-k">Próxima ação</span><p>{p.next}</p></div>
          </div>

          {/* AÇÕES — cada uma age na origem */}
          <section className="pd-actions">
            {d.can.resolve && <Button variant="primary" size="sm" disabled={busy} onClick={() => run(() => api.post('/pendencias/resolve', { id: p.id }), 'Resolvido na origem.')}>{d.can.resolve.label}</Button>}
            {d.can.resolve_note && <span className="xs muted">{d.can.resolve_note}</span>}
            {p.client_id && <Link className="btn btn-sm btn-ghost" to={`/clientes/${p.client_id}`}>Abrir cliente</Link>}
            {p.content_id && <Link className="btn btn-sm btn-ghost" to={`/conteudos/${p.content_id}`}>Abrir processo</Link>}
            {p.cause === 'financeiro' && <Link className="btn btn-sm btn-ghost" to="/financeiro">Abrir financeiro</Link>}
          </section>

          {d.task && (d.can.reassign || d.can.edit_task) && (
            <section className="pd-edit">
              <h3 className="pd-h3">Tarefa de origem</h3>
              <div className="pd-edit-row">
                {d.can.reassign && (
                  <label><span>Responsável</span>
                    <select className="pd-select" value={d.task.assignee_id || ''} disabled={busy} onChange={(e) => e.target.value && run(() => api.post(`/tasks/${d.task.id}/reassign`, { assignee_id: e.target.value }), 'Responsável alterado e notificado.')}>
                      <option value="">Sem responsável</option>
                      {d.people.map((u) => <option key={u.id} value={u.id}>{u.name}{u.functions && JSON.parse(u.functions).includes(d.task.function) ? ` · ${FUNCTIONS[d.task.function] || d.task.function}` : ''}</option>)}
                    </select>
                  </label>
                )}
                {d.can.edit_task && (
                  <label><span>Prazo</span>
                    <input type="datetime-local" className="input" defaultValue={toLocal(d.task.due_at)} disabled={busy} onBlur={(e) => e.target.value && new Date(e.target.value).toISOString() !== d.task.due_at && run(() => api.patch(`/tasks/${d.task.id}`, { due_at: new Date(e.target.value).toISOString() }), 'Prazo alterado.')} />
                  </label>
                )}
                {d.can.edit_task && (
                  <label><span>Prioridade</span>
                    <select className="pd-select" value={d.task.priority} disabled={busy} onChange={(e) => run(() => api.patch(`/tasks/${d.task.id}`, { priority: e.target.value }), 'Prioridade alterada.')}>
                      {['baixa', 'media', 'alta', 'critica'].map((x) => <option key={x} value={x}>{SEV1[x]}</option>)}
                    </select>
                  </label>
                )}
              </div>
            </section>
          )}

          <section>
            <h3 className="pd-h3">Comentários {p.content_id ? '(no conteúdo · internos)' : '(notas da pendência)'}</h3>
            <form className="pd-note" onSubmit={(e) => { e.preventDefault(); if (note.trim()) run(async () => { await api.post('/pendencias/comment', { id: p.id, body: note }); setNote(''); }, 'Comentário registrado.'); }}>
              <textarea className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Escreva um comentário para a equipe… use @nome para mencionar" aria-label="Comentário" />
              <Button size="sm" variant="ghost" disabled={busy || !note.trim()}>Comentar</Button>
            </form>
            <ul className="pd-feed">
              {[...d.comments.map((c) => ({ at: c.created_at, who: c.author, body: c.body })), ...d.notes.map((n) => ({ at: n.created_at, who: n.author, body: n.body }))].sort((a, b) => b.at.localeCompare(a.at)).map((c, i) => (
                <li key={i}><b>{c.who}</b><small>{ago(c.at)}</small><p>{c.body}</p></li>
              ))}
              {!d.comments.length && !d.notes.length && <li className="muted sm">Nenhum comentário ainda.</li>}
            </ul>
          </section>

          <section>
            <h3 className="pd-h3">Criar tarefa a partir desta pendência</h3>
            <form className="pd-note" onSubmit={(e) => { e.preventDefault(); if (taskTitle.trim()) run(async () => { await api.post('/tasks', { title: taskTitle, client_id: p.client_id, content_id: p.content_id, source_type: 'pendencia', source_id: p.id }); setTaskTitle(''); }, 'Tarefa criada.'); }}>
              <input className="input" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Próximo passo combinado" aria-label="Título da tarefa" />
              <Button size="sm" variant="ghost" disabled={busy || !taskTitle.trim()}>Criar</Button>
            </form>
          </section>

          {d.related.length > 0 && (
            <section>
              <h3 className="pd-h3">Atividades relacionadas</h3>
              <ul className="pd-feed">{d.related.map((t) => <li key={t.id}><b>{t.title}</b><small>{t.assignee || 'sem responsável'}{t.due_at ? ` · até ${fmtDateTime(t.due_at)}` : ''}</small></li>)}</ul>
            </section>
          )}

          <section>
            <h3 className="pd-h3">Histórico</h3>
            {!d.history.length ? <p className="sm muted">Sem registros.</p> : <ul className="pd-feed">{d.history.map((h, i) => <li key={i}><b>{h.actor || 'Sistema'}</b><small>{fmtDateTime(h.created_at)}</small><p>{h.summary}</p></li>)}</ul>}
          </section>
        </div>
      )}
    </Drawer>
  );
}
