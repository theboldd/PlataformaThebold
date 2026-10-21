// Alternar claro ↔ escuro em qualquer tela (topo da equipe e do portal). Salva no usuário.
import { useState } from 'react';
import { effectiveTheme, readTheme, saveTheme } from '../lib/theme.js';

// portal: o escuro é a identidade padrão do portal; o claro vale quando a pessoa escolhe
export function ThemeToggle({ className = '', portal = false }) {
  const [t, setT] = useState(() => (portal ? (readTheme() === 'light' ? 'light' : 'dark') : effectiveTheme()));
  const next = t === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className={`theme-toggle ${className}`} onClick={() => { setT(next); saveTheme(next); }}
      aria-label={next === 'light' ? 'Mudar para modo claro' : 'Mudar para modo escuro'} title={next === 'light' ? 'Modo claro' : 'Modo escuro'}>
      {t === 'dark'
        ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" /></svg>
        : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" /></svg>}
    </button>
  );
}
