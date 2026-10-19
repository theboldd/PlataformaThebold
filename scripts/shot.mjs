// Captura de tela para verificação visual: node scripts/shot.mjs <url> <email> <saida.png> [largura] [altura]
import { chromium } from 'playwright';
const [url, email, out, w = '1440', h = '1000'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
const origin = new URL(url).origin;
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('401') && errors.push(m.text()));
if (email) {
  await page.goto(origin + '/');
  await page.evaluate(async (email) => { await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bold-request': '1' }, body: JSON.stringify({ email, password: 'thebold2026' }) }); }, email);
}
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(Number(process.env.WAIT || 1800));
await page.screenshot({ path: out, fullPage: process.env.FULL === '1' });
if (errors.length) console.log('ERROS NO NAVEGADOR:\n' + errors.join('\n'));
await browser.close();
