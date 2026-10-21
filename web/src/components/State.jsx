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
