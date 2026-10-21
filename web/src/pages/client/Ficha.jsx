// FICHA — tudo o que se sabe do cliente, sempre com a ORIGEM visível:
// o que o cliente respondeu no onboarding, o que a equipe registrou e o que é observação interna.
import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useApi, useToast } from '../../lib/hooks.js';
import { Button, Empty, ErrorBox, Field, Loading, Seg } from '../../components/ui.jsx';
import { I } from '../../components/Icons.jsx';
import { ago, fmtDateTime } from '../../lib/format.js';
import '../../styles/ficha.css';

export const SECTION_LABEL = {
  posicionamento: 'Posicionamento', identidade: 'Identidade e universo de marca', diferenciais: 'Diferenciais', publico: 'Público', persona: 'Persona',
  tom: 'Tom de voz', linguagem: 'Linguagem e atributos', oferta: 'Oferta', produtos: 'Produtos e serviços', objetivos: 'Objetivos', diagnostico: 'Diagnóstico',
  estrategia: 'Estratégia', identidade_visual: 'Design e identidade visual', preferencias: 'Preferências', restricoes: 'Restrições', referencias: 'Referências',
  regras: 'Regras específicas', importante: 'Informações importantes', historico: 'Histórico', operacional: 'Operacional', observacoes: 'Observações', outro: 'Outras informações',
};
export const ORIGIN = {
  onboarding_cliente: ['Cliente · onboarding', 'o-cliente'], equipe: ['Equipe', 'o-equipe'],
  observacao_interna: ['Observação interna', 'o-interna'], indefinido: ['Origem a confirmar', 'o-indef'],
  cliente: ['Cliente · plataforma', 'o-cliente'], ia: ['IA · sugestão (não oficial)', 'o-indef'], decisao: ['Decisão', 'o-equipe'],
};
const NOT_SHAREABLE = ['observacao_interna', 'ia', 'indefinido'];
const SOURCE = { notion: 'Notion', notion_onboarding: 'Notion · formulário', onboarding: 'Plataforma · formulário', plataforma: 'Plataforma' };
export const ISSUE = { escopo: 'Escopo', formulario_antigo: 'Formulário antigo', arquivos_nao_lidos: 'Arquivos não lidos', inconsistencia: 'Inconsistência', conflito: 'Conflito', resposta_multipla: 'Resposta múltipla', duplicado: 'Possível duplicado', pagina_inacessivel: 'Página não lida', arquivo_no_notion: 'Arquivo no Notion', status: 'Status', equipe: 'Equipe', campo_sem_secao: 'Sem seção', quadro_mensal: 'Quadro mensal', novembro: 'Quadro mensal' };

export function OriginChip({ origin }) {
  const [label, cls] = ORIGIN[origin] || ORIGIN.indefinido;
  return <span className={`o-chip ${cls}`}>{label}</span>;
}

export default function Ficha({ clientId }) {
  const { data, error, loading, reload } = useApi(`/clients/${clientId}/ficha`, [clientId], { live: false });
  const [view, setView] = useState('brain');
  if (error) return <ErrorBox error={error} />;
  if (loading || !data) return <Loading rows={6} />;
  const open = data.issues.filter((i) => i.status === 'aberto').length;
  return (
    <div className="ficha">
      {data.source.notion_url && (
        <p className="ficha-src xs muted">
          Migrado do Notion · {data.source.notion_section || 'seção não informada'} · <a className="link" href={data.source.notion_url} target="_blank" rel="noreferrer">abrir página de origem</a>
          {data.source.aliases.length > 0 && <> · também aparece como: {data.source.aliases.join(', ')}</>}
        </p>
      )}
      <Seg label="Seção da ficha" value={view} onChange={setView} options={[
        { value: 'brain', label: `Client Brain · ${data.entries.length}` },
        { value: 'onboarding', label: `Onboarding · ${data.form_status?.answered || 0}/${data.form_status?.total || 0}` },
        { value: 'links', label: `Links e arquivos · ${data.links.length}` },
        { value: 'acessos', label: `Acessos · ${data.secrets.length}` },
        ...(data.issues.length ? [{ value: 'revisao', label: `Revisão · ${open}` }] : []),
      ]} />
      <div className="mt-5">
        {view === 'brain' && <Entries data={data} clientId={clientId} reload={reload} />}
        {view === 'onboarding' && <Answers data={data} />}
        {view === 'links' && <Links links={data.links} />}
        {view === 'acessos' && <Secrets data={data} clientId={clientId} />}
        {view === 'revisao' && <Issues issues={data.issues} reload={reload} canEdit={data.can_edit} />}
      </div>
    </div>
  );
}

function Entries({ data, clientId, reload }) {
  const toast = useToast();
  const [origin, setOrigin] = useState('todas');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ section: 'observacoes', label: '', content: '', origin: 'equipe' });
  const [adding, setAdding] = useState(false);
  const list = data.entries.filter((e) => origin === 'todas' || e.origin === origin);
  const bySection = data.sections.map((s) => [s, list.filter((e) => e.section === s)]).filter(([, l]) => l.length);
  const save = async (e) => {
    try { await api.patch(`/clients/${clientId}/brain-entries/${e.id}`, { content: editing.content, section: editing.section }); toast('Registro atualizado (alteração no histórico).'); setEditing(null); reload(); } catch (err) { toast(err.message, 'err'); }
  };
  const share = async (e) => {
    try { await api.patch(`/clients/${clientId}/brain-entries/${e.id}/share`, { shared: !e.shared }); toast(e.shared ? 'Retirado de “Sua marca”.' : 'Compartilhado: o cliente vê e pode confirmar ou pedir atualização.'); reload(); } catch (err) { toast(err.message, 'err'); }
  };
  const add = async () => {
    try { await api.post(`/clients/${clientId}/brain-entries`, draft); toast('Informação registrada.'); setDraft({ ...draft, label: '', content: '' }); setAdding(false); reload(); } catch (err) { toast(err.message, 'err'); }
  };
  return (
    <>
      <div className="row between wrap gap-3">
        <Seg label="Origem" value={origin} onChange={setOrigin} options={[{ value: 'todas', label: 'Todas' }, ...Object.entries(ORIGIN).map(([k, [l]]) => ({ value: k, label: l }))]} />
        {data.can_edit && <Button size="sm" icon={<I.plus size={14} />} onClick={() => setAdding((v) => !v)}>Registrar informação</Button>}
      </div>
      {adding && (
        <div className="panel mt-4 col gap-3">
          <div className="row wrap gap-3">
            <Field label="Seção"><select className="input" value={draft.section} onChange={(e) => setDraft({ ...draft, section: e.target.value })}>{data.sections.map((s) => <option key={s} value={s}>{SECTION_LABEL[s] || s}</option>)}</select></Field>
            <Field label="Origem"><select className="input" value={draft.origin} onChange={(e) => setDraft({ ...draft, origin: e.target.value })}><option value="equipe">Equipe</option><option value="observacao_interna">Observação interna</option></select></Field>
          </div>
          <Field label="Título (opcional)"><input className="input" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></Field>
          <Field label="Conteúdo"><textarea className="input" rows={4} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} /></Field>
          <div className="row gap-2"><Button variant="primary" size="sm" onClick={add}>Salvar</Button><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button></div>
        </div>
      )}
      {!bySection.length ? <Empty title="Nenhuma informação registrada.">Campos sem informação no Notion ficam vazios — nada é preenchido por suposição.</Empty> : bySection.map(([s, l]) => (
        <section key={s} className="ficha-sec">
          <h3 className="caps">{SECTION_LABEL[s] || s} <span className="faint">{l.length}</span></h3>
          {l.map((e) => (
            <article key={e.id} className="ficha-entry">
              <div className="row between wrap gap-2">
                <div className="sm strong">{e.label || 'Sem título'}</div>
                <div className="row gap-2"><OriginChip origin={e.origin} />{e.shared ? <span className="tag tag-bordo" title="Aparece para o cliente em “Sua marca”">compartilhado</span> : null}
                  {data.can_edit && editing?.id !== e.id && !NOT_SHAREABLE.includes(e.origin) && <button className="btn btn-sm btn-ghost" onClick={() => share(e)} title="Mostrar ao cliente em “Sua marca, como a The Bold entende”">{e.shared ? 'Tirar de “Sua marca”' : 'Compartilhar com o cliente'}</button>}
                  {data.can_edit && editing?.id !== e.id && <button className="btn btn-sm btn-ghost" onClick={() => setEditing({ id: e.id, content: e.content, section: e.section })}>Editar</button>}</div>
              </div>
              {editing?.id === e.id ? (
                <div className="col gap-2 mt-2">
                  <select className="input" value={editing.section} onChange={(ev) => setEditing({ ...editing, section: ev.target.value })}>{data.sections.map((x) => <option key={x} value={x}>{SECTION_LABEL[x] || x}</option>)}</select>
                  <textarea className="input" rows={Math.min(14, Math.max(3, editing.content.split('\n').length + 1))} value={editing.content} onChange={(ev) => setEditing({ ...editing, content: ev.target.value })} />
                  <div className="row gap-2"><Button size="sm" variant="primary" onClick={() => save(e)}>Salvar</Button><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button></div>
                </div>
              ) : <div className="ficha-content">{e.content}</div>}
              <div className="xs faint mt-2">
                {SOURCE[e.source_type] || e.source_type}{e.source_page ? ` · ${e.source_page}` : ''}
                {e.source_url && <> · <a className="link" href={e.source_url} target="_blank" rel="noreferrer">origem</a></>}
                {e.author ? ` · por ${e.author}` : ''}{e.updated_at ? ` · editado ${ago(e.updated_at)}${e.editor ? ` por ${e.editor}` : ''}` : ''}
              </div>
            </article>
          ))}
        </section>
      ))}
    </>
  );
}

function Answers({ data }) {
  const st = data.form_status;
  const label = { nao_iniciado: 'Não iniciado', em_andamento: 'Em preenchimento', concluido: 'Concluído' }[st?.status] || st?.status;
  return (
    <>
      <p className="sm muted">Formulário oficial “Sua marca” (ESPAÇO CLIENTE). Status: <b>{label}</b>{st?.submitted_at ? ` · enviado em ${fmtDateTime(st.submitted_at)}` : ''} · {st?.answered} de {st?.total} respondidas.</p>
      {data.onboarding.map((s) => (
        <section key={s.title} className="ficha-sec">
          <h3 className="caps">{s.title}</h3>
          {s.questions.map((q) => (
            <div key={q.key} className={`ficha-q ${q.answer?.answer ? '' : 'empty'}`}>
              <div className="sm strong">{q.text}</div>
              {q.answer?.answer ? <div className="ficha-content">{q.answer.answer}</div> : <div className="xs faint">sem resposta</div>}
              {q.answer && <div className="xs faint">{SOURCE[q.answer.source_type] || q.answer.source_type}{q.answer.answered_by_name ? ` · ${q.answer.answered_by_name}` : ''} · {fmtDateTime(q.answer.updated_at)}</div>}
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

function Links({ links }) {
  if (!links.length) return <Empty title="Nenhum link ou arquivo." />;
  return (
    <ul className="list">{links.map((l) => (
      <li key={l.id}>
        <span className="tag">{l.kind === 'arquivo' ? 'Arquivo' : 'Link'}</span>
        <div className="grow"><div className="sm">{l.label || l.url}</div><div className="xs faint">{l.source_page ? `${l.source_page} · ` : ''}{l.source_type === 'notion' ? 'Notion' : 'Plataforma'}</div></div>
        {l.url.startsWith('http') ? <a className="btn btn-sm btn-ghost" href={l.url} target="_blank" rel="noreferrer">Abrir</a> : <span className="xs faint" title={l.url}>no Notion</span>}
      </li>
    ))}</ul>
  );
}

function Secrets({ data, clientId }) {
  const toast = useToast();
  const [shown, setShown] = useState({});
  const reveal = async (s) => {
    try { const r = await api.post(`/clients/${clientId}/secrets/${s.id}/reveal`); setShown((x) => ({ ...x, [s.id]: r.value })); toast('Visualização registrada no histórico.'); } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <>
      <p className="sm muted">Logins e senhas ficam cifrados. Senhas do Notion não foram migradas. Recomendado: acesso de parceiro pelo Meta Business, sem compartilhar senha.</p>
      {!data.secrets.length ? <Empty title="Nenhum acesso guardado." /> : (
        <ul className="list">{data.secrets.map((s) => (
          <li key={s.id}>
            <I.lock size={14} />
            <div className="grow"><div className="sm">{s.label.replace(/:$/, '')}</div><div className="xs faint">{s.provided_by_name ? `informado por ${s.provided_by_name} · ` : ''}{ago(s.updated_at || s.created_at)}</div></div>
            {shown[s.id] !== undefined ? <code className="sm">{shown[s.id]}</code> : data.can_reveal ? <Button size="sm" variant="ghost" onClick={() => reveal(s)}>Revelar</Button> : <span className="xs faint">acesso restrito</span>}
          </li>
        ))}</ul>
      )}
    </>
  );
}

function Issues({ issues, reload, canEdit }) {
  const toast = useToast();
  const set = async (i, status) => { try { await api.patch(`/migration-issues/${i.id}`, { status }); reload(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <>
      <p className="sm muted">Pontos da migração que precisam de decisão humana. Nada aqui foi escolhido automaticamente.</p>
      <ul className="list">{issues.map((i) => (
        <li key={i.id} className={i.status !== 'aberto' ? 'faint' : ''}>
          <span className="tag">{ISSUE[i.kind] || i.kind}</span>
          <div className="grow sm">{i.description}</div>
          {canEdit && (i.status === 'aberto'
            ? <><Button size="sm" variant="ghost" onClick={() => set(i, 'resolvido')}>Resolvido</Button><Button size="sm" variant="ghost" onClick={() => set(i, 'ignorado')}>Ignorar</Button></>
            : <button className="btn btn-sm btn-ghost" onClick={() => set(i, 'aberto')}>{i.status} · reabrir</button>)}
        </li>
      ))}</ul>
    </>
  );
}
