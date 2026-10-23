// CICLOS — abrir os meses (ex.: dezembro e janeiro produzidos juntos em novembro) e acompanhar o cronograma de cada cliente.
// Abrir não cria conteúdo: cria os ciclos com o calendário de marcos e entrega à estrategista a tarefa de montar o cronograma.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi, useToast } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Loading, ErrorBox, PageHead, Empty } from '../components/ui.jsx';
import { cleanName } from '../lib/format.js';
import '../styles/ciclos.css';

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mName = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const MS_LABEL = { cronograma_entrega: 'Entrega do cronograma', revisao_cronograma: 'Análise do cronograma', ajuste_cronograma: 'Ajuste do cronograma', cliente_aprova_temas: 'Cliente aprova os temas',
  leitura_comentarios: 'Leitura dos comentários', producao: 'Produção', revisao_producao: 'Revisão da produção', ajustes_equipe: 'Ajustes da equipe', tudo_pronto: 'Tudo pronto',
  cliente_aprova_final: 'Cliente aprova o conteúdo', ajustes_cliente: 'Ajustes do cliente', agendamento: 'Liberado para publicação' };
const dd = (d) => d.split('-').reverse().slice(0, 2).join('/');

export default function Ciclos() {
  useCrumbs('Ciclos');
  const { data, error, loading, reload } = useApi('/ciclos', [], { live: false });
  const [opening, setOpening] = useState(false);
  if (loading && !data) return <div className="page"><Loading rows={6} /></div>;
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  return (
    <div className="page cy">
      <PageHead kicker="Operação · Ciclos" title="Ciclos" sub="Abra os meses que vão ser produzidos. Cada estrategista recebe a tarefa de montar o cronograma do cliente; daí em diante o processo segue sozinho." />
      {data.can_open && !opening && <div><button className="btn btn-primary" onClick={() => setOpening(true)}>Abrir novo ciclo</button></div>}
      {opening && <OpenCycle data={data} onClose={() => setOpening(false)} onDone={() => { setOpening(false); reload(); }} />}
      {!data.batches.length ? <Empty title="Nenhum ciclo aberto na plataforma ainda.">Novembro veio do Notion. Abra dezembro e janeiro para as estrategistas começarem.</Empty>
        : data.batches.map((b) => <Batch key={b.batch_id} b={b} />)}
    </div>
  );
}

function OpenCycle({ data, onClose, onDone }) {
  const toast = useToast();
  const [months, setMonths] = useState(data.suggest.months.slice(1, 3));
  // Produzidos em: por padrão, o mês anterior ao primeiro mês escolhido (dezembro + janeiro → novembro)
  const before = (m) => { const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 2, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
  const [prod, setProd] = useState(before(data.suggest.months[1]));
  const [prodTouched, setProdTouched] = useState(false);
  useEffect(() => { if (!prodTouched && months.length) setProd(before(months[0])); }, [months, prodTouched]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ids, setIds] = useState(() => new Set(data.clients.map((c) => c.id)));
  const [busy, setBusy] = useState(false);
  const { data: pv } = useApi(`/ciclos/previa?producao=${prod}`, [prod], { live: false });
  const toggle = (m) => setMonths((x) => (x.includes(m) ? x.filter((y) => y !== m) : [...x, m].sort()));
  const go = async () => {
    setBusy(true);
    try {
      const r = await api.post('/ciclos', { months, production_month: prod, client_ids: [...ids] });
      toast(`Ciclo aberto: ${r.created + r.updated} ciclo(s) em ${ids.size} cliente(s) · ${r.tasks} tarefa(s) de cronograma para as estrategistas.${r.skipped.length ? ` ${r.skipped.length} já tinham conteúdo e mantiveram o calendário.` : ''}`);
      onDone();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const noStrategist = data.clients.filter((c) => ids.has(c.id) && !c.strategist);
  return (
    <section className="cy-open">
      <div className="cy-step"><span className="cy-n">01</span><div><b>Meses de publicação</b><p className="xs muted">Escolha um ou mais. Meses escolhidos juntos são produzidos juntos e seguem o mesmo calendário.</p>
        <div className="cy-chips">{data.suggest.months.map((m) => <button key={m} type="button" className={months.includes(m) ? 'on' : ''} onClick={() => toggle(m)}>{mName(m)}</button>)}</div></div></div>
      <div className="cy-step"><span className="cy-n">02</span><div><b>Produzidos em</b><p className="xs muted">O calendário de marcos (cronograma, aprovação dos temas, produção, revisão…) usa os dias deste mês.</p>
        <select className="select" style={{ width: 'auto' }} value={prod} onChange={(e) => { setProd(e.target.value); setProdTouched(true); }}>{[...new Set([...data.suggest.production, prod])].sort().map((m) => <option key={m} value={m}>{mName(m)}</option>)}</select>
        {pv && <ol className="cy-ms">{Object.entries(pv.milestones).map(([k, v]) => <li key={k}><b>{v.start === v.end ? dd(v.start) : `${dd(v.start)}–${dd(v.end)}`}</b><span>{MS_LABEL[k] || k}</span></li>)}</ol>}</div></div>
      <div className="cy-step"><span className="cy-n">03</span><div><b>Clientes</b> <span className="xs muted">{ids.size} de {data.clients.length}</span>
        <div className="row gap-2 mt-2"><button type="button" className="cy-link" onClick={() => setIds(new Set(data.clients.map((c) => c.id)))}>Todos</button><button type="button" className="cy-link" onClick={() => setIds(new Set())}>Nenhum</button></div>
        <ul className="cy-clients">{data.clients.map((c) => (
          <li key={c.id}><label><input type="checkbox" checked={ids.has(c.id)} onChange={() => setIds((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} />
            <span>{cleanName(c.name)}</span><small className={c.strategist ? '' : 'late'}>{c.strategist || 'sem estrategista'}</small></label></li>
        ))}</ul>
        {noStrategist.length > 0 && <p className="xs late">{noStrategist.length} cliente(s) sem estrategista vinculada: a tarefa nasce sem responsável e aparece em Pendências até alguém ser vinculado (Clientes → Equipe).</p>}</div></div>
      <div className="row gap-2"><button className="btn btn-primary" disabled={busy || !months.length || !ids.size} onClick={go}>{busy ? 'Abrindo…' : `Abrir ${months.map(mName).join(' + ')}`}</button><button className="btn btn-ghost" onClick={onClose}>Cancelar</button></div>
    </section>
  );
}

function Batch({ b }) {
  const tot = b.clients.reduce((a, c) => a + c.counts.total, 0);
  return (
    <section className="cy-batch">
      <header className="cy-bh">
        <div><span className="cy-k">Ciclo · produzido em {mName(b.production_month || b.months[0])}</span><h2 className="cy-t">{b.months.map(mName).join(' + ')}</h2></div>
        <span className="xs muted">{b.clients.length} clientes · {tot} conteúdos · aberto por {b.opened_by || '—'}</span>
      </header>
      <ol className="cy-ms compact">{Object.entries(b.milestones).filter(([k]) => ['cronograma_entrega', 'cliente_aprova_temas', 'producao', 'revisao_producao', 'cliente_aprova_final', 'agendamento'].includes(k)).map(([k, v]) => <li key={k}><b>{v.start === v.end ? dd(v.start) : `${dd(v.start)}–${dd(v.end)}`}</b><span>{MS_LABEL[k]}</span></li>)}</ol>
      <ul className="cy-rows">{b.clients.map((c) => (
        <li key={c.client_id}>
          <Link to={`/ciclos/${b.batch_id}/${c.client_id}`}>
            <span className="cy-cn">{cleanName(c.client)}</span>
            <span className="cy-who">{c.strategist || <span className="late">sem estrategista</span>}</span>
            {!c.counts.total ? <span className="cy-empty">cronograma não começou</span> : <span className="cy-bar" title={`${c.counts.cronograma} no cronograma · ${c.counts.analise} em análise · ${c.counts.tema} com o cliente (tema) · ${c.counts.producao} em produção · ${c.counts.pronto} prontos`}>
              {['cronograma', 'analise', 'tema', 'producao', 'pronto'].map((k) => c.counts[k] ? <i key={k} className={`b-${k}`} style={{ flex: c.counts[k] }} /> : null)}
            </span>}
            <span className="cy-num">{c.counts.total}</span>
          </Link>
        </li>
      ))}</ul>
      <div className="cy-legend"><span className="b-cronograma">Cronograma</span><span className="b-analise">Análise</span><span className="b-tema">Tema com o cliente</span><span className="b-producao">Produção</span><span className="b-pronto">Pronto</span></div>
    </section>
  );
}

// CRONOGRAMA DO CLIENTE — a planilha da estrategista (como o CR EDITORIAL): uma linha por conteúdo
const FORMAT_OPTS = [['carrossel', 'Carrossel'], ['reel', 'Reels'], ['estatico', 'Estático'], ['foto', 'Foto'], ['video', 'Vídeo'], ['stories', 'Stories']];
const blank = () => ({ key: Math.random().toString(36).slice(2), planned_at: '', format: 'carrossel', title: '', theme: '', objective: '', strategy_tags: '', editable: true });
export function CicloCliente({ batch, clientId }) {
  const toast = useToast();
  const nav = useNavigate();
  const { data, error, loading, reload } = useApi(`/ciclos/${batch}/${clientId}`, [batch, clientId], { live: false });
  useCrumbs('Ciclos', data ? cleanName(data.client.name) : '');
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState([]);
  useEffect(() => { if (data) setRows([...data.rows.map((r) => ({ ...r, key: r.id, planned_at: r.planned_at ? new Date(new Date(r.planned_at).getTime() - 3 * 3600e3).toISOString().slice(0, 10) : '', strategy_tags: r.strategy_tags.join(', ') })), ...(data.rows.length ? [] : [blank(), blank(), blank()])]); }, [data]);
  const dirty = useMemo(() => !!rows && rows.some((r) => r.editable && (r._changed || (!r.id && r.title.trim()))), [rows]);
  if (loading && !data) return <div className="page"><Loading rows={8} /></div>;
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  if (!rows) return null;
  const set = (key, k, v) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [k]: v, _changed: true } : r)));
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/ciclos/${batch}/${clientId}/linhas`, { rows: rows.filter((x) => x.editable && (x._changed || !x.id)).map(({ key, _changed, editable, stage, stage_label, number, month, ...x }) => x) });
      toast(`Cronograma salvo: ${r.created} nova(s), ${r.updated} atualizada(s).${r.errors.length ? ` ${r.errors[0]}` : ''}`, r.errors.length ? 'err' : undefined);
      reload();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const send = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/ciclos/${batch}/${clientId}/enviar`);
      setPending(r.pending);
      toast(r.sent ? `${r.sent} conteúdo(s) enviados para análise. Rebeca e Raísa foram avisadas.` : 'Nada enviado ainda.', r.sent ? undefined : 'err');
      reload();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const remove = async (r) => {
    if (!r.id) { setRows((rs) => rs.filter((x) => x.key !== r.key)); return; }
    try { await api.post(`/ciclos/${batch}/${clientId}/linhas/${r.id}/remover`); toast('Linha removida do cronograma.'); reload(); } catch (e) { toast(e.message, 'err'); }
  };
  const ready = rows.filter((r) => r.id && r.editable).length;
  return (
    <div className="page cy">
      <PageHead kicker={`Cronograma · ${data.months.map(mName).join(' + ')}`} title={cleanName(data.client.name)} sub={`Estrategista: ${data.strategist || 'sem estrategista vinculada'} · entrega do cronograma até ${data.milestones.cronograma_entrega ? dd(data.milestones.cronograma_entrega.end) : '—'}${data.client.requires_theme_approval ? ' · o cliente aprova os temas' : ''}`} />
      <p className="sm"><Link to="/ciclos">← Todos os ciclos</Link></p>
      <div className="cy-grid">
        <div>
          <div className="table-wrap">
            <table className="table cy-table">
              <thead><tr><th>Data</th><th>Formato</th><th>Título</th><th>Tema</th><th>Objetivo</th><th>Estratégia</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => r.editable ? (
                  <tr key={r.key}>
                    <td><input type="date" className="input" value={r.planned_at} onChange={(e) => set(r.key, 'planned_at', e.target.value)} aria-label="Data de publicação" /></td>
                    <td><select className="select" value={r.format} onChange={(e) => set(r.key, 'format', e.target.value)} aria-label="Formato">{FORMAT_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                    <td><input className="input" value={r.title} onChange={(e) => set(r.key, 'title', e.target.value)} placeholder="Título do conteúdo" aria-label="Título" /></td>
                    <td><input className="input" value={r.theme || ''} onChange={(e) => set(r.key, 'theme', e.target.value)} aria-label="Tema" /></td>
                    <td><input className="input" value={r.objective || ''} onChange={(e) => set(r.key, 'objective', e.target.value)} aria-label="Objetivo" /></td>
                    <td><input className="input" value={r.strategy_tags} onChange={(e) => set(r.key, 'strategy_tags', e.target.value)} placeholder="educativo, conexão" aria-label="Estratégia" /></td>
                    <td className="cy-acts">{r.id && <Link className="cy-link" to={`/conteudos/${r.id}`} title="Abrir para adicionar direcionamento (referências, observação)">Direcionar</Link>}<button type="button" className="cy-link" onClick={() => remove(r)}>Remover</button></td>
                  </tr>
                ) : (
                  <tr key={r.key} className="cy-locked">
                    <td>{r.planned_at ? r.planned_at.split('-').reverse().join('/') : '—'}</td><td>{FORMAT_OPTS.find(([v]) => v === r.format)?.[1]}</td>
                    <td colSpan={4}><Link to={`/conteudos/${r.id}`}>{r.title}</Link></td><td><span className="cy-stage">{r.stage_label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row wrap gap-2 mt-3">
            <button type="button" className="btn btn-ghost" onClick={() => setRows((rs) => [...rs, blank()])}>+ Linha</button>
            <button type="button" className="btn" disabled={busy || !dirty} onClick={save}>Salvar</button>
            <button type="button" className="btn btn-primary" disabled={busy || dirty || !ready} onClick={send} title={dirty ? 'Salve antes de enviar' : ''}>Enviar para análise ({ready})</button>
            <button type="button" className="btn btn-ghost" onClick={() => nav(`/processos?client_id=${clientId}`)}>Ver no quadro</button>
          </div>
          <p className="xs muted mt-2">Para enviar, cada linha precisa de data e de tema ou objetivo. Depois de enviada, ela sai da planilha e segue o processo: análise (Rebeca/Raísa) → {data.client.requires_theme_approval ? 'aprovação do tema pelo cliente → ' : ''}produção (design/edição e legenda). Referências visuais: abra a linha em “Direcionar”.</p>
          {pending.length > 0 && <ul className="xs late">{pending.map((p) => <li key={p}>{p}</li>)}</ul>}
        </div>
        <details className="cy-brain">
          <summary>Client Brain do cliente</summary>
          {!data.brain.length ? <p className="xs muted">Sem registros de estratégia, público ou tom para este cliente.</p> : data.brain.map((b, i) => <div key={i}><b>{b.label}</b><p>{String(b.content).slice(0, 280)}{String(b.content).length > 280 ? '…' : ''}</p></div>)}
          <Link className="cy-link" to={`/clientes/${clientId}?tab=brain`}>Abrir o Client Brain ↗</Link>
        </details>
      </div>
    </div>
  );
}
