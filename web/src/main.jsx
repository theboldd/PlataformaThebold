import { createRoot } from 'react-dom/client';
import './styles/base.css';
import './styles/components.css';
import './styles/shell.css';
import './styles/media.css';
import './styles/state.css';
import './styles/editorial-os.css';
import App from './App.jsx';

// Tema escolhido no Perfil — aplicado antes do primeiro render. Padrão da plataforma: escuro editorial (claro só se a pessoa escolher)
try { document.documentElement.dataset.theme = localStorage.getItem('bold-theme') === 'light' ? 'light' : 'dark'; } catch { document.documentElement.dataset.theme = 'dark'; }

createRoot(document.getElementById('root')).render(<App />);
