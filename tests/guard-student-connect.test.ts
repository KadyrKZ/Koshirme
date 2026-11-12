import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import {
  studentConnect,
  validFizmatStudent,
  startLinkedRoom,
} from '../apps/cloudflare/src/student-connect';
import { connectionTicket } from '../apps/student-desktop/src/services/deep-link';
import { sha256 } from '../apps/cloudflare/src/util';

function database() {
  const db = new DatabaseSync(':memory:');
  const d1 = {
    prepare(sql: string) {
      let args: any[] = [];
      const statement = {
        bind(...values: any[]) {
          args = values;
          return statement;
        },
        async first() {
          return db.prepare(sql).get(...args) || null;
        },
        async all() {
          return { results: db.prepare(sql).all(...args) };
        },
        async run() {
          return db.prepare(sql).run(...args);
        },
      };
      return statement;
    },
    async batch(statements: any[]) {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const s of statements) results.push(await s.run());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { db, d1 };
}
test('website tickets bind identity, expire, redeem once and require both live clients', async () => {
  const k = database(),
    f = database();
  try {
    const migrations = new URL('../apps/cloudflare/migrations/', import.meta.url);
    for (const name of readdirSync(migrations)
      .filter((n) => n.endsWith('.sql'))
      .sort())
      k.db.exec(readFileSync(new URL(name, migrations), 'utf8'));
    f.db.exec(`CREATE TABLE users(id TEXT,name TEXT,role TEXT,active INTEGER,deleted_at TEXT);
      CREATE TABLE sessions(user_id TEXT,token_hash TEXT,expires_at TEXT);
      CREATE TABLE contests(id TEXT,deleted_at TEXT,status TEXT,monitoring_enabled INTEGER,koshirme_exam_id TEXT,access_mode TEXT);
      CREATE TABLE contest_students(contest_id TEXT,user_id TEXT);
      CREATE TABLE contest_finishes(contest_id TEXT,user_id TEXT,finished_at TEXT);
      INSERT INTO users VALUES('u1','Same name','student',1,NULL),('u2','Same name','student',1,NULL);
      INSERT INTO sessions VALUES('u1','login1','2099-01-01'),('u2','login2','2099-01-01');
      INSERT INTO contests VALUES('contest',NULL,'published',1,'exam','closed');
      INSERT INTO contest_students VALUES('contest','u1');`);
    k.db
      .exec(`INSERT INTO users(id,email,name,password_hash,role,active,created_at) VALUES('teacher','t@example.org','Teacher','','teacher',1,'2026');
      INSERT INTO exams(id,owner_id,title,join_code,allowed_url,allowed_urls,created_at,active,paused,fizmat_contest_id)
      VALUES('exam','teacher','Contest','1234','https://fizmat.win/contest/12345','["https://fizmat.win/contest/12345"]','2026',0,0,'contest');`);
    const messages: any[] = [];
    const env: any = {
      DB: k.d1,
      FIZMAT_DB: f.d1,
      FIZMAT_INTEGRATION_KEY: 'private-key',
      ROOMS: {
        getByName: () => ({
          fetch: async (_url: string, init: any) => {
            messages.push(JSON.parse(init.body));
            return new Response(null, { status: 204 });
          },
        }),
      },
    };
    const call = async (path: string, body: any, key = 'private-key') =>
      (await studentConnect(
        new Request('https://koshirme.stream' + path, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-fizmat-key': key },
          body: JSON.stringify(body),
        }),
        env,
        path,
      ))!;
    const identity = { examId: 'exam', userId: 'u1', sessionHash: 'login1' };
    assert.equal((await call('/api/fizmat/student-connect', identity, 'wrong')).status, 404);
    assert.equal(
      (
        await call('/api/fizmat/student-connect', {
          ...identity,
          userId: 'u2',
          sessionHash: 'login2',
        })
      ).status,
      403,
    );
    const ticket = (await (await call('/api/fizmat/student-connect', identity)).json()) as any;
    assert.equal(connectionTicket(ticket.launchUrl), ticket.ticket);
    const replies = await Promise.all([
      call('/api/student/connect', { ticket: ticket.ticket }),
      call('/api/student/connect', { ticket: ticket.ticket }),
    ]);
    assert.deepEqual(replies.map((r) => r.status).sort(), [200, 410]);
    const joined = (await replies.find((r) => r.status === 200)!.json()) as any;
    assert.equal(joined.session.student_name, 'Same name');
    assert.equal(joined.fizmat.user_id, 'u1');
    assert.equal(joined.exam.allowed_url, 'https://fizmat.win/contest/12345');
    assert.equal(joined.session.fizmat_session_hash, undefined);
    assert.equal(messages[0].exam_id, 'exam');
    const state = () =>
      call('/api/fizmat/student-status', identity).then((r) => r.json()) as Promise<any>;
    assert.equal((await state()).ready, false);
    k.db
      .prepare('UPDATE student_sessions SET connected=1,ready=1,active=1,last_seen=?')
      .run(new Date().toISOString());
    const room = k.db.prepare('SELECT * FROM exams').get() as any;
    assert.equal((await startLinkedRoom(env, room)).active, 1);
    k.db.exec('UPDATE exams SET active=0,paused=1');
    assert.equal(
      (await startLinkedRoom(env, k.db.prepare('SELECT * FROM exams').get() as any)).active,
      0,
    );
    k.db.exec('UPDATE exams SET active=1,paused=0');
    assert.equal((await state()).active, false, 'extension alone must not mark the contest ready');
    k.db.prepare('UPDATE student_sessions SET desktop_last_seen=?').run(new Date().toISOString());
    assert.equal((await state()).active, true);
    const resume = (await (await call('/api/fizmat/student-connect', identity)).json()) as any;
    const resumed = (await (
      await call('/api/student/connect', { ticket: resume.ticket, resumeToken: joined.token })
    ).json()) as any;
    assert.equal(resumed.token, joined.token);
    assert.equal(resumed.session.ready, true);
    assert.equal(resumed.session.active, true);
    const replacement = (await (await call('/api/fizmat/student-connect', identity)).json()) as any;
    assert.equal((await call('/api/student/connect', { ticket: replacement.ticket })).status, 409);
    assert.equal(
      k.db.prepare("SELECT ready FROM student_sessions WHERE fizmat_user_id='u1'").get()!.ready,
      1,
    );

    f.db.exec("INSERT INTO contest_students VALUES('contest','u2')");
    const other = (await (
      await call('/api/fizmat/student-connect', {
        ...identity,
        userId: 'u2',
        sessionHash: 'login2',
      })
    ).json()) as any;
    const otherJoined = (await (
      await call('/api/student/connect', { ticket: other.ticket })
    ).json()) as any;
    assert.notEqual(
      otherJoined.session.id,
      joined.session.id,
      'identical names must not merge accounts',
    );
    assert.equal(otherJoined.session.student_name, joined.session.student_name);
    const next = (await (await call('/api/fizmat/student-connect', identity)).json()) as any;
    k.db.exec("UPDATE student_launch_tickets SET expires_at='2000-01-01'");
    assert.equal((await call('/api/student/connect', { ticket: next.ticket })).status, 410);
    const renewed = (await (await call('/api/fizmat/student-connect', identity)).json()) as any;
    f.db.exec("DELETE FROM sessions WHERE user_id='u1'");
    assert.equal((await call('/api/student/connect', { ticket: renewed.ticket })).status, 403);
    const student = k.db
      .prepare("SELECT * FROM student_sessions WHERE fizmat_user_id='u1'")
      .get() as any;
    assert.equal(await validFizmatStudent(env, student), false);
    assert.equal(student.token_hash, await sha256(joined.token));
  } finally {
    k.db.close();
    f.db.close();
  }
});
test('deep link rejects alternate hosts, extra parameters, credentials and malformed tickets', () => {
  const ticket = 'A'.repeat(43);
  for (const url of [
    `https://connect?ticket=${ticket}`,
    `koshirme://evil?ticket=${ticket}`,
    `koshirme://user@connect?ticket=${ticket}`,
    `koshirme://connect/path?ticket=${ticket}`,
    `koshirme://connect?ticket=${ticket}&backend=https://evil.test`,
    `koshirme://connect?ticket=${ticket}&ticket=${ticket}`,
    'koshirme://connect?ticket=1234',
  ])
    assert.equal(connectionTicket(url), null);
});
