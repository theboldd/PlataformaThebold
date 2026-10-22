// NEGÓCIO — CRM e Financeiro numa página só: Pipeline · Recebimentos · Produção & Repasses · Custos · Metas · Rentabilidade · Configuração.
// Cada aba aparece conforme a permissão (checada também no servidor). Valores de repasse só com a permissão "Produção & Repasses".
import '../styles/admin.css';
import { useAuth } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { useUrlState } from '../lib/nav.jsx';
import { PageHead, Tabs, Empty } from '../components/ui.jsx';
import CRM from './CRM.jsx';
import Recebimentos from './negocio/Recebimentos.jsx';
import Repasses from './negocio/Repasses.jsx';
import { Custos, Metas, Rentabilidade, ConfigFinanceira } from './negocio/Gestao.jsx';

const TABS = [
  { key: 'pipeline', label: 'Pipeline', mod: 'crm', C: () => <CRM embedded /> },
  { key: 'recebimentos', label: 'Recebimentos', mod: 'financeiro', C: Recebimentos },
  { key: 'repasses', label: 'Produção & Repasses', mod: 'repasses', C: Repasses },
  { key: 'custos', label: 'Custos', mod: 'financeiro', C: Custos },
  { key: 'metas', label: 'Metas', mod: 'financeiro', C: Metas },
  { key: 'rentabilidade', label: 'Rentabilidade', mod: 'financeiro', C: Rentabilidade },
  { key: 'config', label: 'Configuração', mod: 'financeiro', C: ConfigFinanceira },
];

export default function Negocio() {
  const auth = useAuth();
  const tabs = TABS.filter((t) => auth.can(t.mod, 'view'));
  const [tab, setTab] = useUrlState('aba', tabs[0]?.key || 'pipeline');
  const cur = tabs.find((t) => t.key === tab) || tabs[0];
  useCrumbs('Negócio', cur?.label || '');
  if (!cur) return <div className="page"><Empty title="Sem acesso ao Negócio." /></div>;
  return (
    <div className="page">
      <PageHead kicker="Comercial + Financeiro" title="Negócio" sub="Do primeiro contato ao recebimento: pipeline, cobranças, produção & repasses, custos, metas e rentabilidade — tudo com dados reais ou o estado honesto do que falta." />
      <Tabs value={cur.key} onChange={setTab} tabs={tabs.map(({ key, label }) => ({ key, label }))} />
      <cur.C key={cur.key} />
    </div>
  );
}
