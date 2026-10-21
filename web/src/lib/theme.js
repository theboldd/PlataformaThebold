// Tema claro/escuro. A preferência é da PESSOA (salva no usuário, no servidor) e fica em cache no navegador
// só para a tela não piscar antes do login. Trocar de tema não recarrega nem tira a pessoa da tela atual.
import { api } from './api.js';

export const readTheme = () => { try { return localStorage.getItem('bold-theme') || 'system'; } catch { return 'system'; } };
export function applyTheme(t) {
  if (!t || t === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  try { if (!t || t === 'system') localStorage.removeItem('bold-theme'); else localStorage.setItem('bold-theme', t); } catch { /* armazenamento indisponível */ }
}
// tema efetivo agora (resolve "sistema" pela preferência do aparelho)
export const effectiveTheme = (t = readTheme()) => (t === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t);
export async function saveTheme(t) {
  applyTheme(t);
  try { await api.put('/auth/theme', { theme: t }); } catch { /* fica aplicado neste aparelho; salva na próxima */ }
}
