import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { PageHead, Loading, Empty } from '../components/ui.jsx';
import { fmtDateTime, ago, cleanName } from '../lib/format.js';
import { SEVERITY } from '../lib/status.js';
import { n2 } from './intel/parts.jsx';
import '../styles/intel.css';

export default function Pendencias() {
  useCrumbs('Centro de Pendências');
  const { data, error, loading } = useApi('/pendencias');
  const [params] = useSearchParams();
  const [sev, setSev] = useState(params.get('sev'));
  const [client, setClient] = useState('');
  const [proc, setProc] = useState('');
  const items = data?.items || [];
  const clients = useMemo(() => [...new Map(items.filter((i) => i.client_id).map((i) => [i.client_id, i.client])).entries()], [items]);
  const procs = useMemo(() => [...new Set(items.map((i) => i.process).filter(Boolean))], [items]);
  if (error?.status === 403) return <div className="page"><PageHead kicker="Acesso restrito" title="Centro de Pendências" /><Empty title="Área exclusiva.">{error.message}</Empty></div>;
  if (loading && !data) return <div className="page"><Loading rows={8} /></div>;
  const shown = items.filter((i) => (!sev || i.severity === sev) && (!client || i.client_id === client) && (!proc || i.process === proc));
  const C = data.counts;
  return (
    <div className="page">
      <PageHead kicker="Exclusivo · Rebeca e Vitória" title="O que está travando a operação?" sub="Derivado em tempo real do estado da plataforma — não depende de ninguém atualizar." />
      <div className="sev-counts">
        {[['critica', 'c', 'Críticas'], ['alta', 'a', 'Altas'], ['media', 'm', 'Médias'], ['baixa', 'b', 'Baixas']].map(([k, cls, l]) => (
          <button key={k} className={`sev-count ${cls} ${sev === k ? 'on' : ''}`} onClick={() => setSev(sev === k ? null : k)} aria-pressed={sev === k} data-cursor="FILTRAR">
            <span className="big num">{n2(C[k])}</span><span className="caps" style={{ color: 'var(--ink-2)' }}>{l}</span>
          </button>
        ))}
      </div>
      <div className="row wrap mt-6 mb-4">
        <select className="select" style={{ maxWidth: 260 }} value={client} onChange={(e) => setClient(e.target.value)} aria-label="Cliente"><option value="">Todos os clientes</option>{clients.map(([id, n]) => <option key={id} value={id}>{cleanName(n)}</option>)}</select>
        <select className="select" style={{ maxWidth: 240 }} value={proc} onChange={(e) => setProc(e.target.value)} aria-label="Processo"><option value="">Todos os processos</option>{procs.map((p) => <option key={p}>{p}</option>)}</select>
        <span className="sm muted">{shown.length} pendência(s)</span>
      </div>
      {!shown.length ? <Empty title="Nada travando aqui.">Ajuste os filtros para ver outras pendências.</Empty> : shown.map((p) => (
        <article className="pend" key={p.id}>
          <div>
            <div className="row between"><span className="client">{p.client ? cleanName(p.client) : 'Agência'}</span><span className={`sev sev-${p.severity}`}>● {SEVERITY[p.severity]}</span></div>
            <h3 className="title">{p.link ? <Link to={p.link} data-cursor="ABRIR">{p.title}</Link> : p.title}</h3>
            <div className="sm muted">{[p.content, p.process].filter(Boolean).join(' · ')}</div>
          </div>
          <dl>
            <dt>Quem age</dt><dd className="strong">{p.who || '—'}</dd>
            <dt>Desde</dt><dd>{ago(p.since)}</dd>
            <dt>Prazo</dt><dd style={p.late ? { color: 'var(--err)' } : null}>{p.due ? fmtDateTime(p.due) : '—'}{p.late ? ` · atraso ${p.late}` : ''}</dd>
          </dl>
          <div className="next">
            <div className="caps">Impacto</div><div className="sm mb-2">{p.impact}</div>
            <div className="caps bordo">Próxima ação</div><div className="sm">{p.next}</div>
          </div>
        </article>
      ))}
    </div>
  );
}
