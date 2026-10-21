import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi, useToast } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Button, Empty, ErrorBox, Format, Loading, Modal, PageHead, Risk } from '../components/ui.jsx';
import { MediaView } from '../components/MediaView.jsx';
import { I } from '../components/Icons.jsx';
import { ago, cleanName, fmtDate, fmtDateTime, firstName } from '../lib/format.js';
import { FUNCTIONS } from '../lib/status.js';
import { AdjustModal } from './production/AdjustModal.jsx';
import { CompareVersions, VersionChips } from './production/Versions.jsx';
import { ClientTile } from './production/ClientTile.jsx';
import '../styles/production.css';
import '../styles/review.css';
import { useUrlState } from '../lib/nav.jsx';

export default function Revisao() {
  const { clientId } = useParams();
  return clientId ? <ClientRoom clientId={clientId} /> : <ClientPicker />;
}

// ── 1. Escolher o cliente ──
function ClientPicker() {
  useCrumbs('Sala de Revisão');
  const { data, error, loading } = useApi('/review/clients');
  const [q, setQ] = useUrlState('q', '');
  const list = (data || []).filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page">
      <PageHead kicker="Rebeca · Raísa · Vitória" title="Sala de Revisão" sub="Entre no cliente e revise toda a produção dele. Decisões, ajustes e comentários ficam em rascunho e só chegam à equipe quando você finalizar a revisão daquele cliente." />
      <div className="ct-toolbar">
        <label className="ct-search"><I.search size={16} /><input placeholder="Buscar cliente…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar cliente" /></label>
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading rows={5} /> : !list.length ? <Empty title="Nada aguardando revisão.">Quando uma produção for entregue, o cliente aparece aqui automaticamente.</Empty> : (
        <div className="ct-grid">
          {list.map((c) => (
            <ClientTile key={c.id} to={`/revisao/${c.id}`} name={c.name} cover={c.thumbs}
              status={{ key: 'ativo', label: `${c.pending} para revisar` }}
              badge={c.session ? `Em revisão${c.session.reviewers.length ? ` · ${c.session.reviewers.map(firstName).join(', ')}` : ''}` : null}
              chips={[
                { label: 'Cronograma', n: c.cronograma, tone: 'neutral' },
                { label: 'Produção', n: c.producao, tone: 'info' },
                { label: 'Ajuste do cliente', n: c.ajuste, tone: 'adjust' },
                { label: 'Decididos', n: c.session?.decided || 0, tone: 'ok' },
              ]}
              footer={<>Aguardando há {ago(c.oldest).replace('há ', '')}{c.next_publish ? ` · primeira publicação ${fmtDate(c.next_publish)}` : ''}</>} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── 2. Sala do cliente ──
function ClientRoom({ clientId }) {
  const toast = useToast();
  const nav = useNavigate();
  const { data, error, loading, reload } = useApi(`/review/clients/${clientId}`, [clientId]);
  useCrumbs('Sala de Revisão', data ? cleanName(data.client.name) : '');
  const [sel, setSel] = useState(null);
  const [vid, setVid] = useState(null);
  const [adjOpen, setAdjOpen] = useState(false);
  const [compare, setCompare] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const items = data?.items || [];
  const idx = items.findIndex((i) => i.id === sel);
  const item = items[idx] || null;
  useEffect(() => { if (items.length && !items.some((i) => i.id === sel)) setSel(items[0].id); }, [items]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setVid(item?.versions[0]?.id || null); }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const decided = items.filter((i) => i.draft?.decision).length;
  const commented = items.reduce((n, i) => n + (i.draft?.comments.length || 0), 0);

  const base = `/review/clients/${clientId}/drafts`;
  const setDraft = async (body, goNext = true) => {
    setBusy(true);
    try {
      await api.put(`${base}/${item.id}`, body);
      setAdjOpen(false);
      await reload();
      if (goNext && body.decision) { const next = items.slice(idx + 1).find((i) => !i.draft?.decision) || items.find((i) => i.id !== item.id && !i.draft?.decision); if (next) setSel(next.id); }
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const finish = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/review/clients/${clientId}/finish`);
      toast(`Revisão finalizada: ${r.aprovados.length} aprovado(s), ${r.ajustes.length} com ajuste, ${r.comentarios} comentário(s).`);
      setFinishOpen(false);
      nav('/revisao');
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  useEffect(() => {
    const h = (e) => {
      if (adjOpen || compare || finishOpen || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || !item) return;
      if (e.key === 'j') setSel(items[Math.min(items.length - 1, idx + 1)]?.id);
      if (e.key === 'k') setSel(items[Math.max(0, idx - 1)]?.id);
      if (e.key === 'a' && item.can_decide && !busy) setDraft({ decision: 'aprovar' });
      if (e.key === 'r' && item.can_decide) setAdjOpen(true);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  if (loading && !data) return <div className="page"><Loading rows={6} /></div>;
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  const version = item?.versions.find((v) => v.id === vid) || item?.versions[0];
  const d = item?.draft;
  return (
    <div className="page rr" style={{ maxWidth: 1600 }}>
      <div className="rr-head">
        <div className="grow">
          <div className="caps">Sala de Revisão</div>
          <h1 className="ed-xl">{cleanName(data.client.name)}</h1>
        </div>
        <div className="rr-progress">
          <span className="num">{decided}</span><span className="muted">/ {items.length} decididos</span>
          <div className="rr-bar"><i style={{ width: `${items.length ? (decided / items.length) * 100 : 0}%` }} /></div>
        </div>
        <Button variant="ink" size="lg" magnetic disabled={busy || (!decided && !commented)} onClick={() => setFinishOpen(true)} data-cursor="FINALIZAR">Finalizar revisão do cliente</Button>
      </div>
      <div className="rr-note"><I.lock size={14} /> Rascunho da rodada: nada é enviado à equipe ou ao cliente até você finalizar.{data.session && <span className="faint"> Rodada aberta por {data.session.opened_by_name} {ago(data.session.opened_at)}.</span>}</div>

      {!items.length ? <Empty title="Nada aguardando revisão deste cliente." /> : (
        <div className="rv">
          <aside className="rv-queue" aria-label="Conteúdos do cliente">
            {items.map((i) => (
              <button key={i.id} className={`rv-item ${i.id === sel ? 'active' : ''}`} onClick={() => setSel(i.id)} aria-current={i.id === sel}>
                {i.thumb ? <img src={i.thumb} alt="" /> : <span className="ph" />}
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="sm clip" style={{ display: 'block' }}>#{i.number} {i.title}</span>
                  <span className="xs faint">{i.kind}</span>
                  <span style={{ display: 'block', marginTop: 4 }}><DraftChip d={i.draft} /></span>
                </span>
              </button>
            ))}
          </aside>

          {item && (
            <article key={item.id} style={{ animation: 'page-in var(--t-slow) var(--ease-out) both' }}>
              <div className="row between wrap mb-4">
                <div>
                  <div className="caps">{item.kind}</div>
                  <h2 className="ed-lg mt-2"><Link to={`/conteudos/${item.id}`} data-cursor="ABRIR">#{item.number} {item.title}</Link></h2>
                  <div className="row wrap gap-4 mt-2 sm"><Format f={item.format} /><span className="muted">Publica {fmtDate(item.planned_at)}</span>{item.due_at && <span className="muted">Revisar até {fmtDateTime(item.due_at)}</span>}<Risk level={item.risk} /></div>
                </div>
                <span className="sm muted">{idx + 1} de {items.length}</span>
              </div>

              <div className="rv-focus">
                <div>
                  {item.stage === 'analise_cronograma' ? (
                    <div className="panel">
                      <div className="caps">Tema proposto</div>
                      <div className="ed-lg mt-2">{item.theme || item.title}</div>
                      <dl className="kv mt-5"><dt>Objetivo</dt><dd>{item.objective || '—'}</dd><dt>Referência</dt><dd>{item.reference || '—'}</dd><dt>Briefing</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{item.briefing || '—'}</dd></dl>
                    </div>
                  ) : (
                    <>
                      {item.versions.length > 0 && (
                        <div className="row between wrap mb-2">
                          <VersionChips versions={item.versions} value={version?.id} onChange={setVid} />
                          {item.versions.length > 1 && <Button size="sm" variant="ghost" onClick={() => setCompare(true)}>Comparar versões</Button>}
                        </div>
                      )}
                      <MediaView media={version?.media || []} />
                      <div className="caps mt-4 mb-2">Legenda · V{version?.number}</div>
                      <div className="caption-box" style={{ maxHeight: 220, overflow: 'auto' }}>{version?.caption || <span className="faint">Sem legenda</span>}</div>
                    </>
                  )}
                </div>

                <div className="col gap-5">
                  {/* Decisão desta peça (rascunho) */}
                  <section className="rr-decision">
                    <div className="caps mb-2">Sua decisão</div>
                    {d?.decision ? (
                      <div className={`rr-draft ${d.decision}`}>
                        <div className="row between"><b>{d.decision === 'aprovar' ? (item.stage === 'analise_producao' ? '✓ Aprovar e enviar ao cliente' : item.stage === 'revisao_ajuste' ? '✓ Ajuste conferido — vai para agendamento' : '✓ Aprovar tema') : `↺ Pedir ajuste (${d.adjustments.length || 1})`}</b>
                          {item.can_decide && <button className="btn btn-ghost btn-sm" onClick={() => setDraft({ decision: null }, false)}>Desfazer</button>}</div>
                        {d.decision === 'ajuste' && <ul className="sm">{d.adjustments.map((a, i) => <li key={i}>{a.description} <span className="faint">· {a.track === 'legenda' ? 'legenda' : 'arte/vídeo'}</span></li>)}{d.note && <li>{d.note}</li>}</ul>}
                        <div className="xs faint">por {d.reviewer_name} · aplicado ao finalizar</div>
                      </div>
                    ) : item.can_decide ? (
                      <div className="row gap-2 wrap">
                        <Button variant="ink" magnetic disabled={busy} onClick={() => setDraft({ decision: 'aprovar' })} icon={<I.check size={15} />} data-cursor="APROVAR">Aprovar</Button>
                        <Button magnetic disabled={busy} onClick={() => setAdjOpen(true)}>Pedir ajuste</Button>
                      </div>
                    ) : item.opens_at ? <p className="sm muted">Agendada — fica disponível em {fmtDate(item.opens_at)}. Pronto não é disponível: a revisão abre na data do marco.</p>
                    : <p className="sm muted">Você pode ver, mas a decisão é de quem revisa.</p>}
                  </section>

                  <ReviewComments item={item} base={base} onChange={reload} />

                  {(item.briefing || item.objective) && item.stage !== 'analise_cronograma' && (
                    <section><div className="caps mb-2">Briefing</div><div className="sm" style={{ whiteSpace: 'pre-wrap' }}>{item.objective && <b>{item.objective}. </b>}{item.briefing}</div></section>
                  )}
                  {item.producers.length > 0 && <section><div className="caps mb-2">Produziram</div><div className="sm">{item.producers.map((p) => `${p.name} (${FUNCTIONS[p.function] || p.function})`).join(' · ')}</div></section>}
                  {item.adjustments.length > 0 && (
                    <section>
                      <div className="caps mb-2">Ajustes anteriores</div>
                      {item.adjustments.map((a) => <div key={a.id} className="sm rr-prev"><span className={`tag ${a.origin === 'cliente' ? 'tag-warn' : 'tag-info'}`}>{a.origin}</span> {a.description}<div className="xs faint">{a.assigned_name || '—'} · {a.status}</div></div>)}
                    </section>
                  )}
                </div>
              </div>
            </article>
          )}
        </div>
      )}
      {item && <AdjustModal key={item.id} open={adjOpen} onClose={() => setAdjOpen(false)} busy={busy} isCronograma={item.stage === 'analise_cronograma'} producers={item.producers}
        title="Pedir ajuste (rascunho)" onSubmit={(body) => setDraft(body)} />}
      {item && <Modal open={compare} onClose={() => setCompare(false)} title={`Comparar versões — #${item.number}`} wide><CompareVersions versions={item.versions} /></Modal>}
      <Modal open={finishOpen} onClose={() => setFinishOpen(false)} title={`Finalizar revisão — ${cleanName(data.client.name)}`}
        footer={<><Button variant="ghost" onClick={() => setFinishOpen(false)}>Voltar</Button><Button variant="ink" magnetic disabled={busy} onClick={finish}>Finalizar e aplicar</Button></>}>
        <ul className="rr-summary">
          <li><span className="num">{items.filter((i) => i.draft?.decision === 'aprovar').length}</span> aprovados — seguem para o cliente (ou para agendamento, no caso de ajuste do cliente conferido)</li>
          <li><span className="num">{items.filter((i) => i.draft?.decision === 'ajuste').length}</span> com ajuste — viram tarefas para quem produziu</li>
          <li><span className="num">{commented}</span> comentários — ficam visíveis só para a equipe</li>
          {items.length - decided > 0 && <li className="warn"><span className="num">{items.length - decided}</span> sem decisão — continuam aguardando revisão</li>}
        </ul>
      </Modal>
    </div>
  );
}

function DraftChip({ d }) {
  if (d?.decision === 'aprovar') return <span className="rr-chip ok">✓ Aprovado</span>;
  if (d?.decision === 'ajuste') return <span className="rr-chip adj">↺ Ajuste</span>;
  if (d?.comments?.length) return <span className="rr-chip">{d.comments.length} comentário(s)</span>;
  return <span className="rr-chip none">Pendente</span>;
}

// Comentários da revisão: rascunho, só a equipe vê depois de finalizar
function ReviewComments({ item, base, onChange }) {
  const toast = useToast();
  const { data: people } = useApi('/users/directory', [], { live: false });
  const [body, setBody] = useState('');
  const [page, setPage] = useState('');
  const mediaCount = item.versions[0]?.media.length || 0;
  const list = item.draft?.comments || [];
  const send = async () => {
    if (!body.trim()) return;
    try { await api.post(`${base}/${item.id}/comments`, { body, page: page || null }); setBody(''); setPage(''); onChange(); } catch (e) { toast(e.message, 'err'); }
  };
  const remove = async (id) => { try { await api.del(`${base}/${item.id}/comments/${id}`); onChange(); } catch (e) { toast(e.message, 'err'); } };
  const names = useMemo(() => (people || []).slice(0, 10), [people]);
  return (
    <section>
      <div className="caps mb-2">Comentários da revisão <span className="faint">· só a equipe verá, ao finalizar</span></div>
      {list.map((c) => (
        <div key={c.id} className="comment internal">
          <div className="head"><b style={{ color: 'var(--ink)' }}>{c.author_name}</b>{c.page && <span className="tag">página {c.page}</span>}<span className="tag">rascunho</span><span className="faint" style={{ marginLeft: 'auto' }}>{ago(c.at)}</span><button className="btn btn-ghost btn-sm" onClick={() => remove(c.id)} aria-label="Remover comentário"><I.x size={12} /></button></div>
          <div className="body">{c.body}</div>
        </div>
      ))}
      <textarea className="textarea" placeholder="Comentário para a equipe… use @ para mencionar" value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }} aria-label="Comentário da revisão" />
      <div className="row wrap gap-1 mt-2">{names.map((p) => <button key={p.id} type="button" className="tag" style={{ cursor: 'pointer', background: 'none' }} onClick={() => setBody((b) => `${b}${b && !b.endsWith(' ') ? ' ' : ''}@${firstName(p.name)} `)}>@{firstName(p.name)}</button>)}</div>
      <div className="row between mt-2">
        {mediaCount > 1 ? <select className="select" style={{ width: 'auto', minHeight: 32, padding: '4px 8px', fontSize: 12 }} value={page} onChange={(e) => setPage(e.target.value)} aria-label="Página"><option value="">Página…</option>{Array.from({ length: mediaCount }).map((_, i) => <option key={i} value={i + 1}>Página {i + 1}</option>)}</select> : <span />}
        <Button variant="ink" size="sm" disabled={!body.trim()} onClick={send}>Adicionar</Button>
      </div>
    </section>
  );
}
