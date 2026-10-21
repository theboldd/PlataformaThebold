// THE BOLD OS — servidor
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { db, one, run, insert } from './db.js';
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
import { markMigratedTasks, syncDelayReviews } from './services/delayReview.js';
import { review } from './routes/review.js';
import { clientOps } from './routes/client-ops.js';
import { reconcileMigratedForms } from './services/onboarding.js';

export function bootstrap() {
  for (const r of ROLE_DEFS) {
    const fresh = !one('SELECT 1 FROM roles WHERE key=?', r.key);
    run('INSERT OR IGNORE INTO roles (key,label,internal,dashboard,all_clients) VALUES (?,?,?,?,?)', r.key, r.label, r.internal ?? 1, r.dashboard, r.all_clients);
    if (fresh) for (const [m, acts] of Object.entries(r.perms)) for (const a of acts) run('INSERT OR IGNORE INTO role_permissions (role_key,module,action) VALUES (?,?,?)', r.key, m, a);
  }
  // Módulos criados depois da primeira instalação: semeia uma vez as permissões padrão dos roles existentes
  for (const mod of ['divisao', 'carteira', 'atrasos']) {
    const flag = `perm_seed:${mod}`;
    if (one('SELECT 1 FROM settings WHERE key=?', flag)) continue;
    for (const r of ROLE_DEFS) for (const a of r.perms[mod] || []) run('INSERT OR IGNORE INTO role_permissions (role_key,module,action) VALUES (?,?,?)', r.key, mod, a);
    run('INSERT INTO settings (key,value,updated_at) VALUES (?,?,?)', flag, 'true', new Date().toISOString());
  }
  seedAutomations();
  reconcileStageWindows(); // regra pronto ≠ disponível aplicada às tarefas que já existiam
  reconcileMigratedForms(); // onboarding migrado parcial não fica como "concluído"
  activateScheduledTasks();
  markMigratedTasks(); // tarefas herdadas da migração ficam fora da performance até serem classificadas
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
