import { useRef, useState } from 'react';
import { I } from '../../components/Icons.jsx';

// Área de upload: arquivos vão íntegros ao servidor (sem compressão no navegador). O original é preservado.
export function Dropzone({ onFiles, files = [], append = true, label = 'Arraste imagens, vídeos ou carrossel — ou clique para escolher', accept = 'image/*,video/*' }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const add = (list) => { const arr = [...list]; onFiles(append ? [...files, ...arr] : arr); };
  return (
    <div className={`dropzone ${over ? 'over' : ''}`} onClick={() => input.current?.click()} role="button" tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }} data-cursor="ENVIAR">
      <I.upload size={22} style={{ margin: '0 auto 8px' }} />
      <div className="sm">{label}</div>
      <div className="xs faint mt-2">Qualidade original preservada · previews são gerados à parte · até 5 GB por arquivo</div>
      <input ref={input} type="file" multiple accept={accept} hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
    </div>
  );
}
