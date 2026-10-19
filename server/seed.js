// Dados de DEMONSTRAÇÃO. Equipe = nomes reais (primeiro nome) com e-mails fictícios @thebold.demo.
// Clientes, valores, legendas e briefings são FICTÍCIOS e marcados [DEMO]. Substituir na migração real.
// O histórico é gerado passando pelo Process Engine com um relógio simulado — nada é inserido "por fora" do fluxo.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const STORAGE = path.resolve(process.env.BOLD_STORAGE_DIR || 'storage');
for (const f of ['bold.db', 'bold.db-wal', 'bold.db-shm']) fs.rmSync(path.join(STORAGE, f), { force: true });
for (const d of ['originals', 'derived', 'tmp']) fs.rmSync(path.join(STORAGE, d), { recursive: true, force: true });

const { one, all, insert, update, run, uid, now, setClock } = await import('./db.js');
const { bootstrap } = await import('./index.js');
const { hashPassword } = await import('./lib/auth.js');
const P = await import('./engine/process.js');
const { startClient, addComment } = await import('./routes/ops.js');
const { ingest, waitForProcessing, TMP_DIR } = await import('./services/media.js');
const { runDetectors } = await import('./engine/intelligence.js');
const { generateReport } = await import('./services/reports.js');
const sharp = (await import('sharp')).default;

bootstrap();
const PASSWORD = process.env.BOLD_DEMO_PASSWORD || 'thebold2026';
const pw = hashPassword(PASSWORD);
const at = (iso) => setClock(iso.length <= 10 ? `${iso}T10:00:00-03:00` : iso);
const step = (d, h = 10) => at(`${d}T${String(h).padStart(2, '0')}:${String(Math.floor(Math.random() * 50)).padStart(2, '0')}:00-03:00`);

// ─────────── EQUIPE ───────────
at('2026-08-01');
const TEAM = [
  ['rebeca', 'Rebeca', 'ceo', 'CEO · Direção e estratégia', ['revisao'], 10],
  ['vitoria', 'Vitória', 'operacoes', 'Processos, IA e automações', [], 14],
  ['vivian', 'Vivian', 'gestao', 'Gestão de processos · Atendimento · Agendamento', ['atendimento', 'agendamento'], 30],
  ['raisa', 'Raísa', 'qualidade', 'Controle de qualidade · MKT jurídico', ['revisao'], 30],
  ['juliane', 'Juliane', 'estrategia', 'Estrategista', ['estrategia', 'copy'], 22],
  ['monique', 'Monique', 'estrategia', 'Estrategista · Designer', ['estrategia', 'copy', 'design'], 22],
  ['felipe', 'Felipe', 'design', 'Designer', ['design'], 18],
  ['nicole', 'Nicole', 'edicao', 'Editora de vídeo · Designer', ['edicao', 'design'], 16],
  ['leo', 'Léo', 'edicao', 'Editor de vídeo', ['edicao'], 16],
  ['matheus', 'Matheus', 'comercial', 'Comercial · Financeiro · Contratos', [], 12],
];
const U = {};
for (const [key, name, role, title, fns, cap] of TEAM) {
  U[key] = insert('users', { id: uid('u_'), name, email: `${key}@thebold.demo`, password_hash: pw, role_key: role, title, functions: JSON.stringify(fns), capacity: cap, active: 1, avatar_color: '#4A1725', created_at: now() });
}

// ─────────── CLIENTES (fictícios) ───────────
const CLIENTS = [
  { key: 'helena', name: 'Dra. Helena Prado [DEMO]', handle: '@drahelenaprado.demo', segment: 'Dermatologia', services: ['Estratégia editorial', 'Design', 'Reels', 'Legendas', 'Agendamento'],
    team: [['juliane', 'estrategia'], ['juliane', 'copy'], ['felipe', 'design'], ['leo', 'edicao'], ['vivian', 'atendimento'], ['vivian', 'agendamento'], ['raisa', 'revisao']],
    brain: { posicionamento: 'Dermatologista que une ciência e naturalidade: resultados visíveis sem exageros. [DEMO]', publico: 'Mulheres de 30 a 55 anos, classes A/B, que buscam cuidado preventivo e procedimentos discretos.', tom: 'Acolhedor, técnico na medida certa, nunca alarmista. Evitar promessas de resultado.', linguagem: 'Frases curtas, termos médicos explicados em linguagem simples. Sem gírias.', oferta: 'Consultas de rotina, protocolos de rejuvenescimento, check-up de pele.', objetivos: 'Autoridade em skincare preventivo e agenda cheia para o 1º trimestre.', restricoes: 'CFM: não mostrar antes/depois, não citar preços, não usar “o melhor”.', preferencias: 'Gosta de capas claras, tipografia fina e fotos com luz natural.', referencias: '[PLACEHOLDER: perfis de referência enviados pela cliente]' } },
  { key: 'moretti', name: 'Moretti Advocacia [DEMO]', handle: '@morettiadv.demo', segment: 'Advocacia empresarial', services: ['Estratégia editorial', 'Design', 'Legendas', 'Agendamento', 'MKT jurídico'],
    team: [['monique', 'estrategia'], ['monique', 'copy'], ['felipe', 'design'], ['nicole', 'edicao'], ['vivian', 'atendimento'], ['vivian', 'agendamento'], ['raisa', 'revisao']],
    brain: { posicionamento: 'Escritório boutique que traduz o direito empresarial para decisões de negócio. [DEMO]', publico: 'Sócios e diretores de PMEs, 35–60 anos.', tom: 'Sóbrio, seguro, objetivo. Autoridade sem juridiquês.', restricoes: 'Provimento OAB 205/2021: sem captação, sem resultados de causas, sem preços.', preferencias: 'Paleta azul-marinho e areia; carrosséis educativos.', objetivos: 'Ser lembrado como referência em contratos societários.' } },
  { key: 'atelier', name: 'Atelier Lumière [DEMO]', handle: '@atelierlumiere.demo', segment: 'Moda autoral', services: ['Estratégia editorial', 'Design', 'Reels', 'Legendas'],
    team: [['juliane', 'estrategia'], ['juliane', 'copy'], ['nicole', 'design'], ['leo', 'edicao'], ['vivian', 'atendimento'], ['vivian', 'agendamento']],
    brain: { posicionamento: 'Moda autoral feita à mão, peças atemporais em pequenas tiragens. [DEMO]', publico: 'Mulheres 28–45 que valorizam processo e exclusividade.', tom: 'Poético, sensorial, elegante.', preferencias: 'Ama bastidores do ateliê; não gosta de fundo branco chapado.', restricoes: 'Não usar a palavra “barato” nem “promoção”.' } },
  { key: 'vertice', name: 'Clínica Vértice [DEMO]', handle: '@clinicavertice.demo', segment: 'Odontologia', services: ['Estratégia editorial', 'Design', 'Reels', 'Legendas', 'Agendamento'],
    team: [['monique', 'estrategia'], ['monique', 'copy'], ['felipe', 'design'], ['nicole', 'edicao'], ['vivian', 'atendimento'], ['vivian', 'agendamento'], ['raisa', 'revisao']],
    brain: { posicionamento: 'Odontologia estética com planejamento digital do sorriso. [DEMO]', publico: 'Adultos 25–50 que querem estética com segurança.', tom: 'Leve, didático, confiante.', restricoes: 'CFO: sem antes/depois sem autorização; sem preços.', preferencias: 'Reels curtos com a equipe; legendas com CTA para agendamento via direct.' } },
  { key: 'aurora', name: 'Casa Aurora Resort [DEMO]', handle: '@casaaurora.demo', segment: 'Hotelaria', services: ['Estratégia editorial', 'Design', 'Reels', 'Agendamento'],
    team: [['juliane', 'estrategia'], ['felipe', 'design'], ['leo', 'edicao'], ['vivian', 'atendimento'], ['vivian', 'agendamento']],
    brain: { posicionamento: 'Refúgio de natureza com gastronomia de origem. [DEMO]', publico: 'Casais 30–55 de capitais do Sudeste.', tom: 'Convidativo, calmo, sensorial.' } },
];
const C = {};
const clientUsers = {};
for (const def of CLIENTS) {
  at('2026-08-05');
  const team = def.team.map(([u, f]) => ({ user_id: U[u].id, function: f }));
  const c = startClient({ name: def.name, handle: def.handle, segment: def.segment, services: def.services, monthly_posts: 12, requires_theme_approval: true, team, is_demo: 1 }, U.rebeca);
  C[def.key] = c;
  const cu = insert('users', { id: uid('u_'), name: `${def.name.split(' [')[0].replace(/^Dra\. /, '').split(' ')[0]} (cliente)`, email: `${def.key}@cliente.demo`, password_hash: pw, role_key: 'cliente', title: 'Cliente', functions: '[]', capacity: 0, active: 1, avatar_color: '#000000', created_at: now() });
  insert('client_members', { client_id: c.id, user_id: cu.id, function: 'cliente' });
  clientUsers[def.key] = cu;
  for (const [s, body] of Object.entries(def.brain)) run('UPDATE client_brain SET body=?, updated_by=?, updated_at=? WHERE client_id=? AND section=?', body, U[def.team[0][0]].id, now(), c.id, s);
  at('2026-08-25');
  run("UPDATE onboarding_items SET status='recebido', received_at=? WHERE onboarding_id=(SELECT id FROM onboarding WHERE client_id=?)", now(), c.id);
  run("UPDATE onboarding SET status='concluido', completed_at=? WHERE client_id=?", now(), c.id);
  run("UPDATE clients SET status='ativo' WHERE id=?", c.id);
  run("UPDATE tasks SET status='concluida', completed_at=?, completed_by=assignee_id WHERE client_id=? AND kind='onboarding'", now(), c.id);
}
// Cliente em onboarding, sem designer vinculado (gera tarefa sem responsável → pendência crítica, como acontece hoje com a "DIVISÃO")
at('2026-10-06');
C.sena = startClient({ name: 'Instituto Sena [DEMO]', handle: '@institutosena.demo', segment: 'Consultoria em gestão', services: ['Estratégia editorial', 'Design', 'Legendas'], monthly_posts: 8, requires_theme_approval: true,
  team: [{ user_id: U.monique.id, function: 'estrategia' }, { user_id: U.vivian.id, function: 'atendimento' }], is_demo: 1 }, U.rebeca);
clientUsers.sena = insert('users', { id: uid('u_'), name: 'Paulo (cliente)', email: 'sena@cliente.demo', password_hash: pw, role_key: 'cliente', title: 'Cliente', functions: '[]', capacity: 0, active: 1, avatar_color: '#000000', created_at: now() });
insert('client_members', { client_id: C.sena.id, user_id: clientUsers.sena.id, function: 'cliente' });
at('2026-10-09');
for (const label of ['Briefing “Sua marca”: posicionamento', 'Briefing: público-alvo e persona', 'Contrato assinado (duração e plano)', 'Reunião de Diagnóstico de Marca']) {
  run("UPDATE onboarding_items SET status='recebido', received_at=?, value=? WHERE label=? AND onboarding_id=(SELECT id FROM onboarding WHERE client_id=?)", now(), label.startsWith('Briefing') ? '[DEMO] Resposta enviada pelo cliente no formulário.' : null, label, C.sena.id);
}
run("UPDATE client_brain SET body='Consultoria que organiza a gestão de empresas familiares. [DEMO]' WHERE client_id=? AND section='posicionamento'", C.sena.id);

// ─────────── MÍDIA DE DEMONSTRAÇÃO (gerada localmente; originais em alta resolução) ───────────
const SRC = path.join(STORAGE, 'demo-src');
fs.mkdirSync(SRC, { recursive: true });
const PALETTES = { helena: ['#EFE7E1', '#B98C7A', '#2B1A16'], moretti: ['#1D2A3A', '#C9B79C', '#F6F3F0'], atelier: ['#E9DED3', '#7A4A3A', '#1A1A1A'], vertice: ['#F3F6F6', '#2F6F73', '#0E1F21'], aurora: ['#DCE3D4', '#5C6B4A', '#1E2418'], sena: ['#F6F3F0', '#4A1725', '#000'] };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
async function makeImage(file, { w = 1080, h = 1350, title, label, pal }) {
  if (fs.existsSync(file)) return file;
  const [bg, accent, ink] = pal;
  const lines = title.match(/.{1,18}(\s|$)/g).map((l) => l.trim()).slice(0, 4);
  const k = w / 1080;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${accent}" stop-opacity="0.55"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${w * 0.78}" cy="${h * 0.22}" r="${w * 0.26}" fill="${accent}" opacity="0.35"/>
    <rect x="${64 * k}" y="${64 * k}" width="${w - 128 * k}" height="${h - 128 * k}" fill="none" stroke="${ink}" stroke-opacity="0.25" stroke-width="${2 * k}"/>
    ${lines.map((l, i) => `<text x="${96 * k}" y="${h * 0.56 + i * 104 * k}" font-family="DejaVu Serif" font-size="${92 * k}" fill="${ink}">${esc(l)}</text>`).join('')}
    <text x="${96 * k}" y="${h - 110 * k}" font-family="Inter" font-size="${28 * k}" letter-spacing="${4 * k}" fill="${ink}" opacity="0.7">${esc(label.toUpperCase())}</text>
    <text x="${w - 96 * k}" y="${h - 110 * k}" text-anchor="end" font-family="Inter" font-size="${28 * k}" fill="${ink}" opacity="0.7">[DEMO]</text></svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toFile(file);
  return file;
}
function makeVideo(file, { title, pal, seconds = 6 }) {
  if (fs.existsSync(file)) return file;
  const [bg, accent] = pal;
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf';
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `gradients=s=1080x1920:c0=${bg.replace('#', '0x')}:c1=${accent.replace('#', '0x')}:duration=${seconds}:speed=0.03:rate=30`,
    '-f', 'lavfi', '-i', `sine=frequency=196:duration=${seconds}`, '-vf', `drawtext=fontfile=${font}:text='${title.replace(/[':]/g, '')}':fontsize=84:fontcolor=white:x=(w-text_w)/2:y=h*0.62,drawtext=fontfile=${font}:text='[DEMO] REEL':fontsize=36:fontcolor=white@0.8:x=(w-text_w)/2:y=h*0.62+120`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', file]);
  return file;
}
let mediaSeq = 0;
async function demoMedia(clientKey, format, title, variant = '') {
  const pal = PALETTES[clientKey];
  const base = path.join(SRC, `${clientKey}-${format}-${title.replace(/\W+/g, '').slice(0, 24)}${variant}`);
  if (['reel', 'video'].includes(format)) return [makeVideo(`${base}.mp4`, { title: title.slice(0, 22) + (variant ? ' ' + variant : ''), pal })];
  if (format === 'carrossel') { const out = []; for (let i = 1; i <= 4; i++) out.push(await makeImage(`${base}-${i}.jpg`, { title: i === 1 ? title + (variant ? ` ${variant}` : '') : ['O que pouca gente sabe', 'Na prática', 'Para levar com você'][i - 2], label: `Carrossel ${i}/4`, pal })); return out; }
  if (format === 'foto') return [await makeImage(`${base}.jpg`, { w: 4000, h: 5000, title: title + (variant ? ` ${variant}` : ''), label: 'Foto 4000×5000 · original', pal })];
  return [await makeImage(`${base}.jpg`, { title: title + (variant ? ` ${variant}` : ''), label: 'Post estático', pal })];
}
async function attachMedia(content, user, files, { replace = true } = {}) {
  const ing = [];
  for (const src of files) { const tmp = path.join(TMP_DIR, `seed-${++mediaSeq}${path.extname(src)}`); fs.copyFileSync(src, tmp); ing.push(await ingest(tmp, { originalName: path.basename(src), mime: src.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg', clientId: content.client_id, userId: user.id })); }
  const c = one('SELECT * FROM contents WHERE id=?', content.id);
  const v = P.editableVersion(c, user.id);
  if (replace) run('DELETE FROM version_media WHERE version_id=?', v.id);
  ing.forEach((f, i) => insert('version_media', { version_id: v.id, file_id: f.id, position: i }));
  return v;
}

// ─────────── HELPERS DO FLUXO (sempre via engine) ───────────
const userById = (id) => one('SELECT * FROM users WHERE id=?', id);
const fresh = (c) => one('SELECT * FROM contents WHERE id=?', c.id);
const openTask = (c, filter = () => true) => all("SELECT * FROM tasks WHERE content_id=? AND status IN ('aberta','em_andamento') AND kind IN ('etapa','ajuste')", c.id).filter(filter);
const req = (user) => ({ ip: '127.0.0.1', headers: { 'user-agent': 'seed' } });
function completeCronograma(c) { for (const t of openTask(c)) P.completeTask(t.id, userById(t.assignee_id)); }
async function produce(c, clientKey, captionText) {
  c = fresh(c);
  for (const t of openTask(c, (t) => t.description === 'trilha:visual')) { const u = userById(t.assignee_id); await attachMedia(c, u, await demoMedia(clientKey, c.format, c.title)); P.completeTask(t.id, u); }
  for (const t of openTask(c, (t) => t.description === 'trilha:legenda')) { const u = userById(t.assignee_id); const v = P.editableVersion(fresh(c), u.id); update('content_versions', { id: v.id }, { caption: captionText }); P.completeTask(t.id, u); }
}
async function fixAdjustments(c, clientKey, n) {
  c = fresh(c);
  for (const t of openTask(c, (t) => t.kind === 'ajuste')) {
    const u = userById(t.assignee_id);
    if (t.function === 'copy') { const v = P.editableVersion(fresh(c), u.id); update('content_versions', { id: v.id }, { caption: (v.caption || '') + '\n\n(ajustado)' }); }
    else await attachMedia(fresh(c), u, await demoMedia(clientKey, c.format, c.title, `v${n}`));
    P.completeTask(t.id, u);
  }
}
const review = (c, who, decision, extra = {}) => P.reviewDecision(c.id, U[who], { decision, ...extra }, req());

const CAPTIONS = {
  helena: (t) => `${t}.\n\nCuidar da pele é um hábito, não um evento. Neste post explico, sem complicação, o que realmente faz diferença na rotina.\n\nSalve para consultar depois e me conte nos comentários qual dúvida você quer ver aqui. [DEMO]`,
  moretti: (t) => `${t}\n\nDecisões societárias bem documentadas evitam conflitos que custam anos. Separamos os pontos de atenção que todo sócio deveria conhecer.\n\n#direitoempresarial [DEMO]`,
  atelier: (t) => `${t}.\n\nCada peça nasce devagar, entre linhas, tecidos e mãos. [DEMO]`,
  vertice: (t) => `${t}!\n\nSorrir com confiança começa por um bom planejamento. Chame no direct para agendar sua avaliação. [DEMO]`,
  aurora: (t) => `${t}.\n\nO tempo aqui tem outro ritmo. [DEMO]`,
  sena: (t) => `${t}. [DEMO]`,
};
const TAGS = [['Educativo', 'Autoridade'], ['Conexão', 'Identificação'], ['Prova social'], ['Desejo', 'Venda'], ['Bastidores', 'Pessoal'], ['Utilidade']];

// Cria um conteúdo e o leva até a etapa-alvo, simulando o ciclo mensal real
async function run_(clientKey, { title, format, day, month, target, theme, adjustInternal = 0, clientAdjust = false, block = null, priority = 'media' }, dates) {
  step(dates.crono);
  const tags = TAGS[Math.floor(Math.random() * TAGS.length)];
  let c = P.createContent({ client_id: C[clientKey].id, title, format, theme: theme || title, objective: `Objetivo [DEMO]: ${tags[0].toLowerCase()} — ${title.toLowerCase()}`, strategy_tags: tags, reference: '[PLACEHOLDER: referência visual]', planned_at: `${month}-${String(day).padStart(2, '0')}T12:00:00-03:00`, priority,
    briefing: `Formato ${format}. Pontos-chave: abertura forte, 1 ideia central, CTA de salvamento. [DEMO]` }, U[CLIENTS.find((x) => x.key === clientKey)?.team[0][0] || 'monique']);
  if (target === 'cronograma') return c;
  completeCronograma(c);
  if (target === 'analise_cronograma') return c;
  step(dates.analise, 15);
  if (target === 'ajuste_cronograma') { review(fresh(c), 'raisa', 'ajuste', { note: 'Tema muito parecido com o post da semana anterior. Trazer ângulo novo.' }); return c; }
  review(fresh(c), 'rebeca', 'aprovar');
  if (target === 'aprovacao_tema') return c;
  step(dates.tema, 19);
  P.clientDecision(c.id, clientUsers[clientKey], { decision: 'aprovar' }, req());
  if (block) { step(dates.prod, 9); P.blockContent(c.id, block, 'cliente', U[CLIENTS.find((x) => x.key === clientKey).team[0][0]]); return c; }
  if (target === 'producao') return c;
  step(dates.prod, 14);
  await produce(c, clientKey, CAPTIONS[clientKey](title));
  for (let i = 0; i < adjustInternal; i++) {
    step(dates.review, 11 + i);
    review(fresh(c), i % 2 ? 'rebeca' : 'raisa', 'ajuste', { adjustments: [{ description: ['Aumentar contraste do título na capa e aproximar a foto.', 'Cortar os 2 primeiros segundos e acelerar a abertura.', 'Legenda: trocar o CTA para salvar o post.'][i % 3], track: i === 2 ? 'legenda' : 'visual' }] });
    if (target === 'ajuste_interno' && i === adjustInternal - 1) return c;
    step(dates.review, 15 + i);
    await fixAdjustments(c, clientKey, i + 2);
  }
  if (target === 'analise_producao') return c;
  step(dates.review, 17);
  review(fresh(c), 'raisa', 'aprovar');
  if (target === 'aprovacao_cliente' && !clientAdjust) return c;
  if (clientAdjust) {
    step(dates.client, 20);
    const v = P.currentVersion(c.id);
    const f = P.versionMedia(v.id);
    P.clientDecision(c.id, clientUsers[clientKey], { decision: 'ajuste', note: format === 'carrossel' ? 'Na página 2, podemos trocar a frase por algo mais leve? O resto está lindo.' : 'Amei! Só gostaria de um tom de fundo um pouco mais claro.', carousel_page: format === 'carrossel' ? 2 : null }, req());
    addComment(fresh(c), clientUsers[clientKey], { body: format === 'carrossel' ? 'Na página 2, podemos trocar a frase por algo mais leve?' : 'Só o fundo um pouco mais claro, por favor 🙏', anchor: format === 'carrossel' ? { page: 2 } : null });
    if (target === 'ajuste_cliente') return c;
    step(dates.client, 22);
    await fixAdjustments(c, clientKey, 9);
    if (target === 'revisao_ajuste') return c;
    step(dates.client, 23);
    P.reviewDecision(c.id, U[CLIENTS.find((x) => x.key === clientKey).team[0][0]], { decision: 'aprovar' }, req());
    if (target === 'aprovacao_cliente') return c;
  }
  step(dates.client, 21);
  P.clientDecision(c.id, clientUsers[clientKey], { decision: 'aprovar' }, req());
  if (target === 'agendamento') return c;
  step(dates.sched, 10);
  P.schedule(c.id, U.vivian, { at: `${month}-${String(day).padStart(2, '0')}T18:30:00-03:00`, mode: 'externo', external_note: 'Agendado no Meta Business Suite pela Vivian' });
  if (target === 'agendado') return c;
  step(`${month}-${String(day).padStart(2, '0')}`, 19);
  P.confirmPublished(c.id, U.vivian, {});
  return c;
}

// ─────────── CICLO DE OUTUBRO (já publicado / agendado) ───────────
const OCT = { crono: '2026-09-01', analise: '2026-09-03', tema: '2026-09-11', prod: '2026-09-17', review: '2026-09-24', client: '2026-09-28', sched: '2026-09-30' };
const octPlan = {
  helena: [['Protetor solar no inverno', 'carrossel', 6], ['Rotina noturna em 3 passos', 'reel', 9], ['Mitos sobre retinol', 'carrossel', 14], ['Bastidores do consultório', 'reel', 21], ['Pele e sono', 'estatico', 27]],
  moretti: [['Acordo de sócios: por que fazer', 'carrossel', 7], ['3 cláusulas que evitam conflito', 'carrossel', 15], ['Holding familiar sem mistério', 'estatico', 22], ['Quem somos', 'reel', 28]],
  vertice: [['Clareamento: o que esperar', 'reel', 8], ['Planejamento digital do sorriso', 'carrossel', 16], ['Equipe Vértice', 'foto', 23], ['Lentes ou facetas?', 'carrossel', 29]],
  aurora: [['Manhãs na Casa Aurora', 'reel', 10], ['Da horta para a mesa', 'carrossel', 24]],
};
for (const [k, list] of Object.entries(octPlan)) for (const [title, format, day] of list) {
  await run_(k, { title, format, day, month: '2026-10', target: day <= 18 ? 'publicado' : 'agendado', adjustInternal: Math.random() < 0.35 ? 1 : 0 }, OCT);
}

// ─────────── CICLO DE NOVEMBRO (em andamento: hoje = 19/10, semana de produção 16–22/10) ───────────
const NOV = { crono: '2026-10-01', analise: '2026-10-03', tema: '2026-10-12', prod: '2026-10-16', review: '2026-10-17', client: '2026-10-18', sched: '2026-10-19' };
const novPlan = [
  ['helena', 'Skincare para pele sensível', 'carrossel', 3, 'aprovacao_cliente', { adjustInternal: 1 }],
  ['helena', 'Vitamina C: quando usar', 'reel', 5, 'aprovacao_cliente'],
  ['helena', 'Manchas de sol: prevenção', 'carrossel', 10, 'analise_producao'],
  ['helena', 'Um dia no consultório', 'reel', 12, 'producao'],
  ['helena', 'Hidratação de dentro para fora', 'estatico', 17, 'producao'],
  ['helena', 'Perguntas da semana', 'carrossel', 24, 'ajuste_interno', { adjustInternal: 2 }],
  ['moretti', 'Contrato social: revise já', 'carrossel', 4, 'agendamento'],
  ['moretti', 'Sucessão na empresa familiar', 'carrossel', 11, 'analise_producao'],
  ['moretti', 'Escritório novo, mesma essência', 'foto', 13, 'producao', { block: 'Fotos do escritório novo ainda não enviadas pelo cliente' }],
  ['moretti', 'Due diligence em 60 segundos', 'reel', 18, 'producao'],
  ['moretti', 'Marca registrada: proteja seu nome', 'estatico', 25, 'producao'],
  ['atelier', 'Coleção Inverno Sereno', 'reel', 5, 'aprovacao_tema'],
  ['atelier', 'Do croqui à peça', 'carrossel', 12, 'aprovacao_tema'],
  ['atelier', 'Tecidos que respiram', 'estatico', 19, 'aprovacao_tema'],
  ['atelier', 'Mãos que costuram', 'reel', 26, 'aprovacao_tema'],
  ['atelier', 'Provador aberto', 'carrossel', 28, 'ajuste_cronograma'],
  ['vertice', 'Primeira consulta sem medo', 'carrossel', 4, 'aprovacao_cliente', { clientAdjust: true }],
  ['vertice', 'Clareamento caseiro: cuidado', 'reel', 7, 'ajuste_cliente', { clientAdjust: true }],
  ['vertice', 'Sorriso e autoestima', 'carrossel', 14, 'aprovacao_cliente'],
  ['vertice', 'Tecnologia na Vértice', 'reel', 21, 'producao', { block: 'Vídeos brutos da equipe não chegaram — cliente prometeu para 20/10' }],
  ['vertice', 'Dúvidas sobre aparelho', 'estatico', 27, 'producao'],
  ['aurora', 'Novembro na serra', 'reel', 6, 'analise_producao'],
  ['aurora', 'Café colonial', 'carrossel', 15, 'producao'],
  ['aurora', 'Trilhas guiadas', 'reel', 22, 'producao'],
];
for (const [k, title, format, day, target, extra = {}] of novPlan) {
  const dates = { ...NOV, tema: k === 'atelier' ? '2026-10-09' : NOV.tema };
  await run_(k, { title, format, day, month: '2026-11', target, ...extra }, dates);
}
// Instituto Sena (onboarding) — post de boas-vindas direto em produção, sem designer vinculado → tarefa SEM RESPONSÁVEL
step('2026-10-14', 11);
P.createContent({ client_id: C.sena.id, title: 'Boas-vindas ao Instituto Sena', format: 'estatico', theme: 'Apresentação', objective: 'Primeiro post do perfil', planned_at: '2026-11-03T12:00:00-03:00', stage: 'producao', priority: 'alta' }, U.monique);
// Dezembro: estrategistas começam o cronograma (26/10–01/11) — antecipado para dois clientes
for (const [k, title, format, day] of [['helena', 'Pele e festas de fim de ano', 'carrossel', 4], ['helena', 'Retrospectiva de cuidados', 'reel', 18], ['moretti', 'Planejamento societário 2027', 'carrossel', 3]]) {
  await run_(k, { title, format, day, month: '2026-12', target: 'cronograma' }, { crono: '2026-10-17' });
}

// ─────────── COMENTÁRIOS ───────────
step('2026-10-19', 9);
const firstAwaiting = one("SELECT * FROM contents WHERE client_id=? AND stage='aprovacao_cliente' ORDER BY planned_at LIMIT 1", C.helena.id);
if (firstAwaiting) {
  addComment(firstAwaiting, clientUsers.helena, { body: 'Gostei muito da capa! A página 3 ficou perfeita.' });
  addComment(firstAwaiting, U.juliane, { body: 'Que bom! Qualquer ajuste é só comentar aqui mesmo 😊', visibility: 'client' });
  addComment(firstAwaiting, U.raisa, { body: 'Interno: cliente costuma pedir troca de foto na véspera. Deixar alternativa pronta.', visibility: 'internal' });
}

// ─────────── REUNIÕES ───────────
const meet = (client, title, kind, s, e, attendees, extra = {}) => {
  const m = insert('meetings', { id: uid('mt_'), client_id: client?.id || null, title, kind, starts_at: new Date(s).toISOString(), ends_at: new Date(e).toISOString(), location: 'Google Meet [PLACEHOLDER: link]', status: extra.status || 'agendada', booked_by: U.vivian.id, gcal_sync: 'nao_sincronizado', summary: extra.summary || null, created_at: now() });
  attendees.forEach((u) => run('INSERT OR IGNORE INTO meeting_attendees (meeting_id,user_id) VALUES (?,?)', m.id, u.id));
  return m;
};
step('2026-10-13', 10);
const m1 = meet(C.helena, 'Dra. Helena Prado e Agência Bold — Reunião mensal (Novembro)', 'mensal', '2026-10-13T10:00:00-03:00', '2026-10-13T11:00:00-03:00', [U.rebeca, U.juliane, clientUsers.helena], { status: 'realizada', summary: 'Alinhamento do cronograma de novembro e campanha de fim de ano. [DEMO]' });
for (const [kind, body, owner, due] of [['decisao', 'Campanha de fim de ano focada em cuidados pós-sol (sem citar preços).', null, null], ['acao', 'Enviar 5 fotos novas do consultório', null, '2026-10-22T18:00:00-03:00'], ['acao', 'Preparar roteiro do reel “Um dia no consultório”', U.juliane, '2026-10-20T18:00:00-03:00'], ['mudanca_estrategia', 'Aumentar Reels para 2 por semana em dezembro.', null, null]]) {
  const it = insert('meeting_items', { id: uid('mi_'), meeting_id: m1.id, kind, body, owner_id: owner?.id || null, due_at: due ? new Date(due).toISOString() : null, origin: 'manual', confirmed: 1, created_at: now() });
  if (kind === 'acao' && owner) { const t = insert('tasks', { id: uid('t_'), title: body, description: 'Origem: reunião mensal 13/10', client_id: C.helena.id, assignee_id: owner.id, status: 'aberta', kind: 'reuniao', origin: 'reuniao', source_type: 'meeting', source_id: m1.id, priority: 'media', due_at: it.due_at, created_at: now() }); update('meeting_items', { id: it.id }, { task_id: t.id }); }
  if (['decisao', 'mudanca_estrategia'].includes(kind)) insert('client_memories', { id: uid('cm_'), client_id: C.helena.id, kind: 'decisao', body, source_type: 'meeting', source_id: m1.id, created_by: U.juliane.id, created_at: now() });
}
step('2026-10-17', 9);
meet(C.vertice, 'Clínica Vértice e Agência Bold — Reunião mensal (Novembro)', 'mensal', '2026-10-19T14:00:00-03:00', '2026-10-19T15:00:00-03:00', [U.raisa, U.monique, clientUsers.vertice]);
meet(C.moretti, 'Moretti Advocacia e Agência Bold — Reunião mensal (Novembro)', 'mensal', '2026-10-23T10:00:00-03:00', '2026-10-23T11:00:00-03:00', [U.rebeca, U.raisa, U.monique, clientUsers.moretti]);
meet(C.sena, 'DIAGNÓSTICO DE MARCA — Instituto Sena', 'onboarding', '2026-10-21T10:00:00-03:00', '2026-10-21T11:30:00-03:00', [U.rebeca, U.monique, clientUsers.sena]);
meet(null, 'Reunião de Alinhamento semanal — Equipe The Bold', 'interna', '2026-10-26T10:00:00-03:00', '2026-10-26T10:30:00-03:00', Object.values(U));
meet(null, 'REUNIÃO ESTRATEGISTAS THE BOLD', 'interna', '2026-10-20T15:30:00-03:00', '2026-10-20T16:30:00-03:00', [U.rebeca, U.vivian, U.raisa, U.vitoria, U.juliane, U.monique]);
meet(null, 'Reunião Designers — THE BOLD MKT', 'interna', '2026-10-21T13:30:00-03:00', '2026-10-21T14:30:00-03:00', [U.rebeca, U.felipe, U.nicole, U.monique]);
meet(null, 'Reunião EDITORES DE VÍDEO — THE BOLD', 'interna', '2026-10-23T09:00:00-03:00', '2026-10-23T10:00:00-03:00', [U.rebeca, U.leo, U.nicole]);
// Janela de reuniões mensais (DIA DE REUNIÃO 9, 10, 11 e 13/11 — Calendar)
for (const d of ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-13']) {
  for (const h of ['10:00', '11:00', '14:00', '15:00', '16:00']) {
    const s = new Date(`${d}T${h}:00-03:00`);
    insert('meeting_slots', { id: uid('sl_'), starts_at: s.toISOString(), ends_at: new Date(s.getTime() + 3600e3).toISOString(), host_id: [U.rebeca, U.raisa, U.vivian][Math.floor(Math.random() * 3)].id, window_label: 'Reuniões mensais — Dezembro', created_at: now() });
  }
}
// Eventos (marcos e compromissos)
for (const [title, kind, s, e, cl] of [['PRESENCIAL Casa Aurora — gravação', 'compromisso', '2026-10-28T09:00:00-03:00', '2026-10-28T12:00:00-03:00', C.aurora], ['Aniversário — Dra. Helena [PLACEHOLDER]', 'evento', '2026-11-08T09:00:00-03:00', null, C.helena]]) {
  insert('events', { id: uid('ev_'), title, kind, starts_at: s, ends_at: e, all_day: e ? 0 : 1, client_id: cl?.id || null, created_by: U.vivian.id, created_at: now() });
}

// ─────────── CHAT ───────────
const ch = (name, topic) => insert('channels', { id: uid('ch_'), kind: 'interno', name, topic, created_by: U.rebeca.id, created_at: now() });
const msg = (channel, user, body, when, parent = null) => { step(when.slice(0, 10), Number(when.slice(11, 13) || 10)); return insert('messages', { id: uid('msg_'), channel_id: channel.id, parent_id: parent, author_id: user.id, body, created_at: now() }); };
const avisos = ch('quadro-de-avisos', 'Avisos oficiais, prazos do ciclo e mudanças de processo');
const prod = ch('time-producao', 'Pedidos de ajuste, materiais e prazos de produção');
const estr = ch('time-estrategistas', 'Cronogramas, análises e decisões de estratégia');
ch('edicao-videos', 'Quem edita o quê, entregas com hora marcada');
ch('central-de-ajuda', 'Dúvidas gerais sobre processos e ferramentas');
msg(avisos, U.rebeca, 'Bom dia, pessoal ❤ Prazos do ciclo de NOVEMBRO já estão no calendário: produção de 16 a 22/10, revisão 23–24, ajustes 25–26 e liberação para clientes 27–28. A partir de agora, o card anda sozinho na aba PROCESSOS — ninguém precisa arrastar 🙌', '2026-10-15T08:40');
msg(avisos, U.vitoria, 'Reforçando: toda entrega concluída na plataforma já avisa a próxima pessoa. Se faltar material, use “Bloquear” com o motivo — vira pendência com dono e prazo.', '2026-10-15T09:10');
const m2 = msg(prod, U.juliane, '@Felipe ajuste no carrossel de 24/11 da Dra. Helena: aumentar contraste do título na capa. Já está na plataforma.', '2026-10-17T11:20');
msg(prod, U.felipe, 'Feito, subi a V3 ✔', '2026-10-17T15:05', m2.id);
msg(prod, U.monique, 'Moretti ainda não mandou as fotos do escritório novo. Bloqueei o post do dia 13/11 com o motivo. @Vivian consegue reforçar com o cliente?', '2026-10-16T10:15');
msg(prod, U.vivian, 'Cliente vai enviar novos takes até quarta, pedi que suba direto na área dele.', '2026-10-16T14:30');
msg(estr, U.juliane, 'Atelier ainda não aprovou os temas de novembro (desde 09/10). Sugiro decidir hoje se seguimos com 4 posts ou empurramos 1 para dezembro.', '2026-10-19T09:30');
for (const k of ['helena', 'vertice', 'moretti']) {
  const cch = one("SELECT * FROM channels WHERE client_id=? AND kind='cliente'", C[k].id);
  msg(cch, clientUsers[k], k === 'moretti' ? 'Oi pessoal! As fotos do escritório saem até quarta, combinado?' : 'Oi! Vi os conteúdos novos no feed, vou aprovar hoje à noite 😊', '2026-10-18T19:10');
  msg(cch, U.vivian, 'Perfeito! Qualquer ajuste é só comentar direto no post. ❤', '2026-10-18T19:40');
}

// ─────────── COMERCIAL E FINANCEIRO (valores fictícios) ───────────
step('2026-10-01', 9);
const fees = { helena: 4800, moretti: 5200, atelier: 3900, vertice: 4500, aurora: 6000, sena: 3600 };
for (const [k, v] of Object.entries(fees)) {
  const start = k === 'sena' ? '2026-10-10' : '2026-06-10';
  const kk = insert('contracts', { id: uid('ct_'), client_id: C[k].id, service: 'Gestão de conteúdo [DEMO]', monthly_value: v, starts_at: start, due_day: 10, status: 'ativo', notes: '[DEMO] valor fictício', created_at: now() });
  for (let i = 0; i < 6; i++) {
    const d = new Date(Date.UTC(2026, Number(start.slice(5, 7)) - 1 + i, 10, 15));
    const paid = d < new Date('2026-10-01') || (d < new Date('2026-10-19') && k !== 'atelier');
    insert('invoices', { id: uid('iv_'), contract_id: kk.id, client_id: C[k].id, description: `Gestão de conteúdo — ${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`, amount: v, due_at: d.toISOString(), status: paid ? 'paga' : d < new Date('2026-10-19') ? 'atrasada' : 'aberta', paid_at: paid ? new Date(d.getTime() + 2 * 864e5).toISOString() : null, paid_amount: paid ? v : null, created_at: now() });
  }
}
for (const [name, company, origin, stage, value, next, nextAt, owner] of [
  ['Clínica Fiore', 'Clínica Fiore [DEMO]', 'Indicação', 'proposta', 5500, 'Enviar proposta revisada com Reels', '2026-10-20T10:00:00-03:00', 'rebeca'],
  ['Escritório Tavares', 'Tavares & Lima [DEMO]', 'Instagram', 'qualificacao', 4800, 'Ligar para entender escopo', '2026-10-17T15:00:00-03:00', 'matheus'],
  ['Studio Nami', 'Studio Nami [DEMO]', 'Site', 'reuniao', 3900, 'Reunião de apresentação', '2026-10-22T11:00:00-03:00', 'rebeca'],
  ['Dr. Arthur Leme', 'Dr. Arthur Leme [DEMO]', 'Mentoria', 'lead', 4500, 'Primeiro contato', '2026-10-19T17:00:00-03:00', 'matheus'],
  ['Pousada Lume', 'Pousada Lume [DEMO]', 'Indicação', 'negociacao', 6200, 'Ajustar prazo de contrato (3 ou 6 meses)', '2026-10-21T10:00:00-03:00', 'rebeca'],
]) insert('deals', { id: uid('dl_'), name, company, contact_name: '[PLACEHOLDER]', origin, owner_id: U[owner].id, value, service: 'Gestão de conteúdo', stage, probability: { lead: 10, qualificacao: 30, reuniao: 45, proposta: 60, negociacao: 75 }[stage], last_interaction_at: now(), next_action: next, next_action_at: new Date(nextAt).toISOString(), created_at: now(), updated_at: now() });

// ─────────── FINAL ───────────
await waitForProcessing();
setClock(null);
// Ajuste de prazos do ciclo: tarefas de produção vencem no marco 22/10; revisões etc. já calculadas pelo engine
runDetectors();
generateReport('operacao', new Date(Date.now() - 7 * 864e5).toISOString(), now());
const counts = Object.fromEntries(['users', 'clients', 'contents', 'content_versions', 'files', 'tasks', 'adjustments', 'approvals', 'activity_logs', 'automation_runs', 'notifications', 'ai_insights'].map((t) => [t, one(`SELECT COUNT(*) n FROM ${t}`).n]));
console.log('Seed concluído:', counts);
console.log(`Senha de todos os usuários de demonstração: ${PASSWORD}`);
