import { useRef, useState } from 'react';
import { StateTag, StatePanel } from '../components/State.jsx';
import { Link } from 'react-router-dom';
import { useApi, useToast, useAuth } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Section, Loading, Empty, Button, Tag, Tabs, PageHead, ErrorBox } from '../components/ui.jsx';
import { StateNotice, Insufficient } from '../components/State.jsx';
import { DecisionMemory, AutomationRadar } from './intel/Memoria.jsx';
import { ago, cleanName } from '../lib/format.js';
import '../styles/intel.css';
import { useUrlState } from '../lib/nav.jsx';

const SUGGESTED = ['Por que este cliente está atrasado?', 'Quais são os principais gargalos da produção?', 'Quais decisões foram tomadas na última reunião?', 'Qual é o tom de voz deste cliente?', 'Quais tarefas poderiam ser automatizadas?', 'Quais clientes estão aguardando aprovação?'];
const LABELS = { cliente: 'Cliente', client_brain: 'Client Brain', conteudos: 'Conteúdos', historico_conteudo: 'Histórico do conteúdo', ajustes: 'Ajustes', comentarios: 'Comentários', metricas: 'Métricas da operação', pendencias: 'Pendências', insights: 'Insights', carga_equipe: 'Carga da equipe', reunioes: 'Reuniões', financeiro: 'Financeiro', pipeline: 'Pipeline comercial' };

export default function Brain() {
  useCrumbs('The Bold Brain');
  const toast = useToast();
  const { data: meta, error: metaError, reload } = useApi('/brain/agents', [], { live: false });
  const { data: clients } = useApi('/clients', [], { live: false });
  const auth = useAuth();
  const canRadar = !!auth.permissions?.automacoes?.includes('view');
  const [tab, setTab] = useUrlState('aba', 'consultas');
  const { data: dec } = useApi('/brain/decisions', [tab], { live: false });
  const { data: radar } = useApi(canRadar ? '/brain/radar' : null, [tab], { live: false });
  const go = (t) => { setTab(t); setTimeout(() => out.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); };
  const [q, setQ] = useState('');
  const [agent, setAgent] = useUrlState('agente', 'brain');
  const [client, setClient] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [asked, setAsked] = useState('');
  const out = useRef(null);
  const ask = async (question = q) => {
    if (!question.trim() || !meta?.configured) return;
    setBusy(true); setRes(null); setAsked(question); setTab('consultas');
    try {
      const r = await api.post('/brain/ask', { question, agent, client_id: client || null });
      setRes(r); reload();
      setTimeout(() => out.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const head = <PageHead kicker="THE BOLD BRAIN" title="Sua inteligência operacional." sub="Perguntas sobre a operação respondidas pelo Claude com os dados que você tem permissão para ver." />;
  if (metaError) return <div className="page">{head}<ErrorBox error={metaError} /></div>;
  if (!meta) return <div className="page">{head}<Loading /></div>;
  const available = meta.agents.filter((a) => a.available);
  const off = !meta.configured;
  const reason = off ? 'Indisponível: o Claude (Anthropic) ainda não está configurado no servidor.' : !q.trim() ? 'Escreva uma pergunta.' : '';
  return (
    <div className="page">
      {head}
      {off && (
        <div className="mb-5">
          <StateNotice s="aguardando_configuracao" title="Claude (Anthropic)" action="Ver integrações" to="/integracoes">
            Conecte o Claude para ativar consultas inteligentes. Nada é simulado: sem a chave, o Brain não responde.
          </StateNotice>
        </div>
      )}
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
          <Button variant="primary" magnetic arrow onClick={() => ask()} disabled={busy || off || !q.trim()} title={reason || undefined} aria-describedby={off ? 'brain-off' : undefined} style={{ marginLeft: 'auto' }}>{busy ? 'Pensando…' : 'Perguntar'}</Button>
        </div>
        {off && <p id="brain-off" className="xs mt-2" style={{ color: 'rgba(246,243,240,.75)', textAlign: 'right' }}>{reason}</p>}
        <div className="chips mt-5">{SUGGESTED.map((s) => <button key={s} className="chip" onClick={() => { setQ(s); if (!off) ask(s); }}>{s}</button>)}</div>
        <p className="xs mt-4" style={{ color: 'rgba(246,243,240,.55)', maxWidth: 720 }}>{available.find((a) => a.key === agent)?.desc} Os dados enviados respeitam suas permissões: o agente só vê o que você pode ver.</p>
      </div>

      <div className="state-grid section">
        <StatePanel compact s={meta.configured ? 'ativo' : 'aguardando_configuracao'} kicker="Consultas" title="Perguntas sobre clientes, operação, gargalos e padrões" missing={meta.configured ? null : 'conectar o Claude (ANTHROPIC_API_KEY) em Integrações.'} />
        <StatePanel compact s="ativo" kicker="Memória" title="Client Brain e dados da plataforma, respeitando suas permissões" />
        <StatePanel compact s={dec?.state || 'dados_insuficientes'} kicker="Memória de Decisões" title="“Por que fazemos dessa forma?” — decisões com contexto, motivo e validade"
          action={<button className="btn btn-sm" onClick={() => go('decisoes')}>{dec?.total ? `Abrir · ${dec.total} decisão(ões)` : 'Abrir'}</button>} />
        <StatePanel compact s={!canRadar ? 'bloqueado' : radar?.state || 'dados_insuficientes'} kicker="Radar de Automações" title="Padrões manuais repetidos viram sugestão de regra, sempre com aprovação humana"
          missing={canRadar ? null : 'permissão de Automações (ver).'}
          action={canRadar && <button className="btn btn-sm" onClick={() => go('radar')}>{radar?.items?.length ? `Abrir · ${radar.items.length} padrão(ões)` : 'Abrir'}</button>} />
      </div>

      <div className="section" ref={out} style={{ scrollMarginTop: 80 }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ key: 'consultas', label: 'Consultas' }, { key: 'decisoes', label: 'Memória de Decisões', count: dec?.total }, ...(canRadar ? [{ key: 'radar', label: 'Radar de Automações', count: radar?.items?.length }] : [])]} />
      </div>
      {tab === 'decisoes' && <DecisionMemory clients={clients} />}
      {tab === 'radar' && canRadar && <AutomationRadar />}

      {tab === 'consultas' && <>
      <div style={{ scrollMarginTop: 80 }}>
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

      <Section title="O que o Brain já usa hoje sem IA" kicker="Funciona sem a chave do Claude">
        <p className="sm muted" style={{ marginTop: 0 }}>Os detectores determinísticos já analisam a operação (gargalos, retrabalho, carga, espera e prazos) com regras fixas e evidências. Não dependem do Claude.</p>
        <div className="row wrap" style={{ gap: 12 }}>
          <Link to="/insights" className="chip">Insights da operação →</Link>
          <Link to="/torre" className="chip">Torre de Controle →</Link>
        </div>
      </Section>

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
          )) : <Insufficient title="NENHUMA CONSULTA AINDA">{off ? 'O histórico aparece aqui quando o Claude estiver configurado e você fizer a primeira pergunta.' : 'Suas perguntas ao Brain ficam registradas aqui.'}</Insufficient>}
        </Section>
      </div>
      </>}
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
