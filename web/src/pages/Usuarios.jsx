import { useEffect, useMemo, useState } from 'react';
import '../styles/admin.css';
import { LoadError } from './admin/Guard.jsx';
import { api } from '../lib/api.js';
import { useApi, useAuth, useToast } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Avatar, Button, Drawer, Empty, ErrorBox, Field, Loading, Modal, PageHead, Seg, Tabs, Tag } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { ago, cleanName } from '../lib/format.js';
import { FUNCTIONS } from '../lib/status.js';

const ACT = { view: 'Ver', create: 'Criar', edit: 'Editar', approve: 'Aprovar', admin: 'Admin' };
const OP_FUNCS = ['estrategia', 'design', 'edicao', 'copy', 'revisao', 'agendamento', 'atendimento'];

export default function Usuarios() {
  useCrumbs('Usuários');
  const { data, error, loading, reload } = useApi('/users');
  const [clients, setClients] = useState([]);
  const [tab, setTab] = useState('pessoas');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('equipe');
  const [edit, setEdit] = useState(null);
  const [create, setCreate] = useState(false);
  const auth = useAuth();
  useEffect(() => { api.get('/clients').then(setClients).catch(() => {}); }, []);
  if (loading && !data) return <div className="page"><Loading /></div>;
  if (error) return <LoadError error={error} />;
  const admin = auth.can('usuarios', 'admin');
  const roleLabel = (k) => data.roles.find((r) => r.key === k)?.label || k;
  const users = data.users.filter((u) => (kind === 'equipe' ? u.role_key !== 'cliente' : u.role_key === 'cliente') && (!q || `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="page">
      <PageHead kicker="Acesso" title="Usuários e permissões" sub="Permissão = perfil (role) + exceções por pessoa + clientes vinculados + módulo + ação. Tudo é verificado no servidor.">
        {admin && <Button variant="primary" magnetic icon={<I.plus size={15} />} onClick={() => setCreate(true)}>Novo usuário</Button>}
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'pessoas', label: 'Pessoas', count: data.users.length }, { key: 'perfis', label: 'Perfis (roles)' }]} />
      {tab === 'pessoas' ? (
        <>
          <div className="row wrap mb-4 between">
            <Seg value={kind} onChange={setKind} options={[{ value: 'equipe', label: 'Equipe' }, { value: 'clientes', label: 'Clientes' }]} />
            <input className="input" style={{ maxWidth: 280 }} placeholder="Buscar nome ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar usuário" />
          </div>
          {!users.length ? <Empty title="Ninguém encontrado." /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Pessoa</th><th>Perfil</th><th>{kind === 'equipe' ? 'Funções' : 'Projeto'}</th><th>Clientes vinculados</th><th>Exceções</th><th>Último acesso</th><th>Acesso</th></tr></thead>
              <tbody>{users.map((u) => (
                <tr key={u.id} className={`link ${u.active ? '' : 'user-off'}`} onClick={() => admin && setEdit(u)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && admin && setEdit(u)}>
                  <td><div className="row"><Avatar name={u.name} tone={u.role_key === 'cliente' ? 'ink' : ''} /><div><div className="strong sm">{u.name}</div><div className="xs muted">{u.email}</div></div></div></td>
                  <td className="sm">{roleLabel(u.role_key)}</td>
                  <td className="xs">{kind === 'equipe' ? (u.functions.map((f) => FUNCTIONS[f] || f).join(', ') || '—') : cleanName(u.clients[0]?.name || '—')}</td>
                  <td className="xs">{data.roles.find((r) => r.key === u.role_key)?.all_clients ? <Tag tone="bordo">Todos</Tag> : [...new Set(u.clients.map((c) => cleanName(c.name)))].join(', ') || <span style={{ color: 'var(--err)' }}>nenhum</span>}</td>
                  <td className="xs">{u.overrides.length ? <Tag tone="warn">{u.overrides.length}</Tag> : '—'}</td>
                  <td className="xs muted">{u.last_login_at ? ago(u.last_login_at) : 'nunca'}</td>
                  <td>{u.active ? <Tag tone="ok">Ativo</Tag> : <Tag>Desativado</Tag>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
          <p className="xs faint mt-5">O Centro de Pendências global é fixo para CEO e Operações (Rebeca e Vitória), por regra de negócio. O quadro de Processos é visível a toda a equipe interna; dados detalhados seguem os vínculos com clientes.</p>
        </>
      ) : <Roles data={data} admin={admin} reload={reload} />}
      {edit && <EditUser user={edit} data={data} clients={clients} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {create && <CreateUser roles={data.roles} clients={clients} onClose={() => setCreate(false)} onSaved={() => { setCreate(false); reload(); }} />}
    </div>
  );
}

function LinksEditor({ links, setLinks, clients, isClient }) {
  return (
    <div>
      {links.map((l, i) => (
        <div className="link-row" key={i}>
          <select className="select" value={l.client_id} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, client_id: e.target.value } : x)))} aria-label="Cliente"><option value="">Cliente…</option>{clients.map((c) => <option key={c.id} value={c.id}>{cleanName(c.name)}</option>)}</select>
          {isClient ? <span className="xs muted">acesso do cliente</span> : <select className="select" value={l.function} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, function: e.target.value } : x)))} aria-label="Função">{OP_FUNCS.map((f) => <option key={f} value={f}>{FUNCTIONS[f]}</option>)}</select>}
          <Button size="sm" variant="ghost" icon={<I.x size={14} />} aria-label="Remover vínculo" onClick={() => setLinks(links.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button size="sm" icon={<I.plus size={14} />} onClick={() => setLinks([...links, { client_id: '', function: isClient ? 'cliente' : 'estrategia' }])}>Vincular cliente</Button>
    </div>
  );
}

function CreateUser({ roles, clients, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', email: '', password: '', role_key: 'design', title: '', functions: [], capacity: 12 });
  const [links, setLinks] = useState([]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    try { await api.post('/users', { ...f, capacity: Number(f.capacity), clients: links.filter((l) => l.client_id) }); toast('Usuário criado. Envie a senha temporária por um canal seguro.'); onSaved(); } catch (e) { toast(e.message, 'err'); }
  };
  const isClient = f.role_key === 'cliente';
  return (
    <Modal open wide title="Novo usuário" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit}>Criar usuário</Button></>}>
      <div className="grid-2">
        <Field label="Nome"><input className="input" value={f.name} onChange={set('name')} autoFocus /></Field>
        <Field label="E-mail"><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Senha temporária" hint="Mínimo 10 caracteres"><input className="input" type="text" value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
        <Field label="Perfil"><select className="select" value={f.role_key} onChange={set('role_key')}>{roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select></Field>
        {!isClient && <Field label="Cargo / título"><input className="input" value={f.title} onChange={set('title')} /></Field>}
        {!isClient && <Field label="Capacidade (tarefas/semana)"><input className="input" type="number" value={f.capacity} onChange={set('capacity')} /></Field>}
      </div>
      {!isClient && <FuncPicker value={f.functions} onChange={(v) => setF({ ...f, functions: v })} />}
      <div className="mt-5"><div className="label mb-2">{isClient ? 'Projeto do cliente' : 'Clientes vinculados (define o acesso e a atribuição automática por função)'}</div><LinksEditor links={links} setLinks={setLinks} clients={clients} isClient={isClient} /></div>
    </Modal>
  );
}
function FuncPicker({ value, onChange }) {
  return <div className="mt-4"><div className="label mb-2">Funções operacionais</div><div className="row wrap">{OP_FUNCS.map((fn) => <label key={fn} className="check"><input type="checkbox" checked={value.includes(fn)} onChange={(e) => onChange(e.target.checked ? [...value, fn] : value.filter((x) => x !== fn))} /> {FUNCTIONS[fn]}</label>)}</div></div>;
}

function EditUser({ user, data, clients, onClose, onSaved }) {
  const toast = useToast();
  const auth = useAuth();
  const [f, setF] = useState({ name: user.name, role_key: user.role_key, title: user.title || '', functions: user.functions, capacity: user.capacity, active: user.active, password: '' });
  const [links, setLinks] = useState(user.clients.map((c) => ({ client_id: c.client_id, function: c.function })));
  const [ov, setOv] = useState(() => Object.fromEntries(user.overrides.map((o) => [`${o.module}:${o.action}`, o.effect])));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const rolePerms = useMemo(() => new Set(data.role_permissions.filter((p) => p.role_key === f.role_key).map((p) => `${p.module}:${p.action}`)), [data.role_permissions, f.role_key]);
  const isClient = f.role_key === 'cliente';
  const save = async () => {
    setBusy(true);
    try {
      const body = { name: f.name, role_key: f.role_key, title: f.title, functions: f.functions, capacity: Number(f.capacity), active: f.active };
      if (f.password) body.password = f.password;
      await api.patch(`/users/${user.id}`, body);
      await api.put(`/users/${user.id}/clients`, { links: links.filter((l) => l.client_id) });
      await api.put(`/users/${user.id}/permissions`, { overrides: Object.entries(ov).filter(([, e]) => e).map(([k, effect]) => { const [module, action] = k.split(':'); return { module, action, effect }; }) });
      toast('Usuário atualizado'); onSaved();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const cycle = (k) => setOv({ ...ov, [k]: ov[k] === undefined ? 'grant' : ov[k] === 'grant' ? 'deny' : undefined });
  return (
    <Drawer open wide title={user.name} kicker={user.email} onClose={onClose}>
      <div className="grid-2">
        <Field label="Nome"><input className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="Perfil"><select className="select" value={f.role_key} onChange={set('role_key')}>{data.roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select></Field>
        {!isClient && <Field label="Cargo / título"><input className="input" value={f.title} onChange={set('title')} /></Field>}
        {!isClient && <Field label="Capacidade (tarefas/semana)"><input className="input" type="number" value={f.capacity} onChange={set('capacity')} /></Field>}
        <Field label="Redefinir senha" hint="Deixe vazio para manter. Encerra as sessões ativas."><input className="input" type="text" value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
        <Field label="Acesso"><label className="check" style={{ minHeight: 42 }}><button type="button" className={`switch ${f.active ? 'on' : ''}`} role="switch" aria-checked={f.active} disabled={user.id === auth.user.id} onClick={() => setF({ ...f, active: !f.active })} aria-label="Acesso ativo" /> {f.active ? 'Ativo' : 'Desativado (sessões encerradas)'}</label></Field>
      </div>
      {!isClient && <FuncPicker value={f.functions} onChange={(v) => setF({ ...f, functions: v })} />}
      <div className="mt-5"><div className="label mb-2">{isClient ? 'Projeto do cliente' : 'Clientes vinculados'}</div>
        {data.roles.find((r) => r.key === f.role_key)?.all_clients ? <p className="xs muted">Este perfil acessa todos os clientes. Vínculos ainda definem atribuição automática por função.</p> : null}
        <LinksEditor links={links} setLinks={setLinks} clients={clients} isClient={isClient} />
      </div>
      <div className="mt-6">
        <div className="label mb-2">Exceções de permissão (sobre o perfil)</div>
        <p className="xs muted mb-4">Clique para alternar: herdado do perfil → <b style={{ color: 'var(--ok)' }}>+</b> conceder → <b style={{ color: 'var(--err)' }}>−</b> negar.</p>
        <div className="table-wrap"><table className="perm-matrix">
          <thead><tr><th>Módulo</th>{data.actions.map((a) => <th key={a}>{ACT[a]}</th>)}</tr></thead>
          <tbody>{Object.entries(data.modules).filter(([m]) => (isClient ? m === 'portal' : m !== 'portal')).map(([m, label]) => (
            <tr key={m}><td>{label}</td>{data.actions.map((a) => { const k = `${m}:${a}`; const e = ov[k]; const inh = rolePerms.has(k); return (
              <td key={a}><button type="button" className={`tri ${e || (inh ? 'inherit-on' : 'inherit-off')}`} onClick={() => cycle(k)} aria-label={`${label} ${ACT[a]}: ${e || (inh ? 'herdado: sim' : 'herdado: não')}`}>{e === 'grant' ? '+' : e === 'deny' ? '−' : inh ? '●' : '·'}</button></td>
            ); })}</tr>
          ))}</tbody>
        </table></div>
      </div>
      <div className="row end mt-6"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="ink" disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar'}</Button></div>
    </Drawer>
  );
}

function Roles({ data, admin, reload }) {
  const toast = useToast();
  const [role, setRole] = useState(data.roles[0]?.key);
  const [set_, setSet] = useState(new Set());
  useEffect(() => { setSet(new Set(data.role_permissions.filter((p) => p.role_key === role).map((p) => `${p.module}:${p.action}`))); }, [role, data.role_permissions]);
  const r = data.roles.find((x) => x.key === role);
  const toggle = (k) => { const n = new Set(set_); n.has(k) ? n.delete(k) : n.add(k); setSet(n); };
  const save = async () => {
    try { await api.put(`/roles/${role}/permissions`, { permissions: [...set_].map((k) => { const [module, action] = k.split(':'); return { module, action }; }) }); toast(`Perfil ${r.label} atualizado`); reload(); } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <div className="grid-2" style={{ gridTemplateColumns: '260px minmax(0,1fr)' }}>
      <ul className="list">{data.roles.map((x) => (
        <li key={x.key}><button className={`ch-link ${x.key === role ? 'active' : ''}`} onClick={() => setRole(x.key)}><span className="clip">{x.label}</span><span className="xs" style={{ marginLeft: 'auto', opacity: .7 }}>{x.all_clients ? 'todos' : x.internal ? 'vinculados' : 'portal'}</span></button></li>
      ))}</ul>
      <div>
        <div className="row between mb-4 wrap"><div><h2 className="ed-md">{r?.label}</h2><div className="xs muted">Dashboard: {r?.dashboard} · Clientes: {r?.all_clients ? 'todos' : r?.internal ? 'somente vinculados' : 'somente o próprio projeto'}</div></div>{admin && <Button variant="ink" size="sm" onClick={save}>Salvar perfil</Button>}</div>
        <div className="table-wrap"><table className="perm-matrix">
          <thead><tr><th>Módulo</th>{data.actions.map((a) => <th key={a}>{ACT[a]}</th>)}</tr></thead>
          <tbody>{Object.entries(data.modules).map(([m, label]) => (
            <tr key={m}><td>{label}{m === 'pendencias' && <span className="xs faint"> · só CEO/Operações</span>}</td>{data.actions.map((a) => { const k = `${m}:${a}`; return <td key={a}><input type="checkbox" className="check" style={{ accentColor: 'var(--bordo)' }} checked={set_.has(k)} disabled={!admin} onChange={() => toggle(k)} aria-label={`${label} ${ACT[a]}`} /></td>; })}</tr>
          ))}</tbody>
        </table></div>
      </div>
    </div>
  );
}
