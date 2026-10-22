// FICHA DO CONTEÚDO — a estrutura real do card (CR EDITORIAL): dados, responsáveis por função, corpo em blocos adaptado ao
// formato (carrossel: capa + cards · reel: roteiro · foto/estático: briefing) e etapas de aprovação separadas.
// O que veio do Notion aparece marcado; pessoa do Notion sem correspondência aparece como AGUARDANDO MAPEAMENTO.
import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useApi, useToast } from '../../lib/hooks.js';
import { Button, Loading, ErrorBox, Field, Tag } from '../../components/ui.jsx';
import { StateTag } from '../../components/State.jsx';
import { FORMATS } from '../../lib/status.js';
import { fmtDate, fmtDateTime } from '../../lib/format.js';

const STATE = { aprovado: ['ativo', 'Aprovado'], ajuste: ['erro', 'Ajuste pedido'], em_revisao: ['aguardando_decisao', 'Em revisão'], pendente: ['dados_insuficientes', 'Pendente'] };
const NOTION_CHECKS = { tema: 'APROVAÇÃO TEMA', texto: null, legenda: 'APROVAÇÃO LEGENDA', arte: 'APROVAÇÃO ARTE' };
// Texto com links clicáveis e quebras preservadas (o texto integral, sem resumir)
function Rich({ text }) {
  const parts = String(text || '').split(/(https?:\/\/[^\s)]+)/g);
  return <div className="fc-rich">{parts.map((p, i) => (/^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noreferrer">{p}</a> : <span key={i}>{p}</span>))}</div>;
}

export default function FichaConteudo({ contentId, people: team }) {
  const { data, error, loading, reload } = useApi(`/contents/${contentId}/ficha`, [contentId]);
  const toast = useToast();
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  if (error) return <ErrorBox error={error} />;
  if (loading && !data) return <Loading rows={3} />;
  const run = async (fn, ok) => { setBusy(true); try { await fn(); toast(ok); reload(); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); } };
  const f = data.fields;
  const np = data.notion?.history?.properties || {};
  return (
    <section className="fc" aria-label="Ficha do conteúdo">
      <div className="fc-grid">
        <div className="fc-fields">
          <div className="caps mb-2">Ficha</div>
          <dl className="fc-dl">
            <div><dt>Data de publicação</dt><dd>{f.data ? fmtDate(f.data) : <span className="faint">sem data</span>}</dd></div>
            <div><dt>Tipo</dt><dd>{FORMATS[f.tipo] || f.tipo}</dd></div>
            <div><dt>Estratégia</dt><dd>{f.estrategia.length ? <span className="row wrap gap-2">{f.estrategia.map((t) => <Tag key={t}>{t}</Tag>)}</span> : <span className="faint">—</span>}</dd></div>
            <div><dt>Objetivo</dt><dd>{f.objetivo ? <Rich text={f.objetivo} /> : <span className="faint">—</span>}</dd></div>
            <div><dt>Referência</dt><dd>{f.referencia ? <Rich text={f.referencia} /> : <span className="faint">—</span>}</dd></div>
          </dl>
          <div className="caps mt-4 mb-2">Responsáveis</div>
          <dl className="fc-dl">
            {Object.entries(data.roles).map(([k, label]) => {
              const p = data.people[k];
              return (
                <div key={k}><dt>{label}</dt><dd>
                  {data.can.edit ? (
                    <select className="select fc-sel" value={p?.user_id || ''} disabled={busy} onChange={(e) => run(() => api.put(`/contents/${contentId}/pessoas`, { [k]: e.target.value || null }), 'Responsável atualizado.')}>
                      <option value="">{p?.notion_user_id && !p.user_id ? 'Pessoa do Notion — aguardando mapeamento' : '—'}</option>
                      {(team || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  ) : p?.name || (p?.notion_user_id ? <StateTag s="aguardando_configuracao">Aguardando mapeamento</StateTag> : <span className="faint">—</span>)}
                </dd></div>
              );
            })}
          </dl>
        </div>

        <div className="fc-steps">
          <div className="caps mb-2">Etapas de aprovação</div>
          <ol className="fc-ol">{data.steps.map((s) => {
            const [tone, label] = STATE[s.state] || STATE.pendente;
            const nk = NOTION_CHECKS[s.key];
            return (
              <li key={s.key}>
                <div className="row between gap-2"><b>{s.label}</b><StateTag s={tone}>{label}</StateTag></div>
                <span className="xs muted">{s.who}{s.by ? ` · ${s.by}` : ''}{s.at ? ` · ${fmtDateTime(s.at)}` : ''}{s.note ? ` · ${s.note}` : ''}</span>
                {nk && nk in np && <span className="xs faint">Notion: {np[nk] === true || np[nk] === '__YES__' ? 'marcado' : 'não marcado'} (informativo — não vale como aprovação)</span>}
                {s.internal && data.can.review && (
                  <div className="row wrap gap-2 mt-2">
                    <Button size="sm" disabled={busy} onClick={() => run(() => api.post(`/contents/${contentId}/checks`, { step: s.key, decision: 'aprovado' }), `${s.label}: aprovado.`)}>Aprovar</Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => { const note = prompt(`O que precisa mudar em ${s.label.toLowerCase()}?`); if (note) run(() => api.post(`/contents/${contentId}/checks`, { step: s.key, decision: 'ajuste', note }), 'Ajuste registrado.'); }}>Pedir ajuste</Button>
                    {s.state !== 'pendente' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => api.post(`/contents/${contentId}/checks`, { step: s.key, decision: 'desfeito' }), 'Marcação desfeita (fica no histórico).')}>Desfazer</Button>}
                  </div>
                )}
              </li>
            );
          })}</ol>
          <p className="xs muted" style={{ margin: 0 }}>A aprovação formal é do cliente, na versão, pelo feed. Se ele pedir alteração depois de aprovar, o conteúdo volta para ajuste e a nova versão passa por nova aprovação.</p>
        </div>
      </div>

      <div className="fc-body">
        <div className="row between wrap gap-2 mb-2">
          <div className="caps">Corpo do conteúdo · {FORMATS[f.tipo] || f.tipo}</div>
          {data.can.edit && (
            <div className="row wrap gap-2">{[...data.suggested, ['texto', 'Bloco livre']].map(([kind, title]) => (
              <Button key={kind + title} size="sm" variant="ghost" disabled={busy} onClick={() => run(() => api.post(`/contents/${contentId}/secoes`, { kind, title: kind === 'card' ? `Card ${data.sections.filter((x) => x.kind === 'card').length + 2}` : title }), 'Bloco adicionado.')}>+ {kind === 'card' ? 'Card' : title}</Button>
            ))}</div>
          )}
        </div>
        {!data.sections.length ? (
          <p className="sm muted" style={{ margin: 0 }}>Sem corpo registrado na plataforma.{data.notion ? ' O corpo do card no Notion (capa, cards, roteiro) não veio na extração de 21/10 — chega pela sincronização com o Notion (aguardando token).' : ' Use os botões acima para montar a estrutura deste formato.'}</p>
        ) : (
          <div className="fc-sections">{data.sections.map((s) => (
            <article key={s.id} className={`fc-sec ${s.source === 'notion' ? 'notion' : ''}`}>
              <header className="row between gap-2"><h4>{s.title || s.kind}</h4><span className="row gap-2">{s.source === 'notion' && <span className="tag tag-mig">Notion</span>}{data.can.edit && edit?.id !== s.id && <Button size="sm" variant="ghost" onClick={() => setEdit({ id: s.id, title: s.title || '', body: s.body })}>Editar</Button>}</span></header>
              {edit?.id === s.id ? (
                <div className="col gap-2">
                  <Field label="Título"><input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
                  <Field label="Texto (integral; links ficam clicáveis)"><textarea className="textarea" rows={8} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></Field>
                  <div className="row gap-2"><Button size="sm" variant="primary" disabled={busy} onClick={() => run(async () => { await api.put(`/contents/${contentId}/secoes/${s.id}`, { title: edit.title, body: edit.body }); setEdit(null); }, 'Bloco salvo (antes e depois no histórico).')}>Salvar</Button><Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button></div>
                </div>
              ) : s.body ? <Rich text={s.body} /> : <p className="xs faint" style={{ margin: 0 }}>Vazio.</p>}
              {s.updated_by_name && <span className="xs faint">{s.updated_by_name} · {fmtDateTime(s.updated_at)}</span>}
            </article>
          ))}</div>
        )}
      </div>

      <div className="fc-notion">
        <div className="caps mb-2">Notion</div>
        {data.notion ? (
          <p className="sm" style={{ margin: 0 }}>Vinculado ao card do CR Editorial <a href={data.notion.notion_url} target="_blank" rel="noreferrer">abrir no Notion ↗</a> · dados da extração de {data.notion.last_synced_at ? fmtDate(data.notion.last_synced_at) : '—'} · <StateTag s="aguardando_configuracao">Sincronização viva aguardando token</StateTag>
            {data.can.edit && <> · <button className="btn btn-sm btn-ghost" onClick={() => { const reason = prompt('Motivo para desvincular (os valores anteriores voltam):'); if (reason) run(() => api.post(`/contents/${contentId}/notion-desvincular`, { reason }), 'Desvinculado; valores anteriores restaurados.'); }}>desvincular</button></>}</p>
        ) : <p className="sm muted" style={{ margin: 0 }}>Sem vínculo com um card do CR Editorial. O vínculo é feito no calendário editorial do cliente (cartão “Notion” → Vincular).</p>}
      </div>
    </section>
  );
}
