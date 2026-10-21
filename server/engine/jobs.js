// Controle de execução das rotinas automáticas: trava com prazo (lease), timeout e registro de cada execução.
// - Se uma execução ainda está rodando (lease válido), a próxima é IGNORADA e registrada como tal — nunca roda em paralelo.
// - Se o processo morreu no meio, o lease vence e a próxima execução marca a anterior como EXPIRADA e segue.
// - O trabalho em si é idempotente: cada efeito usa um marcador em automation_runs (onceFor), então repetir não duplica nada.
// Horários: o servidor guarda tudo em UTC (ISO); regras de dia/semana usam America/Sao_Paulo explicitamente.
import { one, all, run, insert, uid, now, tx } from '../db.js';

const KEEP_DAYS = 30;

export async function runJob(job, fn, { timeoutMs = 50e3, trigger = 'interno', record = true } = {}) {
  const start = now();
  const id = uid('jr_');
  const got = tx(() => {
    const live = one("SELECT id, lease_until FROM job_runs WHERE job=? AND status='rodando' ORDER BY started_at DESC LIMIT 1", job);
    if (live && live.lease_until > start) return false;
    if (live) run("UPDATE job_runs SET status='expirado', finished_at=?, error='lease vencido (processo interrompido ou passou do tempo)' WHERE id=?", start, live.id);
    insert('job_runs', { id, job, status: 'rodando', started_at: start, lease_until: new Date(Date.now() + timeoutMs).toISOString(), trigger });
    return true;
  });
  if (!got) {
    if (record) insert('job_runs', { id, job, status: 'ignorado', started_at: start, finished_at: start, trigger, error: 'execução anterior ainda em andamento' });
    return { ok: false, skipped: true };
  }
  let timer;
  try {
    const result = await Promise.race([Promise.resolve().then(fn), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`timeout de ${Math.round(timeoutMs / 1000)}s`)), timeoutMs); })]);
    run("UPDATE job_runs SET status='ok', finished_at=?, lease_until=NULL, result=? WHERE id=?", now(), result == null ? null : JSON.stringify(result).slice(0, 2000), id);
    return { ok: true, result };
  } catch (e) {
    run("UPDATE job_runs SET status='erro', finished_at=?, lease_until=NULL, error=? WHERE id=?", now(), String(e.message || e).slice(0, 500), id);
    return { ok: false, error: e.message };
  } finally {
    clearTimeout(timer);
    // job_runs é controle técnico (não é histórico de negócio): mantém só 30 dias
    run('DELETE FROM job_runs WHERE started_at < ?', new Date(Date.now() - KEEP_DAYS * 864e5).toISOString());
  }
}

export const lastRuns = (limit = 40) => all('SELECT * FROM job_runs ORDER BY started_at DESC LIMIT ?', limit);
