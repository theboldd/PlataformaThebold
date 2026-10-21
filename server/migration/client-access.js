// Prepara os acessos dos clientes a partir de dados reais (regra oficial 4). Idempotente.
// Uso: node server/migration/client-access.js
import { prepareClientAccess } from '../services/clientAccess.js';

const r = prepareClientAccess();
console.log(`Acessos criados (convite pendente): ${r.created.length}`);
for (const x of r.created) console.log(`  + ${x}`);
console.log(`E-mails para a equipe confirmar: ${r.candidates.length}`);
for (const x of r.candidates) console.log(`  ? ${x}`);
console.log(`Sem e-mail (acesso pendente, dados migrados normalmente): ${r.sem_email.length}`);
