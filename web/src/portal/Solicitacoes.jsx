// SOLICITAÇÕES — o que você pediu à The Bold, em linguagem simples:
// RECEBIDO · EM ANÁLISE · EM ANDAMENTO · AGUARDANDO VOCÊ · CONCLUÍDO — com última atualização, próxima ação, responsável e prazo esperado.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi, useToast } from '../lib/hooks.js';
import { fmtDate, ago } from '../lib/format.js';
import { Loading, ErrorBox } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { usePortal } from './PortalApp.jsx';

const STEPS = ['recebido', 'em_analise', 'em_andamento', 'concluido'];
const LABEL = { recebido: 'Recebido', em_analise: 'Em análise', em_andamento: 'Em andamento', aguardando_cliente: 'Aguardando você', concluido: 'Concluído' };

export default function Solicitacoes() {
  const { data, error, reload } = useApi('/portal/requests');
  const { openRequest, reloadMe } = usePortal() || {};
  const [params] = useSearchParams();
  const [open, setOpen] = useState(params.get('r'));
  useEffect(() => { const r = params.get('r'); if (r) { setOpen(r); setTimeout(() => document.getElementById(`r-${r}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); } }, [params, data?.items?.length]);
  if (error) return <div className="p-page"><ErrorBox error={error} /></div>;
  if (!data) return <div className="p-page"><Loading rows={6} /></div>;
  const active = data.items.filter((r) => r.status !== 'concluido');
  const done = data.items.filter((r) => r.status === 'concluido');
  return (
    <div className="p-page" style={{ maxWidth: 860 }}>
      <header className="p-page-head row between wrap" style={{ alignItems: 'flex-end' }}>
        <div><div className="caps">Pedir algo à The Bold</div><h1 className="ed-xl">Solicitações</h1>
          <p className="p-lede">Tudo o que você pediu, com o status e o próximo passo.</p></div>
        <button className="p-cta" onClick={() => openRequest?.({})}><I.plus size={16} /> Nova solicitação</button>
      </header>
      {!data.items.length && <p className="p-next-t">Nenhuma solicitação ainda.<span className="muted">Precisa de um conteúdo, uma alteração ou uma conversa? Toque em “Nova solicitação”.</span></p>}
      {active.map((r) => <Request key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} onDone={() => { reload(); reloadMe?.(); }} />)}
      {done.length > 0 && <>
        <h2 className="caps mt-6 mb-2">Concluídas</h2>
        {done.map((r) => <Request key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} onDone={reload} />)}
      </>}
    </div>
  );
}

function Request({ r, open, onToggle, onDone }) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const idx = r.status === 'aguardando_cliente' ? 2 : STEPS.indexOf(r.status);
  const reply = async (e) => {
    e.preventDefault();
    if (!body.trim() && !file) return;
    setBusy(true);
    const fd = new FormData(); fd.append('body', body.trim()); if (file) fd.append('file', file);
    try { await api.form(`/portal/requests/${r.id}/reply`, fd); setBody(''); setFile(null); toast('Resposta enviada. A The Bold já foi avisada.'); onDone(); } catch (x) { toast(x.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <article id={`r-${r.id}`} className={`p-rq ${open ? 'open' : ''} s-${r.status}`}>
      <button className="p-rq-h" onClick={onToggle} aria-expanded={open}>
        <span className={`p-rq-st s-${r.status}`}>{LABEL[r.status]}</span>
        <span className="p-rq-t"><b>{r.title}</b><small>{r.kind_label} · atualizado {ago(r.updated_at)}</small></span>
        <I.right size={16} className="p-rq-chev" />
      </button>
      {open && (
        <div className="p-rq-b">
          <ol className="p-rq-steps" aria-label="Status">
            {STEPS.map((s, i) => <li key={s} className={i < idx ? 'done' : i === idx ? 'here' : ''}>{i === 2 && r.status === 'aguardando_cliente' ? 'Aguardando você' : LABEL[s]}</li>)}
          </ol>
          <dl className="p-rq-meta">
            {r.next_action && <><dt className="caps">Próximo passo</dt><dd>{r.next_action}</dd></>}
            {r.owner && <><dt className="caps">Quem cuida</dt><dd>{r.owner} · The Bold</dd></>}
            {r.expected_at && <><dt className="caps">Retorno previsto</dt><dd>até {fmtDate(r.expected_at)}</dd></>}
            {r.ref && <><dt className="caps">Conteúdo</dt><dd><Link className="p-link" to={`/portal/conteudos?c=${r.ref.id}`}>{r.ref.title}</Link></dd></>}
          </dl>
          <ul className="p-rq-log">
            {r.updates.filter((u) => u.body || u.status_to).map((u) => (
              <li key={u.id} className={u.is_client ? 'me' : ''}>
                <span className="xs faint">{u.is_client ? 'Você' : 'The Bold'} · {ago(u.created_at)}{u.status_to ? ` · ${LABEL[u.status_to] || u.status_to}` : ''}</span>
                {u.body && <p className="sm">{u.body}</p>}
                {u.file_id && <a className="p-link xs" href={`/api/media/${u.file_id}/original?download=1`}>arquivo anexado</a>}
              </li>
            ))}
          </ul>
          {r.status !== 'concluido' && (
            <form className="p-rq-reply" onSubmit={reply}>
              <textarea className="p-textarea" rows={2} placeholder={r.status === 'aguardando_cliente' ? 'Responda aqui para a The Bold continuar' : 'Complementar a solicitação'} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Responder" />
              <div className="row gap-2 mt-2">
                <label className="p-btn sm"><I.upload size={12} /> {file ? file.name.slice(0, 18) : 'Anexar'}<input type="file" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
                <span className="grow" />
                <button className="p-btn solid sm" disabled={busy || (!body.trim() && !file)}>{busy ? 'Enviando…' : 'Enviar'}</button>
              </div>
            </form>
          )}
        </div>
      )}
    </article>
  );
}
