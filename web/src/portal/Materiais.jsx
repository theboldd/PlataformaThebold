// MATERIAIS — organizados por contexto: o que a equipe pediu, o que você enviou, o que a The Bold compartilhou.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { ago, bytes, fmtDate } from '../lib/format.js';
import { Loading, ErrorBox } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { Uploader } from './Pendencias.jsx';
import { usePortal } from './PortalApp.jsx';

function Files({ list, empty }) {
  if (!list.length) return <p className="sm muted">{empty}</p>;
  return (
    <div className="p-files">
      {list.map((f) => (
        <div key={f.id} className="p-file">
          <a className="thumb" href={f.urls.original} target="_blank" rel="noreferrer" data-cursor="VER" aria-label={`Abrir ${f.name}`}>
            {f.kind === 'image' && f.urls.thumb ? <img src={f.urls.thumb} alt="" loading="lazy" /> : f.kind === 'video' && f.urls.poster ? <img src={f.urls.poster} alt="" loading="lazy" /> : <I.file size={28} />}
          </a>
          <div className="info">
            <span className="clip" title={f.name}>{f.name}</span>
            {f.context && <span className="xs">{f.context}</span>}
            <span className="faint">{f.width ? `${f.width}×${f.height} · ` : ''}{bytes(f.size)} · {ago(f.created_at)}</span>
            <a className="p-link xs" href={f.urls.download}>Baixar original</a>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Materiais() {
  const { data, error, reload } = useApi('/portal/materials');
  const { reloadMe } = usePortal() || {};
  const [params] = useSearchParams();
  const [ctx, setCtx] = useState(params.get('pedido') || '');
  const [note, setNote] = useState('');
  const done = () => { reload(); reloadMe?.(); setNote(''); };
  useEffect(() => { if (params.get('pedido')) document.getElementById('enviar')?.scrollIntoView({ behavior: 'smooth' }); }, [params, data]);
  return (
    <div className="p-page">
      <header className="p-page-head">
        <div className="caps">Materiais</div>
        <h1 className="ed-xl">Seus arquivos</h1>
        <p className="p-lede">Fotos, vídeos, referências e documentos do seu projeto. Guardamos sempre o arquivo original, sem compressão.</p>
      </header>
      <ErrorBox error={error} />
      {!data ? <Loading /> : (
        <>
          <section className="p-mat-sec">
            <div className="p-sec-h"><span className="caps">Materiais solicitados</span><span className="xs faint">{data.requested.length || 'nada pendente'}</span></div>
            {!data.requested.length ? <p className="sm muted">Nenhum material pendente. Obrigado!</p> : (
              <ul className="p-req">{data.requested.map((r) => (
                <li key={r.key} className={ctx === r.key ? 'focus' : ''}>
                  <div className="grow"><b>{r.title}</b><small>{r.context}{r.due ? ` · até ${fmtDate(r.due)}` : ''}</small></div>
                  <Uploader label="Enviar" extra={{ context: r.key }} onDone={done} />
                </li>
              ))}</ul>
            )}
          </section>
          <section className="p-mat-sec" id="enviar">
            <div className="p-sec-h"><span className="caps">Enviar novos arquivos</span></div>
            <div className="p-mat-ctx">
              <label className="p-field"><span className="caps">Para que é?</span>
                <select className="p-select" value={ctx} onChange={(e) => setCtx(e.target.value)}>
                  <option value="">Escolha…</option>
                  {data.requested.length > 0 && <optgroup label="Pedidos da The Bold">{data.requested.map((r) => <option key={r.key} value={r.key}>{r.title}</option>)}</optgroup>}
                  {data.open_contents.length > 0 && <optgroup label="Para um conteúdo">{data.open_contents.map((c) => <option key={c.id} value={`conteudo:${c.id}`}>{c.title}</option>)}</optgroup>}
                  <option value="referencia">Referência (inspiração, exemplo)</option>
                  <option value="novo">Outro material — a The Bold recebe como solicitação</option>
                </select>
              </label>
              {(ctx === 'novo' || ctx === 'referencia') && <label className="p-field"><span className="caps">Conte em uma frase (opcional)</span><input className="p-input sq" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></label>}
            </div>
            {ctx ? <Uploader big extra={{ context: ctx, note }} onDone={done} /> : <p className="sm muted">Escolha para que é o material — assim ele chega para a pessoa certa e nada fica solto.</p>}
          </section>
          <section className="p-mat-sec">
            <div className="p-sec-h"><span className="caps">Materiais enviados</span><span className="xs faint">{data.sent.length} arquivo(s)</span></div>
            <Files list={data.sent} empty="Você ainda não enviou arquivos." />
          </section>
          <section className="p-mat-sec">
            <div className="p-sec-h"><span className="caps">Referências</span><span className="xs faint">{data.references.length} arquivo(s)</span></div>
            <Files list={data.references} empty="Nenhuma referência enviada." />
          </section>
          <section className="p-mat-sec">
            <div className="p-sec-h"><span className="caps">Arquivos do projeto</span><span className="xs faint">{data.from_team.length} arquivo(s)</span></div>
            <Files list={data.from_team} empty="A The Bold ainda não compartilhou arquivos." />
          </section>
        </>
      )}
    </div>
  );
}
