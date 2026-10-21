// MAPA DO PRODUTO — tudo o que foi definido no projeto, onde fica na plataforma e em que estado está.
// Serve para revisar a plataforma navegando: "isso já está pronto", "aguarda configuração", "precisa ser construído", "está sem dados".
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCrumbs } from '../components/Shell.jsx';
import { PageHead, Seg } from '../components/ui.jsx';
import { StateBadge } from '../components/State.jsx';
import { useUrlState } from '../lib/nav.jsx';
import { PRODUCT_MAP, MAP_STATES, REVIEW_ROUTE } from '../lib/productMap.js';
import '../styles/settings.css';

export default function MapaProduto() {
  useCrumbs('Mapa do produto');
  const [view, setView] = useUrlState('ver', 'mapa');
  const [only, setOnly] = useUrlState('estado', '');
  const all = useMemo(() => PRODUCT_MAP.flatMap((a) => a.items), []);
  const counts = Object.fromEntries(Object.keys(MAP_STATES).map((k) => [k, all.filter((i) => i.state === k).length]));
  const noData = all.filter((i) => i.dados).length;

  return (
    <div className="page">
      <PageHead kicker="PRODUTO" title="Mapa do produto" sub="Cada funcionalidade definida no projeto: onde fica, em que estado está e o que falta. Nenhum estado aqui é simulado — o que depende de chave, integração ou decisão aparece assim." />
      <Seg options={[{ value: 'mapa', label: 'Mapa por área' }, { value: 'roteiro', label: 'O que revisar agora' }]} value={view} onChange={setView} label="Visualização" />

      {view === 'roteiro' ? (
        <div className="cfg-grid mt-6">
          {REVIEW_ROUTE.map(([title, to, checks], i) => (
            <div key={title} className="cfg-card static">
              <div className="cfg-card-h"><span className="cfg-card-t">{i + 1}. {title}</span><Link className="cfg-card-a" to={to}>Abrir →</Link></div>
              <ol className="map-check">{checks.map((c) => <li key={c}>{c}</li>)}</ol>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="map-summary" role="group" aria-label="Filtrar por estado">
            <button aria-pressed={!only} onClick={() => setOnly('')}><StateBadge s="somente_leitura" label={`TODOS · ${all.length}`} /></button>
            {Object.entries(MAP_STATES).map(([k, v]) => (
              <button key={k} aria-pressed={only === k} onClick={() => setOnly(only === k ? '' : k)}><StateBadge s={v.badge} label={`${v.label} · ${counts[k]}`} /></button>
            ))}
          </div>
          <p className="xs muted" style={{ margin: '-8px 0 0' }}>{noData} itens funcionam, mas estão sem dados na base real (mostram DADOS INSUFICIENTES).</p>
          {PRODUCT_MAP.map((a) => {
            const items = a.items.filter((i) => !only || i.state === only);
            if (!items.length) return null;
            return (
              <section key={a.area} className="map-area">
                <div className="map-area-h"><h2>{a.area}</h2><Link className="cfg-card-a" to={a.path}>Abrir tela →</Link></div>
                <ul className="map-rows">
                  {items.map((i) => (
                    <li key={i.req} className="map-row">
                      <span className="req">{i.req}</span>
                      <span className="where">{i.to ? <Link to={i.to}>{i.where || 'Abrir'}</Link> : i.where}</span>
                      <span className="row gap-2 wrap">
                        <StateBadge s={MAP_STATES[i.state].badge} label={MAP_STATES[i.state].label} />
                        {i.dados && <StateBadge s="dados_insuficientes" label="SEM DADOS NA BASE" />}
                      </span>
                      {i.miss && <span className="miss">O que falta: {i.miss}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
