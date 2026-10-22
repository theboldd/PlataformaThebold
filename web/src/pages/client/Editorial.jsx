// CALENDÁRIO EDITORIAL do cliente: calendário (como no Notion), fases (planejado → publicado), mês compacto e prévia do feed.
// Opera sobre os conteúdos da plataforma; o que veio do Notion aparece marcado, com a origem da data.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi, useToast } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useUrlState } from '../../lib/nav.jsx';
import { Seg, Loading, ErrorBox, Empty } from '../../components/ui.jsx';
import { fmtDate, fmtMonth } from '../../lib/format.js';
import { FORMATS } from '../../lib/status.js';
import '../../styles/editorial.css';

const FLAGS = [
  ['sem_data', 'Sem data', (i) => !i.date], ['passada', 'Data já passada na migração', (i) => i.past_at_migration],
  ['material', 'Aguardando material', (i) => i.deps.material === 'aguardando material do cliente'], ['aprovacao', 'Aguardando aprovação', (i) => !!i.deps.approval],
  ['bloqueado', 'Bloqueado', (i) => !!i.deps.blocked], ['sem_aprov', 'Aprovação não registrada', (i) => !!i.deps.approval_missing], ['ajuste', 'Com ajuste aberto', (i) => i.open_adjustments > 0],
];
const TZ = 'America/Sao_Paulo';
const dayKey = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });

export default function Editorial({ clientId }) {
  const { data, error, loading, reload } = useApi(`/clients/${clientId}/editorial`, [clientId]);
  const [view, setView] = useUrlState('ed', 'calendario');
  const [flag, setFlag] = useUrlState('so', '');
  const [month, setMonth] = useUrlState('mes', '');
  const items = useMemo(() => (data?.items || []).filter((i) => !flag || FLAGS.find((f) => f[0] === flag)?.[2](i)), [data, flag]);
  if (error) return <ErrorBox error={error} />;
  if (loading || !data) return <Loading rows={6} />;
  const k = data.counts;
  const m = month || data.months.find((x) => x >= new Date().toISOString().slice(0, 7)) || data.months[data.months.length - 1] || new Date().toISOString().slice(0, 7);

  return (
    <div className="edc">
      <div className="ed-sum">
        <span><b>{k.total}</b> conteúdos</span>
        <span><b>{k.com_data}</b> com data</span>
        <span className={k.sem_data ? 'warn' : ''}><b>{k.sem_data}</b> sem data</span>
        {k.migrados > 0 && <span><b>{k.migrados}</b> vieram do Notion</span>}
        {k.passada_na_migracao > 0 && <span className="warn"><b>{k.passada_na_migracao}</b> com data já passada na migração</span>}
        <span><b>{k.com_midia}</b> com arte/vídeo enviado</span>
        {k.cancelados > 0 && <span className="muted">{k.cancelados} cancelado(s) fora da lista</span>}
      </div>
      <div className="ed-bar">
        <Seg label="Visualização" value={view} onChange={setView} options={[{ value: 'calendario', label: 'Calendário' }, { value: 'fases', label: 'Fases' }, { value: 'mes', label: 'Mês (compacto)' }, { value: 'feed', label: 'Prévia do feed' }, { value: 'notion', label: 'Histórico do Notion' }]} />
        <div className="ed-flags" role="group" aria-label="Filtrar">
          {FLAGS.map(([key, label, f]) => {
            const n = (data.items || []).filter(f).length;
            if (!n) return null;
            return <button key={key} className={`ed-flag ${flag === key ? 'on' : ''}`} aria-pressed={flag === key} onClick={() => setFlag(flag === key ? '' : key)}>{label} <b>{n}</b></button>;
          })}
        </div>
      </div>
      {view === 'calendario' && <NotionCalendar month={m} setMonth={setMonth} items={items.filter((i) => i.phase !== 'legado')} clientId={clientId} can={data.can || {}} onChanged={reload} />}
      {view === 'fases' && <Phases phases={data.phases} items={items} />}
      {/* legado não validado não é conteúdo operacional: só aparece no grupo próprio em Fases */}
      {view === 'mes' && <Month month={m} setMonth={setMonth} items={items.filter((i) => i.phase !== 'legado')} clientId={clientId} />}
      {view === 'feed' && <Feed items={items.filter((i) => i.phase !== 'legado')} />}
      {view === 'notion' && <NotionHistory clientId={clientId} />}
    </div>
  );
}

// ═════ CALENDÁRIO EDITORIAL (como no Notion): mês, domingo a sábado, um cartão por post com o formato no título,
// as marcas (ex.: ENVIAR MATERIAL) e os checks APROVAÇÃO ARTE / LEGENDA / TEMA — marcados só quando há registro na plataforma.
// O CR EDITORIAL do Notion pode aparecer junto, como histórico somente leitura (marcado "Notion"), sem virar operação.
const FMT_UP = { reel: 'REELS', video: 'VÍDEO', carrossel: 'CARROSSEL', estatico: 'ÚNICO', foto: 'FOTO', stories: 'STORIES' };
const startsWithFormat = (t) => /^(REELS?|CARROSS+EL|ÚNICO|UNICO|ESTÁTICO|FOTO|STORIES|VÍDEO)\b/i.test(t || '');
const RED_TAGS = ['ENVIAR MATERIAL', 'REELS SEM CAPA', 'AGUARDANDO MATERIAL'];
function Check({ on, label, title }) {
  return <div className={`nc-check ${on ? 'on' : ''}`} title={title}><span className="box" aria-hidden>{on ? '✓' : ''}</span>{label}</div>;
}
function NotionCalendar({ month, setMonth, items, clientId, can, onChanged }) {
  const toast = useToast();
  const [showNotion, setShowNotion] = useUrlState('notion', '1');
  const hist = useApi(showNotion === '1' ? `/clients/${clientId}/notion-history` : null, [clientId, showNotion], { live: false });
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const [busy, setBusy] = useState(false);
  const first = new Date(`${month}-01T12:00:00Z`);
  const start = new Date(first); start.setUTCDate(1 - first.getUTCDay());
  const days = Array.from({ length: 42 }, (_, n) => { const d = new Date(start); d.setUTCDate(start.getUTCDate() + n); return d.toISOString().slice(0, 10); });
  const lastWeekUsed = days.slice(35).some((k) => k.slice(0, 7) === month) ? 42 : 35;
  const byDay = {};
  for (const i of items.filter((x) => x.date)) (byDay[dayKey(i.date)] ||= []).push({ kind: 'p', i });
  const crRows = (hist.data?.items || []).filter((r) => r.date_start);
  for (const r of crRows) (byDay[r.date_start.slice(0, 10)] ||= []).push({ kind: 'n', r });
  const undated = items.filter((i) => !i.date);
  const step = (n) => { const d = new Date(`${month}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); setMonth(d.toISOString().slice(0, 7)); };
  const today = new Date().toISOString().slice(0, 10);
  const movable = (i) => can.edit && !['agendado', 'publicado'].includes(i.stage) && !i.migrated_locked;
  const drop = async (day) => {
    const i = drag; setDrag(null); setOver(null);
    if (!i || dayKey(i.date || '') === day) return;
    if (!confirm(`Mudar “${i.title}” para ${day.split('-').reverse().join('/')}? Fica registrado no histórico do conteúdo.`)) return;
    setBusy(true);
    try { await api.patch(`/contents/${i.id}`, { planned_at: `${day}T15:00:00.000Z` }); toast('Data alterada e registrada no histórico.'); onChanged(); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return (
    <div className={`nc ${busy ? 'busy' : ''}`}>
      <div className="nc-bar">
        <h3 className="nc-title">CR EDITORIAL</h3>
        <div className="row wrap gap-2" style={{ alignItems: 'center' }}>
          <label className="check xs"><input type="checkbox" checked={showNotion === '1'} onChange={(e) => setShowNotion(e.target.checked ? '1' : '0')} /> Mostrar o CR Editorial do Notion (somente leitura)</label>
          {can.create && <Link className="btn btn-sm btn-primary" to={`/conteudos/novo?client_id=${clientId}`}>Novo</Link>}
        </div>
      </div>
      <div className="nc-nav">
        <b>{MONTHS[Number(month.slice(5)) - 1]} {month.slice(0, 4)}</b>
        <div className="row gap-2"><button className="btn btn-sm btn-ghost" onClick={() => step(-1)} aria-label="Mês anterior">‹</button><button className="btn btn-sm btn-ghost" onClick={() => setMonth(today.slice(0, 7))}>Hoje</button><button className="btn btn-sm btn-ghost" onClick={() => step(1)} aria-label="Próximo mês">›</button></div>
      </div>
      <div className="nc-grid" role="grid" aria-label={`Calendário editorial de ${month}`}>
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => <div key={d} className="nc-dow">{d}</div>)}
        {days.slice(0, lastWeekUsed).map((k) => (
          <div key={k} role="gridcell" className={`nc-day ${k.slice(0, 7) !== month ? 'out' : ''} ${k === today ? 'today' : ''} ${over === k ? 'over' : ''}`}
            onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(k); } }} onDragLeave={() => setOver(null)} onDrop={(e) => { e.preventDefault(); drop(k); }}>
            <div className="nc-dn">{can.create && <Link className="nc-add" to={`/conteudos/novo?client_id=${clientId}&data=${k}`} title="Novo conteúdo neste dia" aria-label={`Novo conteúdo em ${k}`}>+</Link>}<span>{k.slice(8) === '01' ? `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(k.slice(5, 7)) - 1]} 1` : Number(k.slice(8))}</span></div>
            {(byDay[k] || []).map((e) => (e.kind === 'p' ? (
              <Link key={e.i.id} to={`/conteudos/${e.i.id}`} className={`nc-card p-${e.i.phase}`} draggable={movable(e.i)} onDragStart={() => setDrag(e.i)} onDragEnd={() => { setDrag(null); setOver(null); }}
                title={`#${e.i.number} ${e.i.title} — ${e.i.stage_label}${movable(e.i) ? ' · arraste para mudar a data' : ''}`}>
                <div className="nc-card-t"><span className="nc-ico" aria-hidden>▤</span><b>{startsWithFormat(e.i.title) ? e.i.title : `${FMT_UP[e.i.format] || (e.i.format || '').toUpperCase()}: ${e.i.title}`}</b>{e.i.comments_n > 0 && <span className="nc-cm">💬 {e.i.comments_n}</span>}</div>
                <div className="nc-tags">
                  {e.i.deps.material?.startsWith('aguardando') && <span className="nc-tag red">ENVIAR MATERIAL</span>}
                  {e.i.deps.blocked && !e.i.deps.material && <span className="nc-tag red">BLOQUEADO</span>}
                  {e.i.migrated && <span className="nc-tag">MIGRADO</span>}
                  <span className="nc-tag soft">{e.i.stage_label}</span>
                </div>
                <Check on={e.i.checks?.arte?.ok} label="APROVAÇÃO ARTE" title={e.i.checks?.arte?.ok ? `Aprovada pelo cliente (${e.i.checks.arte.note}) · ${e.i.checks.arte.by}` : 'Sem registro de aprovação na plataforma'} />
                <Check on={e.i.checks?.legenda?.ok} label="APROVAÇÃO LEGENDA" title={e.i.checks?.legenda?.ok ? `Aprovada pelo cliente (${e.i.checks.legenda.note}) · ${e.i.checks.legenda.by}` : 'Sem registro de aprovação na plataforma'} />
                <Check on={e.i.checks?.tema?.ok} label="APROVAÇÃO TEMA" title={e.i.checks?.tema?.ok ? `Tema aprovado · ${e.i.checks.tema.by}` : 'Sem registro de aprovação do tema na plataforma'} />
              </Link>
            ) : (
              <a key={e.r.id} href={e.r.notion_url || undefined} target="_blank" rel="noreferrer" className="nc-card notion" title="CR Editorial do Notion — histórico somente leitura">
                <div className="nc-card-t"><span className="nc-ico" aria-hidden>▤</span><b>{e.r.title || 'Sem título'}</b></div>
                <div className="nc-tags"><span className="nc-src">Notion</span>{[].concat(e.r.properties['ESTRATÉGIA'] || []).filter((t) => typeof t === 'string').map((t) => <span key={t} className={`nc-tag ${RED_TAGS.includes(t.toUpperCase()) ? 'red' : 'soft'}`}>{t}</span>)}</div>
                {['APROVAÇÃO ARTE', 'APROVAÇÃO LEGENDA', 'APROVAÇÃO TEMA'].filter((key) => key in e.r.properties || (key === 'APROVAÇÃO ARTE' && 'APRO ARTE/REELS' in e.r.properties)).map((key) => <Check key={key} on={!!(e.r.properties[key] ?? e.r.properties['APRO ARTE/REELS'])} label={key} title="Marcação feita no Notion (até a extração)" />)}
              </a>
            )))}
          </div>
        ))}
      </div>
      <p className="xs muted mt-2">Checks da plataforma só aparecem marcados com registro: tema = aprovação do tema; arte e legenda = versão aprovada pelo cliente. Cartões “Notion” são o CR Editorial importado (extração de {hist.data?.extracted_at ? fmtDate(hist.data.extracted_at) : '—'}), somente leitura.{can.edit ? ' Arraste um cartão da plataforma (ou um “sem data”) para mudar a data.' : ''}</p>
      {undated.length > 0 && (
        <section className="nc-undated">
          <h3 className="caps">Sem data ({undated.length})</h3>
          <div className="nc-undated-list">{undated.slice(0, 80).map((i) => (
            <Link key={i.id} to={`/conteudos/${i.id}`} className="nc-chip" draggable={movable(i)} onDragStart={() => setDrag(i)} onDragEnd={() => { setDrag(null); setOver(null); }} title={movable(i) ? 'Arraste para um dia do calendário' : i.stage_label}>{startsWithFormat(i.title) ? i.title : `${FMT_UP[i.format] || i.format}: ${i.title}`}</Link>
          ))}</div>
        </section>
      )}
    </div>
  );
}

function Tile({ i, compact }) {
  return (
    <Link to={`/conteudos/${i.id}`} className={`ed-card ${compact ? 'compact' : ''}`}>
      <div className="ed-card-top"><span className="tag">{FORMATS[i.format] || i.format}</span><span className="ed-stage">{i.stage_label}</span></div>
      <b className="ed-card-t">#{i.number} {i.title}</b>
      <div className="ed-card-m">
        {i.date ? <span>{i.date_kind === 'publicado' ? 'publicado' : i.date_kind === 'agendado' ? 'agendado' : 'previsto'} {fmtDate(i.date)}{i.date_source && i.date_kind === 'previsto' ? ` · data do ${i.date_source}` : ''}</span> : <span className="warn">sem data</span>}
        {i.past_at_migration && <span className="warn">data já passada na migração</span>}
        {i.deps.material && <span className={i.deps.material.startsWith('aguardando') ? 'warn' : ''}>{i.deps.material}</span>}
        {i.deps.approval && <span>{i.deps.approval}</span>}
        {i.deps.blocked && <span className="warn">bloqueado: {i.deps.blocked}</span>}
        {i.deps.approval_missing && <span className="warn">{i.deps.approval_missing}</span>}
        {i.open_adjustments > 0 && <span>{i.open_adjustments} ajuste(s) aberto(s)</span>}
        {!compact && i.people.length > 0 && <span className="muted">com {[...new Set(i.people.map((p) => p.name))].join(', ')}</span>}
        {!compact && i.version && <span className="muted">V{i.version}{i.approved ? ' · aprovada' : ''}</span>}
        {i.migrated && <span className="ed-origin">migrado do Notion</span>}
      </div>
    </Link>
  );
}

function Phases({ phases, items }) {
  return (
    <div className="ed-phases">
      {phases.map((p) => {
        const list = items.filter((i) => i.phase === p.key);
        return (
          <section key={p.key} className="ed-phase" aria-label={p.label}>
            <header><h3>{p.label}</h3><span>{list.length}</span></header>
            <small className="muted">{p.stages.map((s) => s.label).join(' · ')}</small>
            <div className="ed-col">{list.length ? list.map((i) => <Tile key={i.id} i={i} compact />) : <p className="xs faint">Nada nesta fase.</p>}</div>
          </section>
        );
      })}
    </div>
  );
}

function Month({ month, setMonth, items, clientId }) {
  const first = new Date(`${month}-01T12:00:00Z`);
  const start = new Date(first); start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, n) => { const d = new Date(start); d.setUTCDate(start.getUTCDate() + n); return d.toISOString().slice(0, 10); });
  const byDay = {};
  for (const i of items.filter((x) => x.date)) (byDay[dayKey(i.date)] ||= []).push(i);
  const undated = items.filter((i) => !i.date);
  const inMonth = items.filter((i) => i.date && dayKey(i.date).slice(0, 7) === month).length;
  const step = (n) => { const d = new Date(`${month}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); setMonth(d.toISOString().slice(0, 7)); };
  return (
    <div className="ed-month-wrap">
      <div>
        <div className="row between wrap mb-4">
          <div className="row gap-2"><button className="btn btn-sm" onClick={() => step(-1)} aria-label="Mês anterior">‹</button><h3 className="ed-md" style={{ margin: 0, textTransform: 'capitalize' }}>{fmtMonth(month)}</h3><button className="btn btn-sm" onClick={() => step(1)} aria-label="Próximo mês">›</button></div>
          <span className="xs muted">{inMonth ? `${inMonth} conteúdo(s) com data neste mês` : 'Nenhum conteúdo com data neste mês'} · <Link to={`/calendario?cliente=${clientId}`}>abrir no calendário operacional</Link></span>
        </div>
        <div className="ed-month" role="grid">
          {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((d) => <div key={d} className="ed-dow">{d}</div>)}
          {days.map((k) => (
            <div key={k} className={`ed-day ${k.slice(0, 7) !== month ? 'out' : ''}`} role="gridcell">
              <span className="dn">{Number(k.slice(8))}</span>
              {(byDay[k] || []).map((i) => <Link key={i.id} to={`/conteudos/${i.id}`} className={`ed-ev p-${i.phase}`} title={`${i.title} — ${i.stage_label}`}>{FORMATS[i.format] || i.format} · {i.title}</Link>)}
            </div>
          ))}
        </div>
      </div>
      <aside className="ed-undated">
        <h3 className="caps">Sem data ({undated.length})</h3>
        <p className="xs muted">Conteúdos sem data de publicação definida. A data é definida no cronograma (estratégia).</p>
        <div className="ed-col">{undated.slice(0, 60).map((i) => <Tile key={i.id} i={i} compact />)}{undated.length > 60 && <p className="xs faint">+ {undated.length - 60}</p>}</div>
      </aside>
    </div>
  );
}

// Prévia do feed: o que já tem data, do mais novo para o mais antigo (como no perfil); sem arte, mostra o formato
function Feed({ items }) {
  const dated = items.filter((i) => i.date && i.format !== 'stories').sort((a, b) => b.date.localeCompare(a.date));
  if (!dated.length) return <Empty title="Nada com data para montar o feed.">O feed usa a data publicada, agendada ou prevista. Stories ficam fora.</Empty>;
  return (
    <>
      <p className="xs muted">Ordem do perfil: do mais recente para o mais antigo. Quadros sem imagem ainda não têm arte enviada na plataforma.</p>
      <div className="ed-feed">
        {dated.map((i) => (
          <Link key={i.id} to={`/conteudos/${i.id}`} className={`ed-tile p-${i.phase}`} title={`#${i.number} ${i.title}`}>
            {i.thumb ? <img src={i.thumb} alt="" loading="lazy" /> : <span className="ph"><b>{FORMATS[i.format] || i.format}</b><small>{i.title}</small></span>}
            <span className="badge">{fmtDate(i.date)} · {i.date_kind === 'publicado' ? 'publicado' : i.date_kind === 'agendado' ? 'agendado' : i.approved ? 'aprovado' : 'previsto'}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

// HISTÓRICO DO NOTION · SOMENTE LEITURA: o que existia no "CR EDITORIAL" antes da plataforma. Não é o calendário ativo.
const val = (v) => (v == null ? '' : typeof v === 'boolean' ? (v ? 'marcado no Notion' : 'não marcado') : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? (v.start ? `${v.start}${v.end ? ` → ${v.end}` : ''}` : JSON.stringify(v)) : String(v));
function NotionHistory({ clientId }) {
  const [showEmpty, setShowEmpty] = useUrlState('vazios', false);
  const { data, error, loading } = useApi(`/clients/${clientId}/notion-history${showEmpty ? '?vazios=1' : ''}`, [clientId, showEmpty], { live: false });
  if (error) return <ErrorBox error={error} />;
  if (loading || !data) return <Loading rows={4} />;
  return (
    <section className="ed-hist" aria-label="Histórico do Notion">
      <div className="ed-hist-banner"><b>Histórico do Notion · somente leitura</b><span>Itens dos calendários editoriais do Notion (CR EDITORIAL e equivalentes auditados), guardados como contexto. Não geram tarefa, pendência, atraso nem cobrança e não substituem o calendário editorial da plataforma.{data.extracted_at ? ` Extraído em ${fmtDate(data.extracted_at)}.` : ''}</span></div>
      <div className="row wrap between gap-3 mb-4">
        <span className="xs muted">{data.by_source.map((s) => `${s.source}: ${s.n}`).join(' · ')}</span>
        {data.empty_count > 0 && <label className="check xs"><input type="checkbox" checked={!!showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} /> Mostrar registros vazios ({data.empty_count})</label>}
      </div>
      {!data.items.length ? <Empty title="Nenhum item do calendário do Notion para este cliente." /> : (
        <div className="table-wrap"><table className="table ed-hist-t">
          <thead><tr><th>Data</th><th>Título</th><th>Informações do Notion</th><th /></tr></thead>
          <tbody>{data.items.map((r) => {
            const extra = Object.entries(r.properties).filter(([k, v]) => k !== r.date_property && val(v) && val(v) !== r.title);
            return (
              <tr key={r.id}>
                <td className="sm nowrap">{r.date_start ? r.date_start.slice(0, 10).split('-').reverse().join('/') : <span className="muted">sem data</span>}</td>
                <td className="sm strong">{r.title || <span className="muted">sem título</span>}</td>
                <td className="xs">{extra.map(([k, v]) => <span key={k} className="ed-hist-p"><b>{k}:</b> {val(v)}</span>)}</td>
                <td className="nowrap">{r.notion_url && <a className="xs" href={r.notion_url} target="_blank" rel="noreferrer">abrir no Notion ↗</a>}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
    </section>
  );
}
