// CONFIGURAÇÕES — um lugar só para tudo o que configura a plataforma. Cada cartão diz o estado real e leva à tela que resolve.
// Estados de infraestrutura e decisões vêm do checklist oficial (docs/09); integrações vêm do servidor, sem simular conexão.
import { Link } from 'react-router-dom';
import { useApi, useAuth } from '../lib/hooks.js';
import { useCrumbs } from '../components/Shell.jsx';
import { PageHead } from '../components/ui.jsx';
import { StateBadge } from '../components/State.jsx';
import '../styles/settings.css';

function Card({ to, title, desc, s, label, extra }) {
  const body = (
    <>
      <div className="cfg-card-h"><span className="cfg-card-t">{title}</span>{s && <StateBadge s={s} label={label} />}</div>
      <p className="cfg-card-d">{desc}</p>
      {extra && <div className="cfg-card-x">{extra}</div>}
      {to && <span className="cfg-card-a">Abrir →</span>}
    </>
  );
  return to ? <Link to={to} className="cfg-card">{body}</Link> : <div className="cfg-card static">{body}</div>;
}

export default function Configuracoes() {
  useCrumbs('Configurações');
  const auth = useAuth();
  const canInt = auth.can('integracoes');
  const { data: integ } = useApi(canInt ? '/status/integrations' : null);
  const items = Array.isArray(integ) ? integ : integ?.items || integ?.integrations || [];
  const by = (k) => items.find((i) => i.key === k);
  const count = (fn) => items.filter(fn).length;
  const intSummary = items.length ? `${count((i) => ['conectada', 'ativo'].includes(i.state))} ativas · ${count((i) => ['aguardando_configuracao', 'nao_conectada', 'aguardando_integracao'].includes(i.state))} aguardando · ${count((i) => i.state === 'erro')} com erro` : null;
  const st = (k, fallback) => by(k)?.state || fallback;

  const groups = [
    { title: 'Pessoas e acessos', cards: [
      auth.can('usuarios') && { to: '/usuarios', title: 'Usuários e permissões', desc: 'Pessoas da equipe, perfis (funções), exceções por pessoa e clientes vinculados.', s: 'ativo' },
      auth.can('usuarios') && { to: '/usuarios', title: 'Acessos dos clientes', desc: 'Quem do cliente entra no portal, convites e e-mails a confirmar.', s: 'ativo' },
      { to: '/perfil', title: 'Meu perfil', desc: 'Seus dados, aparência (claro/escuro), senha e seus acessos.', s: 'ativo' },
    ] },
    { title: 'Operação', cards: [
      auth.can('clientes') && { to: '/clientes', title: 'Clientes e carteira', desc: 'Cadastro, status e onboarding de cada cliente.', s: 'ativo' },
      auth.can('divisao') && { to: '/divisao', title: 'Divisão', desc: 'Quem cuida de cada cliente em cada função.', s: 'ativo' },
      auth.can('automacoes') && { to: '/automacoes', title: 'Automações e regras do processo', desc: 'O que é automático, o que depende de configuração e as regras do Process Engine.', s: 'ativo' },
    ] },
    { title: 'Conexões', cards: [
      canInt && { to: '/integracoes', title: 'Integrações', desc: 'Google Calendar e Meet, Drive, Slack, Meta/Instagram, e-mail, Claude, Notion e infraestrutura.', s: items.length ? (count((i) => i.state === 'erro') ? 'erro' : 'aguardando_configuracao') : null, label: items.length ? undefined : null, extra: intSummary },
      { to: canInt ? '/integracoes' : null, title: 'Calendário (Google)', desc: 'Agenda e convites das reuniões; sem conexão, o calendário mostra só o que está na plataforma.', s: st('google_calendar', 'aguardando_configuracao') },
      { to: '/brain', title: 'The Bold Brain (Claude)', desc: 'Consultas inteligentes, narrativa de insights e resumo de reunião por IA.', s: st('anthropic', st('claude', 'aguardando_configuracao')) },
    ] },
    { title: 'Notificações', cards: [
      { title: 'Notificações na plataforma', desc: 'O sino da equipe e do cliente: aprovações, ajustes, menções, prazos.', s: 'ativo' },
      { to: canInt ? '/integracoes' : null, title: 'Notificações por e-mail', desc: 'Convites, lembretes e avisos por e-mail (Resend, com domínio verificado).', s: st('email', st('resend', 'aguardando_configuracao')) },
      { title: 'Preferências por pessoa', desc: 'Cada pessoa escolher o que recebe e por qual canal. Hoje dá para ligar/desligar automações, não preferências individuais.', s: 'em_desenvolvimento' },
    ] },
    { title: 'Financeiro', cards: [
      auth.can('financeiro') && { to: '/financeiro', title: 'Regras financeiras', desc: 'Recebimentos funcionam; regras de repasse, custos e rentabilidade precisam ser definidas pela CEO.', s: 'aguardando_decisao' },
    ] },
    { title: 'Dados, Notion e histórico', cards: [
      auth.can('clientes') && { to: '/notion', title: 'Notion & Histórico', desc: 'Tudo o que veio do Notion: Client Brain, onboarding, CR Editorial, calendários, links. Somente leitura.', s: 'somente_leitura' },
      auth.can('atrasos') && { to: '/atrasos', title: 'Itens legados', desc: 'Itens herdados não validados: reprogramar, encerrar ou manter como histórico, um a um.', s: 'ativo' },
      auth.can('clientes', 'admin') && { to: '/migracao', title: 'Decisões da migração', desc: 'Pontos de revisão abertos da migração (equipe, duplicados, escopo).', s: 'aguardando_decisao' },
      auth.can('historico') && { to: '/historico', title: 'Histórico e auditoria', desc: 'Tudo o que aconteceu, por quem, com antes e depois. Não aceita alteração.', s: 'ativo' },
    ] },
    { title: 'Infraestrutura', cards: [
      { title: 'Hospedagem persistente', desc: 'Hoje a plataforma roda numa prévia descartável: o que se altera nela se perde. O plano está em docs/08 e aguarda aprovação.', s: 'aguardando_decisao' },
      { title: 'Rotinas por horário', desc: 'Lembretes, prazos, cobrança, relatório semanal e detecção periódica dependem do agendador (CRON_SECRET + hospedagem).', s: st('cron', 'aguardando_configuracao') },
      { title: 'Backup automático', desc: 'Hoje só existe o snapshot manual cifrado. Rotina automática com restauração testada ainda não existe.', s: 'em_desenvolvimento' },
      { title: 'Domínio próprio', desc: 'Endereço definitivo da plataforma e do portal do cliente.', s: 'aguardando_configuracao' },
    ] },
    { title: 'Produto', cards: [
      { to: '/mapa', title: 'Mapa do produto', desc: 'Cada funcionalidade definida no projeto, onde fica, em que estado está e o que falta.', s: 'ativo' },
    ] },
  ];

  return (
    <div className="page">
      <PageHead kicker="SISTEMA" title="Configurações" sub="Tudo o que configura a plataforma num lugar só. Cada cartão mostra o estado real e leva à tela que resolve." />
      {groups.map((g) => {
        const cards = g.cards.filter(Boolean);
        if (!cards.length) return null;
        return (
          <section key={g.title} className="cfg-group">
            <h2 className="caps cfg-group-t">{g.title}</h2>
            <div className="cfg-grid">{cards.map((c) => <Card key={c.title} {...c} />)}</div>
          </section>
        );
      })}
    </div>
  );
}
