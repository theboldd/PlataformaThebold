// RECOMEÇO DA OPERAÇÃO (decisão da CEO, 23/10/2026): apaga os conteúdos, tarefas e históricos de produção vindos do Notion
// e traz apenas o mês de NOVEMBRO — o quadro "Controle produção NOVEMBRO" (página PROCESSO) + o cronograma de novembro
// do CR EDITORIAL de cada cliente. Ficam: clientes, equipe, acessos, Client Brain (exceto registros dos quadros mensais) e fichas.
// Os conteúdos novos entram como OPERAÇÃO NORMAL (data_origin=plataforma): prazos, pendências e atrasos contam a partir daqui.
// A origem de cada conteúdo fica registrada (reference = página do Notion; observações internas = texto e comentários).
// Nada é inventado: sem título no cronograma → "tema a definir"; sem etapa clara → registrado em Decisões da migração.
//
// Entradas (extração só de leitura, feita em 23/10): RECOMECO_DIR/board_out{1,2,3}.json e RECOMECO_DIR/cr_nov.json
// Uso: BOLD_DATA_DIR=… BOLD_STORAGE_DIR=… RECOMECO_DIR=… node server/migration/recomecar-novembro.js [--aplicar]
//   sem --aplicar: recusa rodar fora de uma cópia de trabalho (scratchpad). Antes de qualquer mudança grava uma cópia da base.
import fs from 'node:fs';
import path from 'node:path';
import { one, all, insert, update, run, uid, now, tx, db } from '../db.js';
import { log } from '../lib/core.js';
import { createContent, ensureCycle, blockContent, editableVersion, resolveAssignee, STAGES } from '../engine/process.js';

const DIR = path.resolve(process.env.RECOMECO_DIR || 'storage/migration/notion/recomeco');
const DATA = path.resolve(process.env.BOLD_DATA_DIR || 'storage');
const APPLY = process.argv.includes('--aplicar');
if (!APPLY && !/scratchpad/.test(DATA)) { console.error('Recusado: sem --aplicar este script só roda numa cópia de trabalho (BOLD_DATA_DIR dentro do scratchpad).'); process.exit(2); }
const MONTH = '2026-11';
const SOURCE = 'notion:recomeco-novembro';
const startedAt = now();
const read = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const board = ['board_out1.json', 'board_out2.json', 'board_out3.json'].flatMap(read);
const cr = read('cr_nov.json');

// ── 0. Cópia de segurança da base antes de qualquer mudança ──
const dbFile = path.join(DATA, 'bold.db');
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
const backup = `${dbFile}.antes-recomeco-${startedAt.slice(0, 19).replace(/[:T]/g, '-')}`;
fs.copyFileSync(dbFile, backup);

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9º]+/g, ' ').trim();
const MONTH_WORDS = ['jan', 'janeiro', 'fev', 'fevereiro', 'mar', 'marco', 'abr', 'abril', 'mai', 'maio', 'jun', 'junho', 'jul', 'julho', 'ago', 'agosto', 'set', 'setembro', 'out', 'outubro', 'nov', 'novembro', 'dez', 'dezembro'];
const clients = all('SELECT id, name, aliases FROM clients');
const OVERRIDES = (() => { const f = path.resolve('storage/migration/notion/_novembro_overrides.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}; })();
// Mesmo critério do importador dos quadros: nome exato/apelido; abreviação só com sobrenome confirmando
function findClient(title) {
  if (OVERRIDES[title.trim()]) { const c = clients.find((x) => x.name === OVERRIDES[title.trim()]); return c ? { c, loose: false } : null; }
  const t = norm(title.replace(/🚨/g, '').replace(/\(.*?\)/g, '')).replace(new RegExp(`\\b(${MONTH_WORDS.join('|')})\\b`, 'g'), '').replace(/\s+i\s*$/, '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const tt = t.split(' ');
  const names = (c) => [c.name, ...JSON.parse(c.aliases || '[]')].map(norm);
  const exact = clients.filter((c) => names(c).some((n) => n === t));
  if (exact.length === 1) return { c: exact[0], loose: false };
  const tokenOk = (w, x, i) => x && (x.startsWith(w) || (i === 0 && tt.length > 1 && w.length >= 3 && x.startsWith(w.slice(0, 3))));
  const pref = clients.filter((c) => names(c).some((n) => { const nt = n.split(' '); return tt.every((w, i) => tokenOk(w, nt[i], i)); }));
  const loose = (c) => tt.length === 1 || !names(c).some((n) => { const nt = n.split(' '); return tt.every((w, i) => nt[i] === w); });
  return pref.length === 1 ? { c: pref[0], loose: loose(pref[0]) } : null;
}
const userByFirst = (n) => one("SELECT * FROM users WHERE role_key<>'cliente' AND active=1 AND (lower(name)=lower(?) OR lower(name) LIKE lower(?))", n, `${n} %`);
const COLUMN_PERSON = { 'Design Felipe': ['Felipe', 'design'], 'Design Moni': ['Monique', 'design'], 'Design Nicole': ['Nicole', 'design'], 'Edição de vídeo Leo': ['Léo', 'edicao'], 'Edição de vídeo Nicole': ['Nicole', 'edicao'] };
// Coluna do quadro → etapa. "Ajustados pós análise" = ajuste interno feito → regra da CEO (23/10): segue para a aprovação do cliente.
// "Cronograma pronto" = temas prontos → produção (o card de produção do cliente, quando existe, manda).
const COLUMN_STAGE = { Cronograma: 'cronograma', 'Análise cronograma': 'analise_cronograma', 'Cronograma pronto': 'producao', Legenda: 'producao',
  'Design Felipe': 'producao', 'Design Moni': 'producao', 'Design Nicole': 'producao', 'Edição de vídeo Leo': 'producao', 'Edição de vídeo Nicole': 'producao', 'Pendente por material': 'producao',
  'Análise produção': 'analise_producao', 'Aguardando ajustes': 'ajuste_interno', 'Ajustados pós análise': 'aprovacao_cliente', 'Aprovação dos Clientes': 'aprovacao_cliente', 'Para agendamento': 'agendamento', Agendado: 'agendado' };
const ORDER = ['cronograma', 'analise_cronograma', 'producao', 'analise_producao', 'ajuste_interno', 'aprovacao_cliente', 'agendamento', 'agendado'];
const QTY = [[/(\d+)\s*carross/i, 'carrossel', 'Carrossel'], [/(\d+)\s*est[aá]tic/i, 'estatico', 'Estático'], [/(\d+)\s*reels?\b/i, 'reel', 'Reels']];
// Texto puro: a marcação do Notion (<p>, <br />, entidades) vira texto; o conteúdo não muda
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const clean = (v) => (typeof v === 'string' ? v.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENT[m]).trim() : v);
// Formato pelo prefixo do título no cronograma (CARROSSEL:, REELS:, ESTÁTICO:, ÚNICO: = post único)
const formatOf = (title) => { const p = String(title || '').split(':')[0].toUpperCase(); return /CARROSS/.test(p) ? 'carrossel' : /REEL|V[IÍ]DEO/.test(p) ? 'reel' : /EST[AÁ]TIC|[ÚU]NICO|POST\b/.test(p) ? 'estatico' : null; };
const visualType = (format) => (format === 'reel' ? 'REELS' : 'DESIGN');
const fmt = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
// Autores e menções do Notion aparecem como user://id: o nome vem do mapa de usuários da extração dos quadros (quando conhecido)
const NUSERS = (() => { try { return JSON.parse(fs.readFileSync(path.resolve('storage/migration/notion/_board_novembro.json'), 'utf8')).users || {}; } catch { return {}; } })();
const who = (s) => String(s || '').replace(/user:\/\/([0-9a-f-]{36})/g, (m, id) => NUSERS[id]?.name || m);
const cardText = (card) => !card ? '' : [
  `Quadro “Controle produção NOVEMBRO” · coluna “${card.column}”${card.type ? ` · ${card.type}` : ''} — ${card.url}`,
  card.body_text?.trim() ? `Conteúdo do card:\n${card.body_text.trim()}` : '',
  card.comments?.length ? `Comentários do card:\n${card.comments.map((c) => `— ${who(c.author)} em ${fmt(c.created_time)}: ${who(c.text)}`).join('\n')}` : '',
].filter(Boolean).join('\n');
const propText = (props) => Object.entries(props || {}).filter(([k, v]) => !['Date', 'Name'].includes(k) && !String(k).startsWith('date:') && v != null && v !== '' && v !== false && !(Array.isArray(v) && !v.length))
  .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.map(clean).join(', ') : typeof v === 'object' ? JSON.stringify(v) : v === true || v === '__YES__' ? 'sim' : clean(v)}`).join('\n');

const R = { backup: path.basename(backup), before: {}, deleted: {}, created: 0, byClient: {}, byStage: {}, issues: [], cards_used: new Set(), unmatched_cards: [], no_cr: [], qty_diff: [] };
const issue = (clientId, clientName, description) => { R.issues.push(`${clientName || '—'}: ${description}`); insert('migration_issues', { id: uid('mi_'), client_id: clientId || null, client_name: clientName || null, kind: 'recomeco_novembro', description, source: SOURCE, status: 'aberto', created_at: now() }); };
const count = (sql) => one(sql).n;
const legBehind = new Set();

tx(() => {
  // ── 1. O que existe antes ──
  R.before = {
    conteudos: count('SELECT COUNT(*) n FROM contents'), tarefas: count('SELECT COUNT(*) n FROM tasks'), legados: count("SELECT COUNT(*) n FROM contents WHERE legacy_status IS NOT NULL"),
    versoes: count('SELECT COUNT(*) n FROM content_versions'), historico_cr: count('SELECT COUNT(*) n FROM notion_history'), revisoes_legado: count('SELECT COUNT(*) n FROM delay_reviews'),
    ciclos: count('SELECT COUNT(*) n FROM cycles'), registros_quadros_brain: count("SELECT COUNT(*) n FROM client_brain_entries WHERE source_ref LIKE 'notion-out:%' OR source_ref LIKE 'notion-nov:%'"),
    clientes: count('SELECT COUNT(*) n FROM clients'), equipe: count("SELECT COUNT(*) n FROM users WHERE role_key<>'cliente'"), acessos_clientes: count("SELECT COUNT(*) n FROM users WHERE role_key='cliente'"),
    brain_entries: count('SELECT COUNT(*) n FROM client_brain_entries'),
  };
  // ── 2. Apagar (o histórico de atividades é imutável e fica; o registro desta troca entra nele) ──
  const del = (label, sql, ...p) => { R.deleted[label] = db.prepare(sql).run(...p).changes; };
  del('notificacoes_de_conteudo', 'DELETE FROM notifications WHERE content_id IS NOT NULL');
  del('revisoes_de_legado', 'DELETE FROM delay_reviews');
  del('tarefas', "DELETE FROM tasks WHERE content_id IS NOT NULL OR data_origin='notion'");
  del('conteudos', 'DELETE FROM contents');
  del('salas_de_revisao', 'DELETE FROM review_sessions');
  del('historico_cr_editorial', 'DELETE FROM notion_history');
  del('ciclos', 'DELETE FROM cycles');
  del('registros_dos_quadros_no_brain', "DELETE FROM client_brain_entries WHERE source_ref LIKE 'notion-out:%' OR source_ref LIKE 'notion-nov:%'");
  del('decisoes_de_migracao_dos_quadros', "DELETE FROM migration_issues WHERE kind IN ('quadro_mensal','calendario','cr_editorial','recomeco_novembro') OR source LIKE 'notion:outubro%' OR source LIKE 'notion:novembro%'");
  del('leituras_da_inteligencia', "DELETE FROM ai_insights WHERE status='aberto'");
  del('eventos_de_conteudo', 'DELETE FROM events WHERE content_id IS NOT NULL');

  // ── 3. Quadro de novembro por cliente e tipo ──
  const cards = board.filter((c) => !c.is_column_label && c.title?.trim() && c.type);
  const byClient = new Map();
  for (const card of cards) {
    const m = findClient(card.title);
    if (!m) { R.unmatched_cards.push(`${card.title} (${card.column}) — ${card.url}`); issue(null, card.title, `Card “${card.title}” (${card.column}) não corresponde a um cliente com segurança — não importado. ${card.url}`); continue; }
    if (m.loose) issue(m.c.id, m.c.name, `Card “${card.title}” associado por apelido a ${m.c.name} — confirmar.`);
    const slot = byClient.get(m.c.id) || byClient.set(m.c.id, {}).get(m.c.id);
    if (slot[card.type]) issue(m.c.id, m.c.name, `Dois cards ${card.type} no quadro (“${slot[card.type].column}” e “${card.column}”); valeu o mais adiantado.`);
    if (!slot[card.type] || ORDER.indexOf(COLUMN_STAGE[card.column]) > ORDER.indexOf(COLUMN_STAGE[slot[card.type].column])) slot[card.type] = card;
  }
  const crByClient = new Map(cr.clients.map((c) => [c.client_id, c]));
  const clientName = (id) => clients.find((c) => c.id === id)?.name;

  // Etapa de um conteúdo = coluna do card da peça (DESIGN ou REELS) do cliente; a legenda é trilha à parte (registrada)
  const stageFor = (slot, format) => {
    const vis = slot[visualType(format)], leg = slot.LEGENDA, crono = slot.Cronograma;
    const vs = vis ? COLUMN_STAGE[vis.column] : null, ls = leg ? COLUMN_STAGE[leg.column] : null;
    if (!vs && !ls) return { stage: crono ? COLUMN_STAGE[crono.column] || 'producao' : null, vis, leg, crono };
    // A etapa segue a peça (arte/vídeo) — é o que o quadro mostra para aquele tipo; sem card da peça, vale o da legenda
    return { stage: vs || ls, vs, ls, vis, leg, crono };
  };

  const createOne = ({ clientId, title, format, planned, ref, notes, caption, slot, fromCr }) => {
    const s = stageFor(slot || {}, format);
    let stage = s.stage;
    if (!stage) { stage = 'producao'; issue(clientId, clientName(clientId), `“${title}”: o cliente não tem card de ${visualType(format)}, legenda nem cronograma no quadro de novembro — entrou em Produção; confirmar a etapa.`); }
    const content = createContent({ client_id: clientId, title, format, stage, cycle_month: MONTH, planned_at: planned, reference: ref, internal_notes: notes, strategy_tags: ['recomeco-novembro'] }, null);
    run("UPDATE contents SET data_origin='plataforma' WHERE id=?", content.id);
    run("UPDATE tasks SET data_origin='plataforma' WHERE content_id=?", content.id);
    if (caption?.trim()) { const v = editableVersion(content, null); update('content_versions', { id: v.id }, { caption: caption.trim(), notes: 'Legenda vinda do CR EDITORIAL do Notion' }); }
    // Responsável pela trilha visual = pessoa do nome da coluna do Notion (Design Felipe → Felipe)
    const [pn, fn] = COLUMN_PERSON[s.vis?.column] || [];
    const person = pn ? userByFirst(pn) : null;
    if (person) run("UPDATE tasks SET assignee_id=? WHERE content_id=? AND function=? AND status IN ('aberta','em_andamento','agendada')", person.id, content.id, fn);
    // Produção com uma trilha já entregue no Notion: essa tarefa fica concluída (registrado), a outra segue aberta
    if (stage === 'producao') {
      if (s.vs && ORDER.indexOf(s.vs) > ORDER.indexOf('producao')) run("UPDATE tasks SET status='concluida', completed_at=?, description=description||' · entregue no Notion (coluna '||?||')' WHERE content_id=? AND description='trilha:visual' AND status IN ('aberta','em_andamento','agendada')", now(), s.vis.column, content.id);
      if (s.ls && ORDER.indexOf(s.ls) > ORDER.indexOf('producao')) run("UPDATE tasks SET status='concluida', completed_at=?, description=description||' · entregue no Notion (coluna '||?||')' WHERE content_id=? AND description='trilha:legenda' AND status IN ('aberta','em_andamento','agendada')", now(), s.leg.column, content.id);
    }
    // Aguardando ajustes: o ajuste pedido na análise vira tarefa de ajuste de quem produz a trilha (o pedido em si está no card/comentários)
    if (stage === 'ajuste_interno') {
      const vfn = format === 'reel' ? 'edicao' : 'design';
      const who = person?.id || resolveAssignee(clientId, vfn);
      const desc = `Ajuste pedido na análise (Notion: coluna “Aguardando ajustes”). O que ajustar está no card e nos comentários do Notion copiados nas observações internas.`;
      const t = insert('tasks', { id: uid('t_'), title: `Ajuste interno — ${title}`, description: desc, client_id: clientId, content_id: content.id, stage, function: vfn, assignee_id: who, status: 'aberta', kind: 'ajuste', origin: 'engine', priority: 'media', due_at: null, created_at: now(), data_origin: 'plataforma' });
      insert('adjustments', { id: uid('aj_'), content_id: content.id, version_id: null, origin: 'interno', size: 'normal', description: desc, requested_by: null, assigned_to: who, task_id: t.id, status: 'aberto', created_at: now() });
    }
    if (s.vis && s.ls && ORDER.indexOf(s.ls) < ORDER.indexOf(stage) && ORDER.indexOf(stage) > ORDER.indexOf('producao')) legBehind.add(`${clientName(clientId)}: legenda em “${s.leg.column}” no Notion, peça em “${s.vis.column}”`);
    if ((s.vis ? s.vis.column : s.leg?.column) === 'Pendente por material') blockContent(content.id, 'Pendente por material do cliente (Notion: “o que falta não foi produzido por falta de material do cliente”)', 'cliente', null, { silent: true });
    [s.vis, s.leg, s.crono].filter(Boolean).forEach((c) => R.cards_used.add(c.url));
    R.created++;
    R.byClient[clientName(clientId)] = (R.byClient[clientName(clientId)] || 0) + 1;
    R.byStage[STAGES[stage].label] = (R.byStage[STAGES[stage].label] || 0) + 1;
    if (!fromCr) R.byClientPlaceholder = (R.byClientPlaceholder || 0) + 1;
    return content;
  };

  // ── 4. Conteúdos: cronograma de novembro do CR EDITORIAL de cada cliente ──
  for (const c of cr.clients) {
    if (c.error) { issue(c.client_id, c.client_name, `CR EDITORIAL não lido: ${c.error}`); continue; }
    if (!one('SELECT 1 FROM clients WHERE id=?', c.client_id)) { issue(null, c.client_name, 'Cliente do CR EDITORIAL não existe mais na base — não importado.'); continue; }
    const slot = byClient.get(c.client_id) || {};
    ensureCycle(c.client_id, MONTH);
    const want = {};
    for (const r of c.rows) {
      const title = clean(String(r.title || r.properties?.Name || '')).replace(/\s+/g, ' ').trim();
      let format = formatOf(title) || formatOf(r.properties?.Tipo);
      if (!format) { format = 'estatico'; issue(c.client_id, c.client_name, `“${title || 'sem título'}” (${r.date?.slice(0, 10)}): o título não diz o formato (carrossel, reels, estático) — entrou como estático; confirmar.`); }
      want[format] = (want[format] || 0) + 1;
      const shown = title ? title.split(':').slice(1).join(':').trim() || title : `Conteúdo de ${r.date?.slice(0, 10)} (tema a definir)`;
      const s = stageFor(slot, format);
      const notes = [`Importado do Notion em ${fmt(startedAt)} · CR EDITORIAL de ${c.client_name} — ${r.notion_url}`, title ? `Título no Notion: ${title}` : 'Sem título no Notion', propText(r.properties), cardText(s.vis), cardText(s.leg), cardText(s.crono)].filter(Boolean).join('\n\n');
      createOne({ clientId: c.client_id, title: shown, format, planned: r.date ? new Date(`${r.date.slice(0, 10)}T12:00:00-03:00`).toISOString() : null, ref: r.notion_url, notes, caption: typeof r.properties?.LEGENDA === 'string' ? clean(r.properties.LEGENDA) : null, slot, fromCr: true });
    }
    // Diferença entre a lista do card (☐ 4 reels…) e o cronograma: registrada, nada é criado a mais
    for (const type of ['DESIGN', 'REELS']) {
      const card = slot[type]; if (!card) continue;
      const qty = {}; for (const t of card.todos || []) { const q = QTY.find(([re]) => re.test(t.text)); if (q) qty[q[1]] = (qty[q[1]] || 0) + Number(t.text.match(q[0])[1]); }
      for (const [f, n] of Object.entries(qty)) if ((want[f] || 0) !== n) { R.qty_diff.push(`${c.client_name}: card ${type} diz ${n} ${f} · cronograma tem ${want[f] || 0}`); issue(c.client_id, c.client_name, `Card ${type} do quadro lista ${n} ${f}, o cronograma de novembro tem ${want[f] || 0}. Valeu o cronograma.`); }
    }
  }

  // ── 5. Clientes com card no quadro e sem CR EDITORIAL: os itens da lista do card (tema a definir) ──
  for (const [clientId, slot] of byClient) {
    if (crByClient.has(clientId)) continue;
    const name = clientName(clientId);
    R.no_cr.push(name);
    ensureCycle(clientId, MONTH);
    for (const type of ['DESIGN', 'REELS']) {
      const card = slot[type]; if (!card) continue;
      for (const t of card.todos || []) {
        const q = QTY.find(([re]) => re.test(t.text)); if (!q) continue;
        const n = Number(t.text.match(q[0])[1]);
        for (let i = 0; i < n; i++) createOne({ clientId, title: `${q[2]} ${i + 1} de ${n} · novembro (tema a definir)`, format: q[1], planned: null, ref: `${card.url}#${q[1]}-${i + 1}`, notes: [`Importado do Notion em ${fmt(startedAt)} · cliente sem CR EDITORIAL de novembro; item da lista do card: ${t.checked ? '☑' : '☐'} ${t.text.trim()}`, cardText(card), cardText(slot.LEGENDA)].filter(Boolean).join('\n\n'), slot, fromCr: false });
      }
      if (!(card.todos || []).some((t) => QTY.some(([re]) => re.test(t.text)))) issue(clientId, name, `Card ${type} (${card.column}) sem lista com quantidade e o cliente não tem CR EDITORIAL de novembro — nenhum conteúdo criado. ${card.url}`);
    }
  }
  for (const card of cards) if (!R.cards_used.has(card.url) && findClient(card.title) && card.type !== 'Cronograma') R.issues.push(`Card não usado: ${card.title} · ${card.type} · ${card.column} (o cliente não tem conteúdo desse tipo no cronograma)`);

  // Importação não é operação: não dispara notificações nem conta como execução de automação
  if (legBehind.size) issue(null, null, `Em ${legBehind.size} card(s) a legenda está numa coluna anterior à da peça no Notion; a etapa seguiu a peça e a legenda fica registrada nas observações: ${[...legBehind].join(' · ')}.`);
  for (const [clientId, slot] of byClient) if (slot.LEGENDA?.column === 'Pendente por material' && slot[ 'DESIGN']?.column !== 'Pendente por material') issue(clientId, clientName(clientId), `Legenda “Pendente por material” no Notion (${slot.LEGENDA.url}); os conteúdos não foram bloqueados por isso — a peça segue a coluna dela.`);
  run('DELETE FROM notifications WHERE created_at >= ?', startedAt);
  run('DELETE FROM automation_runs WHERE created_at >= ?', startedAt);
  log({ action: 'migracao.recomeco_novembro', entity: 'sistema', summary: `Recomeço da operação (decisão da CEO 23/10): apagados ${R.deleted.conteudos} conteúdos e ${R.deleted.tarefas} tarefas do Notion; importados ${R.created} conteúdos de novembro (quadro PROCESSO + CR EDITORIAL). Cópia: ${R.backup}` });
});

R.after = { conteudos: count('SELECT COUNT(*) n FROM contents'), tarefas_abertas: count("SELECT COUNT(*) n FROM tasks WHERE status IN ('aberta','em_andamento')"), tarefas_agendadas: count("SELECT COUNT(*) n FROM tasks WHERE status='agendada'"),
  sem_responsavel: count("SELECT COUNT(*) n FROM tasks WHERE status IN ('aberta','em_andamento') AND assignee_id IS NULL AND function<>'cliente'"),
  vencidas: count(`SELECT COUNT(*) n FROM tasks WHERE status IN ('aberta','em_andamento') AND due_at < '${startedAt}' AND function<>'cliente'`), bloqueados: count('SELECT COUNT(*) n FROM contents WHERE blocked=1'),
  clientes: count('SELECT COUNT(*) n FROM clients'), equipe: count("SELECT COUNT(*) n FROM users WHERE role_key<>'cliente'"), acessos_clientes: count("SELECT COUNT(*) n FROM users WHERE role_key='cliente'"), brain_entries: count('SELECT COUNT(*) n FROM client_brain_entries') };
const out = { ...R, cards_used: R.cards_used.size };
fs.writeFileSync(path.join(DIR, 'relatorio-recomeco.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ before: R.before, deleted: R.deleted, created: R.created, byStage: R.byStage, after: R.after, issues: R.issues.length, unmatched: R.unmatched_cards.length, no_cr: R.no_cr, backup: R.backup }, null, 1));
