import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi, useAuth, useToast } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Button, Empty, ErrorBox, Format, Loading, Modal, PageHead, Risk } from '../components/ui.jsx';
import { MediaView } from '../components/MediaView.jsx';
import { I } from '../components/Icons.jsx';
import { ago, cleanName, fmtDate, fmtDateTime } from '../lib/format.js';
import { AdjustModal } from './production/AdjustModal.jsx';
import { FUNCTIONS } from '../lib/status.js';
import { CompareVersions, VersionChips } from './production/Versions.jsx';
import '../styles/production.css';

const GROUPS = [['analise_cronograma', 'Análise de cronograma'], ['analise_producao', 'Revisão de produção'], ['revisao_ajuste', 'Revisão de ajuste do cliente']];

export default function Revisao() {
  useCrumbs('Sala de Revisão');
  const auth = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/review/queue');
  const [sel, setSel] = useState(null);
  const [vid, setVid] = useState(null);
  const [adjOpen, setAdjOpen] = useState(false);
  const [compare, setCompare] = useState(false);
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => (data?.items || []).slice().sort((a, b) => GROUPS.findIndex((g) => g[0] === a.stage) - GROUPS.findIndex((g) => g[0] === b.stage)), [data]);
  const idx = items.findIndex((i) => i.id === sel);
  const item = items[idx] || null;
  useEffect(() => { if (items.length && !items.some((i) => i.id === sel)) setSel(items[0].id); }, [items]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setVid(item?.versions[0]?.id || null); }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const canDecide = auth.can('revisao', 'approve') || item?.stage === 'revisao_ajuste';

  const decide = async (body) => {
    if (!item) return;
    const nextId = items[idx + 1]?.id || items[idx - 1]?.id || null;
    setBusy(true);
    try {
      await api.post(`/contents/${item.id}/review`, body);
      toast(body.decision === 'aprovar' ? (item.stage === 'analise_producao' ? `#${item.number} aprovado — enviado ao cliente.` : `#${item.number} aprovado.`) : `Ajuste enviado para #${item.number}.`);
      setAdjOpen(false);
      setSel(nextId);
      await reload();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  useEffect(() => {
    const h = (e) => {
      if (adjOpen || compare || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key === 'j') setSel(items[Math.min(items.length - 1, idx + 1)]?.id);
      if (e.key === 'k') setSel(items[Math.max(0, idx - 1)]?.id);
      if (e.key === 'a' && item && canDecide && !busy) decide({ decision: 'aprovar' });
      if (e.key === 'r' && item && canDecide) setAdjOpen(true);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const version = item?.versions.find((v) => v.id === vid) || item?.versions[0];
  return (
    <div className="page" style={{ maxWidth: 1560 }}>
      <PageHead kicker="Rebeca · Raísa · Vitória" title="Sala de Revisão" sub="Revise a produção, aprove para o cliente ou devolva com ajustes atribuídos. Quando o ajuste é concluído, ele volta para cá sozinho.">
        <span className="xs muted row gap-2"><span className="kbd">J</span><span className="kbd">K</span> navegar · <span className="kbd">A</span> aprovar · <span className="kbd">R</span> ajuste</span>
      </PageHead>
      <ErrorBox error={error} />
      {loading && !data ? <Loading rows={6} /> : !items.length ? <Empty title="Nada aguardando revisão.">Quando uma produção for entregue, ela aparece aqui automaticamente.</Empty> : (
        <div className="rv">
          <aside className="rv-queue" aria-label="Fila de revisão">
            {GROUPS.map(([k, label]) => {
              const g = items.filter((i) => i.stage === k);
              if (!g.length) return null;
              return (
                <div className="group" key={k}>
                  <div className="caps mb-2">{label} <span className="faint">{g.length}</span></div>
                  {g.map((i) => (
                    <button key={i.id} className={`rv-item ${i.id === sel ? 'active' : ''}`} onClick={() => setSel(i.id)} aria-current={i.id === sel}>
                      {i.thumb ? <img src={i.thumb} alt="" /> : <span className="ph" />}
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="caps clip" style={{ display: 'block' }}>{cleanName(i.client)}</span>
                        <span className="sm clip" style={{ display: 'block' }}>#{i.number} {i.title}</span>
                        <span className="xs faint">{i.kind} · {ago(new Date(Date.now() - i.hours_in_stage * 3600e3))}</span>
                      </span>
                    </button>
                  ))}
                </div>
              );
            })}
          </aside>

          {item && (
            <article key={item.id} style={{ animation: 'page-in var(--t-slow) var(--ease-out) both' }}>
              <div className="row between wrap mb-4">
                <div>
                  <div className="caps"><span className="bordo">{cleanName(item.client)}</span> · {item.kind}</div>
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
                    </>
                  )}
                </div>
                <div className="col gap-5">
                  {item.stage !== 'analise_cronograma' && (
                    <section>
                      <div className="caps mb-2">Legenda · V{version?.number}</div>
                      <div className="caption-box" style={{ maxHeight: 280, overflow: 'auto' }}>{version?.caption || <span className="faint">Sem legenda</span>}</div>
                    </section>
                  )}
                  {item.stage !== 'analise_cronograma' && (item.briefing || item.objective) && (
                    <section><div className="caps mb-2">Briefing</div><div className="sm" style={{ whiteSpace: 'pre-wrap' }}>{item.objective && <b>{item.objective}. </b>}{item.briefing}</div></section>
                  )}
                  {item.producers.length > 0 && <section><div className="caps mb-2">Produziram</div><div className="sm">{item.producers.map((p) => `${p.name} (${FUNCTIONS[p.function] || p.function})`).join(' · ')}</div></section>}
                  <section>
                    <div className="caps mb-2">Ajustes anteriores</div>
                    {!item.adjustments.length ? <div className="sm faint">Primeira rodada.</div> : item.adjustments.map((a) => (
                      <div key={a.id} className="sm" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                        <span className={`tag ${a.origin === 'cliente' ? 'tag-warn' : 'tag-info'}`}>{a.origin}</span> {a.description}
                        <div className="xs faint">{a.assigned_name || '—'} · {a.status}{a.carousel_page ? ` · página ${a.carousel_page}` : ''}</div>
                      </div>
                    ))}
                  </section>
                  <section>
                    <div className="caps mb-2">Comentários recentes</div>
                    {!item.comments.length ? <div className="sm faint">Nenhum.</div> : item.comments.slice(0, 6).map((cm) => (
                      <div key={cm.id} className={`comment ${cm.visibility === 'internal' ? 'internal' : ''}`}><div className="head"><b style={{ color: 'var(--ink)' }}>{cm.author_name}</b>{cm.author_role === 'cliente' && <span className="tag tag-warn">cliente</span>}<span className="faint" style={{ marginLeft: 'auto' }}>{ago(cm.created_at)}</span></div><div className="body">{cm.body}</div></div>
                    ))}
                  </section>
                </div>
              </div>

              {canDecide ? (
                <div className="rv-decide">
                  <Button variant="primary" size="lg" magnetic disabled={busy} onClick={() => decide({ decision: 'aprovar' })} icon={<I.check size={16} />} data-cursor="APROVAR">
                    {item.stage === 'analise_producao' ? 'Aprovar e enviar ao cliente' : item.stage === 'revisao_ajuste' ? 'Ajuste conferido — enviar ao cliente' : 'Aprovar tema'}
                  </Button>
                  <Button size="lg" magnetic disabled={busy} onClick={() => setAdjOpen(true)}>Solicitar ajuste</Button>
                  <span className="xs muted grow" style={{ textAlign: 'right' }}>Após decidir, o próximo item abre sozinho.</span>
                </div>
              ) : <p className="sm muted mt-5">Você pode visualizar, mas a decisão é de quem revisa.</p>}
            </article>
          )}
        </div>
      )}
      {item && <AdjustModal key={item.id} open={adjOpen} onClose={() => setAdjOpen(false)} busy={busy} isCronograma={item.stage === 'analise_cronograma'} producers={item.producers} onSubmit={decide} />}
      {item && <Modal open={compare} onClose={() => setCompare(false)} title={`Comparar versões — #${item.number}`} wide><CompareVersions versions={item.versions} /></Modal>}
    </div>
  );
}
