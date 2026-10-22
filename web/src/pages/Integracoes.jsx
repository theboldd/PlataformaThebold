import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import '../styles/admin.css';
import '../styles/automations.css';
import { LoadError } from './admin/Guard.jsx';
import { api } from '../lib/api.js';
import { useApi, useAuth, useToast } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Button, Field, Loading, PageHead } from '../components/ui.jsx';
import { StateBadge, StateNotice } from '../components/State.jsx';
import { ago, cleanName } from '../lib/format.js';

// Ordem do resumo: o que funciona → o que precisa de ação → o que depende de decisão
const ORDER = ['conectada', 'ativo', 'somente_leitura', 'erro', 'nao_conectada', 'aguardando_configuracao', 'aguardando_decisao', 'em_desenvolvimento'];

export default function Integracoes() {
  useCrumbs('Integrações');
  const { data, error, loading, reload } = useApi('/status/integrations');
  const [sp, setSp] = useSearchParams();
  const toast = useToast();
  useEffect(() => {
    if (sp.get('ok')) { toast(`Integração conectada: ${sp.get('ok')}`); setSp({}, { replace: true }); }
    if (sp.get('erro')) { toast(`Falha na conexão: ${sp.get('erro')}`, 'err'); setSp({}, { replace: true }); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (loading && !data) return <div className="page"><Loading /></div>;
  if (error) return <LoadError error={error} />;
  const integ = data.items.filter((i) => i.group !== 'infraestrutura');
  const infra = data.items.filter((i) => i.group === 'infraestrutura');
  const states = ORDER.filter((s) => data.summary[s]);
  return (
    <div className="page">
      <PageHead kicker="Sistema" title="Integrações" sub="Estado real de cada conexão. Nada aparece como conectado sem estar. Tokens ficam criptografados no servidor e nunca são exibidos; aqui só aparecem os nomes do que falta configurar." />
      <div className="stx-summary mb-5" aria-label="Resumo por estado">
        {states.map((s) => <div key={s} className="stx-sum"><span className="stx-sum-n tnum">{data.summary[s]}</span><StateBadge s={s} /></div>)}
      </div>
      {!data.public_base_url && <div className="mb-5"><StateNotice s="aguardando_configuracao" title="Endereço público (PUBLIC_BASE_URL)" compact>Os retornos de login (Google, Meta, Slack) usam localhost e a publicação via Meta fica indisponível até o endereço público ser definido no servidor.</StateNotice></div>}
      <h2 className="caps mb-4">Integrações</h2>
      <div className="stx-grid mb-5">{integ.map((p) => <Card key={p.key} p={p} clients={data.clients} reload={reload} />)}</div>
      <h2 className="caps mb-4">Infraestrutura e hospedagem</h2>
      <div className="stx-grid">{infra.map((p) => <Card key={p.key} p={p} clients={data.clients} reload={reload} />)}</div>
    </div>
  );
}

function Card({ p, clients, reload }) {
  const auth = useAuth();
  const toast = useToast();
  const admin = auth.can('integracoes', 'admin');
  const [busy, setBusy] = useState(false);
  const connect = async () => {
    setBusy(true);
    try { const r = await api.post(`/integrations/${p.provider}/connect`); window.location.href = r.url; }
    catch (e) { toast(e.status === 412 ? `Servidor sem credenciais: ${p.missing.join(', ')}` : e.message, 'err'); setBusy(false); }
  };
  const disconnect = async () => { if (!confirm(`Desconectar ${p.name}?`)) return; try { await api.post(`/integrations/${p.provider}/disconnect`); toast('Desconectado'); reload(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <article className={`stx-card stx-${p.state}`}>
      <div className="stx-card-h">
        <h3 className="stx-card-t">{p.name}</h3>
        <StateBadge s={p.state} />
      </div>
      <p className="sm muted stx-p">{p.purpose}</p>
      {p.detail && <p className="sm stx-p">{p.detail}</p>}
      {p.account && <div className="sm"><span className="muted">Conta:</span> {p.account}</div>}
      {p.updated_at && <div className="xs faint">Atualizado {ago(p.updated_at)}</div>}
      {p.state === 'erro' && p.last_error && <div className="sm" style={{ color: 'var(--err)' }}>Último erro: {p.last_error}</div>}
      {p.counts && (
        <div className="stx-counts">
          {Object.entries(p.counts).filter(([, v]) => v != null).map(([k, v]) => <div key={k}><span className="tnum strong">{v}</span><span className="xs muted">{k === 'historico' ? 'registros de histórico' : k === 'conteudos' ? 'conteúdos migrados' : k === 'tarefas' ? 'tarefas migradas' : 'clientes com página'}</span></div>)}
        </div>
      )}
      {p.missing?.length > 0 && (
        <div><div className="caps xs mb-2">O que falta</div><ul className="stx-list">{p.missing.map((m) => <li key={m}>{m}</li>)}</ul></div>
      )}
      {p.used_by?.length > 0 && (
        <div><div className="caps xs mb-2">Usado em</div><div className="stx-chips">{p.used_by.map((u) => <span key={u} className="stx-chip">{u}</span>)}</div></div>
      )}
      {p.depends_on?.length > 0 && <div className="xs faint">Depende de: {p.depends_on.join(' · ')}</div>}
      {admin && p.provider && (p.action === 'connect' || p.connected) && (
        <div className="row wrap stx-actions">
          {p.connected
            ? <Button size="sm" variant="danger" onClick={disconnect}>Desconectar</Button>
            : <Button size="sm" variant="primary" disabled={busy || !p.can_connect} onClick={connect} title={!p.can_connect ? 'Faltam as credenciais do aplicativo no servidor' : undefined}>{p.state === 'erro' ? 'Reconectar' : 'Conectar'}</Button>}
          {!p.connected && !p.can_connect && <span className="xs faint">Disponível quando as credenciais estiverem no servidor.</span>}
        </div>
      )}
      {!admin && p.action === 'connect' && <div className="xs faint">Somente administradores conectam integrações.</div>}
      {admin && p.provider === 'meta' && p.connected && <MetaMap p={p} clients={clients} reload={reload} />}
      {admin && p.provider === 'slack' && p.connected && <ConfigInput p={p} k="mirror_channel" label="Canal de espelho (ID do Slack)" placeholder="C0123456789" reload={reload} />}
      {admin && p.provider === 'google_calendar' && p.connected && <ConfigInput p={p} k="calendar_id" label="Agenda (ID)" placeholder="primary" reload={reload} />}
    </article>
  );
}

function ConfigInput({ p, k, label, placeholder, reload }) {
  const toast = useToast();
  const [v, setV] = useState(p.config?.[k] || '');
  const save = async () => { try { await api.put(`/integrations/${p.provider}/config`, { [k]: v }); toast('Configuração salva'); reload(); } catch (e) { toast(e.message, 'err'); } };
  return <Field label={label}><div className="row"><input className="input" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} /><Button size="sm" onClick={save}>Salvar</Button></div></Field>;
}
function MetaMap({ p, clients, reload }) {
  const toast = useToast();
  const accounts = p.config?.accounts || [];
  const [map, setMap] = useState(p.config?.client_map || {});
  const save = async () => { try { await api.put('/integrations/meta/config', { client_map: map }); toast('Contas vinculadas'); reload(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <div>
      <div className="caps xs mb-2">Cliente → conta Instagram</div>
      {!accounts.length && <div className="xs muted">Nenhuma conta profissional encontrada nas Páginas autorizadas.</div>}
      {clients.map((c) => (
        <div key={c.id} className="stx-map-row mb-2"><span className="grow sm clip">{cleanName(c.name)}</span>
          <select className="select" value={map[c.id] || ''} onChange={(e) => setMap({ ...map, [c.id]: e.target.value || undefined })} aria-label={`Conta de ${c.name}`}><option value="">—</option>{accounts.map((a) => <option key={a.ig_user_id} value={a.ig_user_id}>@{a.username}</option>)}</select>
        </div>
      ))}
      <Button size="sm" variant="ink" onClick={save}>Salvar vínculos</Button>
    </div>
  );
}

