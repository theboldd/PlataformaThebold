// NOTION · HISTÓRICO — o que veio do Notion, de onde veio e em que estado está. Somente leitura:
// a plataforma não lê nem escreve no Notion; os dados migrados ficam marcados pela origem e fora dos indicadores (regras 22–24).
import { Link } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Loading, ErrorBox, PageHead, Section } from '../components/ui.jsx';
import { StatePanel, StateTag, Metric } from '../components/State.jsx';
import { fmtDateTime } from '../lib/format.js';

const LEGACY = { nao_validado: 'Legado · não validado', historico: 'Mantido como histórico', reprogramado: 'Reprogramado', cancelado: 'Encerrado como cancelado' };
const SOURCE = { cr_editorial: 'CR Editorial', calendario: 'Calendários editoriais' };

export default function Notion() {
  useCrumbs('Notion · histórico');
  const { data, error, loading } = useApi('/notion/resumo');
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  if (loading && !data) return <div className="page"><Loading rows={6} /></div>;
  return (
    <div className="page">
      <PageHead kicker="Origem dos dados" title="Notion · histórico" sub="Tudo o que foi importado do Notion, com a origem preservada. É histórico somente leitura: nada aqui é lido nem escrito no Notion, e o que veio de lá não vira pendência, atraso ou indicador." />
      <div className="row wrap gap-3 mb-5" style={{ alignItems: 'center' }}>
        <StateTag s="nao_conectada">Sincronização com o Notion: não conectada</StateTag>
        <span className="xs muted">Importação histórica · somente leitura</span>
      </div>

      <Section kicker="Importado" title="O que veio do Notion">
        <div className="metric-grid">
          <Metric label="Clientes com página no Notion" value={data.clientes_com_pagina} />
          <Metric label="Client Brain · entradas" value={data.brain.entradas} hint={`${data.brain.clientes} clientes`} />
          <Metric label="Onboarding · respostas" value={data.onboarding.respostas} hint={`${data.onboarding.clientes} clientes`} />
          <Metric label="Conteúdos migrados" value={data.conteudos.total} hint={`${data.conteudos.em_andamento} em andamento`} />
          <Metric label="Tarefas herdadas abertas" value={data.tarefas_herdadas_abertas} hint="fora de carga e performance" />
        </div>
      </Section>

      <Section kicker="Somente leitura" title="Calendários e CR Editorial">
        {!data.historico.length ? <StatePanel compact s="dados_insuficientes" title="Nenhum registro histórico importado." /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Fonte</th><th className="num">Registros</th><th className="num">Vazios (ocultos)</th><th>Extraído em</th></tr></thead>
            <tbody>{data.historico.map((h) => <tr key={h.source}><td className="strong">{SOURCE[h.source] || h.source}</td><td className="num tnum">{h.n}</td><td className="num tnum">{h.vazios || 0}</td><td className="sm">{fmtDateTime(h.extraido)}</td></tr>)}</tbody>
          </table></div>
        )}
        <p className="xs muted mt-2">Por cliente: Clientes → cliente → aba Calendário editorial → “Histórico do Notion”.</p>
      </Section>

      <div className="state-grid mt-5">
        <StatePanel s={data.legado.find((l) => l.status === 'nao_validado')?.n ? 'aguardando_decisao' : 'ativo'} kicker="Itens legados" title="Herdados de “Para agendamento”" to="/atrasos" action="Abrir itens legados">
          {data.legado.length ? data.legado.map((l) => <p key={l.status}>{LEGACY[l.status] || l.status}: <b>{l.n}</b></p>) : <p>Nenhum item legado.</p>}
        </StatePanel>
        <StatePanel s={data.decisoes.abertas ? 'aguardando_decisao' : 'ativo'} kicker="Decisões da migração" title={`${data.decisoes.abertas} pontos aguardam decisão`} to="/migracao" action="Abrir decisões">
          {data.decisoes.por_tipo.slice(0, 6).map((d) => <p key={d.kind} className="xs">{d.kind}: {d.n}</p>)}
        </StatePanel>
        <StatePanel s="aguardando_decisao" kicker="Conteúdo migrado em andamento" title={`${data.conteudos.em_andamento} conteúdos do Notion em produção/revisão`} to="/torre" action="Ver na Torre">
          <p>Ainda contam nos indicadores operacionais, no mapa da Torre e na Sala de Revisão. Como exibi-los é uma decisão pendente da CEO.</p>
        </StatePanel>
      </div>
      <p className="xs muted mt-4">Os conteúdos e tarefas migrados aparecem com a marca “Migrado do Notion” onde forem exibidos. <Link to="/clientes" className="bordo">Ver clientes</Link></p>
    </div>
  );
}
