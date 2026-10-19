import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { api } from './lib/api.js';
import { AuthContext, ToastContext } from './lib/hooks.js';
import { Shell } from './components/Shell.jsx';
import { Cursor } from './components/Cursor.jsx';
import { Loading } from './components/ui.jsx';
import Login from './pages/Login.jsx';

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
const Migracao = P(() => import('./pages/Migracao.jsx'));
const CRM = P(() => import('./pages/CRM.jsx'));
const Financeiro = P(() => import('./pages/Financeiro.jsx'));
const Insights = P(() => import('./pages/Insights.jsx'));
const Brain = P(() => import('./pages/Brain.jsx'));
const Automacoes = P(() => import('./pages/Automacoes.jsx'));
const Integracoes = P(() => import('./pages/Integracoes.jsx'));
const Usuarios = P(() => import('./pages/Usuarios.jsx'));
const Historico = P(() => import('./pages/Historico.jsx'));
const Perfil = P(() => import('./pages/Perfil.jsx'));
const PortalApp = P(() => import('./portal/PortalApp.jsx'));

export default function App() {
  const [auth, setAuth] = useState(undefined);
  const [toasts, setToasts] = useState([]);
  const load = useCallback(async () => { try { setAuth(await api.get('/auth/me')); } catch { setAuth(null); } }, []);
  useEffect(() => { load(); const h = () => setAuth(null); window.addEventListener('bold:unauthorized', h); return () => window.removeEventListener('bold:unauthorized', h); }, [load]);
  const toast = useCallback((msg, kind = 'ok') => { const id = Math.random(); setToasts((t) => [...t, { id, msg, kind }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800); }, []);
  if (auth === undefined) return <div className="page"><Loading /></div>;
  const logout = async () => { await api.post('/auth/logout'); setAuth(null); window.history.replaceState(null, '', '/'); };
  const can = (mod, act = 'view') => !!auth?.permissions?.[mod]?.includes(act);
  return (
    <ToastContext.Provider value={toast}>
      <BrowserRouter>
        <Cursor />
        {!auth ? <Login onLogin={load} /> : (
          <AuthContext.Provider value={{ ...auth, logout, reload: load, can }}>
            {auth.internal ? (
              <Shell>
                <Suspense fallback={<div className="page"><Loading /></div>}>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/torre" element={<Torre />} />
                    <Route path="/processos" element={<Processos />} />
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
                    <Route path="/crm" element={<CRM />} />
                    <Route path="/financeiro" element={<Financeiro />} />
                    <Route path="/insights" element={<Insights />} />
                    <Route path="/brain" element={<Brain />} />
                    <Route path="/automacoes" element={<Automacoes />} />
                    <Route path="/integracoes" element={<Integracoes />} />
                    <Route path="/usuarios" element={<Usuarios />} />
                    <Route path="/historico" element={<Historico />} />
                    <Route path="/perfil" element={<Perfil />} />
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
