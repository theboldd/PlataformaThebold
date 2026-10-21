// Importa os calendários "CR EDITORIAL" do Notion como HISTÓRICO DO NOTION · SOMENTE LEITURA (regra oficial 15).
// Lê o export (_cr_editorial.json, feito só com leitura do Notion). Não cria conteúdo, tarefa, pendência, atraso nem cobrança.
// Idempotente: a mesma página do Notion (notion_url) não entra duas vezes.
// Uso: node server/migration/import-cr-editorial.js   (npm run migrar:cr-editorial)
import fs from 'node:fs';
import path from 'node:path';
import { one, insert, uid, now, tx } from '../db.js';
import { log } from '../lib/core.js';

const FILE = path.resolve(process.env.BOLD_MIGRATION_DIR || 'storage/migration/notion', '_cr_editorial.json');
if (!fs.existsSync(FILE)) { console.log('_cr_editorial.json não encontrado — nada a importar.'); process.exit(0); }
const X = JSON.parse(fs.readFileSync(FILE, 'utf8'));
// Propriedade de data: a do tipo "date" no schema do banco; se houver mais de uma, a de nome Data/Date/Postagem; o nome usado fica registrado
const pickDate = (schema) => {
  const dates = Object.entries(schema || {}).filter(([, t]) => String(t).toLowerCase().includes('date')).map(([k]) => k);
  return dates.find((k) => /^(data|date|postagem|data de postagem)$/i.test(k.trim())) || dates[0] || null;
};
// Texto puro: a marcação do Notion (<b>, <br />, menções com e-mail no atributo) vira texto; o conteúdo não muda
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const clean = (v) => (typeof v === 'string' ? v.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENT[m]).trim()
  : Array.isArray(v) ? v.map(clean) : v && typeof v === 'object' && !('start' in v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])) : v);
const dateOf = (v) => (v && typeof v === 'object' ? v.start || null : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v : null);
const report = { imported: 0, skipped: 0, no_date: 0, clients: {} };
tx(() => {
  for (const c of X.clients || []) {
    if (!one('SELECT 1 FROM clients WHERE id=?', c.client_id)) { console.warn(`cliente ${c.client_name} (${c.client_id}) não existe — ignorado`); continue; }
    for (const db of c.databases || []) {
      const dp = pickDate(db.schema);
      for (const r of db.rows || []) {
        if (r.notion_url && one('SELECT 1 FROM notion_history WHERE notion_url=?', r.notion_url)) { report.skipped++; continue; }
        const d = dp ? r.properties?.[dp] : null;
        const start = dateOf(d);
        if (!start) report.no_date++;
        insert('notion_history', { id: uid('nh_'), client_id: c.client_id, source: db.title || 'CR EDITORIAL', source_db_url: db.url || null, notion_url: r.notion_url || null,
          title: clean(r.title) || null, date_start: start, date_end: d && typeof d === 'object' ? d.end || null : null, date_property: dp,
          properties: JSON.stringify(clean(r.properties || {})), created_time: r.created_time || null, last_edited_time: r.last_edited_time || null, extracted_at: X.extracted_at || null, imported_at: now() });
        report.imported++;
        report.clients[c.client_name] = (report.clients[c.client_name] || 0) + 1;
      }
    }
  }
  if (report.imported) log({ kind: 'sistema', action: 'migracao.cr_editorial', entity: 'sistema', origin: 'automatica', summary: `Histórico do Notion (CR EDITORIAL, somente leitura): ${report.imported} item(ns) importado(s) de ${Object.keys(report.clients).length} cliente(s)` });
});
console.log(report);
