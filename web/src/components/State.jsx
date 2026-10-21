// Estados honestos de produto: a área existe mesmo quando ainda não pode funcionar.
// Nunca simula dado nem conexão — só diz em que estado a funcionalidade está e o que falta para ativá-la.
import { Link } from 'react-router-dom';

export const STATES = {
  ativo: 'ATIVO',
  conectada: 'CONECTADA',
  nao_conectada: 'NÃO CONECTADA',
  erro: 'ERRO',
  dados_insuficientes: 'DADOS INSUFICIENTES',
  aguardando_configuracao: 'AGUARDANDO CONFIGURAÇÃO',
  aguardando_integracao: 'AGUARDANDO INTEGRAÇÃO',
  aguardando_conexao: 'AGUARDANDO CONEXÃO',
  aguardando_decisao: 'AGUARDANDO DECISÃO',
  em_desenvolvimento: 'EM DESENVOLVIMENTO',
  bloqueado: 'BLOQUEADO POR DEPENDÊNCIA',
  somente_leitura: 'SOMENTE LEITURA',
};
const TONE = {
  ativo: 'ok', conectada: 'ok', somente_leitura: 'info',
  erro: 'err', nao_conectada: 'warn',
  dados_insuficientes: 'muted', aguardando_configuracao: 'warn', aguardando_integracao: 'warn', aguardando_conexao: 'warn',
  aguardando_decisao: 'info', em_desenvolvimento: 'dev', bloqueado: 'err',
};

export function StateBadge({ s, label }) {
  return <span className={`st-badge st-${TONE[s] || 'muted'}`}><i aria-hidden />{label || STATES[s] || s}</span>;
}

// Faixa de estado: nome da funcionalidade + estado + o que falta + ação (quando existir).
export function StateNotice({ s, title, children, action, to, onAction, compact }) {
  return (
    <div className={`st-notice st-${TONE[s] || 'muted'} ${compact ? 'compact' : ''}`} role="status">
      <div className="st-notice-h">{title && <span className="st-notice-t">{title}</span>}<StateBadge s={s} /></div>
      {children && <div className="st-notice-b">{children}</div>}
      {action && (to ? <Link to={to} className="st-notice-a">{action} →</Link> : onAction ? <button type="button" className="st-notice-a" onClick={onAction}>{action} →</button> : null)}
    </div>
  );
}

// Estrutura de uma área ainda sem dados: mostra o que ela vai medir, sem inventar números.
export function Insufficient({ title = 'DADOS INSUFICIENTES', items, children }) {
  return (
    <div className="st-insufficient">
      <StateBadge s="dados_insuficientes" label={title} />
      {children && <p className="sm muted" style={{ margin: '10px 0 0' }}>{children}</p>}
      {items?.length > 0 && <ul className="st-list">{items.map((i) => <li key={i}><span aria-hidden>—</span> {i}</li>)}</ul>}
    </div>
  );
}
