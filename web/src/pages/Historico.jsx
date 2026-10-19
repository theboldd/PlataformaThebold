import { useEffect, useState } from 'react';
import '../styles/admin.css';
import { api } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Empty, ErrorBox, Loading, PageHead, Seg } from '../components/ui.jsx';
import { fmtDateTime, cleanName } from '../lib/format.js';
import { useUrlState } from '../lib/nav.jsx';

const pretty = (v) => { if (v == null) return '—'; try { return JSON.stringify(JSON.parse(v), null, 2); } catch { return String(v); } };

export default function Historico() {
  useCrumbs('Histórico');
  const [f, setF] = useUrlState('', { client_id: '', actor_kind: '', action: '', q: '' });
  const [q, setQ] = useState(f.q);
  const [open, setOpen] = useState(null);
  const [logins, setLogins] = useState(false);
  const [clients, setClients] = useState([]);
  useEffect(() => { api.get('/clients').then(setClients).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(() => setF((x) => ({ ...x, q })), 350); return () => clearTimeout(t); }, [q]);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const { data, error, loading } = useApi(`/history?limit=400${qs ? `&${qs}` : ''}`, []);
  return (
    <div className="page">
      <PageHead kicker="Auditoria" title="Histórico" sub="Quem fez o quê, quando, antes e depois — ações manuais e automáticas. Registros críticos nunca são apagados (log append-only, protegido no banco)." />
      <div className="row wrap mb-5 gap-4">
        <input className="input" style={{ maxWidth: 280 }} placeholder="Buscar no histórico" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        <select className="select" style={{ maxWidth: 240 }} value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} aria-label="Cliente"><option value="">Todos os clientes</option>{clients.map((c) => <option key={c.id} value={c.id}>{cleanName(c.name)}</option>)}</select>
        <Seg label="Origem" value={f.actor_kind} onChange={(v) => setF({ ...f, actor_kind: v })} options={[{ value: '', label: 'Todos' }, { value: 'usuario', label: 'Pessoas' }, { value: 'sistema', label: 'Sistema' }, { value: 'integracao', label: 'Integrações' }, { value: 'ia', label: 'IA' }]} />
        <Seg label="Tipo" value={f.action} onChange={(v) => setF({ ...f, action: v })} options={[{ value: '', label: 'Tudo' }, { value: 'etapa', label: 'Etapas' }, { value: 'cliente', label: 'Aprovações' }, { value: 'ajuste', label: 'Ajustes' }, { value: 'usuario', label: 'Acessos' }, { value: 'integracao', label: 'Integrações' }]} />
      </div>
      <label className="check mb-4"><input type="checkbox" checked={logins} onChange={(e) => setLogins(e.target.checked)} /> Mostrar entradas no sistema (login)</label>
      {error ? <ErrorBox error={error} /> : loading && !data ? <Loading rows={8} /> : !data.length ? <Empty title="Nada encontrado." /> : (
        <div>
          <div className="log-row log-head"><span>Quando</span><span>Quem</span><span>O quê</span><span>Cliente</span><span>Origem</span></div>
          {data.filter((l) => logins || l.action !== 'auth.login').map((l) => {
            const auto = l.origin === 'automatica';
            const who = l.actor_name || (l.actor_kind === 'integracao' ? 'Integração' : l.actor_kind === 'ia' ? 'IA' : 'Sistema');
            const hasDiff = l.before != null || l.after != null;
            return (
              <div key={l.id} className={`log-row ${auto ? 'auto' : ''}`}>
                <span className="when">{fmtDateTime(l.created_at)}</span>
                <span className="who strong sm clip">{who}</span>
                <span>{l.summary} {hasDiff && <button className="btn btn-ghost btn-sm" style={{ height: 22 }} onClick={() => setOpen(open === l.id ? null : l.id)} aria-expanded={open === l.id}>{open === l.id ? 'ocultar' : 'antes → depois'}</button>}<div className="xs faint">{l.action}{l.visibility === 'client' ? ' · visível ao cliente' : ''}</div></span>
                <span className="xs muted clip">{l.client_name ? cleanName(l.client_name) : '—'}</span>
                <span className="xs">{auto ? 'Automática' : 'Manual'}</span>
                {open === l.id && <div className="diff"><div><div className="caps mb-2">Antes</div><pre>{pretty(l.before)}</pre></div><div><div className="caps mb-2">Depois</div><pre>{pretty(l.after)}</pre></div></div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
