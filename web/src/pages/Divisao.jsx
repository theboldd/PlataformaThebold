// DIVISÃO DE CLIENTES — quem cuida de cada cliente, no formato da DIVISÃO EQUIPE do Notion (pessoa · função · clientes).
// Toda a equipe vê; a alteração acontece na aba Equipe do cliente.
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { PageHead, Loading, ErrorBox, Empty, Seg, Avatar } from '../components/ui.jsx';
import { cleanName } from '../lib/format.js';
import { FUNCTIONS } from '../lib/status.js';
import '../styles/divisao.css';

const STATUS = { onboarding: 'Onboarding', a_confirmar: 'Status a confirmar', pausado: 'Pausado' };
const norm = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Divisao() {
  useCrumbs('Clientes', 'Divisão');
  const [params, setParams] = useSearchParams();
  const view = params.get('ver') || 'pessoa';
  const q = params.get('q') || '';
  const fn = params.get('funcao') || '';
  const sec = params.get('secao') || '';
  const gaps = params.get('faltando') === '1';
  const set = (k, v) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  const { data, error, loading } = useApi('/divisao');
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  if (loading || !data) return <div className="page"><Loading rows={8} /></div>;

  const fns = fn ? [fn] : data.functions;
  const clientOk = (c) => (!sec || c.section === sec) && (!q || norm(c.name).includes(norm(q)) || Object.values(c.team).flat().some((p) => norm(p.name).includes(norm(q))));
  const clients = data.clients.filter((c) => clientOk(c) && (!fn || c.team[fn] || (gaps && c.missing.includes(fn))) && (!gaps || c.missing.length));
  const people = data.people.map((p) => ({
    ...p,
    rows: Object.entries(p.functions).filter(([f]) => !fn || f === fn)
      .map(([f, list]) => [f, list.filter((c) => (!sec || c.section === sec) && (!q || norm(c.name).includes(norm(q)) || norm(p.name).includes(norm(q))))])
      .filter(([, list]) => list.length),
  })).filter((p) => p.rows.length);
  const noOwner = data.clients.filter((c) => c.missing.length);
  const ClientName = ({ c }) => (c.can_open ? <Link to={`/clientes/${c.id}?tab=equipe`} className="link">{cleanName(c.name)}</Link> : <span>{cleanName(c.name)}</span>);

  return (
    <div className="page dv">
      <PageHead kicker="Clientes · equipe" title="Divisão" sub="Quem cuida de cada cliente — o mesmo quadro da DIVISÃO EQUIPE do Notion, agora ligado às fichas. Para mudar, abra o cliente e use a aba Equipe." />

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
          {data.functions.map((f) => <option key={f} value={f}>{FUNCTIONS[f] || f}</option>)}
        </select>
        <select className="select dv-sel" value={sec} onChange={(e) => set('secao', e.target.value)} aria-label="Carteira">
          <option value="">MKT e ADVS</option><option value="MKT">Clientes MKT</option><option value="ADVS">Clientes ADVS</option>
        </select>
      </div>

      {view === 'pessoa' ? (
        !people.length ? <Empty title="Ninguém com clientes neste filtro." /> : (
          <div className="dv-table" role="table">
            <div className="dv-tr dv-th" role="row"><span>Equipe</span><span>Função</span><span>Clientes</span></div>
            {people.flatMap((p) => p.rows.map(([f, list], i) => (
              <div className="dv-tr" role="row" key={`${p.id}-${f}`}>
                <span className="dv-who">{i === 0 && <><Avatar name={p.name} size="sm" /><span><b>{p.name}</b><small>{p.clients} {p.clients === 1 ? 'cliente' : 'clientes'}</small></span></>}</span>
                <span><span className={`dv-fn f-${f}`}>{FUNCTIONS[f] || f}</span> <small className="muted">{list.length}</small></span>
                <span className="dv-chips">{list.map((c) => (
                  <span key={c.id} className="dv-chip">
                    <ClientName c={data.clients.find((x) => x.id === c.id) || c} />
                    {c.section && <i>{c.section}</i>}
                    {c.status !== 'a_confirmar' && STATUS[c.status] && <em>{STATUS[c.status]}</em>}
                  </span>
                ))}</span>
              </div>
            )))}
          </div>
        )
      ) : (
        !clients.length ? <Empty title="Nenhum cliente neste filtro." /> : (
          <div className="dv-scroll">
            <table className="dv-grid">
              <thead><tr><th>Cliente</th>{fns.map((f) => <th key={f}>{FUNCTIONS[f] || f}</th>)}</tr></thead>
              <tbody>{clients.map((c) => (
                <tr key={c.id}>
                  <th scope="row"><ClientName c={c} />{c.section && <i className="dv-sec">{c.section}</i>}{STATUS[c.status] && <em className="dv-st">{STATUS[c.status]}</em>}{c.review && <em className="dv-st warn">equipe a revisar</em>}</th>
                  {fns.map((f) => (
                    <td key={f}>{c.team[f]?.map((p) => <div key={p.id}>{p.name}</div>) || (c.missing.includes(f) ? <span className="dv-none">sem responsável</span> : <span className="faint">—</span>)}</td>
                  ))}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
