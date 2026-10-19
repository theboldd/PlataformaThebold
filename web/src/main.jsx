import { createRoot } from 'react-dom/client';
import './styles/base.css';
import './styles/components.css';
import './styles/shell.css';
import './styles/media.css';
import App from './App.jsx';

// Tema escolhido no Perfil (claro/escuro/sistema) — aplicado antes do primeiro render
try { const t = localStorage.getItem('bold-theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch { /* armazenamento indisponível */ }

createRoot(document.getElementById('root')).render(<App />);
