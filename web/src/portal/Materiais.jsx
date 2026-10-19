// MATERIAIS — organizados por contexto: o que a equipe pediu, o que você enviou, o que a The Bold compartilhou.
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
  const done = () => { reload(); reloadMe?.(); };
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
            <div className="p-sec-h"><span className="caps">A equipe pediu</span><span className="xs faint">{data.requested.length || 'nada pendente'}</span></div>
            {!data.requested.length ? <p className="sm muted">Nenhum material pendente. Obrigado!</p> : (
              <ul className="p-req">{data.requested.map((r) => (
                <li key={r.kind + r.id}>
                  <div className="grow"><b>{r.title}</b><small>{r.context}{r.due ? ` · até ${fmtDate(r.due)}` : ''}</small></div>
                  <Uploader label="Enviar" extra={r.kind === 'conteudo' ? { content_id: r.id } : { onboarding_item: r.id }} onDone={done} />
                </li>
              ))}</ul>
            )}
          </section>
          <section className="p-mat-sec">
            <div className="p-sec-h"><span className="caps">Enviar novos arquivos</span></div>
            <Uploader big onDone={done} />
          </section>
          <section className="p-mat-sec">
            <div className="p-sec-h"><span className="caps">Enviados por você</span><span className="xs faint">{data.sent.length} arquivo(s)</span></div>
            <Files list={data.sent} empty="Você ainda não enviou arquivos." />
          </section>
          <section className="p-mat-sec">
            <div className="p-sec-h"><span className="caps">Compartilhados pela The Bold</span><span className="xs faint">{data.from_team.length} arquivo(s)</span></div>
            <Files list={data.from_team} empty="Nada compartilhado ainda." />
          </section>
        </>
      )}
    </div>
  );
}
