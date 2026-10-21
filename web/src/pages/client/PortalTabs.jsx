// Abas internas do dossiê ligadas à área do cliente: SOLICITAÇÕES, DECISÕES, SAÚDE DO CLIENTE (interno) e MARCA & PULSO.
// A equipe enxerga a operação; o cliente enxerga só a tradução (o servidor separa as duas visões).
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useApi, useToast } from '../../lib/hooks.js';
import { Button, Empty, ErrorBox, Field, Loading, Modal } from '../../components/ui.jsx';
import { ago, fmtDate, fmtDateTime } from '../../lib/format.js';
import { SECTION_LABEL } from './Ficha.jsx';

const RSTATUS = { recebido: 'Recebido', em_analise: 'Em análise', em_andamento: 'Em andamento', aguardando_cliente: 'Aguardando o cliente', concluido: 'Concluído', cancelado: 'Cancelado' };

// ═════ SOLICITAÇÕES ═════
export function RequestsTab({ clientId, team = [] }) {
  const { data, error, reload } = useApi(`/clients/${clientId}/requests`, [clientId]);
  const [params] = useSearchParams();
  const [open, setOpen] = useState(params.get('r'));
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading rows={5} />;
  if (!data.length) return <Empty title="Nenhuma solicitação do cliente.">Pedidos feitos em “+ Nova solicitação” no portal aparecem aqui, já com responsável e tarefa.</Empty>;
  return (
    <div className="col gap-3">
      {data.map((r) => <RequestCard key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} team={team} reload={reload} />)}
    </div>
  );
}
function RequestCard({ r, open, onToggle, team, reload }) {
  const toast = useToast();
  const [f, setF] = useState({ status: r.status, next_action: r.next_action || '', expected_at: r.expected_at ? r.expected_at.slice(0, 10) : '', assigned_to: r.assigned_to || '', message: '', internal_note: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`/requests/${r.id}`, { ...f, expected_at: f.expected_at ? `${f.expected_at}T21:00:00-03:00` : null, assigned_to: f.assigned_to || null });
      toast(f.message ? 'Atualizado e respondido ao cliente.' : 'Solicitação atualizada.'); setF((x) => ({ ...x, message: '', internal_note: '' })); reload();
    } catch (x) { toast(x.message, 'err'); } finally { setBusy(false); }
  };
  const late = r.expected_at && r.expected_at < new Date().toISOString() && !['concluido', 'cancelado'].includes(r.status);
  return (
    <article className="panel" id={`r-${r.id}`}>
      <button className="row between wrap gap-2" onClick={onToggle} style={{ width: '100%', background: 'none', border: 0, color: 'inherit', cursor: 'pointer', textAlign: 'left', padding: 0 }} aria-expanded={open}>
        <div><div className="sm strong">#{r.number} · {r.title}</div><div className="xs muted">{r.kind_label} · por {r.requester_name} · {ago(r.created_at)} · responsável: {r.owner_name || <b style={{ color: 'var(--err)' }}>SEM RESPONSÁVEL</b>}</div></div>
        <div className="row gap-2"><span className={`tag ${r.status === 'aguardando_cliente' ? 'tag-bordo' : r.status === 'concluido' ? 'tag-ok' : ''}`}>{RSTATUS[r.status]}</span>{late && <span className="tag tag-err">prazo vencido</span>}</div>
      </button>
      {open && (
        <div className="col gap-3 mt-4">
          {r.description && <p className="sm" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{r.description}</p>}
          {r.ref && <Link className="link sm" to={`/conteudos/${r.ref.id}`}>Conteúdo #{r.ref.number} {r.ref.title}</Link>}
          <ul className="list">{r.updates.map((u) => (
            <li key={u.id}><div className="grow"><div className="xs muted">{u.author_name || 'Sistema'} · {fmtDateTime(u.created_at)}{u.status_to ? ` · → ${RSTATUS[u.status_to]}` : ''}{u.visibility === 'internal' ? ' · nota interna' : ''}</div>{u.body && <div className="sm" style={{ whiteSpace: 'pre-wrap' }}>{u.body}</div>}</div></li>
          ))}</ul>
          <div className="grid-2 gap-3">
            <Field label="Status (o cliente vê em linguagem simples)"><select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{Object.entries(RSTATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Responsável"><select className="input" value={f.assigned_to} onChange={(e) => setF({ ...f, assigned_to: e.target.value })}><option value="">Sem responsável</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
            <Field label="Próximo passo (visível ao cliente)"><input className="input" value={f.next_action} onChange={(e) => setF({ ...f, next_action: e.target.value })} /></Field>
            <Field label="Retorno previsto"><input className="input" type="date" value={f.expected_at} onChange={(e) => setF({ ...f, expected_at: e.target.value })} /></Field>
          </div>
          <Field label="Resposta ao cliente (opcional)"><textarea className="input" rows={2} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
          <Field label="Nota interna (o cliente nunca vê)"><textarea className="input" rows={2} value={f.internal_note} onChange={(e) => setF({ ...f, internal_note: e.target.value })} /></Field>
          <div><Button variant="primary" size="sm" disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar'}</Button></div>
        </div>
      )}
    </article>
  );
}

// ═════ DECISÕES PEDIDAS AO CLIENTE ═════
const DKINDS = { escolha: 'Escolha entre opções', confirmacao: 'Confirmação', resposta: 'Resposta estratégica', data: 'Confirmação de data', outro: 'Outra decisão' };
export function DecisionsTab({ clientId, canEdit, sections = [] }) {
  const { data, error, reload } = useApi(`/clients/${clientId}/decisions`, [clientId]);
  const toast = useToast();
  const [form, setForm] = useState(null);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading rows={5} />;
  const create = async () => {
    try { await api.post(`/clients/${clientId}/decisions`, { ...form, options: form.options.split('\n').map((x) => x.trim()).filter(Boolean), due_at: form.due_at ? `${form.due_at}T21:00:00-03:00` : null, brain_section: form.brain_section || null }); toast('Decisão enviada à Central de Decisões do cliente.'); setForm(null); reload(); } catch (x) { toast(x.message, 'err'); }
  };
  return (
    <>
      <div className="row between mb-4"><p className="sm muted" style={{ margin: 0 }}>Peça ao cliente uma escolha, confirmação ou resposta. A resposta é registrada, avisa você e cria a tarefa de sequência.</p>
        {canEdit && <Button size="sm" variant="primary" onClick={() => setForm({ kind: 'escolha', title: '', context: '', consequence: '', options: '', due_at: '', brain_section: '' })}>Pedir decisão</Button>}</div>
      {!data.length ? <Empty title="Nenhuma decisão pedida." /> : (
        <ul className="list">{data.map((d) => (
          <li key={d.id}><div className="grow">
            <div className="sm strong">{d.title}</div>
            <div className="xs muted">{d.kind_label} · {d.status === 'pendente' ? (d.due_at ? `prazo ${fmtDate(d.due_at)}` : 'pendente') : d.status === 'respondida' ? `respondida por ${d.answered_by_name} ${ago(d.answered_at)}` : 'cancelada'}{d.brain_section ? ` · alimenta o Brain: ${SECTION_LABEL[d.brain_section] || d.brain_section}` : ''}</div>
            {d.answer && <div className="sm mt-2">→ {d.answer}{d.answer_note ? ` (${d.answer_note})` : ''}</div>}
          </div>{d.status === 'pendente' && canEdit && <Button size="sm" variant="ghost" onClick={async () => { await api.post(`/decisions/${d.id}/cancel`); reload(); }}>Retirar</Button>}</li>
        ))}</ul>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title="Pedir uma decisão ao cliente">
        {form && <div className="col gap-3">
          <Field label="Tipo"><select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{Object.entries(DKINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Título (o que precisa ser decidido)"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Contexto"><textarea className="input" rows={2} value={form.context} onChange={(e) => setForm({ ...form, context: e.target.value })} /></Field>
          <Field label="Consequência (o que acontece com a resposta)"><input className="input" value={form.consequence} onChange={(e) => setForm({ ...form, consequence: e.target.value })} placeholder="Ex.: com a sua escolha, seguimos para a produção." /></Field>
          {['escolha', 'confirmacao'].includes(form.kind) && <Field label="Opções (uma por linha)" hint={form.kind === 'confirmacao' ? 'Vazio = “Confirmo / Prefiro conversar”' : 'Mínimo de duas'}><textarea className="input" rows={3} value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} /></Field>}
          <div className="grid-2 gap-3">
            <Field label="Prazo"><input className="input" type="date" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} /></Field>
            <Field label="A resposta entra no Client Brain?"><select className="input" value={form.brain_section} onChange={(e) => setForm({ ...form, brain_section: e.target.value })}><option value="">Não</option>{sections.map((s) => <option key={s} value={s}>{SECTION_LABEL[s] || s}</option>)}</select></Field>
          </div>
          <div className="row end gap-2"><Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button><Button variant="primary" disabled={!form.title.trim()} onClick={create}>Enviar ao cliente</Button></div>
        </div>}
      </Modal>
    </>
  );
}

// ═════ SAÚDE DO CLIENTE (interno) ═════
const HL = { estavel: ['🟢', 'Estável'], atencao: ['🟡', 'Atenção'], risco: ['🔴', 'Risco'], sem_dados: ['○', 'Sem dados suficientes'] };
const SL = { ok: 'ok', atencao: 'atenção', risco: 'risco', sem_dados: 'sem dados' };
export function HealthTab({ clientId }) {
  const { data, error } = useApi(`/clients/${clientId}/health`, [clientId]);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading rows={6} />;
  const [g, l] = HL[data.level];
  return (
    <>
      <div className="panel mb-5" style={{ borderColor: data.level === 'risco' ? 'var(--err)' : data.level === 'atencao' ? 'var(--warn)' : 'var(--line)' }}>
        <div className="caps">Saúde do cliente · interno — nunca aparece para o cliente</div>
        <div className="ed-xl mt-2">{g} {l}</div>
        {data.trend && <p className="sm mt-2" style={{ color: data.trend.direction === 'piorou' ? 'var(--err)' : 'var(--ok)' }}>{data.trend.text}</p>}
        <p className="xs muted mt-2">Calculada por regras sobre dados da plataforma em {fmtDateTime(data.computed_at)}. Cada sinal mostra as evidências; sem dados, o sinal fica “sem dados”.</p>
      </div>
      <div className="grid-2 gap-3">{data.signals.map((s) => (
        <div key={s.key} className="panel">
          <div className="row between"><span className="sm strong">{s.label}</span><span className={`tag ${s.level === 'risco' ? 'tag-err' : s.level === 'atencao' ? 'tag-warn' : s.level === 'ok' ? 'tag-ok' : ''}`}>{SL[s.level]}</span></div>
          <ul className="xs muted mt-2" style={{ paddingLeft: 16, margin: '8px 0 0' }}>{s.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      ))}</div>
      <section className="section">
        <div className="section-head"><h2 className="ed-md">Satisfação contextual</h2></div>
        {!data.satisfaction.length ? <Empty title="Nenhuma avaliação ainda.">O cliente é convidado a avaliar só depois de momentos relevantes (aprovação do mês, reunião, onboarding, solicitação concluída), no máximo a cada 14 dias.</Empty> : (
          <ul className="list">{data.satisfaction.map((r) => <li key={r.id}><div className="grow"><div className="sm"><b>{{ excelente: 'Excelente', boa: 'Boa', poderia_melhorar: 'Poderia melhorar' }[r.rating]}</b> · {r.moment.replace('_', ' ')}</div>{r.comment && <div className="sm">“{r.comment}”</div>}<div className="xs muted">{r.user_name} · {fmtDateTime(r.created_at)}</div></div></li>)}</ul>
        )}
      </section>
      {data.history.length > 1 && <p className="xs muted">Histórico de níveis: {data.history.slice(0, 14).map((h) => `${fmtDate(h.created_at)} ${HL[h.level]?.[0] || ''}`).join(' · ')}</p>}
    </>
  );
}

// ═════ MARCA & PULSO ═════
const PF = [['focus', 'Foco atual', 'Ex.: Autoridade'], ['objective', 'Objetivo', 'Ex.: tornar a comunicação mais reconhecível'], ['direction', 'Direção', 'Ex.: mais personalidade + posicionamento'], ['learning', 'Aprendizado recente', 'Algo que aprendemos com dados ou com o cliente'], ['next_focus', 'Próximo foco', '']];
export function PulseTab({ clientId, canEdit }) {
  const pulse = useApi(`/clients/${clientId}/pulse`, [clientId], { live: false });
  const brand = useApi(`/clients/${clientId}/brand`, [clientId]);
  const toast = useToast();
  const [f, setF] = useState(null);
  useEffect(() => { if (pulse.data) setF(Object.fromEntries(PF.map(([k]) => [k, pulse.data[k] || '']))); }, [pulse.data]);
  if (pulse.error) return <ErrorBox error={pulse.error} />;
  if (!pulse.data || !f) return <Loading rows={5} />;
  const save = async (publish) => {
    try { await api.put(`/clients/${clientId}/pulse`, { ...f, publish }); toast(publish ? 'Pulso publicado no portal do cliente.' : 'Rascunho salvo.'); pulse.reload(); } catch (x) { toast(x.message, 'err'); }
  };
  return (
    <div className="grid-2 gap-5">
      <section>
        <div className="section-head"><h2 className="ed-md">Pulso da marca</h2><span className={`tag ${pulse.data.status === 'publicado' ? 'tag-ok' : ''}`}>{pulse.data.status === 'publicado' ? `publicado ${fmtDate(pulse.data.published_at)}` : 'rascunho'}</span></div>
        <p className="xs muted">Estado estratégico atual, em linguagem do cliente. Só campos preenchidos aparecem. Não é relatório de métricas — escreva apenas o que é real.</p>
        {PF.map(([k, l, ph]) => <Field key={k} label={l}><textarea className="input" rows={2} value={f[k]} placeholder={ph} disabled={!canEdit} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}
        {canEdit && <div className="row gap-2 mt-4"><Button size="sm" onClick={() => save(false)}>Salvar rascunho</Button><Button size="sm" variant="primary" onClick={() => save(true)}>Publicar no portal</Button>
          {pulse.data.status === 'publicado' && <Button size="sm" variant="ghost" onClick={async () => { await api.post(`/clients/${clientId}/pulse/unpublish`); pulse.reload(); }}>Retirar do portal</Button>}</div>}
      </section>
      <section>
        <div className="section-head"><h2 className="ed-md">“Sua marca” no portal</h2></div>
        <p className="xs muted">O cliente vê só o que foi compartilhado na Ficha (botão “Compartilhar com o cliente”). Observações internas e sugestões da IA nunca podem ser compartilhadas.</p>
        {!brand.data ? <Loading /> : <>
          <ul className="list">{brand.data.shared.map((e) => <li key={e.id}><div className="grow"><div className="xs muted">{SECTION_LABEL[e.section] || e.section} · {e.origin_label}</div><div className="sm">{e.label ? <b>{e.label}: </b> : null}{e.content.slice(0, 180)}</div></div></li>)}</ul>
          {!brand.data.shared.length && <Empty title="Nada compartilhado ainda." />}
          <h3 className="caps mt-5">Respostas do cliente</h3>
          {!brand.data.confirmations.length ? <p className="xs muted">Nenhuma confirmação ainda.</p> : <ul className="list">{brand.data.confirmations.map((c) => <li key={c.id}><div className="grow"><div className="sm">{c.decision === 'confirmado' ? '✓ Confirmou' : '✎ Pediu atualização'} · {SECTION_LABEL[c.section] || c.section}</div>{c.note && <div className="sm">“{c.note}”</div>}<div className="xs muted">{c.user_name} · {fmtDateTime(c.created_at)}</div></div></li>)}</ul>}
        </>}
      </section>
    </div>
  );
}
