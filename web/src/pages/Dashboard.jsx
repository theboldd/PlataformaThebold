import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi, useAuth } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Stat, Section, Loading, ErrorBox, Empty, Drawer, Status, ContentCard } from '../components/ui.jsx';
import { greeting, firstName, fmtDate, fmtDateTime, money, cleanName, ago, fmtWeekday } from '../lib/format.js';
import { FORMATS } from '../lib/status.js';
import Executive from './dash/Executive.jsx';
import { Meter, MyTasks, ContentRows, PendRows, RiskList, MeetingRows, InsightMini, CopyText, n2 } from './intel/parts.jsx';

const DEAL_STAGE = { lead: 'Lead', contato: 'Contato', qualificacao: 'Qualificação', reuniao: 'Reunião', proposta: 'Proposta', negociacao: 'Negociação', fechado: 'Fechado', onboarding: 'Onboarding', perdido: 'Perdido' };
const QUESTION = {
  ceo: 'Como está a operação da The Bold?', operacoes: 'O que precisa da sua atenção hoje?', revisao: 'O que está esperando o seu olhar?',
  estrategia: 'Como estão os seus clientes?', producao: 'O que você precisa entregar agora?', comercial: 'Onde estão os próximos negócios?',
};

export default function Dashboard() {
  useCrumbs('Visão geral');
  const auth = useAuth();
  const ceo = auth.role.dashboard === 'ceo';
  const { data: d, error, loading, reload } = useApi(ceo ? null : '/dashboard');
  const today = new Date();
  if (ceo) return <div className="page"><Executive /></div>;
  return (
    <div className="page">
      <header className="cover">
        <div className="caps date">{fmtWeekday(today)} · {fmtDate(today, { year: 'numeric' })}</div>
        <h1 className="hello">{greeting()}, <i>{firstName(auth.user.name)}.</i></h1>
        <p className="question">{QUESTION[d?.kind] || QUESTION[auth.role.dashboard] || 'O que você precisa saber e fazer agora?'}</p>
      </header>
      <ErrorBox error={error} />
      {loading && !d ? <Loading rows={6} /> : d && (
        d.kind === 'operacoes' ? <Ops d={d} reload={reload} /> : d.kind === 'revisao' ? <Review d={d} reload={reload} />
          : d.kind === 'estrategia' ? <Strategy d={d} reload={reload} /> : d.kind === 'comercial' ? <Commercial d={d} reload={reload} /> : <Production d={d} reload={reload} />
      )}
    </div>
  );
}

function Ops({ d, reload }) {
  const m = d.metrics;
  return (
    <>
      <div className="hero-stats">
        <Stat value={d.critical_count} label="Pendências críticas" alert={d.critical_count > 0} to={d.attention.length ? '/pendencias' : undefined} />
        <Stat value={d.waiting_client.length} label="Clientes aguardando resposta" hint="conteúdos com o cliente" />
        <Stat value={m.prazos_hoje} label="Prazos hoje" />
        <Stat value={d.unassigned.length} label="Tarefas sem responsável" alert={d.unassigned.length > 0} />
        <Stat value={d.review_count} label="Em revisão" to="/revisao" />
      </div>
      <div className="cols mt-6">
        <div>
          <Section title="Atenção" kicker="Prioridade de hoje" action={d.attention.length ? <Link className="btn btn-sm btn-ghost" to="/pendencias">Todas →</Link> : null}>
            {d.attention.length ? <PendRows items={d.attention} /> : <Empty title="Sem pendências globais visíveis.">O Centro de Pendências é exclusivo de Rebeca e Vitória.</Empty>}
          </Section>
          {d.unassigned.length > 0 && <Section title="Sem responsável" kicker="O fluxo parou aqui"><MyTasks tasks={d.unassigned} reload={reload} /></Section>}
          <Section title="Clientes aguardando" kicker="Aprovações com o cliente"><ContentRows items={d.waiting_client} /></Section>
          <Section title="Equipe aguardando" kicker="Parados há mais de 24h"><ContentRows items={d.waiting_team} show="owner" empty="Nenhum conteúdo parado na equipe." /></Section>
          {d.stalled.length > 0 && <Section title="Processos parados" kicker="Bloqueados"><ContentRows items={d.stalled} /></Section>}
        </div>
        <div>
          <Section title="Agenda de hoje"><MeetingRows items={d.meetings} empty="Nenhuma reunião hoje." /></Section>
          <Section title="Follow-ups" kicker="Régua de cobrança">
            {d.followups.length ? d.followups.map((t) => (
              <div key={t.id} className="erow" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
                <div><div className="t">{t.title}</div><div className="s">{t.assignee_id ? '' : 'sem responsável · '}vence {fmtDateTime(t.due_at)}</div>{t.description && <CopyText text={t.description.replace(/^Texto sugerido \(WhatsApp\):\s*/, '').replace(/^“|”$/g, '')} />}</div>
              </div>
            )) : <Empty title="Nenhum follow-up aberto.">A régua cria follow-ups após 48h sem resposta do cliente.</Empty>}
          </Section>
          <Section title="Fila de agendamento"><ContentRows items={d.scheduling} empty="Nada para agendar." /></Section>
          <Section title="Insights"><InsightMini items={d.insights} /></Section>
          <Section title="Minhas tarefas"><MyTasks tasks={d.my_tasks} reload={reload} /></Section>
        </div>
      </div>
    </>
  );
}

function Review({ d, reload }) {
  return (
    <>
      <div className="hero-stats">
        <Stat value={d.review_queue.length} label="Aguardando revisão" alert={d.review_queue.length > 0} to="/revisao" />
        <Stat value={d.metrics.aguardando_cliente} label="Com os clientes" />
        <Stat value={d.metrics.em_producao} label="Em produção" to="/processos" />
      </div>
      <div className="cols mt-6">
        <div>
          <Section title="Fila de revisão" action={<Link className="btn btn-sm btn-primary" to="/revisao">Abrir Sala de Revisão →</Link>}>
            {d.review_queue.length ? <div className="grid-2">{d.review_queue.map((c) => <ContentCard key={c.id} c={c} />)}</div> : <Empty title="Nada para revisar agora." />}
          </Section>
          <Section title="Minhas tarefas"><MyTasks tasks={d.my_tasks} reload={reload} /></Section>
        </div>
        <div>
          <Section title="Padrões de retrabalho"><InsightMini items={d.insights} /></Section>
          <Section title="Agenda"><MeetingRows items={d.meetings} /></Section>
        </div>
      </div>
    </>
  );
}

function Strategy({ d, reload }) {
  return (
    <>
      <div className="hero-stats">
        <Stat value={d.clients.length} label="Meus clientes" to="/clientes" />
        <Stat value={d.awaiting.length} label="Aguardando cliente" />
        <Stat value={d.adjustments.length} label="Ajustes abertos" alert={d.adjustments.length > 0} />
        <Stat value={d.my_tasks.length} label="Minhas tarefas" />
      </div>
      <div className="cols mt-6">
        <div>
          <Section title="Minhas tarefas"><MyTasks tasks={d.my_tasks} reload={reload} /></Section>
          <Section title="Calendário editorial" kicker="Próximos 21 dias" action={<Link className="btn btn-sm btn-ghost" to="/calendario">Calendário →</Link>}>
            {d.calendar.length ? d.calendar.map((c) => (
              <Link key={c.id} to={`/conteudos/${c.id}`} className="erow link" style={{ gridTemplateColumns: '70px minmax(0,1fr) auto' }} data-cursor="ABRIR">
                <div className="deadline-date">{fmtDate(c.planned_at)}</div>
                <div style={{ minWidth: 0 }}><div className="t clip">{c.title}</div><div className="s">{cleanName(c.client)} · {FORMATS[c.format]}</div></div>
                <div className="r"><Status s={c.status} /></div>
              </Link>
            )) : <Empty title="Sem publicações nos próximos dias." />}
          </Section>
          <Section title="Aguardando cliente"><ContentRows items={d.awaiting} /></Section>
        </div>
        <div>
          <Section title="Meus clientes">
            {d.clients.map((c) => (
              <Link key={c.id} to={`/clientes/${c.id}`} className="erow link" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }} data-cursor="ABRIR">
                <div style={{ minWidth: 0 }}><div className="ed" style={{ fontSize: 22 }}>{cleanName(c.name)}</div><div className="s">{c.next ? `${c.next.content} — ${c.next.text}` : 'Sem próximas ações'}</div></div>
                <div className="r col" style={{ alignItems: 'flex-end' }}><span>{c.counts?.aguardando_cliente || 0} c/ cliente</span><span>{c.counts?.em_producao || 0} em produção</span></div>
              </Link>
            ))}
          </Section>
          <Section title="Ajustes abertos">
            {d.adjustments.length ? d.adjustments.map((a) => (
              <Link key={a.id} to={`/conteudos/${a.content_id}`} className="erow link" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
                <div><div className="t">#{a.number} {a.title}</div><div className="s">{cleanName(a.client)} · {a.origin === 'cliente' ? 'pedido do cliente' : 'ajuste interno'}: {a.description}</div></div>
              </Link>
            )) : <Empty title="Sem ajustes abertos." />}
          </Section>
          <Section title="Comentários de clientes">
            {d.comments.length ? d.comments.map((c) => (
              <Link key={c.id} to={`/conteudos/${c.content_id}`} className="erow link" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
                <div><div className="sm">“{c.body}”</div><div className="s">{c.author_name} · #{c.number} {c.title} · {ago(c.created_at)}</div></div>
              </Link>
            )) : <Empty title="Sem comentários recentes." />}
          </Section>
          <Section title="Materiais aguardados"><ContentRows items={d.materials} empty="Nenhum material pendente." /></Section>
          <Section title="Reuniões"><MeetingRows items={d.meetings} /></Section>
        </div>
      </div>
    </>
  );
}

function Production({ d, reload }) {
  return (
    <>
      <div className="hero-stats">
        <Stat value={d.to_produce.length} label="Para produzir" />
        <Stat value={d.adjustments.length} label="Ajustes" alert={d.adjustments.length > 0} />
        <Stat value={d.blocked.length} label="Bloqueados" alert={d.blocked.length > 0} />
        <Stat value={d.in_review.length} label="Em revisão / com cliente" />
      </div>
      <div className="cols mt-6">
        <div>
          <Section title="Ajustes" kicker="Prioridade — voltaram da revisão ou do cliente"><MyTasks tasks={d.adjustments} reload={reload} empty="Nenhum ajuste pendente." /></Section>
          <Section title="Para produzir" kicker="Envie o arquivo final no conteúdo e a entrega segue sozinha"><MyTasks tasks={d.to_produce} reload={reload} empty="Nenhuma produção pendente." /></Section>
        </div>
        <div>
          <Section title="Bloqueados" kicker="Esperando material ou informação"><ContentRows items={d.blocked} empty="Nada bloqueado." /></Section>
          <Section title="Entregues recentemente" kicker="Em revisão ou com o cliente"><ContentRows items={d.in_review} empty="—" /></Section>
          <Section title="Agenda"><MeetingRows items={d.meetings} /></Section>
        </div>
      </div>
    </>
  );
}

function Commercial({ d, reload }) {
  return (
    <>
      <div className="hero-stats money-stats">
        {d.crm && <Stat value={d.crm.abertos.n} label="Negócios abertos" to="/crm" hint={money(d.crm.abertos.v)} />}
        {d.crm && <Stat value={money(d.crm.ponderado)} label="Pipeline ponderado" to="/crm" />}
        {d.crm && <Stat value={d.crm.followups_vencidos} label="Follow-ups vencidos" alert={d.crm.followups_vencidos > 0} to="/crm" />}
        {d.finance && <Stat value={money(d.finance.atrasado)} label="Em atraso" alert={d.finance.atrasado > 0} to="/financeiro" />}
      </div>
      <div className="cols mt-6">
        <div>
          <Section title="Pipeline" kicker="Próximas ações" action={<Link className="btn btn-sm btn-ghost" to="/crm">CRM →</Link>}>
            {d.deals.length ? d.deals.map((x, i) => (
              <Link key={x.id} to="/crm" className="erow link">
                <span className="n">{n2(i + 1)}</span>
                <div style={{ minWidth: 0 }}><div className="t">{cleanName(x.name)}</div><div className="s">{DEAL_STAGE[x.stage] || x.stage} · {x.owner_name} · {x.next_action}</div></div>
                <div className="r col" style={{ alignItems: 'flex-end' }}><span className="strong">{money(x.value)}</span><span style={x.next_action_at < new Date().toISOString() ? { color: 'var(--err)' } : null}>{fmtDate(x.next_action_at)}</span></div>
              </Link>
            )) : <Empty title="Sem negócios abertos." />}
          </Section>
          <Section title="Minhas tarefas"><MyTasks tasks={d.my_tasks} reload={reload} /></Section>
        </div>
        <div>
          <Section title="Recebíveis" kicker="Abertas e em atraso" action={<Link className="btn btn-sm btn-ghost" to="/financeiro">Financeiro →</Link>}>
            {d.invoices.length ? d.invoices.map((i) => (
              <div key={i.id} className="erow" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                <div style={{ minWidth: 0 }}><div className="t clip">{cleanName(i.client_name)}</div><div className="s">{i.description}</div></div>
                <div className="r col" style={{ alignItems: 'flex-end' }}><span className="strong">{money(i.amount)}</span><span style={i.status === 'atrasada' ? { color: 'var(--err)' } : null}>{i.status === 'atrasada' ? 'atrasada · ' : ''}{fmtDate(i.due_at)}</span></div>
              </div>
            )) : <Empty title="Nada a receber." />}
          </Section>
          <Section title="Agenda"><MeetingRows items={d.meetings} /></Section>
        </div>
      </div>
    </>
  );
}
