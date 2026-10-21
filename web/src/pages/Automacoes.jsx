import { useEffect, useState } from 'react';
import '../styles/admin.css';
import { api } from '../lib/api.js';
import { useApi, useAuth, useToast } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Button, Empty, ErrorBox, Loading, PageHead, Section, Seg, Stat, Tabs, Tag } from '../components/ui.jsx';
import { ago, fmtDateTime, cleanName } from '../lib/format.js';
import { useUrlState } from '../lib/nav.jsx';
import { StateTag } from '../components/State.jsx';

const CLASS = { 1: 'Simples', 2: 'Regras', 3: 'Precisa de IA', 4: 'Aprovação humana' };
const ENGINE = { regra: 'Regra', ia: 'IA', humano: 'Humano' };
const MS_LABEL = { cronograma_entrega: 'Entrega de cronograma', revisao_cronograma: 'Revisão de cronograma (Rebeca/Raísa)', ajuste_cronograma: 'Ajuste de cronograma', cliente_aprova_temas: 'Clientes aprovam temas', leitura_comentarios: 'Estrategistas leem comentários', producao: 'Produção (legenda, design, reels)', revisao_producao: 'Revisão da produção', ajustes_equipe: 'Ajustes da equipe', tudo_pronto: 'Tudo pronto', cliente_aprova_final: 'Clientes aprovam produção', ajustes_cliente: 'Ajustes dos clientes', agendamento: 'Agendamento' };
const FN = { estrategia: 'Estrategista', revisao: 'Revisão', cliente: 'Cliente', agendamento: 'Agendamento', null: 'Por formato' };

export default function Automacoes() {
  useCrumbs('Automações');
  const [tab, setTab] = useUrlState('aba', 'mapa');
  return (
    <div className="page">
      <PageHead kicker="Sistema" title="Automações" sub="O que o sistema faz sozinho: evento → condição → ação → responsável → notificação → prazo → motor → log. Regras determinísticas movem o processo; IA só interpreta." />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'mapa', label: 'Mapa de automações' }, { key: 'rotinas', label: 'Rotinas do sistema' }, { key: 'runs', label: 'Execuções' }, { key: 'regras', label: 'Regras do processo' }]} />
      {tab === 'mapa' && <Mapa />}
      {tab === 'rotinas' && <Rotinas />}
      {tab === 'runs' && <Runs />}
      {tab === 'regras' && <Regras />}
    </div>
  );
}

function Mapa() {
  const { data, error, loading, reload } = useApi('/automations');
  const est = useApi('/automations/estado');
  const stOf = Object.fromEntries((est.data?.automations || []).map((a) => [a.key, a]));
  const auth = useAuth();
  const toast = useToast();
  const [phase, setPhase] = useUrlState('fase', 'todas');
  const [cls, setCls] = useUrlState('classe', 'todas');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const list = data.automations.filter((a) => (phase === 'todas' || a.phase === phase) && (cls === 'todas' || String(a.class) === cls));
  const active = data.automations.filter((a) => a.implemented && a.enabled).length;
  const toggle = async (a) => { try { const r = await api.post(`/automations/${a.key}/toggle`); toast(`${a.key} ${r.enabled ? 'ligada' : 'desligada'}`); reload(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <>
      <div className="stats mb-5">
        <Stat value={data.automations.length} label="Automações mapeadas" />
        <Stat value={active} label="Ativas nesta versão" />
        <Stat value={(est.data?.automations || []).filter((a) => a.state === 'aguardando_integracao').length} label="Aguardando integração" />
        <Stat value={data.automations.filter((a) => !a.implemented).length} label="Em desenvolvimento (V2/V3)" />
        <Stat value={data.automations.reduce((s, a) => s + a.runs, 0)} label="Execuções registradas" />
      </div>
      <div className="row wrap mb-4 gap-4">
        <Seg label="Fase" value={phase} onChange={setPhase} options={[{ value: 'todas', label: 'Todas as fases' }, { value: 'MVP', label: 'MVP' }, { value: 'V2', label: 'V2' }, { value: 'V3', label: 'V3' }]} />
        <Seg label="Classe" value={cls} onChange={setCls} options={[{ value: 'todas', label: 'Todas' }, ...Object.entries(CLASS).map(([k, v]) => ({ value: k, label: `${k} · ${v}` }))]} />
      </div>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Evento</th><th>Condição</th><th>Ação</th><th>Responsável</th><th>Notificação</th><th>Prazo</th><th>Motor</th><th>Fase</th><th>Log</th><th>Estado</th><th>Ligada</th></tr></thead>
        <tbody>{list.map((a) => (
          <tr key={a.key} className={`auto-row ${a.implemented ? '' : 'planned'}`}>
            <td><div className="strong">{a.event}</div><code className="xs faint">{a.key}</code></td>
            <td className="sm">{a.condition}</td><td className="sm">{a.action}</td><td className="sm">{a.owner}</td><td className="sm">{a.notification}</td><td className="sm">{a.deadline}</td>
            <td><span className={`engine ${a.engine}`}>{ENGINE[a.engine]}</span><div className="xs faint mt-2">{a.class} · {CLASS[a.class]}</div></td>
            <td><Tag tone={a.phase === 'MVP' ? 'bordo' : ''}>{a.phase}</Tag></td>
            <td className="xs">{a.runs ? <><span className="strong tnum">{a.runs}×</span><div className="faint" style={{ whiteSpace: 'nowrap' }}>{ago(a.last_run)}</div></> : <span className="faint">—</span>}</td>
            <td className="xs">{stOf[a.key] ? <StateTag s={stOf[a.key].state} /> : '—'}
              {stOf[a.key]?.dependency && stOf[a.key].dependency.state !== 'conectada' && <div className="faint mt-2">Depende de {stOf[a.key].dependency.label}</div>}
              {stOf[a.key]?.last_error && <div className="mt-2" style={{ color: 'var(--err)' }}>Erro {ago(stOf[a.key].last_error.at)}: {stOf[a.key].last_error.detail}</div>}
            </td>
            <td>
              {!a.implemented ? <Tag tone="info">Planejada</Tag> : a.core ? <span className="xs muted" title="Parte do núcleo do processo — sempre ativa">Núcleo do processo</span> : (
                <button className={`switch ${a.enabled ? 'on' : ''}`} role="switch" aria-checked={!!a.enabled} aria-label={`Ligar/desligar ${a.event}`} disabled={!auth.can('automacoes', 'admin')} onClick={() => toggle(a)} />
              )}
            </td>
          </tr>
        ))}</tbody>
      </table></div>
    </>
  );
}

// Rotinas: quando rodam, última e próxima execução, e o que impede de rodar no ambiente atual
function Rotinas() {
  const { data, error, loading } = useApi('/automations/estado');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <>
      {data.hosting === 'vercel' && <p className="note mb-5">Este ambiente é a prévia na Vercel: as rotinas contínuas não rodam aqui. Elas dependem da hospedagem definitiva (aguardando aprovação).</p>}
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Rotina</th><th>Quando</th><th>Estado</th><th>Última execução</th><th>Próxima</th></tr></thead>
        <tbody>{data.routines.map((r) => (
          <tr key={r.key}>
            <td className="strong">{r.label}</td><td className="sm">{r.schedule}</td>
            <td className="xs"><StateTag s={r.state} />{r.note && <div className="faint mt-2">{r.note}</div>}</td>
            <td className="sm">{r.last ? <>{fmtDateTime(r.last)}{r.last_status && r.last_status !== 'ok' && <div className="xs" style={{ color: r.last_status === 'erro' ? 'var(--err)' : 'inherit' }}>{r.last_status}{r.last_error ? `: ${r.last_error}` : ''}</div>}</> : <span className="faint">Nunca executou</span>}</td>
            <td className="sm">{r.next ? (r.next.includes('T') ? fmtDateTime(r.next) : r.next) : <span className="faint">—</span>}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </>
  );
}

function Runs() {
  const { data, error, loading } = useApi('/automations');
  const [q, setQ] = useUrlState('q', '');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const runs = data.runs.filter((r) => !q || r.automation_key.includes(q) || (r.detail || '').toLowerCase().includes(q.toLowerCase()) || (r.client_name || '').toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <input className="input mb-4" style={{ maxWidth: 360 }} placeholder="Filtrar por automação, cliente ou detalhe" value={q} onChange={(e) => setQ(e.target.value)} />
      {!runs.length ? <Empty title="Nenhuma execução." /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Quando</th><th>Automação</th><th>Cliente</th><th>Entidade</th><th>Detalhe</th><th>Status</th></tr></thead>
          <tbody>{runs.map((r) => <tr key={r.id}><td className="xs tnum muted">{fmtDateTime(r.created_at)}</td><td><code className="xs">{r.automation_key}</code></td><td className="sm">{r.client_name ? cleanName(r.client_name) : '—'}</td><td className="xs muted">{r.entity_type || '—'}</td><td className="sm">{r.detail || ''}</td><td><Tag tone={r.status === 'ok' ? 'ok' : r.status === 'erro' ? 'err' : ''}>{r.status}</Tag></td></tr>)}</tbody>
        </table></div>
      )}
    </>
  );
}

function Regras() {
  const { data, error, loading, reload } = useApi('/process/definition');
  const auth = useAuth();
  const toast = useToast();
  const [tpl, setTpl] = useState(null);
  const [hours, setHours] = useState(null);
  useEffect(() => { if (data) { setTpl(data.settings.cycle_template); setHours(data.settings.followup_cliente_horas); } }, [data]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const admin = auth.can('automacoes', 'admin');
  const save = async (key, value) => { try { await api.put(`/process/settings/${key}`, { value }); toast('Regra atualizada — vale para os próximos prazos calculados'); reload(); } catch (e) { toast(e.message, 'err'); } };
  const st = data.settings;
  return (
    <>
      <div className="grid-2">
        <div>
          <Section title="Calendário operacional" kicker="Dias do mês anterior à publicação" className="" action={admin && tpl && <Button size="sm" variant="ink" onClick={() => save('cycle_template', tpl)}>Salvar calendário</Button>}>
            <p className="sm muted mb-4">Fonte: marcos do ciclo de NOVEMBRO no Google Calendar. Os prazos de cada etapa vêm daqui (com SLA em dias úteis quando o marco já passou).</p>
            <div className="ms-row xs caps"><span>Marco</span><span>De</span><span>Até</span></div>
            {tpl && Object.entries(tpl).map(([k, [a, b]]) => (
              <div className="ms-row" key={k}>
                <span className="sm">{MS_LABEL[k] || k}</span>
                <input className="input" type="number" min="1" max="31" value={a} disabled={!admin} aria-label={`${k} início`} onChange={(e) => setTpl({ ...tpl, [k]: [Number(e.target.value), b] })} />
                <input className="input" type="number" min="1" max="31" value={b} disabled={!admin} aria-label={`${k} fim`} onChange={(e) => setTpl({ ...tpl, [k]: [a, Number(e.target.value)] })} />
              </div>
            ))}
            <p className="xs faint mt-4">Exemplo para {Object.values(data.example_cycle)[0]?.start?.slice(0, 7)}: produção {data.example_cycle.producao?.start} → {data.example_cycle.producao?.end}.</p>
          </Section>
        </div>
        <div>
          <Section title="Regras do fluxo" kicker="Process Engine">
            <ul className="list">
              <li><div className="grow"><div className="strong sm">Análise interna do cronograma</div><div className="xs muted">Rebeca/Raísa revisam temas antes do cliente. O PDF do processo indica “em breve não teremos essa fase”.</div></div><button className={`switch ${st.analise_cronograma_ativa ? 'on' : ''}`} role="switch" aria-checked={!!st.analise_cronograma_ativa} disabled={!admin} onClick={() => save('analise_cronograma_ativa', !st.analise_cronograma_ativa)} aria-label="Análise interna do cronograma" /></li>
              <li><div className="grow"><div className="strong sm">Reenviar ao cliente após ajuste</div><div className="xs muted">Ajuste normal do cliente volta para ele aprovar a nova versão (versão aprovada sempre registrada). Desligado: ajuste vira “simples” e segue para agendamento após conferência.</div></div><button className={`switch ${st.reenviar_cliente_apos_ajuste ? 'on' : ''}`} role="switch" aria-checked={!!st.reenviar_cliente_apos_ajuste} disabled={!admin} onClick={() => save('reenviar_cliente_apos_ajuste', !st.reenviar_cliente_apos_ajuste)} aria-label="Reenviar ao cliente após ajuste" /></li>
              <li style={{ alignItems: 'flex-start' }}><div className="grow"><div className="strong sm">Régua de cobrança do cliente (horas)</div><div className="xs muted">Lembrete no portal → follow-up com texto pronto para o atendimento → escalada para Operações/CEO.</div>
                {hours && <div className="row gap-2 mt-2">{hours.map((h, i) => <input key={i} className="input" style={{ width: 72 }} type="number" value={h} disabled={!admin} aria-label={`Limite ${i + 1}`} onChange={(e) => setHours(hours.map((x, j) => (j === i ? Number(e.target.value) : x)))} />)}{admin && <Button size="sm" onClick={() => save('followup_cliente_horas', hours)}>Salvar</Button>}</div>}</div></li>
              <li><div className="grow"><div className="strong sm">Revisores padrão</div><div className="xs muted">Quando o cliente não tem revisor vinculado: perfis {st.revisores_padrao_roles.join(', ')}. Cópia das etapas-chave: {st.cc_roles.join(', ')}. Agendamento: {st.agendamento_roles.join(', ')}.</div></div></li>
            </ul>
          </Section>
        </div>
      </div>
      <Section title="Etapas do processo" kicker="Entrada · ação · saída · responsável · SLA">
        <div className="stage-def caps xs"><span>Etapa</span><span>Responsável</span><span>Ação</span><span>Saída (para avançar)</span><span>SLA</span></div>
        {data.order.map((k) => { const s = data.stages[k]; return (
          <div className="stage-def" key={k}>
            <span><span className="strong">{s.label}</span><div className="xs faint">{data.lanes.find((l) => l.key === s.lane)?.label || '—'}{s.client ? ' · visível ao cliente' : ''}</div></span>
            <span className="muted">{FN[s.fn] ?? s.fn}</span><span>{s.action || '—'}</span><span className="muted">{s.exit || '—'}</span><span className="tnum">{s.sla != null ? `${s.sla}d úteis` : '—'}</span>
          </div>
        ); })}
      </Section>
    </>
  );
}
