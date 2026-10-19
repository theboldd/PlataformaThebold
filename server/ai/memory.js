// Arquitetura de memória plugável — permite testar:
//   (A) Claude + banco próprio (padrão, MVP)
//   (B) Claude + Obsidian (vault de Markdown; somente leitura + exportação)
//   (C) Claude + sistema próprio de conhecimento (V3: busca semântica/embeddings)
// Seleção: settings.knowledge_provider ou BOLD_KNOWLEDGE_PROVIDER. ai_actions registra o provider usado → comparação A/B.
import fs from 'node:fs';
import path from 'node:path';
import { one, all } from '../db.js';

const SECTIONS = ['posicionamento', 'identidade', 'diferenciais', 'publico', 'persona', 'tom', 'linguagem', 'oferta', 'produtos', 'objetivos', 'diagnostico', 'estrategia', 'identidade_visual', 'preferencias', 'restricoes', 'referencias', 'regras', 'importante', 'historico', 'operacional', 'observacoes', 'outro'];

const dbProvider = {
  name: 'banco',
  clientBrain(clientId) {
    const s = Object.fromEntries(all("SELECT section, body FROM client_brain WHERE client_id=? AND body<>''", clientId).map((r) => [r.section, r.body]));
    const memorias = all('SELECT kind, body, created_at FROM client_memories WHERE client_id=? ORDER BY created_at DESC LIMIT 40', clientId);
    return { secoes: s, memorias };
  },
};

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const obsidianProvider = {
  name: 'obsidian',
  root: () => process.env.OBSIDIAN_VAULT_PATH,
  clientBrain(clientId) {
    const base = dbProvider.clientBrain(clientId); // o banco continua sendo a fonte oficial
    const c = one('SELECT name FROM clients WHERE id=?', clientId);
    const dir = this.root() && path.join(this.root(), 'Clientes', slug(c.name));
    const notas = [];
    if (dir && fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).slice(0, 30)) notas.push({ nota: f, texto: fs.readFileSync(path.join(dir, f), 'utf8').slice(0, 6000) });
    }
    return { ...base, notas_obsidian: notas };
  },
};

// Exporta o Client Brain como Markdown com links [[...]] (útil para avaliar Obsidian sem dependência)
export function exportClientBrainMarkdown(clientId) {
  const c = one('SELECT * FROM clients WHERE id=?', clientId);
  const b = dbProvider.clientBrain(clientId);
  const lines = [`# ${c.name}`, '', `Segmento: ${c.segment || '—'} · Status: ${c.status}`, ''];
  for (const s of SECTIONS) if (b.secoes[s]) lines.push(`## ${s[0].toUpperCase() + s.slice(1)}`, b.secoes[s], '');
  if (b.memorias.length) { lines.push('## Memórias'); b.memorias.forEach((m) => lines.push(`- **${m.kind}** (${m.created_at.slice(0, 10)}): ${m.body}`)); }
  lines.push('', `[[The Bold — Processo]] · [[Clientes]]`);
  return lines.join('\n');
}

export function knowledgeProvider() {
  const pick = process.env.BOLD_KNOWLEDGE_PROVIDER || one("SELECT value FROM settings WHERE key='knowledge_provider'")?.value?.replace(/"/g, '') || 'banco';
  return pick === 'obsidian' && process.env.OBSIDIAN_VAULT_PATH ? obsidianProvider : dbProvider;
}
export { SECTIONS as BRAIN_SECTIONS };
