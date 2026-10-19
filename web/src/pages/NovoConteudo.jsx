import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, uploadWithProgress } from '../lib/api.js';
import { useApi, useAuth, useToast } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Button, Field, PageHead, Loading } from '../components/ui.jsx';
import { FORMATS, PRIORITY } from '../lib/status.js';
import { cleanName, bytes } from '../lib/format.js';
import { Dropzone } from './production/Dropzone.jsx';
import '../styles/production.css';

const TAGS = ['Educativo', 'Conexão', 'Pessoal', 'Desejo', 'Entretenimento', 'Prova social', 'Motivacional', 'Utilidade', 'Identificação', 'Venda', 'Autoridade', 'Posicionamento', 'Bastidores'];

export default function NovoConteudo() {
  useCrumbs('Conteúdos', 'Novo conteúdo');
  const auth = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { data: clients } = useApi('/clients', [], { live: false });
  const canDirect = auth.can('conteudos', 'approve');
  const [f, setF] = useState({ client_id: params.get('client_id') || '', format: 'carrossel', title: '', theme: '', objective: '', reference: '', briefing: '', internal_notes: '', planned_at: '', priority: 'media', strategy_tags: [], stage: 'cronograma', caption: '' });
  const [files, setFiles] = useState([]);
  const [deliver, setDeliver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleTag = (t) => setF({ ...f, strategy_tags: f.strategy_tags.includes(t) ? f.strategy_tags.filter((x) => x !== t) : [...f.strategy_tags, t] });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { caption, ...body } = f;
      const c = await api.post('/contents', { ...body, planned_at: f.planned_at ? new Date(f.planned_at).toISOString() : null, stage: f.stage === 'producao' ? 'producao' : undefined });
      if (caption.trim()) await api.put(`/contents/${c.id}/caption`, { caption });
      if (files.length) {
        const fd = new FormData();
        files.forEach((x) => fd.append('files', x));
        if (deliver) fd.append('deliver', '1');
        const r = await uploadWithProgress(`/contents/${c.id}/media`, fd, setProgress);
        if (r?.delivered) toast(`Entrega registrada: ${r.delivered}`);
      }
      toast(`Conteúdo #${c.number} criado — ${c.stage_label}`);
      nav(`/conteudos/${c.id}`);
    } catch (x) { toast(x.message, 'err'); } finally { setBusy(false); setProgress(null); }
  };

  if (!clients) return <div className="page"><Loading /></div>;
  return (
    <div className="page" style={{ maxWidth: 1080 }}>
      <PageHead kicker="Conteúdos" title="Novo conteúdo" sub="O conteúdo entra no processo e o sistema cria a primeira tarefa, atribui pela função e define o prazo pelo ciclo do mês." />
      <form onSubmit={submit} className="col gap-6">
        <div className="grid-2">
          <Field label="Cliente">
            <select className="select" value={f.client_id} onChange={set('client_id')} required>
              <option value="">Selecione…</option>{clients.map((c) => <option key={c.id} value={c.id}>{cleanName(c.name)}</option>)}
            </select>
          </Field>
          <Field label="Formato">
            <select className="select" value={f.format} onChange={set('format')}>{Object.entries(FORMATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </Field>
        </div>
        <Field label="Título"><input className="input" value={f.title} onChange={set('title')} required maxLength={140} placeholder="Título do conteúdo" /></Field>
        <div className="grid-2">
          <Field label="Tema"><input className="input" value={f.theme} onChange={set('theme')} /></Field>
          <Field label="Objetivo"><input className="input" value={f.objective} onChange={set('objective')} /></Field>
        </div>
        <Field label="Estratégia">
          <div className="row wrap gap-2">{TAGS.map((t) => <button type="button" key={t} className={`tag ${f.strategy_tags.includes(t) ? 'tag-bordo' : ''}`} style={{ cursor: 'pointer', background: f.strategy_tags.includes(t) ? undefined : 'none' }} onClick={() => toggleTag(t)} aria-pressed={f.strategy_tags.includes(t)}>{t}</button>)}</div>
        </Field>
        <div className="grid-2">
          <Field label="Referência"><input className="input" value={f.reference} onChange={set('reference')} placeholder="Link ou descrição" /></Field>
          <Field label="Data e hora previstas de publicação"><input className="input" type="datetime-local" value={f.planned_at} onChange={set('planned_at')} /></Field>
        </div>
        <Field label="Briefing"><textarea className="textarea" value={f.briefing} onChange={set('briefing')} placeholder="O que a próxima pessoa precisa saber para produzir sem perguntar." /></Field>
        <div className="grid-2">
          <Field label="Prioridade"><select className="select" value={f.priority} onChange={set('priority')}>{Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Entrada no processo" hint={canDirect ? 'Direto em produção apenas para conteúdos já aprovados (ex.: decididos em reunião).' : 'Somente quem aprova pode criar direto em produção.'}>
            <select className="select" value={f.stage} onChange={set('stage')}>
              <option value="cronograma">Cronograma (fluxo completo)</option>
              {canDirect && <option value="producao">Direto em produção</option>}
            </select>
          </Field>
        </div>
        <Field label="Informações internas" hint="Nunca visíveis ao cliente."><textarea className="textarea" value={f.internal_notes} onChange={set('internal_notes')} /></Field>

        <hr className="rule-strong" />
        <div className="section-head" style={{ marginBottom: 0 }}><h2 className="ed-md">Mídia e legenda <span className="sm muted" style={{ fontFamily: 'var(--font-sans)' }}>— opcional agora</span></h2></div>
        <Dropzone files={files} onFiles={setFiles} />
        {files.length > 0 && (
          <ul className="list">{files.map((x, i) => <li key={i} className="sm"><span className="idx">{i + 1}</span><span className="grow clip">{x.name}</span><span className="muted">{bytes(x.size)}</span><Button type="button" size="sm" variant="ghost" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remover</Button></li>)}</ul>
        )}
        {files.length > 0 && f.stage === 'producao' && <label className="check"><input type="checkbox" checked={deliver} onChange={(e) => setDeliver(e.target.checked)} /> Este é o arquivo final — registrar a entrega do design/edição</label>}
        <Field label="Legenda"><textarea className="textarea" style={{ minHeight: 140 }} value={f.caption} onChange={set('caption')} /></Field>
        {progress != null && <div className="progress" aria-label="Progresso do upload"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
        <div className="row end"><Button type="button" variant="ghost" onClick={() => nav(-1)}>Cancelar</Button><Button variant="primary" size="lg" magnetic arrow disabled={busy} type="submit" data-cursor="CRIAR">{busy ? (progress != null ? `Enviando ${Math.round(progress * 100)}%` : 'Criando…') : 'Criar conteúdo'}</Button></div>
      </form>
    </div>
  );
}
