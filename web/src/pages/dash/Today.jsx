// "O QUE EU PRECISO FAZER HOJE?" — o topo da Visão geral de toda a equipe (não-CEO).
// Só dados da própria pessoa e dos clientes dela (o servidor filtra). Cada número leva à lista de origem.
import { Link } from 'react-router-dom';
import { cleanName, fmtDateTime } from '../../lib/format.js';
import { FUNCTIONS } from '../../lib/status.js';
import '../../styles/today.css';

const pad = (n) => String(n ?? 0).padStart(2, '0');
const when = (iso) => {
  if (!iso) return 'sem prazo';
  const d = new Date(iso), now = new Date();
  const day = (x) => x.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  if (d < now) return `atrasada · ${fmtDateTime(iso)}`;
  if (day(d) === day(now)) return `hoje · ${d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`;
  return fmtDateTime(iso);
};

export function Today({ t }) {
  if (!t) return null;
  const nothing = !t.overdue && !t.today && !t.next7 && !t.pendencies && !t.inherited;
  return (
    <section className="td" aria-label="O que eu preciso fazer hoje">
      <div className="td-kpis">
        <Link to="/pendencias" className={`td-k ${t.overdue ? 'alert' : 'zero'}`}><b>{pad(t.overdue)}</b><span>Atrasadas</span></Link>
        <Link to="/pendencias" className={`td-k ${t.today ? '' : 'zero'}`}><b>{pad(t.today)}</b><span>Vencem hoje</span></Link>
        <Link to="/calendario" className={`td-k ${t.next7 ? '' : 'zero'}`}><b>{pad(t.next7)}</b><span>Próximos 7 dias</span></Link>
        <Link to="/pendencias" className={`td-k ${t.pendencies ? 'alert-soft' : 'zero'}`}><b>{pad(t.pendencies)}</b><span>Pendências minhas</span></Link>
        {t.inherited > 0 && <Link to="/pendencias" className="td-k info" title="Prazo calculado pela plataforma na importação do Notion: não conta como atraso de ninguém até ser classificado"><b>{pad(t.inherited)}</b><span>Herdados da migração (em revisão)</span></Link>}
        {t.scheduled > 0 && <div className="td-k info" title="Prontas, mas a etapa ainda não abriu: sem atraso até lá"><b>{pad(t.scheduled)}</b><span>Abrem a partir de {new Date(t.scheduled_first).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })}</span></div>}
      </div>

      {t.here && (
        <div className="td-here" aria-label="Você está aqui">
          <div className="td-here-k">Você está aqui</div>
          <div className="td-here-path">
            <Link to={`/clientes/${t.here.client_id}`} className="td-node"><small>Cliente</small><b>{cleanName(t.here.client)}</b></Link>
            <span className="td-arrow" aria-hidden>→</span>
            <Link to={`/conteudos/${t.here.content_id}`} className="td-node"><small>Conteúdo</small><b>{t.here.content}</b></Link>
            <span className="td-arrow" aria-hidden>→</span>
            <div className="td-node now"><small>Etapa atual</small><b>{t.here.current_label}</b></div>
            <span className="td-arrow" aria-hidden>→</span>
            <div className="td-node next"><small>Próxima ação</small><b>{t.here.next}</b>{t.here.next_who && <em>{t.here.next_who}</em>}</div>
          </div>
          <ol className="td-flow" aria-label="Processo">
            {t.here.steps.map((s) => {
              const i = t.here.steps.findIndex((x) => x.key === t.here.current);
              const k = t.here.steps.findIndex((x) => x.key === s.key);
              return <li key={s.key} className={k < i ? 'done' : k === i ? 'on' : ''} title={s.label}><i />{s.label}</li>;
            })}
          </ol>
        </div>
      )}

      <div className="td-cols">
        <div>
          <h3 className="td-h">Fazer agora</h3>
          {nothing ? <p className="td-empty">Nada vencendo agora. As próximas tarefas aparecem aqui quando chegarem perto do prazo.</p> : (
            <ul className="td-list">
              {t.focus.map((x) => (
                <li key={x.id}>
                  <Link to={x.content_id ? `/conteudos/${x.content_id}` : '/pendencias'}>
                    <span className="t">{x.title}</span>
                    <span className={`d ${x.overdue ? 'late' : ''}`}>{cleanName(x.client || '')}{x.client ? ' · ' : ''}{x.inherited ? 'herdado da migração · prazo calculado na importação' : when(x.due_at)}</span>
                  </Link>
                </li>
              ))}
              {t.pendencies_top.filter((p) => !t.focus.some((f) => p.source?.id === f.id)).slice(0, 3).map((p) => (
                <li key={p.id} className="pend"><Link to={`/pendencias?p=${encodeURIComponent(p.id)}`}><span className="t">{p.problem || p.title}</span><span className="d">{cleanName(p.client || '')} · {p.action}</span></Link></li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="td-h">Meus clientes <small>{t.clients.length}</small></h3>
          {!t.clients.length ? <p className="td-empty">Você ainda não está vinculado(a) a nenhum cliente.</p> : (
            <div className="td-clients">{t.clients.map((c) => (
              <Link key={c.id} to={`/clientes/${c.id}`} className="td-client" title={c.functions.map((f) => FUNCTIONS[f] || f).join(', ')}>
                <span>{cleanName(c.name)}</span>{c.open > 0 && <b>{c.open}</b>}
              </Link>
            ))}</div>
          )}
          <h3 className="td-h mt">Não lidas <small>{t.unread}</small></h3>
          {!t.unread_items.length ? <p className="td-empty">Tudo lido.</p> : (
            <ul className="td-list small">{t.unread_items.map((n) => (
              <li key={n.id}><Link to={n.link || '/'}><span className="t">{n.title}{n.count > 1 ? ` ×${n.count}` : ''}</span>{n.body && <span className="d">{n.body}</span>}</Link></li>
            ))}</ul>
          )}
        </div>
      </div>
    </section>
  );
}
