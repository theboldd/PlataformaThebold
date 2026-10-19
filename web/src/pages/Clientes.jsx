import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi, useAuth, useToast } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Button, Empty, ErrorBox, Field, Loading, Modal, PageHead, Risk, Stat } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { cleanName } from '../lib/format.js';
import { FUNCTIONS } from '../lib/status.js';
import '../styles/production.css';

const STATUS = { onboarding: 'Onboarding', ativo: 'Ativo', pausado: 'Pausado', encerrado: 'Encerrado' };

export default function Clientes() {
  useCrumbs('Clientes');
  const auth = useAuth();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const { data, error, loading, reload } = useApi('/clients');
  const list = (data || []).filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || (c.segment || '').toLowerCase().includes(q.toLowerCase()));
  const risk = (data || []).filter((c) => ['alto', 'critico'].includes(c.risk.level)).length;
  const onb = (data || []).filter((c) => c.status === 'onboarding').length;
  const waiting = (data || []).reduce((s, c) => s + (c.counts.aguardando_cliente || 0), 0);
  return (
    <div className="page">
      <PageHead kicker={auth.role.all_clients ? 'Todos os clientes' : 'Seus clientes vinculados'} title="Clientes">
        {auth.can('clientes', 'admin') && <Button variant="primary" magnetic icon={<I.plus size={14} />} onClick={() => setOpen(true)} data-cursor="CRIAR">Novo cliente</Button>}
      </PageHead>
      {data && (
        <div className="stats mb-5">
          <Stat value={data.length} label="Clientes" />
          <Stat value={risk} label="Em risco" alert={risk > 0} />
          <Stat value={onb} label="Em onboarding" />
          <Stat value={waiting} label="Conteúdos aguardando clientes" />
        </div>
      )}
      <div className="filters"><input className="input" style={{ minWidth: 280 }} placeholder="Buscar por nome ou segmento…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar cliente" /></div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading rows={6} /> : !list.length ? <Empty title="Nenhum cliente encontrado." /> : (
        <div>
          <div className="cl-row hide-m" style={{ padding: '6px 0', borderBottom: '1px solid var(--ink)', background: 'none' }}>
            <span /><span className="caps">Cliente</span><span className="caps hide-m">Próxima ação</span><span className="caps hide-m">Estrategista</span><span className="caps">Risco</span><span />
          </div>
          {list.map((c) => (
            <Link key={c.id} to={`/clientes/${c.id}`} className="cl-row" data-cursor="ABRIR">
              <span className="cl-mono" aria-hidden>{cleanName(c.name).replace(/^Dra?\.\s*/, '')[0]}</span>
              <span style={{ minWidth: 0 }}>
                <span className="name" style={{ display: 'block' }}>{cleanName(c.name)}</span>
                <span className="xs muted">{c.segment || '—'} · <span className={c.status === 'onboarding' ? 'bordo strong' : ''}>{STATUS[c.status]}</span> · {c.counts.total || 0} conteúdos · {c.counts.aguardando_cliente || 0} aguardando aprovação</span>
              </span>
              <span className="sm hide-m" style={{ minWidth: 0 }}>
                {c.next ? <><span className="clip" style={{ display: 'block' }}>{c.next.content}</span><span className="xs muted">{c.next.stage} · {c.next.who || '—'}</span></> : <span className="faint">Sem conteúdos em andamento</span>}
              </span>
              <span className="sm hide-m">{c.strategist || <span style={{ color: 'var(--err)' }}>não definido</span>}</span>
              <span title={c.risk.reasons.join('\n') || 'Sem riscos identificados'}>{['baixo', 'nenhum'].includes(c.risk.level) ? <span className="xs faint">em dia</span> : <Risk level={c.risk.level} />}{c.risk.reasons[0] && !['baixo'].includes(c.risk.level) && <span className="xs muted clip" style={{ display: 'block', maxWidth: 160 }}>{c.risk.reasons[0]}</span>}</span>
              <I.right className="hide-m" />
            </Link>
          ))}
        </div>
      )}
      <NewClient open={open} onClose={() => setOpen(false)} onCreated={reload} />
    </div>
  );
}

function NewClient({ open, onClose, onCreated }) {
  const toast = useToast();
  const { data: people } = useApi(open ? '/users/directory' : null, [open], { live: false });
  const [f, setF] = useState({ name: '', handle: '', segment: '', monthly_posts: 12, requires_theme_approval: true, services: 'Estratégia editorial, Design, Reels, Legendas, Agendamento' });
  const [team, setTeam] = useState({});
  const [busy, setBusy] = useState(false);
  const fns = ['estrategia', 'copy', 'design', 'edicao', 'revisao', 'atendimento', 'agendamento'];
  const submit = async () => {
    setBusy(true);
    try {
      const c = await api.post('/clients', { ...f, services: f.services.split(',').map((s) => s.trim()).filter(Boolean), team: Object.entries(team).filter(([, u]) => u).map(([fn, user_id]) => ({ function: fn, user_id })) });
      toast(`${c.name} criado — onboarding iniciado automaticamente.`);
      onClose(); onCreated();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Novo cliente" wide footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" magnetic disabled={busy || !f.name.trim()} onClick={submit}>Criar e iniciar onboarding</Button></>}>
      <p className="sm muted" style={{ marginTop: 0 }}>Ao criar, o sistema gera projeto, ficha (Client Brain), checklist de onboarding (formulário, materiais, acessos, itens internos), canal de conversa e as primeiras tarefas com responsáveis e prazos.</p>
      <div className="col gap-4">
        <div className="grid-2"><Field label="Nome"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field><Field label="@ Instagram"><input className="input" value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value })} /></Field></div>
        <div className="grid-2"><Field label="Segmento"><input className="input" value={f.segment} onChange={(e) => setF({ ...f, segment: e.target.value })} /></Field><Field label="Posts por mês"><input className="input" type="number" min={1} value={f.monthly_posts} onChange={(e) => setF({ ...f, monthly_posts: Number(e.target.value) })} /></Field></div>
        <Field label="Serviços (separados por vírgula)"><input className="input" value={f.services} onChange={(e) => setF({ ...f, services: e.target.value })} /></Field>
        <label className="check"><input type="checkbox" checked={f.requires_theme_approval} onChange={(e) => setF({ ...f, requires_theme_approval: e.target.checked })} /> Cliente aprova os temas do cronograma antes da produção</label>
        <div className="caps mt-2">Equipe por função</div>
        <div className="grid-3">{fns.map((fn) => (
          <Field key={fn} label={FUNCTIONS[fn]}><select className="select" value={team[fn] || ''} onChange={(e) => setTeam({ ...team, [fn]: e.target.value })}><option value="">—</option>{(people || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        ))}</div>
      </div>
    </Modal>
  );
}
