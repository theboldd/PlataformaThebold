// PÁGINA "PROCESSO" DO NOTION — o que existe lá, para onde vai na plataforma e o que está (ou não) sincronizado.
// Dados: GET /notion/processo (mapa auditado + contagens da base). Nunca mostra "sincronizada" sem sincronização viva.
import { useApi } from '../../lib/hooks.js';
import { Section, Loading, ErrorBox } from '../../components/ui.jsx';
import { StateBadge, StateNotice } from '../../components/State.jsx';
import { fmtDate } from '../../lib/format.js';

const ROLE = { operacional: 'Alimenta operação', documentacao: 'Só documentação', historico: 'Histórico', fora: 'Fora' };
const ST = {
  importado_extracao: ['somente_leitura', 'IMPORTADO 1× (EXTRAÇÃO)'], nao_sincronizado: ['nao_conectada', 'NÃO SINCRONIZADO'],
  sem_mapeamento: ['aguardando_decisao', 'SEM MAPEAMENTO'], aguardando_decisao: ['aguardando_decisao', 'AGUARDANDO DECISÃO'], fora_do_escopo: ['dados_insuficientes', 'FORA DO ESCOPO'],
};
const MS = { cliente_aprova_temas: 'Cliente aprova temas', producao: 'Produção', revisao_producao: 'Revisão da produção', ajustes_equipe: 'Ajustes da equipe', tudo_pronto: 'Tudo pronto', cliente_aprova_final: 'Cliente aprova final', ajustes_cliente: 'Ajustes do cliente' };
const MATCH = { igual: 'igual', diferente: 'diferente', sem_marco: 'sem marco na plataforma', sem_correspondencia: 'sem etapa correspondente' };
const d = (v) => (v ? fmtDate(v) : '—');
const dm = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const pd = (s, e) => (s === e ? dm(s) : `${dm(s)} → ${dm(e)}`);

export default function Processo() {
  const { data, error, loading } = useApi('/notion/processo', [], { live: false });
  if (error) return <ErrorBox error={error} />;
  if (loading || !data) return <Loading rows={4} />;
  const s = data.summary;
  return (
    <Section title="Página PROCESSO" kicker="Notion · THE BOLD MKT">
      <div className="np-head">
        <StateBadge s="aguardando_integracao" label="PARCIAL" />
        <span className="sm">Auditada em {d(data.audit.at)} · <a href={data.page.url} target="_blank" rel="noreferrer">abrir no Notion ↗</a> · última sincronização real: <b>nenhuma</b>{data.token ? '' : ' (sem NOTION_TOKEN)'}</span>
      </div>
      <p className="xs muted">{s.total} subpáginas e bases encontradas · {s.importado_extracao} importadas uma vez por extração ({s.alterados_depois} alteradas no Notion depois) · {s.nao_sincronizado} não sincronizadas · {s.sem_mapeamento} sem mapeamento · {s.aguardando_decisao} aguardando decisão · {s.fora_do_escopo} fora do escopo. Documentação é só consulta: mudança nela não altera regra, prazo, permissão ou processo em execução.</p>
      <div className="np-list">
        {data.items.map((it) => {
          const [st, lbl] = ST[it.state] || ['dados_insuficientes', it.state];
          return (
            <details key={it.key} className="np-item">
              <summary>
                <span className="np-name"><b>{it.name}</b><small>{it.container} · {it.kind === 'base' ? 'base' : 'página'}{it.rows != null ? ` · ${it.rows} linhas no Notion` : ''}</small></span>
                <span className={`np-role r-${it.role}`}>{ROLE[it.role]}</span>
                <StateBadge s={st} label={lbl} />
              </summary>
              <dl className="np-facts">
                <div><dt>Origem</dt><dd>ID {it.notion_id}{it.data_source ? ` · coleção ${it.data_source}` : ''}</dd></div>
                <div><dt>Destino</dt><dd>{it.destination}</dd></div>
                <div><dt>Direção</dt><dd>{it.direction}</dd></div>
                <div><dt>Última alteração detectada</dt><dd>{d(it.last_edited)}{it.changed_after_extraction ? ' · alterada depois da extração' : ''}</dd></div>
                <div><dt>Última sincronização</dt><dd>{it.extracted_at ? `Nenhuma viva · extração única em ${d(it.extracted_at)}` : 'Nenhuma'}</dd></div>
                {it.rows_extracted != null && <div><dt>Linhas</dt><dd>{it.rows} no Notion × {it.rows_extracted} extraídas{it.new_rows > 0 ? ` · ${it.new_rows} novas não sincronizadas` : ''}{it.in_platform != null ? ` · ${it.in_platform} registros de origem na plataforma` : ''}{it.issues_open ? ` · ${it.issues_open} pontos de revisão abertos` : ''}</dd></div>}
                {it.mapped.length > 0 && <div><dt>Campos mapeados</dt><dd><ul>{it.mapped.map(([a, b]) => <li key={a}>{a} → {b}</li>)}</ul></dd></div>}
                {it.unmapped.length > 0 && <div><dt>Sem mapeamento</dt><dd><ul>{it.unmapped.map((u) => <li key={u}>{u}</li>)}</ul></dd></div>}
                <div><dt>Erros e conflitos</dt><dd>{it.changed_after_extraction || it.new_rows > 0 ? 'Divergência: o Notion mudou depois da extração.' : 'Nenhum registrado.'}</dd></div>
              </dl>
              <p className="xs muted">{it.note}</p>
            </details>
          );
        })}
      </div>
      <h3 className="nh-h3">Calendário do ciclo de novembro (Notion) × marcos padrão da plataforma</h3>
      <p className="xs muted">Só comparação. Nada é aplicado ao Process Engine sem validação.</p>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Etapa no Notion</th><th>Notion</th><th>Plataforma</th><th>Resultado</th></tr></thead>
        <tbody>{data.cycle.map((r) => <tr key={r.etapa}><td>{r.etapa}</td><td className="tnum">{pd(r.start, r.end)}</td><td className="tnum xs">{r.candidates.length ? r.candidates.map((c) => <div key={c.key}>{MS[c.key] || c.key}: {c.start ? pd(c.start, c.end) : '—'} · {MATCH[c.match]}</div>) : '—'}</td><td className="xs">{r.ambiguous ? 'correspondência ambígua — ' : ''}{MATCH[r.match]}</td></tr>)}</tbody>
      </table></div>
      <StateNotice s="aguardando_integracao" title="Limitações">
        <ul className="np-lim">{data.limits.map((l) => <li key={l}>{l}</li>)}</ul>
      </StateNotice>
    </Section>
  );
}
