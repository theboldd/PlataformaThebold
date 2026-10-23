import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { api } from './lib/api.js';
import { AuthContext, ToastContext } from './lib/hooks.js';
import { Shell } from './components/Shell.jsx';
import { Cursor } from './components/Cursor.jsx';
import { Loading } from './components/ui.jsx';
import Login, { FirstPassword } from './pages/Login.jsx';
import { applyTheme } from './lib/theme.js';

const P = (f) => lazy(f);
const Dashboard = P(() => import('./pages/Dashboard.jsx'));
const Torre = P(() => import('./pages/Torre.jsx'));
const Processos = P(() => import('./pages/Processos.jsx'));
const Clientes = P(() => import('./pages/Clientes.jsx'));
const ClienteDetalhe = P(() => import('./pages/ClienteDetalhe.jsx'));
const Conteudos = P(() => import('./pages/Conteudos.jsx'));
const NovoConteudo = P(() => import('./pages/NovoConteudo.jsx'));
const ConteudoDetalhe = P(() => import('./pages/ConteudoDetalhe.jsx'));
const Revisao = P(() => import('./pages/Revisao.jsx'));
const Calendario = P(() => import('./pages/Calendario.jsx'));
const Reunioes = P(() => import('./pages/Reunioes.jsx'));
const Comunicacao = P(() => import('./pages/Comunicacao.jsx'));
const Pendencias = P(() => import('./pages/Pendencias.jsx'));
const Ciclos = P(() => import('./pages/Ciclos.jsx'));
const CicloCliente = P(() => import('./pages/Ciclos.jsx').then((m) => ({ default: function CicloClienteRoute() { const { batch, clientId } = useParams(); return <m.CicloCliente batch={batch} clientId={clientId} />; } })));
const Migracao = P(() => import('./pages/Migracao.jsx'));
const Divisao = P(() => import('./pages/Divisao.jsx'));
const Atrasos = P(() => import('./pages/Atrasos.jsx'));
const Negocio = P(() => import('./pages/Negocio.jsx'));
const Insights = P(() => import('./pages/Insights.jsx'));
const Brain = P(() => import('./pages/Brain.jsx'));
const Automacoes = P(() => import('./pages/Automacoes.jsx'));
const Integracoes = P(() => import('./pages/Integracoes.jsx'));
const NotionSync = P(() => import('./pages/integracoes/NotionSync.jsx'));
const Usuarios = P(() => import('./pages/Usuarios.jsx'));
const Historico = P(() => import('./pages/Historico.jsx'));
const Perfil = P(() => import('./pages/Perfil.jsx'));
const Performance = P(() => import('./pages/Performance.jsx'));
const NotionHistorico = P(() => import('./pages/NotionHistorico.jsx'));
const Configuracoes = P(() => import('./pages/Configuracoes.jsx'));
const MapaProduto = P(() => import('./pages/MapaProduto.jsx'));
const PortalApp = P(() => import('./portal/PortalApp.jsx'));

// /financeiro (links e notificações antigos) → Negócio, preservando a aba
function LegacyFinance() {
  const aba = new URLSearchParams(window.location.search).get('aba');
  return <Navigate to={`/negocio?aba=${['repasses', 'rentabilidade'].includes(aba) ? aba : 'recebimentos'}`} replace />;
}

export default function App() {
  const [auth, setAuth] = useState(undefined);
  const [toasts, setToasts] = useState([]);
  const [down, setDown] = useState(false);
  // Sessão: só um 401 de verdade leva ao login. Falha de rede/servidor (ex.: função reiniciando no Vercel)
  // tenta de novo em vez de "deslogar" quem atualizou a página.
  const load = useCallback(async () => {
    for (let i = 0; i < 4; i++) {
      try { const me = await api.get('/auth/me'); applyTheme(me.user?.theme); setAuth(me); setDown(false); return; } catch (e) {
        if (e.status === 401 || e.status === 403) { setAuth(null); setDown(false); return; }
        await new Promise((r) => setTimeout(r, 600 * (i + 1)));
      }
    }
    setDown(true);
  }, []);
  useEffect(() => {
    load();
    // um 401 isolado numa tela: confirma a sessão antes de mandar para o login
    const h = () => { api.get('/auth/me').then(setAuth).catch((e) => { if (e.status === 401) setAuth(null); }); };
    window.addEventListener('bold:unauthorized', h);
    return () => window.removeEventListener('bold:unauthorized', h);
  }, [load]);
  const toast = useCallback((msg, kind = 'ok') => { const id = Math.random(); setToasts((t) => [...t, { id, msg, kind }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800); }, []);
  if (down && auth === undefined) return <div className="page"><div className="panel">Não foi possível falar com o servidor agora. <button className="btn btn-sm" onClick={() => { setDown(false); load(); }}>Tentar de novo</button></div></div>;
  if (auth === undefined) return <div className="page"><Loading /></div>;
  const logout = async () => { await api.post('/auth/logout'); setAuth(null); window.history.replaceState(null, '', '/'); };
  const can = (mod, act = 'view') => !!auth?.permissions?.[mod]?.includes(act);
  return (
    <ToastContext.Provider value={toast}>
      <BrowserRouter>
        <Cursor />
        {!auth || window.location.pathname === '/redefinir-senha' ? <Login onLogin={async () => { window.history.replaceState(null, '', '/'); await load(); }} /> : auth.user.must_change_password ? <FirstPassword name={auth.user.name} onDone={load} onLogout={logout} /> : (
          <AuthContext.Provider value={{ ...auth, logout, reload: load, can }}>
            {auth.internal ? (
              <Shell>
                <Suspense fallback={<div className="page"><Loading /></div>}>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/torre" element={<Torre />} />
                    <Route path="/processos" element={<Processos />} />
                    <Route path="/ciclos" element={<Ciclos />} />
                    <Route path="/ciclos/:batch/:clientId" element={<CicloCliente />} />
                    <Route path="/clientes" element={<Clientes />} />
                    <Route path="/clientes/:id" element={<ClienteDetalhe />} />
                    <Route path="/conteudos" element={<Conteudos />} />
                    <Route path="/conteudos/novo" element={<NovoConteudo />} />
                    <Route path="/conteudos/:id" element={<ConteudoDetalhe />} />
                    <Route path="/revisao" element={<Revisao />} />
                    <Route path="/revisao/:clientId" element={<Revisao />} />
                    <Route path="/calendario" element={<Calendario />} />
                    <Route path="/reunioes" element={<Reunioes />} />
                    <Route path="/comunicacao" element={<Comunicacao />} />
                    <Route path="/comunicacao/:channelId" element={<Comunicacao />} />
                    <Route path="/pendencias" element={<Pendencias />} />
                    <Route path="/migracao" element={<Migracao />} />
                    <Route path="/divisao" element={<Divisao />} />
                    <Route path="/atrasos" element={<Atrasos />} />
                    <Route path="/negocio" element={<Negocio />} />
                    <Route path="/crm" element={<Navigate to="/negocio?aba=pipeline" replace />} />
                    <Route path="/financeiro" element={<LegacyFinance />} />
                    <Route path="/insights" element={<Insights />} />
                    <Route path="/brain" element={<Brain />} />
                    <Route path="/automacoes" element={<Automacoes />} />
                    <Route path="/integracoes" element={<Integracoes />} />
                    <Route path="/integracoes/notion" element={<NotionSync />} />
                    <Route path="/usuarios" element={<Usuarios />} />
                    <Route path="/historico" element={<Historico />} />
                    <Route path="/perfil" element={<Perfil />} />
                    <Route path="/performance" element={<Performance />} />
                    <Route path="/notion" element={<NotionHistorico />} />
                    <Route path="/configuracoes" element={<Configuracoes />} />
                    <Route path="/mapa" element={<MapaProduto />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </Shell>
            ) : (
              <Suspense fallback={<div className="page"><Loading /></div>}>
                <Routes>
                  <Route path="/portal/*" element={<PortalApp />} />
                  <Route path="*" element={<Navigate to="/portal" replace />} />
                </Routes>
              </Suspense>
            )}
          </AuthContext.Provider>
        )}
        <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>)}</div>
      </BrowserRouter>
    </ToastContext.Provider>
  );
}
