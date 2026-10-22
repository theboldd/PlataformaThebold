// Abas do dossiê que só reúnem o que já existe em outras telas, filtrado pelo cliente.
import { Link } from 'react-router-dom';
import { useApi } from '../../lib/hooks.js';
import { ago, fmtDateTime } from '../../lib/format.js';
import { Empty, ErrorBox, Loading } from '../../components/ui.jsx';
import { StateBadge, StateNotice } from '../../components/State.jsx';

const SEV1 = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' };

export function PendenciesTab({ clientId }) {
  const { data, error } = useApi(`/pendencias/cliente/${clientId}`);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading rows={3} />;
  return (
    <div className="col gap-3">
      <p className="sm muted" style={{ margin: 0 }}>
        Pendências derivadas do estado real deste cliente (tarefas, bloqueios, onboarding, faturas). {data.scope === 'minhas' ? 'Você vê só as que dependem de você.' : 'Visão da equipe.'}
      </p>
      {!data.items.length ? <Empty title="Nenhuma pendência deste cliente agora.">Quando algo travar, aparece aqui e na Central de Pendências.</Empty> : (
        <ul className="cx-list">
          {data.items.map((p) => (
            <li key={p.id} className={`cx-item s-${p.severity}`}>
              <div className="cx-row"><span className="caps">{SEV1[p.severity]} · {p.cause_label}</span>{p.late && <span className="xs" style={{ color: 'var(--primary-text)' }}>há {p.late}</span>}</div>
              <div className="cx-t">{p.problem || p.title}</div>
              <div className="xs muted">Quem age: {p.who || '—'} · Próxima ação: {p.next || p.action || '—'}{p.due ? ` · até ${fmtDateTime(p.due)}` : ''}</div>
              <Link className="link xs" to={`/pendencias?p=${encodeURIComponent(p.id)}`}>Abrir pendência →</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CommunicationTab({ clientId }) {
  const { data, error } = useApi('/chat/channels');
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading rows={3} />;
  const chans = data.filter((c) => c.client_id === clientId);
  return (
    <div className="col gap-3">
      <p className="sm muted" style={{ margin: 0 }}>Conversas deste cliente no Bold Chat. A conversa oficial é visível ao cliente no portal (Mensagens).</p>
      {!chans.length ? <StateNotice s="dados_insuficientes" title="Conversa com o cliente">Nenhum canal deste cliente ainda.</StateNotice> : (
        <ul className="cx-list">
          {chans.map((c) => (
            <li key={c.id} className="cx-item">
              <div className="cx-row"><span className="cx-t">{c.name}</span>{c.kind === 'cliente' ? <StateBadge s="ativo" label="Visível ao cliente" /> : <StateBadge s="somente_leitura" label="Interno" />}</div>
              <div className="xs muted">{c.last ? `Última mensagem: ${c.last.name} · ${ago(c.last.created_at)} — “${String(c.last.body || '').slice(0, 120)}”` : 'Nenhuma mensagem ainda.'}{c.unread ? ` · ${c.unread} não lida(s)` : ''}</div>
              <Link className="link xs" to={`/comunicacao/${c.id}`}>Abrir conversa →</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
