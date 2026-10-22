// CUSTOS · METAS · RENTABILIDADE · CONFIGURAÇÃO FINANCEIRA — tudo determinístico, com o estado honesto do que falta.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useApi, useAuth, useToast } from '../../lib/hooks.js';
import { useUrlState } from '../../lib/nav.jsx';
import { Button, ErrorBox, Field, Loading, Modal, Section, Tag } from '../../components/ui.jsx';
import { StateTag, StatePanel, Metric } from '../../components/State.jsx';
import { fmtDate, money, cleanName } from '../../lib/format.js';

const thisMonth = () => new Date().toISOString().slice(0, 7);
const MonthField = ({ value, onChange }) => <Field label="Competência"><input className="input" type="month" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} /></Field>;
const val = (v, s) => (s && s !== 'ativo' ? <StateTag s={s === 'restrito' ? 'bloqueado' : s}>{s === 'restrito' ? 'Restrito a repasses' : undefined}</StateTag> : money(v));

export function Custos() {
  const [comp, setComp] = useUrlState('competencia', thisMonth());
  const { data, error, loading, reload } = useApi(`/negocio/custos?competencia=${comp}`, [comp]);
  const auth = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  if (error) return <ErrorBox error={error} />;
  if (loading && !data) return <Loading />;
  const total = data.items.reduce((s, c) => s + c.amount, 0);
  const byCat = Object.entries(data.items.reduce((m, c) => ((m[c.category] = (m[c.category] || 0) + c.amount), m), {}));
  return (
    <div>
      <div className="row wrap gap-3 mb-4" style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div className="row wrap gap-3" style={{ alignItems: 'flex-end' }}><MonthField value={comp} onChange={setComp} /><StateTag s={data.items.length ? 'ativo' : 'aguardando_configuracao'}>{data.items.length ? `${data.items.length} custo(s) na competência` : 'Nenhum custo cadastrado'}</StateTag></div>
        {auth.can('financeiro', 'edit') && <Button variant="primary" onClick={() => setOpen(true)}>Cadastrar custo</Button>}
      </div>
      <div className="metric-grid mb-4">
        <Metric label="Total da competência" value={money(total)} s={data.items.length ? 'ativo' : 'dados_insuficientes'} />
        {byCat.map(([k, v]) => <Metric key={k} label={data.categories[k]} value={money(v)} />)}
      </div>
      <Section title="Custos da competência" kicker="Únicos da competência + recorrentes vigentes">
        {!data.items.length ? <StatePanel compact s="aguardando_configuracao" title="Sem custos cadastrados." missing="cadastrar aluguel, ferramentas, equipe, impostos e outros (únicos ou recorrentes). Custo de um cliente específico entra na rentabilidade dele." /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Descrição</th><th>Categoria</th><th>Tipo</th><th>Cliente</th><th className="right">Valor</th><th /></tr></thead>
            <tbody>{data.items.map((c) => <tr key={c.id}><td className="strong">{c.description}</td><td className="sm">{data.categories[c.category]}</td><td className="xs">{c.kind === 'recorrente' ? `Recorrente desde ${fmtDate(c.starts_at + 'T12:00:00Z')}` : 'Único'}</td><td className="sm">{c.client_name ? cleanName(c.client_name) : 'Agência'}</td><td className="right tnum">{money(c.amount)}</td>
              <td className="right">{auth.can('financeiro', 'edit') && <Button size="sm" variant="ghost" onClick={async () => { try { await api.post(`/negocio/custos/${c.id}/desativar`); toast('Custo desativado (fica no histórico).'); reload(); } catch (e) { toast(e.message, 'err'); } }}>Desativar</Button>}</td></tr>)}</tbody>
          </table></div>
        )}
      </Section>
      {open && <CostModal data={data} comp={comp} onClose={() => setOpen(false)} onDone={() => { setOpen(false); toast('Custo cadastrado.'); reload(); }} />}
    </div>
  );
}
function CostModal({ data, comp, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ description: '', category: 'ferramentas', kind: 'unico', amount: '', competencia: comp, starts_at: `${comp}-01`, ends_at: '', client_id: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => { try { await api.post('/negocio/custos', f); onDone(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <Modal open title="Cadastrar custo" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit}>Salvar</Button></>}>
      <div className="col gap-4">
        <Field label="Descrição"><input className="input" value={f.description} onChange={set('description')} /></Field>
        <div className="grid-2">
          <Field label="Categoria"><select className="select" value={f.category} onChange={set('category')}>{Object.entries(data.categories).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Tipo"><select className="select" value={f.kind} onChange={set('kind')}><option value="unico">Único (uma competência)</option><option value="recorrente">Recorrente (todo mês)</option></select></Field>
          <Field label="Valor (R$)"><input className="input" type="number" min="0" step="0.01" value={f.amount} onChange={set('amount')} /></Field>
          {f.kind === 'unico' ? <Field label="Competência"><input className="input" type="month" value={f.competencia} onChange={set('competencia')} /></Field>
            : <><Field label="Início"><input className="input" type="date" value={f.starts_at} onChange={set('starts_at')} /></Field><Field label="Fim (opcional)"><input className="input" type="date" value={f.ends_at} onChange={set('ends_at')} /></Field></>}
          <Field label="Cliente (custo direto, opcional)"><select className="select" value={f.client_id} onChange={set('client_id')}><option value="">Agência (geral)</option>{data.clients.map((c) => <option key={c.id} value={c.id}>{cleanName(c.name)}</option>)}</select></Field>
        </div>
      </div>
    </Modal>
  );
}

export function Metas() {
  const [comp, setComp] = useUrlState('competencia', thisMonth());
  const { data, error, loading, reload } = useApi(`/negocio/metas?competencia=${comp}`, [comp]);
  const auth = useAuth();
  const toast = useToast();
  const [edit, setEdit] = useState(null);
  if (error) return <ErrorBox error={error} />;
  if (loading && !data) return <Loading />;
  const fmt = (m, v) => (v == null ? '—' : m === 'novos_clientes' ? String(Math.round(v)) : money(v));
  return (
    <div>
      <div className="row wrap gap-3 mb-4" style={{ alignItems: 'flex-end' }}><MonthField value={comp} onChange={setComp} /><StateTag s={data.items.some((i) => i.target != null) ? 'ativo' : 'aguardando_decisao'}>{data.items.some((i) => i.target != null) ? 'Metas definidas' : 'Metas aguardando decisão da CEO'}</StateTag></div>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Métrica</th><th className="right">Meta</th><th className="right">Realizado</th><th className="right">Projeção</th><th className="right">Desvio</th><th /></tr></thead>
        <tbody>{data.items.map((i) => (
          <tr key={i.metric}>
            <td className="strong">{i.label}</td>
            <td className="right tnum">{i.target == null ? <StateTag s="aguardando_decisao">sem meta</StateTag> : fmt(i.metric, i.target)}</td>
            <td className="right tnum">{i.realizado == null ? <StateTag s="dados_insuficientes" /> : fmt(i.metric, i.realizado)}</td>
            <td className="right tnum">{fmt(i.metric, i.projecao)}</td>
            <td className={`right tnum ${i.desvio < 0 ? 'bordo' : ''}`}>{i.desvio == null ? '—' : `${i.desvio > 0 ? '+' : ''}${fmt(i.metric, i.desvio)}`}</td>
            <td className="right">{auth.can('financeiro', 'edit') && <Button size="sm" variant="ghost" onClick={() => setEdit({ metric: i.metric, label: i.label, target: i.target ?? '' })}>{i.target == null ? 'Definir meta' : 'Alterar'}</Button>}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <p className="xs muted mt-2">Projeção linear só para valores acumulados no mês (recebido, novos clientes). Margem depende de custos e repasses cadastrados.</p>
      {edit && (
        <Modal open title={`Meta de ${edit.label} · ${comp}`} onClose={() => setEdit(null)} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button variant="primary" onClick={async () => { try { await api.put('/negocio/metas', { competencia: comp, metric: edit.metric, target: Number(edit.target) }); setEdit(null); toast('Meta salva.'); reload(); } catch (e) { toast(e.message, 'err'); } }}>Salvar</Button></>}>
          <Field label="Meta"><input className="input" type="number" value={edit.target} onChange={(e) => setEdit({ ...edit, target: e.target.value })} /></Field>
        </Modal>
      )}
    </div>
  );
}

export function Rentabilidade() {
  const [comp, setComp] = useUrlState('competencia', thisMonth());
  const { data, error, loading } = useApi(`/negocio/rentabilidade?competencia=${comp}`, [comp]);
  if (error) return <ErrorBox error={error} />;
  if (loading && !data) return <Loading />;
  const S = data.states;
  return (
    <div>
      <div className="row wrap gap-3 mb-4" style={{ alignItems: 'flex-end' }}><MonthField value={comp} onChange={setComp} /></div>
      <div className="state-grid mb-5">
        <StatePanel compact s={S.receita} kicker="Receita (faturado)" title={S.receita === 'ativo' ? money(data.receita.faturado) : 'Sem contratos cadastrados'}>{S.receita === 'ativo' && <p className="xs muted">Recebido: {money(data.receita.recebido)}</p>}</StatePanel>
        <StatePanel compact s={S.custos} kicker="Custos" title={data.custos_n ? money(data.custos) : 'Nenhum custo cadastrado'} to={!data.custos_n ? '/negocio?aba=custos' : null} action="Cadastrar custos" />
        <StatePanel compact s={S.repasses === 'restrito' ? 'bloqueado' : S.repasses} kicker="Repasses" title={S.repasses === 'restrito' ? 'Visível só com a permissão de repasses' : S.repasses === 'ativo' && data.repasses != null ? money(data.repasses) : S.repasses === 'dados_insuficientes' ? 'Nenhuma demanda na competência' : data.repasses_pendentes ? `${data.repasses_pendentes} demanda(s) sem regra de valor` : 'Regra de repasse não cadastrada'} />
        <StatePanel compact s={S.margem === 'restrito' ? 'bloqueado' : S.margem} kicker="Margem" title={data.margem != null ? money(data.margem) : S.margem === 'restrito' ? 'Visível só com a permissão de repasses' : 'Depende de receita, custos e repasses cadastrados'} />
        <StatePanel compact s={S.evolucao} kicker="Evolução" title={S.evolucao === 'ativo' ? 'Últimos 6 meses abaixo' : 'Sem histórico para comparar'} />
      </div>
      <Section title="Rentabilidade por cliente" kicker={`Competência ${comp}`}>
        {!data.clients.length ? <StatePanel compact s="dados_insuficientes" title="Nenhum cliente com receita, custo, repasse ou retrabalho na competência." /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Cliente</th><th className="right">Receita</th><th className="right">Custos diretos</th><th className="right">Repasses</th><th className="num">Demandas</th><th className="num">Ajustes int.</th><th className="num">Ajustes cliente</th><th className="right">Custo de retrabalho</th><th className="right">Margem</th></tr></thead>
            <tbody>{data.clients.map((c) => <tr key={c.id}><td><Link to={`/clientes/${c.id}`} className="strong">{cleanName(c.name)}</Link></td><td className="right tnum">{money(c.receita)}</td><td className="right tnum">{money(c.custos_diretos)}</td>
              <td className="right tnum">{c.repasses == null ? <StateTag s={S.repasses === 'restrito' ? 'bloqueado' : 'aguardando_configuracao'}>{S.repasses === 'restrito' ? 'restrito' : 'sem regra'}</StateTag> : money(c.repasses)}</td><td className="num tnum">{c.demandas}</td><td className="num tnum">{c.ajustes_internos}</td><td className="num tnum">{c.ajustes_cliente}</td>
              <td className="right tnum">{c.custo_retrabalho == null ? '—' : money(c.custo_retrabalho)}</td><td className="right tnum strong">{c.margem == null ? '—' : money(c.margem)}</td></tr>)}</tbody>
          </table></div>
        )}
        <p className="xs muted mt-2">Cálculo determinístico: margem = receita − custos diretos − repasses. THE BOLD (cliente interno) fica fora. A IA não calcula nem altera valor.</p>
      </Section>
      <Section title="Evolução" kicker="Últimos 6 meses">
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Competência</th><th className="right">Faturado</th><th className="right">Recebido</th><th className="right">Custos</th></tr></thead>
          <tbody>{data.evolucao.map((e) => <tr key={e.competencia}><td className="tnum">{e.competencia}</td><td className="right tnum">{val(e.faturado, S.receita)}</td><td className="right tnum">{val(e.recebido, S.receita)}</td><td className="right tnum">{val(e.custos, S.custos)}</td></tr>)}</tbody>
        </table></div>
      </Section>
    </div>
  );
}

const TPL = [['fin.tpl.lembrete_d1', 'Lembrete D-1'], ['fin.tpl.cobranca_d0', 'Cobrança no dia do vencimento'], ['fin.tpl.cobranca_pos', 'Cobrança após o vencimento']];
export function ConfigFinanceira() {
  const { data, error, loading, reload } = useApi('/negocio/config');
  const toast = useToast();
  const [f, setF] = useState(null);
  if (error) return <ErrorBox error={error} />;
  if (loading && !data) return <Loading />;
  const c = f || data.config;
  const set = (k, v) => setF({ ...c, [k]: v });
  const save = async () => {
    const patch = Object.fromEntries(Object.entries(c).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(data.config[k])).filter(([k]) => data.can_repasses || !['fin.dia_fechamento', 'fin.email_relatorio', 'fin.repasse_motivos_contabilizados'].includes(k)));
    try { await api.put('/negocio/config', patch); setF(null); toast('Configuração financeira salva (registrada no histórico).'); reload(); } catch (e) { toast(e.message, 'err'); }
  };
  const ro = !data.can_edit;
  const roRep = ro || !data.can_repasses;
  const motivos = c['fin.repasse_motivos_contabilizados'] || [];
  return (
    <div className="col gap-5">
      <div className="state-grid">
        <StatePanel compact s={data.mail.configured ? 'conectada' : 'aguardando_configuracao'} kicker="Remetente" title={data.mail.configured ? data.mail.from : 'E-mail não configurado no servidor'} missing={!data.mail.configured ? 'RESEND_API_KEY e BOLD_MAIL_FROM (Integrações → Resend).' : null} />
        <StatePanel compact s={c['fin.dia_fechamento'] ? 'ativo' : 'aguardando_decisao'} kicker="Fechamento de repasses" title={c['fin.dia_fechamento'] ? `Dia ${c['fin.dia_fechamento']}` : 'Dia não definido'} />
        <StatePanel compact s={c['fin.cobrancas_pos_vencimento'] ? 'ativo' : 'aguardando_decisao'} kicker="Cobranças após vencimento" title={c['fin.cobrancas_pos_vencimento'] ? `${c['fin.cobrancas_pos_vencimento']} · a cada ${c['fin.intervalo_pos_dias']} dias` : 'Nenhuma até a decisão'} />
      </div>
      <Section title="Cobrança" kicker="Régua de cobrança dos clientes">
        <div className="grid-2">
          <Field label="Lembrete um dia antes (D-1)"><select className="select" disabled={ro} value={c['fin.lembrete_d1'] ? '1' : '0'} onChange={(e) => set('fin.lembrete_d1', e.target.value === '1')}><option value="1">Enviar</option><option value="0">Não enviar</option></select></Field>
          <Field label="Cobrança no dia (D0)"><select className="select" disabled={ro} value={c['fin.cobranca_d0'] ? '1' : '0'} onChange={(e) => set('fin.cobranca_d0', e.target.value === '1')}><option value="1">Enviar</option><option value="0">Não enviar</option></select></Field>
          <Field label="Cobranças após o vencimento (0–5)" hint="0 = nenhuma. Decisão da CEO."><input className="input" disabled={ro} type="number" min="0" max="5" value={c['fin.cobrancas_pos_vencimento']} onChange={(e) => set('fin.cobrancas_pos_vencimento', Number(e.target.value))} /></Field>
          <Field label="Intervalo entre cobranças (dias)"><input className="input" disabled={ro} type="number" min="1" max="30" value={c['fin.intervalo_pos_dias']} onChange={(e) => set('fin.intervalo_pos_dias', Number(e.target.value))} /></Field>
          <Field label="Assinatura"><input className="input" disabled={ro} value={c['fin.assinatura']} onChange={(e) => set('fin.assinatura', e.target.value)} /></Field>
        </div>
      </Section>
      <Section title="Textos dos e-mails" kicker="Variáveis: {cliente} {valor} {vencimento} {referencia} {assinatura}">
        <div className="col gap-4">{TPL.map(([k, l]) => (
          <div key={k} className="col gap-2"><div className="caps">{l}</div>
            <input className="input" disabled={ro} value={c[k].subject} onChange={(e) => set(k, { ...c[k], subject: e.target.value })} aria-label={`Assunto — ${l}`} />
            <textarea className="textarea" disabled={ro} rows={5} value={c[k].body} onChange={(e) => set(k, { ...c[k], body: e.target.value })} aria-label={`Texto — ${l}`} />
          </div>
        ))}</div>
      </Section>
      <Section title="Repasses" kicker={roRep ? 'Só quem tem a permissão de Produção & Repasses altera' : 'Fechamento e apuração'}>
        <div className="grid-2">
          <Field label="Dia de fechamento (1–28)" hint="Neste dia a competência anterior é apurada e o relatório sai."><input className="input" disabled={roRep} type="number" min="1" max="28" value={c['fin.dia_fechamento'] ?? ''} onChange={(e) => set('fin.dia_fechamento', e.target.value === '' ? null : Number(e.target.value))} /></Field>
          <Field label="E-mail do relatório"><input className="input" disabled={roRep} type="email" value={c['fin.email_relatorio'] || ''} onChange={(e) => set('fin.email_relatorio', e.target.value || null)} /></Field>
        </div>
        <div className="caps mt-4 mb-2">Não realizadas que entram na apuração</div>
        <div className="row wrap gap-4">{[['cliente', 'Por cliente (material/aprovação)'], ['processo', 'Por bloqueio de processo'], ['escopo', 'Canceladas (escopo)'], ['sem_motivo', 'Sem motivo registrado']].map(([k, l]) => (
          <label key={k} className="row gap-2 sm"><input type="checkbox" disabled={roRep} checked={motivos.includes(k)} onChange={(e) => set('fin.repasse_motivos_contabilizados', e.target.checked ? [...motivos, k] : motivos.filter((x) => x !== k))} />{l}</label>
        ))}</div>
      </Section>
      {!ro && <div><Button variant="primary" onClick={save} disabled={!f}>Salvar configuração</Button></div>}
    </div>
  );
}
