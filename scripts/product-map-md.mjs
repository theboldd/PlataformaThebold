// Gera a seção "Revisão 3 — visibilidade" do checklist oficial (docs/09) a partir do mapa do produto (web/src/lib/productMap.js).
// Uso: node scripts/product-map-md.mjs > /tmp/mapa.md   — a tela /mapa e o checklist saem da mesma fonte.
import { PRODUCT_MAP, MAP_STATES, REVIEW_ROUTE } from '../web/src/lib/productMap.js';

const GROUPS = [
  ['ok', 'ENTREGUE E VISÍVEL'], ['parcial', 'VISÍVEL, MAS PARCIAL'], ['oculto', 'EXISTE NO CÓDIGO, MAS NÃO ESTÁ VISÍVEL'],
  ['config', 'AGUARDANDO CONFIGURAÇÃO'], ['nao', 'NÃO IMPLEMENTADO'], ['decisao', 'PRECISA DE DECISÃO'],
];
const out = [];
const all = PRODUCT_MAP.flatMap((a) => a.items.map((i) => ({ ...i, area: a.area })));
out.push('| Estado | Itens |', '|---|---|');
for (const [k, t] of GROUPS) out.push(`| ${MAP_STATES[k].icon} ${t} | ${all.filter((i) => i.state === k).length} |`);
out.push(`| Sem dados na base real (mostram DADOS INSUFICIENTES) | ${all.filter((i) => i.dados).length} |`, '');
for (const [k, t] of GROUPS) {
  const items = all.filter((i) => i.state === k);
  out.push(`### ${MAP_STATES[k].icon} ${t}`, '');
  if (!items.length) { out.push('Nenhum item.', ''); continue; }
  out.push('| Requisito | Tela | O que falta |', '|---|---|---|');
  for (const i of items) out.push(`| **${i.area}** — ${i.req}${i.dados ? ' *(sem dados na base real)*' : ''} | ${i.where || '—'}${i.to ? ` (\`${i.to}\`)` : ''} | ${i.miss || '—'} |`);
  out.push('');
}
out.push('## O QUE VOCÊ DEVE REVISAR MANUALMENTE AGORA', '', 'Na ordem de navegação. O mesmo roteiro está na plataforma em **Sistema → Mapa do produto → O que revisar agora**.', '');
REVIEW_ROUTE.forEach(([title, to, checks], n) => {
  out.push(`**${n + 1}. ${title}** (\`${to}\`)`);
  for (const c of checks) out.push(`- [ ] ${c}`);
  out.push('');
});
process.stdout.write(out.join('\n'));
