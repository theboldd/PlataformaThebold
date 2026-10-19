// VISÃO GERAL · CEO — feita para ser escaneada, não lida.
// Ordem: está tudo bem? → indicadores → o que precisa da sua atenção → agenda e tarefas → operação e inteligência → resumos.
// O detalhe de cada bloco mora no módulo correspondente (Pendências, Processos, Torre, Calendário, Financeiro).
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/hooks.js';
import { Drawer } from '../../components/ui.jsx';
import { I } from '../../components/Icons.jsx';
import { RiskList } from '../intel/parts.jsx';
import { cleanName, fmtDate, money } from '../../lib/format.js';
import '../../styles/exec.css';

const pad = (n) => String(n).padStart(2, '0');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const PROD = 'producao,analise_producao,ajuste_interno,ajuste_cliente,revisao_ajuste';
const WAIT = 'aprovacao_tema,aprovacao_cliente';
const STATE = { ok: 'Em dia', atencao: 'Atenção', critico: 'Crítico' };

// Números entram contando (respeita "reduzir movimento")
function useCount(target) {
  const [v, setV] = useState(target);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !target) { setV(target); from.current = target; return; }
    const start = performance.now(), a = from.current, dur = 700;
    let raf;
    const step = (t) => { const p = Math.min(1, (t - start) / dur); setV(Math.round(a + (target - a) * (1 - (1 - p) ** 3))); if (p < 1) raf = requestAnimationFrame(step); else from.current = target; };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

function Kpi({ n, label, aux, alert, to, onClick }) {
  const v = useCount(n);
  const body = (
    <>
      <span className={`ex-kpi-n num ${alert ? 'alert' : ''}`}>{pad(v)}</span>
      <span className="ex-kpi-l">{label}</span>
      <span className="ex-kpi-a">{aux}</span>
    </>
  );
  return to ? <Link className="ex-kpi" to={to} data-cursor="ABRIR">{body}</Link> : <button type="button" className="ex-kpi" onClick={onClick} data-cursor="VER">{body}</button>;
}

function Head({ title, kicker, action }) {
  return (
    <div className="ex-head">
      <div>{kicker && <div className="ex-kicker">{kicker}</div>}<h2 className="ex-title">{title}</h2></div>
      {action}
    </div>
  );
}
const More = ({ to, children }) => <Link className="ex-more" to={to}>{children} <I.arrow size={14} /></Link>;

export default function Executive({ d }) {
  const auth = useAuth();
  const e = d.exec;
  const [riskOpen, setRiskOpen] = useState(false);
  const k = e.kpis;
  const stateLabel = STATE[e.state];
  const maxOp = Math.max(1, ...e.operation.map((s) => s.n));

  return (
    <div className="ex">
      {/* ESTÁ TUDO BEM? */}
      <section className={`ex-state s-${e.state}`} aria-live="polite">
        <span className="ex-state-tag"><span className={`ex-dot d-${e.state}`} aria-hidden /> {stateLabel}</span>
        <p className="ex-state-t">{e.headline}</p>
        <p className="ex-base">
          {plural(e.base.total, 'cliente na base', 'clientes na base')}
          {e.base.ativos ? ` · ${plural(e.base.ativos, 'ativo', 'ativos')}` : ''}
          {e.base.onboarding ? ` · ${e.base.onboarding} em onboarding` : ''}
          {e.base.a_confirmar ? ` · ${e.base.a_confirmar} com status a confirmar` : ''}
          {` · ${e.base.com_conteudo ? plural(e.base.com_conteudo, 'com conteúdo no processo', 'com conteúdo no processo') : 'nenhum com conteúdo no processo ainda'}`}
          {' · '}<Link className="ex-inline" to="/clientes">ver clientes</Link>
        </p>
      </section>

      {/* INDICADORES EXECUTIVOS */}
      <section className="ex-kpis" aria-label="Indicadores executivos">
        <Kpi n={k.risk.n} label="Clientes em risco" alert={k.risk.n > 0} onClick={() => setRiskOpen(true)}
          aux={k.risk.n ? (k.risk.critico ? `${k.risk.critico} em risco crítico` : 'risco alto · ver motivos') : 'nenhum cliente em risco'} />
        <Kpi n={k.critical.n} label="Pendências críticas" alert={k.critical.n > 0} to="/pendencias?sev=critica"
          aux={k.critical.n ? (k.critical.vencidas ? plural(k.critical.vencidas, 'vencida', 'vencidas') : 'nenhuma vencida') : 'nada travando a operação'} />
        <Kpi n={k.producao.n} label="Em produção" to={`/processos?stage=${PROD}`}
          aux={k.producao.n ? (k.producao.atrasados ? `${k.producao.atrasados} com prazo vencido` : 'todos no prazo') : 'nenhum conteúdo em produção'} />
        <Kpi n={k.aguardando.n} label="Aguardando cliente" alert={k.aguardando.mais_48h > 0} to={`/processos?stage=${WAIT}`}
          aux={k.aguardando.n ? (k.aguardando.mais_48h ? `${k.aguardando.mais_48h} há mais de 48h` : 'todos há menos de 48h') : 'nenhuma aprovação pendente'} />
      </section>

      <div className="ex-grid">
        {/* PRECISA DA SUA ATENÇÃO */}
        <section className="ex-att" aria-labelledby="ex-att-t">
          <Head kicker={e.attention_total ? `${pad(e.attention_total)} ${e.attention_total === 1 ? 'item' : 'itens'}` : 'Prioridade'} title={<span id="ex-att-t">Precisa da sua atenção</span>} />
          {!e.attention.length ? (
            <p className="ex-empty">Nada exige sua atenção agora.</p>
          ) : (
            <ol className="ex-att-list">
              {e.attention.map((a, i) => (
                <li key={a.id}>
                  <Link to={a.action.to} className={`ex-att-item l-${a.level}`} data-cursor="ABRIR">
                    <span className="ex-att-n num">{pad(i + 1)}</span>
                    <span className="ex-att-body">
                      <span className="ex-att-meta"><span className="ex-prio"><span className={`ex-dot d-${a.level}`} aria-hidden /> {a.level === 'critico' ? 'Crítico' : 'Atenção'}</span>{a.client && <span className="ex-att-client">{cleanName(a.client)}</span>}</span>
                      <span className="ex-att-p">{a.problem}{a.late ? <span className="ex-late"> · há {a.late}</span> : null}</span>
                      {(a.context || a.who) && <span className="ex-att-c">{a.context}{a.context && a.who ? ' · ' : ''}{a.who ? `Responsável: ${a.who}` : ''}</span>}
                    </span>
                    <span className="ex-att-go">{a.action.label} <I.arrow size={14} /></span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          {e.attention_total > e.attention.length && <p className="ex-note">+ {plural(e.attention_total - e.attention.length, 'item', 'itens')} no Centro de Pendências e nas decisões da migração.</p>}
          <div className="ex-foot"><More to="/pendencias">Ver todas as pendências</More>{e.migration_open > 0 && <More to="/migracao">Decisões da migração · {e.migration_open}</More>}</div>
        </section>

        <div className="ex-side">
        {/* PRÓXIMOS COMPROMISSOS */}
        <section className="ex-agenda" aria-labelledby="ex-ag-t">
          <Head title={<span id="ex-ag-t">Próximos compromissos</span>} />
          {e.agenda.items.length ? (
            <ul className="ex-ag-list">
              {e.agenda.items.map((m) => {
                const dt = new Date(m.starts_at);
                const today = dt.toDateString() === new Date().toDateString();
                return (
                  <li key={m.id}>
                    <Link to={`/reunioes?m=${m.id}`} className="ex-ag-item">
                      <span className="ex-ag-time num">{dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}{!today && <small> · {fmtDate(m.starts_at)}</small>}</span>
                      <span className="ex-ag-t">{m.client ? cleanName(m.client) : m.title}</span>
                      <span className="ex-ag-s">{m.client ? m.title : m.kind === 'interna' ? 'Interna' : 'Reunião'}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="ex-empty-sm">
              <p>Nenhuma reunião marcada na plataforma.</p>
              {e.agenda.google.status !== 'conectado' && <p className="ex-note">Google Agenda ainda não conectada — compromissos de lá não aparecem aqui. <Link className="ex-inline" to="/integracoes">Conectar</Link></p>}
            </div>
          )}
          <div className="ex-foot"><More to="/calendario">Ver calendário</More></div>
        </section>

        {/* SUA ATENÇÃO */}
        <section className="ex-focus" aria-labelledby="ex-fo-t">
          <Head title={<span id="ex-fo-t">Sua atenção</span>} kicker={e.my_total ? plural(e.my_total, 'tarefa sua', 'tarefas suas') : null} />
          {e.my_focus.length ? (
            <ol className="ex-focus-list">
              {e.my_focus.map((t, i) => {
                const late = t.due_at && t.due_at < new Date().toISOString();
                return (
                  <li key={t.id}>
                    <Link to={t.content_id ? `/conteudos/${t.content_id}` : t.client_id ? `/clientes/${t.client_id}` : '/processos'} className="ex-focus-item">
                      <span className="ex-att-n num">{pad(i + 1)}</span>
                      <span><span className="ex-focus-t">{t.title}</span><span className={`ex-focus-d ${late ? 'late' : ''}`}>{t.due_at ? `${late ? 'Venceu' : 'Até'} ${fmtDate(t.due_at)}` : 'Sem prazo'}{t.client ? ` · ${cleanName(t.client)}` : ''}</span></span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : <p className="ex-empty-sm">Nenhuma ação crítica no momento.</p>}
          {e.my_total > 0 && <div className="ex-foot"><More to={`/processos?assignee_id=${auth.user.id}`}>Ver todas</More></div>}
        </section>

        </div>

        {/* OPERAÇÃO */}
        <section className="ex-op" aria-labelledby="ex-op-t">
          <Head kicker="Onde estão os conteúdos agora?" title={<span id="ex-op-t">Operação</span>} />
          {e.operation.length ? (
            <ul className="ex-bars">
              {e.operation.map((s) => (
                <li key={s.stage}>
                  <Link to={`/processos?stage=${s.stage}`} className="ex-bar" aria-label={`${s.label}: ${plural(s.n, 'conteúdo', 'conteúdos')}${s.blocked ? `, ${plural(s.blocked, 'bloqueado', 'bloqueados')}` : ''}`}>
                    <span className="ex-bar-l">{s.label}</span>
                    <span className="ex-bar-track" aria-hidden><span style={{ '--w': `${(s.n / maxOp) * 100}%` }} /></span>
                    <span className="ex-bar-n num">{s.n}{s.blocked ? <small> · {s.blocked} bloq.</small> : null}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="ex-empty-sm">
              <p>Nenhum conteúdo no processo ainda.</p>
              <p className="ex-note">Os calendários editoriais não entraram na migração do Notion; o primeiro ciclo de cada cliente começa no quadro de Processos.</p>
            </div>
          )}
          <div className="ex-foot"><More to="/processos">Abrir processos</More></div>
        </section>

        {/* INTELIGÊNCIA THE BOLD */}
        <section className="ex-intel" aria-labelledby="ex-in-t">
          <Head kicker={e.intel_total ? Object.entries(e.intel_summary).map(([kk, n]) => `${pad(n)} ${kk.toLowerCase()}`).join(' · ') : 'Leitura da operação'} title={<span id="ex-in-t">Inteligência The Bold</span>} />
          {e.intel.length ? (
            <ul className="ex-intel-list">
              {e.intel.map((x) => (
                <li key={x.id}>
                  <div className="ex-intel-k">{x.kind}</div>
                  <p className="ex-intel-t">{x.text}</p>
                  {x.detail && <p className="ex-intel-d">{x.detail}</p>}
                  <Link className="ex-more" to={x.action.to}>{x.action.label} <I.arrow size={14} /></Link>
                </li>
              ))}
            </ul>
          ) : <p className="ex-empty-sm">Nenhum padrão relevante nos dados de hoje. Gargalos, tendências e riscos aparecem aqui quando a operação der sinal.</p>}
          {e.intel_total > e.intel.length && <div className="ex-foot"><More to="/insights">Ver todas as leituras · {e.intel_total}</More></div>}
        </section>
      </div>

      {/* RESUMOS COMPLEMENTARES */}
      <section className="ex-strip" aria-label="Resumos">
        {e.finance && (
          <div className="ex-mini">
            <div className="ex-kicker">Financeiro</div>
            {e.finance.has_data ? (
              <div className="ex-mini-nums">
                <div><span className="ex-mini-n num">{money(e.finance.recebido_mes)}</span><span className="ex-mini-l">Recebido no mês</span></div>
                <div><span className={`ex-mini-n num ${e.finance.atrasado ? 'alert' : ''}`}>{money(e.finance.em_aberto + e.finance.atrasado)}</span><span className="ex-mini-l">Em aberto{e.finance.atrasado ? ` · ${money(e.finance.atrasado)} em atraso` : ''}</span></div>
              </div>
            ) : <p className="ex-empty-sm">Nenhum contrato ou fatura cadastrado ainda.</p>}
            <More to="/financeiro">Ver financeiro</More>
          </div>
        )}
        <div className="ex-mini">
          <div className="ex-kicker">Capacidade da equipe</div>
          {e.capacity.open ? (
            <p className="ex-mini-p">{e.capacity.acima.length ? `${plural(e.capacity.acima.length, 'pessoa acima', 'pessoas acima')} da capacidade (${e.capacity.acima.join(', ')})` : 'Ninguém acima da capacidade'} · {e.capacity.disponiveis} com disponibilidade</p>
          ) : <p className="ex-empty-sm">Sem tarefas abertas na equipe ainda.</p>}
          <More to="/torre?tab=pessoas">Ver capacidade</More>
        </div>
        <div className="ex-mini">
          <div className="ex-kicker">Torre de Controle</div>
          <p className="ex-mini-p">Todos os clientes, prazos, gargalos, pessoas e indicadores da operação.</p>
          <More to="/torre">Abrir a Torre</More>
        </div>
      </section>

      {riskOpen && (
        <Drawer open onClose={() => setRiskOpen(false)} title="Clientes em risco" kicker={plural(k.risk.n, 'cliente', 'clientes')}>
          <RiskList risks={e.risks} />
          <Link className="btn btn-sm btn-ghost mt-5" to="/torre?tab=riscos">Ver na Torre de Controle →</Link>
        </Drawer>
      )}
    </div>
  );
}
