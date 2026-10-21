// THE BOLD OS — servidor
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { db, one, run, insert, uid } from './db.js';
import { log } from './lib/core.js';
import { loadUser, csrf } from './lib/auth.js';
import { ROLE_DEFS, HttpError, can } from './lib/permissions.js';
import { runJob, lastRuns } from './engine/jobs.js';
import { seedAutomations } from './engine/automations.js';
import { startScheduler, tick, reconcileStageWindows, activateScheduledTasks } from './engine/scheduler.js';
import { core } from './routes/core.js';
import { ops } from './routes/ops.js';
import { comms } from './routes/comms.js';
import { business, oauthCallback } from './routes/business.js';
import { portal } from './routes/portal.js';
import { ficha } from './routes/ficha.js';
import { pendencias } from './routes/pendencias.js';
import { divisao } from './routes/divisao.js';
import { atrasos } from './routes/atrasos.js';
import { produto } from './routes/produto.js';
import { editorial } from './routes/editorial.js';
import { markMigratedTasks, markLegacy, syncDelayReviews } from './services/delayReview.js';
import { review } from './routes/review.js';
import { clientOps } from './routes/client-ops.js';
import { reconcileMigratedForms } from './services/onboarding.js';

// Regra oficial 16: a própria The Bold fica na base como CLIENTE INTERNO (decisão da CEO, aplicada uma vez e registrada)
function classifyInternalClient() {
  if (one("SELECT 1 FROM settings WHERE key='cliente_interno_aplicado'")) return;
  const c = one("SELECT id, name, kind FROM clients WHERE upper(trim(name))='THE BOLD'");
  if (c && c.kind !== 'interno') {
    run("UPDATE clients SET kind='interno' WHERE id=?", c.id);
    log({ kind: 'sistema', action: 'cliente.classificado_interno', entity: 'client', id: c.id, client: c.id, origin: 'automatica', before: c.kind, after: 'interno',
      summary: 'THE BOLD classificada como CLIENTE INTERNO (decisão da CEO, regra oficial 16): fica fora das métricas de carteira, comerciais e de clientes externos' });
  }
  run('INSERT INTO settings (key,value,updated_at) VALUES (?,?,?)', 'cliente_interno_aplicado', JSON.stringify(c?.id || null), new Date().toISOString());
}

export function bootstrap() {
  for (const r of ROLE_DEFS) {
    const fresh = !one('SELECT 1 FROM roles WHERE key=?', r.key);
    run('INSERT OR IGNORE INTO roles (key,label,internal,dashboard,all_clients) VALUES (?,?,?,?,?)', r.key, r.label, r.internal ?? 1, r.dashboard, r.all_clients);
    if (fresh) for (const [m, acts] of Object.entries(r.perms)) for (const a of acts) run('INSERT OR IGNORE INTO role_permissions (role_key,module,action) VALUES (?,?,?)', r.key, m, a);
  }
  // Módulos criados depois da primeira instalação: semeia uma vez as permissões padrão dos roles existentes
  for (const mod of ['divisao', 'carteira', 'atrasos', 'performance']) {
    const flag = `perm_seed:${mod}`;
    if (one('SELECT 1 FROM settings WHERE key=?', flag)) continue;
    for (const r of ROLE_DEFS) for (const a of r.perms[mod] || []) run('INSERT OR IGNORE INTO role_permissions (role_key,module,action) VALUES (?,?,?)', r.key, mod, a);
    run('INSERT INTO settings (key,value,updated_at) VALUES (?,?,?)', flag, 'true', new Date().toISOString());
  }
  seedAutomations();
  // Decisão da The Bold (21/10/2026): a versão que resolve o ajuste do cliente volta para o cliente aprovar.
  // Aplica uma única vez sobre a configuração salva (se alguém tinha gravado "não reenviar") e registra no histórico.
  if (!one("SELECT 1 FROM settings WHERE key='decisao:v2_volta_cliente'")) {
    const prev = one("SELECT value FROM settings WHERE key='reenviar_cliente_apos_ajuste'");
    if (prev && prev.value !== 'true') {
      run("UPDATE settings SET value='true', updated_at=? WHERE key='reenviar_cliente_apos_ajuste'", new Date().toISOString());
      insert('activity_logs', { id: uid('log_'), actor_kind: 'sistema', action: 'configuracao.alterada', entity_type: 'settings', entity_id: 'reenviar_cliente_apos_ajuste', summary: 'Regra: a versão que resolve o ajuste do cliente volta para o cliente aprovar (decisão 21/10)', before: prev.value, after: 'true', origin: 'automatica', visibility: 'internal', created_at: new Date().toISOString() });
    }
    run("INSERT INTO settings (key,value,updated_at) VALUES ('decisao:v2_volta_cliente','true',?)", new Date().toISOString());
  }
  reconcileStageWindows(); // regra pronto ≠ disponível aplicada às tarefas que já existiam
  reconcileMigratedForms(); // onboarding migrado parcial não fica como "concluído"
  activateScheduledTasks();
  classifyInternalClient();
  markMigratedTasks(); // tarefas herdadas da migração ficam fora da performance até serem classificadas
  markLegacy(); // regra 22: itens herdados sem decisão = LEGADO — NÃO VALIDADO, fora da operação
  syncDelayReviews();
}

export function createApp() {
  bootstrap();
  const app = express();
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('referrer-policy', 'same-origin');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('content-security-policy', "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    next();
  });
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use(loadUser);
  app.use(csrf);
  // Rotina agendada chamada de fora (Vercel Cron, cron do servidor): o mesmo agendador do processo contínuo.
  // Protegida por CRON_SECRET (a Vercel envia "Authorization: Bearer <CRON_SECRET>").
  app.get('/api/cron/tick', (req, res) => {
    if (!process.env.CRON_SECRET) return res.status(503).json({ error: 'CRON_SECRET não configurado.' });
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Não autorizado.' });
    // Idempotente e com trava: se outra execução ainda estiver rodando, esta é ignorada (e registrada).
    runJob('tick', tick, { trigger: 'cron', timeoutMs: 50e3 }).then((r) => res.status(r.ok || r.skipped ? 200 : 500).json({ ...r, at: new Date().toISOString() }));
  });
  app.get('/api/cron/status', (req, res) => {
    if (!req.user || !can(req.user, 'automacoes')) return res.status(403).json({ error: 'Sem permissão.' });
    res.json(lastRuns());
  });
  app.get('/api/health', (_req, res) => res.json({ ok: true, db: !!one('SELECT 1 ok'), version: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null }));
  app.get('/api/integrations/:provider/callback', (req, res) => oauthCallback(req.params.provider, req, res));
  app.use('/api', core);
  app.use('/api/portal', portal);
  app.use('/api', comms);
  app.use('/api', review);
  app.use('/api', ficha);
  app.use('/api', pendencias);
  app.use('/api', divisao);
  app.use('/api', clientOps);
  app.use('/api', atrasos);
  app.use('/api', produto);
  app.use('/api', editorial);
  app.use('/api', ops);
  app.use('/api', business);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Rota não encontrada.')));

  const dist = path.resolve('web/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use((err, _req, res, _next) => {
    const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : err.code?.startsWith?.('LIMIT_') ? 400 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Erro interno. A equipe técnica foi notificada no log do servidor.' : err.message });
  });
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('server/index.js')) {
  const app = createApp();
  const port = Number(process.env.PORT) || 4000;
  app.listen(port, () => console.log(`THE BOLD OS em http://localhost:${port}`));
  if (process.env.BOLD_SCHEDULER !== 'off') startScheduler();
}
