// TESTE DE UX DA ÁREA DO CLIENTE — "Se o cliente precisa perguntar onde clicar, a interface falhou."
// Roda num navegador real (Chromium), em celular e desktop, sobre um banco TEMPORÁRIO criado só para o teste
// (equipe e cliente de teste descartáveis; a base real nunca é tocada). Uso: npm run build && node scripts/ux-portal.mjs [pasta-das-capturas]
// Um cliente novo precisa conseguir responder, sem ajuda: O que preciso fazer? Onde está o conteúdo? Qual é a versão atual?
// O que está esperando por mim? Quando preciso responder? O que acontece depois? — e aprovar pelo celular em poucos segundos.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const OUT = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'bold-ux'));
fs.mkdirSync(OUT, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bold-ux-db-'));
Object.assign(process.env, { BOLD_DATA_DIR: TMP, BOLD_STORAGE_DIR: TMP, BOLD_DB_PATH: path.join(TMP, 'ux.db') });

const { one, all, insert, uid, now, run } = await import('../server/db.js');
const { createApp, bootstrap } = await import('../server/index.js');
bootstrap();
const P = await import('../server/engine/process.js');
const { startClient } = await import('../server/routes/ops.js');
const { hashPassword } = await import('../server/lib/auth.js');
const { ingest, TMP_DIR, waitForProcessing } = await import('../server/services/media.js');
const sharp = (await import('sharp')).default;

const PW = 'ux-teste-1234';
const mk = (key, role) => insert('users', { id: uid('u_'), name: key, email: `${key.toLowerCase()}@ux.test`, password_hash: hashPassword(PW), role_key: role, functions: '[]', active: 1, capacity: 10, created_at: now() });
const est = mk('Estrategista', 'estrategia'), des = mk('Designer', 'design'), rev = mk('Revisora', 'qualidade'), atd = mk('Atendimento', 'gestao');
const client = startClient({ name: 'Cliente de teste UX', services: ['Social media'], monthly_posts: 4, requires_theme_approval: true,
  team: [{ user_id: est.id, function: 'estrategia' }, { user_id: est.id, function: 'copy' }, { user_id: des.id, function: 'design' }, { user_id: atd.id, function: 'agendamento' }, { user_id: atd.id, function: 'atendimento' }, { user_id: rev.id, function: 'revisao' }] }, est);
const cu = mk('Cliente', 'cliente'); insert('client_members', { client_id: client.id, user_id: cu.id, function: 'cliente' });
const req = { ip: '127.0.0.1', headers: {} };
const fresh = (id) => one('SELECT * FROM contents WHERE id=?', id);
async function art(color, label) {
  const src = path.join(TMP_DIR, `ux-${crypto.randomUUID()}.jpg`);
  const svg = `<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${color}"/><text x="80" y="1200" font-size="90" font-family="serif" fill="#F6F3F0">${label}</text></svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toFile(src);
  return ingest(src, { originalName: `${label}.jpg`, mime: 'image/jpeg', clientId: client.id, userId: des.id });
}
async function toApproval(title, color, days) {
  const c = P.createContent({ client_id: client.id, title, format: 'carrossel', planned_at: new Date(Date.now() + days * 864e5).toISOString(), stage: 'producao' }, est);
  const v = P.editableVersion(fresh(c.id), des.id);
  for (let i = 0; i < 3; i++) insert('version_media', { version_id: v.id, file_id: (await art(color, `${title} ${i + 1}`)).id, position: i });
  run('UPDATE content_versions SET caption=? WHERE id=?', `Legenda de “${title}”.\nTexto de teste do roteiro de UX.`, v.id);
  for (const t of all("SELECT * FROM tasks WHERE content_id=? AND status='aberta' AND kind='etapa'", c.id)) P.completeTask(t.id, t.function === 'design' ? des : est);
  P.reviewDecision(c.id, rev, { decision: 'aprovar' }, req);
  return fresh(c.id);
}
const c1 = await toApproval('Post 1 do teste', '#4A1725', 13);
await toApproval('Post 2 do teste', '#1C1818', 15);
P.createContent({ client_id: client.id, title: 'Post 3 do teste', format: 'reel', planned_at: new Date(Date.now() + 16 * 864e5).toISOString(), stage: 'producao' }, est);
await waitForProcessing?.();

const app = createApp();
const server = app.listen(0);
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const results = [];
const check = (ok, what) => { results.push({ ok: !!ok, what }); console.log(`${ok ? '✓' : '✗'} ${what}`); };

const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined });
for (const [label, viewport, tone] of [['celular', { width: 390, height: 844 }, 'dark'], ['desktop', { width: 1440, height: 960 }, 'light']]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: tone, hasTouch: label === 'celular', isMobile: label === 'celular' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/');
  await page.evaluate(async ([email, password]) => { await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bold-request': '1' }, body: JSON.stringify({ email, password }) }); }, [cu.email, PW]);
  await page.goto(ORIGIN + '/portal');
  await page.waitForSelector('.p-hello-t');
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, `${label}-1-home.png`), fullPage: true });
  const body = await page.textContent('body');
  check(/Bom dia|Boa tarde|Boa noite/.test(body), `[${label}] saudação pelo horário`);
  check(body.includes('Você está aqui') && body.includes('aguardando você'), `[${label}] AGORA: onde o projeto está`);
  check(body.includes('Precisamos de você') && /Aprovar 2 conteúdos/.test(body), `[${label}] VOCÊ: o que precisa de mim`);
  check(/Precisamos de você até \d/.test(body), `[${label}] QUANDO: prazo visível`);
  check(body.includes('The Bold está cuidando') && body.includes('Produção dos conteúdos'), `[${label}] THE BOLD: o que estão fazendo`);
  check(body.includes('Depois') && /seguem para agendamento/.test(body), `[${label}] DEPOIS: o que acontece`);
  const ops = (await page.textContent('.p-need')) + (await page.textContent('.p-pair'));
  check(!/Estrategista|Designer|Revisora|Atendimento/.test(ops), `[${label}] nenhum nome interno em "Precisamos de você" / "The Bold está cuidando"`);
  // Aprovar em poucos toques: CTA → coração → confirmar
  const t0 = Date.now();
  await page.click('.p-act.big .p-cta');
  await page.waitForSelector('.p-post .p-like');
  await page.screenshot({ path: path.join(OUT, `${label}-2-conteudo.png`), fullPage: false });
  const b2 = await page.textContent('.p-post');
  check(/V1/.test(b2), `[${label}] versão atual visível no conteúdo`);
  check(/PRECISAMOS DE VOCÊ ATÉ/.test(b2), `[${label}] prazo no próprio conteúdo`);
  await page.click('.p-post .p-like');
  await page.waitForSelector('.p-confirm-like');
  await page.screenshot({ path: path.join(OUT, `${label}-3-confirmar.png`) });
  await page.click('.p-confirm-like .p-cta');
  await page.waitForSelector('.p-confirm.ok');
  const secs = (Date.now() - t0) / 1000;
  check(secs < 8, `[${label}] aprovação em 3 toques (${secs.toFixed(1)}s com rede local)`);
  const after = fresh(c1.id)?.stage === 'agendamento' || all("SELECT 1 FROM approvals WHERE kind='cliente' AND decision='aprovado'").length > 0;
  check(after, `[${label}] aprovação registrada no Process Engine`);
  await page.screenshot({ path: path.join(OUT, `${label}-4-aprovado.png`) });
  // Pedir ajuste estruturado no segundo conteúdo, marcando a imagem
  await page.goto(ORIGIN + '/portal/conteudos?filtro=aguardando');
  await page.waitForSelector('.p-post');
  const pending = await page.$$('.p-post');
  if (pending.length) {
    await page.click('.p-post .p-act-btn >> nth=0');
    await page.waitForSelector('.p-adj');
    const img = await page.$('.p-post .mv-pinbox img');
    if (img) { await img.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -80)); await page.waitForTimeout(200); const bb = await img.boundingBox(); label === 'celular' ? await page.touchscreen.tap(bb.x + bb.width * 0.4, bb.y + bb.height * 0.5) : await page.mouse.click(bb.x + bb.width * 0.4, bb.y + bb.height * 0.3); }
    await page.click('.p-adj-chips button >> text=Imagem');
    await page.fill('.p-adj textarea', 'trocar esta imagem por uma mais clara');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, `${label}-5-ajuste.png`) });
    check((await page.textContent('.p-adj-preview')).includes('AJUSTE · V1'), `[${label}] ajuste mostra exatamente como será registrado`);
    await page.click('.p-adj button.p-btn.solid');
    await page.waitForSelector('.p-confirm.ok');
    const adj = one("SELECT aspect, region, carousel_page FROM adjustments WHERE origin='cliente' ORDER BY created_at DESC LIMIT 1");
    check(adj?.aspect === 'imagem' && adj?.region, `[${label}] ajuste com tipo e ponto marcado registrado (${JSON.stringify(adj)})`);
  }
  // Pedir algo à The Bold
  await page.goto(ORIGIN + '/portal');
  await page.waitForSelector('.p-hello-t');
  await page.click(label === 'celular' ? '.p-fab' : '.p-new');
  await page.click('.p-kinds button >> nth=3');
  await page.fill('.p-nr textarea', 'Qual o melhor horário para postar?');
  await page.click('.p-nr .p-btn.solid');
  await page.waitForSelector('.p-received');
  await page.screenshot({ path: path.join(OUT, `${label}-6-solicitacao.png`) });
  check((await page.textContent('.p-received')).includes('Recebemos'), `[${label}] solicitação confirmada: RECEBEMOS`);
  for (const [url, name] of [['/portal/decisoes', '7-decisoes'], ['/portal/calendario', '8-calendario'], ['/portal/solicitacoes', '9-solicitacoes'], ['/portal/historico', '10-historico'], ['/portal/onboarding', '11-onboarding'], ['/portal/marca', '12-marca']]) {
    await page.goto(ORIGIN + url); await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, `${label}-${name}.png`), fullPage: true });
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, `[${label}] sem rolagem horizontal`);
  check(!errors.length, `[${label}] sem erros de JavaScript${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  // Reverte o estado do cliente de teste para o segundo viewport repetir o roteiro
  if (label === 'celular') {
    for (const c of all("SELECT * FROM contents WHERE client_id=? AND stage IN ('agendamento','ajuste_cliente')", client.id)) { run('DELETE FROM contents WHERE id=?', c.id); }
    await toApproval('Post 4 do teste', '#3A111D', 14); await toApproval('Post 5 do teste', '#5E1F31', 16);
    run("DELETE FROM adjustments WHERE origin='cliente'");
  }
  await ctx.close();
}
await browser.close();
server.close();
fs.rmSync(TMP, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações de UX ok · capturas em ${OUT}`);
process.exit(failed.length ? 1 : 0);
