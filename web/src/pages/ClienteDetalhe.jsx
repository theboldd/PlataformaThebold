import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi, useAuth, useToast } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Avatar, Button, ContentCard, Empty, ErrorBox, Field, Loading, Risk, Stat, Status, Tabs, Timeline } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { ago, bytes, cleanName, fmtDate, fmtDateTime, fmtMonth, money } from '../lib/format.js';
import { FUNCTIONS } from '../lib/status.js';
import Ficha from './client/Ficha.jsx';
import '../styles/production.css';

const BRAIN = [['posicionamento', 'Posicionamento'], ['publico', 'Público'], ['persona', 'Persona'], ['tom', 'Tom de voz'], ['linguagem', 'Linguagem'], ['oferta', 'Oferta'], ['produtos', 'Produtos e serviços'], ['objetivos', 'Objetivos'], ['estrategia', 'Estratégia'], ['preferencias', 'Preferências'], ['restricoes', 'Restrições'], ['referencias', 'Referências'], ['regras', 'Regras específicas'], ['importante', 'Informações importantes']];
const MILESTONES = { cronograma_entrega: 'Entrega do cronograma', revisao_cronograma: 'Revisão do cronograma', ajuste_cronograma: 'Ajuste do cronograma', cliente_aprova_temas: 'Cliente aprova temas', leitura_comentarios: 'Leitura de comentários', producao: 'Produção', revisao_producao: 'Revisão da produção', ajustes_equipe: 'Ajustes da equipe', tudo_pronto: 'Tudo pronto', cliente_aprova_final: 'Cliente aprova produção', ajustes_cliente: 'Ajustes do cliente', agendamento: 'Agendamento' };
const MEM_KINDS = { decisao: 'Decisão', aprendizado: 'Aprendizado', feedback: 'Feedback', preferencia: 'Preferência', restricao: 'Restrição', informacao: 'Informação' };
const CYCLE = { planejamento: 'Planejamento', aprovacao_temas: 'Aprovação de temas', producao: 'Produção', aprovacao_final: 'Aprovação final', agendamento: 'Agendamento', publicando: 'Publicando', encerrado: 'Encerrado' };

export default function ClienteDetalhe() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'visao';
  const setTab = (t) => setParams(t === 'visao' ? {} : { tab: t }, { replace: true });
  const { data, error, loading, reload } = useApi(`/clients/${id}`, [id]);
  const auth = useAuth();
  useCrumbs('Clientes', data ? cleanName(data.client.name) : '…');
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  if (loading || !data) return <div className="page"><Loading rows={8} /></div>;
  const { client: c, onboarding: ob } = data;
  const missing = ob ? ob.items.filter((i) => i.status === 'pendente' && i.required) : [];
  const tabs = [
    { key: 'visao', label: 'Visão geral' }, { key: 'ficha', label: 'Ficha' }, { key: 'brain', label: 'Resumo do Brain' },
    { key: 'onboarding', label: 'Onboarding', count: ob && ob.status !== 'concluido' ? missing.length : 0 },
    { key: 'conteudos', label: 'Conteúdos', count: data.contents.length }, { key: 'reunioes', label: 'Reuniões', count: data.meetings.length },
    { key: 'equipe', label: 'Equipe' }, { key: 'arquivos', label: 'Arquivos', count: data.files.length },
    ...(data.finance ? [{ key: 'financeiro', label: 'Financeiro' }] : []), { key: 'historico', label: 'Histórico' },
  ];
  return (
    <div className="page">
      <header className="dossie-head">
        <div>
          <div className="caps">Dossiê · {c.segment || 'Cliente'}{c.handle ? ` · ${c.handle}` : ''}</div>
          <h1 className="ed-xxl mt-2">{cleanName(c.name)}</h1>
          <div className="row wrap gap-4 mt-4">
            <span className={`tag ${c.status === 'onboarding' ? 'tag-bordo' : c.status === 'ativo' ? 'tag-ok' : ''}`}>{c.status === 'a_confirmar' ? 'status a confirmar' : c.status}</span>
            <Risk level={c.risk.level} />{['baixo', 'nenhum'].includes(c.risk.level) && <span className="xs muted">sem riscos identificados</span>}
            <span className="sm muted">{c.services.join(' · ')}</span>
          </div>
        </div>
        <div className="row wrap gap-2">
          {data.channel_id && <Link to={`/comunicacao/${data.channel_id}`} className="btn" data-cursor="ABRIR"><I.chat size={14} /> Conversa com o cliente</Link>}
          {auth.can('conteudos', 'create') && <Link to={`/conteudos/novo?client_id=${c.id}`} className="btn btn-primary"><I.plus size={14} /> Conteúdo</Link>}
        </div>
      </header>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'visao' && <Overview data={data} missing={missing} setTab={setTab} />}
      {tab === 'ficha' && <Ficha clientId={c.id} />}
      {tab === 'brain' && <BrainTab data={data} reload={reload} />}
      {tab === 'onboarding' && <OnboardingTab data={data} missing={missing} reload={reload} />}
      {tab === 'conteudos' && <ContentsTab data={data} />}
      {tab === 'reunioes' && (!data.meetings.length ? <Empty title="Nenhuma reunião registrada." /> : (
        <ul className="list">{data.meetings.map((m) => (
          <li key={m.id}><span className="idx" style={{ width: 90, fontSize: 18 }}>{fmtDate(m.starts_at)}</span><div className="grow"><div className="sm strong">{m.title}</div><div className="xs muted">{m.status} · {new Date(m.starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{m.summary ? ` · ${m.summary}` : ''}</div></div><span className="xs faint">Google: {m.gcal_sync?.replace('_', ' ')}</span><Link className="btn btn-sm btn-ghost" to={`/reunioes?m=${m.id}`}>Abrir</Link></li>
        ))}</ul>
      ))}
      {tab === 'equipe' && <TeamTab data={data} reload={reload} />}
      {tab === 'arquivos' && (!data.files.length ? <Empty title="Nenhum arquivo." >Materiais enviados pelo cliente e entregas da produção aparecem aqui.</Empty> : (
        <div className="files-grid">{data.files.map((f) => (
          <a key={f.id} className="file-tile" href={f.urls.original} target="_blank" rel="noreferrer" data-cursor="VER">
            {f.urls.thumb ? <img className="pv" src={f.urls.thumb} alt="" loading="lazy" /> : <span className="pv"><I.file /></span>}
            <span className="clip">{f.name}</span>
            <span className="faint">{f.width ? `${f.width}×${f.height} · ` : ''}{bytes(f.size)} · {ago(f.created_at)}</span>
          </a>
        ))}</div>
      ))}
      {tab === 'financeiro' && data.finance && <FinanceTab finance={data.finance} />}
      {tab === 'historico' && <Timeline items={data.timeline} />}
    </div>
  );
}

function CycleBlock({ cycle }) {
  const today = new Date().toISOString().slice(0, 10);
  const pct = cycle.counts.total ? Math.round(((cycle.counts.done || 0) / cycle.counts.total) * 100) : 0;
  return (
    <div className="mb-5">
      <div className="row between wrap mb-2"><span className="ed-md" style={{ textTransform: 'capitalize' }}>Ciclo {fmtMonth(cycle.month)}</span><span className="sm muted">{CYCLE[cycle.status]} · {cycle.counts.done || 0}/{cycle.counts.total} agendados ou publicados</span></div>
      <div className="bar mb-4"><span style={{ width: `${pct}%` }} /></div>
      <div className="milestones">{Object.entries(cycle.milestones).map(([k, m]) => {
        const st = m.end < today ? 'past' : m.start <= today ? 'now' : '';
        return <div key={k} className={`milestone ${st}`}><div className="k">{MILESTONES[k] || k}</div><div>{m.start === m.end ? fmtDate(`${m.start}T12:00:00-03:00`) : `${fmtDate(`${m.start}T12:00:00-03:00`)} → ${fmtDate(`${m.end}T12:00:00-03:00`)}`}{st === 'now' ? ' · agora' : ''}</div></div>;
      })}</div>
    </div>
  );
}

function Overview({ data, missing, setTab }) {
  const { client: c } = data;
  const active = data.cycles.filter((cy) => cy.status !== 'encerrado').sort((a, b) => b.month.localeCompare(a.month)).slice(0, 2);
  const brainLines = data.brain.filter((b) => b.body && ['posicionamento', 'tom', 'restricoes', 'objetivos'].includes(b.section));
  const decisions = data.memories.filter((m) => m.kind === 'decisao').slice(0, 4);
  return (
    <div>
      <div className="stats">
        <Stat value={c.counts.total || 0} label="Conteúdos" />
        <Stat value={c.counts.em_producao || 0} label="Em produção" onClick={() => setTab('conteudos')} />
        <Stat value={c.counts.aguardando_cliente || 0} label="Aguardando cliente" alert={(c.counts.aguardando_cliente || 0) > 0} onClick={() => setTab('conteudos')} />
        <Stat value={c.counts.publicados || 0} label="Publicados" />
      </div>
      {data.onboarding && data.onboarding.status !== 'concluido' && missing.length > 0 && (
        <button className="ob-banner mt-5" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', color: 'inherit' }} onClick={() => setTab('onboarding')}>
          <div className="caps" style={{ color: 'var(--err)' }}>Onboarding incompleto</div>
          <div className="sm mt-2">Faltam <b>{missing.length}</b> itens: {missing.slice(0, 4).map((m) => m.label).join(' · ')}{missing.length > 4 ? '…' : ''}</div>
        </button>
      )}
      <div className="grid-2 section" style={{ alignItems: 'start' }}>
        <div>
          <div className="section-head"><h2 className="ed-md">Próximos passos</h2></div>
          {c.risk.reasons.length > 0 && <div className="mb-4">{c.risk.reasons.map((r) => <div key={r} className="sm" style={{ color: 'var(--err)', padding: '4px 0' }}>■ {r}</div>)}</div>}
          {c.next ? (
            <Link to={`/conteudos/${c.next.content_id}`} className="next-action" style={{ display: 'block' }} data-cursor="ABRIR">
              <div className="caps">{c.next.stage}</div><div className="ed-md mt-2">{c.next.content}</div><div className="sm mt-2"><b>{c.next.who || '—'}</b> · {c.next.text}</div>
            </Link>
          ) : <p className="sm muted">Nenhum conteúdo em andamento.</p>}
          <div className="section-head mt-6"><h2 className="ed-md">Equipe</h2><button className="btn btn-sm btn-ghost" onClick={() => setTab('equipe')}>Ver</button></div>
          <div className="row wrap gap-4">{Object.values(data.team.reduce((acc, t) => { (acc[t.id] ||= { ...t, fns: [] }).fns.push(FUNCTIONS[t.function]); return acc; }, {})).map((t) => <span key={t.id} className="row gap-2 sm"><Avatar name={t.name} tone={t.function === 'cliente' ? 'ink' : undefined} /> <span>{t.name}<div className="xs faint">{t.fns.join(' · ')}</div></span></span>)}</div>
        </div>
        <div>
          <div className="section-head"><h2 className="ed-md">Essência da marca</h2><button className="btn btn-sm btn-ghost" onClick={() => setTab('brain')}>Client Brain</button></div>
          {!brainLines.length ? <p className="sm muted">Client Brain ainda vazio — preenchido no onboarding.</p> : brainLines.map((b) => <div key={b.section} className="mb-4"><div className="caps">{BRAIN.find((x) => x[0] === b.section)?.[1]}</div><div className="sm mt-2">{b.body}</div></div>)}
          {decisions.length > 0 && <><div className="caps mt-5 mb-2">Decisões recentes</div>{decisions.map((d) => <div key={d.id} className="sm" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>{d.body}<div className="xs faint">{ago(d.created_at)}</div></div>)}</>}
        </div>
      </div>
      <section className="section">
        <div className="section-head"><h2 className="ed-md">Calendário operacional</h2></div>
        {!active.length ? <p className="sm muted">Nenhum ciclo ativo.</p> : active.map((cy) => <CycleBlock key={cy.id} cycle={cy} />)}
      </section>
    </div>
  );
}

function BrainTab({ data, reload }) {
  const toast = useToast();
  const canEdit = data.can_edit;
  const [editing, setEditing] = useState(null);
  const [text, setText] = useState('');
  const [mem, setMem] = useState({ kind: 'decisao', body: '' });
  const bySec = Object.fromEntries(data.brain.map((b) => [b.section, b]));
  const save = async (sec) => {
    try { await api.put(`/clients/${data.client.id}/brain/${sec}`, { body: text }); toast('Client Brain atualizado.'); setEditing(null); reload(); } catch (e) { toast(e.message, 'err'); }
  };
  const addMem = async () => {
    try { await api.post(`/clients/${data.client.id}/memories`, mem); setMem({ ...mem, body: '' }); toast('Memória registrada.'); reload(); } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', alignItems: 'start' }}>
      <div>
        <div className="row between mb-4"><p className="sm muted" style={{ margin: 0 }}>A memória da marca. A IA consulta estas seções automaticamente ao trabalhar com este cliente.</p><a className="btn btn-sm" href={`/api/clients/${data.client.id}/brain.md`} target="_blank" rel="noreferrer"><I.download size={14} /> Exportar .md</a></div>
        {BRAIN.map(([k, label]) => {
          const b = bySec[k];
          return (
            <div className="brain-sec" key={k}>
              <div><div className="caps">{label}</div>{b?.updated_at && b.body && <div className="xs faint mt-2">{ago(b.updated_at)}</div>}</div>
              {editing === k ? (
                <div className="col gap-2">
                  <textarea className="textarea" autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(k); }} />
                  <div className="row end"><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button><Button size="sm" variant="ink" onClick={() => save(k)}>Salvar</Button></div>
                </div>
              ) : (
                <div className={`val ${b?.body ? '' : 'empty-val'}`} role={canEdit ? 'button' : undefined} tabIndex={canEdit ? 0 : undefined} onClick={() => { if (canEdit) { setEditing(k); setText(b?.body || ''); } }}
                  onKeyDown={(e) => { if (canEdit && e.key === 'Enter') { setEditing(k); setText(b?.body || ''); } }} data-cursor={canEdit ? 'EDITAR' : undefined}>
                  {b?.body || (canEdit ? 'Clique para preencher…' : 'Não preenchido.')}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div>
        <div className="section-head"><h2 className="ed-md">Memórias</h2><span className="xs faint">decisões, aprendizados, feedbacks</span></div>
        {canEdit && (
          <div className="col gap-2 mb-5">
            <select className="select" value={mem.kind} onChange={(e) => setMem({ ...mem, kind: e.target.value })} aria-label="Tipo de memória">{Object.entries(MEM_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <textarea className="textarea" placeholder="Ex.: Cliente prefere capas claras e não aprova fundo branco chapado." value={mem.body} onChange={(e) => setMem({ ...mem, body: e.target.value })} />
            <div className="row end"><Button size="sm" variant="ink" disabled={!mem.body.trim()} onClick={addMem}>Registrar</Button></div>
          </div>
        )}
        {!data.memories.length ? <Empty title="Sem memórias." /> : data.memories.map((m) => (
          <div key={m.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
            <div className="row gap-2"><span className="tag">{MEM_KINDS[m.kind] || m.kind}</span>{m.source_type && <span className="xs faint">via {m.source_type === 'meeting' ? 'reunião' : m.source_type === 'message' ? 'conversa' : m.source_type}</span>}</div>
            <div className="sm mt-2">{m.body}</div>
            <div className="xs faint">{m.author || 'Sistema'} · {ago(m.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OnboardingTab({ data, missing, reload }) {
  const toast = useToast();
  const ob = data.onboarding;
  if (!ob) return <Empty title="Sem onboarding." />;
  const formLine = ob.form && (
    <div className="panel mb-5 row between wrap gap-3">
      <span className="sm">Formulário “Sua marca”: <b>{{ nao_iniciado: 'não iniciado', em_andamento: 'em preenchimento pelo cliente', concluido: 'concluído' }[ob.form_status] || ob.form_status}</b> · {ob.form.answered}/{ob.form.total} respostas{ob.form_submitted_at ? ` · enviado em ${fmtDateTime(ob.form_submitted_at)}` : ''}</span>
      <Link className="btn btn-sm btn-ghost" to={`/clientes/${data.client.id}?tab=ficha`}>Ver respostas</Link>
    </div>
  );
  if (ob.status === 'migrado') return <div>{formLine}<p className="sm muted">Cliente migrado do Notion: o onboarding aconteceu antes da plataforma. As respostas encontradas estão na Ficha, com a origem de cada uma.</p></div>;
  const groups = [['formulario', 'Formulário'], ['material', 'Materiais'], ['acesso', 'Acessos'], ['interno', 'Interno']];
  const set = async (item, status) => { try { await api.patch(`/onboarding/items/${item.id}`, { status }); toast(`“${item.label}” → ${status}`); reload(); } catch (e) { toast(e.message, 'err'); } };
  const now = new Date().toISOString();
  const done = ob.items.filter((i) => i.status !== 'pendente').length;
  return (
    <div>
      {formLine}
      {ob.status !== 'concluido' && missing.length > 0 ? (
        <div className="ob-banner">
          <div className="row between wrap"><div className="caps" style={{ color: 'var(--err)' }}>Onboarding incompleto</div><span className="sm">{done}/{ob.items.length} itens · iniciado {ago(ob.started_at)}</span></div>
          <ul className="sm" style={{ margin: '10px 0 0', paddingLeft: 18 }}>
            {missing.map((m) => {
              const late = m.due_at && m.due_at < now;
              return <li key={m.id}><b>{m.label}</b> — {m.who === 'cliente' ? 'cliente envia' : 'equipe'} · pedido {ago(m.requested_at)} · prazo {fmtDate(m.due_at)}{late ? <span style={{ color: 'var(--err)' }}> · ATRASADO (risco para o 1º cronograma)</span> : ''}</li>;
            })}
          </ul>
        </div>
      ) : <div className="panel mb-5" style={{ borderColor: 'var(--ok)' }}><span className="sm" style={{ color: 'var(--ok)' }}>✓ Onboarding concluído {ob.completed_at ? `em ${fmtDateTime(ob.completed_at)}` : ''}.</span></div>}
      <div className="bar mb-5"><span style={{ width: `${Math.round((done / ob.items.length) * 100)}%` }} /></div>
      {groups.map(([k, label]) => {
        const items = ob.items.filter((i) => i.kind === k);
        if (!items.length) return null;
        return (
          <section key={k} className="mb-5">
            <div className="section-head"><h3 className="ed-md">{label}</h3><span className="xs faint">{items.filter((i) => i.status !== 'pendente').length}/{items.length}</span></div>
            {items.map((i) => {
              const late = i.status === 'pendente' && i.due_at && i.due_at < now;
              return (
                <div key={i.id} className="ob-item">
                  <span aria-hidden>{i.status === 'recebido' ? '✓' : i.status === 'dispensado' ? '—' : late ? '!' : '○'}</span>
                  <span style={{ minWidth: 0 }}><span className={i.status !== 'pendente' ? 'muted' : ''}>{i.label}</span>{i.value && <div className="xs faint clip">{i.value}</div>}</span>
                  <span className="xs hide-m">{i.who === 'cliente' ? 'Cliente' : 'Equipe'}</span>
                  <span className="xs hide-m" style={late ? { color: 'var(--err)' } : null}>prazo {fmtDate(i.due_at)}</span>
                  <span className="xs hide-m">{i.received_at ? `recebido ${fmtDate(i.received_at)}` : `pedido ${ago(i.requested_at)}`}</span>
                  {data.can_edit ? (
                    <select className="select" style={{ width: 'auto', minHeight: 30, padding: '2px 8px', fontSize: 12 }} value={i.status} onChange={(e) => set(i, e.target.value)} aria-label={`Status de ${i.label}`}>
                      <option value="pendente">Pendente</option><option value="recebido">Recebido</option><option value="dispensado">Dispensado</option>
                    </select>
                  ) : <span className={`tag ${i.status === 'recebido' ? 'tag-ok' : late ? 'tag-err' : ''}`}>{i.status}</span>}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

function ContentsTab({ data }) {
  const months = [...new Set(data.contents.map((c) => c.planned_at?.slice(0, 7) || 'sem data'))].sort().reverse();
  if (!data.contents.length) return <Empty title="Nenhum conteúdo ainda." />;
  return months.map((m) => {
    const list = data.contents.filter((c) => (c.planned_at?.slice(0, 7) || 'sem data') === m);
    return (
      <section key={m} className="mb-5">
        <div className="section-head"><h3 className="ed-md" style={{ textTransform: 'capitalize' }}>{m === 'sem data' ? 'Sem data' : fmtMonth(m)}</h3><span className="xs faint">{list.length} conteúdo(s)</span></div>
        <div className="grid-3">{list.map((c) => <div key={c.id} className="col gap-1"><ContentCard c={c} /><Status s={c.status} /></div>)}</div>
      </section>
    );
  });
}

function TeamTab({ data, reload }) {
  const auth = useAuth();
  const toast = useToast();
  const admin = auth.can('clientes', 'admin');
  const { data: people } = useApi(admin ? '/users/directory' : null, [admin], { live: false });
  const fns = ['estrategia', 'copy', 'design', 'edicao', 'revisao', 'atendimento', 'agendamento'];
  const [members, setMembers] = useState([]);
  useEffect(() => { setMembers(data.team.filter((t) => t.function !== 'cliente').map((t) => ({ user_id: t.id, function: t.function }))); }, [data.team]);
  const [edit, setEdit] = useState(false);
  const save = async () => { try { await api.put(`/clients/${data.client.id}/team`, { members }); toast('Equipe atualizada — tarefas sem responsável foram atribuídas.'); setEdit(false); reload(); } catch (e) { toast(e.message, 'err'); } };
  const clientUsers = data.team.filter((t) => t.function === 'cliente');
  return (
    <div>
      <p className="sm muted" style={{ marginTop: 0 }}>A equipe por função define quem recebe cada tarefa automaticamente. Função sem pessoa = tarefa sem responsável (pendência crítica).</p>
      {fns.map((fn) => {
        const list = data.team.filter((t) => t.function === fn);
        return (
          <div key={fn} className="brain-sec">
            <div className="caps">{FUNCTIONS[fn]}</div>
            {edit ? (
              <div className="row wrap gap-2">
                {(people || []).map((p) => {
                  const on = members.some((m) => m.user_id === p.id && m.function === fn);
                  return <button key={p.id} type="button" className={`tag ${on ? 'tag-bordo' : ''}`} style={{ cursor: 'pointer', background: on ? undefined : 'none' }} aria-pressed={on}
                    onClick={() => setMembers(on ? members.filter((m) => !(m.user_id === p.id && m.function === fn)) : [...members, { user_id: p.id, function: fn }])}>{p.name}</button>;
                })}
              </div>
            ) : list.length ? <div className="row wrap gap-4">{list.map((t) => <span key={t.id} className="row gap-2 sm"><Avatar name={t.name} />{t.name}</span>)}</div>
              : <span className="sm" style={{ color: ['estrategia', 'design', 'edicao'].includes(fn) ? 'var(--err)' : 'var(--faint)' }}>{['estrategia', 'design', 'edicao'].includes(fn) ? 'Ninguém vinculado — tarefas ficarão sem responsável' : 'Usa a regra padrão'}</span>}
          </div>
        );
      })}
      <div className="brain-sec"><div className="caps">Acesso do cliente</div><div className="sm">{clientUsers.length ? clientUsers.map((u) => u.name).join(', ') : 'Nenhum usuário cliente — crie em Usuários.'}</div></div>
      {admin && <div className="row end mt-5">{edit ? <><Button variant="ghost" onClick={() => setEdit(false)}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar equipe</Button></> : <Button onClick={() => setEdit(true)} icon={<I.edit size={14} />}>Editar equipe</Button>}</div>}
    </div>
  );
}

function FinanceTab({ finance }) {
  return (
    <div>
      <div className="section-head"><h3 className="ed-md">Contratos</h3></div>
      {!finance.contracts.length ? <Empty title="Sem contratos." /> : finance.contracts.map((k) => <div key={k.id} className="task-row"><span className="grow">{k.service}</span><span className="num" style={{ fontSize: 22 }}>{money(k.monthly_value)}</span><span className="xs muted">/mês · desde {fmtDate(k.starts_at)} · vence dia {k.due_day}</span><span className="tag">{k.status}</span></div>)}
      <div className="section-head mt-6"><h3 className="ed-md">Parcelas</h3></div>
      <div className="table-wrap"><table className="table"><thead><tr><th>Descrição</th><th>Vencimento</th><th>Valor</th><th>Status</th></tr></thead><tbody>
        {finance.invoices.map((i) => <tr key={i.id}><td>{i.description}</td><td>{fmtDate(i.due_at)}</td><td>{money(i.amount)}</td><td><span className={`tag ${i.status === 'paga' ? 'tag-ok' : i.status === 'atrasada' ? 'tag-err' : ''}`}>{i.status}</span></td></tr>)}
      </tbody></table></div>
    </div>
  );
}
