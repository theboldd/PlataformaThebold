// NOTION & HISTÓRICO — tudo o que veio do Notion num só lugar (regras oficiais 15, 22, 23 e 24).
// Somente leitura: números lidos da base por GET /notion/overview. Número ausente (null) = DADOS INSUFICIENTES, nunca estimativa.
// Nada aqui gera pendência, alerta ou métrica. Sem sincronização com o Notion, por decisão.
import { Link } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { PageHead, Section, Stat, Empty, Loading, ErrorBox } from '../components/ui.jsx';
import { StateBadge, StateNotice, Insufficient } from '../components/State.jsx';
import { cleanName } from '../lib/format.js';
import { ISSUE } from './client/Ficha.jsx';
import '../styles/notion.css';

const LEGACY = { nao_validado: 'Legado · não validado', reprogramado: 'Reprogramado', cancelado: 'Encerrado como cancelado', historico: 'Mantido como histórico' };
const FORM = { migrado_parcial: 'Migrado parcial', nao_iniciado: 'Não iniciado', em_andamento: 'Em andamento', concluido: 'Concluído' };
const ORIGIN = { notion: 'Notion', plataforma: 'Plataforma' };
const SRC_LABEL = { nao_importado: 'NÃO IMPORTADO', nao_migrado: 'NÃO MIGRADO · POR DECISÃO' };
const n = (v) => (typeof v === 'number' ? v.toLocaleString('pt-BR') : '—');
const isNum = (v) => typeof v === 'number';

function Num({ value, label, hint, to }) {
  if (!isNum(value)) return <div className="nh-ins"><span className="nh-ins-l">{label}</span><Insufficient>Não foi possível ler este número na base.</Insufficient></div>;
  return <Stat value={n(value)} label={label} hint={hint} to={to} />;
}

const pairs = (obj, labels = {}) => (obj ? Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${labels[k] || k}: ${n(v)}`).join(' · ') : null);

export default function NotionHistorico() {
  useCrumbs('Clientes', 'Notion & Histórico');
  const { data, error, loading } = useApi('/notion/overview', [], { live: false });
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  if (loading || !data) return <div className="page"><Loading rows={8} /></div>;
  const { brain, onboarding, history, legacy, origin, migration, clients } = data;
  const rows = data.per_client || [];
  const imported = data.sources.filter((s) => s.imported);
  const notImported = data.sources.filter((s) => !s.imported && !s.on_purpose);
  const onPurpose = data.sources.filter((s) => s.on_purpose);

  return (
    <div className="page nh">
      <PageHead kicker="MIGRAÇÃO · NOTION" title="Notion & Histórico"
        sub="Tudo o que veio do Notion, somente leitura, com origem e link. Nada aqui gera pendência, alerta ou métrica." />

      <Section title="Estado" kicker="Integração Notion">
        <div className="nh-state">
          <StateBadge s={data.state || 'somente_leitura'} />
          <span>Sem sincronização com o Notion (por decisão). A importação foi feita por exportação; a plataforma não lê nem escreve no Notion.</span>
        </div>
      </Section>

      <Section title="Números" kicker="Lidos da base agora">
        <div className="stats nh-stats">
          <Num value={brain?.notion} label="Client Brain migrado" hint={isNum(brain?.total) ? `de ${n(brain.total)} entradas no total` : undefined} />
          <Num value={onboarding?.answers_notion} label="Onboarding migrado" hint={pairs(onboarding?.form_status, FORM) || undefined} />
          <Num value={history?.visible} label="Histórico do Notion" hint={isNum(history?.empty_hidden) ? `CR Editorial + calendários · ${n(history.empty_hidden)} vazios ocultos` : 'CR Editorial + calendários'} />
          <Num value={legacy?.total} label="Itens legados" hint={pairs(legacy?.by_status, LEGACY) || undefined} to={legacy?.can_review ? '/atrasos' : undefined} />
          {migration
            ? <Num value={migration.open} label="Pontos de revisão abertos" to="/migracao" />
            : <div className="nh-ins"><span className="nh-ins-l">Pontos de revisão abertos</span><p className="sm muted">Visível só para quem administra clientes.</p></div>}
        </div>
        <dl className="nh-facts">
          <div><dt>Clientes</dt><dd>{isNum(clients?.total) ? <>{n(clients.total)} no total · {n(clients.with_notion)} com página no Notion</> : 'DADOS INSUFICIENTES'}</dd></div>
          <div><dt>Conteúdos por origem</dt><dd>{pairs(origin?.contents, ORIGIN) || 'DADOS INSUFICIENTES'}</dd></div>
          <div><dt>Tarefas por origem</dt><dd>{pairs(origin?.tasks, ORIGIN) || 'DADOS INSUFICIENTES'}</dd></div>
          <div><dt>Client Brain por fonte</dt><dd>{pairs(brain?.by_source_type) || 'DADOS INSUFICIENTES'}</dd></div>
          <div><dt>Respostas de onboarding por fonte</dt><dd>{pairs(onboarding?.answers_by_source_type) || 'DADOS INSUFICIENTES'}</dd></div>
        </dl>
      </Section>

      <Section title="Fontes importadas e não importadas" kicker="O que veio do Notion e por quê">
        {history?.by_source?.length > 0 && (
          <div className="nh-block">
            <h3 className="nh-h3">Histórico por base do Notion</h3>
            <ul className="nh-src">
              {history.by_source.map((s) => (
                <li key={s.source}>
                  <div className="nh-src-h"><b>{s.source}</b><StateBadge s="somente_leitura" /></div>
                  <p>{n(s.n - (s.empty || 0))} itens visíveis em {n(s.clients)} {s.clients === 1 ? 'cliente' : 'clientes'}{s.empty ? ` · ${n(s.empty)} vazios ocultos` : ''}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
        <SourceList title="Importado" items={imported} />
        <SourceList title="Não importado (motivo registrado)" items={notImported} />
        <SourceList title="Não migrado de propósito" items={onPurpose} />
      </Section>

      <Section title="Itens legados" kicker="Regra oficial 22">
        {!isNum(legacy?.total) ? <Insufficient>Não foi possível ler os itens legados.</Insufficient> : (
          <>
            <div className="nh-legacy">
              {Object.keys(LEGACY).map((k) => <div key={k}><b>{n(legacy.by_status?.[k] ?? 0)}</b><span>{LEGACY[k]}</span></div>)}
            </div>
            <p className="sm muted">Herdados de “Para agendamento” no Notion. Não são pendência, atraso nem dado de performance; a decisão é sempre individual.</p>
            {legacy.can_review && <Link className="nh-link" to="/atrasos">Revisar itens legados →</Link>}
          </>
        )}
      </Section>

      {migration && (
        <Section title="Decisões da migração" kicker="Pontos de revisão">
          {!isNum(migration.open) ? <Insufficient>Não foi possível ler os pontos de revisão.</Insufficient> : (
            <StateNotice s={migration.open ? 'aguardando_decisao' : 'ativo'} title={`${n(migration.open)} ${migration.open === 1 ? 'ponto aberto' : 'pontos abertos'}`}
              action="Abrir decisões da migração" to="/migracao">
              {pairs(migration.open_by_kind, ISSUE) || 'Nenhum ponto aberto.'}
            </StateNotice>
          )}
          <div className="mt-3"><StateNotice s="aguardando_decisao" title="Ocear — Cronograma editorial" compact>Registros da operação atual, não importados até a decisão de como entram.</StateNotice></div>
        </Section>
      )}

      <Section title="Por cliente" kicker="Origem e link">
        <p className="sm muted nh-note">Na ficha do cliente aparece o selo “Migrado do Notion”; a aba Calendário editorial tem o “Histórico do Notion”.</p>
        {!data.per_client ? <Insufficient>Não foi possível ler a lista por cliente.</Insufficient> : !rows.length ? <Empty title="Nenhum cliente no seu escopo." /> : (
          <div className="nh-table" role="table" aria-label="Migração por cliente">
            <div className="nh-tr nh-th" role="row">
              <span role="columnheader">Cliente</span><span role="columnheader">Client Brain</span><span role="columnheader">Onboarding</span>
              <span role="columnheader">Histórico</span><span role="columnheader">Legados</span><span role="columnheader">Notion</span>
            </div>
            {rows.map((c) => (
              <div className="nh-tr" role="row" key={c.id}>
                <span role="cell" className="nh-name"><Link to={`/clientes/${c.id}`}>{cleanName(c.name)}</Link>{isNum(c.issues_open) && c.issues_open > 0 && <small>{c.issues_open} {c.issues_open === 1 ? 'ponto de revisão' : 'pontos de revisão'}</small>}</span>
                <span role="cell" data-l="Client Brain">{n(c.brain)}</span>
                <span role="cell" data-l="Onboarding">{n(c.answers)}{c.form_status && <small>{FORM[c.form_status] || c.form_status}</small>}</span>
                <span role="cell" data-l="Histórico">{n(c.history)}</span>
                <span role="cell" data-l="Legados">{n(c.legacy)}</span>
                <span role="cell" data-l="Notion">{c.notion_url ? <a href={c.notion_url} target="_blank" rel="noopener noreferrer">Abrir no Notion ↗</a> : <span className="muted">sem página</span>}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function SourceList({ title, items }) {
  if (!items.length) return null;
  return (
    <div className="nh-block">
      <h3 className="nh-h3">{title}</h3>
      <ul className="nh-src">
        {items.map((s) => (
          <li key={s.key}>
            <div className="nh-src-h"><b>{s.label}</b><StateBadge s={s.state} label={SRC_LABEL[s.state]} /></div>
            <p>{s.note}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
