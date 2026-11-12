import type { Env, ExamRow, StudentRow } from './types';
import { now } from './util';
// Fizmat is written first: an interrupted cross-store update can only close access.
// Repeating the operation repairs Koshirme without changing the saved finish time.
export async function finishStudent(env: Env, student: StudentRow, exam: ExamRow, reason: string) {
  if (student.finished_at || !student.ready || (!exam.active && !exam.paused)) return null;
  const timestamp = now();
  if (student.fizmat_user_id && exam.fizmat_contest_id && env.FIZMAT_DB) {
    await env.FIZMAT_DB.batch([
      env.FIZMAT_DB.prepare(
        `INSERT OR IGNORE INTO contest_finishes(contest_id,user_id,finished_at)
        SELECT c.id,u.id,? FROM contests c JOIN users u ON u.id=?
        WHERE c.id=? AND c.koshirme_exam_id=? AND c.monitoring_enabled=1`,
      ).bind(
        timestamp,
        student.fizmat_user_id,
        exam.fizmat_contest_id,
        exam.id,
      ),
      env.FIZMAT_DB.prepare(
        'UPDATE sessions SET monitoring_contest_id=NULL WHERE user_id=? AND token_hash=? AND monitoring_contest_id=?',
      ).bind(student.fizmat_user_id, student.fizmat_session_hash, exam.fizmat_contest_id),
    ]);
  }
  return env.DB.prepare(
    `UPDATE student_sessions SET active=0,ready=0,connected=0,desktop_last_seen=NULL,
    finished_at=?,finish_reason=? WHERE id=? AND finished_at IS NULL RETURNING *`,
  )
    .bind(timestamp, reason, student.id)
    .first<StudentRow>();
}
