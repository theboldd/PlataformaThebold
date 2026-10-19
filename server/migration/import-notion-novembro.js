// IMPORTAÇÃO DO QUADRO "Controle produção NOVEMBRO" (Notion → PROCESSO) + "Controle INÍCIO CLIENTE".
// Entrada: storage/migration/notion/_board_novembro.json (extraído só lendo o Notion).
// Regras: nada inventado — quantidades vêm das listas de checagem; títulos e datas, dos posts mencionados nos cronogramas;
// quando não há título, o conteúdo fica "a definir" e explícito. Responsável = pessoa do nome da coluna (Design Felipe → Felipe).
// Todo texto e comentário do card é preservado nas observações internas do conteúdo. Ambiguidades → migration_issues.
// Idempotente: cada conteúdo guarda a origem (url do card + posição) e não é recriado.
// Uso: node server/migration/import-notion-novembro.js
import fs from 'node:fs';
import path from 'node:path';
import { one, all, insert, update, run, uid, now, tx } from '../db.js';
import { log } from '../lib/core.js';
import { createContent, ensureCycle } from '../engine/process.js';

const FILE = path.resolve(process.env.BOLD_MIGRATION_DIR || 'storage/migration/notion', '_board_novembro.json');
const MONTH = '2026-11';
const B = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9º]+/g, ' ').trim();
const fmt = (iso) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const startedAt = now();

// ── Clientes reais (CLIENTES MKT / ADVS MKT) e apelidos usados no quadro ──
const clients = all("SELECT id, name, aliases FROM clients WHERE notion_url IS NOT NULL");
// Decisões humanas registradas (ex.: dois nomes no Notion para a mesma cliente): título do card → nome exato do cliente
const OVR_FILE = path.join(path.dirname(FILE), '_novembro_overrides.json');
const OVERRIDES = fs.existsSync(OVR_FILE) ? JSON.parse(fs.readFileSync(OVR_FILE, 'utf8')) : {};
function findClient(title) {
  if (OVERRIDES[title.trim()]) { const c = one('SELECT id, name, aliases FROM clients WHERE name=?', OVERRIDES[title.trim()]); return c ? { c, loose: false } : null; }
  const t = norm(title.replace(/🚨/g, '')).replace(/\b(nov|novembro)\b/g, '').trim();
  if (!t) return null;
  const tt = t.split(' ');
  const names = (c) => [c.name, ...JSON.parse(c.aliases || '[]')].map(norm);
  const exact = clients.filter((c) => names(c).some((n) => n === t));
  if (exact.length === 1) return { c: exact[0], loose: false };
  // cada palavra do card é início da palavra do nome ("Rafa" → "Rafael Neves"); apelido do primeiro nome ("Gabi" → "Gabriela")
  // só vale com sobrenome igual confirmando ("Gabi Bizzo" → "Gabriela Bizzo")
  const tokenOk = (w, x, i) => x && (x.startsWith(w) || (i === 0 && tt.length > 1 && w.length >= 3 && x.startsWith(w.slice(0, 3))));
  const pref = clients.filter((c) => names(c).some((n) => { const nt = n.split(' '); return tt.every((w, i) => tokenOk(w, nt[i], i)); }));
  return pref.length === 1 ? { c: pref[0], loose: true } : null;
}
const userByFirst = (n) => one("SELECT * FROM users WHERE role_key<>'cliente' AND active=1 AND lower(name)=lower(?)", n);
const COLUMN_PERSON = { 'Design Felipe': ['Felipe', 'design'], 'Design Moni': ['Monique', 'design'], 'Design Nicole': ['Nicole', 'design'], 'Edição de vídeo Leo': ['Léo', 'edicao'], 'Edição de vídeo Nicole': ['Nicole', 'edicao'] };
const COLUMN_STAGE = { 'Design Felipe': 'producao', 'Design Moni': 'producao', 'Design Nicole': 'producao', 'Edição de vídeo Leo': 'producao', 'Edição de vídeo Nicole': 'producao', 'Análise produção': 'analise_producao', 'Ajustados pós análise': 'analise_producao', 'Aguardando ajustes': 'ajuste_interno', 'Para agendamento': 'agendamento', 'Agendado': 'agendado', 'Legenda': 'producao' };
const QTY = [[/(\d+)\s*carross/i, 'carrossel', 'Carrossel'], [/(\d+)\s*est[aá]tic/i, 'estatico', 'Estático'], [/(\d+)\s*reels?\b/i, 'reel', 'Reels']];
const LINK_FORMAT = { CARROSSEL: 'carrossel', 'MAV CARROSSEL': 'carrossel', 'CFF CARROSSEL': 'carrossel', REELS: 'reel', 'ESTÁTICO': 'estatico' };

function issue(clientId, clientName, kind, description) {
  insert('migration_issues', { id: uid('mi_'), client_id: clientId || null, client_name: clientName || null, kind, description, source: 'notion:novembro', status: 'aberto', created_at: now() });
}
const commentsText = (card) => card.comments.map((c) => `— ${c.author} em ${fmt(c.created_time)}: ${c.text}`).join('\n');
const cardText = (card, extra = '') => [
  `Importado do Notion · quadro “Controle produção NOVEMBRO” · coluna “${card.column}”${card.type ? ` · tipo ${card.type}` : ''}`,
  `Card: ${card.title} — ${card.notion_url}`,
  card.body_text?.trim() ? `\nConteúdo do card:\n${card.body_text.trim()}` : '',
  card.comments.length ? `\nComentários do card:\n${commentsText(card)}` : '',
  card.note ? `\nObservação da extração: ${card.note}` : '',
  extra,
].filter(Boolean).join('\n');

const report = { created: 0, byClient: {}, skipped: [], unmatched: [], cycles: 0, brain: 0, members: [] };
run("DELETE FROM migration_issues WHERE source='notion:novembro' AND status='aberto'");

const cards = B.cards.filter((c) => !c.is_column_label && c.title?.trim());
for (const c of B.cards.filter((x) => !x.is_column_label && !x.title?.trim())) report.skipped.push(`Card sem nome (coluna ${c.column || '—'}) — ${c.notion_url}`);

// 1) Cronogramas: estado do ciclo de novembro + anotações e comentários preservados na ficha (Client Brain · operacional)
const cronos = cards.filter((c) => c.type === 'Cronograma');
const postsByClient = new Map();
for (const card of cronos) {
  const m = findClient(card.title);
  if (!m) { report.unmatched.push(card.title); issue(null, card.title, 'novembro', `Cronograma “${card.title}” não corresponde a nenhum cliente de CLIENTES MKT/ADVS MKT. Não importado. ${card.notion_url}`); continue; }
  if (m.loose) issue(m.c.id, m.c.name, 'novembro', `Card “${card.title}” associado por apelido a ${m.c.name} — confirmar.`);
  const cy = ensureCycle(m.c.id, MONTH);
  report.cycles++;
  const status = card.column === 'Cronograma' || card.column === 'Análise cronograma' ? 'planejamento' : 'aprovacao_temas';
  if (cy.status === 'planejamento' && status !== 'planejamento') update('cycles', { id: cy.id }, { status });
  postsByClient.set(m.c.id, card.links.filter((l) => l.post_date && LINK_FORMAT[l.label.split(':')[0]]).map((l) => ({ ...l, format: LINK_FORMAT[l.label.split(':')[0]], title: l.label.split(':').slice(1).join(':').trim() })).sort((a, b) => a.post_date.localeCompare(b.post_date)));
  const ref = `notion-nov:${card.notion_url}`;
  if (!one('SELECT 1 FROM client_brain_entries WHERE client_id=? AND source_ref=?', m.c.id, ref)) {
    insert('client_brain_entries', { id: uid('be_'), client_id: m.c.id, section: 'operacional', label: `Cronograma de novembro (Notion · ${card.column})`, content: cardText(card), origin: 'equipe', source_type: 'notion', source_ref: ref, source_page: 'Controle produção NOVEMBRO', source_url: card.notion_url, created_at: now() });
    report.brain++;
  }
}

// 2) Produção: DESIGN e REELS viram conteúdos (quantidade da lista); LEGENDA fica registrada nos conteúdos do cliente
const legendas = new Map();
for (const card of cards.filter((c) => c.type === 'LEGENDA' || (c.column === 'Legenda' && c.type !== 'Cronograma'))) {
  const m = findClient(card.title);
  if (!m) { report.unmatched.push(card.title); issue(null, card.title, 'novembro', `Card de legenda “${card.title}” sem cliente correspondente. ${card.notion_url}`); continue; }
  legendas.set(m.c.id, card);
}
const prodCards = cards.filter((c) => c.type !== 'Cronograma' && c.type !== 'LEGENDA' && c.column !== 'Legenda');
for (const card of prodCards) {
  const m = findClient(card.title);
  if (!m) { report.unmatched.push(card.title); issue(null, card.title, 'novembro', `Card “${card.title}” (${card.column}) não corresponde a um cliente com segurança — conteúdos NÃO criados. Lista: ${card.todos.map((t) => t.text.trim()).join('; ')}. ${card.notion_url}`); continue; }
  if (m.loose) issue(m.c.id, m.c.name, 'novembro', `Card “${card.title}” associado por apelido a ${m.c.name} — confirmar.`);
  if (!card.type) issue(m.c.id, m.c.name, 'novembro', `Card “${card.title}” na coluna ${card.column} não tinha tipo no Notion; tipo deduzido da lista (${card.todos.map((t) => t.text.trim()).join('; ')}).`);
  const stage = COLUMN_STAGE[card.column];
  if (!stage) { issue(m.c.id, m.c.name, 'novembro', `Coluna “${card.column}” sem etapa correspondente — card não importado. ${card.notion_url}`); continue; }
  const [personName, fn] = COLUMN_PERSON[card.column] || [];
  const person = personName ? userByFirst(personName) : null;
  const leg = legendas.get(m.c.id);
  const extras = [];
  if (card.todos.some((t) => /capa/i.test(t.text))) extras.push(`Inclui no card de design: “${card.todos.filter((t) => /capa/i.test(t.text)).map((t) => `${t.checked ? '☑' : '☐'} ${t.text.trim()}`).join('; ')}”.`);
  if (leg) extras.push(`Legendas do mês no Notion (coluna Legenda): ${leg.todos.map((t) => `${t.checked ? '☑' : '☐'} ${t.text.trim()}`).join('; ') || 'sem lista'}${leg.body_text.split('\n').filter((l) => !/^[☐☑]/.test(l) && l.trim()).length ? ` · ${leg.body_text.split('\n').filter((l) => !/^[☐☑]/.test(l) && l.trim()).join(' ')}` : ''} — ${leg.notion_url}. O texto das legendas não está no Notion.`);
  for (const todo of card.todos) {
    const q = QTY.find(([re]) => re.test(todo.text));
    if (!q) continue;
    const n = Number(todo.text.match(q[0])[1]);
    const [, format, label] = q;
    const posts = (postsByClient.get(m.c.id) || []).filter((p) => p.format === format);
    for (let i = 0; i < n; i++) {
      const ref = `${card.notion_url}#${format}-${i + 1}`;
      if (one('SELECT 1 FROM contents WHERE reference=?', ref)) continue;
      const post = posts[i];
      const title = post ? post.title : `${label} ${i + 1} de ${n} · novembro (tema a definir)`;
      const notes = cardText(card, [`\nItem da lista: ${todo.checked ? '☑' : '☐'} ${todo.text.trim()} (este é o ${i + 1}º de ${n}).`, post ? `Post no cronograma do cliente: ${post.label} · ${post.post_date} · ${post.url}` : 'Sem post correspondente nos links do cronograma: título e data a definir pela estratégia.', ...extras].join('\n'));
      const content = createContent({ client_id: m.c.id, title, format, stage, cycle_month: MONTH, planned_at: post ? new Date(`${post.post_date}T12:00:00-03:00`).toISOString() : null,
        reference: ref, internal_notes: notes, strategy_tags: ['importado-notion-novembro'] }, null);
      // Responsável pela trilha visual = pessoa do nome da coluna do Notion
      if (person && stage === 'producao') {
        run("UPDATE tasks SET assignee_id=? WHERE content_id=? AND function=? AND status IN ('aberta','em_andamento')", person.id, content.id, fn);
        if (!one('SELECT 1 FROM client_members WHERE client_id=? AND function=?', m.c.id, fn)) {
          run('INSERT OR IGNORE INTO client_members (client_id,user_id,function) VALUES (?,?,?)', m.c.id, person.id, fn);
          report.members.push(`${m.c.name}: ${person.name} (${fn})`);
          log({ action: 'equipe.vinculada', entity: 'client', id: m.c.id, client: m.c.id, summary: `${person.name} vinculado(a) em ${fn} — evidência: coluna “${card.column}” do quadro de novembro no Notion` });
        }
      }
      report.created++;
      report.byClient[m.c.name] = (report.byClient[m.c.name] || 0) + 1;
    }
  }
}

// 3) Início de cliente: semana e equipe marcada, com comentários, na ficha
for (const card of B.inicio_cliente?.cards || []) {
  const m = findClient(card.title);
  if (!m) { issue(null, card.title, 'novembro', `Início de cliente “${card.title}” sem cliente correspondente. ${card.notion_url}`); continue; }
  const ref = `notion-inicio:${card.notion_url}`;
  if (one('SELECT 1 FROM client_brain_entries WHERE client_id=? AND source_ref=?', m.c.id, ref)) continue;
  insert('client_brain_entries', { id: uid('be_'), client_id: m.c.id, section: 'operacional', label: `Início de cliente (Notion): ${card.column}`,
    content: [`Quadro “Controle INÍCIO CLIENTE” · ${card.column} · equipe marcada: ${(card.selecionar || []).join(', ') || '—'}`, card.body_text?.trim(), card.comments?.length ? `Comentários:\n${commentsText(card)}` : ''].filter(Boolean).join('\n'),
    origin: 'observacao_interna', source_type: 'notion', source_ref: ref, source_page: 'Controle INÍCIO CLIENTE', source_url: card.notion_url, created_at: now() });
  report.brain++;
}

// Importação não é operação: não dispara notificações nem conta como execução de automação
run('DELETE FROM notifications WHERE created_at >= ?', startedAt);
run('DELETE FROM automation_runs WHERE created_at >= ?', startedAt);
log({ action: 'migracao.notion_novembro', entity: 'sistema', summary: `Quadro de novembro importado do Notion: ${report.created} conteúdos, ${report.cycles} ciclos, ${report.brain} registros na ficha` });

const md = `# Importação — quadro de novembro (Notion)
Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}

- Conteúdos criados: ${report.created}
- Ciclos de novembro (cronogramas): ${report.cycles}
- Registros na ficha (cronograma, início de cliente): ${report.brain}

## Conteúdos por cliente
${Object.entries(report.byClient).sort().map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- nenhum'}

## Responsáveis vinculados pela coluna do Notion (cliente não tinha ninguém na função)
${report.members.map((x) => `- ${x}`).join('\n') || '- nenhum'}

## Não importados
${[...new Set(report.unmatched)].map((x) => `- ${x} (sem cliente correspondente com segurança)`).join('\n') || '- nenhum'}
${report.skipped.map((x) => `- ${x}`).join('\n')}
`;
fs.writeFileSync(path.resolve(path.dirname(FILE), '..', 'relatorio-novembro.md'), md);
console.log(`Novembro: ${report.created} conteúdos · ${report.cycles} ciclos · ${report.brain} registros · ${[...new Set(report.unmatched)].length} sem cliente`);
