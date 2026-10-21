import { useEffect, useMemo, useState } from 'react';
import { StateNotice } from '../components/State.jsx';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi, useAuth, useToast } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { useCrumbs } from '../components/Shell.jsx';
import { PageHead, Section, Loading, Empty, ErrorBox, Tabs, Button, Modal, Field, Tag, Avatar } from '../components/ui.jsx';
import { fmtDate, fmtTime, fmtDateTime, cleanName, ago } from '../lib/format.js';
import { I } from '../components/Icons.jsx';
import '../styles/intel.css';

const KINDS = { mensal: 'Mensal de conteúdo', alinhamento: 'Alinhamento', onboarding: 'Onboarding / diagnóstico', interna: 'Interna', comercial: 'Comercial' };
const ITEM_KINDS = { decisao: 'Decisão', acao: 'Ação', pendencia: 'Pendência', mudanca_estrategia: 'Mudança de estratégia', solicitacao: 'Solicitação', informacao: 'Informação' };
const SYNC = { sincronizado: ['ok', 'Google Calendar ✓'], nao_sincronizado: [undefined, 'Só na plataforma'], erro: ['err', 'Erro no Google'] };
const local = (iso) => { const d = new Date(new Date(iso).getTime() - 3 * 3600e3); return d.toISOString().slice(0, 16); }; // datetime-local em BRT

export default function Reunioes() {
  useCrumbs('Reuniões');
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  // aba e reunião aberta ficam na URL: abrir uma reunião pela Agenda entra no histórico (voltar devolve a Agenda)
  const tab = params.get('aba') || (params.get('m') ? 'inteligencia' : 'agenda');
  const setTab = (t) => setParams((p) => { const n = new URLSearchParams(p); if (t === 'agenda') n.delete('aba'); else n.set('aba', t); if (t !== 'inteligencia') n.delete('m'); return n; }, { replace: true });
  const { data, error, loading, reload } = useApi('/meetings');
  const [creating, setCreating] = useState(false);
  const sel = params.get('m');
  const setSel = (id, { replace = false } = {}) => setParams(id ? { aba: 'inteligencia', m: id } : {}, { replace: replace || tab === 'inteligencia' });
  if (loading && !data) return <div className="page"><Loading rows={8} /></div>;
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  return (
    <div className="page">
      <PageHead kicker="Central de Reuniões" title="Reunião vira operação." sub="Cada decisão, ação e pendência registrada aqui se conecta ao cliente, ao processo e a uma tarefa com responsável.">
        {auth.can('reunioes', 'create') && <Button variant="primary" magnetic icon={<I.plus size={16} />} onClick={() => setCreating(true)}>Nova reunião</Button>}
      </PageHead>
      <Tabs tabs={[{ key: 'agenda', label: 'Agenda' }, { key: 'inteligencia', label: 'Inteligência' }, { key: 'horarios', label: 'Sala de horários' }]} value={tab} onChange={setTab} />
      {tab === 'agenda' && <Agenda data={data} onOpen={setSel} />}
      {tab === 'inteligencia' && <Intelligence data={data} sel={sel} setSel={setSel} reload={reload} />}
      {tab === 'horarios' && <Slots data={data} reload={reload} />}
      <CreateMeeting open={creating} onClose={() => setCreating(false)} onCreated={(m) => { setCreating(false); reload(); setSel(m.id); }} />
    </div>
  );
}

function MeetingRow({ m, onOpen, selected }) {
  const past = new Date(m.ends_at) < new Date();
  const [tone, label] = SYNC[m.gcal_sync] || [undefined, m.gcal_sync];
  return (
    <div className={`mt-row ${past ? 'past' : ''} ${selected ? 'sel' : ''}`} role="button" tabIndex={0} onClick={() => onOpen(m.id)} onKeyDown={(e) => e.key === 'Enter' && onOpen(m.id)} style={{ cursor: 'pointer' }} data-cursor="ABRIR">
      <div className="when"><div className="d">{fmtTime(m.starts_at)}</div><div className="h">{fmtDate(m.starts_at)}</div></div>
      <div style={{ minWidth: 0 }}>
        <div className="strong clip">{m.title}</div>
        <div className="sm muted">{m.client_name ? `${cleanName(m.client_name)} · ${KINDS[m.kind] || m.kind}` : 'Interna'} · {m.attendees.length} participantes{m.items.length ? ` · ${m.items.length} itens de ata` : ''}</div>
      </div>
      <div className="row wrap gap-2 end">
        {m.status === 'cancelada' ? <Tag tone="err">Cancelada</Tag> : m.status === 'realizada' ? <Tag tone="ok">Realizada</Tag> : <Tag tone="warn">Agendada</Tag>}
        <Tag tone={tone}>{label}</Tag>
      </div>
    </div>
  );
}

function Agenda({ data, onOpen }) {
  const now = new Date().toISOString();
  const upcoming = data.meetings.filter((m) => m.ends_at >= now && m.status !== 'cancelada').sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = data.meetings.filter((m) => m.ends_at < now || m.status === 'cancelada');
  return (
    <>
      <div className="row wrap gap-4 mb-4">
        {data.google === 'conectado' ? <Tag tone="ok">Google Calendar conectado — eventos e convidados sincronizados</Tag>
          : <div style={{ flex: 1, display: 'grid', gap: 8 }}>
              <StateNotice s="aguardando_conexao" title="Google Calendar" action="Configurar em Integrações" to="/integracoes" compact>Sem a conexão, as reuniões ficam registradas só na plataforma, sem evento nem convite no Google.</StateNotice>
              <StateNotice s="aguardando_integracao" title="Google Meet" compact>O link do Meet é criado junto com o evento do Google (código pronto). Até lá, cole o link em “Local / link” ao criar a reunião.</StateNotice>
              <StateNotice s="aguardando_configuracao" title="Transcrição e resumo por IA" compact>Transcrição: colar à mão funciona hoje; a detecção automática depende do Google. Resumos: escrever à mão funciona hoje; “Gerar com IA” depende do Claude.</StateNotice>
            </div>}
      </div>
      <div className="cols">
        <div>
          <Section title="Próximas" kicker={`${upcoming.length} reunião(ões)`}>{upcoming.length ? upcoming.map((m) => <MeetingRow key={m.id} m={m} onOpen={onOpen} />) : <Empty title="Nenhuma reunião agendada." />}</Section>
          <Section title="Realizadas e canceladas">{past.length ? past.slice(0, 20).map((m) => <MeetingRow key={m.id} m={m} onOpen={onOpen} />) : <Empty title="Sem histórico." />}</Section>
        </div>
        <div>
          <Section title="Sala de reunião" kicker="Videochamada dentro da plataforma">
            <StateNotice s="em_desenvolvimento" title="Videochamada nativa" compact>Especificada em docs/modulos/reunioes.md (V2). Não existe ainda.</StateNotice>
            <div className="note-v2 mt-2">
              A videochamada nativa (LiveKit), gravação com consentimento, transcrição e resumos gerados pelo Claude estão especificados em <code>docs/modulos/reunioes.md</code> e entram na V2.
              Hoje a reunião acontece no link registrado em “local” (ex.: Google Meet) e a ata estruturada é feita aqui, na aba Inteligência.
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

function Intelligence({ data, sel, setSel, reload }) {
  const list = [...data.meetings].sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const m = data.meetings.find((x) => x.id === sel) || null;
  useEffect(() => { if (!sel && list[0]) { const firstPast = list.find((x) => x.status === 'realizada') || list[0]; setSel(firstPast.id, { replace: true }); } }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="cols" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.6fr)' }}>
      <div>{list.map((x) => <MeetingRow key={x.id} m={x} onOpen={setSel} selected={x.id === sel} />)}</div>
      <div>{m ? <MeetingDetail key={m.id} m={m} reload={reload} /> : <Empty title="Selecione uma reunião." />}</div>
    </div>
  );
}

function MeetingDetail({ m, reload }) {
  const auth = useAuth();
  const toast = useToast();
  const { data: people } = useApi('/users/directory', [], { live: false });
  const [summary, setSummary] = useState(m.summary || '');
  const [notes, setNotes] = useState(m.notes || '');
  const [agenda, setAgenda] = useState(m.agenda || '');
  const [item, setItem] = useState({ kind: 'acao', body: '', owner_id: '', due_at: '' });
  const [resched, setResched] = useState(null);
  const canEdit = auth.can('reunioes', 'edit') || auth.can('reunioes', 'create');
  const patch = async (body, msg) => { try { await api.patch(`/meetings/${m.id}`, body); toast(msg); reload(); } catch (e) { toast(e.message, 'err'); } };
  const addItem = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/meetings/${m.id}/items`, { ...item, owner_id: item.owner_id || null, due_at: item.due_at ? new Date(`${item.due_at}:00-03:00`).toISOString() : null });
      toast(['acao', 'pendencia', 'solicitacao'].includes(item.kind) ? 'Registrado — tarefa criada e responsável notificado.' : item.kind === 'decisao' || item.kind === 'mudanca_estrategia' ? 'Registrado no Client Brain.' : 'Registrado.');
      setItem({ kind: item.kind, body: '', owner_id: '', due_at: '' }); reload();
    } catch (x) { toast(x.message, 'err'); }
  };
  const grouped = useMemo(() => Object.keys(ITEM_KINDS).map((k) => [k, m.items.filter((i) => i.kind === k)]).filter(([, v]) => v.length), [m.items]);
  return (
    <div>
      <div className="caps">{fmtDateTime(m.starts_at)} — {fmtTime(m.ends_at)} · {KINDS[m.kind] || m.kind}</div>
      <h2 className="ed-lg mt-2">{m.title}</h2>
      <div className="row wrap mt-4 gap-2">
        {m.client_id && <Link className="tag tag-bordo" to={`/clientes/${m.client_id}`}>{cleanName(m.client_name)}</Link>}
        {m.location && <span className="tag">{m.location}</span>}
        <Tag tone={SYNC[m.gcal_sync]?.[0]}>{SYNC[m.gcal_sync]?.[1] || m.gcal_sync}</Tag>
      </div>
      <div className="row wrap mt-4 gap-2">{m.attendees.map((a) => <span key={a.id} className="row gap-2 sm" style={{ marginRight: 10 }}><Avatar name={a.name} tone={a.role_key === 'cliente' ? 'ink' : ''} />{a.name}</span>)}</div>
      {canEdit && m.status === 'agendada' && (
        <div className="row wrap mt-5">
          {new Date(m.starts_at) < new Date() && <Button variant="primary" size="sm" onClick={() => patch({ status: 'realizada' }, 'Reunião marcada como realizada.')}>Marcar como realizada</Button>}
          <Button size="sm" onClick={() => setResched({ s: local(m.starts_at), e: local(m.ends_at) })}>Remarcar</Button>
          <Button size="sm" variant="danger" onClick={() => window.confirm('Cancelar esta reunião? Participantes serão notificados.') && patch({ status: 'cancelada' }, 'Reunião cancelada.')}>Cancelar</Button>
        </div>
      )}
      {resched && (
        <div className="panel mt-4 row wrap gap-4" style={{ alignItems: 'flex-end' }}>
          <Field label="Início"><input className="input" type="datetime-local" value={resched.s} onChange={(e) => setResched({ ...resched, s: e.target.value })} /></Field>
          <Field label="Fim"><input className="input" type="datetime-local" value={resched.e} onChange={(e) => setResched({ ...resched, e: e.target.value })} /></Field>
          <Button variant="primary" onClick={async () => { await patch({ starts_at: new Date(`${resched.s}:00-03:00`).toISOString(), ends_at: new Date(`${resched.e}:00-03:00`).toISOString() }, 'Reunião remarcada — participantes notificados.'); setResched(null); }}>Salvar</Button>
          <Button variant="ghost" onClick={() => setResched(null)}>Cancelar</Button>
        </div>
      )}

      <Section title="Pauta e ata" kicker="A pauta aparece para o cliente; a ata é interna">
        {m.client_id && <Field label="Pauta (visível ao cliente no portal)"><textarea className="textarea" value={agenda} onChange={(e) => setAgenda(e.target.value)} disabled={!canEdit} placeholder="O que vamos tratar." /></Field>}
        <div className="mt-4"><Field label="Ata interna"><textarea className="textarea" value={summary} onChange={(e) => setSummary(e.target.value)} disabled={!canEdit} placeholder="O que foi tratado (interno — o cliente vê só o resumo aprovado abaixo)." /></Field></div>
        <div className="mt-4"><Field label="Notas internas"><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} placeholder="Observações da equipe (não visíveis ao cliente)." /></Field></div>
        {canEdit && <Button size="sm" className="mt-4" onClick={() => patch({ summary, notes, agenda }, 'Salvo.')} disabled={summary === (m.summary || '') && notes === (m.notes || '') && agenda === (m.agenda || '')}>Salvar</Button>}
      </Section>
      <PostMeeting m={m} canEdit={canEdit} people={people || []} reload={reload} />

      <Section title="Decisões, ações e pendências" kicker="Cada ação vira tarefa com responsável">
        {grouped.length ? grouped.map(([k, list]) => list.map((it) => (
          <div key={it.id} className="row-top" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
            <span className={`item-kind k-${k}`}>{ITEM_KINDS[k]}</span>
            <div className="grow"><div className="sm">{it.body}</div><div className="xs faint">{[it.owner_name && `Responsável: ${it.owner_name}`, it.due_at && `Prazo: ${fmtDateTime(it.due_at)}`, it.task_id && 'tarefa criada ✓', it.origin === 'ia' && 'sugerido por IA'].filter(Boolean).join(' · ')}</div></div>
          </div>
        ))) : <Empty title="Nenhum item registrado.">Registre decisões e ações — elas alimentam o Client Brain e criam tarefas.</Empty>}
        {canEdit && (
          <form onSubmit={addItem} className="panel mt-5 col gap-4">
            <div className="row wrap gap-2">{Object.entries(ITEM_KINDS).map(([k, l]) => <button type="button" key={k} className={`tag ${item.kind === k ? 'tag-bordo' : ''}`} style={{ cursor: 'pointer', background: item.kind === k ? undefined : 'none' }} onClick={() => setItem({ ...item, kind: k })}>{l}</button>)}</div>
            <textarea className="textarea" required placeholder={item.kind === 'acao' ? 'Ex.: Vitória vai enviar o cronograma até sexta.' : 'Descreva.'} value={item.body} onChange={(e) => setItem({ ...item, body: e.target.value })} style={{ minHeight: 70 }} />
            {['acao', 'pendencia', 'solicitacao'].includes(item.kind) && (
              <div className="grid-2">
                <Field label="Responsável"><select className="select" value={item.owner_id} onChange={(e) => setItem({ ...item, owner_id: e.target.value })}><option value="">Sem responsável (vira pendência)</option>{(people || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
                <Field label="Prazo"><input className="input" type="datetime-local" value={item.due_at} onChange={(e) => setItem({ ...item, due_at: e.target.value })} /></Field>
              </div>
            )}
            <div className="row end"><Button variant="primary" type="submit" magnetic>Registrar {ITEM_KINDS[item.kind].toLowerCase()}</Button></div>
          </form>
        )}
      </Section>
    </div>
  );
}

// PÓS-REUNIÃO — transcrição → dois resumos (CLIENTE e INTERNO). A IA gera rascunhos; uma pessoa revisa.
// O resumo do cliente só é publicado depois da verificação de vazamento; o interno vira registros item a item.
const lines = (a) => (a || []).map((x) => (typeof x === 'string' ? x : [x.what, x.who || x.owner_hint, x.when || x.due].filter(Boolean).join(' | '))).join('\n');
const unlines = (t, struct) => t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { if (!struct) return l; const [what, who, when] = l.split('|').map((x) => x.trim()); return struct === 'step' ? { what, who: who || null, when: when || null } : { what, owner_hint: who || null, due: when || null }; });
function PostMeeting({ m, canEdit, people, reload }) {
  const toast = useToast();
  const { data, reload: again } = useApi(`/meetings/${m.id}/post`, [m.id], { live: false });
  const [tr, setTr] = useState('');
  const [busy, setBusy] = useState(false);
  const [cs, setCs] = useState(null);
  const [is, setIs] = useState(null);
  const [pick, setPick] = useState({});
  const client = data?.summaries.find((x) => x.audience === 'client');
  const internal = data?.summaries.find((x) => x.audience === 'internal');
  useEffect(() => { if (!data) return; const c = client?.content || {}; setCs({ decisions: lines(c.decisions), next_steps: lines(c.next_steps), info: lines(c.info) }); const i = internal?.content || {}; setIs({ decisions: lines(i.decisions), tasks: lines(i.tasks), blockers: lines(i.blockers), risks: lines(i.risks), dependencies: lines(i.dependencies), notes: lines(i.notes) }); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data || !cs || !is) return <Section title="Pós-reunião"><Loading /></Section>;
  const run = async (fn, msg) => { setBusy(true); try { const r = await fn(); if (r?.status && r.status !== 'ok') toast(r.message, 'err'); else if (msg) toast(msg); again(); reload(); } catch (x) { toast(x.message, 'err'); } finally { setBusy(false); } };
  const saveClient = () => api.put(`/meetings/${m.id}/summaries/client`, { content: { decisions: unlines(cs.decisions), next_steps: unlines(cs.next_steps, 'step'), info: unlines(cs.info) } });
  const saveInternal = () => api.put(`/meetings/${m.id}/summaries/internal`, { content: { decisions: unlines(is.decisions), tasks: unlines(is.tasks, 'task'), blockers: unlines(is.blockers), risks: unlines(is.risks), dependencies: unlines(is.dependencies), notes: unlines(is.notes) } });
  const candidates = [...unlines(is.decisions).map((b) => ({ kind: 'decisao', body: b })), ...unlines(is.tasks, 'task').map((t) => ({ kind: 'acao', body: t.what, hint: t.owner_hint, due: t.due })), ...unlines(is.blockers).map((b) => ({ kind: 'pendencia', body: b }))];
  const detected = data.transcripts.find((t) => t.status === 'detectada_sem_acesso');
  return (
    <Section title="Pós-reunião" kicker="Transcrição → resumo do cliente + resumo interno">
      <div className="col gap-3">
        <div className="xs muted">{data.transcripts.filter((t) => t.status === 'pronta').length ? `Transcrição registrada (${data.transcripts.filter((t) => t.status === 'pronta').map((t) => `${t.source}, ${fmtDateTime(t.created_at)}`).join(' · ')}).` : 'Nenhuma transcrição registrada.'}</div>
        {detected && <div className="panel sm" style={{ borderColor: 'var(--warn)' }}>O Google anexou “{detected.source_ref}” ao evento. A integração atual não lê documentos do Drive: abra o arquivo, copie o texto e cole abaixo.</div>}
        {canEdit && <>
          <Field label="Colar transcrição ou anotações"><textarea className="textarea" value={tr} onChange={(e) => setTr(e.target.value)} placeholder="Cole aqui a transcrição do Meet (ou anotações completas)." style={{ minHeight: 90 }} /></Field>
          <div className="row gap-2 wrap">
            <Button size="sm" disabled={busy || tr.trim().length < 40} onClick={() => run(() => api.post(`/meetings/${m.id}/transcript`, { body: tr }).then(() => setTr('')), 'Transcrição registrada.')}>Registrar transcrição</Button>
            <Button size="sm" variant="primary" disabled={busy || !data.transcripts.some((t) => t.status === 'pronta')} onClick={() => run(() => api.post(`/meetings/${m.id}/summaries/generate`), 'Rascunhos gerados — revise antes de publicar.')}>Gerar resumos com IA</Button>
          </div>
        </>}
        {m.client_id && (
          <div className="panel">
            <div className="row between wrap"><span className="sm strong">Resumo do CLIENTE</span><span className="xs muted">{client ? `${client.status === 'publicado' ? `publicado ${fmtDateTime(client.published_at)}` : 'rascunho'} · V${client.version}${client.generated_by === 'ia' ? ' · gerado por IA' : ''}` : 'não iniciado'}</span></div>
            <p className="xs muted">Sem problemas internos, custos, prioridades internas ou nomes de outros clientes. Uma linha por item; próximos passos: “o quê | quem | quando”.</p>
            {[['decisions', 'Decisões'], ['next_steps', 'Próximos passos (o quê | quem | quando)'], ['info', 'Informações relevantes']].map(([k, l]) => <Field key={k} label={l}><textarea className="textarea" value={cs[k]} disabled={!canEdit} onChange={(e) => setCs({ ...cs, [k]: e.target.value })} style={{ minHeight: 60 }} /></Field>)}
            {client?.leak_check?.length > 0 && <div className="sm mt-2" style={{ color: 'var(--err)' }}>Verificação de vazamento: {client.leak_check.join(' · ')}</div>}
            {canEdit && <div className="row gap-2 mt-4"><Button size="sm" disabled={busy} onClick={() => run(saveClient, 'Rascunho do cliente salvo.')}>Salvar rascunho</Button><Button size="sm" variant="primary" disabled={busy} onClick={() => run(async () => { await saveClient(); return api.post(`/meetings/${m.id}/summaries/client/publish`); }, 'Resumo publicado no portal — cliente notificado.')}>Aprovar e publicar ao cliente</Button></div>}
          </div>
        )}
        <div className="panel">
          <div className="row between wrap"><span className="sm strong">Resumo INTERNO</span><span className="xs muted">{internal ? `V${internal.version}${internal.generated_by === 'ia' ? ' · gerado por IA' : ''}${internal.status === 'publicado' ? ' · aplicado' : ''}` : 'não iniciado'}</span></div>
          {[['decisions', 'Decisões'], ['tasks', 'Tarefas (o quê | responsável | prazo)'], ['blockers', 'Bloqueios'], ['risks', 'Riscos'], ['dependencies', 'Dependências'], ['notes', 'Observações internas']].map(([k, l]) => <Field key={k} label={l}><textarea className="textarea" value={is[k]} disabled={!canEdit} onChange={(e) => setIs({ ...is, [k]: e.target.value })} style={{ minHeight: 50 }} /></Field>)}
          {canEdit && <Button size="sm" className="mt-2" disabled={busy} onClick={() => run(saveInternal, 'Resumo interno salvo.')}>Salvar resumo interno</Button>}
          {canEdit && candidates.length > 0 && (
            <div className="mt-4">
              <div className="caps mb-2">Transformar em registros (tarefas, decisões, Client Brain)</div>
              {candidates.map((c, i) => (
                <label key={i} className="row gap-2 sm" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                  <input type="checkbox" checked={!!pick[i]} onChange={(e) => setPick({ ...pick, [i]: e.target.checked ? { owner_id: '', due_at: '' } : undefined })} />
                  <span className="tag">{ITEM_KINDS[c.kind]}</span><span className="grow">{c.body}{c.hint ? <span className="muted"> · sugerido: {c.hint}</span> : null}{c.due ? <span className="muted"> · {c.due}</span> : null}</span>
                  {pick[i] && c.kind !== 'decisao' && <select className="select" value={pick[i].owner_id} onChange={(e) => setPick({ ...pick, [i]: { ...pick[i], owner_id: e.target.value } })}><option value="">Responsável…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
                  {pick[i] && c.kind !== 'decisao' && <input className="input" type="date" value={pick[i].due_at} onChange={(e) => setPick({ ...pick, [i]: { ...pick[i], due_at: e.target.value } })} />}
                </label>
              ))}
              <Button size="sm" variant="primary" className="mt-4" disabled={busy || !Object.values(pick).some(Boolean)} onClick={() => run(async () => { await saveInternal(); const r = await api.post(`/meetings/${m.id}/summaries/internal/apply`, { items: candidates.map((c, i) => pick[i] && { kind: c.kind, body: c.body, owner_id: pick[i].owner_id || null, due_at: pick[i].due_at ? `${pick[i].due_at}T21:00:00-03:00` : null }).filter(Boolean) }); setPick({}); return r; }, 'Registros criados: tarefas atribuídas e decisões no Client Brain.')}>Criar registros selecionados</Button>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

function CreateMeeting({ open, onClose, onCreated }) {
  const toast = useToast();
  const { data: clients } = useApi(open ? '/clients' : null, [open], { live: false });
  const { data: people } = useApi(open ? '/users/directory' : null, [open], { live: false });
  const base = () => { const d = new Date(Date.now() + 864e5); d.setUTCHours(13, 0, 0, 0); return local(d.toISOString()); };
  const [f, setF] = useState({ title: '', client_id: '', kind: 'mensal', start: base(), duration: 60, attendees: [], location: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const s = new Date(`${f.start}:00-03:00`);
      const m = await api.post('/meetings', { title: f.title, client_id: f.client_id || null, kind: f.kind, starts_at: s.toISOString(), ends_at: new Date(s.getTime() + f.duration * 60e3).toISOString(), attendees: f.attendees, location: f.location || undefined });
      toast(m.gcal_sync === 'sincronizado' ? 'Reunião criada e enviada ao Google Calendar.' : 'Reunião criada na plataforma.');
      onCreated(m);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Nova reunião" wide>
      <form onSubmit={submit} className="col gap-4">
        <Field label="Título"><input className="input" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Título da reunião" /></Field>
        <div className="grid-3">
          <Field label="Cliente (opcional)"><select className="select" value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })}><option value="">Reunião interna</option>{(clients || []).map((c) => <option key={c.id} value={c.id}>{cleanName(c.name)}</option>)}</select></Field>
          <Field label="Tipo"><select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Local / link"><input className="input" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Google Meet, presencial…" /></Field>
        </div>
        <div className="grid-2">
          <Field label="Início"><input className="input" type="datetime-local" required value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label="Duração"><select className="select" value={f.duration} onChange={(e) => setF({ ...f, duration: Number(e.target.value) })}>{[30, 45, 60, 90, 120].map((d) => <option key={d} value={d}>{d} min</option>)}</select></Field>
        </div>
        <Field label="Participantes da equipe" hint={f.client_id ? 'A equipe vinculada ao cliente e o próprio cliente são adicionados automaticamente.' : null}>
          <div className="row wrap gap-2">{(people || []).map((p) => { const on = f.attendees.includes(p.id); return <button type="button" key={p.id} className={`tag ${on ? 'tag-bordo' : ''}`} style={{ cursor: 'pointer', background: on ? undefined : 'none' }} onClick={() => setF({ ...f, attendees: on ? f.attendees.filter((x) => x !== p.id) : [...f.attendees, p.id] })} aria-pressed={on}>{on ? '✓ ' : ''}{p.name}</button>; })}</div>
        </Field>
        {err && <div className="hint-err" role="alert">{err}</div>}
        <div className="row end"><Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button><Button variant="primary" magnetic type="submit" disabled={busy}>{busy ? 'Verificando agenda…' : 'Criar reunião'}</Button></div>
      </form>
    </Modal>
  );
}

function Slots({ data, reload }) {
  const auth = useAuth();
  const toast = useToast();
  const { data: people } = useApi('/users/directory', [], { live: false });
  const [f, setF] = useState({ date: '', from: '10:00', to: '17:00', duration: 60, host_id: '', label: 'Reuniões mensais' });
  const canManage = auth.can('reunioes', 'edit') || auth.can('reunioes', 'admin');
  const byDay = useMemo(() => { const m = {}; for (const s of data.slots) (m[s.starts_at.slice(0, 10)] ||= []).push(s); return Object.entries(m); }, [data.slots]);
  const create = async (e) => {
    e.preventDefault();
    try { const r = await api.post('/meetings/slots', { ...f, host_id: f.host_id || undefined, skip: ['12:00'] }); toast(`${r.length} horários abertos para clientes.`); reload(); } catch (x) { toast(x.message, 'err'); }
  };
  const del = async (id) => { try { await api.del(`/meetings/slots/${id}`); toast('Horário removido.'); reload(); } catch (x) { toast(x.message, 'err'); } };
  return (
    <div className="cols">
      <div>
        <Section title="Horários disponíveis aos clientes" kicker="O cliente vê só horários livres e reserva pelo portal">
          {byDay.length ? byDay.map(([d, list]) => (
            <div key={d} className="mb-5">
              <div className="caps mb-2">{fmtDate(list[0].starts_at, { weekday: 'long' })}</div>
              <div className="slots">{list.map((s) => (
                <div key={s.id} className={`slot ${s.meeting_id ? 'booked' : ''}`}>
                  <div><div className="strong">{fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}</div><div className="xs muted">{s.meeting_id ? cleanName(s.client_name || 'Reservado') : s.host_name || 'livre'}</div></div>
                  {!s.meeting_id && canManage && <Button size="sm" variant="ghost" icon={<I.x size={14} />} onClick={() => del(s.id)} aria-label="Remover horário" />}
                </div>
              ))}</div>
            </div>
          )) : <Empty title="Nenhuma janela aberta." />}
        </Section>
      </div>
      <div>
        {canManage ? (
          <Section title="Abrir janela de reuniões" kicker="Ex.: DIA DE REUNIÃO 9, 10, 11 e 13/11">
            <form className="col gap-4" onSubmit={create}>
              <Field label="Data"><input className="input" type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
              <div className="grid-2">
                <Field label="De"><input className="input" type="time" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
                <Field label="Até"><input className="input" type="time" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
              </div>
              <div className="grid-2">
                <Field label="Duração"><select className="select" value={f.duration} onChange={(e) => setF({ ...f, duration: Number(e.target.value) })}>{[30, 45, 60, 90].map((d) => <option key={d} value={d}>{d} min</option>)}</select></Field>
                <Field label="Anfitrião"><select className="select" value={f.host_id} onChange={(e) => setF({ ...f, host_id: e.target.value })}><option value="">Eu</option>{(people || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
              </div>
              <Field label="Rótulo da janela"><input className="input" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
              <p className="xs muted" style={{ margin: 0 }}>O horário de 12:00 é pulado (almoço). Na reserva, a plataforma verifica conflitos na agenda interna e no Google Calendar (quando conectado) e impede reserva duplicada.</p>
              <Button variant="primary" magnetic type="submit">Abrir horários</Button>
            </form>
          </Section>
        ) : <Empty title="Somente gestão pode abrir horários." />}
      </div>
    </div>
  );
}
