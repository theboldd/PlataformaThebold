// THE BOLD BRAIN — Memória de Decisões ("Por que fazemos dessa forma?") e Radar de Automações.
// Tudo que aparece aqui vem do banco; sem dado, o estado honesto (DADOS INSUFICIENTES). Permissões vêm do servidor.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi, useToast } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { StatePanel, StateTag, Metric } from '../../components/State.jsx';
import { Section, Loading, ErrorBox, Button, Tag, Drawer, Field } from '../../components/ui.jsx';
import { fmtDate, fmtDateTime, cleanName } from '../../lib/format.js';

const STATUS_TONE = { rascunho: null, sugerida: 'info', confirmada: 'ok', revogada: 'err', substituida: null, em_revisao: 'warn', aprovada_regra: 'ok', descartada: 'err' };
const labelOf = (list, k) => list?.find((x) => x.key === k)?.label || k;
// datas AAAA-MM-DD são dias (não instantes): meio-dia evita voltar um dia no fuso de São Paulo
const fmtDay = (v) => fmtDate(v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v);
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString();

// ─────────────── MEMÓRIA DE DECISÕES ───────────────
export function DecisionMemory({ clients }) {
  const toast = useToast();
  const [f, setF] = useState({ q: '', client_id: '', area: '', status: '' });
  const url = `/brain/decisions${qs(f) ? `?${qs(f)}` : ''}`;
  const { data, error, reload } = useApi(url, [], { live: false });
  const [open, setOpen] = useState(null); // id
  const [editing, setEditing] = useState(null); // {} novo | decisão
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const filtered = f.q || f.client_id || f.area || f.status;
  return (
    <Section title="Memória de Decisões" kicker="Por que fazemos dessa forma?"
      action={data.can.write && <Button variant="primary" size="sm" onClick={() => setEditing({})}>Registrar decisão</Button>}>
      <div className="row wrap mb-5" style={{ gap: 10 }}>
        <input className="input" style={{ maxWidth: 280 }} placeholder="Buscar decisão, contexto, motivo…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Buscar" />
        <select className="select" style={{ maxWidth: 220 }} value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} aria-label="Cliente">
          <option value="">Todos os clientes</option>{(clients || []).map((c) => <option key={c.id} value={c.id}>{cleanName(c.name)}</option>)}
        </select>
        <select className="select" style={{ maxWidth: 180 }} value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} aria-label="Área">
          <option value="">Todas as áreas</option>{data.areas.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
        </select>
        <select className="select" style={{ maxWidth: 200 }} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Status">
          <option value="">Vigentes (sem substituídas)</option>{data.statuses.map((s) => <option key={s.key} value={s.key}>{s.label}{data.counts[s.key] ? ` · ${data.counts[s.key]}` : ''}</option>)}<option value="todas">Todas, inclusive substituídas</option>
        </select>
      </div>
      {data.state === 'dados_insuficientes' ? (
        <StatePanel s="dados_insuficientes" kicker="Memória de Decisões" title="Nenhuma decisão registrada ainda">
          Decisões entram aqui manualmente{data.can.write ? '' : ' (por quem tem permissão de criar no Brain)'} ou quando o resumo interno de uma reunião é aplicado.
        </StatePanel>
      ) : !data.items.length ? (
        <p className="sm muted">Nenhuma decisão com {filtered ? 'esses filtros' : 'esse estado'}.</p>
      ) : data.items.map((d) => (
        <button key={d.id} className="erow link" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--line)', textAlign: 'left', color: 'inherit' }} onClick={() => setOpen(d.id)}>
          <div>
            <div className="t">{d.decision}</div>
            {d.reason && <div className="s">Motivo: {d.reason}</div>}
            <div className="row wrap gap-2 mt-2">
              <Tag tone={STATUS_TONE[d.status]}>{labelOf(data.statuses, d.status)}</Tag>
              {d.area && <Tag>{labelOf(data.areas, d.area)}</Tag>}
              <Tag>{labelOf(data.origins, d.origin)}</Tag>
              {d.client_name && <Tag tone="bordo">{cleanName(d.client_name)}</Tag>}
              {d.version > 1 && <Tag>V{d.version}</Tag>}
              {d.expired && <Tag tone="warn">Validade vencida</Tag>}
            </div>
          </div>
          <div className="r col" style={{ alignItems: 'flex-end' }}><span>{fmtDay(d.decided_at || d.created_at)}</span><span>{d.owner_name || '—'}</span></div>
        </button>
      ))}
      {open && <DecisionDrawer id={open} meta={data} onClose={() => setOpen(null)} onEdit={(d) => { setOpen(null); setEditing(d); }} onChanged={(nid) => { reload(); if (nid) setOpen(nid); }} />}
      {editing && <DecisionForm initial={editing} meta={data} clients={clients} onClose={() => setEditing(null)} onSaved={(d) => { setEditing(null); reload(); setOpen(d.id); toast(editing.id && editing.status === 'confirmada' ? `Nova versão V${d.version} criada; a anterior ficou substituída.` : 'Decisão salva.'); }} />}
    </Section>
  );
}

function DecisionDrawer({ id, meta, onClose, onEdit, onChanged }) {
  const toast = useToast();
  const { data: d, reload } = useApi(`/brain/decisions/${id}`, [id], { live: false });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const move = async (status) => {
    setBusy(true);
    try { await api.post(`/brain/decisions/${id}/status`, { status, note }); setNote(''); reload(); onChanged(); toast('Estado registrado no histórico.'); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  if (!d) return <Drawer open onClose={onClose} title="Decisão"><Loading /></Drawer>;
  const open = ['rascunho', 'sugerida', 'confirmada'].includes(d.status);
  const row = (k, v) => (v ? [<span key={k + 'k'}>{k}</span>, <span key={k + 'v'}>{v}</span>] : null);
  return (
    <Drawer open onClose={onClose} title={d.decision} kicker={`${labelOf(meta.statuses, d.status)} · V${d.version}`} wide>
      <div className="col gap-5">
        {d.status === 'substituida' && d.replaced_by && <p className="sm" style={{ margin: 0 }}><StateTag s="desligada">Substituída</StateTag> <button className="btn btn-sm btn-ghost" onClick={() => onChanged(d.replaced_by)}>Abrir versão atual</button></p>}
        {d.expired && <p className="sm" style={{ margin: 0, color: 'var(--warn)' }}>A validade desta decisão venceu em {fmtDay(d.valid_until)} — revise, renove ou revogue.</p>}
        <div className="ctx"><div className="kv">
          {row('Contexto', d.context)}{row('Motivo', d.reason)}{row('Consequência', d.consequence)}
          {row('Responsável', d.owner_name)}{row('Participantes', d.participant_names.join(', '))}{row('Data', fmtDay(d.decided_at))}
          {row('Origem', `${labelOf(meta.origins, d.origin)}${d.origin_ref ? ` · ${d.origin_ref}` : ''}`)}{row('Área', d.area && labelOf(meta.areas, d.area))}
          {row('Cliente', d.client_name && cleanName(d.client_name))}{row('Conteúdo', d.content_label)}{row('Reunião', d.meeting_label)}
          {row('Validade', d.valid_until && fmtDay(d.valid_until))}{row('Confirmada por', d.confirmed_by_name && `${d.confirmed_by_name} · ${fmtDateTime(d.confirmed_at)}`)}
          {row('Observação', d.status_note)}
        </div></div>
        {d.client_id && <Link to={`/clientes/${d.client_id}`} className="bordo sm">Abrir cliente →</Link>}
        {d.links.length > 0 && <section><h3 className="caps mb-2">Anexos e links</h3><ul className="list">{d.links.map((l) => <li key={l} className="sm"><a href={l} target="_blank" rel="noreferrer noopener" className="bordo">{l}</a></li>)}</ul></section>}

        {meta.can.write && open && (
          <section className="col gap-4">
            <Field label={d.status === 'confirmada' ? 'Motivo (obrigatório para revogar)' : 'Observação (obrigatória para revogar)'}><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <div className="row wrap gap-2">
              {d.status !== 'confirmada' && <Button size="sm" onClick={() => onEdit(d)}>Editar</Button>}
              {d.status === 'rascunho' && <Button size="sm" disabled={busy} onClick={() => move('sugerida')}>Enviar como sugestão</Button>}
              {d.status === 'sugerida' && <Button size="sm" disabled={busy} onClick={() => move('rascunho')}>Voltar a rascunho</Button>}
              {d.status !== 'confirmada' && meta.can.confirm && <Button size="sm" variant="primary" disabled={busy} onClick={() => move('confirmada')}>Confirmar decisão</Button>}
              {d.status === 'confirmada' && meta.can.confirm && <Button size="sm" onClick={() => onEdit(d)}>Alterar (cria nova versão)</Button>}
              {(d.status !== 'confirmada' || meta.can.confirm) && <Button size="sm" variant="danger" disabled={busy || !note.trim()} onClick={() => move('revogada')}>Revogar</Button>}
            </div>
            {!meta.can.confirm && <p className="xs muted" style={{ margin: 0 }}>Confirmar exige permissão de edição do Brain (ou CEO).</p>}
            <p className="xs faint" style={{ margin: 0 }}>Nada é apagado: revogar ou substituir mantém a decisão e todo o histórico.</p>
          </section>
        )}

        {d.versions.length > 1 && (
          <section><h3 className="caps mb-2">Versões</h3>
            <ul className="list">{d.versions.map((v) => <li key={v.id} className="sm"><span className="grow">{v.id === d.id ? <b>V{v.version}</b> : <button className="btn btn-sm btn-ghost" onClick={() => onChanged(v.id)}>V{v.version}</button>} {v.decision}</span><Tag tone={STATUS_TONE[v.status]}>{labelOf(meta.statuses, v.status)}</Tag></li>)}</ul>
          </section>
        )}
        <section><h3 className="caps mb-2">Histórico</h3>
          <ul className="list">{d.history.map((h) => <li key={h.id} className="sm" style={{ alignItems: 'flex-start' }}><span className="xs faint" style={{ width: 110, flex: 'none' }}>{fmtDateTime(h.created_at)}</span><span className="grow">V{h.version} · {h.event.replace(/_/g, ' ')} → {labelOf(meta.statuses, h.status)}{h.note ? ` — ${h.note}` : ''}<div className="xs faint">{h.actor_name || 'Sistema'}</div></span></li>)}</ul>
        </section>
      </div>
    </Drawer>
  );
}

function DecisionForm({ initial, meta, clients, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !initial.id;
  const [v, setV] = useState({
    decision: initial.decision || '', context: initial.context || '', reason: initial.reason || '', consequence: initial.consequence || '',
    owner_id: initial.owner_id || '', participants: initial.participants || [], decided_at: initial.decided_at || '', origin: initial.origin || 'manual', origin_ref: initial.origin_ref || '',
    client_id: initial.client_id || '', area: initial.area || '', valid_until: initial.valid_until || '', links: (initial.links || []).join('\n'), note: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const save = async (status) => {
    setBusy(true);
    const body = { ...v, links: v.links.split(/\s+/).filter(Boolean), owner_id: v.owner_id || null, client_id: v.client_id || null, area: v.area || null, status };
    try { onSaved(isNew ? await api.post('/brain/decisions', body) : await api.put(`/brain/decisions/${initial.id}`, body)); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Drawer open onClose={onClose} title={isNew ? 'Registrar decisão' : initial.status === 'confirmada' ? `Alterar decisão confirmada (nova V${initial.version + 1})` : 'Editar decisão'} kicker="Memória de Decisões" wide>
      <div className="col gap-4">
        {initial.status === 'confirmada' && <p className="xs muted" style={{ margin: 0 }}>A versão atual fica preservada como SUBSTITUÍDA, ligada à nova versão.</p>}
        <Field label="Decisão"><textarea className="textarea" value={v.decision} onChange={set('decision')} required /></Field>
        <Field label="Contexto"><textarea className="textarea" value={v.context} onChange={set('context')} /></Field>
        <Field label="Motivo"><textarea className="textarea" value={v.reason} onChange={set('reason')} /></Field>
        <Field label="Consequência"><textarea className="textarea" value={v.consequence} onChange={set('consequence')} /></Field>
        <div className="grid-2">
          <Field label="Responsável"><select className="select" value={v.owner_id} onChange={set('owner_id')}><option value="">Eu</option>{meta.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Data da decisão"><input className="input" type="date" value={v.decided_at || ''} onChange={set('decided_at')} /></Field>
          <Field label="Origem"><select className="select" value={v.origin} onChange={set('origin')}>{meta.origins.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></Field>
          <Field label="Referência da origem (link ou id)"><input className="input" value={v.origin_ref} onChange={set('origin_ref')} /></Field>
          <Field label="Cliente (opcional)"><select className="select" value={v.client_id} onChange={set('client_id')}><option value="">Sem cliente</option>{(clients || []).map((c) => <option key={c.id} value={c.id}>{cleanName(c.name)}</option>)}</select></Field>
          <Field label="Área / processo (opcional)"><select className="select" value={v.area} onChange={set('area')}><option value="">—</option>{meta.areas.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select></Field>
          <Field label="Validade (opcional)"><input className="input" type="date" value={v.valid_until || ''} onChange={set('valid_until')} /></Field>
        </div>
        <Field label="Participantes">
          <div className="row wrap gap-2">{meta.people.map((p) => {
            const on = v.participants.includes(p.id);
            return <button key={p.id} type="button" className={`btn btn-sm ${on ? 'btn-ink' : ''}`} aria-pressed={on} onClick={() => setV({ ...v, participants: on ? v.participants.filter((x) => x !== p.id) : [...v.participants, p.id] })}>{on ? '✓ ' : ''}{p.name}</button>;
          })}</div>
        </Field>
        <Field label="Anexos / links" hint="Um link por linha (http:// ou https://). Arquivos não são enviados aqui."><textarea className="textarea" value={v.links} onChange={set('links')} /></Field>
        {!isNew && <Field label="Nota da alteração (opcional)"><input className="input" value={v.note} onChange={set('note')} /></Field>}
        <div className="row wrap gap-2">
          {isNew ? (
            <>
              <Button disabled={busy || !v.decision.trim()} onClick={() => save('rascunho')}>Salvar rascunho</Button>
              <Button disabled={busy || !v.decision.trim()} onClick={() => save('sugerida')}>Salvar como sugestão</Button>
              {meta.can.confirm && <Button variant="primary" disabled={busy || !v.decision.trim()} onClick={() => save('confirmada')}>Salvar e confirmar</Button>}
            </>
          ) : <Button variant="primary" disabled={busy || !v.decision.trim()} onClick={() => save()}>{initial.status === 'confirmada' ? 'Criar nova versão' : 'Salvar'}</Button>}
        </div>
      </div>
    </Drawer>
  );
}

// ─────────────── RADAR DE AUTOMAÇÕES ───────────────
export function AutomationRadar() {
  const toast = useToast();
  const { data, error, reload } = useApi('/brain/radar', [], { live: false });
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(false);
  if (error) return error.status === 403
    ? <StatePanel s="bloqueado" kicker="Radar de Automações" title="Seu perfil não acessa o Radar" missing="permissão de Automações (ver)." />
    : <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const move = async (s, status) => {
    setBusy(true);
    try { await api.post(`/brain/radar/${s.id}/status`, { status, note: notes[s.id] || '' }); setNotes({ ...notes, [s.id]: '' }); reload(); toast('Decisão registrada. Nenhuma automação foi criada ou ligada.'); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Section title="Radar de Automações" kicker={`Ações manuais repetidas · ≥ ${data.threshold} vezes em ${data.window_days} dias · detecção por regra, sem IA`}>
      <p className="xs muted" style={{ marginTop: 0 }}>O Radar só sugere. Aprovar registra a decisão de transformar o padrão em regra — nenhuma automação é criada ou ligada por aqui.</p>
      {data.state === 'dados_insuficientes' ? (
        <StatePanel s="dados_insuficientes" kicker="Radar de Automações" title={`Nenhuma ação manual se repetiu ${data.threshold} vezes nos últimos ${data.window_days} dias`}>
          Login, visualizações e ações do sistema não contam.
        </StatePanel>
      ) : data.items.map((s) => (
        <div key={s.id} className="erow" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
          <div>
            <div className="t">{s.action}{s.entity_type ? <span className="faint"> · {s.entity_type}</span> : null}</div>
            <div className="s">Processo: {s.process}{!s.active ? ' · abaixo do limiar na janela atual' : ''}</div>
            <div className="row wrap mt-4" style={{ gap: 18 }}>
              <Metric label="Ocorrências" value={s.occurrences} hint={`${data.window_days} dias`} />
              <Metric label="Pessoas" value={s.people} />
              <Metric label="Por semana" value={s.per_week.toLocaleString('pt-BR')} hint="estimativa" />
            </div>
            {s.examples.length > 0 && <ul className="list mt-2">{s.examples.map((e, i) => <li key={i} className="xs muted">{fmtDateTime(e.created_at)} · {e.summary}</li>)}</ul>}
            {s.decision_note && <p className="xs mt-2" style={{ marginBottom: 0 }}><b>Nota:</b> {s.decision_note}{s.decided_by_name ? ` — ${s.decided_by_name}, ${fmtDateTime(s.decided_at)}` : ''}</p>}
            {data.can_decide && (
              <div className="row wrap gap-2 mt-4">
                <input className="input" style={{ maxWidth: 340, minHeight: 34 }} placeholder="Nota da decisão (obrigatória para aprovar/descartar)" value={notes[s.id] || ''} onChange={(e) => setNotes({ ...notes, [s.id]: e.target.value })} aria-label="Nota" />
                {s.status !== 'em_revisao' && <Button size="sm" disabled={busy} onClick={() => move(s, 'em_revisao')}>{s.status === 'sugerida' ? 'Colocar em revisão' : 'Reabrir revisão'}</Button>}
                {['sugerida', 'em_revisao'].includes(s.status) && <Button size="sm" variant="primary" disabled={busy || !notes[s.id]?.trim()} onClick={() => move(s, 'aprovada_regra')}>Aprovar para virar regra</Button>}
                {['sugerida', 'em_revisao'].includes(s.status) && <Button size="sm" variant="danger" disabled={busy || !notes[s.id]?.trim()} onClick={() => move(s, 'descartada')}>Descartar</Button>}
              </div>
            )}
          </div>
          <div className="r"><Tag tone={STATUS_TONE[s.status]}>{labelOf(data.statuses, s.status)}</Tag></div>
        </div>
      ))}
      {!data.can_decide && data.items.length > 0 && <p className="xs muted mt-4">Decidir sobre sugestões exige Automações (administrar) ou CEO.</p>}
    </Section>
  );
}
