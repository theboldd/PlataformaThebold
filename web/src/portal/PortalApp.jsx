// Área do cliente — THE BOLD APPROVAL EXPERIENCE.
// Experiência imersiva, separada da plataforma interna. Nada interno é exibido aqui (o servidor já filtra; a interface só reflete).
import { createContext, useContext, useEffect, useState, lazy, Suspense } from 'react';
import { Routes, Route, NavLink, Link, Navigate, useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth, useLiveStream, useApi } from '../lib/hooks.js';
import { cleanName } from '../lib/format.js';
import { I } from '../components/Icons.jsx';
import { Avatar, Button, Loading } from '../components/ui.jsx';
import { Notifications } from '../components/Shell.jsx';
import Feed from './Feed.jsx';
import '../styles/portal.css';

const Inicio = lazy(() => import('./Inicio.jsx'));
const Calendario = lazy(() => import('./Calendario.jsx'));
const Pendencias = lazy(() => import('./Pendencias.jsx'));
const Materiais = lazy(() => import('./Materiais.jsx'));
const Reunioes = lazy(() => import('./Reunioes.jsx'));
const Conversa = lazy(() => import('./Conversa.jsx'));
const Perfil = lazy(() => import('./Perfil.jsx'));

const PortalCtx = createContext(null);
export const usePortal = () => useContext(PortalCtx);

const NAV = [
  { to: '/portal', label: 'Feed', icon: I.content, end: true },
  { to: '/portal/inicio', label: 'Início', icon: I.home },
  { to: '/portal/calendario', label: 'Calendário', icon: I.calendar },
  { to: '/portal/pendencias', label: 'Pendências', icon: I.alert },
  { to: '/portal/materiais', label: 'Materiais', icon: I.upload },
  { to: '/portal/reunioes', label: 'Reuniões', icon: I.meeting },
  { to: '/portal/conversa', label: 'Conversa', icon: I.chat },
];

export default function PortalApp() {
  const auth = useAuth();
  const me = useApi('/portal/me');
  const live = useLiveStream(true);
  const [notifOpen, setNotifOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const loc = useLocation();
  useEffect(() => { setMoreOpen(false); window.scrollTo({ top: 0 }); }, [loc.pathname]);
  useEffect(() => {
    const refresh = () => api.get('/notifications').then((r) => setUnread(r.unread)).catch(() => {});
    refresh();
    window.addEventListener('bold:notification', refresh);
    return () => window.removeEventListener('bold:notification', refresh);
  }, []);
  useEffect(() => { document.documentElement.setAttribute('data-portal', ''); return () => document.documentElement.removeAttribute('data-portal'); }, []);

  const client = me.data?.client || auth.clients?.[0];
  const pending = me.data?.counts?.aguardando || 0;
  const pendCount = (me.data?.steps || []).length;
  return (
    <PortalCtx.Provider value={{ me: me.data, reloadMe: me.reload, client }}>
      <div className="portal">
        <header className="p-top">
          <Link to="/portal" className="p-brand" data-cursor="B.">
            <span className="ed">THE BOLD<i>.</i></span>
          </Link>
          <span className="p-client clip">{cleanName(client?.name || '')}</span>
          <nav className="p-nav" aria-label="Navegação da área do cliente">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive || (n.to === '/portal' && loc.pathname === '/portal/feed') ? 'active' : '')}>
                {n.label}{n.to === '/portal' && pending > 0 && <span className="p-badge">{pending}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="p-actions">
            <span className={`p-live ${live ? '' : 'off'}`} title={live ? 'Atualizando em tempo real' : 'Reconectando'} aria-hidden />
            <button className="p-icon-btn" onClick={() => setNotifOpen(true)} aria-label={`Notificações (${unread} não lidas)`}>
              <I.bell size={18} />{unread > 0 && <span className="p-dot">{unread > 99 ? '99+' : unread}</span>}
            </button>
            <Link to="/portal/perfil" className="p-avatar-link" aria-label="Meu perfil"><Avatar name={auth.user.name} /></Link>
          </div>
        </header>

        <main className="p-main" id="main">
          <Suspense fallback={<div className="p-page"><Loading /></div>}>
            <Routes>
              <Route index element={<Feed />} />
              <Route path="feed" element={<Feed />} />
              <Route path="inicio" element={<Inicio />} />
              <Route path="calendario" element={<Calendario />} />
              <Route path="pendencias" element={<Pendencias />} />
              <Route path="materiais" element={<Materiais />} />
              <Route path="reunioes" element={<Reunioes />} />
              <Route path="conversa" element={<Conversa />} />
              <Route path="perfil" element={<Perfil />} />
              <Route path="*" element={<Navigate to="/portal" replace />} />
            </Routes>
          </Suspense>
        </main>

        {/* Barra inferior (celular) */}
        <nav className="p-tabbar" aria-label="Navegação">
          <NavLink to="/portal" end className={({ isActive }) => (isActive || loc.pathname === '/portal/feed' ? 'active' : '')}><I.content size={20} /><span>Feed</span>{pending > 0 && <span className="p-badge">{pending}</span>}</NavLink>
          <NavLink to="/portal/inicio" className={({ isActive }) => (isActive ? 'active' : '')}><I.home size={20} /><span>Início</span></NavLink>
          <NavLink to="/portal/calendario" className={({ isActive }) => (isActive ? 'active' : '')}><I.calendar size={20} /><span>Agenda</span></NavLink>
          <NavLink to="/portal/pendencias" className={({ isActive }) => (isActive ? 'active' : '')}><I.alert size={20} /><span>Pendências</span>{pendCount > 0 && <span className="p-badge dot" aria-hidden />}</NavLink>
          <button className={['/portal/materiais', '/portal/reunioes', '/portal/conversa', '/portal/perfil'].includes(loc.pathname) ? 'active' : ''} onClick={() => setMoreOpen(true)} aria-haspopup="dialog"><I.menu size={20} /><span>Mais</span></button>
        </nav>

        {moreOpen && (
          <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setMoreOpen(false)} role="dialog" aria-modal="true" aria-label="Mais opções">
            <div className="modal p-sheet">
              <div className="p-sheet-grip" aria-hidden />
              <div className="caps mb-4">{cleanName(client?.name || '')}</div>
              <div className="p-more">
                <Link to="/portal/materiais"><I.upload size={20} /><span>Materiais</span><small>Envie fotos, vídeos e arquivos</small></Link>
                <Link to="/portal/reunioes"><I.meeting size={20} /><span>Reuniões</span><small>Agenda e reserva de horários</small></Link>
                <Link to="/portal/conversa"><I.chat size={20} /><span>Conversa</span><small>Fale com a equipe The Bold</small></Link>
                <Link to="/portal/perfil"><I.users size={20} /><span>Meu perfil</span><small>Senha e acesso</small></Link>
              </div>
              <Button className="mt-5" style={{ width: '100%' }} onClick={auth.logout} icon={<I.logout size={16} />}>Sair</Button>
            </div>
          </div>
        )}
        <Notifications open={notifOpen} onClose={() => { setNotifOpen(false); api.get('/notifications').then((r) => setUnread(r.unread)).catch(() => {}); }} />
      </div>
    </PortalCtx.Provider>
  );
}
