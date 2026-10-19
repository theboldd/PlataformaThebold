// Vercel: a API inteira (Express) roda como uma função.
// BASE REAL: com a env BOLD_SNAPSHOT_KEY, decifra real-snapshot/bold.db.enc (clientes reais migrados do Notion) para /tmp.
// Sem a chave, cai na base de DEMONSTRAÇÃO (demo-snapshot/, fictícia e marcada como tal na interface).
// Cada instância trabalha numa cópia em /tmp: alterações feitas na prévia são temporárias até a versão definitiva (Supabase).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = process.env.BOLD_DATA_DIR || '/tmp/bold';
const key = process.env.BOLD_SNAPSHOT_KEY ? Buffer.from(process.env.BOLD_SNAPSHOT_KEY.trim(), 'base64') : null;
const real = key?.length === 32 && fs.existsSync(path.resolve('real-snapshot/bold.db.enc'));

if (!fs.existsSync(path.join(DIR, 'bold.db'))) {
  fs.mkdirSync(DIR, { recursive: true });
  if (real) {
    const buf = fs.readFileSync(path.resolve('real-snapshot/bold.db.enc'));
    const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    fs.writeFileSync(path.join(DIR, 'bold.db'), Buffer.concat([d.update(buf.subarray(28)), d.final()]));
  } else {
    fs.cpSync(path.resolve('demo-snapshot'), DIR, { recursive: true });
  }
}
process.env.BOLD_DATA_DIR = DIR;
process.env.BOLD_STORAGE_DIR = DIR;
// Cada instância tem sua cópia do banco: a sessão precisa valer em qualquer uma (token assinado)
process.env.BOLD_STATELESS_SESSIONS = '1';
if (real) {
  // Segredos derivados da chave da base real: iguais em todas as instâncias, nunca no repositório
  const derive = (label) => Buffer.from(crypto.hkdfSync('sha256', key, Buffer.alloc(0), label, 32));
  process.env.BOLD_SESSION_SECRET ||= derive('bold-session').toString('base64url');
  process.env.BOLD_VAULT_KEY ||= derive('bold-vault').toString('base64');
} else {
  process.env.BOLD_DEMO = '1';
}

const { createApp } = await import('../server/index.js');
export default createApp();
