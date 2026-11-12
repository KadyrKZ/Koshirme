import type { Env, ExamRow, StudentRow } from './types';
import {
  error,
  json,
  now,
  publicStudent,
  randomToken,
  readJson,
  sha256,
  studentExam,
} from './util';

type Identity = { exam_id: string; user_id: string; session_hash: string };
// Linked contests need only the teacher's monitoring checkbox. The first ready
// student starts the room; a deliberate teacher pause is never undone here.
export async function startLinkedRoom(env: Env, exam: ExamRow): Promise<ExamRow> {
  if (!exam.fizmat_contest_id || exam.active || exam.paused || exam.finished_at) return exam;
  const started = await env.DB.prepare(
    `UPDATE exams SET active=1 WHERE id=?
    AND active=0 AND paused=0 AND finished_at IS NULL RETURNING *`,
  )
    .bind(exam.id)
    .first<ExamRow>();
  if (!started)
    return (
      (await env.DB.prepare('SELECT * FROM exams WHERE id=?').bind(exam.id).first<ExamRow>()) ||
      exam
    );
  await env.DB.prepare('UPDATE student_sessions SET active=1 WHERE exam_id=? AND ready=1')
    .bind(exam.id)
    .run();
  await env.ROOMS.getByName(exam.id).fetch('https://room/broadcast', {
    method: 'POST',
    body: JSON.stringify({
      exam_id: exam.id,
      audience: 'admin',
      schedule: true,
      message: { type: 'exam_updated', exam: studentExam(started) },
    }),
  });
  return started;
}
// Recheck the original login and contest access on redemption and every authenticated heartbeat.
export async function validFizmatStudent(env: Env, student: StudentRow): Promise<boolean> {
  if (!student.fizmat_user_id) return true;
  return !!(await source(env, {
    exam_id: student.exam_id,
    user_id: student.fizmat_user_id,
    session_hash: student.fizmat_session_hash || '',
  }));
}
async function source(env: Env, identity: Identity) {
  const exam = await env.DB.prepare('SELECT * FROM exams WHERE id=? AND finished_at IS NULL')
    .bind(identity.exam_id)
    .first<ExamRow>();
  if (!exam?.fizmat_contest_id || !env.FIZMAT_DB) return null;
  const user = await env.FIZMAT_DB.prepare(
    `SELECT u.id,u.name FROM users u
    JOIN sessions s ON s.user_id=u.id JOIN contests c ON c.id=?
    WHERE u.id=? AND u.role='student' AND u.active=1 AND u.deleted_at IS NULL
    AND s.token_hash=? AND s.expires_at>? AND c.deleted_at IS NULL
    AND c.status='published' AND c.monitoring_enabled=1 AND c.koshirme_exam_id=?
    AND (c.access_mode='open' OR EXISTS(SELECT 1 FROM contest_students cs WHERE cs.contest_id=c.id AND cs.user_id=u.id))`,
  )
    .bind(exam.fizmat_contest_id, identity.user_id, identity.session_hash, now(), exam.id)
    .first<{ id: string; name: string }>();
  return user ? { user, exam } : null;
}
export async function studentConnect(
  request: Request,
  env: Env,
  path: string,
): Promise<Response | null> {
  if (
    !['/api/fizmat/student-connect', '/api/fizmat/student-status', '/api/student/connect'].includes(
      path,
    )
  )
    return null;
  if (request.method !== 'POST') return error(405, 'POST required');
  if (
    path !== '/api/student/connect' &&
    (!env.FIZMAT_INTEGRATION_KEY ||
      request.headers.get('x-fizmat-key') !== env.FIZMAT_INTEGRATION_KEY)
  )
    return error(404, 'Not found');
  const body = await readJson(request);
  if (path === '/api/student/connect') {
    if (typeof body.ticket !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.ticket))
      return error(422, 'Invalid connection ticket');
    // DELETE RETURNING makes redemption single-use even with concurrent requests.
    const identity = await env.DB.prepare(
      'DELETE FROM student_launch_tickets WHERE token_hash=? AND expires_at>? RETURNING *',
    )
      .bind(await sha256(body.ticket), now())
      .first<Identity>();
    if (!identity) return error(410, 'Connection expired. Reopen the contest page.');
    const verified = await source(env, identity);
    if (!verified) return error(403, 'Contest access is no longer available');
    const existing = await env.DB.prepare(
      'SELECT * FROM student_sessions WHERE exam_id=? AND fizmat_user_id=?',
    )
      .bind(identity.exam_id, identity.user_id)
      .first<StudentRow>();
    if (typeof body.resumeToken === 'string') {
      if (
        !existing ||
        existing.token_hash !== (await sha256(body.resumeToken)) ||
        existing.fizmat_session_hash !== identity.session_hash
      )
        return error(409, 'A different contest is already connected');
      return json({
        session: publicStudent(existing),
        exam: studentExam(verified.exam),
        token: body.resumeToken,
        fizmat: { contest_id: verified.exam.fizmat_contest_id, user_id: identity.user_id },
      });
    }
    const token = randomToken();
    const student = await env.DB.prepare(
      `INSERT INTO student_sessions
      (id,exam_id,student_name,token_hash,connected,active,ready,started_at,last_seen,desktop_last_seen,risk_score,violations_count,last_event,fizmat_user_id,fizmat_session_hash)
      VALUES(?,?,?,?,0,0,0,?,?,NULL,0,0,NULL,?,?)
      ON CONFLICT(exam_id,fizmat_user_id) DO UPDATE SET student_name=excluded.student_name,
      token_hash=excluded.token_hash,connected=0,active=0,ready=0,last_seen=excluded.last_seen,
      desktop_last_seen=NULL,fizmat_session_hash=excluded.fizmat_session_hash RETURNING *`,
    )
      .bind(
        crypto.randomUUID(),
        identity.exam_id,
        verified.user.name,
        await sha256(token),
        now(),
        now(),
        identity.user_id,
        identity.session_hash,
      )
      .first<StudentRow>();
    await env.ROOMS.getByName(identity.exam_id).fetch('https://room/broadcast', {
      method: 'POST',
      body: JSON.stringify({
        exam_id: identity.exam_id,
        audience: 'admin',
        message: { type: 'student_updated', student: publicStudent(student!) },
      }),
    });
    return json({
      session: publicStudent(student!),
      exam: studentExam(verified.exam),
      token,
      fizmat: { contest_id: verified.exam.fizmat_contest_id, user_id: identity.user_id },
    });
  }
  if (
    typeof body.examId !== 'string' ||
    typeof body.userId !== 'string' ||
    typeof body.sessionHash !== 'string'
  )
    return error(422, 'Identity required');
  const identity = { exam_id: body.examId, user_id: body.userId, session_hash: body.sessionHash };
  const verified = await source(env, identity);
  if (!verified) return error(403, 'Contest access is no longer available');
  if (path === '/api/fizmat/student-status') {
    const student = await env.DB.prepare(
      'SELECT * FROM student_sessions WHERE exam_id=? AND fizmat_user_id=? AND fizmat_session_hash=?',
    )
      .bind(identity.exam_id, identity.user_id, identity.session_hash)
      .first<StudentRow>();
    const cutoff = Date.now() - 12000;
    const connected =
      !!student?.connected &&
      Date.parse(student.last_seen) > cutoff &&
      !!student.desktop_last_seen &&
      Date.parse(student.desktop_last_seen) > cutoff;
    return json({
      connected,
      ready: connected && !!student?.ready,
      active: connected && !!student?.ready && !!student.active && !!verified.exam.active,
    });
  }
  const ticket = randomToken();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM student_launch_tickets WHERE expires_at<?').bind(now()),
    env.DB.prepare(
      `INSERT INTO student_launch_tickets VALUES(?,?,?,?,?)
      ON CONFLICT(exam_id,user_id,session_hash) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at`,
    ).bind(
      await sha256(ticket),
      identity.exam_id,
      identity.user_id,
      identity.session_hash,
      new Date(Date.now() + 120000).toISOString(),
    ),
  ]);
  return json({ ticket, launchUrl: `koshirme://connect?ticket=${ticket}`, expiresIn: 120 });
}
