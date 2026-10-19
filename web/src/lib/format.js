const TZ = 'America/Sao_Paulo';
const d = (v) => (v instanceof Date ? v : new Date(v));
export const fmtDate = (v, opt = {}) => (v ? d(v).toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: 'short', ...opt }).replace('.', '').toUpperCase() : '—');
export const fmtDay = (v) => (v ? d(v).toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }) : '—');
export const fmtDateTime = (v) => (v ? d(v).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtTime = (v) => (v ? d(v).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtWeekday = (v) => d(v).toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'long' });
export const fmtMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }); };
export const money = (v) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
export const pad2 = (n) => String(n).padStart(2, '0');
export function ago(v) {
  if (!v) return '—';
  const s = (Date.now() - d(v).getTime()) / 1000;
  if (s < 0) return inFuture(-s);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)}h`;
  const days = Math.floor(s / 86400);
  return days === 1 ? 'ontem' : `há ${days} dias`;
}
function inFuture(s) {
  if (s < 3600) return `em ${Math.max(1, Math.floor(s / 60))} min`;
  if (s < 86400) return `em ${Math.floor(s / 3600)}h`;
  const days = Math.floor(s / 86400);
  return days === 1 ? 'amanhã' : `em ${days} dias`;
}
export const duration = (hours) => (hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d ${hours % 24 ? `${hours % 24}h` : ''}`.trim());
export const initials = (name = '') => name.replace(/\(.*?\)|\[.*?\]/g, '').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
export const firstName = (name = '') => name.replace(/^Dra?\.\s*/, '').split(' ')[0];
export const greeting = () => { const h = Number(new Date().toLocaleString('pt-BR', { timeZone: TZ, hour: '2-digit', hour12: false })); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
export const cleanName = (n = '') => n.replace(/\s*\[DEMO\]/, '');
export const bytes = (n) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
