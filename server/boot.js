// RAILWAY (hospedagem persistente) — ponto de entrada do serviço contínuo.
// 1) Volume /data guarda a base e os arquivos: o que a equipe faz FICA (diferente da prévia da Vercel, que usa uma cópia temporária).
// 2) Carga única: só se /data/bold.db ainda não existe, decifra real-snapshot/bold.db.enc com BOLD_SNAPSHOT_KEY. Depois disso
//    o snapshot nunca mais sobrescreve a base (a base viva passa a ser a fonte de verdade).
// 3) Backup automático: VACUUM INTO /data/backups todo dia (7 diários + 4 semanais), além do backup de volume do Railway.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA = process.env.BOLD_DATA_DIR || '/data';
fs.mkdirSync(DATA, { recursive: true });
const DB = path.join(DATA, 'bold.db');
const keyB64 = process.env.BOLD_SNAPSHOT_KEY;
const key = keyB64 ? Buffer.from(keyB64.trim(), 'base64') : null;

if (!fs.existsSync(DB)) {
  const snap = path.resolve('real-snapshot/bold.db.enc');
  if (!key || key.length !== 32 || !fs.existsSync(snap)) {
    console.error('[boot] Base vazia e sem BOLD_SNAPSHOT_KEY válida: não há como fazer a carga inicial. Defina a variável e reinicie.');
    process.exit(1);
  }
  const buf = fs.readFileSync(snap);
  const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  const out = Buffer.concat([d.update(buf.subarray(28)), d.final()]);
  fs.writeFileSync(`${DB}.carga`, out);
  fs.renameSync(`${DB}.carga`, DB);
  fs.writeFileSync(path.join(DATA, 'carga-inicial.json'), JSON.stringify({ at: new Date().toISOString(), sha256: crypto.createHash('sha256').update(out).digest('hex'), bytes: out.length }, null, 1));
  console.log(`[boot] Carga inicial feita a partir do snapshot (${Math.round(out.length / 1024)} KB). A partir de agora a base do volume é a fonte de verdade.`);
}

process.env.BOLD_DATA_DIR = DATA;
process.env.BOLD_STORAGE_DIR ||= DATA;
process.env.BOLD_PERSISTENT_HOST = '1';
// Mesmos segredos derivados da prévia (sessões e cofre de acessos continuam válidos); variáveis explícitas têm prioridade
if (key?.length === 32) {
  const derive = (label) => Buffer.from(crypto.hkdfSync('sha256', key, Buffer.alloc(0), label, 32));
  process.env.BOLD_SESSION_SECRET ||= derive('bold-session').toString('base64url');
  process.env.BOLD_VAULT_KEY ||= derive('bold-vault').toString('base64');
}

const { createApp } = await import('./index.js');
const { startScheduler } = await import('./engine/scheduler.js');
const { db } = await import('./db.js');
const app = createApp();
const port = Number(process.env.PORT) || 4000;
app.listen(port, '0.0.0.0', () => console.log(`[boot] THE BOLD OS no ar na porta ${port} · base ${DB}`));
if (process.env.BOLD_SCHEDULER !== 'off') startScheduler();

// Backup diário (idempotente por dia): mantém os 7 últimos diários e 4 domingos
const BK = path.join(DATA, 'backups');
function backup() {
  try {
    fs.mkdirSync(BK, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(BK, `bold-${day}.db`);
    if (fs.existsSync(file)) return;
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const all = fs.readdirSync(BK).filter((f) => /^bold-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
    const keepWeekly = all.filter((f) => new Date(`${f.slice(5, 15)}T12:00:00Z`).getUTCDay() === 0).slice(-4);
    const keepDaily = all.slice(-7);
    for (const f of all) if (!keepDaily.includes(f) && !keepWeekly.includes(f)) fs.unlinkSync(path.join(BK, f));
    console.log(`[backup] ${path.basename(file)} gravado`);
  } catch (e) { console.error('[backup] falhou:', e.message); }
}
setTimeout(backup, 60e3);
setInterval(backup, 3600e3);
