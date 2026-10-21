import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import '../styles/admin.css';
import { LoadError } from './admin/Guard.jsx';
import { api } from '../lib/api.js';
import { useApi, useAuth, useToast } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Button, ErrorBox, Field, Loading, PageHead } from '../components/ui.jsx';
import { ago, cleanName, fmtDateTime } from '../lib/format.js';
import { StateTag } from '../components/State.jsx';

const PILL = { conectado: 'Conectado', desconectado: 'Desconectado', erro: 'Erro', token_expirado: 'Token expirado', planejado: 'Especificado' };
const NOTES = {
  google_calendar: 'Reuniões criadas na plataforma viram eventos com convidados; a reserva de horário verifica conflitos (free/busy). Eventos externos aparecem no Calendário.',
  meta: 'A API oficial do Instagram não oferece agendamento nativo: a The Bold OS guarda o horário e publica no momento certo (imagem, carrossel até 10 itens, reels). A Meta busca a mídia por link público temporário — requer PUBLIC_BASE_URL. Sem conexão, use “marcar como agendado externamente”.',
  slack: 'Ponte de transição: espelha avisos-chave (ex.: #aprovações) enquanto a comunicação migra para o THE BOLD CHAT.',
  google_drive: 'Especificação pronta em docs/integracoes/google-drive.md — implementação aguardando a decisão Workspace × Gmail (define o escopo OAuth).',
  anthropic: 'Usada pelo The Bold Brain e agentes. A chave fica só no servidor; sem ela, a IA aparece como “não configurada” — nada é simulado.',
};

export default function Integracoes() {
  useCrumbs('Integrações');
  const { data, error, loading, reload } = useApi('/integrations');
  const prod = useApi('/produto/integracoes');
  const st = Object.fromEntries((prod.data?.items || []).map((i) => [i.key, i]));
  const [sp, setSp] = useSearchParams();
  const toast = useToast();
  useEffect(() => {
    if (sp.get('ok')) { toast(`Integração conectada: ${sp.get('ok')}`); setSp({}, { replace: true }); }
    if (sp.get('erro')) { toast(`Falha na conexão: ${sp.get('erro')}`, 'err'); setSp({}, { replace: true }); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (loading && !data) return <div className="page"><Loading /></div>;
  if (error) return <LoadError error={error} />;
  return (
    <div className="page">
      <PageHead kicker="Sistema" title="Integrações" sub="Conexões reais via OAuth. Status honesto: nada aparece como conectado sem estar. Tokens ficam criptografados no servidor e nunca são exibidos." />
      {!data.public_base_url && <p className="note mb-5">PUBLIC_BASE_URL não está configurado no servidor: callbacks OAuth usam localhost e a publicação via Meta fica indisponível.</p>}
      <div className="row wrap gap-2 mb-5" aria-label="Legenda">{['conectada', 'nao_conectada', 'aguardando_configuracao', 'erro'].map((k) => <StateTag key={k} s={k} />)}</div>
      <div className="integ">
        {data.providers.map((p) => <Card key={p.provider} p={p} state={st[p.provider]?.state} clients={data.clients} reload={reload} />)}
        {(prod.data?.items || []).filter((i) => !data.providers.some((p) => p.provider === i.key)).map((i) => <Extra key={i.key} i={i} />)}
      </div>
    </div>
  );
}

// Conexões que não são OAuth próprio: Meet (vem do Google Calendar), Resend (chave), Notion (só importação histórica), hospedagem
function Extra({ i }) {
  return (
    <article className="integ-card">
      <div className="row between"><h2 className="ed-md">{i.label}</h2><StateTag s={i.state}>{i.key === 'infra' && i.state === 'aguardando_decisao' ? 'Prévia · aguardando decisão' : undefined}</StateTag></div>
      <p className="sm muted" style={{ margin: 0 }}>{i.docs}</p>
      {i.depends && <div className="xs faint">Depende de: {i.depends}</div>}
      {i.imported_at && <div className="xs faint">Última extração: {fmtDateTime(i.imported_at)}</div>}
      {i.env && <div><div className="caps mb-2">Credenciais no servidor</div><div className="envs">{i.env.map((e) => <code key={e} className={i.state === 'conectada' ? 'ok' : ''}>{i.state === 'conectada' ? '✓' : '○'} {e}</code>)}</div></div>}
      {i.key === 'infra' && <div className="envs"><code className={i.cron ? 'ok' : ''}>{i.cron ? '✓' : '○'} CRON_SECRET</code><code className={i.base_url ? 'ok' : ''}>{i.base_url ? '✓' : '○'} PUBLIC_BASE_URL</code></div>}
    </article>
  );
}

function Card({ p, state, clients, reload }) {
  const auth = useAuth();
  const toast = useToast();
  const admin = auth.can('integracoes', 'admin');
  const [busy, setBusy] = useState(false);
  const status = p.provider === 'google_drive' && p.status === 'desconectado' ? 'planejado' : p.status;
  const oauth = ['google_calendar', 'meta', 'slack'].includes(p.provider);
  const connect = async () => {
    setBusy(true);
    try { const r = await api.post(`/integrations/${p.provider}/connect`); window.location.href = r.url; }
    catch (e) { toast(e.status === 412 ? `Servidor sem credenciais: defina ${p.env.join(', ')}` : e.message, 'err'); setBusy(false); }
  };
  const disconnect = async () => { if (!confirm(`Desconectar ${p.label}?`)) return; try { await api.post(`/integrations/${p.provider}/disconnect`); toast('Desconectado'); reload(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <article className="integ-card">
      <div className="row between"><h2 className="ed-md">{p.label}</h2>{state ? <StateTag s={p.provider === 'google_drive' && state !== 'conectada' ? 'aguardando_decisao' : state} /> : <span className={`pill ${status}`}>{PILL[status] || status}</span>}</div>
      {p.account && <div className="sm"><span className="muted">Conta:</span> {p.account}</div>}
      {p.updated_at && <div className="xs faint">Atualizado {ago(p.updated_at)}</div>}
      {p.last_error && <div className="sm" style={{ color: 'var(--err)' }}>Último erro: {p.last_error}</div>}
      <p className="sm muted" style={{ margin: 0 }}>{NOTES[p.provider]}</p>
      <div><div className="caps mb-2">Credenciais no servidor</div><div className="envs">{p.env.map((e) => <code key={e} className={p.configured ? 'ok' : ''}>{p.configured ? '✓' : '○'} {e}</code>)}</div>{!p.configured && <div className="xs faint mt-2">Não configurado — {p.docs}</div>}</div>
      {admin && oauth && (
        <div className="row wrap">
          {p.status === 'conectado' ? <Button size="sm" variant="danger" onClick={disconnect}>Desconectar</Button> : <Button size="sm" variant="primary" disabled={busy} onClick={connect}>{p.status === 'token_expirado' || p.status === 'erro' ? 'Reconectar' : 'Conectar'}</Button>}
        </div>
      )}
      {admin && p.provider === 'meta' && p.status === 'conectado' && <MetaMap p={p} clients={clients} reload={reload} />}
      {admin && p.provider === 'slack' && p.status === 'conectado' && <ConfigInput p={p} k="mirror_channel" label="Canal de espelho (ID do Slack)" placeholder="C0123456789" reload={reload} />}
      {admin && p.provider === 'google_calendar' && p.status === 'conectado' && <ConfigInput p={p} k="calendar_id" label="Agenda (ID)" placeholder="primary" reload={reload} />}
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
      <div className="caps mb-2">Cliente → conta Instagram</div>
      {!accounts.length && <div className="xs muted">Nenhuma conta profissional encontrada nas Páginas autorizadas.</div>}
      {clients.map((c) => (
        <div key={c.id} className="row mb-2"><span className="grow sm clip">{cleanName(c.name)}</span>
          <select className="select" style={{ width: 200 }} value={map[c.id] || ''} onChange={(e) => setMap({ ...map, [c.id]: e.target.value || undefined })} aria-label={`Conta de ${c.name}`}><option value="">—</option>{accounts.map((a) => <option key={a.ig_user_id} value={a.ig_user_id}>@{a.username}</option>)}</select>
        </div>
      ))}
      <Button size="sm" variant="ink" onClick={save}>Salvar vínculos</Button>
    </div>
  );
}
