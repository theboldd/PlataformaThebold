// NAVEGAÇÃO GLOBAL — "← voltar" consistente em toda a plataforma.
// Regras:
// • Páginas de primeiro nível (itens do menu) não mostram voltar; páginas internas/detalhe mostram.
// • Voltar = histórico real (navigate(-1)): a tela anterior volta com o mesmo filtro, aba e rolagem —
//   o mesmo que o botão do navegador, sem navegação paralela conflitante.
// • Sem histórico dentro do app (link aberto em nova aba, por exemplo), volta para a página-mãe da rota.
// • Filtros de uma página devem morar na URL (useUrlState) para que voltar preserve o contexto.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom';

const KEY = 'bold:nav:v1';
const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const write = (v) => { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch { /* armazenamento indisponível */ } };
const idxOf = () => window.history.state?.idx ?? 0;

// Página-mãe de cada rota interna (usada só quando não há histórico dentro do app)
const PARENTS = [
  [/^\/clientes\/[^/]+$/, '/clientes', 'Clientes'],
  [/^\/conteudos\/novo$/, '/conteudos', 'Conteúdos'],
  [/^\/conteudos\/[^/]+$/, '/conteudos', 'Conteúdos'],
  [/^\/revisao\/[^/]+$/, '/revisao', 'Sala de Revisão'],
  [/^\/comunicacao\/[^/]+$/, '/comunicacao', 'Comunicação'],
  [/^\/migracao$/, '/clientes', 'Clientes'],
  [/^\/perfil$/, '/', 'BoldBoard'],
];
export const parentOf = (path) => {
  const hit = PARENTS.find(([re]) => re.test(path));
  if (hit) return { to: hit[1], label: hit[2] };
  const up = path.replace(/\/[^/]+\/?$/, '') || '/';
  return { to: up, label: null };
};

// Rotas que são a mesma tela com um item selecionado (lista + painel), não uma camada interna
const SAME_SCREEN = [/^\/comunicacao\/[^/]+$/];

const NavCtx = createContext(null);

// Fica no Shell: registra cada tela visitada (posição no histórico → caminho, rótulo, rolagem)
export function NavHistory({ top, labels, children }) {
  const loc = useLocation();
  const type = useNavigationType();
  const entries = useRef(read());
  const idx = idxOf();
  const here = `${loc.pathname}${loc.search}`;

  // registra a entrada atual (o rótulo chega depois, quando a página define o breadcrumb)
  useEffect(() => {
    const e = entries.current;
    const prev = e[idx];
    const same = prev?.pathname === loc.pathname; // filtro/aba na mesma tela (replace) mantém rótulo e rolagem
    const below = e[idx - 1]?.pathname === loc.pathname ? e[idx - 1] : null; // camada aberta sobre a mesma tela (drawer)
    e[idx] = { path: here, pathname: loc.pathname, label: labels[loc.pathname] || (same ? prev.label : below?.label || null), y: same ? prev.y : below?.y || 0 };
    // uma navegação nova descarta o "futuro" que ficou para trás
    if (type === 'PUSH') for (const k of Object.keys(e)) if (Number(k) > idx) delete e[k];
    write(e);
  }, [here, idx]); // eslint-disable-line react-hooks/exhaustive-deps

  // rolagem: guarda a posição de cada tela; ao voltar/avançar, restaura (espera o conteúdo carregar)
  useEffect(() => {
    let t;
    const save = () => { clearTimeout(t); t = setTimeout(() => { const e = entries.current; if (e[idx]) { e[idx].y = window.scrollY; write(e); } }, 120); };
    window.addEventListener('scroll', save, { passive: true });
    return () => { clearTimeout(t); window.removeEventListener('scroll', save); };
  }, [idx]);
  const lastPath = useRef(loc.pathname);
  useLayoutEffect(() => {
    const moved = lastPath.current !== loc.pathname;
    lastPath.current = loc.pathname;
    if (type === 'PUSH' && moved) { window.scrollTo(0, 0); return undefined; }
    if (type !== 'POP') return undefined;
    const y = entries.current[idx]?.y || 0;
    if (!y) return undefined;
    let tries = 0;
    const tick = setInterval(() => {
      tries++;
      if (document.documentElement.scrollHeight - window.innerHeight >= y || tries > 30) { window.scrollTo(0, y); clearInterval(tick); }
    }, 50);
    return () => clearInterval(tick);
  }, [loc.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // voltou/avançou para a entrada de um painel que não foi reaberto: pula para não "travar" um clique
  const lastIdx = useRef(idx);
  const navTo = useNavigate();
  useEffect(() => {
    const dir = idx < lastIdx.current ? -1 : 1;
    lastIdx.current = idx;
    const k = loc.state?.overlay;
    if (type !== 'POP' || !k) return undefined;
    const t = setTimeout(() => { if (!OPEN_OVERLAYS.has(k) && window.history.state?.usr?.overlay === k) navTo(dir); }, 60);
    return () => clearTimeout(t);
  }, [loc.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const setLabel = useCallback((label) => {
    const e = entries.current;
    if (!label || !e[idx] || top.has(e[idx].pathname) || e[idx].label === label) return;
    e[idx].label = label; write(e);
  }, [idx, top]);

  const value = useMemo(() => {
    const isTop = top.has(loc.pathname) || SAME_SCREEN.some((re) => re.test(loc.pathname));
    const prev = idx > 0 ? entries.current[idx - 1] : null;
    const parent = parentOf(loc.pathname);
    return { isTop, prev, parent, setLabel, inApp: idx > 0 };
  }, [loc.pathname, idx, top, setLabel]);
  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}

// Rótulo desta tela para o "voltar" da próxima (ex.: nome do cliente). Chamado pelo useCrumbs.
export function useNavLabel(label) {
  const ctx = useContext(NavCtx);
  useEffect(() => { if (label) ctx?.setLabel(label); }, [label, ctx]);
}

export function useBack() {
  const ctx = useContext(NavCtx);
  const nav = useNavigate();
  if (!ctx) return { show: false };
  const label = (ctx.inApp ? ctx.prev?.label : ctx.parent.label) || null;
  const go = (e) => {
    e?.preventDefault();
    if (ctx.inApp) nav(-1); else nav(ctx.parent.to);
  };
  return { show: !ctx.isTop, label, go, href: ctx.inApp ? ctx.prev?.path || ctx.parent.to : ctx.parent.to };
}

// ← VOLTAR · ← CLIENTES — mesmo lugar em todas as telas internas (topo da área de conteúdo)
export function BackLink({ force }) {
  const b = useBack();
  if (!b.show && !force) return null;
  return (
    <div className="backbar">
      <Link to={b.href} onClick={b.go} className="back-link" aria-label={b.label ? `Voltar para ${b.label}` : 'Voltar'}>
        <span className="back-arrow" aria-hidden>←</span>
        <span className="back-text">{b.label || 'Voltar'}</span>
      </Link>
    </div>
  );
}

// Estado de filtro/aba guardado na URL (substitui useState): voltar para a página devolve o mesmo contexto.
// Strings, números e booleanos. Objeto = várias chaves (cada campo vira um parâmetro).
export function useUrlState(key, def) {
  const [params, setParams] = useSearchParams();
  const enc = (v, d) => (v === d || v === '' || v == null ? null : typeof d === 'boolean' ? (v ? '1' : '0') : String(v));
  const dec = (s, d) => (s == null ? d : typeof d === 'number' ? Number(s) : typeof d === 'boolean' ? s === '1' : s);
  const isObj = def && typeof def === 'object' && !Array.isArray(def);
  const name = (k) => (key ? `${key}.${k}` : k);
  const getFrom = (p) => (isObj ? Object.fromEntries(Object.keys(def).map((k) => [k, dec(p.get(name(k)), def[k])])) : dec(p.get(key), def));
  const value = getFrom(params);
  const set = useCallback((next) => setParams((p) => {
    const n = new URLSearchParams(p);
    const v = typeof next === 'function' ? next(getFrom(p)) : next;
    const put = (k, val, d) => { const s = enc(val, d); if (s == null) n.delete(k); else n.set(k, s); };
    if (isObj) for (const k of Object.keys(def)) put(name(k), v[k], def[k]); else put(key, v, def);
    return n;
  }, { replace: true }), [setParams, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return [value, set];
}

// Detalhe aberto por parâmetro de URL (ex.: ?p=<pendência>): abrir entra no histórico, então o voltar do
// navegador (ou da seta) fecha o detalhe e devolve a lista exatamente como estava; fechar = voltar.
export function useDetailParam(key) {
  const [params, setParams] = useSearchParams();
  const loc = useLocation();
  const nav = useNavigate();
  const value = params.get(key);
  const open = useCallback((id) => setParams((p) => { const n = new URLSearchParams(p); n.set(key, id); return n; }, { replace: !!params.get(key), state: { detail: key } }), [key, params, setParams]);
  const close = useCallback(() => {
    if (loc.state?.detail === key && idxOf() > 0) nav(-1);
    else setParams((p) => { const n = new URLSearchParams(p); n.delete(key); return n; }, { replace: true });
  }, [key, loc.state, nav, setParams]);
  return [value, open, close];
}

// Camadas abertas agora (para reconhecer, ao voltar, uma entrada de camada que já não existe)
const OPEN_OVERLAYS = new Set();

// Estado da camada guardado na entrada do histórico: ao voltar para ela, a tela reabre o mesmo painel
// (ex.: Torre → "Em produção" → conteúdo → voltar = Torre com "Em produção" aberto).
// Uso: const [drawer, setDrawer] = useState(() => restoredOverlay('torre'));  <Drawer restore={drawer} restoreKey="torre" …>
export const restoredOverlay = (owner) => { const u = window.history.state?.usr; return u?.overlay && u.overlayOwner === owner ? u.overlayData ?? null : null; };

// Camada (drawer) controlada por estado: abrir cria uma entrada no histórico; o voltar fecha a camada
// em vez de sair da tela. Usado pelo <Drawer> (desligável com history={false}).
export function useOverlayHistory(open, onClose, data, owner) {
  const loc = useLocation();
  const nav = useNavigate();
  const mine = useRef(null);
  const at = useRef(null); // tela em que a camada foi aberta
  const live = useRef(false); // a entrada da camada já chegou ao histórico
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (open && !mine.current) {
      const cur = window.history.state?.usr;
      if (cur?.overlay && !OPEN_OVERLAYS.has(cur.overlay) && owner && cur.overlayOwner === owner) {
        // reabrindo a partir do histórico: adota a entrada existente em vez de criar outra
        mine.current = cur.overlay; at.current = loc.pathname; live.current = true;
      } else {
        const k = Math.random().toString(36).slice(2);
        mine.current = k; at.current = loc.pathname; live.current = false;
        nav(`${loc.pathname}${loc.search}`, { state: { ...(loc.state || {}), overlay: k, overlayOwner: owner || null, overlayData: owner ? data ?? null : null } });
      }
      OPEN_OVERLAYS.add(mine.current);
    }
    if (!open && mine.current) { // fechou por fora (ex.: após salvar): tira a entrada da camada
      const k = mine.current; OPEN_OVERLAYS.delete(k); mine.current = null; live.current = false;
      if (window.history.state?.usr?.overlay === k) nav(-1);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // desmontado por fora (o pai fechou, ex.: após salvar): tira a entrada da camada do histórico
  useEffect(() => () => {
    if (!mine.current) return;
    OPEN_OVERLAYS.delete(mine.current);
    if (window.history.state?.usr?.overlay === mine.current) { mine.current = null; window.history.back(); }
  }, []);
  useEffect(() => { // voltar do navegador ou navegação para outra tela: a camada fecha
    if (!mine.current) return;
    if (loc.state?.overlay === mine.current) { live.current = true; return; } // a entrada da camada já está no histórico
    if (!live.current) return; // ainda entrando no histórico
    OPEN_OVERLAYS.delete(mine.current); mine.current = null; live.current = false;
    if (loc.pathname === at.current) onCloseRef.current?.(); // voltou para a mesma tela: fecha; foi para outra tela: o painel some junto
  }, [loc.key]); // eslint-disable-line react-hooks/exhaustive-deps
  return useCallback(() => {
    if (mine.current && window.history.state?.usr?.overlay === mine.current) nav(-1); else onCloseRef.current?.();
  }, [nav]);
}
