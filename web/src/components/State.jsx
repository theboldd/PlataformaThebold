// ESTADOS DO PRODUTO — o mesmo vocabulário em todas as telas. Uma área definida nunca some por falta de dado, chave ou decisão:
// ela aparece com o estado honesto e com o que falta para ativar. Nada aqui simula funcionamento.
import { Link } from 'react-router-dom';

export const STATES = {
  ativo: { label: 'Ativo', tone: 'ok' },
  conectada: { label: 'Conectada', tone: 'ok' },
  dados_insuficientes: { label: 'Dados insuficientes', tone: 'mute' },
  aguardando_configuracao: { label: 'Aguardando configuração', tone: 'warn' },
  aguardando_integracao: { label: 'Aguardando integração', tone: 'warn' },
  aguardando_conexao: { label: 'Aguardando conexão', tone: 'warn' },
  aguardando_decisao: { label: 'Aguardando decisão', tone: 'info' },
  em_desenvolvimento: { label: 'Em desenvolvimento', tone: 'dev' },
  bloqueado: { label: 'Bloqueado por dependência', tone: 'err' },
  nao_conectada: { label: 'Não conectada', tone: 'mute' },
  erro: { label: 'Erro', tone: 'err' },
  desligada: { label: 'Desligada', tone: 'mute' },
};

export const StateTag = ({ s, children }) => {
  const st = STATES[s] || { label: s, tone: 'mute' };
  return <span className={`state-tag st-${st.tone}`}><i aria-hidden />{children || st.label}</span>;
};

// Bloco de uma área: estado + para que serve + o que falta para ativar + ação (quando houver)
export function StatePanel({ s, kicker, title, children, missing, action, to, compact }) {
  return (
    <div className={`state-panel ${compact ? 'compact' : ''}`} data-state={s}>
      <div className="state-panel-top">{kicker && <span className="caps">{kicker}</span>}<StateTag s={s} /></div>
      {title && <h3 className="state-panel-title">{title}</h3>}
      {children && <div className="state-panel-body">{children}</div>}
      {missing && <p className="state-panel-missing"><b>Para ativar:</b> {missing}</p>}
      {(action || to) && <div className="state-panel-act">{to ? <Link to={to} className="btn btn-sm">{action || 'Abrir'}</Link> : action}</div>}
    </div>
  );
}

// Número que pode não existir ainda: mostra o valor real ou "dados insuficientes" — nunca um zero inventado
export const Metric = ({ label, value, hint, s }) => (
  <div className="metric">
    <span className="metric-l">{label}</span>
    {s && s !== 'ativo' ? <StateTag s={s} /> : <span className="metric-v num">{typeof value === 'number' ? String(value).padStart(2, '0') : value ?? '—'}</span>}
    {hint && <span className="metric-h">{hint}</span>}
  </div>
);

// ── Faixas, selos e blocos "dados insuficientes" (mesmo vocabulário, em caixa alta) ──

export const STATE_LABELS = {
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
  return <span className={`st-badge st-${TONE[s] || 'muted'}`}><i aria-hidden />{label || STATE_LABELS[s] || s}</span>;
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
