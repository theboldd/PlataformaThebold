// PRODUÇÃO & REPASSES — apuração por competência do que cada profissional executou (só trabalho nascido na plataforma),
// valores pelas regras cadastradas pela CEO, ajustes com motivo e fechamento com aprovação. Sem regra: "pendente de configuração".
import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useApi, useToast } from '../../lib/hooks.js';
import { useUrlState } from '../../lib/nav.jsx';
import { Button, ErrorBox, Field, Loading, Modal, Section, Seg, Tag } from '../../components/ui.jsx';
import { StateTag, StatePanel, Metric } from '../../components/State.jsx';
import { FUNCTIONS } from '../../lib/status.js';
import { fmtDate, fmtDateTime, money, cleanName } from '../../lib/format.js';

const KINDS = { etapa: 'Etapa do processo', ajuste: 'Ajuste', follow_up: 'Follow-up', onboarding: 'Onboarding', reuniao: 'Reunião', manual: 'Manual', agendamento: 'Agendamento' };
const MOT = { cliente: 'Cliente (material/aprovação)', processo: 'Processo (bloqueio)', sem_motivo: 'Sem motivo registrado', escopo: 'Escopo (cancelado)', outros: 'Outros' };
const NEXT_LABEL = { em_revisao: 'Enviar para revisão', aguardando_aprovacao: 'Pedir aprovação', aprovado: 'Aprovar', fechado: 'Fechar competência', reaberto: 'Reabrir', rascunho: 'Voltar a rascunho' };

export default function Repasses() {
  const [comp, setComp] = useUrlState('competencia', new Date().toISOString().slice(0, 7));
  const [view, setView] = useUrlState('ver', 'apuracao');
  const { data, error, loading, reload } = useApi(`/negocio/repasses?competencia=${comp}`, [comp]);
  const toast = useToast();
  const [modal, setModal] = useState(null);
  if (error?.status === 403) return <StatePanel s="bloqueado" kicker="Acesso restrito" title="Produção & Repasses é restrito.">Valores e fechamentos só para quem a CEO autorizar (permissão “Produção & Repasses”).</StatePanel>;
  if (error) return <ErrorBox error={error} />;
  if (loading && !data) return <Loading />;
  const a = data.apuracao, t = a.totals, cl = data.closing;
  const move = async (to) => {
    const note = to === 'reaberto' ? prompt('Motivo da reabertura (obrigatório):') : undefined;
    if (to === 'reaberto' && !note) return;
    try { await api.post(`/negocio/repasses/${comp}/status`, { to, note }); toast('Fechamento atualizado.'); reload(); } catch (e) { toast(e.message, 'err'); }
  };
  const status = cl?.status || null;
  const nexts = status ? data.flow[status] || [] : ['rascunho'];
  return (
    <div>
      <div className="row wrap gap-3 mb-4" style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div className="row wrap gap-3" style={{ alignItems: 'flex-end' }}>
          <Field label="Competência"><input className="input" type="month" value={comp} onChange={(e) => e.target.value && setComp(e.target.value)} /></Field>
          <div className="col gap-2">
            <StateTag s={!a.has_rates ? 'aguardando_configuracao' : t.pendentes_regra ? 'aguardando_configuracao' : t.previstas ? 'ativo' : 'dados_insuficientes'}>
              {!a.has_rates ? 'Regra financeira pendente de configuração' : t.pendentes_regra ? `${t.pendentes_regra} demanda(s) sem regra de valor` : t.previstas ? 'Apuração ativa' : 'Dados insuficientes · nenhuma demanda na competência'}
            </StateTag>
            <span className="xs muted">Fechamento: <b>{cl ? cl.label : 'não iniciado'}</b>{data.frozen && ` · congelado em ${fmtDateTime(a.frozen_at)}`}</span>
          </div>
        </div>
        {data.can.edit && (
          <div className="row wrap gap-2">
            {!data.frozen && <Button size="sm" variant="primary" onClick={() => setModal('demanda')}>+ Adicionar demanda</Button>}
            {nexts.filter((n) => !['aprovado', 'fechado', 'reaberto'].includes(n) || data.can.approve).map((n) => <Button key={n} size="sm" variant={n === 'fechado' || n === 'aprovado' ? 'primary' : 'ghost'} onClick={() => move(n)}>{status ? NEXT_LABEL[n] : 'Iniciar fechamento (rascunho)'}</Button>)}
            {cl && <Button size="sm" variant="ghost" onClick={async () => { const r = await api.post(`/negocio/repasses/${comp}/relatorio`); toast(r.sent ? 'Relatório enviado.' : `Relatório não enviado: ${r.error}`, r.sent ? 'ok' : 'err'); reload(); }}>Enviar relatório</Button>}
          </div>
        )}
      </div>

      <div className="metric-grid mb-4">
        <Metric label="Previstas" value={t.previstas} s={t.previstas ? 'ativo' : 'dados_insuficientes'} />
        <Metric label="Concluídas" value={t.concluidas} s={t.previstas ? 'ativo' : 'dados_insuficientes'} />
        <Metric label="Contabilizadas" value={t.contabilizadas} s={t.previstas ? 'ativo' : 'dados_insuficientes'} />
        <Metric label="Fora da apuração" value={t.excluidas} s={t.previstas ? 'ativo' : 'dados_insuficientes'} />
        <Metric label="Taxa de execução" value={t.previstas ? `${Math.round((t.concluidas / t.previstas) * 100)}%` : null} s={t.previstas ? 'ativo' : 'dados_insuficientes'} />
        <Metric label="Valor apurado" value={money(t.valor_apurado)} s={!a.has_rates || t.pendentes_regra ? 'aguardando_configuracao' : t.previstas ? 'ativo' : 'dados_insuficientes'} />
        <Metric label="Ajustes" value={money(t.ajustes)} />
      </div>

      <Seg value={view} onChange={setView} options={[{ value: 'apuracao', label: 'Apuração por pessoa' }, { value: 'demandas', label: 'Demandas' }, { value: 'motivos', label: 'Por que não executou' }, { value: 'valores', label: 'Valores' }, { value: 'ajustes', label: 'Ajustes' }, { value: 'fechamentos', label: 'Fechamentos' }, { value: 'diario', label: 'Apuração diária' }]} />

      {view === 'apuracao' && (
        <Section title="Apuração por pessoa" kicker={`Competência ${comp}`}>
          {!a.people.length ? <StatePanel compact s="dados_insuficientes" title="Nenhuma demanda nascida na plataforma nesta competência." /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Profissional</th><th className="num">Previstas</th><th className="num">Concluídas</th><th className="num">Não realizadas</th><th className="num">Bloqueadas</th><th className="num">Canceladas</th><th className="num">Contabilizadas</th><th className="right">Apurado</th><th className="right">Ajustes</th><th className="right">Final</th></tr></thead>
              <tbody>{a.people.map((p) => <tr key={p.user_id}><td className="strong">{p.name}</td><td className="num tnum">{p.previstas}</td><td className="num tnum">{p.concluidas}</td><td className="num tnum">{p.nao_realizadas}</td><td className="num tnum">{p.bloqueadas}</td><td className="num tnum">{p.canceladas}</td><td className="num tnum">{p.contabilizadas}</td>
                <td className="right tnum">{p.pendentes_regra ? <StateTag s="aguardando_configuracao">{p.pendentes_regra} sem regra</StateTag> : money(p.valor_apurado)}</td><td className="right tnum">{money(p.ajustes)}</td><td className="right tnum strong">{p.valor_final == null ? '—' : money(p.valor_final)}</td></tr>)}</tbody>
            </table></div>
          )}
          <p className="xs muted mt-2">Entra na apuração: demanda concluída{data.config.motivos?.length ? ` e não realizada por: ${data.config.motivos.map((m) => MOT[m] || m).join(', ')}` : ''}. Prazo vencido gera alerta, nunca desconto automático. Material do cliente não conta como falha do profissional.</p>
        </Section>
      )}

      {view === 'demandas' && (
        <Section title="Demandas da competência">
          {!a.lines.length ? <StatePanel compact s="dados_insuficientes" title="Nenhuma demanda." /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Demanda</th><th>Profissional</th><th>Cliente</th><th>Tipo · função</th><th className="num">Qtd.</th><th>Prazo</th><th>Execução</th><th className="right">Valor</th><th /></tr></thead>
              <tbody>{a.lines.map((l) => <tr key={l.id}><td className="sm">{l.title}{l.origem === 'manual' && <span className="tag" style={{ marginLeft: 6 }}>Lançada à mão</span>}{l.reprogramado && <span className="tag tag-mig" style={{ marginLeft: 6 }}>Reprogramada</span>}{l.note && <div className="xs faint">{l.note}</div>}</td><td className="sm">{l.user_name}</td><td className="sm">{cleanName(l.client_name || '—')}</td><td className="xs">{KINDS[l.kind] || l.kind} · {FUNCTIONS[l.function] || l.function || '—'}</td><td className="num tnum">{l.qty || 1}</td><td className="xs tnum">{l.due_at ? fmtDate(l.due_at) : '—'}</td>
                <td className="xs">{l.exec_label}{l.exec === 'nao_realizado_cliente' && l.block_reason ? <div className="faint">{l.block_reason}</div> : null}</td>
                <td className="right tnum">{!l.conta ? <span className="faint">fora</span> : l.value == null ? <StateTag s="aguardando_configuracao">sem regra</StateTag> : <>{money(l.value)}{l.qty > 1 && l.unit_value != null && <div className="xs faint">{l.qty} × {money(l.unit_value)}{l.value_source === 'regra' ? ' (regra)' : ''}</div>}</>}</td>
                <td className="right">{l.origem === 'manual' && data.can.edit && !data.frozen && <Button size="sm" variant="ghost" onClick={async () => { const note = prompt('Motivo para tirar esta demanda da apuração (fica no histórico):'); if (!note) return; try { await api.post(`/negocio/repasses/demandas/${l.id}/revogar`, { note }); toast('Demanda removida da apuração (registrada no histórico).'); reload(); } catch (e) { toast(e.message, 'err'); } }}>Remover</Button>}</td></tr>)}</tbody>
            </table></div>
          )}
        </Section>
      )}

      {view === 'motivos' && (
        <Section title="Por que as demandas não foram executadas?">
          {!Object.keys(a.motivos).length ? <StatePanel compact s="dados_insuficientes" title="Nenhuma demanda não executada nesta competência." /> : (
            <div className="metric-grid">{Object.entries(a.motivos).map(([k, n]) => { const tot = Object.values(a.motivos).reduce((s, x) => s + x, 0); return <Metric key={k} label={MOT[k] || k} value={`${n} · ${Math.round((n / tot) * 100)}%`} />; })}</div>
          )}
        </Section>
      )}

      {view === 'valores' && (
        <Section title="Valores por profissional" kicker="Cadastrados pela CEO ou por quem ela autorizar" action={data.can.edit && <Button size="sm" variant="primary" onClick={() => setModal('valor')}>Cadastrar valor</Button>}>
          {!data.rates.length ? <StatePanel compact s="aguardando_configuracao" title="Nenhum valor cadastrado." missing="cadastrar o valor por pessoa, função, tipo de demanda e/ou cliente, com vigência. A regra mais específica vale; um valor novo não altera o histórico." /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Aplica-se a</th><th className="right">Valor</th><th>Vigência</th><th>Estado</th><th /></tr></thead>
              <tbody>{data.rates.map((r) => <tr key={r.id}><td className="sm">{[r.user_name, FUNCTIONS[r.function] || r.function, KINDS[r.task_kind] || r.task_kind, r.client_name && cleanName(r.client_name)].filter(Boolean).join(' · ')}{r.note && <div className="xs faint">{r.note}</div>}</td><td className="right tnum">{money(r.value)}</td><td className="xs tnum">{fmtDate(r.starts_at + 'T12:00:00Z')} → {r.ends_at ? fmtDate(r.ends_at + 'T12:00:00Z') : 'sem fim'}</td>
                <td><Tag tone={r.active && !r.ends_at ? 'ok' : ''}>{r.active ? (r.ends_at ? 'Vigência encerrada' : 'Vigente') : 'Inativa'}</Tag></td>
                <td className="right">{data.can.edit && r.active && !r.ends_at && <Button size="sm" variant="ghost" onClick={async () => { try { await api.post(`/negocio/repasses/valores/${r.id}/encerrar`, {}); toast('Vigência encerrada.'); reload(); } catch (e) { toast(e.message, 'err'); } }}>Encerrar vigência</Button>}</td></tr>)}</tbody>
            </table></div>
          )}
        </Section>
      )}

      {view === 'ajustes' && (
        <Section title="Ajustes e exceções" kicker={`Competência ${comp}`} action={data.can.edit && !data.frozen && <Button size="sm" variant="primary" onClick={() => setModal('ajuste')}>Lançar ajuste</Button>}>
          {!a.adjustments.length ? <StatePanel compact s="dados_insuficientes" title="Nenhum ajuste nesta competência." /> : (
            <ul className="list">{a.adjustments.map((x) => <li key={x.id}><span className="grow"><b>{x.user_name}</b> · {x.reason}<div className="xs faint">{fmtDateTime(x.created_at)}</div></span><span className="tnum strong">{money(x.amount)}</span>
              {data.can.edit && !data.frozen && <Button size="sm" variant="ghost" onClick={async () => { try { await api.post(`/negocio/repasses/ajustes/${x.id}/revogar`); toast('Ajuste revogado (fica no histórico).'); reload(); } catch (e) { toast(e.message, 'err'); } }}>Revogar</Button>}</li>)}</ul>
          )}
        </Section>
      )}

      {view === 'fechamentos' && (
        <Section title="Fechamentos" kicker="Rascunho → Em revisão → Aguardando aprovação → Aprovado → Fechado → Reaberto">
          <StatePanel compact s={data.config.dia_fechamento ? 'ativo' : 'aguardando_decisao'} kicker="Fechamento automático" title={data.config.dia_fechamento ? `Todo dia ${data.config.dia_fechamento}: apura a competência anterior e envia o relatório${data.config.email_relatorio ? ` para ${data.config.email_relatorio}` : ''}` : 'Dia de fechamento não definido'} missing={!data.config.dia_fechamento ? 'definir o dia em Negócio → Configuração.' : !data.config.email_relatorio ? 'definir o e-mail do relatório em Negócio → Configuração.' : null} />
          {!data.closings.length ? <p className="sm muted mt-4">Nenhum fechamento iniciado.</p> : (
            <div className="table-wrap mt-4"><table className="table">
              <thead><tr><th>Competência</th><th>Estado</th><th>Relatório</th><th>Atualizado</th></tr></thead>
              <tbody>{data.closings.map((c) => <tr key={c.competencia}><td><button className="link" onClick={() => setComp(c.competencia)}>{c.competencia}</button></td><td><Tag tone={c.status === 'fechado' ? 'ok' : c.status === 'reaberto' ? 'warn' : ''}>{c.label}</Tag></td><td className="xs">{c.report_sent_at ? `Enviado ${fmtDateTime(c.report_sent_at)}` : c.report_error || '—'}</td><td className="xs">{fmtDateTime(c.updated_at)}</td></tr>)}</tbody>
            </table></div>
          )}
        </Section>
      )}

      {view === 'diario' && (
        <Section title="Apuração até hoje" kicker="Um registro por dia, nunca sobrescrito">
          {!data.daily.length ? <StatePanel compact s="dados_insuficientes" title="Nenhum registro diário ainda." missing="a rotina diária (servidor contínuo ou cron) grava um registro por dia." /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Dia</th><th className="num">Contabilizadas</th><th className="num">Fora</th><th className="num">Sem regra</th><th className="right">Acumulado</th><th className="right">Variação</th></tr></thead>
              <tbody>{data.daily.map((d) => <tr key={d.date}><td className="tnum">{fmtDate(d.date + 'T12:00:00Z')}</td><td className="num tnum">{d.counted}</td><td className="num tnum">{d.excluded}</td><td className="num tnum">{d.pending_rules}</td><td className="right tnum">{money(d.total)}</td><td className="right tnum">{d.diff == null ? '—' : money(d.diff)}</td></tr>)}</tbody>
            </table></div>
          )}
        </Section>
      )}

      {modal === 'valor' && <RateModal data={data} onClose={() => setModal(null)} onDone={() => { setModal(null); toast('Valor cadastrado.'); reload(); }} />}
      {modal === 'demanda' && <DemandModal data={data} comp={comp} onClose={() => setModal(null)} onDone={() => { setModal(null); setView('demandas'); toast('Demanda adicionada à apuração.'); reload(); }} />}
      {modal === 'ajuste' && <AdjModal data={data} comp={comp} onClose={() => setModal(null)} onDone={() => { setModal(null); toast('Ajuste lançado.'); reload(); }} />}
    </div>
  );
}

function RateModal({ data, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ user_id: '', function: '', task_kind: '', client_id: '', value: '', starts_at: new Date().toISOString().slice(0, 10), ends_at: '', note: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => { try { await api.post('/negocio/repasses/valores', f); onDone(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <Modal open title="Cadastrar valor de repasse" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit}>Salvar</Button></>}>
      <p className="xs muted">Preencha só o que define a regra (ex.: só a função “Design” = vale para toda demanda de design). A regra mais específica vale.</p>
      <div className="grid-2 mt-4">
        <Field label="Profissional"><select className="select" value={f.user_id} onChange={set('user_id')}><option value="">Qualquer</option>{data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Função"><select className="select" value={f.function} onChange={set('function')}><option value="">Qualquer</option>{Object.entries(FUNCTIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Tipo de demanda"><select className="select" value={f.task_kind} onChange={set('task_kind')}><option value="">Qualquer</option>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Cliente"><select className="select" value={f.client_id} onChange={set('client_id')}><option value="">Qualquer</option>{data.clients.map((c) => <option key={c.id} value={c.id}>{cleanName(c.name)}</option>)}</select></Field>
        <Field label="Valor por demanda (R$)"><input className="input" type="number" min="0" step="0.01" value={f.value} onChange={set('value')} /></Field>
        <Field label="Vigência a partir de"><input className="input" type="date" value={f.starts_at} onChange={set('starts_at')} /></Field>
        <Field label="Vigência até (opcional)"><input className="input" type="date" value={f.ends_at} onChange={set('ends_at')} /></Field>
        <Field label="Observação"><input className="input" value={f.note} onChange={set('note')} /></Field>
      </div>
    </Modal>
  );
}
// ADICIONAR DEMANDA: pessoa da equipe, função, cliente (opcional), descrição, quantidade, valor unitário (vazio = valor da regra) e situação
function DemandModal({ data, comp, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ user_id: '', function: '', client_id: '', description: '', quantity: 1, unit_value: '', status: 'concluido', motivo: '', note: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const person = data.people.find((p) => p.id === f.user_id);
  const fns = (() => { try { return JSON.parse(person?.functions || '[]'); } catch { return []; } })();
  const pickPerson = (e) => { const p = data.people.find((x) => x.id === e.target.value); let fn = ''; try { fn = JSON.parse(p?.functions || '[]')[0] || ''; } catch { /* sem função */ } setF({ ...f, user_id: e.target.value, function: fn }); };
  const total = f.unit_value !== '' && Number(f.quantity) > 0 ? Number(f.unit_value) * Number(f.quantity) : null;
  const submit = async () => { try { await api.post('/negocio/repasses/demandas', { ...f, competencia: comp, quantity: Number(f.quantity) }); onDone(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <Modal open title={`Adicionar demanda · ${comp}`} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit} disabled={!f.user_id || !f.description.trim()}>Adicionar</Button></>}>
      <p className="xs muted" style={{ marginTop: 0 }}>Para o que não passa pelo processo (ex.: captação, edição avulsa, roteiro extra). Fica registrado quem lançou e quando; nada é apagado.</p>
      <div className="grid-2 mt-4">
        <Field label="Pessoa da equipe"><select className="select" value={f.user_id} onChange={pickPerson}><option value="">Selecione…</option>{data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Função"><select className="select" value={f.function} onChange={set('function')}><option value="">—</option>{[...new Set([...fns, ...Object.keys(FUNCTIONS)])].map((k) => <option key={k} value={k}>{FUNCTIONS[k] || k}{fns.includes(k) ? ' (função da pessoa)' : ''}</option>)}</select></Field>
        <Field label="Cliente (opcional)"><select className="select" value={f.client_id} onChange={set('client_id')}><option value="">Sem cliente / interno da agência</option>{data.clients.map((c) => <option key={c.id} value={c.id}>{cleanName(c.name)}</option>)}</select></Field>
        <Field label="Quantidade"><input className="input" type="number" min="1" max="999" value={f.quantity} onChange={set('quantity')} /></Field>
      </div>
      <div className="col gap-4 mt-4">
        <Field label="Demanda (descrição)"><input className="input" value={f.description} onChange={set('description')} placeholder="Ex.: Carrossel extra · Captação de vídeo · Roteiro" /></Field>
      </div>
      <div className="grid-2 mt-4">
        <Field label="Valor unitário (R$)" hint={f.unit_value === '' ? 'Vazio = usa o valor cadastrado em Valores (se houver).' : total != null ? `Total: ${money(total)}` : ''}><input className="input" type="number" min="0" step="0.01" value={f.unit_value} onChange={set('unit_value')} /></Field>
        <Field label="Situação"><select className="select" value={f.status} onChange={set('status')}><option value="concluido">Concluída</option><option value="previsto">Prevista (ainda não feita)</option><option value="nao_realizado">Não realizada</option><option value="cancelado">Cancelada</option></select></Field>
        {f.status === 'nao_realizado' && <Field label="Motivo"><select className="select" value={f.motivo} onChange={set('motivo')}><option value="">Selecione…</option>{Object.entries(MOT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>}
        <Field label="Observação"><input className="input" value={f.note} onChange={set('note')} /></Field>
      </div>
    </Modal>
  );
}

function AdjModal({ data, comp, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ user_id: '', amount: '', reason: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => { try { await api.post('/negocio/repasses/ajustes', { ...f, competencia: comp }); onDone(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <Modal open title={`Ajuste · ${comp}`} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit}>Lançar</Button></>}>
      <div className="col gap-4">
        <Field label="Profissional"><select className="select" value={f.user_id} onChange={set('user_id')}><option value="">Selecione…</option>{data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Valor (R$, negativo para desconto)"><input className="input" type="number" step="0.01" value={f.amount} onChange={set('amount')} /></Field>
        <Field label="Motivo (obrigatório)"><textarea className="textarea" value={f.reason} onChange={set('reason')} /></Field>
      </div>
    </Modal>
  );
}
