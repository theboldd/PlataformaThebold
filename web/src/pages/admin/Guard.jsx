import { Empty, ErrorBox } from '../../components/ui.jsx';
// Erros de carregamento: 403 vira um estado claro de área restrita (a autorização é do servidor)
export function LoadError({ error }) {
  if (error?.status === 403) return <div className="page"><Empty title="Área restrita.">{error.message} Fale com a administração se precisar deste acesso.</Empty></div>;
  return <div className="page"><ErrorBox error={error} /></div>;
}
