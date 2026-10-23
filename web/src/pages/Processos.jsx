import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi, useAuth, useToast } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { MoveStageModal } from '../components/MoveStage.jsx';
import { useCrumbs } from '../components/Shell.jsx';
import { Drawer, ErrorBox, Loading } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { ago, initials, cleanName, fmtMonth } from '../lib/format.js';
import { FUNCTIONS, FORMATS, RISK } from '../lib/status.js';
import '../styles/production.css';
import '../styles/board.css';

const FILTER_KEYS = ['month', 'client_id', 'assignee_id', 'stage', 'format', 'risk', 'priority', 'due', 'q'];
// Cores de etiqueta por cliente — tons sóbrios derivados da paleta The Bold (como os labels do Jira)
const LABEL_TONES = ['#45131D', '#1F3A4D', '#3E6A4E', '#8A5A1E', '#5B2A55', '#2F5F63', '#7A3B2E', '#3B3734'];
const toneOf = (id = '') => LABEL_TONES[[...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % LABEL_TONES.length];
const PRIO_ICON = { critica: '⏶⏶', alta: '⏶', media: '=', baixa: '⏷' };
// CLASSIFICAÇÃO = o tipo de trabalho do card, só a partir de dados reais: a raia da etapa no Process Engine (LANES)
// e, na produção, a função da trilha (design, edição, legenda). Nada é recategorizado: é leitura do que já existe.
// Marca + nome sempre visíveis (não depende só de cor).
const CLASS = {
  estrategia: { label: 'Estrategista', mark: '◎' }, design: { label: 'Design', mark: '◆' }, edicao: { label: 'Edição', mark: '▶' }, copy: { label: 'Legenda', mark: '¶' },
  producao: { label: 'Produção', mark: '◇' }, revisao: { label: 'Revisão', mark: '✓' }, ajuste: { label: 'Ajuste', mark: '↺' }, cliente: { label: 'Aprovação', mark: '○' },
  bloqueio: { label: 'Bloqueado', mark: '■' }, publicacao: { label: 'Publicação', mark: '↗' },
};
const LANE_CLASS = { estrategia: 'estrategia', revisao: 'revisao', ajuste: 'ajuste', cliente: 'cliente', producao: 'producao', agendamento: 'publicacao', publicacao: 'publicacao' };
const cardClasses = (c) => {
  if (c.blocked) return ['bloqueio'];
  if (c.stage === 'producao') { const f = [...new Set((c.tracks || []).map((t) => t.fn))].filter((x) => CLASS[x]); return f.length ? f : ['producao']; }
  return [LANE_CLASS[c.lane] || 'producao'];
};
const laneClass = (lane) => lane.cls || LANE_CLASS[lane.key] || 'producao';
function ClassTag({ k, big }) {
  const c = CLASS[k] || { label: k, mark: '·' };
  return <span className={`jb-cls cls-${k} ${big ? 'big' : ''}`}><i aria-hidden>{c.mark}</i>{c.label}</span>;
}

export default function Processos() {
  useCrumbs('Processos', 'Quadro');
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [howOpen, setHowOpen] = useState(false);
  const [actOpen, setActOpen] = useState(false);
  const [group, setGroup] = useState(params.get('group') || 'none');
  // Visão "Equipe" = o quadro do Notion: uma coluna por pessoa e função (Design Felipe, Edição de vídeo Léo, Legenda Juliane…)
  const view = params.get('visao') || 'equipe';
  // Como no Notion: um cartão por cliente com as demandas dentro (menos cards na fila). "demandas" volta ao card por conteúdo.
  const byClient = params.get('cards') !== 'demandas';
  const qs = new URLSearchParams();
  FILTER_KEYS.forEach((k) => params.get(k) && qs.set(k, params.get(k)));
  const { data, error, loading, reload } = useApi(`/process/board?${qs}`, []);
  const auth = useAuth();
  const canMove = auth.can('processos', 'edit');
  const [moving, setMoving] = useState(null); // { content, targets }
  const prevLane = useRef(new Map());
  const [moved, setMoved] = useState(new Set());

  // Destaca cards que o Process Engine moveu de coluna desde a última recarga
  useEffect(() => {
    if (!data) return;
    const changed = new Set(); const next = new Map();
    data.lanes.forEach((l) => l.cards.forEach((c) => { next.set(c.id, l.key); const p = prevLane.current.get(c.id); if (p && p !== l.key) changed.add(c.id); }));
    prevLane.current = next;
    if (changed.size) { setMoved(changed); const t = setTimeout(() => setMoved(new Set()), 1800); return () => clearTimeout(t); }
  }, [data]);
  useEffect(() => { const t = setTimeout(() => setFilter('q', q.trim()), 300); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const setFilter = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };
  const active = FILTER_KEYS.some((k) => params.get(k)) || !!params.get('classe');

  // Pessoas com cards no quadro (pilha de avatares como no Jira)
  const people = useMemo(() => {
    if (!data) return [];
    const m = new Map();
    data.lanes.forEach((l) => l.cards.forEach((c) => { if (c.owner_id && !m.has(c.owner_id)) m.set(c.owner_id, c.owner); }));
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [data]);
  const unassigned = data?.lanes.some((l) => l.cards.some((c) => c.owner === 'SEM RESPONSÁVEL'));

  // Raias horizontais (swimlanes): nenhuma | cliente | responsável
  const swimlanes = useMemo(() => {
    if (!data) return [];
    const base = view === 'equipe' ? teamLanes(data) : data.lanes;
    const cls = params.get('classe');
    const byCls = !cls ? base : view === 'equipe' ? base.filter((l) => laneClass(l) === cls) : base.map((l) => ({ ...l, cards: l.cards.filter((c) => cardClasses(c).includes(cls)) }));
    if (group === 'none') return [{ key: 'all', label: null, lanes: byCls }];
    const keyOf = (c) => (group === 'client' ? c.client : group === 'format' ? FORMATS[c.format] || c.format : c.owner || 'Sem tarefa aberta');
    const keys = [...new Set(byCls.flatMap((l) => l.cards.map(keyOf)))].sort();
    return keys.map((k) => ({ key: k, label: k, lanes: byCls.map((l) => ({ ...l, cards: l.cards.filter((c) => keyOf(c) === k) })) }));
  }, [data, group, view, params]);
  // Classificações presentes no quadro, com a contagem real de cards
  const classCounts = useMemo(() => {
    if (!data) return [];
    const m = new Map();
    if (view === 'equipe') teamLanes(data).forEach((l) => { const k = laneClass(l); m.set(k, (m.get(k) || 0) + l.cards.length); });
    else data.lanes.forEach((l) => l.cards.forEach((c) => cardClasses(c).forEach((k) => m.set(k, (m.get(k) || 0) + 1))));
    return Object.keys(CLASS).filter((k) => m.has(k)).map((k) => ({ k, n: m.get(k) }));
  }, [data, view]);

  return (
    <div className="jb">
      <div className="jb-head">
        <div className="jb-crumb"><span>Processos</span><span>/</span><span>Operação The Bold</span></div>
        <div className="jb-titlebar">
          <h1>Quadro</h1>
          <div className="row gap-2">
            <button className="jb-btn" onClick={() => setActOpen(true)}><I.history size={15} /> Atividade</button>
            <button className="jb-btn" onClick={() => setHowOpen(true)}><I.flow size={15} /> Como funciona</button>
            <Link to="/conteudos/novo" className="jb-btn jb-btn-primary"><I.plus size={15} /> Criar</Link>
          </div>
        </div>
        <div className="jb-toolbar">
          <div className="jb-view" role="group" aria-label="Visão do quadro">
            <button className={view === 'equipe' ? 'on' : ''} aria-pressed={view === 'equipe'} onClick={() => setFilter('visao', '')} title="Uma coluna por pessoa, como no Notion">Equipe</button>
            <button className={view === 'etapas' ? 'on' : ''} aria-pressed={view === 'etapas'} onClick={() => setFilter('visao', 'etapas')} title="Uma coluna por fase do processo">Etapas</button>
          </div>
          <div className="jb-view" role="group" aria-label="Cartões">
            <button className={byClient ? 'on' : ''} aria-pressed={byClient} onClick={() => setFilter('cards', '')} title="Um cartão por cliente, com as demandas dentro (como no Notion)">Por cliente</button>
            <button className={!byClient ? 'on' : ''} aria-pressed={!byClient} onClick={() => setFilter('cards', 'demandas')} title="Um cartão por conteúdo">Por demanda</button>
          </div>
          <label className="jb-search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar no quadro" aria-label="Pesquisar" /><I.search size={16} /></label>
          <div className="jb-avatars" role="group" aria-label="Filtrar por responsável">
            {people.slice(0, 8).map((p) => (
              <button key={p.id} className={`jb-av ${params.get('assignee_id') === p.id ? 'on' : ''}`} title={p.name} style={{ background: toneOf(p.id) }}
                onClick={() => setFilter('assignee_id', params.get('assignee_id') === p.id ? '' : p.id)}>{initials(p.name)}</button>
            ))}
            {unassigned && <button className={`jb-av jb-av-none ${params.get('assignee_id') === 'none' ? 'on' : ''}`} title="Sem responsável" onClick={() => setFilter('assignee_id', params.get('assignee_id') === 'none' ? '' : 'none')}>?</button>}
          </div>
          {data?.filters.months?.length > 0 && (
            <select className="jb-select" value={params.get('month') || ''} onChange={(e) => setFilter('month', e.target.value)} aria-label="Mês do ciclo">
              <option value="">Todos os meses</option>{data.filters.months.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
            </select>
          )}
          <select className="jb-select" value={params.get('client_id') || ''} onChange={(e) => setFilter('client_id', e.target.value)} aria-label="Cliente">
            <option value="">Cliente</option>{data?.filters.clients.map((c) => <option key={c.id} value={c.id}>{cleanName(c.name)}</option>)}
          </select>
          {classCounts.length > 1 && (
            <select className="jb-select" value={params.get('classe') || ''} onChange={(e) => setFilter('classe', e.target.value)} aria-label="Classificação">
              <option value="">Classificação</option>{classCounts.map(({ k, n }) => <option key={k} value={k}>{CLASS[k].label} · {n}</option>)}
            </select>
          )}
          {data?.filters.formats?.length > 1 && (
            <select className="jb-select" value={params.get('format') || ''} onChange={(e) => setFilter('format', e.target.value)} aria-label="Tipo de entrega">
              <option value="">Tipo</option>{data.filters.formats.map((f) => <option key={f} value={f}>{FORMATS[f] || f}</option>)}
            </select>
          )}
          <select className="jb-select" value={params.get('due') || ''} onChange={(e) => setFilter('due', e.target.value)} aria-label="Prazo">
            <option value="">Prazo</option><option value="atrasado">Atrasados</option><option value="hoje">Vencem hoje</option><option value="semana">Próximos 7 dias</option>
          </select>
          <select className="jb-select" value={params.get('risk') || ''} onChange={(e) => setFilter('risk', e.target.value)} aria-label="Risco">
            <option value="">Risco</option>{['critico', 'alto', 'medio', 'baixo'].map((r) => <option key={r} value={r}>{RISK[r]}</option>)}
          </select>
          <select className="jb-select" value={params.get('priority') || ''} onChange={(e) => setFilter('priority', e.target.value)} aria-label="Prioridade">
            <option value="">Prioridade</option><option value="critica">Crítica</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
          </select>
          {active && <button className="jb-link" onClick={() => { setQ(''); setParams({}, { replace: true }); }}>Limpar filtros</button>}
          <div className="jb-group">
            <span>Agrupar por</span>
            <select className="jb-select" value={group} onChange={(e) => { setGroup(e.target.value); setFilter('group', e.target.value === 'none' ? '' : e.target.value); }} aria-label="Agrupar por">
              <option value="none">Nenhum</option><option value="client">Cliente</option><option value="format">Tipo de entrega</option><option value="owner">Responsável</option>
            </select>
          </div>
        </div>
        <div className="jb-auto"><span className="jb-pulse" aria-hidden />Automático: os cards mudam de coluna sozinhos quando a etapa é concluída. Se precisar, arraste o card: o sistema mostra o impacto, pede o motivo quando é relevante e avisa os responsáveis.</div>
      </div>

      <ErrorBox error={error} />
      {loading && !data ? <div style={{ padding: 24 }}><Loading rows={6} /></div> : data && (
        <div className="jb-scroll">
          {swimlanes.map((sw) => (
            <div key={sw.key} className="jb-swim">
              {sw.label && <div className="jb-swim-head"><span className="jb-label" style={{ background: toneOf(sw.label) }}>{cleanName(sw.label)}</span><span className="jb-swim-count">{sw.lanes.reduce((n, l) => n + l.cards.length, 0)} itens{group === 'client' ? ` · ${byFormat(sw.lanes)}` : ''}</span></div>}
              <div className="jb-board">
                {sw.lanes.map((lane) => <Column key={lane.key} lane={lane} byClient={byClient} reload={reload} progress={data.progress} people={data.filters.people} teamView={view === 'equipe'} moved={moved} showHead={sw === swimlanes[0] || !!sw.label} onDropCard={canMove ? (card) => setMoving({ content: card, targets: lane.targets || (lane.stages || []).map((x) => x.key) }) : null} />)}
              </div>
            </div>
          ))}
        </div>
      )}
      <MoveStageModal open={!!moving} content={moving?.content} contents={moving?.content?.bulk} targets={moving?.targets?.length ? moving.targets.filter((k) => k !== moving.content.stage) : null}
        initialTo={moving?.targets?.filter((k) => k !== moving.content.stage).length === 1 ? moving.targets.filter((k) => k !== moving.content.stage)[0] : ''}
        onClose={() => setMoving(null)} onDone={() => { setMoving(null); reload(); }} />
      <HowItWorks open={howOpen} onClose={() => setHowOpen(false)} />
      <Drawer open={actOpen} onClose={() => setActOpen(false)} title="Atividade" kicker="Movimentos do Process Engine">
        <ol className="list">{(data?.recent || []).map((r, i) => (
          <li key={i} style={{ alignItems: 'flex-start' }}><span className="xs faint" style={{ width: 70, flex: 'none' }}>{ago(r.created_at)}</span>
            <span className="sm">{r.content_id ? <Link to={`/conteudos/${r.content_id}`}>{r.summary}</Link> : r.summary}</span></li>
        ))}</ol>
      </Drawer>
    </div>
  );
}

// Visão Equipe: as colunas do quadro do Notion, em ordem de fluxo. A produção vira uma coluna por pessoa e função
// (fixa para quem tem a função, mesmo vazia — como no Notion); bloqueados ficam em "Pendente por material".
const TRACK_LABEL = { design: 'Design', edicao: 'Edição de vídeo', copy: 'Legenda' };
function teamLanes(data) {
  const all = data.lanes.flatMap((l) => l.cards);
  const col = (key, label, stages, cls, filter) => ({ key, label, cls, stages: [], targets: stages, cards: all.filter((c) => !c.blocked && stages.includes(c.stage) && (!filter || filter(c))) });
  const people = data.filters.people || [];
  const prod = all.filter((c) => !c.blocked && c.stage === 'producao');
  const personCols = [];
  for (const fn of ['design', 'edicao', 'copy']) {
    const holders = people.filter((p) => p.functions?.includes(fn) || prod.some((c) => c.tracks?.some((t) => t.fn === fn && t.assignee_id === p.id)));
    for (const p of holders) personCols.push({ key: `p:${fn}:${p.id}`, label: TRACK_LABEL[fn], cls: fn, person: { id: p.id, name: p.name }, fn, stages: [], targets: ['producao'], cards: prod.filter((c) => c.tracks?.some((t) => t.fn === fn && t.assignee_id === p.id)) });
    const orphan = prod.filter((c) => c.tracks?.some((t) => t.fn === fn && !t.assignee_id));
    if (orphan.length) personCols.push({ key: `p:${fn}:none`, label: TRACK_LABEL[fn], cls: fn, person: { id: null, name: 'Sem responsável' }, fn, stages: [], targets: ['producao'], cards: orphan });
  }
  return [
    col('cronograma', 'Cronograma', ['cronograma', 'ajuste_cronograma'], 'estrategia'),
    col('analise_cronograma', 'Análise cronograma', ['analise_cronograma'], 'revisao'),
    col('aprovacao_tema', 'Temas com o cliente', ['aprovacao_tema'], 'cliente'),
    ...personCols,
    col('analise_producao', 'Análise produção', ['analise_producao'], 'revisao'),
    col('ajustes', 'Ajustes', ['ajuste_interno', 'revisao_ajuste'], 'ajuste'),
    { key: 'pendente', label: 'Pendente por material', cls: 'bloqueio', stages: [], cards: all.filter((c) => c.blocked) },
    col('aprovacao_cliente', 'Aprovação dos clientes', ['aprovacao_cliente', 'ajuste_cliente'], 'cliente'),
    col('agendamento', 'Liberado para publicação', ['agendamento'], 'publicacao'),
    col('agendado', 'Agendado', ['agendado'], 'publicacao'),
    { ...col('publicado', 'Publicado', ['publicado'], 'publicacao'), key: 'publicacao' },
  ];
}

function Column({ lane, moved, showHead, onDropCard, teamView, byClient, reload, progress, people }) {
  const cls = laneClass(lane);
  const sub = lane.label && lane.label.toLowerCase() !== (CLASS[cls]?.label || '').toLowerCase() && lane.label !== 'Edição de vídeo' ? lane.label : null;
  const [over, setOver] = useState(false);
  const droppable = !!onDropCard && (lane.targets || lane.stages || []).length > 0;
  const dropProps = droppable ? {
    onDragOver: (e) => { if (e.dataTransfer.types.includes('application/x-bold-card')) { e.preventDefault(); setOver(true); } },
    onDragLeave: () => setOver(false),
    onDrop: (e) => { e.preventDefault(); setOver(false); try { const card = JSON.parse(e.dataTransfer.getData('application/x-bold-card')); onDropCard(card); } catch { /* arraste inválido */ } },
  } : {};
  const counts = Object.fromEntries((lane.stages || []).map((s) => [s.key, lane.cards.filter((c) => c.stage === s.key).length]));
  return (
    <section className={`jb-col ${!lane.cards.length && !lane.person ? 'jb-col-min' : ''} ${over ? 'drop-over' : ''}`} aria-label={`${CLASS[cls]?.label || ''} ${lane.person?.name || lane.label}`} {...dropProps}>
      {showHead && (
        <div className={`jb-col-head cls-${cls}`}>
          <div className="jb-col-cls"><ClassTag k={cls} big />{lane.key === 'publicacao' && <I.check size={14} className="jb-done" />}</div>
          {sub && <div className="jb-col-title">{sub}</div>}
          <div className="jb-col-n"><b>{lane.cards.length}</b> {lane.cards.length === 1 ? 'conteúdo' : 'conteúdos'}{byClient && lane.cards.length > 0 && <> · {pl(new Set(lane.cards.map((c) => c.client_id)).size, 'cliente', 'clientes')}</>}</div>
          {lane.person && <div className="jb-col-who"><span className="jb-av sm" style={lane.person.id ? { background: toneOf(lane.person.id) } : undefined}>{lane.person.id ? initials(lane.person.name) : '?'}</span>{lane.person.name}</div>}
          {(lane.stages || []).length > 1 && <div className="jb-col-sub">{lane.stages.map((s) => <span key={s.key}>{s.label} · {counts[s.key]}</span>)}</div>}
        </div>
      )}
      <div className="jb-col-body">
        {byClient
          ? groupByClient(lane.cards).map((g) => <ClientCard key={g.client_id} g={g} lane={lane} moved={moved} reload={reload} progress={progress?.[g.client_id]} people={people} draggable={!!onDropCard} />)
          : lane.cards.map((c) => <Card key={c.id} c={c} classes={teamView ? [cls] : cardClasses(c)} moved={moved.has(c.id)} draggable={!!onDropCard} track={lane.fn ? c.tracks?.find((t) => t.fn === lane.fn && (t.assignee_id || null) === (lane.person?.id || null)) : null} />)}
        {!lane.cards.length && lane.person && <div className="jb-col-empty">Nada com {lane.person.id ? lane.person.name.split(' ')[0] : 'ninguém'} agora</div>}
      </div>
    </section>
  );
}

// Quantidade por tipo de entrega (o "☐ 4 reels ☐ 4 carrosséis" dos cards do Notion, agora contado de verdade)
function byFormat(lanes) {
  const m = {};
  for (const l of lanes) for (const c of l.cards) m[c.format] = (m[c.format] || 0) + 1;
  const PL = { carrossel: 'carrosséis', reel: 'reels', estatico: 'estáticos', foto: 'fotos', video: 'vídeos', stories: 'stories' };
  return Object.entries(m).map(([f, n]) => `${n} ${n === 1 ? (FORMATS[f] || f).toLowerCase() : PL[f] || f}`).join(' · ');
}

const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function groupByClient(cards) {
  const m = new Map();
  for (const c of cards) (m.get(c.client_id) || m.set(c.client_id, { client_id: c.client_id, client: c.client, restricted: c.restricted, items: [] }).get(c.client_id)).items.push(c);
  return [...m.values()].sort((a, b) => (a.client || '').localeCompare(b.client || ''));
}

// CARTÃO DO CLIENTE — no quadro fica só o resumo (cliente, quantidade, progresso). As demandas ficam DENTRO dele:
// ao clicar, abre o cartão com a lista para dar o check. Check = concluir: o Process Engine manda para a próxima etapa
// e avisa o próximo responsável. Cada demanda aceita comentário interno com @menção.
function ClientCard({ g, lane, moved, reload, progress, people, draggable }) {
  const [open, setOpen] = useState(false);
  // arrastar o cartão do cliente para outra coluna = mover todas as demandas dele (abre “Mover etapa”, nada muda sem confirmar)
  const drag = draggable && !g.restricted ? { draggable: true, onDragStart: (e) => { const f = g.items[0]; e.dataTransfer.setData('application/x-bold-card', JSON.stringify({ id: f.id, number: f.number, title: f.title, stage: f.stage, client: cleanName(g.client || ''), bulk: g.items.map((c) => ({ id: c.id, number: c.number, title: c.title, stage: c.stage })) })); e.dataTransfer.effectAllowed = 'move'; } } : {};
  const formats = byFormat([{ cards: g.items }]);
  const late = g.items.filter((c) => c.due_at && new Date(c.due_at) < new Date()).length;
  const blocked = g.items.filter((c) => c.blocked).length;
  const key = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setOpen(true); } };
  return (
    <>
      <article className={`jb-cc ${g.items.some((c) => moved.has(c.id)) ? 'moved' : ''}`} style={{ '--tone': toneOf(g.client_id) }} role="button" tabIndex={0} onClick={() => setOpen(true)} onKeyDown={key} aria-label={`${cleanName(g.client || '')}: ${pl(g.items.length, 'demanda', 'demandas')}. Abrir`} {...drag}>
        <header className="jb-cc-h">
          <span className="jb-cc-name">{cleanName(g.client || '')}</span>
          <span className="jb-cc-n" title={pl(g.items.length, 'demanda', 'demandas')}>{g.items.length}</span>
        </header>
        <div className="jb-cc-sub">{formats}{late ? <b className="late"> · {pl(late, 'atrasada', 'atrasadas')}</b> : null}{blocked ? <b className="late"> · {blocked} aguardando material</b> : null}</div>
        {progress?.total > 0 && (
          <div className="jb-cc-prog" title={`${progress.done} de ${progress.total} conteúdos do mês liberados para publicação ou publicados`}>
            <span className="jb-cc-bar" aria-hidden><span style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} /></span>
            <small>{progress.done} de {progress.total} prontos</small>
          </div>
        )}
        <span className="jb-cc-open">Abrir demandas →</span>
      </article>
      {open && (
        <Drawer open onClose={() => setOpen(false)} title={cleanName(g.client || '')} kicker={`${lane.person ? `${lane.label} · ${lane.person.name}` : lane.label} · ${pl(g.items.length, 'demanda', 'demandas')}`} wide>
          <ClientDemands g={g} lane={lane} reload={reload} people={people} />
        </Drawer>
      )}
    </>
  );
}

function ClientDemands({ g, lane, reload, people = [] }) {
  const auth = useAuth();
  const [moving, setMoving] = useState(null);
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [when, setWhen] = useState({});
  const [note, setNote] = useState({}); // comentário aberto por demanda
  const run = async (key, fn, ok) => { setBusy(key); try { await fn(); toast(ok); reload(); } catch (e) { toast(e.message, 'err'); } finally { setBusy(null); } };
  const canApprove = auth.can('conteudos', 'approve');
  const trackOf = (c) => (lane.fn ? c.tracks?.find((t) => t.fn === lane.fn && (t.assignee_id || null) === (lane.person?.id || null)) : c.tracks?.find((t) => ['etapa', 'ajuste'].includes(t.kind) && t.fn !== 'revisao') || null);
  const CHECKABLE = ['producao', 'ajuste_interno', 'ajuste_cliente', 'cronograma', 'ajuste_cronograma'];
  const ready = g.items.map((c) => [c, trackOf(c)]).filter(([c, tr]) => !c.restricted && !c.blocked && tr && (tr.assignee_id === auth.user.id || canApprove) && CHECKABLE.includes(c.stage)
    && !(c.stage === 'producao' && ((tr.track === 'visual' && !c.has_media) || (tr.track === 'legenda' && !c.has_caption))));
  const completeAll = () => run('all', async () => { let ok = 0; const fails = []; for (const [c, tr] of ready) { try { await api.post(`/tasks/${tr.task_id}/complete`); ok++; } catch (e) { fails.push(`${c.title}: ${e.message}`); } } if (fails.length) throw new Error(`${ok} concluída(s). Não deu em ${fails.length}: ${fails[0]}`); }, `${pl(ready.length, 'demanda concluída', 'demandas concluídas')}. Os próximos responsáveis foram avisados.`);
  const reviewCol = ['analise_producao', 'analise_cronograma'].some((s) => (lane.targets || lane.stages?.map((x) => x.key) || []).includes(s));
  const sendNote = (c) => run(`n:${c.id}`, async () => { await api.post(`/contents/${c.id}/comments`, { body: note[c.id], visibility: 'internal' }); setNote((n) => { const x = { ...n }; delete x[c.id]; return x; }); }, 'Comentário enviado. Quem foi mencionado recebe a notificação.');
  const mention = (c, name) => setNote((n) => ({ ...n, [c.id]: `${(n[c.id] || '').replace(/\s*$/, '')}${n[c.id] ? ' ' : ''}@${name.split(' ')[0]} ` }));
  return (
    <div className="jb-dm">
      <div className="row between wrap gap-2">
        {!g.restricted ? <Link className="link sm" to={`/clientes/${g.client_id}`}>Abrir a ficha do cliente ↗</Link> : <span />}
        {ready.length > 1 && <button className="jb-cc-all" disabled={busy === 'all'} onClick={completeAll}>✓ Concluir todas ({ready.length})</button>}
      </div>
      <p className="xs muted">Dar o check conclui a sua parte: o conteúdo segue para a próxima etapa e o próximo responsável recebe a notificação. Para chamar alguém sem concluir, use o comentário com @nome.</p>
      <ul className="jb-dm-list">
        {g.items.map((c) => {
          const tr = trackOf(c);
          const mine = tr && (tr.assignee_id === auth.user.id || canApprove);
          const needsFile = tr?.track === 'visual' && !c.has_media && c.stage === 'producao';
          const needsCaption = tr?.track === 'legenda' && !c.has_caption && c.stage === 'producao';
          const due = tr?.due_at || c.due_at;
          const overdue = due && new Date(due) < new Date();
          const doable = !c.restricted && !c.blocked && tr && mine && CHECKABLE.includes(c.stage);
          const canCheck = doable && !needsFile && !needsCaption;
          return (
            <li key={c.id} className={c.blocked ? 'blocked' : ''}>
              <button type="button" className={`jb-dm-check ${canCheck ? '' : 'off'}`} disabled={!canCheck || busy === c.id} aria-label={canCheck ? `Concluir ${c.title}` : 'Sem ação sua nesta demanda agora'}
                title={canCheck ? 'Concluir e enviar para a próxima etapa' : needsFile ? 'Envie o arquivo antes de concluir' : needsCaption ? 'Escreva a legenda antes de concluir' : c.blocked ? 'Bloqueado' : 'Não está com você agora'}
                onClick={() => run(c.id, () => api.post(`/tasks/${tr.task_id}/complete`), c.stage.startsWith('ajuste') ? 'Ajuste concluído. Quem pediu foi avisado.' : 'Concluído. O próximo responsável foi avisado.')} />
              <div className="jb-dm-body">
                <div className="jb-dm-top">
                  <span className={`jb-type t-${c.format}`} title={FORMATS[c.format]}>{FORMATS[c.format]?.[0]}</span>
                  {c.restricted ? <b>{c.title}</b> : <Link to={`/conteudos/${c.id}`} className="jb-dm-t">{c.title}</Link>}
                </div>
                <div className="jb-dm-meta">
                  {c.blocked ? <b className="late">■ {c.block_reason || 'Bloqueado'}</b> : <span>{c.stage_label}{tr?.name ? ` · com ${tr.name.split(' ')[0]}` : c.owner === 'SEM RESPONSÁVEL' ? ' · sem responsável' : ''}</span>}
                  {due && !c.blocked && <span className={overdue ? 'late' : ''}>prazo {new Date(due).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' }).replace('.', '')}</span>}
                  {c.planned_at && <span>publicação {new Date(c.planned_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' }).replace('.', '')}</span>}
                </div>
                <div className="jb-dm-acts">
                  {doable && needsFile && <Link className="jb-cc-btn ghost" to={`/conteudos/${c.id}`}>Enviar arquivo</Link>}
                  {doable && needsCaption && <Link className="jb-cc-btn ghost" to={`/conteudos/${c.id}`}>Escrever legenda</Link>}
                  {!c.restricted && c.stage === 'agendamento' && (when[c.id] != null ? (
                    <span className="jb-cc-when">
                      <input type="datetime-local" className="input" value={when[c.id]} onChange={(e) => setWhen((w) => ({ ...w, [c.id]: e.target.value }))} aria-label="Data e hora do agendamento" />
                      <button className="jb-cc-btn" disabled={!when[c.id] || busy === c.id} onClick={() => run(c.id, () => api.post(`/contents/${c.id}/schedule`, { at: new Date(when[c.id]).toISOString(), mode: 'externo' }), 'Marcado como agendado.')}>OK</button>
                    </span>
                  ) : (
                    <>
                      <button className="jb-cc-btn ghost" onClick={() => setWhen((w) => ({ ...w, [c.id]: '' }))} title="Agendado no Meta: informe data e hora">Agendado</button>
                      <button className="jb-cc-btn" disabled={busy === c.id} title="Já foi ao ar" onClick={() => run(c.id, async () => { await api.post(`/contents/${c.id}/schedule`, { at: new Date().toISOString(), mode: 'externo' }); await api.post(`/contents/${c.id}/published`, {}); }, 'Publicação registrada.')}>✓ Publicado</button>
                    </>
                  ))}
                  {!c.restricted && c.stage === 'agendado' && <button className="jb-cc-btn" disabled={busy === c.id} onClick={() => run(c.id, () => api.post(`/contents/${c.id}/published`, {}), 'Publicação registrada.')}>✓ Publicado</button>}
                  {!c.restricted && note[c.id] == null && <button className="jb-dm-link" onClick={() => setNote((n) => ({ ...n, [c.id]: '' }))}>Comentar / mencionar</button>}
                  {!c.restricted && auth.can('processos', 'edit') && <button className="jb-dm-link" onClick={() => setMoving(c)}>Mover etapa</button>}
                </div>
                {note[c.id] != null && (
                  <div className="jb-dm-note">
                    <textarea className="textarea" rows={2} autoFocus value={note[c.id]} onChange={(e) => setNote((n) => ({ ...n, [c.id]: e.target.value }))} placeholder="Comentário interno… use @nome para chamar alguém" aria-label="Comentário" />
                    <div className="jb-dm-people">{people.slice(0, 12).map((u) => <button key={u.id} type="button" onClick={() => mention(c, u.name)}>@{u.name.split(' ')[0]}</button>)}</div>
                    <div className="row gap-2">
                      <button className="jb-cc-btn" disabled={!note[c.id]?.trim() || busy === `n:${c.id}`} onClick={() => sendNote(c)}>Enviar</button>
                      <button className="jb-dm-link" onClick={() => setNote((n) => { const x = { ...n }; delete x[c.id]; return x; })}>Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <MoveStageModal open={!!moving} content={moving} onClose={() => setMoving(null)} onDone={() => { setMoving(null); reload(); }} />
      {reviewCol && !g.restricted && <Link className="btn btn-primary mt-4" to={`/revisao/${g.client_id}`}>Revisar {g.items.length > 1 ? `as ${g.items.length} demandas` : 'a demanda'} na Sala de Revisão</Link>}
    </div>
  );
}

function Card({ c, moved, track, draggable, classes = [] }) {
  // na coluna de uma pessoa, o card mostra o prazo e o responsável DAQUELA trilha
  const due = track ? track.due_at : c.due_at;
  const ownerName = track ? track.name : c.owner === 'SEM RESPONSÁVEL' ? null : c.owner;
  const ownerId = track ? track.assignee_id : c.owner_id;
  const overdue = due && new Date(due) < new Date();
  const none = track ? !track.assignee_id : c.owner === 'SEM RESPONSÁVEL';
  const body = (
    <>
      <div className="jb-card-cls">{classes.map((k) => <ClassTag key={k} k={k} />)}</div>
      <div className="jb-card-title">{c.title}</div>
      <div className="jb-card-labels">
        <span className="jb-label" style={{ background: toneOf(c.client_id) }}>{cleanName(c.client || '')}</span>
        {c.needs_material ? <span className="jb-matreq" title={c.block_reason || 'Aguardando material do cliente'}>Material do cliente</span>
          : c.blocked && <span className="jb-flag" title={c.block_reason}>■ Bloqueado</span>}
        {c.material_url && <button type="button" className="jb-mat" title={c.material_url} onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(c.material_url, '_blank', 'noopener'); }}>Material ↗</button>}
      </div>
      {c.blocked && <div className="jb-block">{c.block_reason}</div>}
      {c.opens_at && !c.blocked && <div className="jb-opens" title="Pronto para a próxima etapa; a etapa só abre nesta data (sem atraso até lá)">Pronto · etapa abre {new Date(c.opens_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })}</div>}
      <div className="jb-card-foot">
        <span className={`jb-type t-${c.format}`} title={FORMATS[c.format]}>{FORMATS[c.format]?.[0]}</span>
        <span className="jb-key">TB-{String(c.number).padStart(3, '0')}</span>
        {c.priority !== 'media' && <span className={`jb-prio p-${c.priority}`} title={`Prioridade ${c.priority}`}>{PRIO_ICON[c.priority]}</span>}
        {['critico', 'alto'].includes(c.risk) && <span className={`jb-risk r-${c.risk}`} title={c.risk_reasons?.join(' · ')}>!</span>}
        {due && <span className={`jb-due ${overdue ? 'late' : ''}`} title="Prazo">{new Date(due).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' }).replace('.', '')}</span>}
        <span className="grow" />
        {c.restricted ? <I.lock size={14} /> : (
          <span className="jb-owner" title={ownerName || (none ? 'Sem responsável' : 'Sem tarefa aberta')}>
            <span className={`jb-av sm ${none ? 'jb-av-none' : ''}`} style={none || !ownerId ? undefined : { background: toneOf(ownerId) }}>{none ? '?' : ownerName ? initials(ownerName) : '—'}</span>
            <span className="jb-owner-name">{none ? 'Sem responsável' : ownerName ? ownerName.split(' ')[0] : ''}</span>
          </span>
        )}
      </div>
      <div className="jb-card-meta">{c.stage_label} · {c.hours_in_stage < 24 ? `${c.hours_in_stage}h` : `${Math.floor(c.hours_in_stage / 24)}d`} nesta etapa</div>
    </>
  );
  const cls = `jb-card ${moved ? 'moved' : ''} ${c.restricted ? 'restricted' : ''} ${c.risk === 'critico' ? 'crit' : ''}`;
  // arrastar para outra coluna abre "Mover etapa" (com impacto e motivo); nada muda sem confirmação
  const drag = draggable && !c.restricted ? { draggable: true, onDragStart: (e) => { e.dataTransfer.setData('application/x-bold-card', JSON.stringify({ id: c.id, number: c.number, title: c.title, stage: c.stage })); e.dataTransfer.effectAllowed = 'move'; } } : {};
  return c.restricted ? <div className={cls} title="Detalhes restritos: você não está vinculado(a) a este cliente.">{body}</div> : <Link to={`/conteudos/${c.id}`} className={cls} data-cursor="ABRIR" {...drag}>{body}</Link>;
}

function HowItWorks({ open, onClose }) {
  const { data } = useApi(open ? '/process/definition' : null, [open], { live: false });
  return (
    <Drawer open={open} onClose={onClose} title="Como o processo funciona" kicker="Process Engine" wide>
      <p className="sm muted">Cada etapa tem uma função responsável, uma ação esperada e uma condição de saída. Quando a saída é cumprida, o sistema cria a próxima tarefa, atribui pela função, define o prazo pelo calendário operacional do ciclo e notifica — sem ninguém mover cards.</p>
      {!data ? <Loading /> : data.order.filter((k) => k !== 'cancelado').map((k, i) => {
        const s = data.stages[k];
        return (
          <div className="stage-def" key={k}>
            <div className="row"><span className="idx">{String(i + 1).padStart(2, '0')}</span><span className="ed-md">{s.label}</span>{s.client && <span className="tag tag-warn">cliente</span>}{s.review && <span className="tag tag-info">revisão</span>}</div>
            <dl>
              <dt>Função</dt><dd>{s.fn ? FUNCTIONS[s.fn] || s.fn : k === 'producao' ? 'Design ou edição (pelo formato) + copy' : k.startsWith('ajuste') ? 'Quem produziu (ou pessoa escolhida)' : '—'}</dd>
              {s.action && <><dt>Ação</dt><dd>{s.action}</dd></>}
              {s.exit && <><dt>Saída</dt><dd>{s.exit}</dd></>}
              {s.sla != null && <><dt>Prazo</dt><dd>Marco do ciclo{s.milestone ? ` (${s.milestone.replaceAll('_', ' ')})` : ''} ou {s.sla} dia(s) útil(eis)</dd></>}
            </dl>
          </div>
        );
      })}
      {data && (
        <div className="mt-5">
          <div className="caps mb-2">Regras atuais</div>
          <ul className="sm" style={{ paddingLeft: 18 }}>
            <li>Análise interna do cronograma: <b>{data.settings.analise_cronograma_ativa ? 'ativa' : 'desligada'}</b></li>
            <li>Ajuste interno feito: <b>{data.settings.revisar_apos_ajuste_interno ? 'volta para a revisão' : 'segue para a aprovação do cliente (quem pediu é avisado)'}</b></li>
            <li>Ajuste do cliente: a plataforma identifica pelo texto (design, vídeo, legenda, página) e envia a quem produziu; se não identificar, Rebeca/Vitória/Vivian encaminham</li>
            <li>Ajuste do cliente feito: <b>{data.settings.publicar_apos_ajuste_cliente ? 'segue para publicar (versão liberada pela equipe)' : data.settings.reenviar_cliente_apos_ajuste ? 'volta para o cliente aprovar' : 'conferência e liberação'}</b></li>
            <li>Lembrete de cartão parado na mesma etapa: depois de <b>{data.settings.lembrete_parado_dias} dias</b></li>
            <li>Régua de cobrança do cliente: {data.settings.followup_cliente_horas.join('h · ')}h</li>
          </ul>
        </div>
      )}
    </Drawer>
  );
}
