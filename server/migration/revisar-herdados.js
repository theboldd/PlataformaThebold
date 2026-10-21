// Levanta, para cada item atrasado herdado da migração, os FATOS da fonte original (export do quadro do Notion):
// quando o card foi criado/editado, se foi copiado em lote e nunca mais editado, e os comentários do card.
// Só leitura do Notion (arquivo exportado). Não classifica nada: a classificação é de uma pessoa autorizada.
// Uso: node server/migration/revisar-herdados.js   (npm run revisar:herdados)
import fs from 'node:fs';
import path from 'node:path';
import { all, update, now } from '../db.js';
import { markMigratedTasks, syncDelayReviews } from '../services/delayReview.js';

const DIR = path.resolve(process.env.BOLD_MIGRATION_DIR || 'storage/migration/notion');
const cards = new Map();
for (const f of ['_board_outubro.json', '_board_novembro.json']) {
  const file = path.join(DIR, f);
  if (!fs.existsSync(file)) continue;
  const B = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const c of B.cards || []) cards.set(c.notion_url, { ...c, board: f.replace(/^_board_|\.json$/g, ''), extracted_at: B.source?.extracted_at });
}
const marked = markMigratedTasks();
const sync = syncDelayReviews();
const fmt = (iso) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const src = (c) => `export do quadro de ${c.board} (${c.notion_url}), extraído em ${fmt(c.extracted_at)}`;
let withSource = 0;
const report = { nunca_editado: 0, editado_depois: 0, com_comentarios: 0, sem_card: 0 };
for (const d of all('SELECT d.task_id, c.reference FROM delay_reviews d JOIN contents c ON c.id=d.content_id')) {
  const card = cards.get(String(d.reference || '').split('#')[0]);
  if (!card) { report.sem_card++; continue; }
  const F = [];
  const sameAsCreated = Math.abs(new Date(card.last_edited_time) - new Date(card.created_time)) < 5 * 60e3;
  F.push({ k: 'card_coluna', label: 'Coluna no Notion', value: `“${card.column}” no quadro de ${card.board}`, source: src(card) });
  F.push({ k: 'card_criado', label: 'Card criado no Notion', value: fmt(card.created_time), source: src(card) });
  F.push({ k: 'card_editado', label: 'Última edição do card no Notion', value: `${fmt(card.last_edited_time)}${sameAsCreated ? ' — nunca editado depois de criado (o relatório da extração registra que 104 de 109 cards de outubro foram copiados em lote em 30/09)' : ''}`, source: src(card) });
  if (sameAsCreated) report.nunca_editado++; else report.editado_depois++;
  if (card.comments?.length) {
    report.com_comentarios++;
    F.push({ k: 'card_comentarios', label: `Comentários no card (${card.comments.length})`, value: card.comments.map((c) => `${fmt(c.created_time)} · ${c.author}: ${c.text}`).join('\n'), source: src(card) });
  } else F.push({ k: 'card_comentarios', label: 'Comentários no card', value: 'Nenhum', source: src(card) });
  update('delay_reviews', { task_id: d.task_id }, { source_facts: F, updated_at: now() });
  withSource++;
}
console.log(`Tarefas marcadas como herdadas agora: ${marked}. Itens em revisão: ${sync.total} (novos: ${sync.created}). Com fatos do Notion: ${withSource}.`);
console.log(report);
