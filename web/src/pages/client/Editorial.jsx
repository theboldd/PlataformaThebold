// CALENDÁRIO EDITORIAL do cliente: fases (planejado → publicado), mês e prévia do feed.
// Opera sobre os conteúdos da plataforma; o que veio do Notion aparece marcado, com a origem da data.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../lib/hooks.js';
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
  const { data, error, loading } = useApi(`/clients/${clientId}/editorial`, [clientId]);
  const [view, setView] = useUrlState('ed', 'fases');
  const [flag, setFlag] = useUrlState('so', '');
  const [month, setMonth] = useUrlState('mes', '');
  const items = useMemo(() => (data?.items || []).filter((i) => !flag || FLAGS.find((f) => f[0] === flag)?.[2](i)), [data, flag]);
  if (error) return <ErrorBox error={error} />;
  if (loading || !data) return <Loading rows={6} />;
  const k = data.counts;
  if (!k.total) return <Empty title="Nenhum conteúdo ainda.">Os conteúdos criados no cronograma aparecem aqui por fase, por data e na prévia do feed.</Empty>;
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
        <Seg label="Visualização" value={view} onChange={setView} options={[{ value: 'fases', label: 'Fases' }, { value: 'mes', label: 'Mês' }, { value: 'feed', label: 'Prévia do feed' }, { value: 'notion', label: 'Histórico do Notion' }]} />
        <div className="ed-flags" role="group" aria-label="Filtrar">
          {FLAGS.map(([key, label, f]) => {
            const n = (data.items || []).filter(f).length;
            if (!n) return null;
            return <button key={key} className={`ed-flag ${flag === key ? 'on' : ''}`} aria-pressed={flag === key} onClick={() => setFlag(flag === key ? '' : key)}>{label} <b>{n}</b></button>;
          })}
        </div>
      </div>
      {view === 'fases' && <Phases phases={data.phases} items={items} />}
      {view === 'mes' && <Month month={m} setMonth={setMonth} items={items} clientId={clientId} />}
      {view === 'feed' && <Feed items={items} />}
      {view === 'notion' && <NotionHistory clientId={clientId} />}
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
  const { data, error, loading } = useApi(`/clients/${clientId}/notion-history`, [clientId], { live: false });
  if (error) return <ErrorBox error={error} />;
  if (loading || !data) return <Loading rows={4} />;
  return (
    <section className="ed-hist" aria-label="Histórico do Notion">
      <div className="ed-hist-banner"><b>Histórico do Notion · somente leitura</b><span>Itens do calendário “CR EDITORIAL”, guardados como contexto. Não geram tarefa, pendência, atraso nem cobrança e não substituem o calendário editorial da plataforma.{data.extracted_at ? ` Extraído em ${fmtDate(data.extracted_at)}.` : ''}</span></div>
      {!data.items.length ? <Empty title="Nenhum item do CR EDITORIAL para este cliente." /> : (
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
