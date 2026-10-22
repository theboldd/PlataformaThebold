// CALENDÁRIO EDITORIAL DO CLIENTE — opera sobre o modelo do The Bold OS (conteúdos, etapas, versões, aprovações).
// O Notion não é fonte aqui: o que veio de lá já está nos conteúdos, com a origem marcada; nada é lido nem escrito no Notion.
// Cada conteúdo é separado por FASE (derivada da etapa) e por SITUAÇÃO DA DATA (com data, sem data, já passada na migração).
import { Router } from 'express';
import { one, all, parseJSON } from '../db.js';
import { requireInternal, requirePerm } from '../lib/auth.js';
import { assertClient, HttpError, can } from '../lib/permissions.js';
import { STAGES } from '../engine/process.js';
import { contentCard } from './ops.js';

export const editorial = Router();

export const PHASES = [
  { key: 'planejado', label: 'Planejado', stages: ['cronograma', 'analise_cronograma', 'ajuste_cronograma', 'aprovacao_tema'] },
  { key: 'producao', label: 'Em produção', stages: ['producao', 'analise_producao', 'ajuste_interno', 'ajuste_cliente', 'revisao_ajuste'] },
  { key: 'aprovacao', label: 'Com o cliente para aprovar', stages: ['aprovacao_cliente'] },
  { key: 'aprovado', label: 'Para agendar', stages: ['agendamento'] }, // aprovado só quando há registro (approved_version_id)
  { key: 'agendado', label: 'Agendado', stages: ['agendado'] },
  { key: 'publicado', label: 'Publicado', stages: ['publicado'] },
  // regra 22: item legado não validado não é conteúdo operacional — fica num grupo à parte
  { key: 'legado', label: 'Legado do Notion · não validado', stages: [] },
];
const PHASE_OF = Object.fromEntries(PHASES.flatMap((p) => p.stages.map((s) => [s, p.key])));

function item(c, user) {
  const card = contentCard(c, user);
  const notes = c.internal_notes || '';
  const migrated = c.data_origin === 'notion';
  const notionPost = /Post citado no Notion:/.test(notes);
  const date = c.published_at || c.scheduled_at || c.planned_at || null;
  const live = all("SELECT t.function, t.status, u.name FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.content_id=? AND t.status IN ('aberta','em_andamento','agendada')", c.id);
  return {
    ...card,
    phase: ['nao_validado', 'historico'].includes(c.legacy_status) ? 'legado' : PHASE_OF[c.stage] || null, legacy_status: c.legacy_status || null,
    date, date_kind: c.published_at ? 'publicado' : c.scheduled_at ? 'agendado' : c.planned_at ? 'previsto' : null,
    date_source: !c.planned_at ? null : migrated && notionPost ? 'post do Notion' : migrated ? 'Notion' : 'plataforma',
    migrated, past_at_migration: migrated && !!c.planned_at && c.planned_at < c.created_at,
    approved: !!c.approved_version_id,
    deps: {
      material: c.material_status === 'aguardando' || (!!c.blocked && c.waiting_on === 'cliente') ? 'aguardando material do cliente' : c.material_status === 'recebido' ? 'material recebido' : null,
      approval: c.stage === 'aprovacao_tema' ? 'tema aguardando o cliente' : c.stage === 'aprovacao_cliente' ? 'aguardando aprovação do cliente' : null,
      blocked: c.blocked ? c.block_reason || 'bloqueado' : null,
      // etapa diz "aprovado", mas a plataforma não tem o registro da aprovação (ex.: veio da coluna "Para agendamento" do Notion)
      approval_missing: ['agendamento', 'agendado', 'publicado'].includes(c.stage) && !c.approved_version_id ? 'aprovação do cliente não registrada na plataforma' : null,
    },
    people: live.map((t) => ({ fn: t.function, name: t.name || 'sem responsável', scheduled: t.status === 'agendada' })),
    // Checks do calendário (como no Notion), só com REGISTRO na plataforma (regra 14):
    // tema = aprovação de tema registrada; arte e legenda = versão aprovada pelo cliente (a aprovação cobre arte + legenda daquela versão)
    checks: (() => {
      const tema = one("SELECT a.created_at, u.name FROM approvals a JOIN users u ON u.id=a.user_id WHERE a.content_id=? AND a.kind='tema' AND a.decision='aprovado' ORDER BY a.created_at DESC LIMIT 1", c.id);
      const ver = c.approved_version_id ? one("SELECT a.created_at, u.name, v.number FROM approvals a JOIN users u ON u.id=a.user_id LEFT JOIN content_versions v ON v.id=a.version_id WHERE a.content_id=? AND a.kind='cliente' AND a.decision='aprovado' AND a.version_id=? ORDER BY a.created_at DESC LIMIT 1", c.id, c.approved_version_id) : null;
      const rec = (r, extra = '') => (r ? { ok: true, by: r.name, at: r.created_at, note: extra } : { ok: false });
      return { tema: rec(tema), arte: rec(ver, ver?.number ? `V${ver.number}` : ''), legenda: rec(ver, ver?.number ? `V${ver.number}` : '') };
    })(),
    comments_n: one('SELECT COUNT(*) n FROM comments WHERE content_id=?', c.id).n,
    // Versão atual e legenda (o mesmo registro que o cliente vê no feed) e o vínculo com o card do Notion
    current: c.current_version_id ? one('SELECT number, caption, locked FROM content_versions WHERE id=?', c.current_version_id) : null,
    notion_link: (() => { const l = one('SELECT l.history_id, l.notion_url, h.properties FROM content_notion_links l LEFT JOIN notion_history h ON h.id=l.history_id WHERE l.content_id=?', c.id); return l ? { history_id: l.history_id, notion_url: l.notion_url, properties: parseJSON(l.properties, {}) } : null; })(),
    tags: parseJSON(c.strategy_tags, []),
    versions: one('SELECT COUNT(*) n FROM content_versions WHERE content_id=?', c.id).n,
    open_adjustments: one("SELECT COUNT(*) n FROM adjustments WHERE content_id=? AND status='aberto'", c.id).n,
  };
}

editorial.get('/clients/:id/editorial', requireInternal, requirePerm('conteudos', 'view'), (req, res) => {
  assertClient(req.user, req.params.id);
  const cl = one('SELECT id, name, handle FROM clients WHERE id=?', req.params.id);
  if (!cl) throw new HttpError(404, 'Cliente não encontrado.');
  const rows = all("SELECT * FROM contents WHERE client_id=? AND stage<>'cancelado' ORDER BY COALESCE(published_at, scheduled_at, planned_at) IS NULL, COALESCE(published_at, scheduled_at, planned_at), number", cl.id);
  const items = rows.map((c) => item(c, req.user));
  const n = (f) => items.filter(f).length;
  res.json({
    can: { create: can(req.user, 'conteudos', 'create'), edit: can(req.user, 'conteudos', 'edit') },
    client: cl, phases: PHASES.map(({ key, label, stages }) => ({ key, label, stages: stages.map((s) => ({ key: s, label: STAGES[s].label })), n: n((i) => i.phase === key) })),
    items,
    counts: {
      total: items.length, com_data: n((i) => i.date), sem_data: n((i) => !i.date), passada_na_migracao: n((i) => i.past_at_migration),
      migrados: n((i) => i.migrated), material: n((i) => i.deps.material === 'aguardando material do cliente'), aprovacao: n((i) => i.deps.approval), bloqueados: n((i) => i.deps.blocked), sem_registro_aprovacao: n((i) => i.deps.approval_missing),
      cancelados: one("SELECT COUNT(*) n FROM contents WHERE client_id=? AND stage='cancelado'", cl.id).n,
      com_midia: n((i) => i.thumb),
    },
    months: [...new Set(items.filter((i) => i.date).map((i) => i.date.slice(0, 7)))].sort(),
  });
});

// HISTÓRICO DO NOTION · SOMENTE LEITURA (regra oficial 15). Só GET: nada aqui é editável, nem vira tarefa/pendência/atraso.
editorial.get('/clients/:id/notion-history', requireInternal, requirePerm('conteudos', 'view'), (req, res) => {
  assertClient(req.user, req.params.id);
  // Linhas vazias ficam no banco (fidelidade à origem) e só aparecem com ?vazios=1 ("Mostrar registros vazios", desligado por padrão)
  const showEmpty = req.query.vazios === '1';
  const rows = all(`SELECT * FROM notion_history WHERE client_id=? ${showEmpty ? '' : 'AND empty=0'} ORDER BY date_start IS NULL, date_start DESC, title`, req.params.id)
    .map((r) => ({ ...r, properties: parseJSON(r.properties, {}) }));
  const empty = one('SELECT COUNT(*) n FROM notion_history WHERE client_id=? AND empty=1', req.params.id).n;
  res.json({ read_only: true, items: rows, empty_count: empty, showing_empty: showEmpty, by_source: all('SELECT source, COUNT(*) n FROM notion_history WHERE client_id=? GROUP BY source', req.params.id), sources: [...new Set(rows.map((r) => r.source_db_url).filter(Boolean))], extracted_at: rows[0]?.extracted_at || null });
});
