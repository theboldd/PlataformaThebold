import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi, useAuth, useToast } from '../lib/hooks.js';
import { ClienteOrigem } from './client/ClienteOrigem.jsx';
import { useCrumbs } from '../components/Shell.jsx';
import { Avatar, Button, Empty, ErrorBox, Field, Loading, Modal, Risk, Timeline } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { ago, bytes, cleanName, fmtDate, fmtDateTime, money } from '../lib/format.js';
import { FUNCTIONS, FORMATS } from '../lib/status.js';
import Ficha, { SECTION_LABEL } from './client/Ficha.jsx';
import { RequestsTab, DecisionsTab, HealthTab, PulseTab } from './client/PortalTabs.jsx';
import { PendenciesTab, CommunicationTab } from './client/ClientExtraTabs.jsx';
import '../styles/pend.css';
import Editorial from './client/Editorial.jsx';
import { ClientOnboardingCard } from './client/OnboardingCards.jsx';
import '../styles/production.css';
import '../styles/cliente.css';

const BRAIN = [['posicionamento', 'Posicionamento'], ['publico', 'Público'], ['persona', 'Persona'], ['tom', 'Tom de voz'], ['linguagem', 'Linguagem'], ['oferta', 'Oferta'], ['produtos', 'Produtos e serviços'], ['objetivos', 'Objetivos'], ['estrategia', 'Estratégia'], ['preferencias', 'Preferências'], ['restricoes', 'Restrições'], ['referencias', 'Referências'], ['regras', 'Regras específicas'], ['importante', 'Informações importantes']];
const MILESTONES = { cronograma_entrega: 'Entrega do cronograma', revisao_cronograma: 'Revisão do cronograma', ajuste_cronograma: 'Ajuste do cronograma', cliente_aprova_temas: 'Cliente aprova temas', leitura_comentarios: 'Leitura de comentários', producao: 'Produção', revisao_producao: 'Revisão da produção', ajustes_equipe: 'Ajustes da equipe', tudo_pronto: 'Tudo pronto', cliente_aprova_final: 'Cliente aprova produção', ajustes_cliente: 'Ajustes do cliente', agendamento: 'Agendamento' };
const MEM_KINDS = { decisao: 'Decisão', aprendizado: 'Aprendizado', feedback: 'Feedback', preferencia: 'Preferência', restricao: 'Restrição', informacao: 'Informação' };
// Navegação da ficha: 4 grupos (não 17 abas). As chaves de ?tab= continuam as mesmas — links antigos seguem funcionando.
const NAV = [
  { key: 'geral', label: 'Visão geral', items: [{ tab: 'visao', label: 'Visão geral' }, { tab: 'ficha', label: 'Ficha' }, { tab: 'brain', label: 'Client Brain' }, { tab: 'onboarding', label: 'Onboarding' }] },
  { key: 'conteudo', label: 'Conteúdo', items: [{ tab: 'conteudos', label: 'Calendário editorial' }, { tab: 'conteudos', ed: 'feed', label: 'Feed de aprovação' }, { tab: 'arquivos', label: 'Arquivos' }] },
  { key: 'relacao', label: 'Relação', items: [{ tab: 'comunicacao', label: 'Comunicação' }, { tab: 'reunioes', label: 'Reuniões' }, { tab: 'solicitacoes', label: 'Solicitações' }, { tab: 'decisoes', label: 'Decisões' }] },
  { key: 'gestao', label: 'Gestão', items: [{ tab: 'pendencias', label: 'Pendências' }, { tab: 'processo', label: 'Processo do mês' }, { tab: 'equipe', label: 'Equipe' }, { tab: 'marca', label: 'Marca & Pulso' }, { tab: 'saude', label: 'Saúde' }, { tab: 'financeiro', label: 'Financeiro', finance: true }, { tab: 'historico', label: 'Histórico' }, { tab: 'origem', label: 'Origem dos dados' }] },
];
const itemKey = (it) => `${it.tab}${it.ed ? `:${it.ed}` : ''}`;
const CYCLE = { planejamento: 'Planejamento', aprovacao_temas: 'Aprovação de temas', producao: 'Produção', aprovacao_final: 'Aprovação final', agendamento: 'Agendamento', publicando: 'Publicando', encerrado: 'Encerrado' };

export default function ClienteDetalhe() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'visao';
  const ed = params.get('ed');
  const go = (it) => setParams(it.tab === 'visao' ? {} : { tab: it.tab, ...(it.ed ? { ed: it.ed } : {}), ...(it.mes ? { mes: it.mes } : {}) }, { replace: true });
  const setTab = (t, extra = {}) => go({ tab: t, ...extra });
  const { data, error, loading, reload } = useApi(`/clients/${id}`, [id]);
  const auth = useAuth();
  useCrumbs('Clientes', data ? cleanName(data.client.name) : '…');
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  if (loading || !data) return <div className="page"><Loading rows={8} /></div>;
  const { client: c, onboarding: ob } = data;
  const missing = ob ? ob.items.filter((i) => i.status === 'pendente' && i.required) : [];
  const counts = { onboarding: ob && ob.status !== 'concluido' ? missing.length : 0, solicitacoes: data.open_requests || 0, arquivos: data.files.length, reunioes: data.meetings.length };
  const nav = NAV.map((g) => ({ ...g, items: g.items.filter((it) => !it.finance || data.finance) }));
  const current = `${tab}${tab === 'conteudos' && ed === 'feed' ? ':feed' : ''}`;
  const group = nav.find((g) => g.items.some((it) => itemKey(it) === current)) || nav[0];
  return (
    <div className="page cf">
      <header className="cf-head">
        <div className="cf-id">
          <div className="caps">{c.segment || 'Cliente'}{c.handle ? ` · ${c.handle}` : ''}{c.kind === 'interno' ? ' · cliente interno' : ''}</div>
          <h1 className="cf-name">{cleanName(c.name)}</h1>
          <div className="cf-status">
            {auth.can('carteira', 'edit') ? <StatusControl c={c} reload={reload} />
              : <span className="cf-pill">{c.status === 'a_confirmar' ? 'Status a confirmar' : CLIENT_STATUS[c.status] || c.status}</span>}
            {['baixo', 'nenhum'].includes(c.risk.level) ? <span className="cf-quiet">sem riscos identificados</span> : <Risk level={c.risk.level} />}
            {c.services.length > 0 && <span className="cf-quiet">{c.services.join(' · ')}</span>}
          </div>
        </div>
        <div className="cf-actions">
          {data.channel_id && <Link to={`/comunicacao/${data.channel_id}`} className="btn" data-cursor="ABRIR"><I.chat size={14} /> Conversa com o cliente</Link>}
          {auth.can('conteudos', 'create') && <Link to={`/conteudos/novo?client_id=${c.id}`} className="btn btn-primary"><I.plus size={14} /> Conteúdo</Link>}
          {auth.can('carteira', 'admin') && <MoreMenu><DeleteClient c={c} /></MoreMenu>}
        </div>
      </header>
      <nav className="cf-nav" aria-label="Seções do cliente">
        <div className="cf-groups" role="tablist">
          {nav.map((g) => <button key={g.key} role="tab" aria-selected={g === group} className={g === group ? 'on' : ''} onClick={() => go(g.items[0])}>{g.label}</button>)}
        </div>
        <div className="cf-sub">
          {group.items.map((it) => <button key={itemKey(it)} className={itemKey(it) === current ? 'on' : ''} aria-current={itemKey(it) === current ? 'page' : undefined} onClick={() => go(it)}>{it.label}{counts[it.tab] && !it.ed ? <span className="cf-n">{counts[it.tab]}</span> : null}</button>)}
        </div>
        <select className="cf-mobile select" aria-label="Seção do cliente" value={current} onChange={(e) => go(nav.flatMap((g) => g.items).find((it) => itemKey(it) === e.target.value))}>
          {nav.map((g) => <optgroup key={g.key} label={g.label}>{g.items.map((it) => <option key={itemKey(it)} value={itemKey(it)}>{it.label}</option>)}</optgroup>)}
        </select>
      </nav>
      {tab === 'visao' && <Overview data={data} missing={missing} setTab={setTab} />}
      {tab === 'ficha' && <Ficha clientId={c.id} />}
      {tab === 'brain' && <BrainTab data={data} reload={reload} />}
      {tab === 'onboarding' && <OnboardingTab data={data} missing={missing} reload={reload} />}
      {tab === 'conteudos' && <Editorial clientId={c.id} />}
      {tab === 'reunioes' && (!data.meetings.length ? <Empty title="Nenhuma reunião registrada." /> : (
        <ul className="list">{data.meetings.map((m) => (
          <li key={m.id}><span className="idx" style={{ width: 90, fontSize: 18 }}>{fmtDate(m.starts_at)}</span><div className="grow"><div className="sm strong">{m.title}</div><div className="xs muted">{m.status} · {new Date(m.starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{m.summary ? ` · ${m.summary}` : ''}</div></div><span className="xs faint">Google: {m.gcal_sync?.replace('_', ' ')}</span><Link className="btn btn-sm btn-ghost" to={`/reunioes?m=${m.id}`}>Abrir</Link></li>
        ))}</ul>
      ))}
      {tab === 'equipe' && <TeamTab data={data} reload={reload} />}
      {tab === 'pendencias' && <PendenciesTab clientId={c.id} />}
      {tab === 'comunicacao' && <CommunicationTab clientId={c.id} />}
      {tab === 'solicitacoes' && <RequestsTab clientId={c.id} team={data.team.filter((t, i, a) => t.role_key !== 'cliente' && a.findIndex((x) => x.id === t.id) === i)} />}
      {tab === 'decisoes' && <DecisionsTab clientId={c.id} canEdit={data.can_edit} sections={Object.keys(SECTION_LABEL)} />}
      {tab === 'marca' && <PulseTab clientId={c.id} canEdit={data.can_edit} />}
      {tab === 'saude' && <HealthTab clientId={c.id} />}
      {tab === 'arquivos' && (!data.files.length ? <Empty title="Nenhum arquivo." >Materiais enviados pelo cliente e entregas da produção aparecem aqui.</Empty> : (
        <div className="files-grid">{data.files.map((f) => (
          <a key={f.id} className="file-tile" href={f.urls.original} target="_blank" rel="noreferrer" data-cursor="VER">
            {f.urls.thumb ? <img className="pv" src={f.urls.thumb} alt="" loading="lazy" /> : <span className="pv"><I.file /></span>}
            <span className="clip">{f.name}</span>
            <span className="faint">{f.width ? `${f.width}×${f.height} · ` : ''}{bytes(f.size)} · {ago(f.created_at)}</span>
          </a>
        ))}</div>
      ))}
      {tab === 'financeiro' && data.finance && <FinanceTab finance={data.finance} />}
      {tab === 'processo' && <ProcessTab data={data} />}
      {tab === 'historico' && <Timeline items={data.timeline} />}
      {tab === 'origem' && <ClienteOrigem clientId={data.client.id} />}
    </div>
  );
}

function CycleBlock({ cycle }) {
  const today = new Date().toISOString().slice(0, 10);
  const pct = cycle.counts.total ? Math.round(((cycle.counts.done || 0) / cycle.counts.total) * 100) : 0;
  return (
    <div className="mb-5">
      <div className="row between wrap mb-2"><span className="ed-md">Ciclo de {monthLabel(cycle.month)}</span><span className="sm muted">{CYCLE[cycle.status]} · {cycle.counts.done || 0}/{cycle.counts.total} agendados ou publicados</span></div>
      <div className="bar mb-4"><span style={{ width: `${pct}%` }} /></div>
      <div className="milestones">{Object.entries(cycle.milestones).map(([k, m]) => {
        const st = m.end < today ? 'past' : m.start <= today ? 'now' : '';
        return <div key={k} className={`milestone ${st}`}><div className="k">{MILESTONES[k] || k}</div><div>{m.start === m.end ? fmtDate(`${m.start}T12:00:00-03:00`) : `${fmtDate(`${m.start}T12:00:00-03:00`)} → ${fmtDate(`${m.end}T12:00:00-03:00`)}`}{st === 'now' ? ' · agora' : ''}</div></div>;
      })}</div>
    </div>
  );
}

// VISÃO GERAL — responde: onde estamos, o que está acontecendo, o que precisa de atenção e qual é o próximo passo.
// Ordem: indicadores → próximo passo → calendário editorial + feed de aprovação → marca + equipe.
// Calendário editorial (o que vai ao ar e quando) e processo (etapa interna) ficam em componentes separados.
const dayBR = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const monthLabel = (ym) => { const t = new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(' de ', ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
const shiftMonth = (ym, n) => { const d = new Date(`${ym}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const pad2 = (n) => String(n).padStart(2, '0');

function Overview({ data, missing, setTab }) {
  const { client: c } = data;
  const n = (v) => pad2(v || 0);
  return (
    <div className="cf-over">
      {data.onboarding && data.onboarding.status !== 'concluido' && missing.length > 0 && (
        <button className="cf-note" onClick={() => setTab('onboarding')}>
          <span className="caps">Onboarding incompleto</span>
          <span className="sm">Faltam {missing.length} {missing.length === 1 ? 'item' : 'itens'}: {missing.slice(0, 3).map((m) => m.label).join(' · ')}{missing.length > 3 ? '…' : ''}</span>
          <span className="cf-link">Ver →</span>
        </button>
      )}
      <div className="cf-kpis">
        <div><b>{n(c.counts.total)}</b><span>Conteúdos</span></div>
        <div><b>{n(c.counts.em_producao)}</b><span>Em produção</span></div>
        <div className={(c.counts.aguardando_cliente || 0) > 0 ? 'attn' : ''}><b>{n(c.counts.aguardando_cliente)}</b><span>Aguardando cliente</span></div>
      </div>

      <NextStep c={c} />

      <div className="cf-duo">
        <MiniCalendar clientId={c.id} setTab={setTab} />
        <FeedPreview contents={data.contents} setTab={setTab} />
      </div>

      <div className="cf-duo cf-duo-even">
        <BrandEssence data={data} setTab={setTab} />
        <TeamCompact team={data.team} setTab={setTab} />
      </div>
    </div>
  );
}

function NextStep({ c }) {
  const reasons = c.risk.reasons || [];
  return (
    <section className="cf-next">
      <div className="caps">Próximo passo</div>
      {c.next ? (
        <>
          <h2 className="cf-next-t">{c.next.content}</h2>
          <div className="cf-next-meta"><span className="cf-pill">{c.next.stage}</span>{c.next.who && <span>{c.next.who}</span>}</div>
          <p className="cf-next-a">{c.next.text}</p>
          <Link to={`/conteudos/${c.next.content_id}`} className="cf-cta" data-cursor="ABRIR">Abrir conteúdo →</Link>
        </>
      ) : <p className="cf-empty">Nenhum conteúdo em andamento.</p>}
      {reasons.length > 0 && <ul className="cf-attn">{reasons.slice(0, 3).map((r) => <li key={r}>{r}</li>)}</ul>}
    </section>
  );
}

// Calendário editorial do mês: conteúdos da plataforma pela data editorial + CR Editorial do Notion (somente leitura) ainda não vinculado
function MiniCalendar({ clientId, setTab }) {
  const ed = useApi(`/clients/${clientId}/editorial`, [clientId], { live: false });
  const hist = useApi(`/clients/${clientId}/notion-history`, [clientId], { live: false });
  const items = (ed.data?.items || []).filter((i) => i.date && i.phase !== 'legado');
  const linked = new Set(items.map((i) => i.notion_link?.history_id).filter(Boolean));
  const cr = (hist.data?.items || []).filter((r) => r.date_start && !linked.has(r.id));
  const todayYM = new Date().toISOString().slice(0, 7);
  const months = [...new Set([...items.map((i) => dayBR(i.date).slice(0, 7)), ...cr.map((r) => r.date_start.slice(0, 7))])].sort();
  // abre no próximo mês com conteúdo da plataforma (o ciclo em produção); sem isso, no mês atual ou no último com data
  const pMonths = [...new Set(items.map((i) => dayBR(i.date).slice(0, 7)))].sort();
  const initial = pMonths.find((m) => m >= todayYM) || months.find((m) => m >= todayYM) || months[months.length - 1] || todayYM;
  const [month, setMonth] = useState(null);
  const ym = month || initial;
  const rows = [
    ...items.filter((i) => dayBR(i.date).slice(0, 7) === ym).map((i) => ({ key: i.id, day: dayBR(i.date), fmt: FORMATS[i.format] || i.format, title: i.title, to: `/conteudos/${i.id}` })),
    ...cr.filter((r) => r.date_start.slice(0, 7) === ym).map((r) => ({ key: r.id, day: r.date_start.slice(0, 10), fmt: null, title: r.title, notion: true })),
  ].sort((a, b) => a.day.localeCompare(b.day) || a.title.localeCompare(b.title));
  return (
    <section className="cf-block cf-cal">
      <div className="cf-block-h">
        <h2 className="cf-h">Calendário editorial</h2>
        <div className="cf-month">
          <button onClick={() => setMonth(shiftMonth(ym, -1))} aria-label="Mês anterior">‹ <span>{monthLabel(shiftMonth(ym, -1)).split(' ')[0]}</span></button>
          <b>{monthLabel(ym)}</b>
          <button onClick={() => setMonth(shiftMonth(ym, 1))} aria-label="Próximo mês"><span>{monthLabel(shiftMonth(ym, 1)).split(' ')[0]}</span> ›</button>
        </div>
      </div>
      {ed.loading && !ed.data ? <Loading rows={3} /> : !rows.length ? <p className="cf-empty">Nenhum conteúdo com data em {monthLabel(ym)}.</p> : (
        <ol className="cf-days">
          {rows.map((r, i) => {
            const first = i === 0 || rows[i - 1].day !== r.day;
            const body = <><span className="cf-day">{first ? r.day.slice(8, 10) : ''}</span><span className="cf-day-t">{r.fmt && <em>{r.fmt}</em>}{r.title}</span>{r.notion && <span className="cf-src">Notion</span>}</>;
            return <li key={r.key}>{r.to ? <Link to={r.to} data-cursor="ABRIR">{body}</Link> : <button onClick={() => setTab('conteudos', { mes: ym })} title="CR Editorial do Notion (somente leitura) — abrir no calendário completo">{body}</button>}</li>;
          })}
        </ol>
      )}
      <button className="cf-cta" onClick={() => setTab('conteudos', { mes: ym })}>Abrir calendário completo →</button>
    </section>
  );
}

// Feed de aprovação: o que está com o cliente agora (tema ou versão). A aprovação acontece no feed do portal.
function FeedPreview({ contents, setTab }) {
  const waiting = (contents || []).filter((x) => ['aprovacao_tema', 'aprovacao_cliente'].includes(x.stage));
  return (
    <section className="cf-block cf-feed">
      <div className="cf-block-h"><h2 className="cf-h">Feed de aprovação</h2><span className="cf-quiet">{waiting.length ? `${waiting.length} aguardando o cliente` : 'nada aguardando'}</span></div>
      {!waiting.length ? <p className="cf-empty">Nenhum conteúdo aguardando interação do cliente.</p> : (
        <div className="cf-thumbs">
          {waiting.slice(0, 4).map((x) => (
            <Link key={x.id} to={`/conteudos/${x.id}`} className="cf-thumb" data-cursor="ABRIR">
              <span className="cf-thumb-pv">{x.thumb ? <img src={x.thumb} alt="" loading="lazy" /> : <i>{FORMATS[x.format] || x.format}</i>}</span>
              <span className="cf-thumb-t">{x.title}</span>
              <span className="cf-quiet">{x.stage === 'aprovacao_tema' ? 'Tema' : 'Versão'} com o cliente</span>
            </Link>
          ))}
        </div>
      )}
      <button className="cf-cta" onClick={() => setTab('conteudos', { ed: 'feed' })}>Ver feed →</button>
    </section>
  );
}

function BrandEssence({ data, setTab }) {
  const order = ['posicionamento', 'tom', 'publico', 'objetivos'];
  const lines = order.map((k) => data.brain.find((b) => b.section === k && b.body)).filter(Boolean).slice(0, 2);
  return (
    <section className="cf-block">
      <div className="cf-block-h"><h2 className="cf-h">Essência da marca</h2></div>
      {!lines.length ? <p className="cf-empty">Client Brain ainda não preenchido.</p> : lines.map((b) => (
        <div key={b.section} className="cf-brand"><span className="caps">{BRAIN.find((x) => x[0] === b.section)?.[1]}</span><p>{b.body.length > 260 ? `${b.body.slice(0, 260).trim()}…` : b.body}</p></div>
      ))}
      <div className="cf-ctas"><button className="cf-cta" onClick={() => setTab('ficha')}>Ver ficha completa →</button><button className="cf-cta quiet" onClick={() => setTab('brain')}>Client Brain</button></div>
    </section>
  );
}

function TeamCompact({ team, setTab }) {
  const people = Object.values((team || []).filter((t) => t.function !== 'cliente').reduce((acc, t) => { (acc[t.id] ||= { ...t, fns: [] }).fns.push(FUNCTIONS[t.function] || t.function); return acc; }, {}));
  return (
    <section className="cf-block">
      <div className="cf-block-h"><h2 className="cf-h">Equipe</h2></div>
      {!people.length ? <p className="cf-empty">Ninguém vinculado a este cliente.</p> : (
        <ul className="cf-team">{people.map((t) => <li key={t.id}><span>{t.name}</span><span className="cf-quiet">{t.fns.join(' · ')}</span></li>)}</ul>
      )}
      <button className="cf-cta" onClick={() => setTab('equipe')}>Ver equipe →</button>
    </section>
  );
}

// Processo do mês (cronograma operacional interno) — fica em Gestão, fora da visão principal
function ProcessTab({ data }) {
  const active = data.cycles.filter((cy) => cy.status !== 'encerrado').sort((a, b) => b.month.localeCompare(a.month)).slice(0, 2);
  return (
    <section>
      <p className="sm muted" style={{ marginTop: 0 }}>Marcos internos do ciclo (processo da equipe). Não é o calendário editorial: o que vai ao ar e quando está em Conteúdo → Calendário editorial.</p>
      {!active.length ? <Empty title="Nenhum ciclo ativo." /> : active.map((cy) => <CycleBlock key={cy.id} cycle={cy} />)}
    </section>
  );
}

function MoreMenu({ children }) {
  return (
    <details className="cf-more">
      <summary aria-label="Mais ações">⋯</summary>
      <div className="cf-more-menu">{children}</div>
    </details>
  );
}

function BrainTab({ data, reload }) {
  const toast = useToast();
  const canEdit = data.can_edit;
  const [editing, setEditing] = useState(null);
  const [text, setText] = useState('');
  const [mem, setMem] = useState({ kind: 'decisao', body: '' });
  const bySec = Object.fromEntries(data.brain.map((b) => [b.section, b]));
  const save = async (sec) => {
    try { await api.put(`/clients/${data.client.id}/brain/${sec}`, { body: text }); toast('Client Brain atualizado.'); setEditing(null); reload(); } catch (e) { toast(e.message, 'err'); }
  };
  const addMem = async () => {
    try { await api.post(`/clients/${data.client.id}/memories`, mem); setMem({ ...mem, body: '' }); toast('Memória registrada.'); reload(); } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', alignItems: 'start' }}>
      <div>
        <div className="row between mb-4"><p className="sm muted" style={{ margin: 0 }}>A memória da marca. A IA consulta estas seções automaticamente ao trabalhar com este cliente.</p><a className="btn btn-sm" href={`/api/clients/${data.client.id}/brain.md`} target="_blank" rel="noreferrer"><I.download size={14} /> Exportar .md</a></div>
        {BRAIN.map(([k, label]) => {
          const b = bySec[k];
          return (
            <div className="brain-sec" key={k}>
              <div><div className="caps">{label}</div>{b?.updated_at && b.body && <div className="xs faint mt-2">{ago(b.updated_at)}</div>}</div>
              {editing === k ? (
                <div className="col gap-2">
                  <textarea className="textarea" autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(k); }} />
                  <div className="row end"><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button><Button size="sm" variant="ink" onClick={() => save(k)}>Salvar</Button></div>
                </div>
              ) : (
                <div className={`val ${b?.body ? '' : 'empty-val'}`} role={canEdit ? 'button' : undefined} tabIndex={canEdit ? 0 : undefined} onClick={() => { if (canEdit) { setEditing(k); setText(b?.body || ''); } }}
                  onKeyDown={(e) => { if (canEdit && e.key === 'Enter') { setEditing(k); setText(b?.body || ''); } }} data-cursor={canEdit ? 'EDITAR' : undefined}>
                  {b?.body || (canEdit ? 'Clique para preencher…' : 'Não preenchido.')}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div>
        <div className="section-head"><h2 className="ed-md">Memórias</h2><span className="xs faint">decisões, aprendizados, feedbacks</span></div>
        {canEdit && (
          <div className="col gap-2 mb-5">
            <select className="select" value={mem.kind} onChange={(e) => setMem({ ...mem, kind: e.target.value })} aria-label="Tipo de memória">{Object.entries(MEM_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <textarea className="textarea" placeholder="Preferência, restrição ou combinado com o cliente" value={mem.body} onChange={(e) => setMem({ ...mem, body: e.target.value })} />
            <div className="row end"><Button size="sm" variant="ink" disabled={!mem.body.trim()} onClick={addMem}>Registrar</Button></div>
          </div>
        )}
        {!data.memories.length ? <Empty title="Sem memórias." /> : data.memories.map((m) => (
          <div key={m.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
            <div className="row gap-2"><span className="tag">{MEM_KINDS[m.kind] || m.kind}</span>{m.source_type && <span className="xs faint">via {m.source_type === 'meeting' ? 'reunião' : m.source_type === 'message' ? 'conversa' : m.source_type}</span>}</div>
            <div className="sm mt-2">{m.body}</div>
            <div className="xs faint">{m.author || 'Sistema'} · {ago(m.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OnboardingTab({ data, missing, reload }) {
  const toast = useToast();
  const ob = data.onboarding;
  if (!ob) return <Empty title="Sem onboarding." />;
  const formLine = ob.form && (
    <div className="panel mb-5 row between wrap gap-3">
      <span className="sm">Formulário “Sua marca”: <b>{{ nao_iniciado: 'não iniciado', em_andamento: 'em preenchimento pelo cliente', migrado_parcial: 'migrado do Notion (parcial)', concluido: 'concluído' }[ob.form_status] || ob.form_status}</b> · {ob.form.answered}/{ob.form.total} respostas{ob.form_submitted_at ? ` · enviado em ${fmtDateTime(ob.form_submitted_at)}` : ''}</span>
      <Link className="btn btn-sm btn-ghost" to={`/clientes/${data.client.id}?tab=ficha`}>Ver respostas</Link>
    </div>
  );
  if (ob.status === 'migrado') return <div>{formLine}<ClientOnboardingCard clientId={data.client.id} /><p className="sm muted">Cliente migrado do Notion: o onboarding aconteceu antes da plataforma. As respostas encontradas estão na Ficha, com a origem de cada uma.</p></div>;
  const groups = [['formulario', 'Formulário'], ['material', 'Materiais'], ['acesso', 'Acessos'], ['interno', 'Interno']];
  const set = async (item, status) => { try { await api.patch(`/onboarding/items/${item.id}`, { status }); toast(`“${item.label}” → ${status}`); reload(); } catch (e) { toast(e.message, 'err'); } };
  const now = new Date().toISOString();
  const done = ob.items.filter((i) => i.status !== 'pendente').length;
  return (
    <div>
      {formLine}
      <ClientOnboardingCard clientId={data.client.id} />
      {ob.status !== 'concluido' && missing.length > 0 ? (
        <div className="ob-banner">
          <div className="row between wrap"><div className="caps" style={{ color: 'var(--err)' }}>Onboarding incompleto</div><span className="sm">{done}/{ob.items.length} itens · iniciado {ago(ob.started_at)}</span></div>
          <ul className="sm" style={{ margin: '10px 0 0', paddingLeft: 18 }}>
            {missing.map((m) => {
              const late = m.due_at && m.due_at < now;
              return <li key={m.id}><b>{m.label}</b> — {m.who === 'cliente' ? 'cliente envia' : 'equipe'} · pedido {ago(m.requested_at)} · prazo {fmtDate(m.due_at)}{late ? <span style={{ color: 'var(--err)' }}> · ATRASADO (risco para o 1º cronograma)</span> : ''}</li>;
            })}
          </ul>
        </div>
      ) : <div className="panel mb-5" style={{ borderColor: 'var(--ok)' }}><span className="sm" style={{ color: 'var(--ok)' }}>✓ Onboarding concluído {ob.completed_at ? `em ${fmtDateTime(ob.completed_at)}` : ''}.</span></div>}
      <div className="bar mb-5"><span style={{ width: `${Math.round((done / ob.items.length) * 100)}%` }} /></div>
      {groups.map(([k, label]) => {
        const items = ob.items.filter((i) => i.kind === k);
        if (!items.length) return null;
        return (
          <section key={k} className="mb-5">
            <div className="section-head"><h3 className="ed-md">{label}</h3><span className="xs faint">{items.filter((i) => i.status !== 'pendente').length}/{items.length}</span></div>
            {items.map((i) => {
              const late = i.status === 'pendente' && i.due_at && i.due_at < now;
              return (
                <div key={i.id} className="ob-item">
                  <span aria-hidden>{i.status === 'recebido' ? '✓' : i.status === 'dispensado' ? '—' : late ? '!' : '○'}</span>
                  <span style={{ minWidth: 0 }}><span className={i.status !== 'pendente' ? 'muted' : ''}>{i.label}</span>{i.value && <div className="xs faint clip">{i.value}</div>}</span>
                  <span className="xs hide-m">{i.who === 'cliente' ? 'Cliente' : 'Equipe'}</span>
                  <span className="xs hide-m" style={late ? { color: 'var(--err)' } : null}>prazo {fmtDate(i.due_at)}</span>
                  <span className="xs hide-m">{i.received_at ? `recebido ${fmtDate(i.received_at)}` : `pedido ${ago(i.requested_at)}`}</span>
                  {data.can_edit ? (
                    <select className="select" style={{ width: 'auto', minHeight: 30, padding: '2px 8px', fontSize: 12 }} value={i.status} onChange={(e) => set(i, e.target.value)} aria-label={`Status de ${i.label}`}>
                      <option value="pendente">Pendente</option><option value="recebido">Recebido</option><option value="dispensado">Dispensado</option>
                    </select>
                  ) : <span className={`tag ${i.status === 'recebido' ? 'tag-ok' : late ? 'tag-err' : ''}`}>{i.status}</span>}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

function TeamTab({ data, reload }) {
  const auth = useAuth();
  const toast = useToast();
  const admin = auth.can('divisao', 'edit');
  const { data: people } = useApi(admin ? '/users/directory' : null, [admin], { live: false });
  const fns = ['estrategia', 'copy', 'design', 'edicao', 'revisao', 'atendimento', 'agendamento'];
  const [members, setMembers] = useState([]);
  useEffect(() => { setMembers(data.team.filter((t) => t.function !== 'cliente').map((t) => ({ user_id: t.id, function: t.function }))); }, [data.team]);
  const [edit, setEdit] = useState(false);
  const save = async () => { try { await api.put(`/clients/${data.client.id}/team`, { members }); toast('Equipe atualizada — tarefas sem responsável foram atribuídas.'); setEdit(false); reload(); } catch (e) { toast(e.message, 'err'); } };
  const clientUsers = data.team.filter((t) => t.function === 'cliente');
  return (
    <div>
      <p className="sm muted" style={{ marginTop: 0 }}>A equipe por função define quem recebe cada tarefa automaticamente. Função sem pessoa = tarefa sem responsável (pendência crítica).</p>
      {fns.map((fn) => {
        const list = data.team.filter((t) => t.function === fn);
        return (
          <div key={fn} className="brain-sec">
            <div className="caps">{FUNCTIONS[fn]}</div>
            {edit ? (
              <div className="row wrap gap-2">
                {(people || []).map((p) => {
                  const on = members.some((m) => m.user_id === p.id && m.function === fn);
                  return <button key={p.id} type="button" className={`tag ${on ? 'tag-bordo' : ''}`} style={{ cursor: 'pointer', background: on ? undefined : 'none' }} aria-pressed={on}
                    onClick={() => setMembers(on ? members.filter((m) => !(m.user_id === p.id && m.function === fn)) : [...members, { user_id: p.id, function: fn }])}>{p.name}</button>;
                })}
              </div>
            ) : list.length ? <div className="row wrap gap-4">{list.map((t) => <span key={t.id} className="row gap-2 sm"><Avatar name={t.name} />{t.name}</span>)}</div>
              : <span className="sm" style={{ color: ['estrategia', 'design', 'edicao'].includes(fn) ? 'var(--err)' : 'var(--faint)' }}>{['estrategia', 'design', 'edicao'].includes(fn) ? 'Ninguém vinculado — tarefas ficarão sem responsável' : 'Usa a regra padrão'}</span>}
          </div>
        );
      })}
      <div className="brain-sec"><div className="caps">Acesso do cliente</div><div className="sm">{clientUsers.length ? clientUsers.map((u) => u.name).join(', ') : 'Nenhum usuário cliente — crie em Usuários.'}</div></div>
      {admin && <div className="row end mt-5">{edit ? <><Button variant="ghost" onClick={() => setEdit(false)}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar equipe</Button></> : <Button onClick={() => setEdit(true)} icon={<I.edit size={14} />}>Editar equipe</Button>}</div>}
    </div>
  );
}

function FinanceTab({ finance }) {
  return (
    <div>
      <div className="section-head"><h3 className="ed-md">Contratos</h3></div>
      {!finance.contracts.length ? <Empty title="Sem contratos." /> : finance.contracts.map((k) => <div key={k.id} className="task-row"><span className="grow">{k.service}</span><span className="num" style={{ fontSize: 22 }}>{money(k.monthly_value)}</span><span className="xs muted">/mês · desde {fmtDate(k.starts_at)} · vence dia {k.due_day}</span><span className="tag">{k.status}</span></div>)}
      <div className="section-head mt-6"><h3 className="ed-md">Parcelas</h3></div>
      <div className="table-wrap"><table className="table"><thead><tr><th>Descrição</th><th>Vencimento</th><th>Valor</th><th>Status</th></tr></thead><tbody>
        {finance.invoices.map((i) => <tr key={i.id}><td>{i.description}</td><td>{fmtDate(i.due_at)}</td><td>{money(i.amount)}</td><td><span className={`tag ${i.status === 'paga' ? 'tag-ok' : i.status === 'atrasada' ? 'tag-err' : ''}`}>{i.status}</span></td></tr>)}
      </tbody></table></div>
    </div>
  );
}

// Status do cliente (carteira): só a CEO ou quem ela liberar
const CLIENT_STATUS = { onboarding: 'Onboarding', ativo: 'Ativo', pausado: 'Pausado', encerrado: 'Encerrado', a_confirmar: 'Status a confirmar' };
function StatusControl({ c, reload }) {
  const toast = useToast();
  const change = async (status) => {
    if (status === 'encerrado' && !window.confirm(`Encerrar ${cleanName(c.name)}? O cliente sai da operação (painéis, pendências e quadro do mês), mas a ficha e o histórico ficam guardados.`)) return;
    try { await api.patch(`/clients/${c.id}`, { status }); toast(`Status: ${CLIENT_STATUS[status]}.`); reload(); } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <select className={`select status-select s-${c.status}`} value={c.status} onChange={(e) => change(e.target.value)} aria-label="Status do cliente">
      {Object.entries(CLIENT_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

// Excluir cliente (definitivo): só a CEO ou quem ela liberar; confirma digitando o nome
function DeleteClient({ c }) {
  const toast = useToast();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/clients/${c.id}/excluir`, { confirm: typed });
      toast(`${cleanName(c.name)} excluído (${r.conteudos} conteúdos, ${r.tarefas} tarefas).`);
      nav('/clientes', { replace: true });
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  };
  return (
    <>
      <Button variant="ghost" className="btn-danger" onClick={() => { setTyped(''); setOpen(true); }}>Excluir cliente</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Excluir cliente"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button className="btn-danger" disabled={busy || typed.trim() !== c.name.trim()} onClick={go}>Excluir definitivamente</Button></>}>
        <div className="col gap-4">
          <p className="sm" style={{ margin: 0 }}>Isso apaga de vez a ficha, os conteúdos, as tarefas, os ciclos, as reuniões, a conversa, os arquivos e os acessos de cliente de <b>{cleanName(c.name)}</b>. Não dá para desfazer. Fica só a linha de auditoria “cliente excluído”, com quem fez e quando.</p>
          <p className="sm muted" style={{ margin: 0 }}>Se a ideia é só tirar da operação, use o status <b>Encerrado</b>: tudo fica guardado.</p>
          <Field label={`Para confirmar, digite: ${c.name}`}><input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></Field>
        </div>
      </Modal>
    </>
  );
}
