// Tema claro/escuro. A preferência é da PESSOA (salva no usuário, no servidor) e fica em cache no navegador
// só para a tela não piscar antes do login. Trocar de tema não recarrega nem tira a pessoa da tela atual.
import { api } from './api.js';

export const readTheme = () => { try { return localStorage.getItem('bold-theme') || 'system'; } catch { return 'system'; } };
export function applyTheme(t) {
  // padrão da plataforma = escuro editorial; “padrão” (system) também cai no escuro
  document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark';
  try { if (!t || t === 'system') localStorage.removeItem('bold-theme'); else localStorage.setItem('bold-theme', t); } catch { /* armazenamento indisponível */ }
}
// tema efetivo agora ("padrão" = escuro editorial)
export const effectiveTheme = (t = readTheme()) => (t === 'light' ? 'light' : 'dark');
export async function saveTheme(t) {
  applyTheme(t);
  try { await api.put('/auth/theme', { theme: t }); } catch { /* fica aplicado neste aparelho; salva na próxima */ }
}
