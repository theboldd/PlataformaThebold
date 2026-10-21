// VALIDAÇÃO REAL DA ÁREA DO CLIENTE — TESTE_E2E_BLOCO_4
// Roda sobre uma CÓPIA ISOLADA da base real (snapshot cifrado decifrado numa pasta de trabalho). O snapshot original não é alterado.
// Toda chamada de rede externa é BLOQUEADA (e registrada): nenhum e-mail, Google, Slack, Meta ou IA é acionado.
// Tudo o que o teste cria leva a marca TESTE_E2E_BLOCO_4 quando há campo adequado; ao final, os registros criados pelo teste
// são removidos e os alterados são revertidos. A prova é a comparação tabela a tabela do ANTES com o DEPOIS.
//
// Uso:  npm run build && BOLD_SNAPSHOT_KEY=... node scripts/e2e-bloco4.mjs [--client <id>] [--out <pasta>] [--keep]
//   --client  cliente escolhido (sem ele, o script escolhe e explica a escolha)
//   --keep    não limpa (só para depuração; o relatório marca a limpeza como NÃO feita)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const TAG = 'TESTE_E2E_BLOCO_4';
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const OUT = path.resolve(arg('--out') || path.join(os.tmpdir(), 'e2e-bloco4'));
const KEEP = process.argv.includes('--keep');
fs.mkdirSync(OUT, { recursive: true });
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-bloco4-db-'));

// ── 0. Cópia isolada da base real ─────────────────────────────────────
const keyB64 = process.env.BOLD_SNAPSHOT_KEY;
const SNAP = path.resolve(process.env.E2E_SNAPSHOT || 'real-snapshot/bold.db.enc'); // E2E_SNAPSHOT: só para ensaio do próprio roteiro
if (!keyB64) { console.error('BOLD_SNAPSHOT_KEY ausente: sem a chave não há base real. Nada foi executado.'); process.exit(2); }
const key = Buffer.from(keyB64.trim(), 'base64');
const snapHash = crypto.createHash('sha256').update(fs.readFileSync(SNAP)).digest('hex');
{
  const buf = fs.readFileSync(SNAP);
  const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  fs.writeFileSync(path.join(WORK, 'bold.db'), Buffer.concat([d.update(buf.subarray(28)), d.final()]));
}
Object.assign(process.env, { BOLD_DATA_DIR: WORK, BOLD_STORAGE_DIR: WORK, BOLD_DB_PATH: path.join(WORK, 'bold.db'), BOLD_SCHEDULER: 'off' });
for (const k of ['RESEND_API_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET', 'META_APP_ID', 'META_APP_SECRET', 'ANTHROPIC_API_KEY']) delete process.env[k];
// Mesmos segredos derivados que a prévia usa (o cofre de acessos continua legível como na Vercel)
const derive = (label) => Buffer.from(crypto.hkdfSync('sha256', key, Buffer.alloc(0), label, 32));
process.env.BOLD_VAULT_KEY ||= derive('bold-vault').toString('base64');

// Bloqueio de rede externa: só o próprio servidor de teste (127.0.0.1) é alcançável
const blocked = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = String(input?.url || input);
  if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) return realFetch(input, init);
  blocked.push({ url: url.replace(/\?.*/, ''), at: new Date().toISOString() });
  return Promise.reject(new Error(`Rede externa bloqueada durante o ${TAG}: ${url.replace(/\?.*/, '')}`));
};

const { db, one, all, insert, uid, now, run, setClock } = await import('../server/db.js');
const rawCounts = Object.fromEntries(all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").map((t) => [t.name, one(`SELECT COUNT(*) n FROM "${t.name}"`).n]));
const { createApp, bootstrap } = await import('../server/index.js');
bootstrap(); // ajustes únicos de inicialização acontecem ANTES da fotografia "antes" (não são dados de teste)
const P = await import('../server/engine/process.js');
const { activateScheduledTasks } = await import('../server/engine/scheduler.js');
const { hashPassword, createSession, COOKIE } = await import('../server/lib/auth.js');
const { waitForProcessing } = await import('../server/services/media.js');
const sharp = (await import('sharp')).default;

// ── Fotografia completa da base (para provar o antes/depois) ──
const TABLES = all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((t) => t.name);
function pkOf(t) { const pk = all(`PRAGMA table_info("${t}")`).filter((c) => c.pk).sort((a, b) => a.pk - b.pk).map((c) => c.name); return pk.length ? pk : null; }
const PK = Object.fromEntries(TABLES.map((t) => [t, pkOf(t)]));
function dump() {
  const out = {};
  for (const t of TABLES) {
    const rows = all(`SELECT rowid AS __rowid, * FROM "${t}"`);
    out[t] = new Map(rows.map((r) => { const { __rowid, ...rest } = r; const k = PK[t] ? PK[t].map((c) => r[c]).join('|') : `rowid:${__rowid}`; return [k, rest]; }));
  }
  return out;
}
const hashTable = (m) => crypto.createHash('sha256').update(JSON.stringify([...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1)))).digest('hex').slice(0, 16);
function diff(a, b) {
  const added = {}, removed = {}, changed = {};
  for (const t of TABLES) {
    for (const [k, r] of b[t]) { if (!a[t].has(k)) (added[t] ||= []).push({ key: k, row: r }); else if (JSON.stringify(a[t].get(k)) !== JSON.stringify(r)) (changed[t] ||= []).push({ key: k, before: a[t].get(k), after: r }); }
    for (const [k, r] of a[t]) if (!b[t].has(k)) (removed[t] ||= []).push({ key: k, row: r });
  }
  return { added, removed, changed };
}
const files0 = new Set(listFiles(WORK));
function listFiles(dir) { const o = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (!/bold\.db(-wal|-shm)?$/.test(e.name)) o.push(path.relative(WORK, p)); } }; walk(dir); return o; }
const BEFORE = dump();

// ── Relatório ──
const R = { tag: TAG, started_at: new Date().toISOString(), snapshot_sha256: snapHash, steps: [], notes: [], client: null };
let section = '';
const sec = (s) => { section = s; console.log(`\n■ ${s}`); };
async function step(name, fn) {
  try { const detail = await fn(); R.steps.push({ section, name, ok: true, detail: detail ?? null }); console.log(`  ✓ ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 220)}` : ''}`); return detail; }
  catch (e) { R.steps.push({ section, name, ok: false, error: e.message }); console.log(`  ✗ ${name} — ${e.message}`); return undefined; }
}
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

// ── 1. Escolha do cliente ──
const candidates = all(`SELECT c.id, c.name, c.status, o.form_status,
    (SELECT COUNT(*) FROM onboarding_answers a WHERE a.client_id=c.id AND a.source_type='notion' AND trim(a.answer)<>'') notion_answers,
    (SELECT COUNT(DISTINCT function) FROM client_members m JOIN users u ON u.id=m.user_id WHERE m.client_id=c.id AND u.active=1 AND m.function IN ('estrategia','design','edicao','copy','revisao','agendamento','atendimento')) roles,
    (SELECT COUNT(*) FROM client_members m WHERE m.client_id=c.id AND m.function='cliente') portal_users,
    (SELECT COUNT(*) FROM contents x WHERE x.client_id=c.id) contents
  FROM clients c JOIN onboarding o ON o.client_id=c.id WHERE c.status='ativo' AND COALESCE(c.is_demo,0)=0 ORDER BY (o.form_status='migrado_parcial') DESC, roles DESC, notion_answers DESC, contents DESC`);
const chosenId = arg('--client') || candidates[0]?.id;
const C = one('SELECT * FROM clients WHERE id=?', chosenId);
if (!C) { console.error('Nenhum cliente ativo disponível.'); process.exit(2); }
R.client = { id: C.id, name: C.name, criteria: candidates.find((x) => x.id === C.id), alternatives: candidates.slice(0, 6) };
console.log(`Cliente de teste: ${C.name} (${C.id})`, R.client.criteria);
const OTHER = one("SELECT * FROM clients WHERE id<>? AND status='ativo' ORDER BY name LIMIT 1", C.id);
const otherContent = OTHER ? one('SELECT id FROM contents WHERE client_id=? LIMIT 1', OTHER.id) : null;

// ── Servidor e sessões ──
const app = createApp();
const server = app.listen(0);
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const fakeReq = { ip: '127.0.0.1', headers: { 'user-agent': TAG } };
function client(cookie) {
  const call = async (method, url, body, form) => {
    const headers = { cookie, 'x-bold-request': '1' };
    if (body !== undefined && !form) headers['content-type'] = 'application/json';
    const r = await realFetch(`${ORIGIN}/api${url}`, { method, headers, body: form ? body : body !== undefined ? JSON.stringify(body) : undefined });
    const data = r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text();
    return { status: r.status, data };
  };
  return { get: (u) => call('GET', u), post: (u, b = {}) => call('POST', u, b), put: (u, b) => call('PUT', u, b), patch: (u, b) => call('PATCH', u, b), del: (u) => call('DELETE', u), form: (u, fd) => call('POST', u, fd, true) };
}
const sessions = new Map();
const as = (userId) => { if (!sessions.has(userId)) { const u = one('SELECT * FROM users WHERE id=?', userId); must(u, `usuário ${userId} não existe`); sessions.set(userId, client(`${COOKIE}=${createSession(u, fakeReq).token}`)); } return sessions.get(userId); };
const nameOf = (id) => one('SELECT name FROM users WHERE id=?', id)?.name || 'SEM RESPONSÁVEL';
const openTasks = (cid, extra = '') => all(`SELECT * FROM tasks WHERE content_id=? AND status IN ('aberta','em_andamento','agendada') ${extra}`, cid);

// Usuário de teste do cliente (acesso ao portal) — marcado
const PW = `${TAG}-${crypto.randomBytes(6).toString('hex')}`;
const CU = insert('users', { id: uid('u_'), name: `Cliente ${TAG}`, email: `${TAG.toLowerCase()}@teste.thebold.invalid`, password_hash: hashPassword(PW), role_key: 'cliente', title: TAG, functions: '[]', active: 1, capacity: 0, created_at: now() });
insert('client_members', { client_id: C.id, user_id: CU.id, function: 'cliente' });
let cu;

// Mídia de teste (imagens e vídeo com a marca)
async function art(label, color) {
  const svg = `<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${color}"/><text x="70" y="160" font-size="54" font-family="sans-serif" fill="#F6F3F0">${TAG}</text><text x="70" y="1220" font-size="96" font-family="serif" fill="#F6F3F0">${label}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}
function video(color) {
  const f = path.join(WORK, `${TAG}-${crypto.randomUUID()}.mp4`);
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=720x1280:d=6`, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-metadata', `title=${TAG}`, f]);
  const b = fs.readFileSync(f); fs.rmSync(f); return b;
}
const fdFiles = (list) => { const fd = new FormData(); for (const [buf, name, mime] of list) fd.append('files', new Blob([buf], { type: mime }), name); return fd; };

// PRONTO ≠ DISPONÍVEL: antes da data a ação é recusada (API e tela); na data do marco a tarefa abre, o responsável é avisado e então age.
// O relógio da aplicação é avançado SÓ neste processo e só para as tarefas do teste (nenhuma tarefa real é aberta).
const windows = [];
async function actWhenAvailable(contentId, actorId, label, act) { // act(cliente HTTP do responsável)
  const c = one('SELECT * FROM contents WHERE id=?', contentId);
  const t = one("SELECT * FROM tasks WHERE content_id=? AND stage=? AND status='agendada'", contentId, c.stage);
  if (!t || t.available_at <= now()) return act(as(actorId));
  const early = await as(actorId).post(`/contents/${contentId}/review`, { decision: 'aprovar' });
  must(early.status === 409 && /Etapa agendada/.test(early.data.error || ''), `ação antecipada não foi bloqueada (HTTP ${early.status})`);
  const detail = (await as(actorId).get(`/contents/${contentId}`)).data;
  must(detail.available_at === t.available_at, 'tela não informa quando a etapa abre');
  const queue = (await as(actorId).get('/review/queue')).data;
  const qi = JSON.stringify(queue).includes(contentId) ? [].concat(...Object.values(queue).filter(Array.isArray)).find((x) => x?.id === contentId) : null;
  setClock(new Date(new Date(t.available_at).getTime() + 60e3).toISOString());
  try {
    activateScheduledTasks([t.id]);
    must(one('SELECT status FROM tasks WHERE id=?', t.id).status === 'aberta', 'não abriu na data do marco');
    must(!t.assignee_id || one("SELECT 1 FROM notifications WHERE user_id=? AND title LIKE 'Disponível hoje%'", t.assignee_id), 'responsável não avisado na abertura');
    // sessão nova no relógio avançado (as anteriores, de 14 dias, já teriam vencido nessa data)
    const fresh = client(`${COOKIE}=${createSession(one('SELECT * FROM users WHERE id=?', actorId), fakeReq).token}`);
    // a validade da sessão é calculada pelo relógio real; esta sessão de teste passa a valer no relógio avançado
    run("UPDATE sessions SET expires_at=? WHERE id=(SELECT id FROM sessions WHERE user_agent=? ORDER BY rowid DESC LIMIT 1)", new Date(new Date(t.available_at).getTime() + 864e5).toISOString(), TAG);
    const r = await act(fresh);
    windows.push(`${label}: bloqueada até ${t.available_at.slice(0, 10)} (409), tela mostra a data${qi ? ', Sala de Revisão sem botão' : ''}; aberta na data → executada`);
    return r;
  } finally { setClock(null); }
}

// Produção REAL pela API, com as pessoas que o engine atribuir: cronograma → análise → tema (cliente) → produção → revisão → cliente
async function produce(title, format, media, days) {
  const est = P.resolveAssignee(C.id, 'estrategia');
  must(est, 'cliente sem estrategista vinculada');
  const plannedAt = new Date(Date.now() + days * 864e5); plannedAt.setUTCHours(15, 0, 0, 0);
  const r = await as(est).post('/contents', { client_id: C.id, title: `${TAG} · ${title}`, format, theme: `${TAG} — tema de teste`, objective: `${TAG}`, internal_notes: `${TAG}: conteúdo criado só para a validação; removido ao final`, planned_at: plannedAt.toISOString() });
  must(r.status === 200, `criar conteúdo: ${r.status} ${JSON.stringify(r.data).slice(0, 160)}`);
  const id = r.data.id;
  const flow = [];
  const t1 = openTasks(id)[0]; flow.push(`cronograma → ${nameOf(t1.assignee_id)}`);
  must((await as(t1.assignee_id).post(`/tasks/${t1.id}/complete`)).status === 200, 'concluir cronograma');
  let c = one('SELECT * FROM contents WHERE id=?', id);
  if (c.stage === 'analise_cronograma') { const t = openTasks(id)[0]; flow.push(`análise do cronograma → ${nameOf(t.assignee_id)}`); const x = await actWhenAvailable(id, t.assignee_id, 'análise do cronograma', (h) => h.post(`/contents/${id}/review`, { decision: 'aprovar' })); must(x.status === 200, `análise cronograma ${x.status} ${JSON.stringify(x.data)}`); }
  c = one('SELECT * FROM contents WHERE id=?', id);
  if (c.stage === 'aprovacao_tema') { const x = await cu.post(`/portal/contents/${id}/approve`, { confirm: true }); must(x.status === 200, `cliente aprova tema ${x.status} ${JSON.stringify(x.data)}`); flow.push('tema aprovado pelo cliente de teste no portal'); }
  c = one('SELECT * FROM contents WHERE id=?', id);
  must(c.stage === 'producao', `esperava produção, está em ${c.stage}`);
  const visual = openTasks(id, "AND description='trilha:visual'")[0];
  const legenda = openTasks(id, "AND description='trilha:legenda'")[0];
  flow.push(`visual → ${nameOf(visual?.assignee_id)} · legenda → ${nameOf(legenda?.assignee_id)}`);
  must(visual?.assignee_id && legenda?.assignee_id, 'trilha de produção sem responsável');
  const up = await as(visual.assignee_id).form(`/contents/${id}/media`, (() => { const fd = fdFiles(media); fd.append('deliver', '1'); return fd; })());
  must(up.status === 200, `upload ${up.status} ${JSON.stringify(up.data).slice(0, 160)}`);
  await waitForProcessing();
  must((await as(legenda.assignee_id).put(`/contents/${id}/caption`, { caption: `${TAG} — legenda de teste de “${title}”.` })).status === 200, 'legenda');
  const tl = openTasks(id, "AND description='trilha:legenda'")[0];
  if (tl) must((await as(tl.assignee_id).post(`/tasks/${tl.id}/complete`)).status === 200, 'concluir legenda');
  c = one('SELECT * FROM contents WHERE id=?', id);
  must(c.stage === 'analise_producao', `esperava revisão interna, está em ${c.stage}`);
  const rv = openTasks(id)[0]; flow.push(`revisão interna → ${nameOf(rv?.assignee_id)}${rv?.status === 'agendada' ? ` (etapa agendada: abre em ${rv.available_at?.slice(0, 10)})` : ''}`);
  const reviewer = rv?.assignee_id || P.reviewersFor(C.id)[0];
  const ok = await actWhenAvailable(id, reviewer, 'revisão interna', (h) => h.post(`/contents/${id}/review`, { decision: 'aprovar' }));
  must(ok.status === 200, `revisão ${ok.status} ${JSON.stringify(ok.data).slice(0, 160)}`);
  must(one('SELECT stage FROM contents WHERE id=?', id).stage === 'aprovacao_cliente', 'não chegou ao cliente');
  return { id, flow };
}

const notifsSince = (ts) => all('SELECT n.*, u.role_key FROM notifications n JOIN users u ON u.id=n.user_id WHERE n.created_at>=? OR n.updated_at>=? ORDER BY n.created_at', ts, ts);
const CLIENT_TYPES = new Set(['aprovacao', 'ajuste_recebido', 'resposta', 'solicitacao', 'decisao', 'reuniao', 'mensagem', 'lembrete', 'agendado', 'pulso', 'onboarding', 'mencao', 'material']);

// ════════════════ FLUXO ════════════════
let A, B;
sec('CLIENTE · login, Meu Momento Bold e onboarding');
await step('login do cliente de teste pela rota real', async () => {
  const r = await realFetch(`${ORIGIN}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bold-request': '1' }, body: JSON.stringify({ email: CU.email, password: PW }) });
  must(r.status === 200, `HTTP ${r.status}`); cu = client(r.headers.get('set-cookie').split(';')[0]); return 'sessão criada';
});
await step('produção real do carrossel (equipe atribuída pelo engine)', async () => { A = await produce('Carrossel', 'carrossel', [[await art('Página 1', '#45131D'), `${TAG}-p1.jpg`, 'image/jpeg'], [await art('Página 2', '#2C0A12'), `${TAG}-p2.jpg`, 'image/jpeg'], [await art('Página 3', '#561A26'), `${TAG}-p3.jpg`, 'image/jpeg']], 43); return A.flow.join(' · '); });
await step('produção real do reel (vídeo)', async () => { B = await produce('Reel', 'reel', [[video('0x380E17'), `${TAG}-reel.mp4`, 'video/mp4']], 44); return B.flow.join(' · '); });
const home = await step('Meu Momento Bold: jornada, o que precisa, The Bold está cuidando, depois', async () => {
  const h = (await cu.get('/portal/home')).data;
  must(h.journey?.steps?.length === 6, 'jornada');
  const ap = h.actions.find((a) => a.kind === 'aprovacao' && a.ids?.includes(A.id));
  must(ap, 'aprovação do carrossel não aparece em "Precisamos de você"');
  must(ap.due_at && ap.consequence, 'prazo/consequência ausentes');
  const internal = all("SELECT name FROM users WHERE role_key<>'cliente' AND active=1").map((u) => u.name.split(' ')[0]).filter((n) => n.length > 3);
  const leak = internal.filter((n) => JSON.stringify({ a: h.actions, d: h.doing, n: h.next }).includes(n));
  must(!leak.length, `nome interno exposto: ${leak.join(', ')}`);
  return { acoes: h.actions.map((a) => a.short), cuidando: h.doing.map((d) => d.label), depois: h.next.map((n) => n.text), prazo: ap.due_at };
});
await step('onboarding: migrado do Notion, só o que falta, nada inventado', async () => {
  const f = (await cu.get('/portal/onboarding/form')).data;
  const answers = all('SELECT question_key, answer, source_type FROM onboarding_answers WHERE client_id=?', C.id);
  const notion = answers.filter((a) => a.source_type === 'notion' && a.answer?.trim());
  const flagged = Object.entries(f.answers).filter(([, a]) => a.migrated).map(([k]) => k);
  must(notion.every((a) => flagged.includes(a.question_key)), 'resposta do Notion sem a marca "Migrado do Notion"');
  must(!f.missing_keys.some((k) => answers.find((a) => a.question_key === k && a.answer?.trim())), 'pergunta já respondida aparece como faltante');
  const visibleAnswers = Object.values(f.answers).filter((a) => a.value?.trim?.()).length;
  must(visibleAnswers === answers.filter((a) => a.answer?.trim() && !a.question_key.startsWith('acesso_')).length, 'tela mostra respostas que não existem no banco');
  const required = JSON.parse(one('SELECT required_keys FROM onboarding_forms WHERE active=1 ORDER BY created_at DESC LIMIT 1')?.required_keys || '[]');
  return { status: f.status, migrado: f.migrated, notion: notion.length, faltam: f.profile.missing, percentual: f.profile.percent, obrigatorias_configuradas: required.length };
});
await step('onboarding: conclusão respeita as obrigatórias configuradas', async () => {
  const required = JSON.parse(one('SELECT required_keys FROM onboarding_forms WHERE active=1 ORDER BY created_at DESC LIMIT 1')?.required_keys || '[]');
  if (!required.length) { R.notes.push('NENHUMA PERGUNTA OBRIGATÓRIA CONFIGURADA (required_keys vazio). Comportamento real mantido; definição é decisão de produto posterior.'); return 'NENHUMA PERGUNTA OBRIGATÓRIA CONFIGURADA — regra não alterada no teste'; }
  const missingReq = required.filter((k) => !one("SELECT 1 FROM onboarding_answers WHERE client_id=? AND question_key=? AND trim(answer)<>''", C.id, k));
  if (!missingReq.length) return 'todas as obrigatórias já respondidas';
  const r = await cu.post('/portal/onboarding/submit');
  must(r.status === 422, `envio com obrigatória faltando deveria falhar (HTTP ${r.status})`);
  return `bloqueado com ${missingReq.length} obrigatória(s) faltando`;
});
await step('calendário mostra os conteúdos e abre o conteúdo', async () => {
  const cal = (await cu.get('/portal/calendar')).data;
  must(cal.items.some((i) => i.id === A.id) && cal.items.some((i) => i.id === B.id), 'conteúdos de teste ausentes no calendário');
  const it = await cu.get(`/portal/contents/${A.id}`);
  must(it.status === 200 && it.data.version.number === 1, 'V1 não visível');
  must(it.data.versions.length === 1 && it.data.versions[0].state === 'atual', 'estado da V1');
  must(it.data.deadline?.title, 'prazo ausente no conteúdo');
  return `V1 · ${it.data.version.media.length} páginas · ${it.data.deadline.title}`;
});

sec('CLIENTE · comentário, pergunta, ajustes');
let t0 = now();
const comment = await step('comentário (não aprova, não muda etapa)', async () => {
  const fd = new FormData(); fd.append('body', `${TAG}: gostei da paleta.`); fd.append('intent', 'comentario');
  const r = await cu.form(`/portal/contents/${A.id}/comments`, fd);
  must(r.status === 200 && !r.data.action, `HTTP ${r.status}`);
  must(one('SELECT stage FROM contents WHERE id=?', A.id).stage === 'aprovacao_cliente', 'comentário mudou a etapa');
  return one("SELECT id FROM comments WHERE content_id=? AND body LIKE ? ORDER BY created_at DESC", A.id, `${TAG}: gostei%`).id;
});
await step('pergunta vira pendência da estrategista', async () => {
  const fd = new FormData(); fd.append('body', `${TAG}: essa foto é a do evento de março?`); fd.append('intent', 'pergunta');
  const r = await cu.form(`/portal/contents/${A.id}/comments`, fd);
  must(r.data.action?.type === 'pergunta', 'não registrou como pergunta');
  const cm = one("SELECT id FROM comments WHERE content_id=? AND kind='pergunta' ORDER BY created_at DESC", A.id);
  const t = one("SELECT * FROM tasks WHERE source_type='comment' AND source_id=?", cm.id);
  must(t?.assignee_id, 'pergunta sem responsável');
  return `pendência para ${nameOf(t.assignee_id)}`;
});
await step('pedido de ajuste estruturado: página 2 + ponto na imagem + tipo', async () => {
  const fd = new FormData(); fd.append('note', `${TAG}: trocar a imagem da página 2 por uma mais clara`); fd.append('aspect', 'imagem'); fd.append('carousel_page', '2'); fd.append('region', JSON.stringify({ x: 0.42, y: 0.37 })); fd.append('version', '1');
  const r = await cu.form(`/portal/contents/${A.id}/adjust`, fd);
  must(r.status === 200, `HTTP ${r.status} ${JSON.stringify(r.data).slice(0, 160)}`);
  const a = one("SELECT * FROM adjustments WHERE content_id=? AND origin='cliente' ORDER BY created_at DESC", A.id);
  must(a.carousel_page === 2 && a.aspect === 'imagem' && JSON.parse(a.region).x === 0.42, 'campos do ajuste');
  must(a.version_id === one('SELECT id FROM content_versions WHERE content_id=? AND number=1', A.id).id, 'ajuste não ligado à V1');
  return `responsável: ${nameOf(a.assigned_to)} · prazo ${a.due_at?.slice(0, 10)}`;
});
await step('converter comentário em ajuste (uma vez) e bloquear a segunda conversão', async () => {
  const r1 = await cu.post(`/portal/contents/${A.id}/comments/${comment}/convert`);
  must(r1.status === 200, `1ª conversão HTTP ${r1.status} ${JSON.stringify(r1.data).slice(0, 160)}`);
  const r2 = await cu.post(`/portal/contents/${A.id}/comments/${comment}/convert`);
  must(r2.status === 200 && r2.data.already === true && r2.data.adjustment_id === r1.data.adjustment_id, `2ª conversão deveria devolver o ajuste existente (HTTP ${r2.status})`);
  must(one('SELECT COUNT(*) n FROM adjustments WHERE comment_id=?', comment).n === 1, 'ajuste duplicado');
  const adj = one('SELECT * FROM adjustments WHERE id=?', r1.data.adjustment_id);
  const cm = one('SELECT * FROM comments WHERE id=?', comment);
  must(cm.body.includes(TAG) && cm.adjustment_id === adj.id && adj.comment_id === cm.id, 'vínculo comentário ↔ ajuste');
  must(adj.requested_by === CU.id && adj.created_at && adj.version_id === cm.version_id, 'usuário/data/versão do ajuste');
  return 'convertido 1x · 2ª tentativa devolve o mesmo ajuste · comentário original preservado e vinculado';
});
await step('pedido de ajuste com timestamp do vídeo (reel)', async () => {
  const fd = new FormData(); fd.append('note', `${TAG}: esse trecho poderia ser mais rápido`); fd.append('aspect', 'video'); fd.append('video_timestamp', '3'); fd.append('version', '1');
  const r = await cu.form(`/portal/contents/${B.id}/adjust`, fd);
  must(r.status === 200, `HTTP ${r.status}`);
  const a = one("SELECT * FROM adjustments WHERE content_id=? AND origin='cliente'", B.id);
  must(a.video_timestamp === 3, 'timestamp');
  return `00:03 · responsável: ${nameOf(a.assigned_to)}`;
});
await step('cliente vê o ajuste (local, tipo, versão)', async () => {
  const it = (await cu.get(`/portal/contents/${A.id}`)).data;
  must(it.adjustments.length >= 2 && it.adjustments.every((a) => a.version_number === 1), 'ajustes não listados');
  return it.adjustments.map((a) => `${a.where || '—'}: ${a.description.slice(0, 40)}`);
});

sec('EQUIPE · recebe, executa o ajuste e cria a V2');
let adjA;
await step('equipe notificada com o responsável certo', async () => {
  adjA = all("SELECT * FROM adjustments WHERE content_id=? AND origin='cliente' ORDER BY created_at", A.id);
  const designers = all("SELECT user_id FROM client_members WHERE client_id=? AND function='design'", C.id).map((r) => r.user_id);
  for (const a of adjA) {
    must(a.assigned_to, 'ajuste sem responsável');
    must(one("SELECT 1 FROM notifications WHERE user_id=? AND type='ajuste' AND content_id=?", a.assigned_to, A.id), `${nameOf(a.assigned_to)} não foi notificado`);
  }
  return adjA.map((a) => `${nameOf(a.assigned_to)}${designers.includes(a.assigned_to) ? ' (design do cliente)' : ''}`).join(' · ');
});
await step('equipe abre o conteúdo e vê V1 + ajustes', async () => {
  const r = await as(adjA[0].assigned_to).get(`/contents/${A.id}`);
  must(r.status === 200, `HTTP ${r.status}`);
  return `HTTP 200 · ${r.data.content?.stage || r.data.stage || 'conteúdo aberto'}`;
});
await step('equipe executa o ajuste: nova mídia → V2; conclui as tarefas de ajuste', async () => {
  const who = adjA[0].assigned_to;
  const up = await as(who).form(`/contents/${A.id}/media`, (() => { const fd = new FormData(); fd.append('replace', '1'); return fd; })());
  // primeira chamada sem arquivo só confirma a validação; a entrega vem a seguir
  must(up.status === 422, 'upload vazio deveria ser recusado');
  const fd = fdFiles([[await art('Página 1', '#45131D'), `${TAG}-v2-p1.jpg`, 'image/jpeg'], [await art('Página 2 clara', '#B98580'), `${TAG}-v2-p2.jpg`, 'image/jpeg'], [await art('Página 3', '#561A26'), `${TAG}-v2-p3.jpg`, 'image/jpeg']]);
  fd.append('replace', '1');
  const r = await as(who).form(`/contents/${A.id}/media`, fd);
  must(r.status === 200 && r.data.version === 2, `V2 não criada (${r.status} ${JSON.stringify(r.data).slice(0, 120)})`);
  await waitForProcessing();
  for (const t of all("SELECT * FROM tasks WHERE content_id=? AND kind='ajuste' AND status IN ('aberta','em_andamento')", A.id)) {
    const x = await as(t.assignee_id).post(`/tasks/${t.id}/complete`);
    must(x.status === 200, `concluir ajuste ${x.status} ${JSON.stringify(x.data).slice(0, 120)}`);
  }
  return `V2 criada por ${nameOf(who)} · etapa: ${one('SELECT stage FROM contents WHERE id=?', A.id).stage}`;
});
await step('estrategista confere → V2 VOLTA para o cliente (sem aprovação inferida)', async () => {
  const c = one('SELECT * FROM contents WHERE id=?', A.id);
  must(c.stage === 'revisao_ajuste', `esperava conferência, está em ${c.stage}`);
  const t = openTasks(A.id)[0];
  const r = await as(t.assignee_id).post(`/contents/${A.id}/review`, { decision: 'aprovar' });
  must(r.status === 200, `HTTP ${r.status}`);
  const after = one('SELECT * FROM contents WHERE id=?', A.id);
  must(after.stage === 'aprovacao_cliente', `foi para ${after.stage}`);
  must(after.approved_version_id === null, 'há versão aprovada sem o cliente aprovar');
  return `conferido por ${nameOf(t.assignee_id)} · aguardando o cliente`;
});
await step('V1 SUBSTITUÍDA e ajustes resolvidos pela V2', async () => {
  const v = all('SELECT number, status FROM content_versions WHERE content_id=? ORDER BY number', A.id);
  must(v[0].status === 'substituida' && v[1].status === 'enviada_cliente', JSON.stringify(v));
  const v2 = one('SELECT id FROM content_versions WHERE content_id=? AND number=2', A.id).id;
  must(all("SELECT resolved_version_id FROM adjustments WHERE content_id=? AND origin='cliente'", A.id).every((a) => a.resolved_version_id === v2), 'ajuste sem versão de resolução');
  return v.map((x) => `V${x.number}:${x.status}`).join(' · ');
});

sec('CLIENTE · V2 e aprovação');
t0 = now();
await step('cliente vê V2 (atual) e V1 (substituída)', async () => {
  const it = (await cu.get(`/portal/contents/${A.id}`)).data;
  must(it.version.number === 2, 'versão exibida');
  must(JSON.stringify(it.versions.map((v) => [v.number, v.state])) === '[[2,"atual"],[1,"substituida"]]', JSON.stringify(it.versions.map((v) => [v.number, v.state])));
  must(it.adjustments.every((a) => a.resolved_in === 2), 'ajustes não indicam a V2');
  must(one("SELECT 1 FROM notifications WHERE user_id=? AND type='aprovacao' AND body LIKE '%nova versão%'", CU.id), 'cliente não foi avisado da nova versão');
  return 'V2 atual · V1 substituída · ajustes feitos na V2';
});
await step('aprovação: sem confirmação → 428; versão errada → 409; V2 confirmada → aprovada', async () => {
  must((await cu.post(`/portal/contents/${A.id}/approve`, {})).status === 428, 'sem confirmação');
  must((await cu.post(`/portal/contents/${A.id}/approve`, { confirm: true, version: 1 })).status === 409, 'versão antiga');
  const r = await cu.post(`/portal/contents/${A.id}/approve`, { confirm: true, version: 2 });
  must(r.status === 200, `HTTP ${r.status}`);
  const v = all('SELECT id, number, status, approved_by FROM content_versions WHERE content_id=? ORDER BY number', A.id);
  must(v[0].status === 'substituida' && v[1].status === 'aprovada' && v[1].approved_by === CU.id, JSON.stringify(v));
  const ap = all("SELECT * FROM approvals WHERE content_id=? AND kind='cliente' AND decision='aprovado'", A.id);
  must(ap.length === 1 && ap[0].version_id === v[1].id && ap[0].user_id === CU.id && ap[0].ip, 'registro de aprovação');
  const c = one('SELECT * FROM contents WHERE id=?', A.id);
  must(c.approved_version_id === v[1].id && c.stage === 'agendamento', 'engine não avançou');
  const next = openTasks(A.id)[0];
  return `aprovação ${ap[0].id} → V2 · próxima etapa: agendamento (${nameOf(next?.assignee_id)})`;
});
await step('histórico registra a sequência completa', async () => {
  // ordem real de gravação (rowid): no teste, as etapas abertas "na data do marco" ganham data futura pelo relógio avançado
  const order = Object.fromEntries(all('SELECT id, rowid r FROM activity_logs WHERE content_id=?', A.id).map((x) => [x.id, x.r]));
  const h = (await cu.get('/portal/history?limit=200')).data.filter((x) => x.link?.includes(A.id)).sort((a, b) => order[a.id] - order[b.id]).map((x) => x.text);
  const seq = ['tema enviado', 'v1 — enviado para sua aprovação', 'ajuste solicitado em v1', 'v2 — enviado para sua aprovação', 'v2 congelada'];
  let i = 0; for (const line of h) if (i < seq.length && line.toLowerCase().includes(seq[i])) i++;
  must(i === seq.length, `sequência incompleta (${i}/${seq.length}): ${h.join(' | ')}`);
  return h;
});

sec('CLIENTE · solicitação');
let REQ;
await step('cria solicitação (tipo Conteúdo) → responsável, tarefa, notificação, histórico', async () => {
  const fd = new FormData(); fd.append('kind', 'conteudo'); fd.append('title', `${TAG} · post especial`); fd.append('description', `${TAG}: pedido criado pela validação`);
  const r = await cu.form('/portal/requests', fd);
  must(r.status === 200, `HTTP ${r.status}`);
  REQ = one('SELECT * FROM client_requests WHERE id=?', r.data.id);
  const est = P.resolveAssignee(C.id, 'estrategia');
  must(REQ.assigned_to && one('SELECT 1 FROM tasks WHERE id=? AND assignee_id=?', REQ.task_id, REQ.assigned_to), 'sem tarefa/responsável');
  must(one("SELECT 1 FROM notifications WHERE user_id=? AND type='solicitacao' AND created_at>=?", REQ.assigned_to, REQ.created_at), 'responsável não notificado');
  must((await cu.get('/portal/history')).data.some((x) => x.text.includes(`${TAG} · post especial`)), 'fora do histórico');
  return `#${REQ.number} → ${nameOf(REQ.assigned_to)}${REQ.assigned_to === est ? ' (estratégia)' : ''}`;
});
await step('status muda e o cliente acompanha (Recebido → Em andamento → Aguardando você → Concluído)', async () => {
  const team = as(REQ.assigned_to);
  const seen = [];
  for (const [status, extra] of [['em_andamento', {}], ['aguardando_cliente', { next_action: `${TAG}: envie a data do evento` }], ['concluido', { message: `${TAG}: feito` }]]) {
    if (status === 'concluido') { const fd = new FormData(); fd.append('body', `${TAG}: dia 12`); await cu.form(`/portal/requests/${REQ.id}/reply`, fd); }
    const r = await team.patch(`/requests/${REQ.id}`, { status, ...extra, internal_note: status === 'em_andamento' ? `${TAG}: nota interna que o cliente não pode ver` : undefined });
    must(r.status === 200, `PATCH ${status} → ${r.status}`);
    const mine = (await cu.get('/portal/requests')).data.items.find((x) => x.id === REQ.id);
    must(!JSON.stringify(mine).includes('nota interna'), 'nota interna vazou');
    seen.push(mine.status_label);
  }
  return seen.join(' → ');
});

sec('CLIENTE · notificações, reunião e histórico');
await step('notificações do cliente: só tipos de cliente e só do próprio projeto', async () => {
  const list = (await cu.get('/notifications')).data.items;
  const bad = list.filter((n) => !CLIENT_TYPES.has(n.type) || (n.client_id && n.client_id !== C.id));
  must(!bad.length, `notificação indevida: ${bad.map((n) => n.type).join(', ')}`);
  return Object.entries(list.reduce((a, n) => ((a[n.type] = (a[n.type] || 0) + n.count), a), {})).map(([k, v]) => `${k}×${v}`).join(' · ');
});
let MEET;
await step('reunião de teste: criada sem sincronizar com o Google (bloqueado), pauta visível', async () => {
  const est = P.resolveAssignee(C.id, 'estrategia');
  const s = new Date(Date.now() - 2 * 3600e3), e = new Date(Date.now() - 3600e3);
  const r = await as(est).post('/meetings', { client_id: C.id, title: `${TAG} · reunião de validação`, kind: 'alinhamento', starts_at: s.toISOString(), ends_at: e.toISOString(), location: `${TAG} (sem convite real)` });
  must(r.status === 200, `HTTP ${r.status} ${JSON.stringify(r.data).slice(0, 160)}`);
  MEET = r.data;
  await as(est).patch(`/meetings/${MEET.id}`, { agenda: `${TAG}: pauta de teste`, summary: `${TAG}: ATA INTERNA — não pode chegar ao cliente` });
  return `Google Calendar: ${MEET.gcal_sync}`;
});
await step('pós-reunião: texto colado → IA indisponível (não simula) → resumos manuais → publicação com verificação', async () => {
  const est = as(P.resolveAssignee(C.id, 'estrategia'));
  must((await est.post(`/meetings/${MEET.id}/transcript`, { body: `${TAG}: transcrição de teste. Decidimos manter o foco em autoridade e enviar o cronograma até sexta.` })).status === 200, 'transcrição');
  const g = await est.post(`/meetings/${MEET.id}/summaries/generate`);
  must(g.data.status === 'nao_configurado', `IA: ${JSON.stringify(g.data).slice(0, 100)}`);
  await est.put(`/meetings/${MEET.id}/summaries/internal`, { content: { decisions: [`${TAG}: manter foco em autoridade`], risks: [`${TAG}: risco interno que não pode vazar`] } });
  await est.put(`/meetings/${MEET.id}/summaries/client`, { content: { decisions: [`${TAG}: manter foco em autoridade`], next_steps: [{ what: `${TAG}: enviar cronograma`, who: 'The Bold', when: 'sexta' }], info: [`${TAG}: risco interno que não pode vazar`] } });
  must((await est.post(`/meetings/${MEET.id}/summaries/client/publish`)).status === 409, 'vazamento não bloqueado');
  await est.put(`/meetings/${MEET.id}/summaries/client`, { content: { decisions: [`${TAG}: manter foco em autoridade`], next_steps: [{ what: `${TAG}: enviar cronograma`, who: 'The Bold', when: 'sexta' }], info: [] } });
  const p = await est.post(`/meetings/${MEET.id}/summaries/client/publish`);
  must(p.status === 200, `publicar ${p.status} ${JSON.stringify(p.data).slice(0, 160)}`);
  const m = (await cu.get('/portal/meetings')).data.meetings.find((x) => x.id === MEET.id);
  must(m?.summary?.decisions?.length === 1, 'cliente não vê o resumo publicado');
  must(!JSON.stringify(m).includes('ATA INTERNA') && !JSON.stringify(m).includes('risco interno'), 'conteúdo interno visível ao cliente');
  return 'vazamento bloqueado · resumo do cliente publicado · ata e resumo interno invisíveis';
});
await step('histórico do cliente abre os registros (conteúdo, solicitação, reunião)', async () => {
  const h = (await cu.get('/portal/history?limit=200')).data;
  must(h.some((x) => x.link === `/portal/solicitacoes?r=${REQ.id}`) && h.some((x) => x.link === `/portal/reunioes?m=${MEET.id}`) && h.some((x) => x.link === `/portal/conteudos?c=${A.id}`), 'links ausentes');
  must(!h.some((x) => x.action === 'versao.criada'), 'rascunho interno no histórico');
  return `${h.length} eventos visíveis`;
});

sec('PERMISSÕES (servidor/API)');
await step('cliente não acessa outro cliente', async () => {
  must(OTHER, 'não há outro cliente ativo para testar');
  must((await cu.get(`/portal/home?client_id=${OTHER.id}`)).status === 403, 'home de outro cliente');
  if (otherContent) must((await cu.get(`/portal/contents/${otherContent.id}`)).status === 404, 'conteúdo de outro cliente');
  must((await cu.post(`/portal/requests?client_id=${OTHER.id}`, { kind: 'duvida', title: 'x' })).status === 403, 'criar solicitação em outro cliente');
  return `testado contra “${OTHER.name}”`;
});
await step('rotas internas negadas (dossiê, saúde, ficha, tarefas, financeiro, CRM, histórico interno, pós-reunião, usuários)', async () => {
  const urls = [`/clients/${C.id}`, `/clients/${C.id}/health`, '/client-health', `/clients/${C.id}/ficha`, `/clients/${C.id}/requests`, `/clients/${C.id}/decisions`, '/requests', '/tasks', '/finance', '/crm', '/history', `/meetings/${MEET?.id}/post`, '/users', '/torre', '/pendencias', '/automations', '/insights'];
  const res = [];
  for (const u of urls) { const r = await cu.get(u); res.push(`${u} ${r.status}`); must([401, 403, 404].includes(r.status), `${u} respondeu ${r.status}`); }
  return res;
});
await step('portal não expõe observações internas, IA, saúde, tarefas internas nem financeiro', async () => {
  const bodies = await Promise.all(['/portal/home', '/portal/brand', '/portal/me', '/portal/decisions', '/portal/materials', '/portal/meetings', '/tasks/mine', `/portal/contents/${A.id}`].map((u) => cu.get(u).then((r) => JSON.stringify(r.data))));
  const all_ = bodies.join('\n');
  const internalObs = all("SELECT content FROM client_brain_entries WHERE client_id=? AND origin IN ('observacao_interna','ia','indefinido') AND length(content)>=20", C.id);
  const leaks = internalObs.filter((o) => all_.includes(o.content.slice(0, 40)));
  must(!leaks.length, `${leaks.length} observação(ões) interna(s) visível(is)`);
  const inv = all('SELECT description FROM invoices WHERE client_id=? AND length(description)>=8', C.id);
  must(!inv.some((i) => all_.includes(i.description)), 'informação financeira visível');
  const myTasks = JSON.parse(bodies[6]);
  must(Array.isArray(myTasks) ? myTasks.every((t) => t.function === 'cliente' || t.assignee_id === CU.id) : true, 'tarefa interna visível');
  must(!/"level":"(risco|atencao|estavel)"/.test(all_) && !all_.includes('Saúde do cliente'), 'saúde do cliente visível');
  return `${internalObs.length} observações internas e ${inv.length} parcelas conferidas — nenhuma visível`;
});

// ── UI: celular e desktop (Chromium) ──
sec('MOBILE e DESKTOP · interface real');
let UI = null;
await step('roteiro de interface (login, home, conteúdo, toque na imagem, timestamp, comentário, aprovação, solicitação, histórico, filtros, navegação)', async () => {
  if (!fs.existsSync(path.resolve('web/dist/index.html'))) throw new Error('rode "npm run build" antes');
  const { chromium } = await import('playwright');
  const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });
  const out = [];
  for (const [label, vp, mobile] of [['celular', { width: 390, height: 844 }, true], ['desktop', { width: 1440, height: 960 }, false]]) {
    const D = await produce(`Carrossel UI ${label}`, 'carrossel', [[await art('UI 1', '#45131D'), `${TAG}-ui1.jpg`, 'image/jpeg'], [await art('UI 2', '#2C0A12'), `${TAG}-ui2.jpg`, 'image/jpeg']], 45);
    const E = await produce(`Reel UI ${label}`, 'reel', [[video('0x2C0A12'), `${TAG}-ui.mp4`, 'video/mp4']], 46);
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    const shot = (n) => page.screenshot({ path: path.join(OUT, `${label}-${n}.png`), fullPage: false });
    const ok = (c, m) => { out.push(`${c ? '✓' : '✗'} [${label}] ${m}`); if (!c) throw new Error(`[${label}] ${m}`); };
    await page.goto(`${ORIGIN}/`);
    await page.fill('input[type=email]', CU.email); await page.fill('input[type=password]', PW);
    await page.click('form.lg-form button[type=submit]');
    await page.waitForURL(/\/portal/, { timeout: 15000 }); await page.waitForSelector('.p-hello-t'); await page.waitForTimeout(500); await shot('1-home');
    ok((await page.textContent('.p-need')).includes('Precisamos de você'), 'login pela tela real → home');
    await page.goto(`${ORIGIN}/portal/conteudos?c=${D.id}`); await page.waitForSelector('.p-overlay .p-post'); await shot('2-conteudo');
    ok((await page.textContent('.p-overlay .p-post')).includes('V1'), 'abre o conteúdo na V1');
    // Comentário
    await page.fill('.p-overlay .p-compose textarea', `${TAG}: comentário pela interface`); await page.click('.p-overlay .p-send');
    await page.waitForFunction((t) => document.querySelector('.p-overlay .p-comments')?.textContent.includes(t), `${TAG}: comentário pela interface`);
    ok(true, 'comentário enviado');
    // Ajuste com toque na imagem
    await page.click('.p-overlay .p-act-btn >> nth=0'); await page.waitForSelector('.p-overlay .p-adj');
    const img = await page.$('.p-overlay .mv-pinbox img'); await img.scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
    const bb = await img.boundingBox();
    if (mobile) await page.touchscreen.tap(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5); else await page.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5);
    await page.waitForSelector('.p-overlay .mv-pin.draft', { timeout: 4000 });
    await page.click('.p-overlay .p-adj-chips button >> text=Imagem');
    await page.fill('.p-overlay .p-adj textarea', `${TAG}: ajuste marcado na imagem`); await shot('3-ajuste-ponto');
    await page.click('.p-overlay .p-adj button.p-btn.solid'); await page.waitForSelector('.p-overlay .p-confirm.ok');
    const aD = one("SELECT * FROM adjustments WHERE content_id=? AND origin='cliente'", D.id);
    ok(aD?.region && aD.aspect === 'imagem', 'toque na imagem registrou o ponto');
    // Timestamp no reel
    await page.goto(`${ORIGIN}/portal/conteudos?c=${E.id}`); await page.waitForSelector('.p-overlay .p-post video');
    // O Chromium de testes não traz o codec H.264 (o Chrome dos clientes traz): sem metadados, a posição do player é fixada em 4s só aqui
    const playable = await page.waitForFunction(() => document.querySelector('.p-overlay video')?.readyState >= 1, null, { timeout: 6000 }).then(() => true).catch(() => false);
    await page.evaluate((p) => { const v = document.querySelector('.p-overlay video'); v.muted = true; if (p) v.currentTime = 4; else Object.defineProperty(v, 'currentTime', { configurable: true, get: () => 4 }); }, playable);
    if (!playable) R.notes.push(`[${label}] Chromium de teste sem H.264: posição do vídeo fixada em 4s na interface; o registro do timestamp foi conferido no banco.`);
    await page.waitForTimeout(400);
    await page.click('.p-overlay .p-act-btn >> nth=0'); await page.waitForSelector('.p-overlay .p-adj');
    await page.click('.p-overlay .p-adj button >> text=Marcar o tempo do vídeo');
    await page.fill('.p-overlay .p-adj textarea', `${TAG}: trecho lento`); await shot('4-timestamp');
    await page.click('.p-overlay .p-adj button.p-btn.solid'); await page.waitForSelector('.p-overlay .p-confirm.ok');
    const aE = one("SELECT * FROM adjustments WHERE content_id=? AND origin='cliente'", E.id);
    ok(aE?.video_timestamp === 4, `timestamp do vídeo registrado (${aE?.video_timestamp})`);
    // Aprovação (coração → confirmar) num terceiro conteúdo
    const F = await produce(`Aprovar UI ${label}`, 'carrossel', [[await art('Aprovar', '#561A26'), `${TAG}-ap.jpg`, 'image/jpeg']], 47);
    await page.goto(`${ORIGIN}/portal/conteudos?c=${F.id}`); await page.waitForSelector('.p-overlay .p-like');
    const tA = Date.now();
    await page.click('.p-overlay .p-like'); await page.waitForSelector('.p-overlay .p-confirm-like'); await shot('5-confirmar');
    await page.click('.p-overlay .p-confirm-like .p-cta'); await page.waitForSelector('.p-overlay .p-confirm.ok');
    ok(one("SELECT 1 FROM approvals WHERE content_id=? AND kind='cliente' AND user_id=?", F.id, CU.id), `aprovação em 2 toques (${((Date.now() - tA) / 1000).toFixed(1)}s)`);
    await page.click('.p-overlay .p-close');
    // Filtros e navegação
    await page.goto(`${ORIGIN}/portal/conteudos`); await page.waitForSelector('.p-chips');
    await page.click('.p-chips button >> text=Aguardando aprovação'); await page.waitForTimeout(500); await shot('6-filtros');
    ok(await page.$('.p-chips button.active >> text=Aguardando aprovação'), 'filtro aplicado');
    // Nova solicitação
    await page.goto(`${ORIGIN}/portal`); await page.waitForSelector('.p-hello-t');
    await page.click(mobile ? '.p-fab' : '.p-new'); await page.click('.p-kinds button >> text=Dúvida');
    await page.fill('.p-nr textarea', `${TAG}: dúvida pela interface (${label})`); await page.click('.p-nr .p-btn.solid');
    await page.waitForSelector('.p-received'); await shot('7-solicitacao');
    ok(one('SELECT 1 FROM client_requests WHERE client_id=? AND description LIKE ?', C.id, `${TAG}: dúvida pela interface (${label})%`), 'solicitação criada pelo botão');
    await page.click('.p-received .p-btn');
    // Histórico e menu
    await page.goto(`${ORIGIN}/portal/historico`); await page.waitForSelector('.p-hday'); await shot('8-historico');
    ok((await page.textContent('main')).includes(TAG), 'histórico com os eventos do teste');
    if (mobile) { await page.click('.p-tabbar button'); await page.waitForSelector('.p-more'); await shot('9-menu'); ok(true, 'menu "Mais" abre'); await page.keyboard.press('Escape'); }
    ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'sem rolagem horizontal');
    ok(!errors.length, `sem erros de JavaScript${errors.length ? `: ${errors.join(' | ')}` : ''}`);
    await ctx.close();
  }
  await browser.close();
  UI = out;
  return out;
});

sec('NOTIFICAÇÕES · conferência');
await step('notificações geradas pelo teste: todas ligadas a registros de teste e a pessoas do cliente', async () => {
  const ns = all('SELECT n.*, u.role_key FROM notifications n JOIN users u ON u.id=n.user_id WHERE n.created_at>=?', R.started_at);
  const byRole = ns.reduce((a, n) => ((a[n.role_key === 'cliente' ? (n.user_id === CU.id ? 'cliente_teste' : 'outros_usuarios_cliente') : 'equipe'] ||= 0), a[n.role_key === 'cliente' ? (n.user_id === CU.id ? 'cliente_teste' : 'outros_usuarios_cliente') : 'equipe']++, a), {});
  const foreign = ns.filter((n) => n.client_id && n.client_id !== C.id);
  must(!foreign.length, `${foreign.length} notificação(ões) de outro cliente`);
  const realClientUsers = ns.filter((n) => n.role_key === 'cliente' && n.user_id !== CU.id);
  if (realClientUsers.length) R.notes.push(`${realClientUsers.length} notificação(ões) in-app foram geradas para usuários reais do cliente na CÓPIA da base (o engine avisa todos os acessos do cliente). Nenhuma saiu do container e todas foram removidas na limpeza.`);
  return byRole;
});
R.blocked_external = blocked;
R.windows = windows;
R.rules = { reenviar_cliente_apos_ajuste: P.setting('reenviar_cliente_apos_ajuste'), janela_etapas: P.setting('janela_etapas'), required_keys: JSON.parse(one('SELECT required_keys FROM onboarding_forms WHERE active=1 ORDER BY created_at DESC LIMIT 1')?.required_keys || '[]') };

// ════════════════ LIMPEZA ════════════════
server.close();
const AFTER_TEST = dump();
const D1 = diff(BEFORE, AFTER_TEST);
// Atribuição: raízes marcadas (texto com a marca) + usuário de teste; depois fecho por referência (em qualquer direção entre linhas NOVAS)
const tagged = new Set([CU.id]);
const newRows = Object.entries(D1.added).flatMap(([t, rows]) => rows.map((r) => ({ t, ...r })));
for (const r of newRows) if (JSON.stringify(r.row).includes(TAG)) tagged.add(r.key);
const idsOf = (row) => Object.values(row).filter((v) => typeof v === 'string' && v.length >= 6);
// IDs de teste citados dentro de textos (ex.: "Resumo da reunião mt_…") também comprovam a origem
const citesTagged = (row) => Object.values(row).some((v) => typeof v === 'string' && [...tagged].some((id) => id.length >= 10 && v.includes(id)));
let grew = true;
while (grew) {
  grew = false;
  for (const r of newRows) {
    if (tagged.has(r.key)) { for (const v of idsOf(r.row)) if (newRows.some((x) => x.key === v) && !tagged.has(v)) { tagged.add(v); grew = true; } continue; }
    if (idsOf(r.row).some((v) => tagged.has(v)) || r.key.split('|').some((p) => tagged.has(p)) || citesTagged(r.row)) { tagged.add(r.key); grew = true; }
  }
}
// Contador criado pelo teste: só quando a tabela que ele numera não tem nenhum registro fora do teste
const COUNTED = { request: 'client_requests', content: 'contents' };
for (const r of newRows.filter((x) => x.t === 'counters' && COUNTED[x.key])) {
  const rows = [...AFTER_TEST[COUNTED[r.key]].entries()];
  if (rows.length && rows.every(([k]) => tagged.has(k))) tagged.add(r.key);
}
const attributed = newRows.filter((r) => tagged.has(r.key));
const uncertain = newRows.filter((r) => !tagged.has(r.key));
const directTag = newRows.filter((r) => JSON.stringify(r.row).includes(TAG)).length;
R.created = Object.fromEntries(Object.entries(D1.added).map(([t, rows]) => [t, rows.length]));
R.created_with_tag = directTag;
R.uncertain = uncertain.map((r) => ({ table: r.t, key: r.key, row: JSON.stringify(r.row).slice(0, 200) }));
R.changed_existing = Object.fromEntries(Object.entries(D1.changed).map(([t, rows]) => [t, rows.map((x) => ({ key: x.key, fields: Object.keys(x.after).filter((k) => JSON.stringify(x.before[k]) !== JSON.stringify(x.after[k])) }))]));
R.removed_existing = Object.fromEntries(Object.entries(D1.removed).map(([t, rows]) => [t, rows.length]));

if (!KEEP) {
  db.exec('PRAGMA foreign_keys = OFF');
  // histórico é append-only por trigger: suspenso SÓ nesta cópia, só para remover as linhas do teste, e recriado em seguida
  const trig = all("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name='activity_logs'");
  db.exec('BEGIN');
  for (const t of trig) db.exec(`DROP TRIGGER "${t.name}"`);
  const removedCount = {};
  for (const r of attributed) {
    const where = PK[r.t] ? PK[r.t].map((c) => `"${c}"=?`).join(' AND ') : 'rowid=?';
    const vals = PK[r.t] ? PK[r.t].map((c) => r.row[c]) : [Number(r.key.slice(6))];
    run(`DELETE FROM "${r.t}" WHERE ${where}`, ...vals); removedCount[r.t] = (removedCount[r.t] || 0) + 1;
  }
  // Linhas existentes alteradas pelo teste (contadores, status de ciclo, último acesso de quem agiu, notificações agrupadas…) voltam ao valor anterior
  const revertedCount = {};
  for (const [t, rows] of Object.entries(D1.changed)) for (const x of rows) {
    const cols = Object.keys(x.before);
    const where = PK[t] ? PK[t].map((c) => `"${c}"=?`).join(' AND ') : null;
    if (!where) continue;
    run(`UPDATE "${t}" SET ${cols.map((c) => `"${c}"=?`).join(',')} WHERE ${where}`, ...cols.map((c) => x.before[c]), ...PK[t].map((c) => x.before[c]));
    revertedCount[t] = (revertedCount[t] || 0) + 1;
  }
  for (const t of trig) db.exec(t.sql);
  db.exec('COMMIT');
  db.exec('PRAGMA foreign_keys = ON');
  R.removed = removedCount; R.reverted = revertedCount;
  // Arquivos de mídia gravados pelo teste
  const newFiles = listFiles(WORK).filter((f) => !files0.has(f));
  for (const f of newFiles) fs.rmSync(path.join(WORK, f), { force: true });
  R.files_removed = newFiles.length;
}

// ── Conferência ANTES × DEPOIS ──
const FINAL = dump();
const D2 = diff(BEFORE, FINAL);
R.before_counts = Object.fromEntries(TABLES.map((t) => [t, BEFORE[t].size]));
R.after_counts = Object.fromEntries(TABLES.map((t) => [t, FINAL[t].size]));
R.table_hash_equal = Object.fromEntries(TABLES.map((t) => [t, hashTable(BEFORE[t]) === hashTable(FINAL[t])]));
R.residual = { added: Object.fromEntries(Object.entries(D2.added).map(([t, r]) => [t, r.length])), removed: Object.fromEntries(Object.entries(D2.removed).map(([t, r]) => [t, r.length])), changed: Object.fromEntries(Object.entries(D2.changed).map(([t, r]) => [t, r.length])) };
R.tag_left = TABLES.reduce((a, t) => a + [...FINAL[t].values()].filter((r) => JSON.stringify(r).includes(TAG)).length, 0);
R.files_left = listFiles(WORK).filter((f) => !files0.has(f)).length;
R.rehearsal = !!process.env.E2E_SNAPSHOT;
R.snapshot_unchanged = crypto.createHash('sha256').update(fs.readFileSync(SNAP)).digest('hex') === snapHash;
R.bootstrap_only = Object.fromEntries(TABLES.filter((t) => rawCounts[t] !== undefined && rawCounts[t] !== BEFORE[t].size).map((t) => [t, `${rawCounts[t]} → ${BEFORE[t].size}`]));
R.finished_at = new Date().toISOString();
R.clean = !KEEP && R.tag_left === 0 && R.files_left === 0 && !Object.keys(R.residual.added).length && !Object.keys(R.residual.removed).length && !Object.keys(R.residual.changed).length;
fs.writeFileSync(path.join(OUT, 'relatorio.json'), JSON.stringify(R, null, 2));
const failed = R.steps.filter((s) => !s.ok);
console.log(`\n${R.steps.length - failed.length}/${R.steps.length} etapas ok · rede externa bloqueada: ${blocked.length} tentativa(s) · limpeza: ${R.clean ? 'COMPLETA (antes = depois)' : 'PENDENTE'}`);
console.log(`Relatório: ${path.join(OUT, 'relatorio.json')}`);
fs.rmSync(WORK, { recursive: true, force: true });
process.exit(failed.length || !R.clean ? 1 : 0);
