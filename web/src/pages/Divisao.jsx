// DIVISÃO DE CLIENTES — quem cuida de cada cliente, no formato da DIVISÃO EQUIPE do Notion (pessoa · função · clientes).
// Toda a equipe vê. Vincular/desvincular clientes: só a CEO ou quem ela liberar (permissão "Divisão de clientes").
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi, useToast } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { PageHead, Loading, ErrorBox, Empty, Seg, Avatar, Modal, Button, Field } from '../components/ui.jsx';
import { cleanName } from '../lib/format.js';
import { FUNCTIONS } from '../lib/status.js';
import '../styles/divisao.css';

const STATUS = { onboarding: 'Onboarding', a_confirmar: 'Status a confirmar', pausado: 'Pausado' };
const norm = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const FN_SHORT = { estrategia: 'Estratégia', copy: 'Copy / Legenda', design: 'Design', edicao: 'Edição de vídeo', revisao: 'Revisão', agendamento: 'Agendamento', atendimento: 'Atendimento' };
const Fn = ({ f, n }) => <span className={`dv-fn f-${f}`}>{FN_SHORT[f] || FUNCTIONS[f] || f}{n != null && <b>{n}</b>}</span>;

export default function Divisao() {
  useCrumbs('Clientes', 'Divisão');
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const view = params.get('ver') || 'pessoa';
  const q = params.get('q') || '';
  const fn = params.get('funcao') || '';
  const sec = params.get('secao') || '';
  const gaps = params.get('faltando') === '1';
  const set = (k, v) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  const { data, error, loading, reload } = useApi('/divisao');
  const [linking, setLinking] = useState(null); // { user_id?, function?, client_id? } — formulário de vínculo
  const [busy, setBusy] = useState(false);
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  if (loading || !data) return <div className="page"><Loading rows={8} /></div>;

  const edit = data.can_edit;
  const link = async (b) => {
    setBusy(true);
    try { const r = await api.post('/divisao/vinculo', b); toast(r.tasks ? `Vinculado — ${r.tasks} tarefa(s) sem dono foram para essa pessoa.` : 'Vinculado.'); setLinking(null); reload(); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const unlink = async (b, who, client) => {
    if (!window.confirm(`Desvincular ${who} de ${cleanName(client)} (${FN_SHORT[b.function]})? As tarefas abertas dessa pessoa nesse cliente passam para outra pessoa da função — ou ficam sem responsável.`)) return;
    setBusy(true);
    try { const r = await api.post('/divisao/desvinculo', b); toast(r.moved ? `Desvinculado — ${r.moved} tarefa(s) repassada(s)${r.orphan ? `, ${r.orphan} sem responsável` : ''}.` : 'Desvinculado.'); reload(); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  const fns = fn ? [fn] : data.functions;
  const clientOk = (c) => (!sec || c.section === sec) && (!q || norm(c.name).includes(norm(q)) || Object.values(c.team).flat().some((p) => norm(p.name).includes(norm(q))));
  const clients = data.clients.filter((c) => clientOk(c) && (!fn || c.team[fn] || (gaps && c.missing.includes(fn))) && (!gaps || c.missing.length));
  const people = data.people.map((p) => ({
    ...p,
    rows: Object.entries(p.functions).filter(([f]) => !fn || f === fn)
      .sort(([a], [b]) => data.functions.indexOf(a) - data.functions.indexOf(b))
      .map(([f, list]) => [f, list.filter((c) => (!sec || c.section === sec) && (!q || norm(c.name).includes(norm(q)) || norm(p.name).includes(norm(q))))])
      .filter(([, list]) => list.length),
  })).filter((p) => p.rows.length);
  const noOwner = data.clients.filter((c) => c.missing.length);
  const ClientName = ({ c }) => (c.can_open ? <Link to={`/clientes/${c.id}?tab=equipe`} className="link">{cleanName(c.name)}</Link> : <span>{cleanName(c.name)}</span>);
  const X = ({ onClick, label }) => (edit ? <button type="button" className="dv-x" onClick={onClick} disabled={busy} aria-label={label} title={label}>×</button> : null);

  return (
    <div className="page dv">
      <PageHead kicker="Clientes · equipe" title="Divisão" sub={edit
        ? 'Quem cuida de cada cliente — o quadro da DIVISÃO EQUIPE do Notion. Você pode vincular e desvincular clientes aqui; as tarefas seguem a mudança.'
        : 'Quem cuida de cada cliente — o quadro da DIVISÃO EQUIPE do Notion. Mudanças na divisão são feitas pela Rebeca ou por quem ela liberar.'}>
        {edit && <Button variant="primary" onClick={() => setLinking({})}>Vincular cliente</Button>}
      </PageHead>

      <div className="dv-sum">
        <span><b>{data.clients.length}</b> clientes</span>
        <span><b>{data.people.length}</b> pessoas com clientes</span>
        <button className={`dv-warn ${gaps ? 'on' : ''}`} disabled={!noOwner.length} onClick={() => setParams((p) => { const n = new URLSearchParams(p); if (gaps) n.delete('faltando'); else { n.set('faltando', '1'); n.set('ver', 'cliente'); } return n; }, { replace: true })}>
          <b>{noOwner.length}</b> sem estrategista, designer ou editor
        </button>
      </div>

      <div className="dv-bar">
        <Seg label="Ver por" value={view} onChange={(v) => set('ver', v === 'pessoa' ? '' : v)} options={[{ value: 'pessoa', label: 'Por pessoa' }, { value: 'cliente', label: 'Por cliente' }]} />
        <input className="input dv-q" placeholder="Buscar cliente ou pessoa" value={q} onChange={(e) => set('q', e.target.value)} aria-label="Buscar" />
        <select className="select dv-sel" value={fn} onChange={(e) => set('funcao', e.target.value)} aria-label="Função">
          <option value="">Todas as funções</option>
          {data.functions.map((f) => <option key={f} value={f}>{FN_SHORT[f] || f}</option>)}
        </select>
        <select className="select dv-sel" value={sec} onChange={(e) => set('secao', e.target.value)} aria-label="Carteira">
          <option value="">MKT e ADVS</option><option value="MKT">Clientes MKT</option><option value="ADVS">Clientes ADVS</option>
        </select>
      </div>

      {view === 'pessoa' ? (
        !people.length ? <Empty title="Ninguém com clientes neste filtro." /> : (
          <div className="dv-people">
            {people.map((p) => (
              <section key={p.id} className="dv-person" aria-label={p.name}>
                <header className="dv-person-head">
                  <Avatar name={p.name} />
                  <div><b>{p.name}</b><small>{p.clients} {p.clients === 1 ? 'cliente' : 'clientes'}</small></div>
                </header>
                {p.rows.map(([f, list]) => (
                  <div key={f} className="dv-fnrow">
                    <Fn f={f} n={list.length} />
                    <div className="dv-chips">
                      {list.map((c) => (
                        <span key={c.id} className="dv-chip">
                          <ClientName c={data.clients.find((x) => x.id === c.id) || c} />
                          {c.section && <i>{c.section}</i>}
                          {c.status !== 'a_confirmar' && STATUS[c.status] && <em>{STATUS[c.status]}</em>}
                          <X onClick={() => unlink({ client_id: c.id, user_id: p.id, function: f }, p.name, c.name)} label={`Desvincular ${cleanName(c.name)}`} />
                        </span>
                      ))}
                      {edit && <button type="button" className="dv-add" onClick={() => setLinking({ user_id: p.id, function: f })}>+ cliente</button>}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )
      ) : (
        !clients.length ? <Empty title="Nenhum cliente neste filtro." /> : (
          <div className="dv-scroll">
            <table className="dv-grid">
              <thead><tr><th>Cliente</th>{fns.map((f) => <th key={f}><Fn f={f} /></th>)}</tr></thead>
              <tbody>{clients.map((c) => (
                <tr key={c.id}>
                  <th scope="row"><ClientName c={c} />{c.section && <i className="dv-sec">{c.section}</i>}{STATUS[c.status] && <em className="dv-st">{STATUS[c.status]}</em>}{c.review && <em className="dv-st warn">equipe a revisar</em>}</th>
                  {fns.map((f) => (
                    <td key={f}>
                      {c.team[f]?.map((p) => <div key={p.id} className="dv-cellp">{p.name}<X onClick={() => unlink({ client_id: c.id, user_id: p.id, function: f }, p.name, c.name)} label={`Desvincular ${p.name}`} /></div>)
                        || (c.missing.includes(f) ? <span className="dv-none">sem responsável</span> : <span className="faint">—</span>)}
                      {edit && <button type="button" className="dv-add sm" onClick={() => setLinking({ client_id: c.id, function: f })} aria-label={`Vincular pessoa em ${FN_SHORT[f]} para ${cleanName(c.name)}`}>+</button>}
                    </td>
                  ))}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )
      )}

      {edit && <LinkModal open={!!linking} init={linking || {}} data={data} busy={busy} onClose={() => setLinking(null)} onSave={link} />}
    </div>
  );
}

function LinkModal({ open, init, data, busy, onClose, onSave }) {
  const [f, setF] = useState(init);
  const key = JSON.stringify(init);
  const [k, setK] = useState(key);
  if (k !== key) { setK(key); setF(init); }
  const taken = (cid, uid, fn) => data.clients.find((c) => c.id === cid)?.team[fn]?.some((p) => p.id === uid);
  const ok = f.client_id && f.user_id && f.function && !taken(f.client_id, f.user_id, f.function);
  const people = [...data.team].sort((a, b) => Number(b.functions.includes(f.function)) - Number(a.functions.includes(f.function)) || a.name.localeCompare(b.name));
  return (
    <Modal open={open} onClose={onClose} title="Vincular cliente" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={busy || !ok} onClick={() => onSave(f)}>Vincular</Button></>}>
      <div className="col gap-4">
        <Field label="Pessoa"><select className="select" value={f.user_id || ''} onChange={(e) => setF({ ...f, user_id: e.target.value })}><option value="">Escolha</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}{f.function && !p.functions.includes(f.function) ? ' (fora da função habitual)' : ''}</option>)}</select></Field>
        <Field label="Função"><select className="select" value={f.function || ''} onChange={(e) => setF({ ...f, function: e.target.value })}><option value="">Escolha</option>{Object.entries(FN_SHORT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Cliente" hint={f.client_id && f.user_id && f.function && taken(f.client_id, f.user_id, f.function) ? 'Essa pessoa já está nesse cliente com essa função.' : 'Tarefas dessa função que estão sem dono no cliente passam para a pessoa.'}>
          <select className="select" value={f.client_id || ''} onChange={(e) => setF({ ...f, client_id: e.target.value })}><option value="">Escolha</option>{data.clients.map((c) => <option key={c.id} value={c.id}>{cleanName(c.name)}</option>)}</select>
        </Field>
      </div>
    </Modal>
  );
}
