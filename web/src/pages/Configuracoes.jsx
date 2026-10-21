// CONFIGURAÇÕES — um lugar só para tudo que se configura no The Bold OS, com o estado real de cada área.
// Cada cartão leva à tela onde a configuração acontece; o que ainda não existe aparece como "em desenvolvimento" ou "aguardando decisão".
import { useApi } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { Loading, ErrorBox, PageHead } from '../components/ui.jsx';
import { StatePanel } from '../components/State.jsx';

const MISSING = {
  notificacoes: 'definir as preferências (canal, frequência e agrupamento por pessoa) e construir a tela.',
  financeiro: 'a CEO definir as regras de repasse, custos e fechamento mensal.',
  hospedagem: 'aprovação da hospedagem definitiva (servidor contínuo e banco persistente).',
  integracoes: 'credenciais no servidor e conexão de cada serviço (ver Integrações).',
};

export default function Configuracoes() {
  useCrumbs('Configurações');
  const { data, error, loading } = useApi('/configuracoes');
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  if (loading && !data) return <div className="page"><Loading rows={6} /></div>;
  return (
    <div className="page">
      <PageHead kicker="Sistema" title="Configurações" sub="Tudo o que se configura na plataforma, num lugar só. Cada área mostra o estado atual e leva à tela onde a configuração é feita." />
      <div className="state-grid">
        {data.sections.map((s) => (
          <StatePanel key={s.key} s={s.state} kicker={s.label} to={s.to} action={s.to ? 'Abrir' : null}
            missing={s.state !== 'ativo' ? MISSING[s.key] : null}>
            <p>{s.desc}</p>
            {s.note && <p className="xs muted">{s.note}</p>}
          </StatePanel>
        ))}
      </div>
    </div>
  );
}
