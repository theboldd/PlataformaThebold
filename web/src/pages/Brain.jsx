import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi, useToast } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Section, Loading, Empty, Button, Tag } from '../components/ui.jsx';
import { ago, cleanName } from '../lib/format.js';
import '../styles/intel.css';

const SUGGESTED = ['Por que este cliente está atrasado?', 'Quais são os principais gargalos da produção?', 'Quais decisões foram tomadas na última reunião?', 'Qual é o tom de voz deste cliente?', 'Quais tarefas poderiam ser automatizadas?', 'Quais clientes estão aguardando aprovação?'];
const LABELS = { cliente: 'Cliente', client_brain: 'Client Brain', conteudos: 'Conteúdos', historico_conteudo: 'Histórico do conteúdo', ajustes: 'Ajustes', comentarios: 'Comentários', metricas: 'Métricas da operação', pendencias: 'Pendências', insights: 'Insights', carga_equipe: 'Carga da equipe', reunioes: 'Reuniões', financeiro: 'Financeiro', pipeline: 'Pipeline comercial' };

export default function Brain() {
  useCrumbs('The Bold Brain');
  const toast = useToast();
  const { data: meta, reload } = useApi('/brain/agents', [], { live: false });
  const { data: clients } = useApi('/clients', [], { live: false });
  const [q, setQ] = useState('');
  const [agent, setAgent] = useState('brain');
  const [client, setClient] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [asked, setAsked] = useState('');
  const out = useRef(null);
  const ask = async (question = q) => {
    if (!question.trim()) return;
    setBusy(true); setRes(null); setAsked(question);
    try {
      const r = await api.post('/brain/ask', { question, agent, client_id: client || null });
      setRes(r); reload();
      setTimeout(() => out.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  if (!meta) return <div className="page"><Loading /></div>;
  const available = meta.agents.filter((a) => a.available);
  return (
    <div className="page">
      <div className="brain-hero">
        <div className="row between wrap mb-5">
          <span className="caps">The Bold Brain · conhecimento + inteligência</span>
          <span className="row gap-2 wrap">
            <Tag tone={meta.configured ? 'ok' : 'warn'}>{meta.configured ? `Claude conectado · ${meta.model}` : 'Claude não configurado'}</Tag>
            <Tag>Memória: {meta.knowledge_provider === 'banco' ? 'banco da plataforma' : meta.knowledge_provider}</Tag>
          </span>
        </div>
        <label htmlFor="brain-q" className="sr-only">Pergunta</label>
        <textarea id="brain-q" className="brain-q" rows={2} placeholder="Pergunte qualquer coisa sobre a operação…" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }} />
        <div className="row wrap mt-4" style={{ gap: 12 }}>
          <select className="select" style={{ maxWidth: 260 }} value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Agente">
            {available.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
          <select className="select" style={{ maxWidth: 280 }} value={client} onChange={(e) => setClient(e.target.value)} aria-label="Contexto de cliente">
            <option value="">Toda a operação (sem cliente)</option>
            {(clients || []).map((c) => <option key={c.id} value={c.id}>{cleanName(c.name)}</option>)}
          </select>
          <Button variant="primary" magnetic arrow onClick={() => ask()} disabled={busy || !q.trim()} style={{ marginLeft: 'auto' }}>{busy ? 'Pensando…' : 'Perguntar'}</Button>
        </div>
        <div className="chips mt-5">{SUGGESTED.map((s) => <button key={s} className="chip" onClick={() => { setQ(s); ask(s); }}>{s}</button>)}</div>
        <p className="xs mt-4" style={{ color: 'rgba(246,243,240,.55)', maxWidth: 720 }}>{available.find((a) => a.key === agent)?.desc} Os dados enviados respeitam suas permissões: o agente só vê o que você pode ver.</p>
      </div>

      <div ref={out} style={{ scrollMarginTop: 80 }}>
        {busy && <div className="section row"><span className="thinking"><span /><span /><span /></span><span className="muted sm">Consultando dados permitidos…</span></div>}
        {res && (
          <Section title={asked} kicker={res.agent || 'Resposta'}>
            {res.status === 'ok' && <div className="answer">{res.answer}</div>}
            {res.status === 'erro' && <div className="answer honest">{res.message}</div>}
            {res.status === 'nao_configurado' && (
              <>
                <div className="answer honest">
                  <strong>Nenhuma resposta foi gerada.</strong> {res.message}
                  <div className="sm mt-2">Configure <code>ANTHROPIC_API_KEY</code> no servidor (ver <Link to="/integracoes" className="bordo">Integrações</Link>) para ativar respostas do Claude.</div>
                </div>
                <ContextView ctx={res.context} />
              </>
            )}
          </Section>
        )}
      </div>

      <div className="cols-even">
        <Section title="Agentes" kicker="Escopo de dados de cada agente">
          {meta.agents.map((a) => (
            <div key={a.key} className="erow" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', opacity: a.available ? 1 : 0.5 }}>
              <div><div className="t">{a.label}</div><div className="s">{a.desc}</div><div className="xs faint mt-2">módulos: {a.modules.join(', ')}</div></div>
              <span className="r">{a.available ? 'disponível' : 'sem permissão'}</span>
            </div>
          ))}
        </Section>
        <Section title="Suas consultas recentes">
          {meta.history.length ? meta.history.map((h) => (
            <button key={h.id} className="erow link" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--line)', textAlign: 'left', color: 'inherit' }} onClick={() => { setQ(h.prompt); setAgent(h.agent); }}>
              <div><div className="t">{h.prompt}</div><div className="s">{meta.agents.find((a) => a.key === h.agent)?.label || h.agent}</div></div>
              <div className="r col" style={{ alignItems: 'flex-end' }}><span>{ago(h.created_at)}</span><span>{h.status === 'ok' ? 'respondida' : h.status === 'nao_configurado' ? 'IA não configurada' : 'erro'}</span></div>
            </button>
          )) : <Empty title="Nenhuma consulta ainda." />}
        </Section>
      </div>
    </div>
  );
}

function ContextView({ ctx }) {
  if (!ctx) return null;
  return (
    <div className="ctx mt-5">
      <div className="caps mb-2">Dados que seriam enviados ao Claude (já filtrados pelas suas permissões)</div>
      {Object.entries(ctx).map(([k, v]) => (
        <details key={k}>
          <summary>{LABELS[k] || k}{Array.isArray(v) ? ` · ${v.length}` : ''}</summary>
          {k === 'cliente' && v ? (
            <div className="kv"><span>Nome</span><span>{cleanName(v.name)}</span><span>Segmento</span><span>{v.segment || '—'}</span><span>Risco</span><span>{v.risco?.level} {v.risco?.reasons?.length ? `— ${v.risco.reasons.join('; ')}` : ''}</span></div>
          ) : k === 'client_brain' && v ? (
            <div className="kv">{Object.entries(v.secoes || {}).map(([s, b]) => [<span key={s + 'k'}>{s}</span>, <span key={s + 'v'}>{b}</span>])}{v.memorias?.map((m, i) => [<span key={i + 'k'}>{m.kind}</span>, <span key={i + 'v'}>{m.body}</span>])}</div>
          ) : Array.isArray(v) && k === 'conteudos' ? (
            <div className="kv">{v.slice(0, 40).map((c, i) => [<span key={i + 'k'}>#{c.numero} {cleanName(c.cliente)}</span>, <span key={i + 'v'}>{c.titulo} — {c.etapa}{c.bloqueado ? ` · bloqueado: ${c.bloqueado}` : ''}{c.risco?.level && !['baixo', 'nenhum'].includes(c.risco.level) ? ` · risco ${c.risco.level}` : ''}</span>])}</div>
          ) : (
            <pre>{JSON.stringify(v, null, 2)}</pre>
          )}
        </details>
      ))}
    </div>
  );
}
