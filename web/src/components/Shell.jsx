import { createContext, useContext, useEffect, useState } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { I } from './Icons.jsx';
import { Avatar, Button, Drawer, Empty } from './ui.jsx';
import { useAuth, useLiveStream } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { ago } from '../lib/format.js';
import { LEVEL } from '../lib/status.js';
import { NavHistory, BackLink, useNavLabel } from '../lib/nav.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';

const CrumbCtx = createContext(() => {});
export function useCrumbs(...parts) {
  const set = useContext(CrumbCtx);
  const key = parts.join('/');
  useEffect(() => { set(parts.filter(Boolean)); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // o último nível do breadcrumb é o nome desta tela no "← voltar" de quem vier depois
  const last = parts.filter(Boolean).at(-1);
  useNavLabel(last && last !== '…' ? last : null);
}

// Navegação: cada item exige uma permissão de módulo (vinda do servidor). O cliente nunca vê módulos internos.
const NAV = [
  { group: 'Operação', primary: true, items: [
    { to: '/', label: 'Visão geral', icon: I.home, mod: 'dashboard', end: true },
    { to: '/torre', label: 'Torre de Controle', icon: I.tower, mod: 'torre' },
    { to: '/pendencias', label: 'Pendências', icon: I.alert, team: true },
    { to: '/processos', label: 'Processos', icon: I.flow, mod: 'processos' },
  ] },
  { group: 'Clientes', items: [
    { to: '/clientes', label: 'Clientes', icon: I.clients, mod: 'clientes' },
    { to: '/conteudos', label: 'Conteúdos', icon: I.content, mod: 'conteudos' },
    { to: '/revisao', label: 'Sala de Revisão', icon: I.review, mod: 'revisao' },
    { to: '/divisao', label: 'Divisão', icon: I.division, mod: 'divisao', anyAct: true },
  ] },
  { group: 'Agenda', items: [
    { to: '/calendario', label: 'Calendário', icon: I.calendar, mod: 'calendario' },
    { to: '/reunioes', label: 'Reuniões', icon: I.meeting, mod: 'reunioes' },
    { to: '/comunicacao', label: 'Bold Chat', icon: I.chat, mod: 'chat', badge: 'chat' },
  ] },
  { group: 'Negócio', items: [
    { to: '/crm', label: 'CRM', icon: I.crm, mod: 'crm' },
    { to: '/financeiro', label: 'Financeiro', icon: I.money, mod: 'financeiro' },
  ] },
  { group: 'Equipe & Inteligência', items: [
    { to: '/performance', label: 'Equipe & Performance', icon: I.chart, mod: 'performance' },
    { to: '/insights', label: 'Insights', icon: I.spark, mod: 'insights' },
    { to: '/brain', label: 'The Bold Brain', icon: I.brain, mod: 'brain' },
  ] },
  { group: 'Notion & legado', items: [
    { to: '/notion', label: 'Notion & Histórico', icon: I.layers, mod: 'clientes' },
    { to: '/atrasos', label: 'Itens legados', icon: I.history, mod: 'atrasos' },
  ] },
  { group: 'Sistema', items: [
    { to: '/configuracoes', label: 'Configurações', icon: I.gear, team: true },
    { to: '/integracoes', label: 'Integrações', icon: I.plug, mod: 'integracoes' },
    { to: '/automacoes', label: 'Automações', icon: I.bolt, mod: 'automacoes' },
    { to: '/usuarios', label: 'Usuários e permissões', icon: I.users, mod: 'usuarios' },
    { to: '/historico', label: 'Histórico', icon: I.history, mod: 'historico' },
    { to: '/mapa', label: 'Mapa do produto', icon: I.flow, team: true },
    { to: '/perfil', label: 'Meu perfil', icon: I.edit, team: true },
  ] },
];

// Telas de primeiro nível (itens do menu): não mostram "voltar"
const TOP = new Set(NAV.flatMap((g) => g.items.map((n) => n.to)));
const TOP_LABEL = Object.fromEntries(NAV.flatMap((g) => g.items.map((n) => [n.to, n.label])));

export function Shell({ children }) {
  const auth = useAuth();
  const [crumbs, setCrumbs] = useState([]);
  const [navOpen, setNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const live = useLiveStream(true);
  const loc = useLocation();
  useEffect(() => setNavOpen(false), [loc.pathname]);
  const refreshCounts = () => {
    api.get('/notifications').then((r) => setUnread(r.unread)).catch(() => {});
    if (auth.permissions.chat) api.get('/chat/channels').then((r) => setChatUnread(r.reduce((s, c) => s + c.unread, 0))).catch(() => {});
  };
  useEffect(() => {
    refreshCounts();
    const h = () => refreshCounts();
    window.addEventListener('bold:notification', h); window.addEventListener('bold:message', h);
    return () => { window.removeEventListener('bold:notification', h); window.removeEventListener('bold:message', h); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allowed = (n) => (n.team ? auth.internal : n.anyAct ? !!auth.permissions[n.mod]?.length : auth.permissions[n.mod]?.includes('view')) && (n.special !== 'pendencias' || auth.pendencias);
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter(allowed) })).filter((g) => g.items.length);
  return (
    <NavHistory top={TOP} labels={TOP_LABEL}>
    <CrumbCtx.Provider value={setCrumbs}>
      <div className={`shell ${navOpen ? 'nav-open' : ''}`}>
        <aside className="sidebar" aria-label="Navegação principal">
          <Link to="/" className="brand" data-cursor="B."><span className="word">THE BOLD<i>.</i></span><span className="os">OS</span></Link>
          <nav className="nav">
            {groups.map((g) => (
              <div key={g.group} className={`nav-group ${g.primary ? 'primary' : ''}`} role="group" aria-label={g.group}>
                <div className="nav-label">{g.group}</div>
                {g.items.map((n) => (
                  <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                    <n.icon />{n.label}{n.badge === 'chat' && chatUnread > 0 && <span className="count">{chatUnread}</span>}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="side-foot">
            <Link to="/perfil"><Avatar name={auth.user.name} /></Link>
            <Link to="/perfil" className="grow"><div className="who">{auth.user.name}</div><div className="role">{auth.role.label}</div></Link>
            <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--paper)' }} onClick={auth.logout} aria-label="Sair"><I.logout /></button>
          </div>
        </aside>
        <div className="main">
          <header className="topbar">
            <Button variant="ghost" className="menu-btn" icon={<I.menu />} onClick={() => setNavOpen(true)} aria-label="Abrir menu" />
            <div className="crumbs clip"><span>The Bold</span>{crumbs.map((c, i) => <span key={i} className="row gap-2"><span className="sep">/</span>{i === crumbs.length - 1 ? <b className="clip">{c}</b> : <span className="clip">{c}</span>}</span>)}</div>
            <div className="top-actions">
              <span className={`live ${live ? '' : 'off'}`}>{live ? 'Ao vivo' : 'Reconectando'}</span>
              <ThemeToggle />
              <Button variant="ghost" className="bell" icon={<I.bell />} onClick={() => setNotifOpen(true)} aria-label={`Notificações (${unread} não lidas)`}>{unread > 0 && <span className="dot">{unread > 99 ? '99+' : unread}</span>}</Button>
            </div>
          </header>
          <main id="main"><BackLink />{children}</main>
        </div>
        <Notifications open={notifOpen} onClose={() => { setNotifOpen(false); refreshCounts(); }} />
      </div>
    </CrumbCtx.Provider>
    </NavHistory>
  );
}

export function Notifications({ open, onClose }) {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('todas');
  const nav = useNavigate();
  useEffect(() => { if (open) api.get('/notifications').then(setData); }, [open]);
  if (!open) return null;
  const items = (data?.items || []).filter((n) => filter === 'todas' || n.level === filter);
  const openItem = async (n) => { await api.post(`/notifications/${n.id}/read`); onClose(); if (n.link) nav(n.link); };
  return (
    <Drawer open={open} onClose={onClose} history={false} title="Notificações" kicker={`${data?.unread ?? 0} não lidas`}>
      <div className="row between mb-4 wrap">
        <div className="seg">{['todas', 'urgente', 'atencao', 'info'].map((f) => <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>{f === 'todas' ? 'Todas' : LEVEL[f]}</button>)}</div>
        <Button size="sm" variant="ghost" onClick={async () => { await api.post('/notifications/read-all'); setData(await api.get('/notifications')); }}>Marcar todas como lidas</Button>
      </div>
      {!items.length ? <Empty title="Tudo em dia.">Nenhuma notificação aqui.</Empty> : items.map((n) => (
        <div key={n.id} className={`notif ${n.read_at ? '' : 'unread'}`} onClick={() => openItem(n)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openItem(n)}>
          <span className={`lvl ${n.level}`} aria-label={LEVEL[n.level]} />
          <div className="grow">
            <div className="t sm">{n.title}{n.count > 1 && <span className="count">×{n.count}</span>}</div>
            {n.body && <div className="sm muted">{n.body}</div>}
            {n.cta && n.link && <div className="notif-cta sm mt-2">{n.cta.toUpperCase()} →</div>}
            <div className="xs faint mt-2">{LEVEL[n.level]} · {ago(n.updated_at)}</div>
          </div>
        </div>
      ))}
    </Drawer>
  );
}
