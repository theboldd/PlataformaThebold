// Gera docs/03-automacoes.md a partir do catálogo em server/engine/automations.js
import fs from 'node:fs';
const src = fs.readFileSync('server/engine/automations.js', 'utf8');
const body = src.slice(src.indexOf('export const CATALOG = ['), src.indexOf('];', src.indexOf('export const CATALOG = [')) + 1);
const CATALOG = eval(body.replace('export const CATALOG = ', ''));
const CLS = { 1: 'Simples', 2: 'Regras', 3: 'IA', 4: 'Aprovação humana' };
const ENG = { regra: 'Regra determinística', ia: 'Claude (IA)', humano: 'Humano' };
let md = `# 03 · Automações\n\nGerado de \`server/engine/automations.js\` (\`node scripts/gen-automations-doc.mjs\`). Toda execução é registrada em **AutomationRuns** e no **histórico**.\n\nClasses: 1 = simples · 2 = baseada em regras · 3 = precisa de IA · 4 = precisa de aprovação humana.\n\n`;
for (const phase of ['MVP', 'V2', 'V3']) {
  const rows = CATALOG.filter((r) => r[9] === phase);
  md += `## ${phase} (${rows.length})\n\n| Evento | Condição | Ação | Responsável | Notificação | Prazo | Motor | Classe | Status |\n|---|---|---|---|---|---|---|---|---|\n`;
  for (const [key, ev, cond, act, owner, notif, dl, eng, cls, , impl] of rows) md += `| **${ev}**<br><sub>\`${key}\`</sub> | ${cond} | ${act} | ${owner} | ${notif} | ${dl} | ${ENG[eng]} | ${CLS[cls]} | ${impl ? '✅ implementada' : '◻ planejada'} |\n`;
  md += '\n';
}
fs.writeFileSync('docs/03-automacoes.md', md);
console.log(`ok: ${CATALOG.length} automações`);
