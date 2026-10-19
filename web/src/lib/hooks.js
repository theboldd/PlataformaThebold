import { useCallback, useEffect, useRef, useState, createContext, useContext } from 'react';
import { api } from './api.js';

// Carrega dados de um endpoint; recarrega quando deps mudam ou quando chega um evento em tempo real relevante.
export function useApi(url, deps = [], { live = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const urlRef = useRef(url);
  urlRef.current = url;
  const load = useCallback(async (silent = false) => {
    if (!urlRef.current) return;
    if (!silent) setLoading(true);
    try { setData(await api.get(urlRef.current)); setError(null); } catch (e) { setError(e); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [url, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!live) return;
    let t;
    const h = () => { clearTimeout(t); t = setTimeout(() => load(true), 350); };
    window.addEventListener('bold:activity', h);
    return () => { window.removeEventListener('bold:activity', h); clearTimeout(t); };
  }, [load, live]);
  return { data, error, loading, reload: () => load(true), setData };
}

// Stream SSE único por sessão → eventos globais (bold:notification, bold:message, bold:activity)
export function useLiveStream(enabled) {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let es, retry;
    const open = () => {
      es = new EventSource('/api/stream');
      es.onopen = () => setConnected(true);
      es.onerror = () => { setConnected(false); };
      for (const ev of ['notification', 'message', 'activity']) es.addEventListener(ev, (e) => window.dispatchEvent(new CustomEvent(`bold:${ev}`, { detail: JSON.parse(e.data) })));
    };
    open();
    return () => { es?.close(); clearTimeout(retry); };
  }, [enabled]);
  return connected;
}

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
export const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function useMediaQuery(q) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const h = () => setM(mq.matches); mq.addEventListener('change', h); return () => mq.removeEventListener('change', h); }, [q]);
  return m;
}
