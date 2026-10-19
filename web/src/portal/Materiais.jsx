import { useApi } from '../lib/hooks.js';
import { ago, bytes } from '../lib/format.js';
import { Loading, ErrorBox, Empty } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { Uploader } from './Pendencias.jsx';
import { usePortal } from './PortalApp.jsx';

export default function Materiais() {
  const { data, error, reload } = useApi('/portal/materials');
  const { reloadMe } = usePortal() || {};
  return (
    <div className="p-page">
      <header className="p-page-head">
        <div className="caps">Seus arquivos</div>
        <h1 className="ed-xl">Materiais</h1>
        <p className="p-lede">Envie fotos, vídeos e referências direto para a equipe. Nada é comprimido: guardamos o arquivo original.</p>
      </header>
      <Uploader big onDone={() => { reload(); reloadMe?.(); }} />
      <section className="section">
        <div className="section-head"><h2 className="ed-md">Enviados e compartilhados</h2>{data && <span className="caps">{data.length} arquivos</span>}</div>
        <ErrorBox error={error} />
        {!data ? <Loading /> : !data.length ? <Empty title="Nenhum arquivo ainda." /> : (
          <div className="p-files">
            {data.map((f) => (
              <div key={f.id} className="p-file">
                <a className="thumb" href={f.urls.original} target="_blank" rel="noreferrer" data-cursor="VER" aria-label={`Abrir ${f.name}`}>
                  {f.kind === 'image' && f.urls.thumb ? <img src={f.urls.thumb} alt="" loading="lazy" /> : f.kind === 'video' && f.urls.poster ? <img src={f.urls.poster} alt="" loading="lazy" /> : <I.file size={28} />}
                </a>
                <div className="info">
                  <span className="clip" title={f.name}>{f.name}</span>
                  <span className="faint">{f.width ? `${f.width}×${f.height} · ` : ''}{bytes(f.size)} · {ago(f.created_at)}</span>
                  {f.processing === 'pendente' && <span className="faint">Gerando prévia…</span>}
                  <a className="p-link xs" href={f.urls.download}>Baixar original</a>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
