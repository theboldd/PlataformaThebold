// Área do cliente — o ambiente digital da The Bold.
// O cliente vê clareza; a complexidade operacional fica do lado da equipe (o servidor já filtra; a interface só reflete).
import { createContext, useContext, useEffect, useState, lazy, Suspense } from 'react';
import { Routes, Route, NavLink, Link, Navigate, useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth, useLiveStream, useApi } from '../lib/hooks.js';
import { cleanName } from '../lib/format.js';
import { I } from '../components/Icons.jsx';
import { Avatar, Button, Loading } from '../components/ui.jsx';
import { Notifications } from '../components/Shell.jsx';
import Feed from './Feed.jsx';
import Inicio from './Inicio.jsx';
import NewRequest from './NewRequest.jsx';
import '../styles/portal.css';
import '../styles/portal-x.css';

const Calendario = lazy(() => import('./Calendario.jsx'));
const Projeto = lazy(() => import('./Projeto.jsx'));
const Materiais = lazy(() => import('./Materiais.jsx'));
const Reunioes = lazy(() => import('./Reunioes.jsx'));
const Conversa = lazy(() => import('./Conversa.jsx'));
const Perfil = lazy(() => import('./Perfil.jsx'));
const Onboarding = lazy(() => import('./Onboarding.jsx'));
const Decisoes = lazy(() => import('./Decisoes.jsx'));
const Solicitacoes = lazy(() => import('./Solicitacoes.jsx'));
const Marca = lazy(() => import('./Marca.jsx'));
const Historico = lazy(() => import('./Historico.jsx'));

const PortalCtx = createContext(null);
export const usePortal = () => useContext(PortalCtx);

// Modo claro/escuro: segue o sistema por padrão; a escolha fica só neste navegador
const TONES = { auto: 'Automático', dark: 'Escuro', light: 'Claro' };
const readTone = () => { try { return localStorage.getItem('bold:tone') || 'auto'; } catch { return 'auto'; } };
function useTone() {
  const [tone, setTone] = useState(readTone);
  const [sysDark, setSysDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => { const mq = window.matchMedia('(prefers-color-scheme: dark)'); const h = () => setSysDark(mq.matches); mq.addEventListener('change', h); return () => mq.removeEventListener('change', h); }, []);
  const set = (t) => { setTone(t); try { localStorage.setItem('bold:tone', t); } catch { /* sem armazenamento */ } };
  const resolved = tone === 'auto' ? (sysDark ? 'dark' : 'light') : tone;
  return { tone, setTone: set, resolved };
}

const NAV = [
  { to: '/portal', label: 'Início', end: true },
  { to: '/portal/conteudos', label: 'Conteúdos', badge: 'aprovacao' },
  { to: '/portal/decisoes', label: 'Decisões', badge: 'decisoes' },
  { to: '/portal/calendario', label: 'Calendário' },
  { to: '/portal/reunioes', label: 'Reuniões' },
  { to: '/portal/comunicacao', label: 'Mensagens' },
];
const MORE = [
  { to: '/portal/solicitacoes', icon: I.plus, label: 'Solicitações', hint: 'O que você pediu à The Bold e o status' },
  { to: '/portal/materiais', icon: I.upload, label: 'Materiais', hint: 'Pedidos, envios, referências e arquivos do projeto' },
  { to: '/portal/marca', icon: I.brain, label: 'Sua marca', hint: 'Como a The Bold entende sua marca · Pulso' },
  { to: '/portal/historico', icon: I.history, label: 'Histórico', hint: 'Tudo o que já aconteceu no seu projeto' },
  { to: '/portal/onboarding', icon: I.file, label: 'Onboarding', hint: 'Suas respostas sobre a marca' },
  { to: '/portal/perfil', icon: I.users, label: 'Meu perfil', hint: 'Senha, acesso e aparência' },
];

export default function PortalApp() {
  const auth = useAuth();
  const me = useApi('/portal/me');
  const live = useLiveStream(true);
  const { tone, setTone, resolved } = useTone();
  const [notifOpen, setNotifOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [request, setRequest] = useState(null); // null | {} | { kind, ref }
  const [unread, setUnread] = useState(0);
  const loc = useLocation();
  useEffect(() => { setMoreOpen(false); window.scrollTo({ top: 0 }); }, [loc.pathname]);
  useEffect(() => {
    const refresh = () => api.get('/notifications').then((r) => setUnread(r.unread)).catch(() => {});
    refresh();
    window.addEventListener('bold:notification', refresh);
    return () => window.removeEventListener('bold:notification', refresh);
  }, []);
  useEffect(() => { document.documentElement.setAttribute('data-portal', resolved); return () => document.documentElement.removeAttribute('data-portal'); }, [resolved]);

  const client = me.data?.client || auth.clients?.[0];
  const badges = { aprovacao: me.data?.counts?.aguardando || 0, decisoes: me.data?.actions_count || 0 };
  const moreActive = MORE.some((m) => loc.pathname.startsWith(m.to)) || loc.pathname === '/portal/projeto';
  return (
    <PortalCtx.Provider value={{ me: me.data, reloadMe: me.reload, client, openRequest: (ctx = {}) => setRequest(ctx), tone, setTone, tones: TONES }}>
      <div className="portal" data-tone={resolved}>
        <a href="#main" className="skip">Pular para o conteúdo</a>
        <header className="p-top">
          <Link to="/portal" className="p-brand" data-cursor="B." aria-label="The Bold — início">
            <span className="ed">THE BOLD<i>.</i></span>
          </Link>
          <span className="p-client clip">{cleanName(client?.name || '')}</span>
          <nav className="p-nav" aria-label="Navegação da área do cliente">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                {n.label}{n.badge && badges[n.badge] > 0 && <span className="p-badge" aria-label={`${badges[n.badge]} pendentes`}>{badges[n.badge]}</span>}
              </NavLink>
            ))}
            <button className={moreActive ? 'active' : ''} onClick={() => setMoreOpen(true)} aria-haspopup="dialog">Mais</button>
          </nav>
          <div className="p-actions">
            <button className="p-new" onClick={() => setRequest({})} data-cursor="PEDIR"><I.plus size={14} /> <span>Nova solicitação</span></button>
            <span className={`p-live ${live ? '' : 'off'}`} title={live ? 'Atualizando em tempo real' : 'Reconectando'} aria-hidden />
            <button className="p-icon-btn" onClick={() => setNotifOpen(true)} aria-label={`Notificações (${unread} não lidas)`}>
              <I.bell size={18} />{unread > 0 && <span className="p-dot">{unread > 99 ? '99+' : unread}</span>}
            </button>
            <Link to="/portal/perfil" className="p-avatar-link" aria-label="Meu perfil"><Avatar name={auth.user.name} /></Link>
          </div>
        </header>

        <main className="p-main" id="main" tabIndex={-1}>
          <Suspense fallback={<div className="p-page"><Loading /></div>}>
            <Routes>
              <Route index element={<Inicio />} />
              <Route path="conteudos" element={<Feed />} />
              <Route path="feed" element={<Navigate to="/portal/conteudos" replace />} />
              <Route path="inicio" element={<Navigate to="/portal" replace />} />
              <Route path="decisoes" element={<Decisoes />} />
              <Route path="solicitacoes" element={<Solicitacoes />} />
              <Route path="calendario" element={<Calendario />} />
              <Route path="marca" element={<Marca />} />
              <Route path="historico" element={<Historico />} />
              <Route path="projeto" element={<Projeto />} />
              <Route path="pendencias" element={<Navigate to="/portal/decisoes" replace />} />
              <Route path="materiais" element={<Materiais />} />
              <Route path="reunioes" element={<Reunioes />} />
              <Route path="comunicacao" element={<Conversa />} />
              <Route path="conversa" element={<Navigate to="/portal/comunicacao" replace />} />
              <Route path="perfil" element={<Perfil />} />
              <Route path="onboarding" element={<Onboarding />} />
              <Route path="*" element={<Navigate to="/portal" replace />} />
            </Routes>
          </Suspense>
        </main>

        {/* + NOVA SOLICITAÇÃO sempre à mão no celular */}
        {['/portal', '/portal/solicitacoes', '/portal/decisoes'].includes(loc.pathname) && <button className="p-fab" onClick={() => setRequest({})} aria-label="Nova solicitação"><I.plus size={22} /></button>}

        {/* Barra inferior (celular): o que precisa de ação vem primeiro */}
        <nav className="p-tabbar" aria-label="Navegação">
          <NavLink to="/portal" end className={({ isActive }) => (isActive ? 'active' : '')}><I.home size={20} /><span>Início</span></NavLink>
          <NavLink to="/portal/conteudos" className={({ isActive }) => (isActive ? 'active' : '')}><I.content size={20} /><span>Conteúdos</span>{badges.aprovacao > 0 && <span className="p-badge">{badges.aprovacao}</span>}</NavLink>
          <NavLink to="/portal/decisoes" className={({ isActive }) => (isActive ? 'active' : '')}><I.check size={20} /><span>Decisões</span>{badges.decisoes > 0 && <span className="p-badge">{badges.decisoes}</span>}</NavLink>
          <NavLink to="/portal/comunicacao" className={({ isActive }) => (isActive ? 'active' : '')}><I.chat size={20} /><span>Mensagens</span></NavLink>
          <button className={moreActive || ['/portal/calendario', '/portal/reunioes'].includes(loc.pathname) ? 'active' : ''} onClick={() => setMoreOpen(true)} aria-haspopup="dialog"><I.menu size={20} /><span>Mais</span></button>
        </nav>

        {moreOpen && (
          <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setMoreOpen(false)} role="dialog" aria-modal="true" aria-label="Mais opções">
            <div className="modal p-sheet">
              <div className="p-sheet-grip" aria-hidden />
              <div className="caps mb-4">{cleanName(client?.name || '')}</div>
              <div className="p-more">
                <Link to="/portal/calendario" className="p-more-mobile"><I.calendar size={20} /><span>Calendário</span><small>O calendário editorial do mês</small></Link>
                <Link to="/portal/reunioes" className="p-more-mobile"><I.meeting size={20} /><span>Reuniões</span><small>Próxima reunião, pauta e resumos</small></Link>
                {MORE.map((m) => <Link key={m.to} to={m.to}><m.icon size={20} /><span>{m.label}</span><small>{m.hint}</small></Link>)}
              </div>
              <Button className="mt-5" style={{ width: '100%' }} onClick={auth.logout} icon={<I.logout size={16} />}>Sair</Button>
            </div>
          </div>
        )}
        {request && <NewRequest ctx={request} onClose={() => setRequest(null)} onDone={() => me.reload()} />}
        <Notifications open={notifOpen} onClose={() => { setNotifOpen(false); api.get('/notifications').then((r) => setUnread(r.unread)).catch(() => {}); }} />
      </div>
    </PortalCtx.Provider>
  );
}
