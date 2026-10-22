// CONFIGURAÇÕES → INTEGRAÇÕES → NOTION: mapa, estado real e controles da sincronização Notion → The Bold OS.
// Só leitura do Notion. Não há rota de escrita no Notion (THE BOLD OS → NOTION desativado por decisão da CEO).
import { Router } from 'express';
import { one, run, now } from '../db.js';
import { requireInternal, requirePerm } from '../lib/auth.js';
import { log } from '../lib/core.js';
import { HttpError } from '../lib/permissions.js';
import { seal, open } from '../integrations/vault.js';
import { syncMap, panelSummary, recentChanges, setSource, pollSource, verifyWebhook, handleWebhookEvent, STATES, STATUS_LABEL, ensureSources } from '../services/notion-sync.js';

export const notionSync = Router();
const view = [requireInternal, requirePerm('integracoes', 'view')];
const admin = [requireInternal, requirePerm('integracoes', 'admin')];

notionSync.get('/integracoes/notion', view, (_req, res) => {
  const groups = syncMap();
  const items = groups.flatMap((g) => g.items);
  const byState = Object.fromEntries(Object.keys(STATES).map((k) => [k, items.filter((i) => i.state === k).length]));
  res.json({ ...panelSummary(), states: STATES, status_labels: STATUS_LABEL, by_state: byState, total: items.length, groups });
});

notionSync.get('/integracoes/notion/alteracoes', view, (req, res) => res.json(recentChanges(req.query.status || null)));

// Ligar/desligar uma base na sincronização viva e a frequência do polling (só administradores)
notionSync.patch('/integracoes/notion/fontes/:key', admin, (req, res) => {
  ensureSources();
  const s = one('SELECT * FROM notion_sync_sources WHERE key=?', req.params.key);
  if (!s) throw new HttpError(404, 'Base não encontrada no mapa.');
  const patch = {};
  if (req.body.enabled != null) patch.enabled = req.body.enabled ? 1 : 0;
  if (req.body.interval_min != null) { const n = Number(req.body.interval_min); if (!(n >= 5 && n <= 1440)) throw new HttpError(422, 'Frequência entre 5 e 1440 minutos.'); patch.interval_min = n; }
  setSource(s.key, patch, req.user);
  log({ actor: req.user.id, action: 'notion.fonte.alterada', entity: 'notion_source', id: s.key, summary: `Notion → The Bold OS: “${s.label}” ${patch.enabled != null ? (patch.enabled ? 'ligada' : 'desligada') : ''}${patch.interval_min ? ` · a cada ${patch.interval_min} min` : ''}`, before: JSON.stringify({ enabled: s.enabled, interval_min: s.interval_min }), after: JSON.stringify(patch) });
  res.json(one('SELECT * FROM notion_sync_sources WHERE key=?', s.key));
});

// Sincronizar agora (uma base). Sem token: 412 BLOQUEADO — nada é simulado.
notionSync.post('/integracoes/notion/fontes/:key/sincronizar', admin, async (req, res) => {
  try { res.json(await pollSource(req.params.key, 'manual')); }
  catch (e) { throw new HttpError(e.status || 502, e.message); }
});

// Webhook oficial do Notion (público; CSRF isento pelo prefixo /api/integrations/webhooks/). Corpo bruto em req.rawBody.
notionSync.post('/integrations/webhooks/notion', async (req, res) => {
  const body = req.body || {};
  if (body.verification_token) { // passo de verificação da assinatura: guarda o token cifrado no cofre
    run("INSERT INTO settings (key, value, updated_at) VALUES ('notion.webhook', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at", seal({ token: body.verification_token }), now());
    log({ kind: 'integracao', action: 'notion.webhook.verificado', entity: 'integration', id: 'notion', summary: 'Webhook do Notion: token de verificação recebido e guardado cifrado.' });
    return res.json({ ok: true });
  }
  const stored = one("SELECT value FROM settings WHERE key='notion.webhook'")?.value;
  const token = stored ? open(stored)?.token : null;
  if (!verifyWebhook(req.rawBody || Buffer.from(JSON.stringify(body)), req.headers['x-notion-signature'], token)) throw new HttpError(401, 'Assinatura do Notion inválida.');
  res.json(await handleWebhookEvent(body));
});
