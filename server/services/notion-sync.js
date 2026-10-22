// SINCRONIZAÇÃO NOTION → THE BOLD OS (somente leitura do Notion).
// Fluxo: ALTERAÇÃO NO NOTION → DETECÇÃO (webhook oficial ou polling controlado) → VALIDAÇÃO → MAPEAMENTO → THE BOLD OS ATUALIZADA.
// Regras (CEO, 22/10):
//  · THE BOLD OS → NOTION = DESATIVADO. O cliente HTTP abaixo só lê: GET de páginas e POST de consulta/busca (leitura). Nada mais passa.
//  · Sem mapeamento conhecido → AGUARDANDO MAPEAMENTO. Nunca descarta, nunca inventa destino, nunca cria entidade nova sem mapeamento.
//  · Legado (data_origin=notion, LEGADO / MIGRADO DO NOTION — NÃO VALIDADO) nunca volta para a operação por causa do Notion.
//  · Sem NOTION_TOKEN: BLOQUEADO. Sem hospedagem persistente: a rotina não roda sozinha (nada de fingir cron na prévia).
//  · "Tempo real" só existiria com webhook; polling mostra a frequência real configurada.
import crypto from 'node:crypto';
import { one, all, insert, update, uid, now } from '../db.js';
import { log } from '../lib/core.js';
import { ITEMS as PROCESSO_ITEMS, PROCESSO, AUDIT } from '../data/notion-processo.js';

export const WRITE_BACK = false; // decisão da CEO: escrita de volta desativada até autorização explícita
export const NOTION_VERSION = '2022-06-28';
const API = 'https://api.notion.com/v1';
export const tokenPresent = () => !!process.env.NOTION_TOKEN;
// Só uma hospedagem persistente roda a rotina contínua (a prévia da Vercel é efêmera: cada instância tem uma cópia temporária da base)
export const persistentHost = () => process.env.BOLD_PERSISTENT_HOST === '1';
export const STATES = {
  ativa: 'SINCRONIZAÇÃO ATIVA', importado_nao_sincronizado: 'IMPORTADO, MAS NÃO SINCRONIZADO', parcial: 'PARCIAL',
  aguardando_mapeamento: 'AGUARDANDO MAPEAMENTO', aguardando_decisao: 'AGUARDANDO DECISÃO', documentacao: 'DOCUMENTAÇÃO / CONSULTA',
  fora_do_escopo: 'FORA DO ESCOPO', bloqueado_configuracao: 'BLOQUEADO POR CONFIGURAÇÃO',
};
const idOf = (url) => (String(url || '').replace(/-/g, '').match(/[0-9a-f]{32}/i) || [])[0] || null;
const dashed = (id) => (id && id.length === 32 ? `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}` : id);

// ── Cliente HTTP do Notion: SOMENTE LEITURA ─────────────────────────
// Fica no servidor: o token nunca vai para o navegador nem para o banco.
export async function notionRead(method, path, body) {
  const readOnlyPost = /^\/(databases\/[0-9a-f-]+\/query|search)$/i.test(path);
  if (!(method === 'GET' || (method === 'POST' && readOnlyPost))) throw Object.assign(new Error(`Bloqueado: ${method} ${path} escreveria no Notion (THE BOLD OS → NOTION desativado).`), { status: 403 });
  if (!tokenPresent()) throw Object.assign(new Error('NOTION_TOKEN não configurado.'), { status: 412 });
  const r = await fetch(`${API}${path}`, {
    method, headers: { Authorization: `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`Notion ${r.status}: ${j.message || j.code || 'erro'}`), { status: r.status });
  return j;
}

// ── Mapa completo (o que existe no Notion e para onde vai) ──────────
const PROC_STATE = { outubro: 'importado_nao_sincronizado', novembro: 'importado_nao_sincronizado', inicio: 'importado_nao_sincronizado',
  padrao: 'documentacao', aprov_doc: 'documentacao', central_doc: 'documentacao', setembro: 'aguardando_decisao', aprov_db: 'aguardando_mapeamento',
  aprov_log: 'aguardando_decisao', central_db: 'aguardando_decisao', central_hist: 'aguardando_decisao', aprov_teste: 'fora_do_escopo' };
const PROC_ENTITY = { outubro: 'Conteúdos e tarefas (data_origin=notion) · Client Brain (operacional)', novembro: 'Conteúdos e tarefas (data_origin=notion) · Client Brain (operacional)',
  inicio: 'Client Brain (entrada operacional)', padrao: '— (referência das etapas do Process Engine)', aprov_doc: '— (referência)', central_doc: '— (referência)',
  setembro: 'Histórico do Notion (se aprovado)', aprov_db: 'Ciclo do cliente · estado de aprovação (informativo)', aprov_log: 'Histórico de aprovação (se aprovado)',
  central_db: 'Cliente · leitura externa (se aprovado)', central_hist: 'Linha do tempo do cliente (se aprovado)', aprov_teste: '—' };
// Fontes fora da PROCESSO (lista da auditoria em routes/notion.js) sem ID registrado na exportação: aparecem sem inventar ID
const OTHERS = [
  { key: 'ocear_cronograma', label: 'Ocear — Cronograma editorial', state: 'aguardando_decisao', entity: 'Conteúdos (se aprovado)', note: 'Registros da operação atual, não importados até a decisão de como entram.' },
  { key: 'ocear_datas', label: 'Ocear — “Datas”', state: 'fora_do_escopo', entity: '—', note: 'Não é calendário editorial.' },
  { key: 'ocear_stories', label: 'Ocear — stories', state: 'fora_do_escopo', entity: '—', note: 'Não é base editorial.' },
  { key: 'tatiana_stories', label: 'Tatiana — STORIES', state: 'fora_do_escopo', entity: '—', note: 'Fora do pedido da migração.' },
  { key: 'thebold_3656', label: 'THE BOLD — base 3656…', state: 'bloqueado_configuracao', entity: '—', note: 'Base inacessível na exportação: precisa ser compartilhada com a integração.' },
  { key: 'credenciais', label: 'Senhas e credenciais', state: 'fora_do_escopo', entity: '—', note: 'Não migrado de propósito: acessos só pelo cofre cifrado da plataforma.' },
  { key: 'pautas', label: 'Banco de pautas', state: 'fora_do_escopo', entity: '—', note: 'Não migrado de propósito.' },
  { key: 'ideias', label: 'Páginas de ideias', state: 'fora_do_escopo', entity: '—', note: 'Não migrado de propósito.' },
  { key: 'anexos', label: 'Arquivos anexados no Notion', state: 'fora_do_escopo', entity: '—', note: 'Não migrado de propósito.' },
];
const CR_FIELDS = ['Name → título', 'Date → data', 'Tipo, ESTRATÉGIA, OBJETIVO, REFERÊNCIA, LEGENDA → propriedades', 'APROVAÇÃO ARTE/LEGENDA/TEMA → informativo (nunca aprovação)'];
const CR_UNMAPPED = ['Pessoas (👤 Responsável, Estrategista, Copywriter, Designer, Editor de Vídeo) — sem vínculo com usuários', 'Corpo da página (capa, cards, links) — não lido pela extração'];

// Fontes consultáveis (bases) — criadas desativadas; a CEO decide quais entram na sincronização viva
export function ensureSources() {
  const ts = now();
  const add = (key, label, notionId, mapper, clientId = null) => {
    if (!notionId || one('SELECT 1 FROM notion_sync_sources WHERE key=?', key)) return;
    insert('notion_sync_sources', { key, label, notion_id: notionId, kind: 'base', mapper, client_id: clientId, enabled: 0, interval_min: 15, created_at: ts });
  };
  for (const it of PROCESSO_ITEMS.filter((i) => i.kind === 'base' && PROC_STATE[i.key] !== 'fora_do_escopo')) add(`processo:${it.key}`, it.name, it.notion_id, null);
  for (const h of all("SELECT source, source_db_url, MIN(client_id) client_id FROM notion_history WHERE source_db_url IS NOT NULL GROUP BY source, source_db_url")) {
    add(`hist:${idOf(h.source_db_url)}`, h.source, dashed(idOf(h.source_db_url)), 'notion_history', h.client_id);
  }
}

export function syncMap() {
  ensureSources();
  const src = Object.fromEntries(all('SELECT * FROM notion_sync_sources').map((s) => [s.key, s]));
  const pending = Object.fromEntries(all("SELECT source_key k, COUNT(*) n FROM notion_changes WHERE status IN ('detectada','aguardando_mapeamento','conflito','erro') GROUP BY source_key").map((r) => [r.k, r.n]));
  const live = (s) => ({
    source_key: s?.key || null, enabled: !!s?.enabled, mapper: s?.mapper || null,
    last_sync: s?.last_success_at || null, last_run: s?.last_run_at || null, error: s?.last_error || null, pending: s ? pending[s.key] || 0 : 0,
    frequency: !s ? 'Não consultável (página / sem ID de base)' : !tokenPresent() ? 'Nenhuma — bloqueado (NOTION_TOKEN não configurado)' : !persistentHost() ? 'Nenhuma automática — hospedagem não persistente (só “sincronizar agora”)' : s.enabled ? `Polling a cada ${s.interval_min} min` : 'Desligada (aguardando decisão de entrar na sincronização viva)',
  });
  const groups = [];
  // 1) Página PROCESSO
  groups.push({ key: 'processo', label: 'Página PROCESSO', notion_id: PROCESSO.notion_id, url: PROCESSO.url, items: PROCESSO_ITEMS.map((it) => {
    const s = src[`processo:${it.key}`];
    const diff = it.rows_extracted != null && it.rows != null && it.rows !== it.rows_extracted ? `${it.rows} cards no Notion × ${it.rows_extracted} extraídos em ${it.extracted_at.slice(8, 10)}/${it.extracted_at.slice(5, 7)}: diferença de ${it.rows - it.rows_extracted}` : null;
    const after = it.extracted_at && it.last_edited && it.last_edited > it.extracted_at ? 'Base editada no Notion depois da extração: a extração antiga não é o estado atual.' : null;
    return { key: it.key, label: it.name, origin: it.container === 'PROCESSO' ? PROCESSO.path : `${PROCESSO.path} / ${it.container}`, kind: it.kind, notion_id: it.notion_id, data_source: it.data_source || null,
      destination: it.destination, entity: PROC_ENTITY[it.key], mapped: it.mapped.map(([a, b]) => `${a} → ${b}`), unmapped: it.unmapped, direction: it.role === 'fora' ? '—' : 'Notion → The Bold OS (leitura)',
      state: PROC_STATE[it.key], rows: it.rows, rows_extracted: it.rows_extracted ?? null, imported_at: it.extracted_at || null, last_edited: it.last_edited || null,
      differences: [diff, after].filter(Boolean), note: it.note, ...live(s) };
  }) });
  // 2) CR Editorial e calendários dos clientes (espelho somente leitura em notion_history)
  const hist = all(`SELECT h.source, h.source_db_url, COUNT(*) n, SUM(h.empty) vazios, MAX(h.extracted_at) ext, MAX(h.last_edited_time) le, MIN(c.name) client
    FROM notion_history h LEFT JOIN clients c ON c.id=h.client_id WHERE h.source_db_url IS NOT NULL GROUP BY h.source, h.source_db_url ORDER BY h.source, client`);
  const histItem = (h) => { const id = idOf(h.source_db_url); const s = src[`hist:${id}`]; return {
    key: `hist:${id}`, label: `${h.source} — ${h.client || 'cliente não identificado'}`, origin: `Página do cliente / ${h.source}`, kind: 'base', notion_id: dashed(id), url: h.source_db_url,
    destination: 'Histórico do Notion (somente leitura) · calendário editorial do cliente', entity: 'notion_history (espelho do card) · vínculo opcional com Conteúdo',
    mapped: CR_FIELDS, unmapped: CR_UNMAPPED, direction: 'Notion → The Bold OS (leitura)', state: 'importado_nao_sincronizado', rows: null, rows_extracted: h.n,
    imported_at: h.ext, last_edited: h.le, differences: [], note: `${h.n} registros importados (${h.vazios || 0} vazios, ocultos). Mapeamento pronto; entra na sincronização viva quando a CEO liberar.`, ...live(s) }; };
  groups.push({ key: 'cr', label: 'CR Editorial dos clientes', items: hist.filter((h) => h.source === 'CR EDITORIAL').map(histItem) });
  groups.push({ key: 'calendarios', label: 'Calendários extras (auditados)', items: hist.filter((h) => h.source !== 'CR EDITORIAL').map(histItem) });
  // 3) Páginas dos clientes (Client Brain e onboarding com procedência)
  const pages = one("SELECT COUNT(*) n FROM clients WHERE notion_url IS NOT NULL AND notion_url<>''").n;
  const brain = one("SELECT COUNT(*) n, MAX(created_at) at FROM client_brain_entries WHERE source_type='notion'");
  groups.push({ key: 'paginas', label: 'Páginas dos clientes', items: [{
    key: 'paginas_clientes', label: `Páginas dos clientes (${pages})`, origin: 'THE BOLD MKT / clientes', kind: 'pagina', notion_id: null, destination: 'Ficha do cliente · Client Brain · Onboarding', entity: 'client_brain_entries · onboarding_answers (com página de origem)',
    mapped: ['Seções da página → Client Brain (com procedência)', 'Formulário → respostas do onboarding'], unmapped: ['Mudanças posteriores no texto das páginas (sem mapeamento de atualização)'],
    direction: 'Notion → The Bold OS (leitura)', state: 'importado_nao_sincronizado', rows: null, rows_extracted: brain.n, imported_at: brain.at, last_edited: null, differences: [],
    note: 'IDs por cliente ficam na ficha (Origem dos dados). Alteração detectada numa página de cliente fica AGUARDANDO MAPEAMENTO.', ...live(null) }] });
  // 4) Demais fontes da auditoria
  groups.push({ key: 'outras', label: 'Outras bases da auditoria', items: OTHERS.map((o) => ({ key: o.key, label: o.label, origin: '—', kind: '—', notion_id: null, destination: o.entity, entity: o.entity, mapped: [], unmapped: [],
    direction: o.state === 'fora_do_escopo' ? '—' : 'Notion → The Bold OS (se aprovado)', state: o.state, rows: null, rows_extracted: null, imported_at: null, last_edited: null, differences: [], note: o.note, ...live(null) })) });
  return groups;
}

// ── Detecção → validação → mapeamento → aplicação ─────────────────
const titleOf = (page) => { const t = Object.values(page.properties || {}).find((p) => p.type === 'title'); return (t?.title || []).map((x) => x.plain_text).join('') || null; };
const dateOf = (page) => { const d = Object.entries(page.properties || {}).find(([, p]) => p.type === 'date' && p.date?.start); return d ? { prop: d[0], start: d[1].date.start, end: d[1].date.end || null } : null; };
const plainProps = (page) => Object.fromEntries(Object.entries(page.properties || {}).map(([k, p]) => [k,
  p.type === 'title' || p.type === 'rich_text' ? (p[p.type] || []).map((x) => x.plain_text).join('') : p.type === 'select' ? p.select?.name || null : p.type === 'multi_select' ? (p.multi_select || []).map((x) => x.name)
    : p.type === 'checkbox' ? p.checkbox : p.type === 'date' ? p.date?.start || null : p.type === 'url' ? p.url : p.type === 'people' ? (p.people || []).map((x) => `user://${x.id}`) : p.type === 'number' ? p.number : null]));
const hashOf = (obj) => crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 24);

// Mapeadores conhecidos. Fonte sem mapeador → AGUARDANDO MAPEAMENTO.
const MAPPERS = {
  // Espelho somente leitura do card (CR Editorial / calendários). Conteúdo vinculado NUNCA é alterado sozinho: divergência vira CONFLITO para revisão.
  notion_history(change, page, source) {
    const url = page.url || change.notion_url;
    const row = one('SELECT * FROM notion_history WHERE notion_url=? OR notion_url=?', url, url?.replace('www.notion.so', 'app.notion.com'));
    const d = dateOf(page);
    const patch = { title: titleOf(page), date_start: d?.start?.slice(0, 10) || null, date_end: d?.end?.slice(0, 10) || null, date_property: d?.prop || null,
      properties: JSON.stringify(plainProps(page)), last_edited_time: page.last_edited_time || null, extracted_at: now() };
    if (row) update('notion_history', { id: row.id }, patch);
    else insert('notion_history', { id: uid('nh_'), client_id: source.client_id, source: source.label, source_db_url: `https://app.notion.com/p/${idOf(source.notion_id)}`, notion_url: url, created_time: page.created_time || null, imported_at: now(), ...patch });
    const hid = row?.id || one('SELECT id FROM notion_history WHERE notion_url=?', url)?.id;
    const link = hid && one('SELECT l.*, c.title ctitle, c.planned_at, c.legacy_status FROM content_notion_links l JOIN contents c ON c.id=l.content_id WHERE l.history_id=?', hid);
    if (link) {
      const differs = (patch.title && patch.title !== link.ctitle) || (patch.date_start && link.planned_at && patch.date_start !== link.planned_at.slice(0, 10));
      if (differs) return { status: 'conflito', entity_type: 'content', entity_id: link.content_id,
        note: `Card vinculado mudou no Notion (${patch.title || '—'} · ${patch.date_start || 'sem data'}). O conteúdo da plataforma não foi alterado${link.legacy_status ? ' (item legado: continua fora da operação)' : ''} — revisar e decidir.` };
    }
    return { status: 'aplicada', entity_type: 'notion_history', entity_id: hid, note: row ? 'Espelho do card atualizado (somente leitura).' : 'Card novo numa base mapeada: espelho criado no histórico (somente leitura). Nenhum conteúdo criado.' };
  },
};

export function recordChange({ source_key = null, page, via, kind }) {
  const props = plainProps(page);
  const hash = hashOf({ props, archived: !!page.archived || !!page.in_trash });
  const prev = one('SELECT hash FROM notion_changes WHERE notion_page_id=? ORDER BY detected_at DESC LIMIT 1', page.id);
  if (prev?.hash === hash && kind === 'alterado') return null; // nada mudou de fato (só metadados)
  const wasKnown = !!prev;
  const k = kind || (page.archived || page.in_trash ? 'arquivado' : wasKnown ? 'alterado' : 'novo');
  try {
    return insert('notion_changes', { id: uid('nc_'), source_key, notion_page_id: page.id, notion_url: page.url || null, title: titleOf(page), kind: k, via,
      notion_last_edited: page.last_edited_time || now(), hash, payload: JSON.stringify({ properties: props, parent: page.parent || null }), status: 'detectada', detected_at: now() });
  } catch { return null; } // mesma edição já registrada (UNIQUE página + horário)
}

export function processChange(change, page) {
  const source = change.source_key && one('SELECT * FROM notion_sync_sources WHERE key=?', change.source_key);
  let r;
  if (!source || !source.mapper || !MAPPERS[source.mapper]) r = { status: 'aguardando_mapeamento', note: source ? `Base “${source.label}” sem mapeamento de atualização definido.` : 'Página fora das bases mapeadas.' };
  else if (change.kind === 'arquivado') r = { status: 'aguardando_mapeamento', note: 'Arquivamento no Notion: nada é apagado na plataforma; aguardando decisão.' };
  else { try { r = MAPPERS[source.mapper](change, page, source); } catch (e) { r = { status: 'erro', note: e.message }; } }
  update('notion_changes', { id: change.id }, { ...r, processed_at: now() });
  log({ kind: 'integracao', action: `notion.alteracao.${r.status}`, entity: r.entity_type || 'notion_page', id: r.entity_id || change.notion_page_id, summary: `Notion → The Bold OS: ${change.title || change.notion_page_id} · ${STATUS_LABEL[r.status]}${r.note ? ` · ${r.note}` : ''}` });
  return r;
}
export const STATUS_LABEL = { detectada: 'ALTERAÇÃO DETECTADA', aguardando_mapeamento: 'ALTERAÇÃO DETECTADA — AGUARDANDO MAPEAMENTO', aplicada: 'APLICADA', conflito: 'CONFLITO', erro: 'ERRO', ignorada: 'IGNORADA' };

// Polling controlado de uma base: lê só o que mudou desde o cursor (last_edited_time)
export async function pollSource(key, via = 'polling') {
  const s = one('SELECT * FROM notion_sync_sources WHERE key=?', key);
  if (!s) throw Object.assign(new Error('Base desconhecida.'), { status: 404 });
  const runRow = insert('notion_sync_runs', { id: uid('nr_'), source_key: key, via, status: 'ok', started_at: now() });
  if (!tokenPresent()) { update('notion_sync_runs', { id: runRow.id }, { status: 'bloqueado', error: 'NOTION_TOKEN não configurado', finished_at: now() }); throw Object.assign(new Error('BLOQUEADO — NOTION_TOKEN NÃO CONFIGURADO'), { status: 412 }); }
  update('notion_sync_sources', { key }, { last_run_at: now() });
  let pages = 0, changes = 0, cursor = s.cursor, next;
  try {
    do {
      const body = { page_size: 100, sorts: [{ timestamp: 'last_edited_time', direction: 'ascending' }], ...(s.cursor ? { filter: { timestamp: 'last_edited_time', last_edited_time: { on_or_after: s.cursor } } } : {}), ...(next ? { start_cursor: next } : {}) };
      const j = await notionRead('POST', `/databases/${idOf(s.notion_id)}/query`, body);
      for (const page of j.results || []) {
        pages++;
        if (s.cursor && page.last_edited_time <= s.cursor) continue;
        const ch = recordChange({ source_key: key, page, via });
        if (ch) { changes++; processChange(ch, page); }
        if (!cursor || page.last_edited_time > cursor) cursor = page.last_edited_time;
      }
      next = j.has_more ? j.next_cursor : null;
    } while (next);
    update('notion_sync_sources', { key }, { cursor, last_success_at: now(), last_error: null });
    update('notion_sync_runs', { id: runRow.id }, { pages, changes, finished_at: now() });
    return { pages, changes };
  } catch (e) {
    update('notion_sync_sources', { key }, { last_error: e.message });
    update('notion_sync_runs', { id: runRow.id }, { status: 'erro', pages, changes, error: e.message, finished_at: now() });
    throw e;
  }
}

// Rotina: só roda com token, hospedagem persistente e base ligada pela CEO
export async function pollDue() {
  if (!tokenPresent() || !persistentHost()) return { skipped: true };
  const due = all('SELECT * FROM notion_sync_sources WHERE enabled=1').filter((s) => !s.last_run_at || Date.now() - new Date(s.last_run_at).getTime() >= s.interval_min * 60e3);
  for (const s of due) { try { await pollSource(s.key); } catch { /* registrado na execução */ } }
  return { ran: due.length };
}

// Webhook oficial do Notion: verificação (verification_token) + assinatura HMAC (X-Notion-Signature) a cada evento.
// O evento só sinaliza; o conteúdo é lido de novo pela API (GET da página) antes de mapear.
const WEBHOOK_KIND = { 'page.created': 'novo', 'page.properties_updated': 'alterado', 'page.content_updated': 'alterado', 'page.moved': 'alterado', 'page.deleted': 'arquivado', 'page.undeleted': 'restaurado' };
export function verifyWebhook(raw, signature, token) {
  if (!token || !signature) return false;
  const mine = `sha256=${crypto.createHmac('sha256', token).update(raw).digest('hex')}`;
  return mine.length === signature.length && crypto.timingSafeEqual(Buffer.from(mine), Buffer.from(signature));
}
export async function handleWebhookEvent(ev) {
  const kind = WEBHOOK_KIND[ev.type];
  const pageId = ev.entity?.type === 'page' ? ev.entity.id : null;
  if (!kind || !pageId) return { ignored: true };
  const parentDb = ev.data?.parent?.type === 'database' ? ev.data.parent.id : null;
  const source = parentDb && one('SELECT * FROM notion_sync_sources WHERE replace(notion_id, \'-\', \'\')=?', String(parentDb).replace(/-/g, ''));
  let page = { id: pageId, last_edited_time: ev.timestamp, properties: {}, parent: ev.data?.parent || null };
  if (tokenPresent() && kind !== 'arquivado') page = await notionRead('GET', `/pages/${pageId}`);
  const ch = recordChange({ source_key: source?.key || null, page, via: 'webhook', kind });
  if (!ch) return { duplicate: true };
  return processChange(ch, page);
}

export function panelSummary() {
  const c = (sql, ...p) => one(sql, ...p).n;
  return {
    token: tokenPresent(), persistent: persistentHost(), write_back: WRITE_BACK, version: NOTION_VERSION, audit: AUDIT,
    webhook: { configured: !!one("SELECT value FROM settings WHERE key='notion.webhook'"), path: '/api/integrations/webhooks/notion' },
    last_sync: one('SELECT MAX(last_success_at) t FROM notion_sync_sources').t || null,
    last_run: one('SELECT * FROM notion_sync_runs ORDER BY started_at DESC LIMIT 1') || null,
    counts: {
      detectadas: c('SELECT COUNT(*) n FROM notion_changes'), aguardando_mapeamento: c("SELECT COUNT(*) n FROM notion_changes WHERE status='aguardando_mapeamento'"),
      conflitos: c("SELECT COUNT(*) n FROM notion_changes WHERE status='conflito'"), erros: c("SELECT COUNT(*) n FROM notion_changes WHERE status='erro'") + c("SELECT COUNT(*) n FROM notion_sync_runs WHERE status='erro'"),
      aplicadas: c("SELECT COUNT(*) n FROM notion_changes WHERE status='aplicada'"), bases_ligadas: c('SELECT COUNT(*) n FROM notion_sync_sources WHERE enabled=1'),
    },
  };
}
export const recentChanges = (status) => all(`SELECT * FROM notion_changes ${status ? 'WHERE status=?' : ''} ORDER BY detected_at DESC LIMIT 100`, ...(status ? [status] : []));
export const setSource = (key, patch, user) => update('notion_sync_sources', { key }, { ...patch, updated_by: user?.id || null, updated_at: now() });
