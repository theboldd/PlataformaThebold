import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Drawer, ErrorBox, Loading } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { ago, initials, cleanName, fmtMonth } from '../lib/format.js';
import { FUNCTIONS, FORMATS, RISK } from '../lib/status.js';
import '../styles/production.css';
import '../styles/board.css';

const FILTER_KEYS = ['month', 'client_id', 'assignee_id', 'stage', 'format', 'risk', 'priority', 'due', 'q'];
// Cores de etiqueta por cliente — tons sóbrios derivados da paleta The Bold (como os labels do Jira)
const LABEL_TONES = ['#4A1725', '#1F3A4D', '#3E6A4E', '#8A5A1E', '#5B2A55', '#2F5F63', '#7A3B2E', '#3B3734'];
const toneOf = (id = '') => LABEL_TONES[[...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % LABEL_TONES.length];
const PRIO_ICON = { critica: '⏶⏶', alta: '⏶', media: '=', baixa: '⏷' };

export default function Processos() {
  useCrumbs('Processos', 'Quadro');
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [howOpen, setHowOpen] = useState(false);
  const [actOpen, setActOpen] = useState(false);
  const [group, setGroup] = useState(params.get('group') || 'none');
  // Visão "Equipe" = o quadro do Notion: uma coluna por pessoa e função (Design Felipe, Edição de vídeo Léo, Legenda Juliane…)
  const view = params.get('visao') || 'equipe';
  const qs = new URLSearchParams();
  FILTER_KEYS.forEach((k) => params.get(k) && qs.set(k, params.get(k)));
  const { data, error, loading } = useApi(`/process/board?${qs}`, []);
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
  const active = FILTER_KEYS.some((k) => params.get(k));

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
    if (group === 'none') return [{ key: 'all', label: null, lanes: base }];
    const keyOf = (c) => (group === 'client' ? c.client : group === 'format' ? FORMATS[c.format] || c.format : c.owner || 'Sem tarefa aberta');
    const keys = [...new Set(base.flatMap((l) => l.cards.map(keyOf)))].sort();
    return keys.map((k) => ({ key: k, label: k, lanes: base.map((l) => ({ ...l, cards: l.cards.filter((c) => keyOf(c) === k) })) }));
  }, [data, group, view]);

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
        <div className="jb-auto"><span className="jb-pulse" aria-hidden />Automático: os cards mudam de coluna sozinhos quando a etapa é concluída. Ninguém precisa arrastar.</div>
      </div>

      <ErrorBox error={error} />
      {loading && !data ? <div style={{ padding: 24 }}><Loading rows={6} /></div> : data && (
        <div className="jb-scroll">
          {swimlanes.map((sw) => (
            <div key={sw.key} className="jb-swim">
              {sw.label && <div className="jb-swim-head"><span className="jb-label" style={{ background: toneOf(sw.label) }}>{cleanName(sw.label)}</span><span className="jb-swim-count">{sw.lanes.reduce((n, l) => n + l.cards.length, 0)} itens{group === 'client' ? ` · ${byFormat(sw.lanes)}` : ''}</span></div>}
              <div className="jb-board">
                {sw.lanes.map((lane) => <Column key={lane.key} lane={lane} moved={moved} showHead={sw === swimlanes[0] || !!sw.label} />)}
              </div>
            </div>
          ))}
        </div>
      )}
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
  const col = (key, label, stages, filter) => ({ key, label, stages: [], cards: all.filter((c) => !c.blocked && stages.includes(c.stage) && (!filter || filter(c))) });
  const people = data.filters.people || [];
  const prod = all.filter((c) => !c.blocked && c.stage === 'producao');
  const personCols = [];
  for (const fn of ['design', 'edicao', 'copy']) {
    const holders = people.filter((p) => p.functions?.includes(fn) || prod.some((c) => c.tracks?.some((t) => t.fn === fn && t.assignee_id === p.id)));
    for (const p of holders) personCols.push({ key: `p:${fn}:${p.id}`, label: TRACK_LABEL[fn], person: { id: p.id, name: p.name }, fn, stages: [], cards: prod.filter((c) => c.tracks?.some((t) => t.fn === fn && t.assignee_id === p.id)) });
    const orphan = prod.filter((c) => c.tracks?.some((t) => t.fn === fn && !t.assignee_id));
    if (orphan.length) personCols.push({ key: `p:${fn}:none`, label: TRACK_LABEL[fn], person: { id: null, name: 'Sem responsável' }, fn, stages: [], cards: orphan });
  }
  return [
    col('cronograma', 'Cronograma', ['cronograma', 'ajuste_cronograma']),
    col('analise_cronograma', 'Análise cronograma', ['analise_cronograma']),
    col('aprovacao_tema', 'Temas com o cliente', ['aprovacao_tema']),
    ...personCols,
    col('analise_producao', 'Análise produção', ['analise_producao']),
    col('ajustes', 'Ajustes', ['ajuste_interno', 'revisao_ajuste']),
    { key: 'pendente', label: 'Pendente por material', stages: [], cards: all.filter((c) => c.blocked) },
    col('aprovacao_cliente', 'Aprovação dos clientes', ['aprovacao_cliente', 'ajuste_cliente']),
    col('agendamento', 'Para agendamento', ['agendamento']),
    col('agendado', 'Agendado', ['agendado']),
    { ...col('publicado', 'Publicado', ['publicado']), key: 'publicacao' },
  ];
}

function Column({ lane, moved, showHead }) {
  const counts = Object.fromEntries((lane.stages || []).map((s) => [s.key, lane.cards.filter((c) => c.stage === s.key).length]));
  return (
    <section className={`jb-col ${!lane.cards.length && !lane.person ? 'jb-col-min' : ''}`} aria-label={lane.label}>
      {showHead && (
        <div className="jb-col-head">
          <span className="jb-col-title">{lane.label}</span><span className="jb-col-count">{lane.cards.length}</span>
          {lane.key === 'publicacao' && <I.check size={14} className="jb-done" />}
          {lane.person && <div className="jb-col-who"><span className="jb-av sm" style={lane.person.id ? { background: toneOf(lane.person.id) } : undefined}>{lane.person.id ? initials(lane.person.name) : '?'}</span>{lane.person.name}</div>}
          {(lane.stages || []).length > 1 && <div className="jb-col-sub">{lane.stages.map((s) => <span key={s.key}>{s.label} · {counts[s.key]}</span>)}</div>}
        </div>
      )}
      <div className="jb-col-body">
        {lane.cards.map((c) => <Card key={c.id} c={c} moved={moved.has(c.id)} track={lane.fn ? c.tracks?.find((t) => t.fn === lane.fn && (t.assignee_id || null) === (lane.person?.id || null)) : null} />)}
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

function Card({ c, moved, track }) {
  // na coluna de uma pessoa, o card mostra o prazo e o responsável DAQUELA trilha
  const due = track ? track.due_at : c.due_at;
  const ownerName = track ? track.name : c.owner === 'SEM RESPONSÁVEL' ? null : c.owner;
  const ownerId = track ? track.assignee_id : c.owner_id;
  const overdue = due && new Date(due) < new Date();
  const none = track ? !track.assignee_id : c.owner === 'SEM RESPONSÁVEL';
  const body = (
    <>
      <div className="jb-card-title">{c.title}</div>
      <div className="jb-card-labels">
        <span className="jb-label" style={{ background: toneOf(c.client_id) }}>{cleanName(c.client || '')}</span>
        {c.blocked && <span className="jb-flag" title={c.block_reason}>■ Bloqueado</span>}
        {c.material_url && <button type="button" className="jb-mat" title={c.material_url} onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(c.material_url, '_blank', 'noopener'); }}>Material ↗</button>}
      </div>
      {c.blocked && <div className="jb-block">{c.block_reason}</div>}
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
  return c.restricted ? <div className={cls} title="Detalhes restritos: você não está vinculado(a) a este cliente.">{body}</div> : <Link to={`/conteudos/${c.id}`} className={cls} data-cursor="ABRIR">{body}</Link>;
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
            <li>Após ajuste normal do cliente, reenviar ao cliente: <b>{data.settings.reenviar_cliente_apos_ajuste ? 'sim' : 'não'}</b></li>
            <li>Régua de cobrança do cliente: {data.settings.followup_cliente_horas.join('h · ')}h</li>
          </ul>
        </div>
      )}
    </Drawer>
  );
}
