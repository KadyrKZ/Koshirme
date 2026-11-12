import { currentUser } from './auth';
import { validFizmatStudent } from './student-connect';
import { finishStudent } from './finish-student';
import type { Env, EventRow, ExamRow, StudentRow, UserRow } from './types';
import { now, publicEvent, publicExam, publicStudent, sha256, studentExam } from './util';

export interface RoomSocket {
  send(value: string): void;
  close(code: number, reason: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}
export interface RoomState {
  getWebSockets(): RoomSocket[];
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: string): Promise<void>;
    setAlarm(due: number): Promise<void>;
  };
}

interface Attachment {
  kind: 'pending' | 'admin' | 'student' | 'replaced';
  id: string;
  role?: 'extension' | 'desktop';
  token?: string;
  tokenHash?: string;
}

export class RoomEngine {
  constructor(
    private state: RoomState,
    private env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const data = (await request.json()) as {
        exam_id: string;
        audience: 'admin' | 'student';
        session_id?: string;
        message: unknown;
        schedule?: boolean;
      };
      await this.state.storage.put('examId', data.exam_id);
      if (data.schedule) await this.state.storage.setAlarm(Date.now() + 5_000);
      if (data.audience === 'admin') await this.revalidateAdmins();
      this.broadcast(data.audience, data.message, data.session_id);
      return new Response(null, { status: 204 });
    }
    return new Response('Not found', { status: 404 });
  }

  private async revalidateAdmins() {
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as Attachment | null;
      if (attachment?.kind !== 'admin') continue;
      const user = attachment.token
        ? await currentUser(
            this.env,
            new Request('https://room/auth', {
              headers: { authorization: 'Bearer ' + attachment.token },
            }),
          )
        : null;
      const exam = await this.env.DB.prepare('SELECT owner_id FROM exams WHERE id=?')
        .bind(attachment.id)
        .first<{ owner_id: string }>();
      if (!user || !exam || (user.role !== 'admin' && user.id !== exam.owner_id))
        socket.close(4401, 'Session expired');
    }
  }
  private send(socket: RoomSocket, message: unknown) {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      socket.close(1011, 'Delivery failed');
    }
  }

  private broadcast(audience: 'admin' | 'student', message: unknown, sessionId?: string) {
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as Attachment | null;
      if (attachment?.kind === audience && (!sessionId || attachment.id === sessionId))
        this.send(socket, message);
    }
  }

  async webSocketMessage(socket: RoomSocket, raw: string | ArrayBuffer) {
    try {
      if (typeof raw !== 'string' || raw.length > 4096) throw new Error('Invalid frame');
      const data = JSON.parse(raw) as Record<string, unknown>;
      const attachment = socket.deserializeAttachment() as Attachment;
      if (attachment.kind === 'admin') await this.revalidateAdmins();
      if (attachment.kind === 'pending') {
        if (data.type !== 'auth' || typeof data.token !== 'string')
          throw new Error('Auth required');
        // The dashboard's established protocol sends no role field. Student
        // clients always identify themselves as extension or desktop.
        if (data.role === undefined || data.role === 'admin')
          await this.authenticateAdmin(socket, attachment.id, data.token);
        else if (data.role === 'extension' || data.role === 'desktop')
          await this.authenticateStudent(socket, attachment.id, data.token, data.role);
        else throw new Error('Invalid role');
        return;
      }
      if (data.type === 'ping' && attachment.kind === 'admin') this.send(socket, { type: 'pong' });
      if (data.type === 'heartbeat' && attachment.kind === 'student')
        await this.heartbeat(socket, attachment);
    } catch {
      socket.close(4401, 'Authentication or frame rejected');
    }
  }

  private async authenticateAdmin(socket: RoomSocket, examId: string, token: string) {
    const user = await currentUser(
      this.env,
      new Request('https://room/auth', { headers: { authorization: 'Bearer ' + token } }),
    );
    const exam = await this.env.DB.prepare('SELECT * FROM exams WHERE id=?')
      .bind(examId)
      .first<ExamRow>();
    if (!user || !exam || (user.role !== 'admin' && exam.owner_id !== user.id))
      throw new Error('Forbidden');
    socket.serializeAttachment({ kind: 'admin', id: examId, token } satisfies Attachment);
    await this.state.storage.put('examId', examId);
    const students = await this.env.DB.prepare(
      'SELECT * FROM student_sessions WHERE exam_id=? ORDER BY started_at',
    )
      .bind(examId)
      .all<StudentRow>();
    this.send(socket, {
      type: 'snapshot',
      exam: publicExam(exam),
      students: students.results.map(publicStudent),
    });
  }

  private async authenticateStudent(
    socket: RoomSocket,
    sessionId: string,
    token: string,
    role: 'extension' | 'desktop',
  ) {
    const student = await this.env.DB.prepare(
      'SELECT * FROM student_sessions WHERE id=? AND token_hash=?',
    )
      .bind(sessionId, await sha256(token))
      .first<StudentRow>();
    if (!student || !(await validFizmatStudent(this.env, student))) throw new Error('Forbidden');
    const exam = await this.env.DB.prepare('SELECT * FROM exams WHERE id=?')
      .bind(student.exam_id)
      .first<ExamRow>();
    if (!exam) throw new Error('Missing room');
    for (const candidate of this.state.getWebSockets()) {
      const current = candidate.deserializeAttachment() as Attachment | null;
      if (current?.kind === 'student' && current.id === sessionId && current.role === role) {
        if (student.ready && (exam.active || exam.paused)) {
          socket.close(4001, 'A client is already connected');
          return;
        }
        candidate.serializeAttachment({ ...current, kind: 'replaced' });
        candidate.close(4001, 'Connection replaced');
      }
    }
    socket.serializeAttachment({
      kind: 'student',
      id: sessionId,
      role,
      tokenHash: student.token_hash,
    } satisfies Attachment);
    await this.state.storage.put('examId', exam.id);
    await this.updateHeartbeat(student, role);
    this.send(socket, this.stateMessage(student, exam, 'heartbeat_ack'));
  }

  private stateMessage(student: StudentRow, exam: ExamRow, type = 'session_state') {
    return { type, session: publicStudent(student), exam: studentExam(exam), lease_seconds: 12 };
  }

  private async updateHeartbeat(student: StudentRow, role: 'extension' | 'desktop') {
    const timestamp = now();
    if (role === 'extension') {
      student.connected = 1;
      student.last_seen = timestamp;
      await this.env.DB.prepare('UPDATE student_sessions SET connected=1,last_seen=? WHERE id=?')
        .bind(timestamp, student.id)
        .run();
      this.broadcast('admin', { type: 'student_updated', student: publicStudent(student) });
    } else {
      student.desktop_last_seen = timestamp;
      await this.env.DB.prepare('UPDATE student_sessions SET desktop_last_seen=? WHERE id=?')
        .bind(timestamp, student.id)
        .run();
    }
  }

  private async heartbeat(socket: RoomSocket, attachment: Attachment) {
    const student = await this.env.DB.prepare('SELECT * FROM student_sessions WHERE id=?')
      .bind(attachment.id)
      .first<StudentRow>();
    if (
      !student ||
      student.finished_at ||
      !attachment.role ||
      (student.fizmat_user_id &&
        (attachment.tokenHash !== student.token_hash ||
          !(await validFizmatStudent(this.env, student))))
    )
      throw new Error('Session missing');
    const exam = await this.env.DB.prepare('SELECT * FROM exams WHERE id=?')
      .bind(student.exam_id)
      .first<ExamRow>();
    if (!exam) throw new Error('Room missing');
    await this.updateHeartbeat(student, attachment.role);
    this.send(socket, this.stateMessage(student, exam, 'heartbeat_ack'));
  }

  async webSocketClose(socket: RoomSocket, code = 1000) {
    const attachment = socket.deserializeAttachment() as Attachment | null;
    if (code === 1012 || attachment?.kind !== 'student') return;
    if (
      this.state.getWebSockets().some((candidate) => {
        const a = candidate.deserializeAttachment() as Attachment | null;
        return (
          candidate !== socket &&
          a?.kind === 'student' &&
          a.id === attachment.id &&
          a.role === attachment.role
        );
      })
    )
      return;
    const student = await this.env.DB.prepare('SELECT * FROM student_sessions WHERE id=?')
      .bind(attachment.id)
      .first<StudentRow>();
    if (!student || student.token_hash !== attachment.tokenHash) return;
    if (!student.ready) {
      if (attachment.role === 'extension')
        await this.env.DB.prepare('UPDATE student_sessions SET connected=0 WHERE id=? AND token_hash=?').bind(student.id,student.token_hash).run();
      else
        await this.env.DB.prepare('UPDATE student_sessions SET desktop_last_seen=NULL WHERE id=? AND token_hash=?').bind(student.id,student.token_hash).run();
      return;
    }
    const exam = await this.env.DB.prepare('SELECT * FROM exams WHERE id=?')
      .bind(student.exam_id)
      .first<ExamRow>();
    if (exam) await this.endDisconnected(student, exam, attachment.role + '_closed');
  }

  private async endDisconnected(student: StudentRow, exam: ExamRow, reason: string) {
    const ended = await finishStudent(this.env, student, exam, reason);
    if (!ended) return;
    const event: EventRow = {
      id: crypto.randomUUID(),
      student_session_id: student.id,
      event_type: 'STUDENT_DISCONNECTED',
      severity: 'high',
      current_url: null,
      timestamp: ended.finished_at!,
      screenshot_path: null,
      metadata: JSON.stringify({ reason, capture_status: 'unavailable', attempt_finished: true }),
    };
    ended.risk_score = Math.min(100, student.risk_score + 30);
    ended.violations_count = student.violations_count + 1;
    ended.last_event = event.event_type;
    await this.env.DB.batch([
      this.env.DB.prepare(
        'UPDATE student_sessions SET risk_score=?,violations_count=?,last_event=? WHERE id=?',
      ).bind(ended.risk_score, ended.violations_count, ended.last_event, student.id),
      this.env.DB.prepare(
        'INSERT INTO violation_events(id,student_session_id,event_type,severity,current_url,timestamp,screenshot_path,metadata) VALUES(?,?,?,?,?,?,?,?)',
      ).bind(
        event.id,
        student.id,
        event.event_type,
        event.severity,
        null,
        event.timestamp,
        null,
        event.metadata,
      ),
    ]);
    this.broadcast('admin', {
      type: 'event_created',
      event: publicEvent(event),
      student: publicStudent(ended),
    });
    this.broadcast('student', this.stateMessage(ended, exam), student.id);
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as Attachment | null;
      if (attachment?.kind === 'student' && attachment.id === student.id)
        socket.close(4401, 'Attempt finished');
    }
  }

  async alarm() {
    const examId = await this.state.storage.get<string>('examId');
    if (!examId) return;
    const exam = await this.env.DB.prepare('SELECT * FROM exams WHERE id=?')
      .bind(examId)
      .first<ExamRow>();
    if (!exam || (!exam.active && !exam.paused)) return;
    const cutoff = new Date(Date.now() - 12_000).toISOString();
    const stale = await this.env.DB.prepare(
      'SELECT * FROM student_sessions WHERE exam_id=? AND ready=1 AND finished_at IS NULL AND (connected=0 OR last_seen<? OR desktop_last_seen IS NULL OR desktop_last_seen<?)',
    )
      .bind(examId, cutoff, cutoff)
      .all<StudentRow>();
    for (const student of stale.results) {
      await this.endDisconnected(student, exam, 'client_heartbeat_timeout');
    }
    await this.state.storage.setAlarm(Date.now() + 2_000);
  }
}
