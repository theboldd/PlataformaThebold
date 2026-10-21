// SUA MARCA, COMO A THE BOLD ENTENDE — só o que a equipe compartilhou (nunca observações internas ou hipóteses da IA).
// "Isso ainda está correto?" → [SIM] registra a confirmação · [QUERO ATUALIZAR] registra a mudança, avisa a estrategista e cria a avaliação de impacto.
// THE BOLD / PULSO — o momento estratégico atual, apenas quando a equipe publicou dados reais.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi, useToast } from '../lib/hooks.js';
import { fmtDate } from '../lib/format.js';
import { Loading, ErrorBox } from '../components/ui.jsx';

const PULSE = [['focus', 'Foco atual'], ['objective', 'Objetivo'], ['direction', 'Direção'], ['learning', 'Aprendizado recente'], ['next_focus', 'Próximo foco']];

export default function Marca() {
  const { data, error, reload } = useApi('/portal/brand');
  useEffect(() => { if (data && location.hash === '#pulso') document.getElementById('pulso')?.scrollIntoView({ behavior: 'smooth' }); }, [data]);
  if (error) return <div className="p-page"><ErrorBox error={error} /></div>;
  if (!data) return <div className="p-page"><Loading rows={6} /></div>;
  const p = data.profile;
  return (
    <div className="p-page p-brandpage" style={{ maxWidth: 900 }}>
      <header className="p-page-head">
        <div className="caps">Sua marca</div>
        <h1 className="ed-xl">Como a The Bold<br /><em>entende sua marca.</em></h1>
        <p className="p-lede">É a base de cada conteúdo. Se algo mudou, conte para a gente — a estratégia acompanha.</p>
      </header>

      {data.pulse && (
        <section id="pulso" className="p-pulse" aria-labelledby="h-pulse">
          <div className="caps" id="h-pulse">The Bold / Pulso</div>
          <dl>{PULSE.filter(([k]) => data.pulse[k]).map(([k, l]) => <div key={k}><dt className="caps">{l}</dt><dd>→ {data.pulse[k]}</dd></div>)}</dl>
          <p className="xs muted">Atualizado pela The Bold em {fmtDate(data.pulse.published_at)}.</p>
        </section>
      )}

      {!data.sections.length ? (
        <div className="p-allgood">
          <p className="p-next-t">Em preparação.</p>
          <p className="sm muted">A The Bold está organizando o entendimento da sua marca. Assim que estiver pronto, ele aparece aqui para você confirmar.</p>
          {p && p.missing > 0 && <Link className="p-link" to="/portal/onboarding?faltando=1">Enquanto isso: seu perfil está {p.percent}% completo — continuar →</Link>}
        </div>
      ) : data.sections.map((s) => (
        <section key={s.title} className="p-bsec">
          <h2 className="ed-lg">{s.title}</h2>
          {s.items.map((it) => <BrandItem key={it.id} it={it} onDone={reload} />)}
        </section>
      ))}
    </div>
  );
}

function BrandItem({ it, onDone }) {
  const toast = useToast();
  const [upd, setUpd] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (decision) => {
    setBusy(true);
    try {
      await api.post(`/portal/brand/${it.id}/confirm`, { decision, note });
      toast(decision === 'confirmado' ? 'Obrigado por confirmar.' : 'Recebemos. A estrategista vai avaliar o impacto na estratégia.');
      setUpd(false); setNote(''); onDone();
    } catch (x) { toast(x.message, 'err'); } finally { setBusy(false); }
  };
  const last = it.last_check;
  return (
    <div className="p-bitem">
      {it.label && <div className="caps">{it.label}</div>}
      <p className="p-bitem-c">{it.content}</p>
      {last && <p className="xs muted">{last.decision === 'confirmado' ? `✓ Você confirmou em ${fmtDate(last.created_at)}` : `Você pediu atualização em ${fmtDate(last.created_at)} — em avaliação`}</p>}
      {!upd ? (
        <div className="p-bitem-q">
          <span className="sm">Isso ainda está correto?</span>
          <button className="p-btn sm" disabled={busy} onClick={() => send('confirmado')}>Sim</button>
          <button className="p-btn sm" disabled={busy} onClick={() => setUpd(true)}>Quero atualizar</button>
        </div>
      ) : (
        <div className="mt-2">
          <label className="p-field"><span className="caps">O que mudou?</span><textarea className="p-textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus /></label>
          <div className="row gap-2 mt-2"><button className="p-btn" onClick={() => setUpd(false)}>Cancelar</button><button className="p-btn solid" disabled={busy || !note.trim()} onClick={() => send('atualizar')}>Enviar atualização</button></div>
        </div>
      )}
    </div>
  );
}
