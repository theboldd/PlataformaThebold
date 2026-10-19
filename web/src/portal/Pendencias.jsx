import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, uploadWithProgress } from '../lib/api.js';
import { useApi, useToast } from '../lib/hooks.js';
import { fmtDate, ago } from '../lib/format.js';
import { Button, Loading, ErrorBox, Empty } from '../components/ui.jsx';
import { I } from '../components/Icons.jsx';
import { usePortal } from './PortalApp.jsx';

const KIND = { formulario: 'Formulário', material: 'Material', acesso: 'Acesso' };

export default function Pendencias() {
  const { data, error, reload } = useApi('/portal/pendencias');
  const { reloadMe } = usePortal() || {};
  const refresh = () => { reload(); reloadMe?.(); };
  if (error) return <div className="p-page"><ErrorBox error={error} /></div>;
  if (!data) return <div className="p-page"><Loading rows={6} /></div>;
  const openOnb = data.onboarding.filter((o) => o.status === 'pendente');
  const nothing = !openOnb.length && !data.approvals.length && !data.materials.length;
  return (
    <div className="p-page" style={{ maxWidth: 820 }}>
      <header className="p-page-head">
        <div className="caps">O que precisa de você</div>
        <h1 className="ed-xl">Pendências</h1>
        <p className="p-lede">Tudo aqui destrava o seu conteúdo. Leva poucos minutos.</p>
      </header>
      {nothing && <Empty title="Nenhuma pendência com você.">Obrigado! Está tudo em dia.</Empty>}

      {data.approvals.length > 0 && (
        <section className="mb-5">
          <div className="section-head"><h2 className="ed-md">Aprovações</h2><span className="caps">{data.approvals.length}</span></div>
          {data.approvals.map((a) => (
            <div key={a.id} className="p-pend">
              <span className="k" aria-hidden />
              <div className="grow"><div className="ttl">#{a.number} {a.title}</div><div className="sm muted">{a.stage === 'aprovacao_tema' ? 'Tema aguardando sua aprovação' : 'Conteúdo pronto para você aprovar'} · enviado {ago(a.stage_entered_at)}</div></div>
              <Link to="/portal" className="btn btn-sm" data-cursor="VER">Ver no feed</Link>
            </div>
          ))}
        </section>
      )}

      {data.materials.length > 0 && (
        <section className="mb-5">
          <div className="section-head"><h2 className="ed-md">Materiais que precisamos</h2><span className="caps">{data.materials.length}</span></div>
          {data.materials.map((m) => <MaterialRow key={m.id} m={m} onDone={refresh} />)}
        </section>
      )}

      {data.onboarding.length > 0 && (
        <section>
          <div className="section-head"><h2 className="ed-md">Onboarding</h2><span className="caps">{data.onboarding.length - openOnb.length}/{data.onboarding.length} concluídos</span></div>
          {data.onboarding.map((o) => <OnbRow key={o.id} o={o} onDone={refresh} />)}
        </section>
      )}
    </div>
  );
}

function MaterialRow({ m, onDone }) {
  return (
    <div className="p-pend">
      <span className="k" aria-hidden />
      <div className="grow">
        <div className="ttl">{m.block_reason}</div>
        <div className="sm muted">Para: #{m.number} {m.title}{m.planned_at ? ` · publicação ${fmtDate(m.planned_at)}` : ''}</div>
        <Uploader extra={{ content_id: m.id }} label="Enviar material" onDone={onDone} />
      </div>
    </div>
  );
}

function OnbRow({ o, onDone }) {
  const toast = useToast();
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  const done = o.status !== 'pendente';
  const send = async (e) => {
    e.preventDefault();
    if (!val.trim()) return;
    setBusy(true);
    try { await api.post(`/portal/onboarding/${o.id}`, { value: val.trim() }); toast('Recebido. Obrigado!'); onDone(); } catch (x) { toast(x.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <div className={`p-pend ${done ? 'done' : ''}`}>
      <span className="k" aria-hidden>{done ? <I.check size={14} /> : null}</span>
      <div className="grow">
        <div className="ttl">{((s) => s.charAt(0).toUpperCase() + s.slice(1))(o.label.replace('Briefing “Sua marca”: ', '').replace('Briefing: ', ''))}</div>
        <div className="xs muted">{KIND[o.kind]}{o.due_at && !done ? ` · até ${fmtDate(o.due_at)}` : ''}{done ? ' · recebido' : ''}</div>
        {!done && o.kind === 'material' && <Uploader extra={{ onboarding_item: o.id }} label="Enviar arquivos" onDone={onDone} />}
        {!done && o.kind !== 'material' && (
          <form onSubmit={send} className="col gap-2 mt-4">
            <textarea className="textarea" rows={3} value={val} onChange={(e) => setVal(e.target.value)} aria-label={o.label}
              placeholder={o.kind === 'acesso' ? 'Como você liberou o acesso? (ex.: “convite enviado para a conta da The Bold”). Não escreva senhas aqui.' : 'Conte com suas palavras…'} />
            <div><Button size="sm" variant="primary" disabled={busy || !val.trim()}>{busy ? 'Enviando…' : 'Enviar resposta'}</Button></div>
          </form>
        )}
      </div>
    </div>
  );
}

export function Uploader({ extra = {}, label = 'Enviar arquivos', onDone, big }) {
  const toast = useToast();
  const input = useRef(null);
  const [progress, setProgress] = useState(null);
  const [over, setOver] = useState(false);
  const upload = async (files) => {
    if (!files?.length) return;
    const fd = new FormData();
    [...files].forEach((f) => fd.append('files', f));
    Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
    setProgress(0);
    try { await uploadWithProgress('/portal/materials', fd, setProgress); toast(`${files.length} arquivo(s) enviado(s) em qualidade original.`); onDone?.(); }
    catch (x) { toast(x.message, 'err'); } finally { setProgress(null); if (input.current) input.current.value = ''; }
  };
  const picker = <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} accept="image/*,video/*,application/pdf,.zip" />;
  if (big) return (
    <div className={`p-drop ${over ? 'over' : ''}`} role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }} data-cursor="ENVIAR">
      {picker}
      <I.upload size={28} />
      <div className="ed-lg">{progress != null ? `Enviando… ${Math.round(progress * 100)}%` : 'Arraste arquivos aqui'}</div>
      <div className="sm muted">ou toque para escolher · fotos, vídeos e documentos são guardados no tamanho original</div>
      {progress != null && <div className="p-uploading" style={{ maxWidth: 320, margin: '14px auto 0' }}><span style={{ width: `${progress * 100}%` }} /></div>}
    </div>
  );
  return (
    <div className="mt-4">
      {picker}
      <Button size="sm" icon={<I.upload size={14} />} onClick={() => input.current?.click()} disabled={progress != null}>{progress != null ? `Enviando ${Math.round(progress * 100)}%` : label}</Button>
      {progress != null && <div className="p-uploading" style={{ maxWidth: 240 }}><span style={{ width: `${progress * 100}%` }} /></div>}
    </div>
  );
}
