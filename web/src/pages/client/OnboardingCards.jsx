// CARDS DE ONBOARDING: o formulário oficial por cliente e por seção, com a origem das respostas (Notion × plataforma).
// Só mostra o que está gravado. Onboarding parcial fica parcial; o que falta, o cliente completa pela plataforma.
import { Link } from 'react-router-dom';
import { useApi } from '../../lib/hooks.js';
import { Loading, ErrorBox, Empty } from '../../components/ui.jsx';
import { cleanName, fmtDate } from '../../lib/format.js';
import '../../styles/onboarding-cards.css';

export const FORM_STATUS = { nao_iniciado: 'Não iniciado', em_andamento: 'Em preenchimento pelo cliente', migrado_parcial: 'Migrado do Notion (parcial)', concluido: 'Concluído' };

export function SectionCards({ card }) {
  if (!card) return null;
  return (
    <div className="obc-sections">
      {card.sections.map((s) => (
        <div key={s.title} className={`obc-sec ${s.answered === s.total ? 'full' : s.answered ? 'part' : 'none'}`}>
          <span className="t">{s.title}</span>
          <b>{s.answered}<small>/{s.total}</small></b>
          <span className="bar" aria-hidden><i style={{ width: `${(s.answered / s.total) * 100}%` }} /></span>
          <small className="muted">{s.answered ? `${s.from_notion === s.answered ? 'tudo' : s.from_notion} do Notion${s.answered - s.from_notion ? ` · ${s.answered - s.from_notion} pela plataforma` : ''}` : 'nada respondido'}</small>
        </div>
      ))}
    </div>
  );
}

export function ClientOnboardingCard({ clientId }) {
  const { data, error, loading } = useApi(`/clients/${clientId}/onboarding-card`, [clientId], { live: false });
  if (error) return <ErrorBox error={error} />;
  if (loading || !data) return <Loading rows={2} />;
  return (
    <section className="mb-5">
      <div className="section-head"><h3 className="ed-md">Formulário por seção</h3><span className="xs faint">{data.answered}/{data.total} respostas · {data.from_notion} migradas do Notion · {data.from_platform} pela plataforma</span></div>
      <SectionCards card={data} />
    </section>
  );
}

export default function OnboardingBoard() {
  const { data, error, loading } = useApi('/onboarding/cards', [], { live: false });
  if (error) return <ErrorBox error={error} />;
  if (loading || !data) return <Loading rows={6} />;
  if (!data.length) return <Empty title="Nenhum cliente." />;
  const cols = ['nao_iniciado', 'migrado_parcial', 'em_andamento', 'concluido'];
  return (
    <div className="obc-board">
      {cols.map((k) => {
        const list = data.filter((c) => c.form_status === k).sort((a, b) => b.answered / b.total - a.answered / a.total);
        return (
          <section key={k} className="obc-col" aria-label={FORM_STATUS[k]}>
            <header><h3>{FORM_STATUS[k]}</h3><span>{list.length}</span></header>
            {!list.length ? <p className="xs faint">Nenhum cliente.</p> : list.map((c) => (
              <Link key={c.client.id} to={`/clientes/${c.client.id}?tab=onboarding`} className="obc-card">
                <b>{cleanName(c.client.name)}</b>
                <div className="obc-n"><span>{c.answered}<small>/{c.total}</small></span><span className="bar" aria-hidden><i style={{ width: `${(c.answered / c.total) * 100}%` }} /></span></div>
                <div className="obc-m">
                  <span>{c.missing ? `${c.missing} pergunta(s) sem resposta` : 'formulário completo'}</span>
                  {c.from_notion > 0 && <span className="obc-origin">Migrado do Notion · {c.from_notion}</span>}
                  {c.from_platform > 0 && <span>{c.from_platform} pela plataforma</span>}
                  {c.items.pending > 0 && <span>{c.items.pending} item(ns) pendente(s){c.items.client_pending ? ` · ${c.items.client_pending} com o cliente` : ''}</span>}
                  {c.last_answer_at && <span className="muted">última resposta {fmtDate(c.last_answer_at)}</span>}
                </div>
              </Link>
            ))}
          </section>
        );
      })}
    </div>
  );
}
