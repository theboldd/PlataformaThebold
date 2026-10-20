import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi, useAuth, useToast } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Button, Empty, ErrorBox, Field, Loading, Modal, PageHead } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { cleanName } from '../lib/format.js';
import { FUNCTIONS } from '../lib/status.js';
import '../styles/production.css';
import { ClientTile } from './production/ClientTile.jsx';
import { useUrlState } from '../lib/nav.jsx';

const STATUS = { onboarding: 'Onboarding', ativo: 'Ativo', pausado: 'Pausado', encerrado: 'Encerrado', a_confirmar: 'A confirmar' };

export default function Clientes() {
  useCrumbs('Clientes');
  const auth = useAuth();
  const [q, setQ] = useUrlState('q', '');
  const [open, setOpen] = useState(false);
  const { data, error, loading, reload } = useApi('/clients');
  const ql = q.toLowerCase().replace(/^@/, '');
  const list = (data || []).filter((c) => !ql || c.name.toLowerCase().includes(ql) || (c.segment || '').toLowerCase().includes(ql) || (c.handle || '').toLowerCase().includes(ql));
  const [sort, setSort] = useUrlState('ordem', 'nome');
  const SORTS = {
    nome: (a, b) => cleanName(a.name).localeCompare(cleanName(b.name)),
    aprovacao: (a, b) => (b.counts.aprovacao || 0) - (a.counts.aprovacao || 0),
    ajuste: (a, b) => (b.counts.ajuste || 0) - (a.counts.ajuste || 0),
    risco: (a, b) => ['critico', 'alto', 'medio', 'baixo', 'nenhum'].indexOf(a.risk.level) - ['critico', 'alto', 'medio', 'baixo', 'nenhum'].indexOf(b.risk.level),
  };
  const sorted = list.slice().sort(SORTS[sort]);
  return (
    <div className="page">
      <PageHead kicker={auth.role.all_clients ? 'Todos os clientes' : 'Seus clientes vinculados'} title="Clientes" sub="Gerencie seus clientes e conteúdos.">
        {auth.can('carteira', 'create') && <Button variant="ink" size="lg" magnetic icon={<I.plus size={16} />} onClick={() => setOpen(true)} data-cursor="CRIAR">Novo cliente</Button>}
      </PageHead>
      <div className="ct-toolbar">
        <label className="ct-search"><I.search size={16} /><input placeholder="Buscar por nome, @usuário ou segmento…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar cliente" /></label>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar">
          <option value="nome">Nome (A–Z)</option><option value="aprovacao">Mais aguardando aprovação</option><option value="ajuste">Mais ajustes</option><option value="risco">Maior risco</option>
        </select>
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading rows={6} /> : !sorted.length ? <Empty title="Nenhum cliente encontrado." /> : (
        <div className="ct-grid">
          {sorted.map((c) => (
            <ClientTile key={c.id} to={`/clientes/${c.id}`} name={c.name} segment={c.segment} status={{ key: c.status, label: STATUS[c.status] }}
              chips={[
                { label: 'Rascunho', n: c.counts.rascunho, tone: 'neutral' },
                { label: 'Ajuste', n: c.counts.ajuste, tone: 'adjust' },
                { label: 'Aprovação', n: c.counts.aguardando_cliente, tone: 'wait' },
                { label: 'Aprovados', n: c.counts.aprovados, tone: 'ok' },
              ]}
              footer={['alto', 'critico'].includes(c.risk.level) ? <span className="alert">● Risco {c.risk.level === 'critico' ? 'crítico' : 'alto'}: {c.risk.reasons[0]}</span>
                : c.next ? <>Próxima ação: {c.next.content} · {c.next.stage}</> : 'Sem conteúdos em andamento'} />
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
