// MIGRAÇÃO DA BASE REAL — Notion (CRONOGRAMA → CLIENTES MKT / CLIENTES ADVS MKT + ESPAÇO CLIENTE → formulário "Sua marca")
// Lê o levantamento em storage/migration/notion/*.json (dados reais; fora do git) e grava na plataforma:
//   clientes (idempotente por notion_url) · Client Brain com procedência · respostas do onboarding · links/arquivos ·
//   equipe vinculada (_team_map.json) · inconsistências → migration_issues · relatório de validação (10 checagens).
// Regras: não inventa, não supõe, não resume, não migra calendários editoriais nem credenciais.
// Uso: BOLD_SEED=equipe node server/seed.js && node server/migration/import-notion.js
import fs from 'node:fs';
import path from 'node:path';
import { one, all, insert, run, uid, now, tx } from '../db.js';
import { log } from '../lib/core.js';
import { activeForm } from '../services/onboarding.js';
import { BRAIN_SECTIONS } from '../ai/memory.js';

const DIR = process.env.BOLD_MIGRATION_DIR || path.resolve('storage', 'migration', 'notion');
const REPORT = path.join(DIR, '..', 'relatorio-migracao.md');
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const ORIGINS = new Set(['onboarding_cliente', 'equipe', 'observacao_interna', 'indefinido']);

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
const read = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const teamMap = fs.existsSync(path.join(DIR, '_team_map.json')) ? JSON.parse(fs.readFileSync(path.join(DIR, '_team_map.json'), 'utf8')) : null;

const form = activeForm();
const questions = form.sections.flatMap((s) => s.questions.map((q) => ({ ...q, section_title: s.title, n: norm(q.text) })));
// Pergunta do formulário pelo texto (exato; senão o rótulo começa com a pergunta ou vice-versa)
const ALIASES = { 'pessoas que te inspiram': 'pos_universo_inspiracoes', 'quais musicas voce escuta': 'pos_mood_musicas' };
function matchQuestion(label) {
  const tries = [label, ...String(label || '').split(/\s+—\s+/).slice(1)].map(norm).filter(Boolean);
  for (const n of tries) {
    const q = questions.find((x) => x.n === n) || questions.find((x) => x.n.length > 20 && (n.startsWith(x.n) || x.n.startsWith(n)));
    if (q) return q;
    if (ALIASES[n]) return questions.find((x) => x.key === ALIASES[n]);
  }
  return null;
}

const users = all("SELECT id, name, functions FROM users WHERE role_key<>'cliente' AND active=1");
const userByFirst = (name) => {
  const n = norm(name).split(' ')[0];
  const hits = users.filter((u) => norm(u.name).split(' ')[0] === n);
  return hits.length === 1 ? hits[0] : null;
};

function issue(clientId, clientName, kind, description, source) {
  insert('migration_issues', { id: uid('mi_'), client_id: clientId, client_name: clientName, kind, description, source: source || 'notion', status: 'aberto', created_at: now() });
}

const report = { clients: [], bySection: {}, duplicates: [], unmatchedTeam: [], skippedCalendar: [], skippedInaccessible: [], outsideMain: [], totals: { fields: 0, empty: 0, answers: 0, entries: 0, links: 0, files: 0, issues: 0 } };

function importClient(file) {
  const d = read(file);
  if (!d.notion_url || !d.name) throw new Error(`${file}: sem nome ou notion_url`);
  const section = d.notion_section || null;
  (report.bySection[section] ||= []).push(d.name);
  const ts = now();
  return tx(() => {
    let c = one('SELECT * FROM clients WHERE notion_url=?', d.notion_url);
    if (c) {
      // Reimportação: substitui só o que veio do Notion; o que a equipe/cliente fez na plataforma permanece
      run("DELETE FROM client_brain_entries WHERE client_id=? AND source_type IN ('notion','notion_onboarding')", c.id);
      run("DELETE FROM onboarding_answers WHERE client_id=? AND source_type='notion'", c.id);
      run("DELETE FROM client_links WHERE client_id=? AND source_type='notion'", c.id);
      run("DELETE FROM migration_issues WHERE client_id=? AND source LIKE 'notion%' AND status='aberto'", c.id);
    } else {
      c = insert('clients', {
        id: uid('cl_'), name: d.name, handle: null, segment: null,
        status: d.status_hint === 'ativo' ? 'ativo' : 'a_confirmar', // sem status explícito no Notion → a equipe confirma
        services: '[]', color: null, started_at: null, requires_theme_approval: 1, monthly_posts: 0, created_at: ts, is_demo: 0,
        notion_url: d.notion_url, notion_section: section, aliases: JSON.stringify(d.aliases || []),
      });
      insert('projects', { id: uid('pj_'), client_id: c.id, name: 'Gestão de conteúdo recorrente', kind: 'recorrente', status: 'ativo', created_at: ts });
      for (const s of BRAIN_SECTIONS) insert('client_brain', { client_id: c.id, section: s, body: '', updated_at: ts });
      insert('channels', { id: uid('ch_'), kind: 'cliente', client_id: c.id, name: d.name, topic: 'Conversa oficial com o cliente', created_by: null, created_at: ts });
      insert('onboarding', { id: uid('ob_'), client_id: c.id, status: 'migrado', started_at: ts });
      if (d.status_hint !== 'ativo') issue(c.id, d.name, 'status', 'Status do cliente não está explícito no Notion — confirmar (ativo, pausado, encerrado).', 'notion');
    }

    const stats = { fields: 0, empty: 0, answers: 0, entries: 0, links: 0, files: 0, issues: 0, sections: {} };
    const answered = new Map(); // question_key → [{content, field}]
    for (const f of d.fields || []) {
      stats.fields++;
      const content = String(f.content ?? '').trim();
      if (!content) { stats.empty++; continue; }
      const origin = ORIGINS.has(f.origin) ? f.origin : 'indefinido';
      const sec = BRAIN_SECTIONS.includes(f.brain_section) ? f.brain_section : 'outro';
      if (!BRAIN_SECTIONS.includes(f.brain_section)) issue(c.id, d.name, 'campo_sem_secao', `Seção "${f.brain_section}" não existe no Client Brain — guardado em "outro": ${f.label}`, 'notion');
      const q = origin === 'onboarding_cliente' ? matchQuestion(f.label) : null;
      if (q) (answered.get(q.key) || answered.set(q.key, []).get(q.key)).push({ content, f });
      insert('client_brain_entries', {
        id: uid('be_'), client_id: c.id, section: sec, label: f.label || null, content, origin,
        source_type: q ? 'notion_onboarding' : 'notion', source_ref: q ? `onboarding:${q.key}` : f.source_url || d.notion_url,
        source_page: f.source_page || null, source_url: f.source_url || null, created_by: null, created_at: ts,
      });
      stats.entries++;
      stats.sections[sec] = (stats.sections[sec] || 0) + 1;
      if (f.source_page && f.source_page !== d.name) report.outsideMain.push(`${d.name} → ${f.source_page}`);
    }
    // Respostas do formulário oficial (o texto é preservado; respostas repetidas não são escolhidas — ficam registradas)
    for (const [key, list] of answered) {
      const q = questions.find((x) => x.key === key);
      if (one("SELECT 1 FROM onboarding_answers WHERE client_id=? AND question_key=? AND source_type<>'notion'", c.id, key)) {
        issue(c.id, d.name, 'conflito', `Pergunta "${q.text}" já respondida na plataforma; resposta do Notion mantida só no Client Brain.`, 'notion');
        continue;
      }
      const answer = list.length === 1 ? list[0].content : list.map((x, i) => `[${i + 1}] ${x.content}`).join('\n\n');
      if (list.length > 1) issue(c.id, d.name, 'resposta_multipla', `Pergunta "${q.text}" tem ${list.length} respostas no Notion (páginas: ${[...new Set(list.map((x) => x.f.source_page))].join(', ')}). Todas preservadas; revisar.`, 'notion');
      insert('onboarding_answers', { id: uid('oa_'), client_id: c.id, form_id: form.id, question_key: key, question_text: q.text, answer, origin: 'onboarding_cliente', source_type: 'notion', source_ref: list[0].f.source_url || d.notion_url, answered_by: null, answered_at: ts, updated_at: ts });
      stats.answers++;
    }
    if (stats.answers) run("UPDATE onboarding SET form_status='concluido', form_submitted_at=NULL WHERE client_id=? AND form_status<>'concluido'", c.id);

    for (const l of d.links || []) { if (!l.url) continue; insert('client_links', { id: uid('lk_'), client_id: c.id, label: l.label || null, url: l.url, kind: 'link', source_page: l.source_page || null, source_type: 'notion', created_at: ts }); stats.links++; }
    for (const a of d.files || []) {
      if (!a.url) continue;
      insert('client_links', { id: uid('lk_'), client_id: c.id, label: a.name || null, url: a.url, kind: 'arquivo', source_page: a.source_page || null, source_type: 'notion', created_at: ts });
      stats.files++;
    }
    if (stats.files) issue(c.id, d.name, 'arquivo_no_notion', `${stats.files} arquivo(s) continuam hospedados no Notion (referência registrada; baixar e enviar à biblioteca quando a integração de arquivos for ligada).`, 'notion');
    for (const txt of d.inconsistencies || []) { issue(c.id, d.name, 'inconsistencia', txt, 'notion'); stats.issues++; }
    for (const p of d.pages_skipped || []) {
      if (p.reason === 'calendário editorial') report.skippedCalendar.push(`${d.name} — ${p.title}`);
      else if (p.reason === 'inacessível') { report.skippedInaccessible.push(`${d.name} — ${p.title}`); issue(c.id, d.name, 'pagina_inacessivel', `Página/bloco não lido na migração: ${p.title}`, 'notion'); }
    }

    // Equipe vinculada (do mapa extraído do Notion; nomes ambíguos não são escolhidos)
    const members = teamMap?.clients?.[d.notion_url] || teamMap?.clients?.[d.name] || [];
    for (const m of members) {
      const u = userByFirst(m.person || m.name);
      if (!u || !m.function) { report.unmatchedTeam.push(`${d.name}: ${m.person || m.name} (${m.function || 'função?'})`); issue(c.id, d.name, 'equipe', `Vínculo não aplicado: "${m.person || m.name}" como ${m.function || '[função não informada]'}${m.source ? ` (fonte: ${m.source})` : ''}.`, 'notion'); continue; }
      run('INSERT OR IGNORE INTO client_members (client_id,user_id,function) VALUES (?,?,?)', c.id, u.id, m.function);
      run('INSERT OR IGNORE INTO channel_members (channel_id,user_id) VALUES ((SELECT id FROM channels WHERE client_id=? AND kind=?),?)', c.id, 'cliente', u.id);
    }

    log({ action: 'migracao.notion', entity: 'client', id: c.id, client: c.id, summary: `Ficha migrada do Notion (${section || 'seção?'}): ${stats.entries} informações, ${stats.answers} respostas do onboarding, ${stats.links + stats.files} links/arquivos`, after: d.notion_url });
    for (const k of Object.keys(report.totals)) report.totals[k] += stats[k] || 0;
    report.clients.push({ name: d.name, section, id: c.id, ...stats, visited: (d.pages_visited || []).length, members: members.length });
    return c;
  });
}

for (const f of files) importClient(f);

// Duplicados: mesmo nome normalizado ou alias compartilhado entre fichas diferentes
const real = all('SELECT id, name, aliases, notion_section FROM clients WHERE is_demo=0 AND notion_url IS NOT NULL');
const seen = new Map();
for (const c of real) for (const a of [c.name, ...JSON.parse(c.aliases || '[]')]) {
  const k = norm(a).replace(/\b(adv|advocacia|dra?|i)\b/g, '').trim();
  if (!k) continue;
  if (seen.has(k) && seen.get(k).id !== c.id) report.duplicates.push(`"${a}": ${seen.get(k).name} (${seen.get(k).notion_section}) × ${c.name} (${c.notion_section})`);
  else seen.set(k, c);
}
for (const dup of [...new Set(report.duplicates)]) issue(null, null, 'duplicado', `Possível cliente duplicado — ${dup}`, 'notion');

// ─── Relatório de validação ───
const list = (arr) => (arr.length ? arr.map((x) => `- ${x}`).join('\n') : '- nenhum');
const md = `# Relatório de migração — Notion → THE BOLD OS
Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · arquivos: ${files.length}

> Dados reais de clientes. Este arquivo fica em storage/ (fora do git).

## 1. Clientes em CLIENTES MKT (${(report.bySection['CLIENTES MKT'] || []).length})
${list(report.bySection['CLIENTES MKT'] || [])}

## 2. Clientes em CLIENTES ADVS MKT (${(report.bySection['CLIENTES ADVS MKT'] || []).length})
${list(report.bySection['CLIENTES ADVS MKT'] || [])}
${Object.keys(report.bySection).filter((s) => !['CLIENTES MKT', 'CLIENTES ADVS MKT'].includes(s)).map((s) => `\n### Outra seção: ${s}\n${list(report.bySection[s])}`).join('')}

## 3. Ficha na plataforma
| Cliente | Seção | Informações | Respostas do onboarding | Links | Arquivos | Vazios ignorados | Páginas lidas | Equipe |
|---|---|---|---|---|---|---|---|---|
${report.clients.map((c) => `| ${c.name.replace(/\|/g, "\\|")} | ${c.section} | ${c.entries} | ${c.answers}/${questions.length} | ${c.links} | ${c.files} | ${c.empty} | ${c.visited} | ${c.members} |`).join('\n')}

Todos os ${report.clients.length} clientes do levantamento têm ficha (verificado por notion_url: ${real.length} fichas reais no banco).

## 4. Informações migradas
${report.totals.entries} informações no Client Brain (com origem, página e link de origem), ${report.totals.answers} respostas do formulário "Sua marca", ${report.totals.links} links, ${report.totals.files} arquivos referenciados. Campos vazios no Notion não viraram texto inventado (${report.totals.empty} ignorados).

## 5. Duplicados
${list([...new Set(report.duplicates)])}

## 6. Informações conflitantes / inconsistências (para revisão — nenhuma versão foi escolhida)
${report.totals.issues} inconsistências registradas pelo levantamento. Lista completa: Configurações → Migração (tabela migration_issues).

## 7. Páginas/blocos não considerados (inacessíveis)
${list(report.skippedInaccessible)}

## 8. Informações fora da página principal (consolidadas na ficha)
${list([...new Set(report.outsideMain)])}

## 9. Dados sem campo correspondente
Nenhum descartado: seções novas criadas no Client Brain (${BRAIN_SECTIONS.join(', ')}); o que não coube em nenhuma foi para "outro". Credenciais (login/senha) não foram migradas — devem ser recadastradas pelo cliente no cofre ou substituídas por acesso via Meta Business.

## 10. Calendários editoriais — NÃO migrados
${list(report.skippedCalendar)}

## Equipe não vinculada (revisar)
${teamMap ? list(report.unmatchedTeam) : '- mapa de equipe ainda não disponível (_team_map.json)'}
`;
fs.writeFileSync(REPORT, md);
console.log(`Migrados ${report.clients.length} clientes · ${report.totals.entries} informações · ${report.totals.answers} respostas · ${one("SELECT COUNT(*) n FROM migration_issues WHERE status='aberto'").n} pontos de revisão`);
console.log(`Relatório: ${REPORT}`);
