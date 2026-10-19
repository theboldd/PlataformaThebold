import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, uploadWithProgress } from '../lib/api.js';
import { useApi, useAuth, useToast } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Button, Empty, ErrorBox, Field, Format, Loading, Modal, Risk, Status, Tabs, Timeline } from '../components/ui.jsx';
import { MediaView } from '../components/MediaView.jsx';
import { I } from '../components/Icons.jsx';
import { fmtDate, fmtDateTime, ago, cleanName, bytes } from '../lib/format.js';
import { FUNCTIONS, PRIORITY } from '../lib/status.js';
import { AdjustModal } from './production/AdjustModal.jsx';
import { VersionChips, CompareVersions, versionStatusLabel } from './production/Versions.jsx';
import { Comments } from './production/Comments.jsx';
import { Dropzone } from './production/Dropzone.jsx';
import '../styles/production.css';
import { useUrlState } from '../lib/nav.jsx';

const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); const off = d.getTimezoneOffset(); return new Date(d.getTime() - off * 60e3).toISOString().slice(0, 16); };
const REVIEW_STAGES = ['analise_cronograma', 'analise_producao', 'revisao_ajuste'];
const CLIENT_STAGES = ['aprovacao_tema', 'aprovacao_cliente'];

export default function ConteudoDetalhe() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi(`/contents/${id}`, [id]);
  const auth = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [vid, setVid] = useState(null);
  const [tab, setTab] = useUrlState('aba', 'comentarios');
  const [compare, setCompare] = useState(false);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  useCrumbs('Conteúdos', data ? `#${data.content.number} ${data.content.title}` : '…');
  useEffect(() => { if (data && (!vid || !data.versions.some((v) => v.id === vid))) setVid(data.content.current_version_id || data.versions[0]?.id || null); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  if (loading || !data) return <div className="page"><Loading rows={8} /></div>;
  const { content: c, stage, next_action: na, risk, versions, tasks, adjustments, approvals, comments, history, permissions: pm, client } = data;
  const version = versions.find((v) => v.id === vid) || versions[0];
  const current = versions.find((v) => v.id === c.current_version_id);
  const myOpen = tasks.filter((t) => t.assignee_id === auth.user.id && ['aberta', 'em_andamento'].includes(t.status));
  const openTasks = tasks.filter((t) => ['aberta', 'em_andamento'].includes(t.status));
  const final = ['publicado', 'cancelado'].includes(c.stage);
  // Mídia/legenda só mudam nas etapas de produção/ajuste (quem aprova pode editar em qualquer etapa antes do agendamento)
  const canEditMedia = pm.edit && !final && c.stage !== 'agendado' && (['cronograma', 'ajuste_cronograma', 'producao', 'ajuste_interno', 'ajuste_cliente'].includes(c.stage) || pm.approve);

  const act = async (fn, msg) => {
    setBusy(true);
    try { await fn(); if (msg) toast(msg); setModal(null); await reload(); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const completeTask = (t) => act(() => api.post(`/tasks/${t.id}/complete`), `Concluído: ${t.title.split(' — ')[0]}. O processo avançou.`);

  return (
    <div className="page">
      <header className="dossie-head">
        <div>
          <div className="row wrap gap-2 caps"><Link to={`/clientes/${client.id}`} className="bordo">{cleanName(client.name)}</Link><span>·</span><Format f={c.format} /><span>·</span><span>#{c.number}</span></div>
          <h1 className="ed-xl mt-2">{c.title}</h1>
          <div className="row wrap gap-4 mt-4">
            <Status s={c.status} />
            <span className="sm"><span className="muted">Etapa </span>{stage.label}</span>
            <span className="sm"><span className="muted">Publicação </span>{c.planned_at ? fmtDateTime(c.planned_at) : '—'}</span>
            {c.scheduled_at && <span className="sm"><span className="muted">Agendado </span>{fmtDateTime(c.scheduled_at)} {c.schedule_mode === 'externo' ? '(externo)' : c.schedule_mode === 'meta_erro' ? '(falha Meta)' : '(Meta)'}</span>}
            <span className="sm"><span className="muted">Prioridade </span>{PRIORITY[c.priority]}</span>
            <Risk level={risk.level} />
          </div>
        </div>
        <div className="row wrap gap-2">
          {pm.edit && !final && <Button variant="ghost" size="sm" icon={<I.edit size={14} />} onClick={() => setModal('edit')}>Editar</Button>}
          {auth.can('conteudos', 'create') && <Button variant="ghost" size="sm" onClick={() => act(async () => { const n = await api.post(`/contents/${c.id}/duplicate`); nav(`/conteudos/${n.id}`); }, 'Estrutura duplicada.')}>Duplicar</Button>}
        </div>
      </header>

      <div className="next-action mb-5">
        <div className="caps">Próxima ação</div>
        <div className="sm mt-2"><b>{na.who || '—'}</b>{na.who ? ' · ' : ''}{na.text}{na.unassigned && <span style={{ color: 'var(--err)' }}> — existe tarefa sem responsável</span>}</div>
        {risk.reasons?.length > 0 && <div className="xs mt-2" style={{ color: 'var(--err)' }}>{risk.reasons.join(' · ')}</div>}
        {c.blocked ? <div className="xs mt-2" style={{ color: 'var(--err)' }}>■ Bloqueado — {c.block_reason} (aguardando {c.waiting_on})</div> : null}
      </div>

      <div className="cd-grid">
        <div className="cd-media">
          {versions.length ? (
            <>
              <div className="row between wrap mb-2">
                <VersionChips versions={versions} value={version?.id} onChange={setVid} approvedId={c.approved_version_id} />
                {versions.length > 1 && <Button size="sm" variant="ghost" onClick={() => setCompare(true)}>Comparar versões</Button>}
              </div>
              <MediaView media={version?.media || []} />
              <div className="xs faint mt-2">V{version?.number} · {versionStatusLabel(version)}{version?.author ? ` · por ${version.author}` : ''} · {fmtDateTime(version?.created_at)}{version?.id === c.approved_version_id ? ` · ✓ aprovada por ${version.approver} em ${fmtDateTime(version.approved_at)}` : ''}</div>
              {version?.media?.length > 0 && <div className="row wrap gap-2 mt-2">{version.media.map((m, i) => <a key={m.id} className="xs muted" href={m.urls.download} title="Baixar original"><I.download size={12} style={{ display: 'inline', verticalAlign: -2 }} /> {i + 1}. {m.width}×{m.height}{m.fps ? ` · ${m.fps}fps` : ''} · {bytes(m.size)}</a>)}</div>}
            </>
          ) : <div className="mv-empty" style={{ aspectRatio: '4 / 5' }}><div className="col" style={{ alignItems: 'center', textAlign: 'center', padding: 24 }}><span className="ed-md">Ainda sem versão</span><span className="sm muted">Na etapa de produção, o arquivo final e a legenda criam a V1.</span></div></div>}
        </div>

        <div className="col gap-6">
          <ActionsPanel data={data} myOpen={myOpen} busy={busy} onComplete={completeTask} setModal={setModal} act={act} />

          <section>
            <div className="section-head"><h2 className="ed-md">Legenda</h2>{version && <span className="xs faint">V{version.number}</span>}</div>
            <CaptionEditor key={(current?.id || 'none') + (version?.id || '')} content={c} version={version} current={current} canEdit={canEditMedia} onSaved={reload} />
          </section>

          {canEditMedia && (
            <section>
              <div className="section-head"><h2 className="ed-md">Arquivos</h2><span className="xs faint">{current?.locked ? `V${current.number} já enviada — o upload cria V${current.number + 1}` : current ? `editando V${current.number}` : 'cria a V1'}</span></div>
              <Upload content={c} myOpen={myOpen} onDone={reload} />
            </section>
          )}

          <section>
            <Tabs value={tab} onChange={setTab} tabs={[
              { key: 'comentarios', label: 'Comentários', count: comments.length },
              { key: 'tarefas', label: 'Tarefas', count: openTasks.length },
              { key: 'ajustes', label: 'Ajustes', count: adjustments.length },
              { key: 'aprovacoes', label: 'Aprovações', count: approvals.length },
              { key: 'detalhes', label: 'Briefing' },
              { key: 'historico', label: 'Histórico' },
            ]} />
            {tab === 'comentarios' && <Comments contentId={c.id} comments={comments} onChange={reload} mediaCount={current?.media?.length || 0} />}
            {tab === 'tarefas' && <TasksList tasks={tasks} me={auth.user.id} onComplete={completeTask} />}
            {tab === 'ajustes' && (!adjustments.length ? <Empty title="Nenhum ajuste." /> : adjustments.map((a) => (
              <div key={a.id} className="task-row" style={{ alignItems: 'flex-start' }}>
                <span className={`tag ${a.origin === 'cliente' ? 'tag-warn' : 'tag-info'}`}>{a.origin}</span>
                <div className="grow">
                  <div className={a.status !== 'aberto' ? 'done' : ''}>{a.description}</div>
                  <div className="xs faint">{a.requested_by_name} → {a.assigned_name || 'sem responsável'} · sobre V{a.version_number || '—'}{a.carousel_page ? ` · página ${a.carousel_page}` : ''}{a.video_timestamp != null ? ` · ${a.video_timestamp}s` : ''}{a.size === 'simples' ? ' · simples' : ''} · {ago(a.created_at)}</div>
                </div>
                <span className={`tag ${a.status === 'aberto' ? 'tag-err' : 'tag-ok'}`}>{a.status}</span>
              </div>
            )))}
            {tab === 'aprovacoes' && (!approvals.length ? <Empty title="Sem aprovações registradas." /> : approvals.map((a) => (
              <div key={a.id} className="task-row" style={{ alignItems: 'flex-start' }}>
                <span className={`tag ${a.decision === 'aprovado' ? 'tag-ok' : 'tag-err'}`}>{a.decision === 'aprovado' ? '✓ aprovado' : 'ajuste'}</span>
                <div className="grow">
                  <div><b>{a.user_name}</b> · {{ tema: 'tema', interna: 'revisão interna', cliente: 'cliente' }[a.kind]}{a.version_number ? ` · V${a.version_number}` : ''}</div>
                  {a.note && <div className="sm muted">{a.note}</div>}
                  <div className="xs faint">{fmtDateTime(a.created_at)}{a.ip ? ` · IP ${a.ip}` : ''}</div>
                </div>
              </div>
            )))}
            {tab === 'detalhes' && (
              <dl className="kv">
                <dt>Tema</dt><dd>{c.theme || '—'}</dd>
                <dt>Objetivo</dt><dd>{c.objective || '—'}</dd>
                <dt>Estratégia</dt><dd className="row wrap gap-1">{c.strategy_tags.length ? c.strategy_tags.map((t) => <span key={t} className="tag">{t}</span>) : '—'}</dd>
                <dt>Referência</dt><dd>{c.reference || '—'}</dd>
                <dt>Material</dt><dd>{c.material_url ? <a className="link" href={c.material_url} target="_blank" rel="noreferrer">Abrir material ↗</a> : '—'}</dd>
                <dt>Briefing</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{c.briefing || '—'}</dd>
                <dt>Interno</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{c.internal_notes || '—'}</dd>
                <dt>Ciclo</dt><dd>{c.cycle_month || '—'}{data.cycle ? ` · ${data.cycle.status.replace('_', ' ')}` : ''}</dd>
                <dt>Rodadas</dt><dd>{c.revision_rounds} ajuste(s) interno(s) · {c.client_adjust_rounds} do cliente</dd>
                <dt>Material</dt><dd>{{ nao_necessario: 'Não necessário', aguardando: 'Aguardando cliente', recebido: 'Recebido' }[c.material_status]}</dd>
              </dl>
            )}
            {tab === 'historico' && <Timeline items={history} />}
          </section>
        </div>
      </div>

      <Modal open={compare} onClose={() => setCompare(false)} title="Comparar versões" wide><CompareVersions versions={versions} approvedId={c.approved_version_id} /></Modal>
      <AdjustModal open={modal === 'adjust'} onClose={() => setModal(null)} busy={busy} isCronograma={c.stage === 'analise_cronograma'}
        producers={tasks.filter((t) => t.completed_by && ['design', 'edicao', 'copy'].includes(t.function)).map((t) => ({ id: t.completed_by }))}
        onSubmit={(body) => act(() => api.post(`/contents/${c.id}/review`, body), 'Ajuste enviado. Tarefas criadas e responsáveis notificados.')} />
      <EditModal open={modal === 'edit'} onClose={() => setModal(null)} c={c} onSave={(b) => act(() => api.patch(`/contents/${c.id}`, b), 'Alterações salvas.')} busy={busy} />
      <ClientDecisionModal open={modal === 'client'} onClose={() => setModal(null)} c={c} busy={busy} onSave={(b) => act(() => api.post(`/contents/${c.id}/client-decision`, b), b.decision === 'aprovar' ? 'Aprovação do cliente registrada.' : 'Ajuste do cliente registrado.')} />
      <BlockModal open={modal === 'block'} onClose={() => setModal(null)} busy={busy} onSave={(b) => act(() => api.post(`/contents/${c.id}/block`, b), 'Conteúdo bloqueado — pendência criada.')} />
      <ScheduleModal open={modal === 'schedule'} onClose={() => setModal(null)} c={c} meta={data.meta_connected} busy={busy} onSave={(b) => act(() => api.post(`/contents/${c.id}/schedule`, b), b.mode === 'meta' ? 'Agendado para publicação via Meta.' : 'Marcado como agendado externamente.')} />
      <ReasonModal open={modal === 'cancel'} title="Cancelar conteúdo" label="Motivo do cancelamento" danger onClose={() => setModal(null)} busy={busy} onSave={(reason) => act(() => api.post(`/contents/${c.id}/cancel`, { reason }), 'Conteúdo cancelado.')} />
      <ReturnModal open={modal === 'return'} onClose={() => setModal(null)} c={c} busy={busy} onSave={(b) => act(() => api.post(`/contents/${c.id}/return`, b), 'Conteúdo devolvido.')} />
    </div>
  );
}

function ActionsPanel({ data, myOpen, busy, onComplete, setModal, act }) {
  const { content: c, permissions: pm } = data;
  const final = ['publicado', 'cancelado'].includes(c.stage);
  const canReview = REVIEW_STAGES.includes(c.stage) && (pm.review || myOpen.some((t) => t.kind === 'etapa'));
  const items = [];
  myOpen.filter((t) => !(REVIEW_STAGES.includes(c.stage) && t.kind === 'etapa')).forEach((t) => items.push(
    <Button key={t.id} variant="primary" magnetic disabled={busy} onClick={() => onComplete(t)} icon={<I.check size={14} />} data-cursor="CONCLUIR">
      {t.kind === 'ajuste' ? 'Concluir ajuste' : t.kind === 'agendamento' ? 'Concluir agendamento' : `Concluir: ${t.title.split(' — ')[0]}`}
    </Button>,
  ));
  if (canReview) {
    items.push(<Button key="ap" variant="primary" magnetic disabled={busy} onClick={() => act(() => api.post(`/contents/${c.id}/review`, { decision: 'aprovar' }), c.stage === 'analise_cronograma' ? 'Tema aprovado internamente.' : 'Aprovado — enviado ao cliente.')} icon={<I.check size={14} />} data-cursor="APROVAR">{c.stage === 'revisao_ajuste' ? 'Ajuste conferido' : 'Aprovar'}{c.stage === 'analise_producao' ? ' e enviar ao cliente' : ''}</Button>);
    items.push(<Button key="aj" magnetic disabled={busy} onClick={() => setModal('adjust')}>Solicitar ajuste</Button>);
  }
  if (CLIENT_STAGES.includes(c.stage) && pm.admin) items.push(<Button key="cd" disabled={busy} onClick={() => setModal('client')}>Registrar decisão do cliente</Button>);
  if (['agendamento', 'agendado'].includes(c.stage) && (pm.approve || myOpen.some((t) => t.kind === 'agendamento'))) items.push(<Button key="sc" variant={c.stage === 'agendamento' ? 'primary' : undefined} magnetic disabled={busy} onClick={() => setModal('schedule')} data-cursor="AGENDAR">{c.stage === 'agendado' ? 'Reagendar' : 'Agendar'}</Button>);
  if (c.stage === 'agendado' && (pm.approve || pm.edit)) items.push(<Button key="pb" disabled={busy} onClick={() => act(() => api.post(`/contents/${c.id}/published`, {}), 'Publicação confirmada.')}>Confirmar publicação</Button>);
  const secondary = [];
  if (pm.edit && !final) secondary.push(c.blocked
    ? <Button key="ub" size="sm" disabled={busy} onClick={() => act(() => api.post(`/contents/${c.id}/unblock`, { note: 'destravado manualmente' }), 'Conteúdo desbloqueado.')}>Desbloquear</Button>
    : <Button key="bl" size="sm" variant="ghost" disabled={busy} onClick={() => setModal('block')}>Bloquear</Button>);
  if (pm.approve && !final && c.stage !== 'cronograma') secondary.push(<Button key="rt" size="sm" variant="ghost" onClick={() => setModal('return')}>Devolver etapa</Button>);
  if (pm.approve && !final) secondary.push(<Button key="cn" size="sm" variant="ghost" className="btn-danger" onClick={() => setModal('cancel')}>Cancelar</Button>);
  return (
    <section>
      <div className="section-head"><h2 className="ed-md">Ações</h2><span className="xs faint">{data.stage.action || data.stage.label}</span></div>
      {items.length ? <div className="actions-bar">{items}</div> : <p className="sm muted" style={{ margin: 0 }}>{final ? 'Ciclo encerrado para este conteúdo.' : 'Nenhuma ação sua nesta etapa. O sistema avisa quando for a sua vez.'}</p>}
      {data.stage.exit && !final && <p className="xs faint" style={{ marginBottom: 0 }}>Saída da etapa: {data.stage.exit}.</p>}
      {secondary.length > 0 && <div className="actions-bar mt-4">{secondary}</div>}
    </section>
  );
}

function CaptionEditor({ content, version, current, canEdit, onSaved }) {
  const toast = useToast();
  const [text, setText] = useState(current?.caption || '');
  const [busy, setBusy] = useState(false);
  const viewingOld = version && current && version.id !== current.id;
  if (!canEdit || viewingOld) return <div className="caption-box">{version?.caption || <span className="faint">Sem legenda nesta versão.</span>}</div>;
  const dirty = text !== (current?.caption || '');
  const save = async () => {
    setBusy(true);
    try { const r = await api.put(`/contents/${content.id}/caption`, { caption: text }); toast(`Legenda salva na V${r.version}.`); onSaved(); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="col gap-2">
      <textarea className="textarea" style={{ minHeight: 180 }} value={text} onChange={(e) => setText(e.target.value)} aria-label="Legenda" />
      <div className="row between wrap">
        <span className="xs faint">{current?.locked ? `A V${current.number} já foi enviada: salvar cria a V${current.number + 1} (a anterior fica preservada).` : 'Edição na versão em rascunho.'} {text.length} caracteres</span>
        <Button size="sm" variant="ink" disabled={!dirty || busy} onClick={save}>Salvar legenda</Button>
      </div>
    </div>
  );
}

function Upload({ content, myOpen, onDone }) {
  const toast = useToast();
  const [files, setFiles] = useState([]);
  const [replace, setReplace] = useState(true);
  const visualTask = myOpen.find((t) => t.description === 'trilha:visual' || (t.kind === 'ajuste' && t.function !== 'copy'));
  const [deliver, setDeliver] = useState(!!visualTask);
  const [progress, setProgress] = useState(null);
  const send = async () => {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    if (replace) fd.append('replace', '1');
    if (deliver) fd.append('deliver', '1');
    try {
      const r = await uploadWithProgress(`/contents/${content.id}/media`, fd, setProgress);
      toast(r.delivered ? `V${r.version} enviada e entrega registrada — o processo avançou.` : `${r.files.length} arquivo(s) na V${r.version}.`);
      setFiles([]); onDone();
    } catch (e) { toast(e.message, 'err'); } finally { setProgress(null); }
  };
  return (
    <div className="col gap-3">
      <Dropzone files={files} onFiles={setFiles} />
      {files.length > 0 && (
        <>
          <ul className="list">{files.map((f, i) => <li key={i} className="sm"><span className="idx">{i + 1}</span><span className="grow clip">{f.name}</span><span className="muted">{bytes(f.size)}</span></li>)}</ul>
          <div className="row wrap gap-4">
            <label className="check"><input type="radio" checked={replace} onChange={() => setReplace(true)} /> Substituir mídia da versão</label>
            <label className="check"><input type="radio" checked={!replace} onChange={() => setReplace(false)} /> Adicionar (ex.: mais páginas do carrossel)</label>
          </div>
          {visualTask && <label className="check"><input type="checkbox" checked={deliver} onChange={(e) => setDeliver(e.target.checked)} /> Este é o arquivo final — registrar entrega ({visualTask.kind === 'ajuste' ? 'conclui o ajuste' : 'conclui a trilha visual'})</label>}
          {progress != null && <div className="progress"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
          <div className="row end"><Button variant="primary" magnetic disabled={progress != null} onClick={send} icon={<I.upload size={14} />}>{progress != null ? `Enviando ${Math.round(progress * 100)}%` : 'Enviar arquivos'}</Button></div>
        </>
      )}
    </div>
  );
}

function TasksList({ tasks, me, onComplete }) {
  if (!tasks.length) return <Empty title="Sem tarefas." />;
  return tasks.map((t) => {
    const open = ['aberta', 'em_andamento'].includes(t.status);
    const overdue = open && t.due_at && new Date(t.due_at) < new Date();
    return (
      <div key={t.id} className="task-row">
        <span className={`tag ${t.status === 'concluida' ? 'tag-ok' : t.status === 'cancelada' ? '' : overdue ? 'tag-err' : 'tag-info'}`}>{t.status}</span>
        <div className="grow">
          <div className={t.status === 'concluida' || t.status === 'cancelada' ? 'done' : ''}>{t.title}</div>
          <div className="xs faint">{FUNCTIONS[t.function] || t.function || '—'} · {t.assignee_name || <b style={{ color: 'var(--err)' }}>sem responsável</b>}{t.due_at ? ` · prazo ${fmtDateTime(t.due_at)}` : ''}{overdue ? ' · ATRASADA' : ''}</div>
          {t.description && !t.description.startsWith('trilha:') && <div className="xs muted" style={{ whiteSpace: 'pre-wrap' }}>{t.description}</div>}
        </div>
        {open && t.assignee_id === me && t.function !== 'cliente' && <Button size="sm" variant="ink" onClick={() => onComplete(t)}>Concluir</Button>}
      </div>
    );
  });
}

function EditModal({ open, onClose, c, onSave, busy }) {
  const [f, setF] = useState({});
  useEffect(() => { if (open) setF({ title: c.title, theme: c.theme || '', objective: c.objective || '', reference: c.reference || '', material_url: c.material_url || '', briefing: c.briefing || '', internal_notes: c.internal_notes || '', planned_at: toLocalInput(c.planned_at), priority: c.priority, material_status: c.material_status }); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open={open} onClose={onClose} title="Editar conteúdo" wide footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={busy} onClick={() => onSave({ ...f, planned_at: f.planned_at ? new Date(f.planned_at).toISOString() : undefined })}>Salvar</Button></>}>
      <div className="col gap-4">
        <Field label="Título"><input className="input" value={f.title || ''} onChange={s('title')} /></Field>
        <div className="grid-2"><Field label="Tema"><input className="input" value={f.theme || ''} onChange={s('theme')} /></Field><Field label="Objetivo"><input className="input" value={f.objective || ''} onChange={s('objective')} /></Field></div>
        <div className="grid-2">
          <Field label="Publicação prevista" hint="Mudar o mês move o conteúdo para o ciclo correspondente."><input className="input" type="datetime-local" value={f.planned_at || ''} onChange={s('planned_at')} /></Field>
          <Field label="Prioridade"><select className="select" value={f.priority} onChange={s('priority')}>{Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        </div>
        <div className="grid-2">
          <Field label="Referência"><input className="input" value={f.reference || ''} onChange={s('reference')} /></Field>
          <Field label="Link do material (Drive, Canva…)" hint="Pasta ou arquivo com o material da produção."><input className="input" type="url" placeholder="https://" value={f.material_url || ''} onChange={s('material_url')} /></Field>
          <Field label="Material do cliente"><select className="select" value={f.material_status} onChange={s('material_status')}><option value="nao_necessario">Não necessário</option><option value="aguardando">Aguardando cliente</option><option value="recebido">Recebido</option></select></Field>
        </div>
        <Field label="Briefing"><textarea className="textarea" value={f.briefing || ''} onChange={s('briefing')} /></Field>
        <Field label="Informações internas"><textarea className="textarea" value={f.internal_notes || ''} onChange={s('internal_notes')} /></Field>
      </div>
    </Modal>
  );
}

function ClientDecisionModal({ open, onClose, c, onSave, busy }) {
  const [decision, setDecision] = useState('aprovar');
  const [origin, setOrigin] = useState('');
  const [note, setNote] = useState('');
  const [size, setSize] = useState('normal');
  return (
    <Modal open={open} onClose={onClose} title="Registrar decisão do cliente" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={busy || !origin.trim() || (decision === 'ajuste' && !note.trim())} onClick={() => onSave({ decision, on_behalf_note: origin, note, size })}>Registrar</Button></>}>
      <p className="sm muted" style={{ marginTop: 0 }}>Use quando o cliente respondeu fora da plataforma (ex.: WhatsApp). O registro fica marcado como feito pela equipe, com a origem informada.</p>
      <div className="col gap-4">
        <div className="seg"><button className={decision === 'aprovar' ? 'active' : ''} onClick={() => setDecision('aprovar')}>Aprovou</button><button className={decision === 'ajuste' ? 'active' : ''} onClick={() => setDecision('ajuste')}>Pediu ajuste</button></div>
        <Field label="Origem (obrigatório)"><input className="input" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Onde e quando o cliente aprovou" /></Field>
        {decision === 'ajuste' && <Field label="O que o cliente pediu?"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
        {decision === 'ajuste' && c.stage === 'aprovacao_cliente' && <div className="seg"><button className={size === 'normal' ? 'active' : ''} onClick={() => setSize('normal')}>Ajuste normal</button><button className={size === 'simples' ? 'active' : ''} onClick={() => setSize('simples')}>Ajuste simples (volta direto ao cliente)</button></div>}
      </div>
    </Modal>
  );
}

function BlockModal({ open, onClose, onSave, busy }) {
  const [reason, setReason] = useState('');
  const [waiting, setWaiting] = useState('cliente');
  return (
    <Modal open={open} onClose={onClose} title="Bloquear conteúdo" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={busy || !reason.trim()} onClick={() => onSave({ reason, waiting_on: waiting })}>Bloquear</Button></>}>
      <div className="col gap-4">
        <Field label="O que falta, exatamente?" hint="Vira pendência com dono e prazo. Se for do cliente, ele é avisado na área dele."><textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: fotos do escritório novo" /></Field>
        <Field label="Aguardando"><select className="select" value={waiting} onChange={(e) => setWaiting(e.target.value)}><option value="cliente">Cliente</option><option value="equipe">Equipe</option><option value="informacao">Informação</option></select></Field>
      </div>
    </Modal>
  );
}

function ScheduleModal({ open, onClose, c, meta, onSave, busy }) {
  const [at, setAt] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { if (open) setAt(toLocalInput(c.scheduled_at || c.planned_at)); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const iso = at ? new Date(at).toISOString() : null;
  return (
    <Modal open={open} onClose={onClose} title="Agendamento" footer={<>
      <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      {meta ? <Button variant="primary" magnetic disabled={busy || !iso} onClick={() => onSave({ at: iso, mode: 'meta' })} data-cursor="AGENDAR">Agendar via Meta</Button> : null}
      <Button variant={meta ? undefined : 'primary'} disabled={busy || !iso} onClick={() => onSave({ at: iso, mode: 'externo', external_note: note })}>Marcar como agendado externamente</Button>
    </>}>
      <dl className="kv">
        <dt>Conteúdo</dt><dd>#{c.number} {c.title}</dd>
        <dt>Canal</dt><dd>{c.channel === 'instagram' ? 'Instagram' : c.channel}</dd>
        <dt>Formato</dt><dd><Format f={c.format} /></dd>
      </dl>
      <div className="col gap-4 mt-5">
        <Field label="Data e horário"><input className="input" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
        {!meta && <div className="panel" style={{ borderColor: 'var(--warn)', background: 'var(--warn-soft)' }}><div className="sm"><b>Meta/Instagram não conectado.</b> Ao marcar como agendado externamente, a publicação <b>depende de uma ação fora da plataforma</b> (ex.: Meta Business Suite). Confirme a publicação aqui depois que ela acontecer.</div></div>}
        {!meta && <Field label="Onde foi agendado (opcional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: Meta Business Suite" /></Field>}
        {meta && <p className="xs muted">A API do Instagram não oferece agendamento nativo: a The Bold OS publica automaticamente no horário escolhido e confirma o status.</p>}
      </div>
    </Modal>
  );
}

function ReasonModal({ open, onClose, title, label, onSave, busy, danger }) {
  const [r, setR] = useState('');
  return (
    <Modal open={open} onClose={onClose} title={title} footer={<><Button variant="ghost" onClick={onClose}>Voltar</Button><Button variant={danger ? undefined : 'primary'} className={danger ? 'btn-danger' : ''} disabled={busy || !r.trim()} onClick={() => onSave(r)}>Confirmar</Button></>}>
      <Field label={label}><textarea className="textarea" value={r} onChange={(e) => setR(e.target.value)} autoFocus /></Field>
    </Modal>
  );
}

function ReturnModal({ open, onClose, c, onSave, busy }) {
  const { data } = useApi(open ? '/process/definition' : null, [open], { live: false });
  const [stage, setStage] = useState('');
  const [reason, setReason] = useState('');
  const prev = data ? data.order.slice(0, data.order.indexOf(c.stage)).filter((k) => !data.stages[k].final) : [];
  return (
    <Modal open={open} onClose={onClose} title="Devolver para etapa anterior" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={busy || !stage || !reason.trim()} onClick={() => onSave({ stage, reason })}>Devolver</Button></>}>
      <div className="col gap-4">
        <Field label="Etapa"><select className="select" value={stage} onChange={(e) => setStage(e.target.value)}><option value="">Selecione…</option>{prev.map((k) => <option key={k} value={k}>{data.stages[k].label}</option>)}</select></Field>
        <Field label="Motivo" hint="Fica registrado no histórico e o responsável da etapa recebe a tarefa."><textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
