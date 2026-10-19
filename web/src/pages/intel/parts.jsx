// Peças compartilhadas pelas telas de inteligência (dashboard, torre, pendências, insights)
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../../styles/intel.css';
import { api } from '../../lib/api.js';
import { useToast } from '../../lib/hooks.js';
import { ago, fmtDate, fmtDateTime, cleanName, fmtTime } from '../../lib/format.js';
import { FORMATS, SEVERITY } from '../../lib/status.js';
import { Button, Empty, Tag, Drawer, Risk } from '../../components/ui.jsx';
import { I } from '../../components/Icons.jsx';
import { restoredOverlay } from '../../lib/nav.jsx';

export const n2 = (v) => String(v ?? 0).padStart(2, '0');

// Medidor horizontal de série única (um tom, rótulos em tinta, valor direto). Marca opcional = capacidade.
export function Meter({ label, value, max, mark, display, title, to }) {
  const nav = useNavigate();
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  const markPct = mark != null && max ? Math.min(100, (mark / max) * 100) : null;
  return (
    <div className="meter-row" title={title || `${label}: ${display ?? value}`} onClick={to ? () => nav(to) : undefined} style={to ? { cursor: 'pointer' } : null}>
      <span className="lbl">{label}</span>
      <span className="meter" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
        <span className={mark != null && value > mark ? 'over' : ''} style={{ width: `${pct}%` }} />
        {markPct != null && <i style={{ left: `${markPct}%` }} title={`capacidade ${mark}`} />}
      </span>
      <span className="v">{display ?? value}</span>
    </div>
  );
}

// Minhas tarefas — conclusão aciona o Process Engine (validações vêm do servidor)
export function MyTasks({ tasks, reload, empty = 'Nenhuma tarefa aberta. Bom trabalho.' }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const done = async (t) => {
    setBusy(t.id);
    try { await api.post(`/tasks/${t.id}/complete`); toast('Concluída — o processo seguiu para a próxima etapa.'); reload?.(); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(null); }
  };
  if (!tasks?.length) return <Empty title={empty} />;
  return (
    <div>
      {tasks.map((t, i) => (
        <div className="erow" key={t.id}>
          <span className="n">{n2(i + 1)}</span>
          <div style={{ minWidth: 0 }}>
            <div className="t">{t.content_id ? <Link to={`/conteudos/${t.content_id}`} data-cursor="ABRIR">{t.title}</Link> : t.title}</div>
            <div className="s">{[cleanName(t.client || ''), t.content ? FORMATS[t.content.format] : null, t.kind === 'ajuste' ? 'Ajuste' : t.kind === 'follow_up' ? 'Follow-up' : null].filter(Boolean).join(' · ')}</div>
            {t.description && t.kind === 'follow_up' && <CopyText text={t.description.replace(/^.*?“/s, '').replace(/”\s*$/, '')} />}
          </div>
          <div className="r col" style={{ alignItems: 'flex-end', gap: 6 }}>
            <span style={t.overdue ? { color: 'var(--err)', fontWeight: 600 } : null}>{t.due_at ? `${t.overdue ? 'venceu ' : ''}${fmtDate(t.due_at)} ${fmtTime(t.due_at)}` : 'sem prazo'}</span>
            {t.kind !== 'aprovacao' && <Button size="sm" variant="ghost" icon={<I.check size={14} />} disabled={busy === t.id} onClick={() => done(t)}>Concluir</Button>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CopyText({ text }) {
  const toast = useToast();
  return (
    <div>
      <div className="copybox">{text}</div>
      <Button size="sm" variant="ghost" className="mt-2" onClick={() => { navigator.clipboard?.writeText(text); toast('Texto copiado para o WhatsApp.'); }}>Copiar texto</Button>
    </div>
  );
}

// Lista compacta de conteúdos (cards do engine)
export function ContentRows({ items, empty = 'Nada aqui.', show = 'stage' }) {
  if (!items?.length) return <Empty title={empty} />;
  return items.map((c, i) => (
    <Link to={c.restricted ? '#' : `/conteudos/${c.id}`} className="erow link" key={c.id} data-cursor="ABRIR">
      <span className="n">{n2(i + 1)}</span>
      <div style={{ minWidth: 0 }}>
        <div className="t">#{c.number} {c.title}</div>
        <div className="s">{cleanName(c.client)} · {FORMATS[c.format]} · {show === 'owner' ? (c.owner || '—') : c.stage_label}{c.blocked ? ` · ■ ${c.block_reason}` : ''}</div>
      </div>
      <div className="r col" style={{ alignItems: 'flex-end', gap: 4 }}>
        <span>{c.hours_in_stage < 24 ? `${c.hours_in_stage}h` : `${Math.floor(c.hours_in_stage / 24)}d`} na etapa</span>
        <Risk level={c.risk} />
      </div>
    </Link>
  ));
}

// Pendência em linha (dashboard de operações / CEO)
export function PendRows({ items, empty = 'Nenhuma pendência crítica.' }) {
  const nav = useNavigate();
  if (!items?.length) return <Empty title={empty} />;
  return items.map((p, i) => (
    <div className="erow link" key={p.id} onClick={() => p.link && nav(p.link)} role="link" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && p.link && nav(p.link)} data-cursor="ABRIR">
      <span className="n">{n2(i + 1)}</span>
      <div style={{ minWidth: 0 }}>
        <div className="t">{p.title}</div>
        <div className="s">{[cleanName(p.client || ''), p.process, p.who && `Quem age: ${p.who}`].filter(Boolean).join(' · ')}</div>
        <div className="s" style={{ color: 'var(--ink-2)' }}>→ {p.next}</div>
      </div>
      <div className="r col" style={{ alignItems: 'flex-end', gap: 4 }}>
        <span className={`sev sev-${p.severity}`}>{SEVERITY[p.severity]}</span>
        <span>{p.late ? `atraso ${p.late}` : ago(p.since)}</span>
      </div>
    </div>
  ));
}

// Clientes em risco com drill-down
export function RiskList({ risks }) {
  const [open, setOpen] = useState(() => restoredOverlay('cliente-risco'));
  if (!risks?.length) return <Empty title="Nenhum cliente em risco.">Todos os clientes estão dentro do esperado.</Empty>;
  return (
    <>
      {risks.map((r, i) => (
        <div className="erow link" key={r.id} onClick={() => setOpen(r)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(r)} data-cursor="VER">
          <span className="n">{n2(i + 1)}</span>
          <div style={{ minWidth: 0 }}><div className="t">{cleanName(r.name)}</div><div className="s">{r.reasons.slice(0, 2).join(' · ')}</div></div>
          <div className="r"><Risk level={r.level} /></div>
        </div>
      ))}
      <RiskDrawer r={open} onClose={() => setOpen(null)} />
    </>
  );
}
export function RiskDrawer({ r, onClose }) {
  if (!r) return null;
  const rec = r.reasons.some((x) => x.includes('Cliente sem resposta')) ? 'Acionar o atendimento com a régua de cobrança e decidir: segue para a próxima semana ou para o próximo mês?'
    : r.reasons.some((x) => x.includes('sem responsável')) ? 'Vincular uma pessoa à função na ficha do cliente — as tarefas são atribuídas automaticamente.'
    : r.reasons.some((x) => x.includes('Bloqueado')) ? 'Cobrar o material com data-limite e desbloquear assim que chegar.'
    : 'Redistribuir a etapa atrasada ou renegociar o prazo com Operações.';
  return (
    <Drawer open onClose={onClose} restore={r} restoreKey="cliente-risco" title={cleanName(r.name)} kicker="Cliente em risco">
      <div className="row mb-5"><Risk level={r.level} />{r.strategist && <span className="sm muted">Estrategista: {r.strategist}</span>}</div>
      <div className="caps mb-2">Motivo do risco</div>
      <ul className="list mb-5">{r.reasons.map((x) => <li key={x} className="sm">{x}</li>)}</ul>
      {r.next && (
        <dl className="col gap-2" style={{ margin: 0 }}>
          <div className="caps">Ponto de atenção</div>
          <div className="ed-md">{r.next.content}</div>
          <div className="sm"><span className="muted">Etapa:</span> {r.next.stage}</div>
          <div className="sm"><span className="muted">Responsável:</span> {r.next.who || '—'}{r.next.unassigned ? ' (há tarefa sem responsável)' : ''}</div>
          <div className="sm"><span className="muted">Ação esperada:</span> {r.next.text}</div>
        </dl>
      )}
      <div className="panel mt-5" style={{ borderColor: 'var(--bordo-line)', background: 'var(--bordo-soft)' }}>
        <div className="caps bordo mb-2">Ação recomendada</div>
        <div className="sm">{rec}</div>
      </div>
      <div className="row mt-5 wrap">
        <Link className="btn btn-primary" to={`/clientes/${r.id}`}>Abrir ficha</Link>
        {r.next?.content_id && <Link className="btn" to={`/conteudos/${r.next.content_id}`}>Abrir conteúdo</Link>}
        <Link className="btn btn-ghost" to={`/clientes/${r.id}?tab=historico`}>Histórico</Link>
      </div>
    </Drawer>
  );
}

export function MeetingRows({ items, empty = 'Sem reuniões nos próximos dias.' }) {
  if (!items?.length) return <Empty title={empty} />;
  return items.map((m) => (
    <Link to={`/reunioes?m=${m.id}`} className="erow link" key={m.id} data-cursor="ABRIR" style={{ gridTemplateColumns: '64px minmax(0,1fr)' }}>
      <div><div className="ed" style={{ fontSize: 26, lineHeight: 1 }}>{fmtTime(m.starts_at)}</div><div className="xs faint">{fmtDate(m.starts_at)}</div></div>
      <div style={{ minWidth: 0 }}><div className="t clip">{m.title}</div><div className="s">{m.client_name ? cleanName(m.client_name) : 'Interna'}{m.gcal_sync === 'sincronizado' ? ' · Google Calendar' : ''}</div></div>
    </Link>
  ));
}

export function InsightMini({ items }) {
  if (!items?.length) return <Empty title="Sem insights abertos." />;
  return items.map((x) => (
    <Link to="/insights" key={x.id} className="erow link" style={{ gridTemplateColumns: 'minmax(0,1fr)' }} data-cursor="VER">
      <div>
        <div className="row gap-2 mb-2"><span className={`sev sev-${x.severity === 'alta' ? 'alta' : x.severity === 'media' ? 'media' : 'baixa'}`}>{x.detector.replace('_', ' ')}</span></div>
        <div className="ed" style={{ fontSize: 20, lineHeight: 1.2 }}>{x.problem}</div>
        <div className="s mt-2">→ {x.suggestion}</div>
      </div>
    </Link>
  ));
}

export { fmtDateTime, Tag };
