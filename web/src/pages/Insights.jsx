import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi, useAuth, useToast } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { useCrumbs } from '../components/Shell.jsx';
import { PageHead, Loading, Empty, Tabs, Button, ErrorBox, Tag } from '../components/ui.jsx';
import { ago } from '../lib/format.js';
import '../styles/intel.css';
import { useUrlState } from '../lib/nav.jsx';

const DET = { retrabalho: 'Retrabalho', gargalo: 'Gargalo', tempo_aprovacao: 'Tempo de aprovação', carga: 'Excesso de carga', material: 'Material ausente', dependencia: 'Dependência manual', sem_responsavel: 'Sem responsável' };
const SEV = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

export default function Insights() {
  useCrumbs('Insights');
  const auth = useAuth();
  const toast = useToast();
  const [status, setStatus] = useUrlState('status', 'aberto');
  const { data, error, loading, reload } = useApi(`/insights?status=${status}`, [status]);
  const [busy, setBusy] = useState(false);
  const canEdit = auth.can('insights', 'edit');
  const run = async () => { setBusy(true); try { await api.post('/insights/run'); toast('Detectores executados.'); reload(); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); } };
  const mark = async (id, s) => { try { await api.post(`/insights/${id}/status`, { status: s }); toast(s === 'aplicado' ? 'Marcado como aplicado.' : s === 'descartado' ? 'Descartado.' : 'Reaberto.'); reload(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <div className="page">
      <PageHead kicker="Inteligência de gestão" title="Fato, padrão, hipótese — e o que fazer." sub="Detectores determinísticos leem o banco a cada 15 minutos. Quando o Claude estiver configurado, ele narra e aprofunda — os números nunca vêm da IA.">
        <Button variant="primary" magnetic onClick={run} disabled={busy}>{busy ? 'Analisando…' : 'Rodar detectores agora'}</Button>
      </PageHead>
      <Tabs tabs={[{ key: 'aberto', label: 'Abertos' }, { key: 'aplicado', label: 'Aplicados' }, { key: 'descartado', label: 'Descartados' }, { key: 'resolvido', label: 'Resolvidos sozinhos' }]} value={status} onChange={setStatus} />
      <ErrorBox error={error} />
      {loading && !data ? <Loading rows={6} /> : !data?.length ? <Empty title="Nenhum insight aqui.">{status === 'aberto' ? 'A operação não apresenta padrões preocupantes agora.' : ''}</Empty> : data.map((x) => (
        <article key={x.id} className="insight">
          <div className="row between wrap">
            <div className="row wrap gap-2"><span className={`sev sev-${x.severity === 'alta' ? 'alta' : x.severity === 'media' ? 'media' : 'baixa'}`}>● {SEV[x.severity] || x.severity}</span><Tag>{DET[x.detector] || x.detector}</Tag><Tag tone={x.source === 'ia' ? 'bordo' : undefined}>{x.source === 'ia' ? 'Gerado por IA' : 'Regra determinística'}</Tag></div>
            <span className="xs faint">atualizado {ago(x.updated_at)}</span>
          </div>
          <div className="row-top between gap-5">
            <h2 className="problem">{x.problem}</h2>
            {x.metric != null && <span className="metric-badge num" title="Métrica do detector">{x.metric}{['dependencia'].includes(x.detector) ? '%' : ''}</span>}
          </div>
          <div className="chain">
            <div><span className="caps">Padrão observado</span><p>{x.pattern || '—'}</p></div>
            <div><span className="caps">Hipótese · não verificada</span><p>{x.hypothesis?.text || '—'}</p></div>
            <div><span className="caps">Impacto</span><p>{x.impact || '—'}</p></div>
            <div><span className="caps bordo">Sugestão</span><p>{x.suggestion || '—'}</p></div>
            <div><span className="caps">Ação possível</span>
              <div className="col gap-2" style={{ alignItems: 'flex-start' }}>
                {x.action_payload?.link && <Link className="btn btn-sm btn-ink" to={x.action_payload.link} data-cursor="ABRIR">{x.action || 'Abrir'} →</Link>}
                {canEdit && status === 'aberto' && <div className="row gap-2"><Button size="sm" onClick={() => mark(x.id, 'aplicado')}>Aplicado</Button><Button size="sm" variant="ghost" onClick={() => mark(x.id, 'descartado')}>Descartar</Button></div>}
                {canEdit && status !== 'aberto' && status !== 'resolvido' && <Button size="sm" variant="ghost" onClick={() => mark(x.id, 'aberto')}>Reabrir</Button>}
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
