// Base inicial: cria só a EQUIPE (nomes reais, primeiro nome; e-mails de acesso provisórios @thebold.demo).
// Não existe cliente, conteúdo ou texto de exemplo: os clientes vêm da migração do Notion (npm run base:real).
import fs from 'node:fs';
import path from 'node:path';

const STORAGE = path.resolve(process.env.BOLD_STORAGE_DIR || 'storage');
for (const f of ['bold.db', 'bold.db-wal', 'bold.db-shm']) fs.rmSync(path.join(STORAGE, f), { force: true });
for (const d of ['originals', 'derived', 'tmp']) fs.rmSync(path.join(STORAGE, d), { recursive: true, force: true });

const { insert, uid, now, setClock } = await import('./db.js');
const { bootstrap } = await import('./index.js');
const { hashPassword } = await import('./lib/auth.js');

bootstrap();
const PASSWORD = process.env.BOLD_TEAM_PASSWORD || process.env.BOLD_DEMO_PASSWORD || 'thebold2026';
const pw = hashPassword(PASSWORD);
const at = (iso) => setClock(`${iso}T10:00:00-03:00`);

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

setClock(null);
console.log(`Equipe criada (${TEAM.length} pessoas). Senha inicial: ${PASSWORD}`);
process.exit(0);
