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
import { useUrlState } from '../lib/nav.jsx';

const ACT = { view: 'Ver', create: 'Criar', edit: 'Editar', approve: 'Aprovar', admin: 'Admin' };
const OP_FUNCS = ['estrategia', 'design', 'edicao', 'copy', 'revisao', 'agendamento', 'atendimento'];

export default function Usuarios() {
  useCrumbs('Usuários');
  const { data, error, loading, reload } = useApi('/users');
  const [clients, setClients] = useState([]);
  const [tab, setTab] = useUrlState('aba', 'pessoas');
  const [q, setQ] = useUrlState('q', '');
  const [kind, setKind] = useUrlState('tipo', 'equipe');
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
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'pessoas', label: 'Pessoas', count: data.users.length }, { key: 'acessos', label: 'Acessos dos clientes' }, { key: 'perfis', label: 'Perfis (roles)' }]} />
      {tab === 'acessos' ? <ClientAccess admin={admin} /> : tab === 'pessoas' ? (
        <>
          <div className="row wrap mb-4 between">
            <Seg value={kind} onChange={setKind} options={[{ value: 'equipe', label: 'Equipe' }, { value: 'clientes', label: 'Clientes' }]} />
            <input className="input" style={{ maxWidth: 280 }} placeholder="Buscar nome ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar usuário" />
          </div>
          {!users.length ? <Empty title="Ninguém encontrado." /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Pessoa</th><th>Perfil</th><th>{kind === 'equipe' ? 'Funções' : 'Projeto'}</th><th>Clientes vinculados</th><th>Exceções</th><th>Último acesso</th><th>Acesso</th>{admin && <th />}</tr></thead>
              <tbody>{users.map((u) => (
                <tr key={u.id} className={`link ${u.active ? '' : 'user-off'}`} onClick={() => admin && setEdit(u)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && admin && setEdit(u)}>
                  <td><div className="row"><Avatar name={u.name} tone={u.role_key === 'cliente' ? 'ink' : ''} /><div><div className="strong sm">{u.name}</div><div className="xs muted">{u.email}</div></div></div></td>
                  <td className="sm">{roleLabel(u.role_key)}</td>
                  <td className="xs">{kind === 'equipe' ? (u.functions.map((f) => FUNCTIONS[f] || f).join(', ') || '—') : cleanName(u.clients[0]?.name || '—')}</td>
                  <td className="xs">{data.roles.find((r) => r.key === u.role_key)?.all_clients ? <Tag tone="bordo">Todos</Tag> : [...new Set(u.clients.map((c) => cleanName(c.name)))].join(', ') || <span style={{ color: 'var(--err)' }}>nenhum</span>}</td>
                  <td className="xs">{u.overrides.length ? <Tag tone="warn">{u.overrides.length}</Tag> : '—'}</td>
                  <td className="xs muted">{u.last_login_at ? ago(u.last_login_at) : 'nunca'}</td>
                  <td>{u.active ? <Tag tone="ok">Ativo</Tag> : <Tag>Desativado</Tag>}{u.must_change_password && <div className="xs muted mt-1">senha inicial</div>}</td>
                  {admin && <td onClick={(e) => e.stopPropagation()}>{u.active && <AccessMessageButton userId={u.id} name={u.name} />}</td>}
                </tr>
              ))}</tbody>
            </table></div>
          )}
          <p className="xs faint mt-5">O Centro de Pendências global vem liberado só para CEO e Operações (Rebeca e Vitória). Para dar acesso a outra pessoa, edite o usuário → permissões específicas → Pendências: permitir. O quadro de Processos é visível a toda a equipe interna; dados detalhados seguem os vínculos com clientes.</p>
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
      <PasswordBox user={user} />
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

// Senha: o que aconteceu (quando a pessoa redefiniu, quando a equipe definiu uma provisória) e o link de redefinição.
// A senha escolhida pela pessoa nunca aparece para ninguém — só o hash fica guardado.
function PasswordBox({ user }) {
  const toast = useToast();
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const fmt = (v) => new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const gen = async () => {
    setBusy(true);
    try { const r = await api.post(`/users/${user.id}/reset-link`); setRes(r); toast(r.sent ? `Link enviado para ${user.email}.` : 'Link gerado — e-mail não enviado (veja abaixo).'); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="mt-5 pw-box">
      <div className="row between wrap gap-2"><div className="label">Senha</div><Button size="sm" disabled={busy} onClick={gen}>Enviar link para redefinir senha</Button></div>
      {user.password_events?.length ? (
        <ul className="pw-events">{user.password_events.map((e, i) => <li key={i}><span className="xs faint">{fmt(e.created_at)}</span> <span className="sm">{e.summary}</span></li>)}</ul>
      ) : <p className="xs muted">Nenhuma troca de senha registrada.</p>}
      {res && (
        <div className="pw-link">
          <div className="xs">{res.sent ? `E-mail enviado para ${user.email}. ` : `E-mail não enviado: ${res.reason} `}Se preferir, mande este link pelo WhatsApp (vale 1 hora, uma vez):</div>
          <div className="row gap-2 mt-2"><input className="input" readOnly value={res.link} onFocus={(e) => e.target.select()} /><Button size="sm" onClick={() => { navigator.clipboard?.writeText(res.link); toast('Link copiado.'); }}>Copiar</Button></div>
        </div>
      )}
      <p className="xs muted" style={{ marginBottom: 0 }}>A senha que a pessoa escolhe não aparece para ninguém, por segurança. Para entrar no lugar dela ou destravar o acesso, defina uma senha provisória acima.</p>
    </div>
  );
}

// ACESSOS DOS CLIENTES — e-mail só de fonte real, com origem; sem e-mail = nada é criado (regras oficiais 4 e 7)
const ACCESS_TONE = { ativo: 'ok', convite: 'warn', sem_email: '', bloqueado: 'err' };
function ClientAccess({ admin }) {
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/client-access', [], { live: false });
  const [adding, setAdding] = useState(null);
  const [email, setEmail] = useState('');
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(false);
  if (error) return <ErrorBox error={error} />;
  if (loading || !data) return <Loading rows={6} />;
  const counts = data.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {});
  const fmt = (v) => (v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
  const act = async (fn, ok) => { setBusy(true); try { const r = await fn(); if (ok) toast(ok); reload(); return r; } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); } };
  const sendInvite = async (r) => {
    const res = await act(() => api.post(`/users/${r.user_id}/reset-link`));
    if (res) setInvite({ ...res, client: r.client, email: r.email });
  };
  return (
    <div className="ca">
      <div className="ca-sum">
        <span className="ca-n s-ativo"><b>{counts.ativo || 0}</b> acesso ativo</span>
        <span className="ca-n s-convite"><b>{counts.convite || 0}</b> convite pendente</span>
        <span className="ca-n s-sem_email"><b>{counts.sem_email || 0}</b> sem e-mail</span>
        <span className="ca-n s-bloqueado"><b>{counts.bloqueado || 0}</b> bloqueado</span>
      </div>
      {admin && <NameLogins onDone={reload} missing={data.filter((r) => r.status === 'sem_email').length} />}
      <p className="xs muted">O e-mail de acesso vem só de dados reais (Notion e plataforma), com a origem registrada. Cliente sem e-mail continua com ficha, onboarding e Brain migrados — só o acesso fica pendente.</p>
      <div className="table-wrap"><table className="table ca-table">
        <thead><tr><th>Cliente</th><th>E-mail</th><th>Usuário</th><th>Status do acesso</th><th>Origem do e-mail</th><th>Último acesso</th><th>Permissão</th>{admin && <th />}</tr></thead>
        <tbody>{data.map((r) => (
          <tr key={r.client_id}>
            <td className="sm strong">{cleanName(r.client)}</td>
            <td className="sm">{r.email || <span className="muted">—</span>}
              {r.candidates.map((c) => (
                <div key={c.id} className="ca-cand">
                  <span className="xs"><span className="tag tag-warn">E-mail candidato · aguardando confirmação</span> <b>{c.email}</b> · {c.source}{c.source_url && <> · <a href={c.source_url} target="_blank" rel="noreferrer">ver no Notion ↗</a></>}</span>
                  {admin && <span className="row gap-2 mt-2"><Button size="sm" disabled={busy} onClick={() => window.confirm(`Confirmar ${c.email} como e-mail OFICIAL de acesso de ${cleanName(r.client)}? O acesso fica preparado; nenhum convite é enviado automaticamente.`) && act(() => api.post(`/client-access/${r.client_id}/candidates/${c.id}`, {}), 'Acesso preparado (convite pendente, nada foi enviado).')}>Confirmar como acesso oficial</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => api.post(`/client-access/${r.client_id}/candidates/${c.id}`, { decision: 'descartar' }), 'Sugestão descartada.')}>Descartar</Button></span>}
                </div>
              ))}
            </td>
            <td className="sm">{r.user || '—'}</td>
            <td><span className={`tag ${ACCESS_TONE[r.status] ? `tag-${ACCESS_TONE[r.status]}` : ''}`}>{r.status_label}</span></td>
            <td className="xs">{r.email_source ? <>{r.email_source}{r.email_source_url && <> · <a href={r.email_source_url} target="_blank" rel="noreferrer">origem ↗</a></>}</> : <span className="muted">—</span>}</td>
            <td className="xs">{fmt(r.last_login_at)}</td>
            <td className="xs muted">{r.permission || '—'}</td>
            {admin && <td className="ca-actions">
              {r.status === 'sem_email' && <Button size="sm" variant="ghost" onClick={() => { setAdding(r); setEmail(''); }}>Informar e-mail</Button>}
              {(r.status === 'convite' || r.status === 'ativo') && <Button size="sm" variant="ghost" disabled={busy} onClick={() => sendInvite(r)}>{r.status === 'convite' ? 'Enviar convite' : 'Link de nova senha'}</Button>}
              {r.user_id && r.status !== 'bloqueado' && <AccessMessageButton userId={r.user_id} name={r.user} />}
              {r.user_id && <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => api.patch(`/users/${r.user_id}`, { active: r.status === 'bloqueado' }), r.status === 'bloqueado' ? 'Acesso desbloqueado.' : 'Acesso bloqueado.')}>{r.status === 'bloqueado' ? 'Desbloquear' : 'Bloquear'}</Button>}
            </td>}
          </tr>
        ))}</tbody>
      </table></div>
      <Modal open={!!adding} onClose={() => setAdding(null)} title={`E-mail de acesso — ${adding ? cleanName(adding.client) : ''}`}
        footer={<><Button variant="ghost" onClick={() => setAdding(null)}>Cancelar</Button><Button variant="primary" disabled={busy || !email.trim()} onClick={async () => { const ok = await act(() => api.post(`/client-access/${adding.client_id}/email`, { email }), 'Acesso preparado (convite pendente).'); if (ok) setAdding(null); }}>Preparar acesso</Button></>}>
        <Field label="E-mail do cliente" hint="Use um e-mail real informado pelo cliente. A origem fica registrada como “informado pela equipe”."><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      </Modal>
      <Modal open={!!invite} onClose={() => setInvite(null)} title="Convite de acesso" footer={<Button variant="primary" onClick={() => setInvite(null)}>Fechar</Button>}>
        {invite && <div className="col gap-4">
          <p className="sm" style={{ margin: 0 }}>{invite.sent ? `E-mail enviado para ${invite.email}.` : `E-mail não enviado (${invite.reason}).`} Você também pode mandar este link pelo WhatsApp — o cliente cria a senha dele (vale 1 hora, uma vez):</p>
          <div className="row gap-2"><input className="input" readOnly value={invite.link} onFocus={(e) => e.target.select()} /><Button size="sm" onClick={() => { navigator.clipboard?.writeText(invite.link); toast('Link copiado.'); }}>Copiar</Button></div>
        </div>}
      </Modal>
    </div>
  );
}

// Mensagem pronta para mandar o acesso (WhatsApp ou e-mail): link, login e senha inicial ou link para criar a senha
function AccessMessageButton({ userId, name }) {
  const toast = useToast();
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const open = async () => { setBusy(true); try { setMsg(await api.get(`/users/${userId}/mensagem-acesso`)); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); } };
  return (
    <>
      <Button size="sm" variant="ghost" disabled={busy} onClick={open}>Mensagem de acesso</Button>
      <Modal open={!!msg} onClose={() => setMsg(null)} title={`Mensagem de acesso — ${name || ''}`}
        footer={<><Button variant="ghost" onClick={() => setMsg(null)}>Fechar</Button><a className="btn" href={`https://wa.me/?text=${encodeURIComponent(msg?.text || '')}`} target="_blank" rel="noreferrer">Abrir no WhatsApp</a><Button variant="primary" onClick={() => { navigator.clipboard?.writeText(msg.text); toast('Mensagem copiada.'); }}>Copiar mensagem</Button></>}>
        {msg && <div className="col gap-3">
          <textarea className="textarea" rows={12} value={msg.text} readOnly onFocus={(e) => e.target.select()} />
          <p className="xs muted" style={{ margin: 0 }}>{msg.has_initial ? 'Inclui a senha inicial: no primeiro acesso a pessoa cria uma senha só dela, e a inicial deixa de valer.' : 'A pessoa já tem senha própria (ou não tem senha inicial): a mensagem leva um link para criar a senha, que vale 1 hora.'}</p>
        </div>}
      </Modal>
    </>
  );
}

// Criar de uma vez o acesso pelo nome para os clientes sem acesso (senha inicial igual; troca obrigatória no 1º acesso)
function NameLogins({ onDone, missing }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('thebold');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { const r = await api.post('/client-access/login-por-nome', { password: pw }); setRes(r); toast(`${r.created.length} acesso(s) criado(s).`); onDone(); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); } };
  return (
    <>
      <div className="row wrap gap-2" style={{ alignItems: 'center' }}><Button variant="primary" size="sm" onClick={() => { setRes(null); setOpen(true); }}>Criar acessos pelo nome{missing ? ` (${missing})` : ''}</Button><span className="xs muted">Login = nome do cliente · senha inicial igual para todos · cada um cria a própria senha no primeiro acesso.</span></div>
      <Modal open={open} onClose={() => setOpen(false)} title="Acessos pelo nome" footer={res ? <Button variant="primary" onClick={() => setOpen(false)}>Fechar</Button> : <><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" disabled={busy || pw.length < 6} onClick={go}>Criar acessos</Button></>}>
        {!res ? <div className="col gap-3">
          <p className="sm" style={{ margin: 0 }}>Cria o acesso de cada cliente que ainda não tem. O login é o nome (ex.: <b>alanna.santoro</b>; maiúsculas, acentos e espaços não importam). Quem já tem acesso mantém a senha.</p>
          <Field label="Senha inicial" hint="Vale só para o primeiro acesso: a plataforma pede uma senha nova (mínimo 10 caracteres) antes de mostrar qualquer coisa."><input className="input" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        </div> : <div className="col gap-2">
          <p className="sm" style={{ margin: 0 }}>{res.created.length} criado(s){res.updated.length ? ` · ${res.updated.length} já tinham acesso (ganharam o login pelo nome, senha mantida)` : ''}. Use “Mensagem de acesso” em cada linha para enviar.</p>
          <ul className="xs" style={{ margin: 0, paddingLeft: 18, maxHeight: 260, overflow: 'auto' }}>{[...res.created, ...res.updated].map((x) => <li key={x.user_id}>{cleanName(x.client)} → <b>{x.login}</b>{x.note ? ` (${x.note})` : ''}</li>)}</ul>
        </div>}
      </Modal>
    </>
  );
}
