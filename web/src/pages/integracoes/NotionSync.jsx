// CONFIGURAÇÕES → INTEGRAÇÕES → NOTION — estado real da sincronização Notion → The Bold OS e o mapa completo das bases.
// Nada aparece como ativo sem estar: sem NOTION_TOKEN = BLOQUEADO; prévia sem hospedagem persistente = sem rotina contínua.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useApi, useAuth, useToast } from '../../lib/hooks.js';
import { useCrumbs } from '../../components/Shell.jsx';
import { Loading, PageHead } from '../../components/ui.jsx';
import { StateBadge, StateNotice } from '../../components/State.jsx';
import { LoadError } from '../admin/Guard.jsx';
import { fmtDate, fmtDateTime } from '../../lib/format.js';
import '../../styles/notion.css';

const TONE = { ativa: 'ativo', importado_nao_sincronizado: 'somente_leitura', parcial: 'aguardando_integracao', aguardando_mapeamento: 'aguardando_decisao', aguardando_decisao: 'aguardando_decisao', documentacao: 'dados_insuficientes', fora_do_escopo: 'dados_insuficientes', bloqueado_configuracao: 'bloqueado' };
const CH = { detectada: 'Detectada', aguardando_mapeamento: 'Aguardando mapeamento', aplicada: 'Aplicada', conflito: 'Conflito', erro: 'Erro', ignorada: 'Ignorada' };
const d = (v) => (v ? fmtDate(v) : '—');

export default function NotionSync() {
  useCrumbs('Integrações', 'Notion');
  const { data, error, loading, reload } = useApi('/integracoes/notion', [], { live: false });
  const changes = useApi('/integracoes/notion/alteracoes', [], { live: false });
  const [filter, setFilter] = useState('');
  if (loading && !data) return <div className="page"><Loading rows={8} /></div>;
  if (error) return <LoadError error={error} />;
  const items = data.groups.flatMap((g) => g.items);
  const blocked = !data.token;
  return (
    <div className="page ns">
      <PageHead kicker="Configurações · Integrações" title="Notion" sub="Notion → The Bold OS. A escrita de volta no Notion está desativada por decisão da CEO. Importado uma vez não é sincronizado." />
      <p className="sm"><Link to="/integracoes">← Todas as integrações</Link></p>

      <div className="ns-top">
        <div className="ns-cell"><span className="caps">Notion</span><b>{data.token ? '🟢 Conectado' : '🔴 Não conectado'}</b><span className="xs muted">{data.token ? 'NOTION_TOKEN presente no servidor (nunca exibido)' : 'NOTION_TOKEN não configurado'}</span></div>
        <div className="ns-cell"><span className="caps">Notion → The Bold OS</span><b>{blocked ? 'BLOQUEADA' : data.counts.bases_ligadas && data.persistent ? 'ATIVA' : 'PENDENTE'}</b><span className="xs muted">{blocked ? 'NOTION_TOKEN não configurado' : !data.persistent ? 'Sem hospedagem persistente: só “sincronizar agora”' : `${data.counts.bases_ligadas} base(s) ligada(s)`}</span></div>
        <div className="ns-cell"><span className="caps">The Bold OS → Notion</span><b>DESATIVADA</b><span className="xs muted">Por decisão. Nenhuma rota escreve no Notion.</span></div>
        <div className="ns-cell"><span className="caps">Última sincronização</span><b>{data.last_sync ? fmtDateTime(data.last_sync) : 'Nenhuma'}</b><span className="xs muted">Leitura real pela API (a extração de 19–21/10 não conta)</span></div>
      </div>
      <div className="ns-counts">
        {[['Alterações detectadas', data.counts.detectadas], ['Pendências de mapeamento', data.counts.aguardando_mapeamento], ['Conflitos', data.counts.conflitos], ['Erros', data.counts.erros], ['Aplicadas', data.counts.aplicadas]].map(([l, n]) => <div key={l}><b className="tnum">{n}</b><span>{l}</span></div>)}
      </div>

      {blocked && <StateNotice s="bloqueado" title="BLOQUEADO — NOTION_TOKEN NÃO CONFIGURADO">A arquitetura está pronta; a sincronização operacional não está ativa. Para ativar: criar a integração interna no Notion, compartilhar as bases com ela e definir NOTION_TOKEN no servidor.</StateNotice>}
      {!data.persistent && <div className="mt-4"><StateNotice s="aguardando_configuracao" title="Hospedagem não persistente">A prévia da Vercel é efêmera (cada instância usa uma cópia temporária da base) e não mantém rotina contínua. A sincronização viva só vale numa hospedagem persistente (BOLD_PERSISTENT_HOST=1).</StateNotice></div>}

      <section className="ns-sec">
        <h2 className="caps">Arquitetura</h2>
        <ol className="ns-flow">
          {[['Alteração no Notion', 'Página criada, editada, arquivada ou restaurada'],
            ['Detecção', `Webhook oficial do Notion (assinatura verificada) ${data.webhook.configured ? '· configurado' : '· aguardando configuração'} · ou polling controlado por base (frequência configurável, padrão 15 min). Não é “tempo real” sem webhook.`],
            ['Validação', 'A página pertence a uma base do mapa? Mesma edição já registrada? (não duplica)'],
            ['Mapeamento', 'Só com mapeamento conhecido. Sem mapeamento: ALTERAÇÃO DETECTADA — AGUARDANDO MAPEAMENTO (guardada, nunca descartada, nada criado)'],
            ['The Bold OS atualizada', 'CR Editorial e calendários: espelho somente leitura. Conteúdo vinculado nunca muda sozinho: vira CONFLITO para revisão. Legado continua legado.']].map(([t, s], i) => (
            <li key={t}><span className="ns-step">{String(i + 1).padStart(2, '0')}</span><div><b>{t}</b><p className="xs muted">{s}</p></div><StateBadge s={blocked ? 'bloqueado' : 'ativo'} label={blocked ? 'PRONTO · BLOQUEADO' : 'PRONTO'} /></li>
          ))}
        </ol>
      </section>

      <section className="ns-sec">
        <div className="row between wrap gap-3"><h2 className="caps">Bases e páginas ({data.total})</h2>
          <select className="select" style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar por estado">
            <option value="">Todos os estados</option>{Object.entries(data.states).map(([k, l]) => <option key={k} value={k}>{l} · {data.by_state[k]}</option>)}
          </select>
        </div>
        {data.groups.map((g) => {
          const list = g.items.filter((i) => !filter || i.state === filter);
          if (!list.length) return null;
          return (
            <div key={g.key} className="ns-group">
              <h3 className="nh-h3">{g.label}{g.url && <> · <a href={g.url} target="_blank" rel="noreferrer">abrir no Notion ↗</a></>}</h3>
              <div className="np-list">{list.map((it) => <Base key={it.key} it={it} states={data.states} reload={reload} />)}</div>
            </div>
          );
        })}
      </section>

      <section className="ns-sec">
        <h2 className="caps">Alterações detectadas</h2>
        {!changes.data?.length ? <p className="sm muted">Nenhuma alteração lida do Notion até agora{blocked ? ' — sincronização bloqueada (sem NOTION_TOKEN)' : ''}.</p> : (
          <div className="table-wrap"><table className="table"><thead><tr><th>Quando</th><th>Página</th><th>Tipo</th><th>Via</th><th>Estado</th><th>Observação</th></tr></thead>
            <tbody>{changes.data.map((c) => <tr key={c.id}><td className="xs">{fmtDateTime(c.detected_at)}</td><td className="sm">{c.title || c.notion_page_id}</td><td className="xs">{c.kind}</td><td className="xs">{c.via}</td><td className="xs">{CH[c.status]}</td><td className="xs">{c.note}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}

function Base({ it, states, reload }) {
  const auth = useAuth();
  const toast = useToast();
  const admin = auth.can('integracoes', 'admin');
  const toggle = async () => { try { await api.patch(`/integracoes/notion/fontes/${encodeURIComponent(it.source_key)}`, { enabled: !it.enabled }); toast(it.enabled ? 'Base desligada.' : 'Base ligada na sincronização viva.'); reload(); } catch (e) { toast(e.message, 'err'); } };
  const now = async () => { try { const r = await api.post(`/integracoes/notion/fontes/${encodeURIComponent(it.source_key)}/sincronizar`); toast(`${r.pages} páginas lidas · ${r.changes} alterações.`); reload(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <details className="np-item">
      <summary>
        <span className="np-name"><b>{it.label}</b><small>{it.origin}{it.rows != null ? ` · ${it.rows} no Notion` : ''}{it.rows_extracted != null ? ` · ${it.rows_extracted} importados` : ''}</small></span>
        {it.differences.length > 0 ? <span className="np-role r-operacional">Diferença detectada</span> : <span className="np-role">{it.pending ? `${it.pending} pendente(s)` : ''}</span>}
        <StateBadge s={TONE[it.state]} label={states[it.state]} />
      </summary>
      <dl className="np-facts">
        <div><dt>Origem</dt><dd>{it.origin}</dd></div>
        <div><dt>ID</dt><dd>{it.notion_id || 'não registrado na exportação'}{it.url && <> · <a href={it.url} target="_blank" rel="noreferrer">abrir ↗</a></>}</dd></div>
        <div><dt>Destino</dt><dd>{it.destination}</dd></div>
        <div><dt>Entidade</dt><dd>{it.entity}</dd></div>
        <div><dt>Direção</dt><dd>{it.direction}</dd></div>
        <div><dt>Frequência</dt><dd>{it.frequency}</dd></div>
        <div><dt>Estado</dt><dd>{states[it.state]}{it.enabled ? ' · ligada na sincronização viva' : ''}</dd></div>
        <div><dt>Última alteração</dt><dd>{d(it.last_edited)}</dd></div>
        <div><dt>Última sincronização</dt><dd>{it.last_sync ? fmtDateTime(it.last_sync) : 'Nenhuma'}{it.imported_at ? ` · importação única em ${d(it.imported_at)} (não é sincronização)` : ''}</dd></div>
        {it.differences.length > 0 && <div><dt>Diferença detectada</dt><dd><ul>{it.differences.map((x) => <li key={x}>{x}</li>)}</ul></dd></div>}
        {it.mapped.length > 0 && <div><dt>Campos mapeados</dt><dd><ul>{it.mapped.map((x) => <li key={x}>{x}</li>)}</ul></dd></div>}
        {it.unmapped.length > 0 && <div><dt>Campos não mapeados</dt><dd><ul>{it.unmapped.map((x) => <li key={x}>{x}</li>)}</ul></dd></div>}
        <div><dt>Erro</dt><dd>{it.error || 'Nenhum'}</dd></div>
        <div><dt>Observações</dt><dd>{it.note}</dd></div>
      </dl>
      {admin && it.source_key && (
        <div className="row wrap gap-2 mt-2">
          <button className="btn btn-sm" onClick={toggle}>{it.enabled ? 'Desligar da sincronização viva' : 'Ligar na sincronização viva'}</button>
          <button className="btn btn-sm btn-ghost" onClick={now}>Sincronizar agora</button>
          <span className="xs muted">{it.mapper ? 'Mapeamento de atualização pronto.' : 'Sem mapeamento de atualização: alterações ficam aguardando mapeamento.'}</span>
        </div>
      )}
    </details>
  );
}
