// DECISÕES DA MIGRAÇÃO — o que a migração do Notion não decidiu sozinha (status, equipe, duplicados, escopo, inconsistências).
// Cada item vem de migration_issues; resolver aqui fica no histórico.
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi, useToast } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { PageHead, Loading, Empty, ErrorBox, Button } from '../components/ui.jsx';
import { cleanName } from '../lib/format.js';
import { ISSUE } from './client/Ficha.jsx';
import '../styles/exec.css';

const ORDER = ['status', 'equipe', 'duplicado', 'escopo', 'quadro_mensal', 'conflito', 'resposta_multipla', 'inconsistencia', 'pagina_inacessivel', 'formulario_antigo', 'arquivos_nao_lidos', 'arquivo_no_notion', 'campo_sem_secao'];

export default function Migracao() {
  useCrumbs('Clientes', 'Decisões da migração');
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind') || '';
  const showDone = params.get('todos') === '1';
  const { data, error, loading, reload } = useApi('/migration-issues', [], { live: false });
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  if (loading || !data) return <div className="page"><Loading rows={8} /></div>;
  const open = data.filter((i) => i.status === 'aberto');
  const counts = {};
  for (const i of open) counts[i.kind] = (counts[i.kind] || 0) + 1;
  const kinds = ORDER.filter((k) => counts[k]).concat(Object.keys(counts).filter((k) => !ORDER.includes(k)));
  const shown = data.filter((i) => (!kind || i.kind === kind) && (showDone || i.status === 'aberto'));
  const set = async (i, status) => { try { await api.patch(`/migration-issues/${i.id}`, { status }); reload(); } catch (e) { toast(e.message, 'err'); } };
  const filter = (k) => setParams((p) => { const n = new URLSearchParams(p); if (k) n.set('kind', k); else n.delete('kind'); return n; }, { replace: true });
  return (
    <div className="page">
      <PageHead kicker="Base real · Notion" title="Decisões da migração" sub="O que a migração dos clientes do Notion não decidiu sozinha. Nada aqui foi escolhido automaticamente: cada ponto espera uma decisão da equipe." />
      <div className="row wrap gap-2 mb-5" role="group" aria-label="Tipo de decisão">
        <button className={`ex-chip ${!kind ? 'on' : ''}`} aria-pressed={!kind} onClick={() => filter('')}>Todos · {open.length}</button>
        {kinds.map((k) => <button key={k} className={`ex-chip ${kind === k ? 'on' : ''}`} aria-pressed={kind === k} onClick={() => filter(k)}>{ISSUE[k] || k} · {counts[k]}</button>)}
      </div>
      <label className="row gap-2 sm muted mb-4"><input type="checkbox" checked={showDone} onChange={(e) => setParams((p) => { const n = new URLSearchParams(p); if (e.target.checked) n.set('todos', '1'); else n.delete('todos'); return n; }, { replace: true })} /> Mostrar também resolvidos e ignorados</label>
      {!shown.length ? <Empty title="Nenhuma decisão pendente aqui." /> : (
        <ul className="list">{shown.map((i) => (
          <li key={i.id} className={i.status !== 'aberto' ? 'faint' : ''}>
            <span className="tag">{ISSUE[i.kind] || i.kind}</span>
            <div className="grow">
              {i.client_id ? <Link className="sm strong link" to={`/clientes/${i.client_id}?tab=ficha`}>{cleanName(i.client || i.client_name)}</Link> : <span className="sm strong">{i.client_name || 'Base de clientes'}</span>}
              <div className="sm">{i.description}</div>
            </div>
            {i.status === 'aberto'
              ? <><Button size="sm" variant="ghost" onClick={() => set(i, 'resolvido')}>Resolvido</Button><Button size="sm" variant="ghost" onClick={() => set(i, 'ignorado')}>Ignorar</Button></>
              : <button className="btn btn-sm btn-ghost" onClick={() => set(i, 'aberto')}>{i.status} · reabrir</button>}
          </li>
        ))}</ul>
      )}
    </div>
  );
}
