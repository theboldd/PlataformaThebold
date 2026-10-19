// Vercel: a API inteira (Express) roda como uma função. Prévia com DADOS DE DEMONSTRAÇÃO (fictícios):
// o banco e as mídias de demo-snapshot/ são copiados para /tmp a cada instância nova — o que for alterado na
// prévia some quando a instância é reciclada. A base real (Notion) nunca vai para o repositório.
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.env.BOLD_DATA_DIR || '/tmp/bold';
if (!fs.existsSync(path.join(DIR, 'bold.db'))) fs.cpSync(path.resolve('demo-snapshot'), DIR, { recursive: true });
process.env.BOLD_DATA_DIR = DIR;
process.env.BOLD_STORAGE_DIR = DIR;

const { createApp } = await import('../server/index.js');
export default createApp();
