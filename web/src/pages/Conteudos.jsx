import { useSearchParams, Link } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Empty, ErrorBox, Format, Loading, PageHead, Risk } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { fmtDate, fmtMonth, cleanName } from '../lib/format.js';
import { FORMATS } from '../lib/status.js';
import '../styles/production.css';

const STAGES = [['cronograma', 'Cronograma'], ['analise_cronograma', 'Análise do cronograma'], ['ajuste_cronograma', 'Ajuste do cronograma'], ['aprovacao_tema', 'Aprovação do tema'], ['producao', 'Produção'], ['analise_producao', 'Revisão interna'], ['ajuste_interno', 'Ajuste interno'], ['aprovacao_cliente', 'Aguardando cliente'], ['ajuste_cliente', 'Ajuste do cliente'], ['revisao_ajuste', 'Revisão do ajuste'], ['agendamento', 'Para agendamento'], ['agendado', 'Agendado'], ['publicado', 'Publicado']];

export default function Conteudos() {
  useCrumbs('Conteúdos');
  const [params, setParams] = useSearchParams();
  const qs = new URLSearchParams();
  ['client_id', 'stage', 'format', 'month'].forEach((k) => params.get(k) && qs.set(k, params.get(k)));
  const { data, error, loading } = useApi(`/contents?${qs}`);
  const clients = useApi('/clients', [], { live: false }).data;
  const set = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); setParams(p, { replace: true }); };
  const months = [...new Set((data || []).map((c) => c.planned_at?.slice(0, 7)).filter(Boolean))].sort();
  const now = new Date();
  const monthOpts = [...new Set([...months, ...[-1, 0, 1, 2].map((d) => new Date(now.getFullYear(), now.getMonth() + d, 15).toISOString().slice(0, 7))])].sort();

  return (
    <div className="page">
      <PageHead kicker="Produção" title="Conteúdos" sub="Tudo o que está sendo criado, com etapa, versão e responsável.">
        <Link to="/conteudos/novo" className="btn btn-primary" data-cursor="CRIAR"><I.plus size={14} /> Novo conteúdo</Link>
      </PageHead>
      <div className="filters">
        <select className="select" value={params.get('client_id') || ''} onChange={(e) => set('client_id', e.target.value)} aria-label="Cliente">
          <option value="">Todos os clientes</option>{(clients || []).map((c) => <option key={c.id} value={c.id}>{cleanName(c.name)}</option>)}
        </select>
        <select className="select" value={params.get('stage') || ''} onChange={(e) => set('stage', e.target.value)} aria-label="Etapa">
          <option value="">Todas as etapas</option>{STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="select" value={params.get('format') || ''} onChange={(e) => set('format', e.target.value)} aria-label="Formato">
          <option value="">Todos os formatos</option>{Object.entries(FORMATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="select" value={params.get('month') || ''} onChange={(e) => set('month', e.target.value)} aria-label="Mês de publicação">
          <option value="">Todos os meses</option>{monthOpts.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
        </select>
        {data && <span className="sm muted clear">{data.length} conteúdo(s)</span>}
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading rows={8} /> : !data?.length ? <Empty title="Nenhum conteúdo encontrado.">Ajuste os filtros ou crie um novo conteúdo.</Empty> : (
        <div className="clist">
          <div className="row-item hide-m" style={{ borderBottom: '1px solid var(--ink)', padding: '8px 0', background: 'none' }}>
            <span /><span className="caps">Conteúdo</span><span className="caps hide-m">Etapa</span><span className="caps hide-m">Responsável</span><span className="caps hide-m">Publicação</span><span className="caps hide-m">Versão</span>
          </div>
          {[...data].sort((a, b) => (a.stage === 'publicado') - (b.stage === 'publicado')).map((c) => (
            <Link to={`/conteudos/${c.id}`} key={c.id} className="row-item" data-cursor="ABRIR">
              {c.thumb ? <img className="thumb" src={c.thumb} alt="" loading="lazy" /> : <span className="thumb ph">{FORMATS[c.format]?.slice(0, 3)}</span>}
              <span className="col gap-1" style={{ minWidth: 0 }}>
                <span className="caps clip">{cleanName(c.client)}</span>
                <span className="ed" style={{ fontSize: 20, lineHeight: 1.1 }}>#{c.number} {c.title}</span>
                <span className="row gap-2 wrap"><Format f={c.format} />{c.blocked && <span className="tag tag-err">■ bloqueado</span>}<Risk level={c.risk} /></span>
              </span>
              <span className="sm hide-m">{c.stage_label}<div className="xs faint">{c.hours_in_stage < 24 ? `${c.hours_in_stage}h` : `${Math.floor(c.hours_in_stage / 24)}d`} na etapa</div></span>
              <span className="sm hide-m" style={c.owner === 'SEM RESPONSÁVEL' ? { color: 'var(--err)', fontWeight: 600 } : null}>{c.owner || '—'}{c.due_at && <div className="xs faint">prazo {fmtDate(c.due_at)}</div>}</span>
              <span className="sm hide-m">{fmtDate(c.planned_at)}</span>
              <span className="sm">{c.version ? `V${c.version}` : '—'}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
