// NOTION & HISTÓRICO — visão única de tudo o que veio do Notion (regras oficiais 15, 22, 23 e 24).
// Somente leitura: só conta o que está gravado na base; cada número vem de uma consulta própria e, se a tabela/coluna
// não existir, volta null (a tela mostra DADOS INSUFICIENTES) — nunca um número estimado.
// Nada aqui gera pendência, alerta, KPI ou performance. Sem sincronização com o Notion, por decisão.
import { Router } from 'express';
import { all, one } from '../db.js';
import { requireInternal, requirePerm } from '../lib/auth.js';
import { can, scopeSQL } from '../lib/permissions.js';

export const notion = Router();
const view = [requireInternal, requirePerm('clientes', 'view')];

// Cada consulta isolada: erro (tabela/coluna ausente) → null
const safe = (fn) => { try { return fn(); } catch { return null; } };
const count = (sql, ...p) => safe(() => one(sql, ...p)?.n ?? 0);
const groups = (sql, ...p) => safe(() => Object.fromEntries(all(sql, ...p).map((r) => [r.k ?? 'indefinido', r.n])));

// Fontes do Notion: o que foi importado e o que não foi, com o motivo (docs/09 §15 e docs/05).
// state: somente_leitura (importado, só leitura) · aguardando_decisao · nao_importado (motivo registrado) · nao_migrado (de propósito).
// Lista fixa e documental — os números ao vivo de cada fonte importada vêm de notion_history.source.
const SOURCES = [
  { key: 'clientes', label: 'Páginas dos clientes (Client Brain e onboarding)', state: 'somente_leitura', imported: true,
    note: 'Importado por exportação: Client Brain com procedência e respostas do onboarding. Cada entrada guarda a página de origem.' },
  { key: 'quadros', label: 'Quadros de produção (outubro e novembro)', state: 'somente_leitura', imported: true,
    note: 'Conteúdos e tarefas importados com origem Notion (data_origin=notion). Os herdados de “Para agendamento” viraram itens legados.' },
  { key: 'cr_editorial', label: 'CR EDITORIAL (calendário de cada cliente)', state: 'somente_leitura', imported: true,
    note: 'Calendário histórico importado somente para leitura. Linhas vazias ficam guardadas e ocultas por padrão.' },
  { key: 'cal_extras', label: 'Calendários extras (Tatiana, La Marca, THE BOLD)', state: 'somente_leitura', imported: true,
    note: 'Calendários equivalentes auditados, importados somente para leitura no histórico do cliente.' },
  { key: 'ocear_cronograma', label: 'Ocear — Cronograma editorial', state: 'aguardando_decisao', imported: false,
    note: 'PRECISA DE DECISÃO: registros da operação atual, não importados até a decisão de como entram.' },
  { key: 'ocear_datas', label: 'Ocear — “Datas”', state: 'nao_importado', imported: false, note: 'Não importado: não é calendário editorial.' },
  { key: 'ocear_stories', label: 'Ocear — stories', state: 'nao_importado', imported: false, note: 'Não importado: não é base editorial.' },
  { key: 'tatiana_stories', label: 'Tatiana — STORIES', state: 'nao_importado', imported: false, note: 'Não importado: fora do pedido da migração.' },
  { key: 'thebold_base', label: 'THE BOLD — base 3656…', state: 'nao_importado', imported: false, note: 'Não importado: base inacessível na exportação.' },
  { key: 'credenciais', label: 'Senhas e credenciais', state: 'nao_migrado', imported: false, on_purpose: true, note: 'Não migrado de propósito: acessos entram só pelo cofre cifrado da plataforma.' },
  { key: 'pautas', label: 'Banco de pautas', state: 'nao_migrado', imported: false, on_purpose: true, note: 'Não migrado de propósito.' },
  { key: 'ideias', label: 'Páginas de ideias', state: 'nao_migrado', imported: false, on_purpose: true, note: 'Não migrado de propósito.' },
  { key: 'anexos', label: 'Arquivos anexados no Notion', state: 'nao_migrado', imported: false, on_purpose: true, note: 'Não migrado de propósito: os casos ficam como pontos de revisão da migração.' },
  { key: 'sync', label: 'Sincronização / escrita no Notion', state: 'nao_migrado', imported: false, on_purpose: true, note: 'Nenhuma, por decisão. A plataforma não lê nem escreve no Notion em tempo real.' },
];

notion.get('/notion/overview', view, (req, res) => {
  const sc = scopeSQL(req.user, 'client_id');
  const scC = scopeSQL(req.user, 'c.id');
  const P = sc.params;

  const clients = {
    total: count(`SELECT COUNT(*) n FROM clients c WHERE ${scC.sql}`, ...scC.params),
    with_notion: count(`SELECT COUNT(*) n FROM clients c WHERE notion_url IS NOT NULL AND notion_url<>'' AND ${scC.sql}`, ...scC.params),
  };
  const brain = {
    total: count(`SELECT COUNT(*) n FROM client_brain_entries WHERE ${sc.sql}`, ...P),
    notion: count(`SELECT COUNT(*) n FROM client_brain_entries WHERE source_type='notion' AND ${sc.sql}`, ...P),
    by_source_type: groups(`SELECT source_type k, COUNT(*) n FROM client_brain_entries WHERE ${sc.sql} GROUP BY source_type`, ...P),
    by_origin: groups(`SELECT origin k, COUNT(*) n FROM client_brain_entries WHERE ${sc.sql} GROUP BY origin`, ...P),
  };
  const onboarding = {
    answers_total: count(`SELECT COUNT(*) n FROM onboarding_answers WHERE ${sc.sql}`, ...P),
    answers_notion: count(`SELECT COUNT(*) n FROM onboarding_answers WHERE source_type='notion' AND ${sc.sql}`, ...P),
    answers_by_source_type: groups(`SELECT source_type k, COUNT(*) n FROM onboarding_answers WHERE ${sc.sql} GROUP BY source_type`, ...P),
    form_status: groups(`SELECT form_status k, COUNT(*) n FROM onboarding WHERE ${sc.sql} GROUP BY form_status`, ...P),
  };
  const history = {
    total: count(`SELECT COUNT(*) n FROM notion_history WHERE ${sc.sql}`, ...P),
    visible: count(`SELECT COUNT(*) n FROM notion_history WHERE empty=0 AND ${sc.sql}`, ...P),
    empty_hidden: count(`SELECT COUNT(*) n FROM notion_history WHERE empty=1 AND ${sc.sql}`, ...P),
    clients: count(`SELECT COUNT(DISTINCT client_id) n FROM notion_history WHERE ${sc.sql}`, ...P),
    by_source: safe(() => all(`SELECT source, COUNT(*) n, SUM(CASE WHEN empty=1 THEN 1 ELSE 0 END) empty, COUNT(DISTINCT client_id) clients,
      MAX(extracted_at) extracted_at FROM notion_history WHERE ${sc.sql} GROUP BY source ORDER BY n DESC`, ...P)),
  };
  const origin = {
    contents: groups(`SELECT data_origin k, COUNT(*) n FROM contents WHERE ${sc.sql} GROUP BY data_origin`, ...P),
    tasks: groups(`SELECT data_origin k, COUNT(*) n FROM tasks WHERE ${sc.sql} GROUP BY data_origin`, ...P),
  };
  const legacy = {
    total: count(`SELECT COUNT(*) n FROM contents WHERE legacy_status IS NOT NULL AND ${sc.sql}`, ...P),
    by_status: groups(`SELECT legacy_status k, COUNT(*) n FROM contents WHERE legacy_status IS NOT NULL AND ${sc.sql} GROUP BY legacy_status`, ...P),
    can_review: can(req.user, 'atrasos', 'view'),
  };

  const perClient = safe(() => all(`SELECT c.id, c.name, c.notion_url, c.status,
      (SELECT COUNT(*) FROM client_brain_entries b WHERE b.client_id=c.id AND b.source_type='notion') brain,
      (SELECT COUNT(*) FROM onboarding_answers a WHERE a.client_id=c.id AND a.source_type='notion') answers,
      (SELECT form_status FROM onboarding o WHERE o.client_id=c.id) form_status,
      (SELECT COUNT(*) FROM notion_history h WHERE h.client_id=c.id AND h.empty=0) history,
      (SELECT COUNT(*) FROM contents x WHERE x.client_id=c.id AND x.legacy_status IS NOT NULL) legacy,
      (SELECT COUNT(*) FROM contents x WHERE x.client_id=c.id AND x.data_origin='notion') contents_notion
    FROM clients c WHERE ${scC.sql} ORDER BY c.name`, ...scC.params));

  const out = { state: 'somente_leitura', sync: { enabled: false, reason: 'Sem sincronização com o Notion, por decisão.' },
    clients, brain, onboarding, history, origin, legacy, sources: SOURCES, per_client: perClient };

  // Pontos de revisão da migração: mesmo gate de GET /migration-issues (clientes · admin)
  if (can(req.user, 'clientes', 'admin')) {
    out.migration = {
      open: count("SELECT COUNT(*) n FROM migration_issues WHERE status='aberto'"),
      by_status: groups('SELECT status k, COUNT(*) n FROM migration_issues GROUP BY status'),
      open_by_kind: groups("SELECT kind k, COUNT(*) n FROM migration_issues WHERE status='aberto' GROUP BY kind"),
    };
    if (perClient) {
      const byClient = groups("SELECT client_id k, COUNT(*) n FROM migration_issues WHERE status='aberto' GROUP BY client_id") || {};
      for (const c of perClient) c.issues_open = byClient[c.id] || 0;
    }
  }
  res.json(out);
});
