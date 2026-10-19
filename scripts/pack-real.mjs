// Empacota a BASE REAL (storage/bold.db, migrada do Notion) para a prévia no Vercel — sempre criptografada (AES-256-GCM).
// O repositório pode ser público: só o arquivo cifrado vai para o git; a chave fica em storage/.snapshot-key e na env BOLD_SNAPSHOT_KEY do Vercel.
// Também troca a senha da equipe NESTA CÓPIA por uma senha forte (storage/.team-password), porque a senha de testes é pública.
// Uso: node scripts/pack-real.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const STORAGE = path.resolve('storage');
const keyFile = path.join(STORAGE, '.snapshot-key');
const pwFile = path.join(STORAGE, '.team-password');
if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
if (!fs.existsSync(pwFile)) fs.writeFileSync(pwFile, `Bold-${crypto.randomBytes(9).toString('base64url')}`, { mode: 0o600 });
const key = Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'base64');
const password = fs.readFileSync(pwFile, 'utf8').trim();

const tmp = path.join(STORAGE, '.pack.db');
fs.rmSync(tmp, { force: true });
const src = new DatabaseSync(path.join(STORAGE, 'bold.db'));
if (src.prepare('SELECT COUNT(*) n FROM clients WHERE is_demo=1').get().n) throw new Error('storage/bold.db contém clientes de demonstração — rode "npm run base:real" antes.');
src.exec(`VACUUM INTO '${tmp}'`);
src.close();

const db = new DatabaseSync(tmp);
const salt = crypto.randomBytes(16);
const hash = `scrypt$${salt.toString('base64')}$${crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64')}`;
db.prepare("UPDATE users SET password_hash=? WHERE role_key<>'cliente'").run(hash);
db.exec('DELETE FROM sessions');
const counts = db.prepare("SELECT (SELECT COUNT(*) FROM clients) clients, (SELECT COUNT(*) FROM users WHERE role_key<>'cliente') team").get();
db.close();

const iv = crypto.randomBytes(12);
const c = crypto.createCipheriv('aes-256-gcm', key, iv);
const enc = Buffer.concat([c.update(fs.readFileSync(tmp)), c.final()]);
fs.mkdirSync('real-snapshot', { recursive: true });
fs.writeFileSync('real-snapshot/bold.db.enc', Buffer.concat([iv, c.getAuthTag(), enc]));
fs.rmSync(tmp, { force: true });
console.log(`Base real empacotada: ${counts.clients} clientes, ${counts.team} pessoas da equipe → real-snapshot/bold.db.enc (${(enc.length / 1024).toFixed(0)} KB, cifrado)`);
