import { sharedLogin, fizmatUser, provision } from './fizmat';
import { studentConnect, validFizmatStudent, startLinkedRoom } from './student-connect';
import { normalizeAllowedUrl, EVENT_RULES, type EventType } from '@koshirme/protocol';
import {
  createLogin,
  currentUser,
  hashPassword,
  requireAdmin,
  requireUser,
  verifyPassword,
} from './auth';
import { ExamRoom } from './room';
import type { Env, EventRow, ExamRow, StudentRow, UserRow } from './types';
import {
  bearer,
  cleanUrl,
  error,
  json,
  now,
  publicEvent,
  publicExam,
  publicStudent,
  publicUser,
  randomToken,
  readJson,
  sha256,
  studentExam,
} from './util';

export { ExamRoom };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const eventTypes = new Set(Object.keys(EVENT_RULES));
const allowedMetadata = new Set(['source', 'reason', 'window_id', 'tab_id']);

const privacyPolicyHtml = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Политика конфиденциальности KOSH!RME</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #172033;
      background: #f6f8fb;
    }
    body {
      margin: 0;
      line-height: 1.65;
    }
    main {
      max-width: 860px;
      margin: 0 auto;
      padding: 48px 20px 72px;
    }
    article {
      background: #fff;
      border: 1px solid #e5e9f2;
      border-radius: 8px;
      padding: 36px;
      box-shadow: 0 16px 40px rgba(23, 32, 51, 0.08);
    }
    h1, h2 {
      line-height: 1.25;
      color: #101828;
    }
    h1 {
      margin: 0 0 8px;
      font-size: clamp(2rem, 4vw, 3rem);
    }
    h2 {
      margin-top: 32px;
      font-size: 1.2rem;
    }
    p, li {
      font-size: 1rem;
    }
    .muted {
      color: #60708a;
      margin-top: 0;
    }
    a {
      color: #175cd3;
    }
  </style>
</head>
<body>
  <main>
    <article>
      <h1>Политика конфиденциальности KOSH!RME</h1>
      <p class="muted">Дата вступления в силу: 22 сентября 2026 года</p>

      <p>KOSH!RME помогает школам и преподавателям проводить онлайн-экзамены с контролем соблюдения правил. Эта политика объясняет, какие данные обрабатываются веб-панелью, настольным приложением и расширением Chrome KOSH!RME.</p>

      <h2>Какие данные мы обрабатываем</h2>
      <ul>
        <li>Учетные данные преподавателей: имя, адрес электронной почты, роль и защищенный хэш пароля.</li>
        <li>Данные экзамена: название экзамена, разрешенные сайты, код подключения, состояние комнаты и время проведения.</li>
        <li>Данные сессии ученика: имя ученика, идентификатор сессии, состояние подключения и готовности.</li>
        <li>События мониторинга: переходы между вкладками, попытки открыть запрещенные страницы, попытки использовать контекстное меню, Google Lens, Gemini, ChatGPT или похожие инструменты, а также технические статусы соединения.</li>
        <li>Снимки экрана или окна могут сохраняться только в рамках экзамена, когда это необходимо для проверки нарушения или по запросу преподавателя.</li>
      </ul>

      <h2>Зачем нужны эти данные</h2>
      <p>Данные используются только для проведения экзамена, отображения состояния учеников преподавателю, фиксации нарушений правил экзамена и диагностики технических проблем. Мы не продаем данные, не используем их для рекламы и не передаем их третьим лицам для целей, не связанных с экзаменом.</p>

      <h2>Как работает расширение Chrome</h2>
      <p>Расширение проверяет активные вкладки и адреса страниц только во время подключенной экзаменационной сессии. Оно может блокировать запрещенные страницы, фиксировать попытки открыть контекстное меню, Google Lens или другие инструменты, которые не разрешены правилами экзамена. Расширение не читает пароли, платежные данные или личные сообщения.</p>

      <h2>Хранение и защита</h2>
      <p>Данные передаются по HTTPS и хранятся в инфраструктуре Cloudflare, используемой для сервиса KOSH!RME. Доступ к панели управления ограничен учетными записями администраторов и преподавателей. Снимки экрана и события экзамена должны храниться только столько, сколько нужно школе или организатору экзамена для проверки результатов и рассмотрения спорных ситуаций.</p>

      <h2>Удаление данных</h2>
      <p>Администратор или организатор экзамена может удалить завершенные тестовые комнаты и связанные с ними записи из панели управления. Для запроса на удаление данных или вопросов о конфиденциальности напишите на адрес: <a href="mailto:kadyr.mind2002@gmail.com">kadyr.mind2002@gmail.com</a>.</p>

      <h2>Изменения политики</h2>
      <p>При изменении функциональности KOSH!RME эта политика может быть обновлена. Актуальная версия всегда доступна на этой странице.</p>
    </article>
  </main>
</body>
</html>`;

function privacyPolicy(request: Request, path: string): Response | null {
  if (path !== '/privacy' || (request.method !== 'GET' && request.method !== 'HEAD')) return null;
  return new Response(request.method === 'HEAD' ? null : privacyPolicyHtml, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
    },
  });
}

async function broadcast(
  env: Env,
  examId: string,
  audience: 'admin' | 'student',
  message: unknown,
  sessionId?: string,
  schedule = false,
) {
  const stub = env.ROOMS.getByName(examId);
  await stub.fetch('https://room/broadcast', {
    method: 'POST',
    body: JSON.stringify({ exam_id: examId, audience, session_id: sessionId, message, schedule }),
  });
}

async function authorizedExam(env: Env, request: Request, examId: string) {
  const user = await requireUser(env, request);
  const exam = await env.DB.prepare('SELECT * FROM exams WHERE id=?').bind(examId).first<ExamRow>();
  if (!exam || (user.role !== 'admin' && exam.owner_id !== user.id))
    throw error(404, 'Room not found');
  return { user, exam };
}

async function studentAuth(env: Env, request: Request, sessionId: string) {
  const token = bearer(request);
  if (!token) throw error(401, 'Student token required');
  const student = await env.DB.prepare('SELECT * FROM student_sessions WHERE id=? AND token_hash=?')
    .bind(sessionId, await sha256(token))
    .first<StudentRow>();
  if (!student || !(await validFizmatStudent(env, student)))
    throw error(401, 'Invalid student session');
  return student;
}

async function accounts(request: Request, env: Env, path: string): Promise<Response | null> {
  if (path === '/api/fizmat/session' && request.method === 'POST') {
    if (
      !env.FIZMAT_INTEGRATION_KEY ||
      request.headers.get('x-fizmat-key') !== env.FIZMAT_INTEGRATION_KEY
    )
      return error(404, 'Not found');
    const body = await readJson(request);
    const source = typeof body.userId === 'string' ? await fizmatUser(env, body.userId) : null;
    if (!source) return error(401, 'Account not found');
    const user = await provision(env, source);
    await env.DB.prepare('DELETE FROM auth_sessions WHERE user_id=? AND expires_at<?')
      .bind(user.id, now())
      .run();
    const token = await createLogin(env, user.id);
    return json({ token, user: publicUser(user) });
  }
  if (path === '/api/fizmat/verify' && request.method === 'POST') {
    if (
      !env.FIZMAT_INTEGRATION_KEY ||
      request.headers.get('x-fizmat-key') !== env.FIZMAT_INTEGRATION_KEY
    )
      return error(404, 'Not found');
    const body = await readJson(request);
    const identifier = typeof body.login === 'string' ? body.login.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const matches = await env.DB.prepare(
      'SELECT * FROM users WHERE (lower(email)=? OR lower(name)=?) AND active=1 AND fizmat_user_id IS NULL LIMIT 2',
    )
      .bind(identifier, identifier)
      .all<UserRow>();
    const user = matches.results.length === 1 ? matches.results[0] : null;
    if (!user || !(await verifyPassword(password, user.password_hash)))
      return error(401, 'Invalid credentials');
    return json(publicUser(user));
  }
  if (path === '/api/bootstrap' && request.method === 'POST') {
    if (!env.BOOTSTRAP_TOKEN || bearer(request) !== env.BOOTSTRAP_TOKEN)
      return error(404, 'Not found');
    if (await env.DB.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").first())
      return error(409, 'Administrator already exists');
    const body = await readJson(request);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!emailPattern.test(email) || !name || password.length < 6 || password.length > 128)
      return error(422, 'Valid name, email and a 6-character password are required');
    const user: UserRow = {
      id: crypto.randomUUID(),
      email,
      name,
      password_hash: await hashPassword(password),
      role: 'admin',
      active: 1,
      created_at: now(),
    };
    await env.DB.prepare(
      'INSERT INTO users(id,email,name,password_hash,role,active,created_at) VALUES(?,?,?,?,?,?,?)',
    )
      .bind(user.id, user.email, user.name, user.password_hash, user.role, 1, user.created_at)
      .run();
    return json(publicUser(user), 201);
  }
  if (path === '/api/auth/login' && request.method === 'POST') {
    const body = await readJson(request);
    const identifier = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const attemptKey = await sha256(`${ip}\n${identifier}`);
    const windowStart = new Date(Date.now() - 5 * 60_000).toISOString();
    const attempts = await env.DB.prepare(
      'SELECT count,window_start FROM login_attempts WHERE key=?',
    )
      .bind(attemptKey)
      .first<{ count: number; window_start: string }>();
    if (attempts && attempts.window_start > windowStart && attempts.count >= 10)
      return error(429, 'Too many sign-in attempts. Try again in a few minutes');
    const matches = await env.DB.prepare(
      'SELECT * FROM users WHERE lower(email)=? OR lower(name)=? LIMIT 2',
    )
      .bind(identifier, identifier)
      .all<UserRow>();
    const shared = await sharedLogin(env, identifier, password);
    const legacy =
      matches.results.length === 1 && !matches.results[0]?.fizmat_user_id
        ? matches.results[0]
        : undefined;
    const user = shared.found ? shared.user : legacy;
    // Equal password work is performed even for an unknown account.
    const dummy =
      'pbkdf2$100000$MDAwMDAwMDAwMDAwMDAwMA$9JL9bRER0rmGUtBrFFNWF0I3LLPRBtygAyYhTs8XifE';
    if (
      !user?.active ||
      (!shared.found && !(await verifyPassword(password, user?.password_hash || dummy)))
    ) {
      const timestamp = now();
      await env.DB.prepare(
        `INSERT INTO login_attempts(key,count,window_start) VALUES(?,1,?)
        ON CONFLICT(key) DO UPDATE SET
          count=CASE WHEN window_start<? THEN 1 ELSE count+1 END,
          window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END`,
      )
        .bind(attemptKey, timestamp, windowStart, windowStart)
        .run();
      return error(401, 'Invalid name/email or password');
    }
    await env.DB.prepare('DELETE FROM login_attempts WHERE key=? OR window_start<?')
      .bind(attemptKey, new Date(Date.now() - 24 * 60 * 60_000).toISOString())
      .run();
    const token = await createLogin(env, user.id);
    return json({ token, user: publicUser(user) });
  }
  if (path === '/api/auth/me' && request.method === 'GET')
    return json(publicUser(await requireUser(env, request)));
  if (path === '/api/auth/logout' && request.method === 'POST') {
    const token = bearer(request);
    if (token)
      await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash=?')
        .bind(await sha256(token))
        .run();
    return json({ ok: true });
  }
  if (path === '/api/auth/password' && request.method === 'POST') {
    const user = await requireUser(env, request);
    const body = await readJson(request);
    const currentPassword = typeof body.current_password === 'string' ? body.current_password : '';
    const newPassword = typeof body.new_password === 'string' ? body.new_password : '';
    if (user.fizmat_user_id) {
      if (!env.FIZMAT || !env.FIZMAT_INTEGRATION_KEY)
        return error(503, 'Password service unavailable');
      const response = await env.FIZMAT.fetch('https://fizmat.win/api/integration/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-fizmat-key': env.FIZMAT_INTEGRATION_KEY },
        body: JSON.stringify({
          userId: user.fizmat_user_id,
          currentPassword,
          password: newPassword,
        }),
      });
      if (!response.ok)
        return error(response.status, 'Unable to update password: check the current password');
      const source = await fizmatUser(env, user.fizmat_user_id);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM auth_sessions WHERE user_id=? AND token_hash<>?').bind(
          user.id,
          await sha256(bearer(request)!),
        ),
        env.DB.prepare('UPDATE auth_sessions SET credential_version=? WHERE token_hash=?').bind(
          source ? await sha256(source.password_hash) : null,
          await sha256(bearer(request)!),
        ),
      ]);
      return json({ ok: true });
    }
    if (currentPassword.length < 6 || newPassword.length < 6 || newPassword.length > 128)
      return error(422, 'Both passwords must contain at least 6 characters');
    if (!(await verifyPassword(currentPassword, user.password_hash)))
      return error(401, 'Current password is incorrect');
    const token = bearer(request)!;
    const tokenHash = await sha256(token);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(
        await hashPassword(newPassword),
        user.id,
      ),
      env.DB.prepare('DELETE FROM auth_sessions WHERE user_id=? AND token_hash<>?').bind(
        user.id,
        tokenHash,
      ),
    ]);
    return json({ ok: true });
  }
  if (path === '/api/admin/teachers' && request.method === 'GET') {
    await requireAdmin(env, request);
    const rows = await env.DB.prepare(
      "SELECT * FROM users WHERE role='teacher' ORDER BY created_at DESC",
    ).all<UserRow>();
    return json(rows.results.map(publicUser));
  }
  if (path === '/api/admin/teachers' && request.method === 'POST') {
    await requireAdmin(env, request);
    const body = await readJson(request);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (
      !emailPattern.test(email) ||
      !name ||
      name.length > 120 ||
      password.length < 6 ||
      password.length > 128
    )
      return error(422, 'Valid name, email and a 6-character password are required');
    if (await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first())
      return error(409, 'An account with this email already exists');
    const user: UserRow = {
      id: crypto.randomUUID(),
      email,
      name,
      password_hash: await hashPassword(password),
      role: 'teacher',
      active: 1,
      created_at: now(),
    };
    await env.DB.prepare(
      'INSERT INTO users(id,email,name,password_hash,role,active,created_at) VALUES(?,?,?,?,?,?,?)',
    )
      .bind(user.id, user.email, user.name, user.password_hash, user.role, 1, user.created_at)
      .run();
    return json(publicUser(user), 201);
  }
  const statusMatch = path.match(/^\/api\/admin\/teachers\/([0-9a-f-]+)\/status$/);
  if (statusMatch?.[1] && request.method === 'POST') {
    await requireAdmin(env, request);
    const body = await readJson(request);
    if (typeof body.active !== 'boolean') return error(422, 'Boolean active is required');
    const mapped = await env.DB.prepare('SELECT fizmat_user_id FROM users WHERE id=?')
      .bind(statusMatch[1])
      .first<{ fizmat_user_id: string | null }>();
    if (mapped?.fizmat_user_id) return error(409, 'Manage this account in fizmat.win → Users');
    const result = await env.DB.batch([
      env.DB.prepare("UPDATE users SET active=? WHERE id=? AND role='teacher'").bind(
        body.active ? 1 : 0,
        statusMatch[1],
      ),
      ...(body.active
        ? []
        : [env.DB.prepare('DELETE FROM auth_sessions WHERE user_id=?').bind(statusMatch[1])]),
    ]);
    if (!result[0]?.meta.changes) return error(404, 'Teacher not found');
    const user = await env.DB.prepare('SELECT * FROM users WHERE id=?')
      .bind(statusMatch[1])
      .first<UserRow>();
    return json(publicUser(user!));
  }
  return null;
}

async function rooms(request: Request, env: Env, path: string): Promise<Response | null> {
  if (path === '/api/exams' && request.method === 'GET') {
    const user = await requireUser(env, request);
    const result =
      user.role === 'admin'
        ? await env.DB.prepare('SELECT * FROM exams ORDER BY created_at DESC').all<ExamRow>()
        : await env.DB.prepare('SELECT * FROM exams WHERE owner_id=? ORDER BY created_at DESC')
            .bind(user.id)
            .all<ExamRow>();
    return json(result.results.map(publicExam));
  }
  if (path === '/api/exams' && request.method === 'POST') {
    const user = await requireUser(env, request);
    const body = await readJson(request);
    const externalId = typeof body.fizmat_contest_id === 'string' ? body.fizmat_contest_id : null;
    if (
      externalId &&
      (!env.FIZMAT_INTEGRATION_KEY ||
        request.headers.get('x-fizmat-key') !== env.FIZMAT_INTEGRATION_KEY)
    )
      return error(403, 'Linked rooms are created by Fizmat');
    if (externalId && (!user.fizmat_user_id || !/^[0-9a-f-]{36}$/.test(externalId)))
      return error(403, 'Linked contest requires a Fizmat account');
    if (externalId) {
      const existing = await env.DB.prepare('SELECT * FROM exams WHERE fizmat_contest_id=?')
        .bind(externalId)
        .first<ExamRow>();
      if (existing?.finished_at) return error(409, 'Your attempt has finished');
    if (existing) {
        if (user.role !== 'admin' && existing.owner_id !== user.id)
          return error(404, 'Room not found');
        return json(publicExam(existing));
      }
    }
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const requestedUrls = Array.isArray(body.allowed_urls) ? body.allowed_urls : [body.allowed_url];
    const allowedUrls = requestedUrls
      .map(normalizeAllowedUrl)
      .filter((value): value is string => !!value);
    const uniqueUrls = [...new Set(allowedUrls)];
    if (
      !title ||
      title.length > 200 ||
      uniqueUrls.length < 1 ||
      uniqueUrls.length > 3 ||
      requestedUrls.length > 3 ||
      allowedUrls.length !== requestedUrls.length
    )
      return error(422, 'Provide a title and one to three complete HTTPS URLs');
    let code = '';
    for (let attempt = 0; attempt < 100; attempt++) {
      code = String(crypto.getRandomValues(new Uint16Array(1))[0]! % 10000).padStart(4, '0');
      if (
        !(await env.DB.prepare('SELECT id FROM exams WHERE join_code=? AND finished_at IS NULL')
          .bind(code)
          .first())
      )
        break;
      code = '';
    }
    if (!code) return error(503, 'No room code is currently available');
    if (
      body.start_time != null &&
      (typeof body.start_time !== 'string' || !Number.isFinite(Date.parse(body.start_time)))
    )
      return error(422, 'Planned start must be a valid date');
    const exam: ExamRow = {
      id: crypto.randomUUID(),
      owner_id: user.id,
      title,
      join_code: code,
      allowed_url: uniqueUrls[0]!,
      allowed_urls: JSON.stringify(uniqueUrls),
      created_at: now(),
      start_time: typeof body.start_time === 'string' ? body.start_time : null,
      finished_at: null,
      active: 0,
      paused: 0,
    };
    await env.DB.prepare(
      `INSERT INTO exams
      (id,owner_id,title,join_code,allowed_url,allowed_urls,created_at,start_time,finished_at,active,paused,fizmat_contest_id)
      VALUES(?,?,?,?,?,?,?,?,?,0,0,?) ON CONFLICT DO NOTHING`,
    )
      .bind(
        exam.id,
        exam.owner_id,
        exam.title,
        exam.join_code,
        exam.allowed_url,
        exam.allowed_urls,
        exam.created_at,
        exam.start_time,
        null,
        externalId,
      )
      .run();
    if (externalId) {
      const linked = await env.DB.prepare('SELECT * FROM exams WHERE fizmat_contest_id=?')
        .bind(externalId)
        .first<ExamRow>();
      if (linked) return json(publicExam(linked), 201);
    }
    return json(publicExam(exam), 201);
  }
  const examMatch = path.match(/^\/api\/exams\/([0-9a-f-]+)$/);
  if (examMatch?.[1] && request.method === 'GET') {
    const { exam } = await authorizedExam(env, request, examMatch[1]);
    return json(publicExam(exam));
  }
  if (examMatch?.[1] && request.method === 'DELETE') {
    const { exam } = await authorizedExam(env, request, examMatch[1]);
    if (exam.active) return error(409, 'Pause or finish the room before deleting it');
    exam.active = 0;
    exam.paused = 0;
    exam.finished_at ||= now();
    await env.DB.batch([
      env.DB.prepare('UPDATE exams SET active=0,paused=0,finished_at=? WHERE id=?').bind(
        exam.finished_at,
        exam.id,
      ),
      env.DB.prepare('UPDATE student_sessions SET active=0,ready=0 WHERE exam_id=?').bind(exam.id),
    ]);
    if (exam.fizmat_contest_id && env.FIZMAT_DB)
      await env.FIZMAT_DB.prepare(
        'UPDATE sessions SET monitoring_contest_id=NULL WHERE monitoring_contest_id=?',
      )
        .bind(exam.fizmat_contest_id)
        .run();
    const students = await env.DB.prepare('SELECT * FROM student_sessions WHERE exam_id=?')
      .bind(exam.id)
      .all<StudentRow>();
    for (const student of students.results)
      await broadcast(
        env,
        exam.id,
        'student',
        {
          type: 'session_state',
          session: publicStudent(student),
          exam: studentExam(exam),
          lease_seconds: 12,
        },
        student.id,
      );
    await broadcast(env, exam.id, 'admin', { type: 'exam_updated', exam: publicExam(exam) });
    const images = await env.DB.prepare(
      `SELECT e.screenshot_path FROM violation_events e
      JOIN student_sessions s ON s.id=e.student_session_id
      WHERE s.exam_id=? AND e.screenshot_path IS NOT NULL`,
    )
      .bind(exam.id)
      .all<{ screenshot_path: string }>();
    await env.DB.batch([
      env.DB.prepare(
        'DELETE FROM violation_events WHERE student_session_id IN (SELECT id FROM student_sessions WHERE exam_id=?)',
      ).bind(exam.id),
      env.DB.prepare('DELETE FROM student_sessions WHERE exam_id=?').bind(exam.id),
      env.DB.prepare('DELETE FROM exams WHERE id=?').bind(exam.id),
    ]);
    await Promise.all(
      images.results.map(({ screenshot_path }) => env.SCREENSHOTS.delete(screenshot_path)),
    );
    return new Response(null, { status: 204 });
  }
  const studentsMatch = path.match(/^\/api\/exams\/([0-9a-f-]+)\/students$/);
  if (studentsMatch?.[1] && request.method === 'GET') {
    await authorizedExam(env, request, studentsMatch[1]);
    const result = await env.DB.prepare(
      'SELECT * FROM student_sessions WHERE exam_id=? ORDER BY started_at',
    )
      .bind(studentsMatch[1])
      .all<StudentRow>();
    return json(result.results.map(publicStudent));
  }
  const actionMatch = path.match(/^\/api\/exams\/([0-9a-f-]+)\/(start|pause|finish)$/);
  if (actionMatch?.[1] && actionMatch[2] && request.method === 'POST') {
    const { exam } = await authorizedExam(env, request, actionMatch[1]);
    if (actionMatch[2] === 'start') {
      if (exam.finished_at) return error(409, 'A finished room cannot be restarted');
      exam.active = 1;
      exam.paused = 0;
      await env.DB.batch([
        env.DB.prepare('UPDATE exams SET active=1,paused=0 WHERE id=?').bind(exam.id),
        env.DB.prepare('UPDATE student_sessions SET active=1 WHERE exam_id=? AND ready=1 AND finished_at IS NULL').bind(
          exam.id,
        ),
      ]);
    } else if (actionMatch[2] === 'pause') {
      if (exam.finished_at) return error(409, 'The room has finished');
      exam.active = 0;
      exam.paused = 1;
      await env.DB.batch([
        env.DB.prepare('UPDATE exams SET active=0,paused=1 WHERE id=?').bind(exam.id),
        env.DB.prepare('UPDATE student_sessions SET active=0 WHERE exam_id=?').bind(exam.id),
      ]);
    } else {
      exam.active = 0;
      exam.paused = 0;
      exam.finished_at ||= now();
      await env.DB.batch([
        env.DB.prepare('UPDATE exams SET active=0,paused=0,finished_at=? WHERE id=?').bind(
          exam.finished_at,
          exam.id,
        ),
        env.DB.prepare('UPDATE student_sessions SET active=0,ready=0 WHERE exam_id=?').bind(
          exam.id,
        ),
      ]);
    }
    if (actionMatch[2] === 'finish' && exam.fizmat_contest_id && env.FIZMAT_DB)
      await env.FIZMAT_DB.prepare(
        'UPDATE sessions SET monitoring_contest_id=NULL WHERE monitoring_contest_id=?',
      )
        .bind(exam.fizmat_contest_id)
        .run();
    const students = await env.DB.prepare('SELECT * FROM student_sessions WHERE exam_id=?')
      .bind(exam.id)
      .all<StudentRow>();
    await broadcast(
      env,
      exam.id,
      'admin',
      { type: 'exam_updated', exam: publicExam(exam) },
      undefined,
      !!exam.active,
    );
    for (const student of students.results) {
      if (actionMatch[2] === 'finish') student.ready = 0;
      student.active = exam.active && student.ready ? 1 : 0;
      await broadcast(
        env,
        exam.id,
        'student',
        {
          type: 'session_state',
          session: publicStudent(student),
          exam: studentExam(exam),
          lease_seconds: 12,
        },
        student.id,
      );
      await broadcast(env, exam.id, 'admin', {
        type: 'student_updated',
        student: publicStudent(student),
      });
    }
    return json(publicExam(exam));
  }
  return null;
}

async function students(request: Request, env: Env, path: string): Promise<Response | null> {
  if (path === '/api/student/join' && request.method === 'POST') {
    const body = await readJson(request);
    const name = typeof body.student_name === 'string' ? body.student_name.trim() : '';
    const code = typeof body.join_code === 'string' ? body.join_code : '';
    if (!name || name.length > 120 || !/^\d{4}$/.test(code))
      return error(422, 'Name and four-digit room code are required');
    const exam = await env.DB.prepare(
      'SELECT * FROM exams WHERE join_code=? AND finished_at IS NULL ORDER BY created_at DESC LIMIT 1',
    )
      .bind(code)
      .first<ExamRow>();
    if (!exam) return error(404, 'Room code not found');
    const existing = await env.DB.prepare(
      'SELECT * FROM student_sessions WHERE exam_id=? AND student_name=? AND fizmat_user_id IS NULL ORDER BY started_at DESC LIMIT 1',
    )
      .bind(exam.id, name)
      .first<StudentRow>();
    const token = randomToken();
    if (existing) {
      existing.token_hash = await sha256(token);
      existing.connected = 0;
      existing.last_seen = now();
      if (!exam.active) {
        existing.active = 0;
        existing.ready = 0;
      }
      await env.DB.prepare(
        'UPDATE student_sessions SET token_hash=?,connected=0,last_seen=?,active=?,ready=? WHERE id=?',
      )
        .bind(existing.token_hash, existing.last_seen, existing.active, existing.ready, existing.id)
        .run();
      const event = exam.active
        ? {
            id: crypto.randomUUID(),
            student_session_id: existing.id,
            event_type: 'STUDENT_RECONNECTED',
            severity: 'info',
            current_url: null,
            timestamp: now(),
            screenshot_path: null,
            metadata: JSON.stringify({ reason: 'session_rejoin' }),
          }
        : null;
      if (event) {
        await env.DB.prepare(
          'INSERT INTO violation_events (id,student_session_id,event_type,severity,current_url,timestamp,screenshot_path,metadata) VALUES(?,?,?,?,?,?,?,?)',
        )
          .bind(
            event.id,
            event.student_session_id,
            event.event_type,
            event.severity,
            null,
            event.timestamp,
            null,
            event.metadata,
          )
          .run();
        await broadcast(env, exam.id, 'admin', {
          type: 'event_created',
          event: publicEvent(event),
          student: publicStudent(existing),
        });
      } else
        await broadcast(env, exam.id, 'admin', {
          type: 'student_updated',
          student: publicStudent(existing),
        });
      return json({ session: publicStudent(existing), exam: studentExam(exam), token });
    }
    if (exam.active || exam.paused) return error(409, 'This room has already started');
    const timestamp = now();
    const student: StudentRow = {
      id: crypto.randomUUID(),
      exam_id: exam.id,
      student_name: name,
      token_hash: await sha256(token),
      connected: 0,
      active: 0,
      ready: 0,
      started_at: timestamp,
      last_seen: timestamp,
      desktop_last_seen: null,
      risk_score: 0,
      violations_count: 0,
      last_event: null,
    };
    await env.DB.prepare(
      `INSERT INTO student_sessions
      (id,exam_id,student_name,token_hash,connected,active,ready,started_at,last_seen,desktop_last_seen,risk_score,violations_count,last_event)
      VALUES(?,?,?,?,0,0,0,?,?,NULL,0,0,NULL)`,
    )
      .bind(
        student.id,
        student.exam_id,
        student.student_name,
        student.token_hash,
        timestamp,
        timestamp,
      )
      .run();
    await broadcast(env, exam.id, 'admin', {
      type: 'student_updated',
      student: publicStudent(student),
    });
    return json({ session: publicStudent(student), exam: studentExam(exam), token }, 201);
  }
  const stateMatch = path.match(/^\/api\/student\/sessions\/([0-9a-f-]+)$/);
  if (stateMatch?.[1] && request.method === 'GET') {
    const student = await studentAuth(env, request, stateMatch[1]);
    const exam = await env.DB.prepare('SELECT * FROM exams WHERE id=?')
      .bind(student.exam_id)
      .first<ExamRow>();
    return json({
      type: 'session_state',
      session: publicStudent(student),
      exam: studentExam(exam!),
      lease_seconds: 12,
    });
  }
  const actionMatch = path.match(/^\/api\/student\/sessions\/([0-9a-f-]+)\/(ready|start|stop)$/);
  if (actionMatch?.[1] && actionMatch[2] && request.method === 'POST') {
    const student = await studentAuth(env, request, actionMatch[1]);
    const exam = await env.DB.prepare('SELECT * FROM exams WHERE id=?')
      .bind(student.exam_id)
      .first<ExamRow>();
    if (!exam || exam.finished_at) return error(409, 'The room has finished');
    if (actionMatch[2] === 'stop') {
      return error(403, 'Only the teacher can stop monitoring');
    } else {
      const cutoff = Date.now() - 10_000;
      if (!student.connected || Date.parse(student.last_seen) < cutoff)
        return error(409, 'Chrome extension is not connected');
      if (!student.desktop_last_seen || Date.parse(student.desktop_last_seen) < cutoff)
        return error(409, 'Desktop Guard is not connected');
      if (student.fizmat_user_id) Object.assign(exam, await startLinkedRoom(env, exam));
      student.ready = 1;
      student.active = exam.active ? 1 : 0;
      const updated = await env.DB.prepare(`UPDATE student_sessions SET ready=1,active=?
        WHERE id=? AND token_hash=? AND connected=1 AND last_seen>=? AND desktop_last_seen>=?
        AND finished_at IS NULL RETURNING *`)
        .bind(student.active,student.id,student.token_hash,new Date(cutoff).toISOString(),new Date(cutoff).toISOString())
        .first<StudentRow>();
      if (!updated) return error(409,'Client connections changed before start');
      Object.assign(student,updated);
    }
    await broadcast(env, exam.id, 'admin', {
      type: 'student_updated',
      student: publicStudent(student),
    });
    const state = {
      type: 'session_state',
      session: publicStudent(student),
      exam: studentExam(exam),
      lease_seconds: 12,
    };
    await broadcast(env, exam.id, 'student', state, student.id);
    return json(state);
  }
  return null;
}

async function events(
  request: Request,
  env: Env,
  path: string,
  url: URL,
): Promise<Response | null> {
  const manualCaptureMatch = path.match(/^\/api\/students\/([0-9a-f-]+)\/screenshot-request$/);
  if (manualCaptureMatch?.[1] && request.method === 'POST') {
    const student = await env.DB.prepare('SELECT * FROM student_sessions WHERE id=?')
      .bind(manualCaptureMatch[1])
      .first<StudentRow>();
    if (!student) return error(404, 'Student not found');
    const { exam } = await authorizedExam(env, request, student.exam_id);
    if (!exam.active || !student.active || !student.connected)
      return error(409, 'Student monitoring is not active');
    const event: EventRow = {
      id: crypto.randomUUID(),
      student_session_id: student.id,
      event_type: 'TEACHER_SCREENSHOT',
      severity: 'info',
      current_url: null,
      timestamp: now(),
      screenshot_path: null,
      metadata: JSON.stringify({ capture_status: 'pending' }),
    };
    student.last_event = event.event_type;
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO violation_events (id,student_session_id,event_type,severity,current_url,timestamp,screenshot_path,metadata) VALUES(?,?,?,?,?,?,NULL,?)',
      ).bind(
        event.id,
        event.student_session_id,
        event.event_type,
        event.severity,
        null,
        event.timestamp,
        event.metadata,
      ),
      env.DB.prepare('UPDATE student_sessions SET last_event=? WHERE id=?').bind(
        student.last_event,
        student.id,
      ),
    ]);
    await broadcast(env, exam.id, 'admin', {
      type: 'event_created',
      event: publicEvent(event),
      student: publicStudent(student),
    });
    await broadcast(
      env,
      exam.id,
      'student',
      { type: 'capture_request', event_id: event.id },
      student.id,
    );
    return json(publicEvent(event), 201);
  }
  if (path === '/api/events' && request.method === 'POST') {
    const body = await readJson(request);
    const sessionId = typeof body.student_session_id === 'string' ? body.student_session_id : '';
    const student = await studentAuth(env, request, sessionId);
    const exam = await env.DB.prepare('SELECT * FROM exams WHERE id=?')
      .bind(student.exam_id)
      .first<ExamRow>();
    if (!exam?.active || !student.active) return error(409, 'Monitoring stopped');
    const type = typeof body.event_type === 'string' ? body.event_type : '';
    if (!eventTypes.has(type) || type === 'STUDENT_DISCONNECTED')
      return error(422, 'Invalid event type');
    const rule = EVENT_RULES[type as EventType];
    if (
      body.severity !== rule.severity ||
      typeof body.id !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(body.id)
    )
      return error(422, 'Event contract rejected');
    const existing = await env.DB.prepare('SELECT * FROM violation_events WHERE id=?')
      .bind(body.id)
      .first<EventRow>();
    if (existing)
      return existing.student_session_id === student.id
        ? json(publicEvent(existing))
        : error(409, 'Event ID already used');
    const metadata =
      body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {};
    if (Object.keys(metadata).some((key) => !allowedMetadata.has(key)))
      return error(422, 'Only minimal event context is accepted');
    if (rule.severity === 'high')
      metadata.capture_status = type === 'DESKTOP_GUARD_DISCONNECTED' ? 'unavailable' : 'pending';
    const event: EventRow = {
      id: body.id,
      student_session_id: student.id,
      event_type: type,
      severity: rule.severity,
      current_url: cleanUrl(body.current_url),
      timestamp: now(),
      screenshot_path: null,
      metadata: JSON.stringify(metadata),
    };
    student.risk_score = Math.min(100, student.risk_score + rule.risk);
    student.violations_count += rule.severity === 'info' ? 0 : 1;
    student.last_event = type;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO violation_events
        (id,student_session_id,event_type,severity,current_url,timestamp,screenshot_path,metadata) VALUES(?,?,?,?,?,?,NULL,?)`,
      ).bind(
        event.id,
        event.student_session_id,
        event.event_type,
        event.severity,
        event.current_url,
        event.timestamp,
        event.metadata,
      ),
      env.DB.prepare(
        'UPDATE student_sessions SET risk_score=?,violations_count=?,last_event=? WHERE id=?',
      ).bind(student.risk_score, student.violations_count, student.last_event, student.id),
    ]);
    await broadcast(env, exam.id, 'admin', {
      type: 'event_created',
      event: publicEvent(event),
      student: publicStudent(student),
    });
    return json(publicEvent(event), 201);
  }
  const timelineMatch = path.match(/^\/api\/students\/([0-9a-f-]+)\/events$/);
  if (timelineMatch?.[1] && request.method === 'GET') {
    const student = await env.DB.prepare('SELECT * FROM student_sessions WHERE id=?')
      .bind(timelineMatch[1])
      .first<StudentRow>();
    if (!student) return error(404, 'Student not found');
    await authorizedExam(env, request, student.exam_id);
    const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 200), 500));
    const before = url.searchParams.get('before');
    let query = 'SELECT * FROM violation_events WHERE student_session_id=?';
    const args: unknown[] = [student.id];
    if (before) {
      const cursor = await env.DB.prepare(
        'SELECT timestamp FROM violation_events WHERE id=? AND student_session_id=?',
      )
        .bind(before, student.id)
        .first<{ timestamp: string }>();
      if (!cursor) return error(422, 'Invalid cursor');
      query += ' AND timestamp<?';
      args.push(cursor.timestamp);
    }
    query += ' ORDER BY timestamp DESC LIMIT ?';
    args.push(limit);
    const result = await env.DB.prepare(query)
      .bind(...args)
      .all<EventRow>();
    return json(result.results.map(publicEvent));
  }
  const captureMatch = path.match(/^\/api\/events\/([0-9a-f-]+)\/capture$/);
  if (captureMatch?.[1] && request.method === 'GET') {
    const owned = await captureOwned(env, request, captureMatch[1]);
    return json(publicEvent(owned.event));
  }
  const uploadMatch = path.match(/^\/api\/events\/([0-9a-f-]+)\/screenshot$/);
  if (uploadMatch?.[1] && request.method === 'POST') {
    const { event, student } = await captureOwned(env, request, uploadMatch[1]);
    if (event.screenshot_path) return json(publicEvent(event));
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.type !== 'image/jpeg' || file.size > 5 * 1024 * 1024)
      return error(415, 'A JPEG up to 5 MiB is required');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return error(422, 'Invalid JPEG');
    const filename = `${crypto.randomUUID()}.jpg`;
    await env.SCREENSHOTS.put(filename, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
    event.screenshot_path = filename;
    const metadata = { ...(JSON.parse(event.metadata) as object), capture_status: 'uploaded' };
    event.metadata = JSON.stringify(metadata);
    await env.DB.prepare('UPDATE violation_events SET screenshot_path=?,metadata=? WHERE id=?')
      .bind(filename, event.metadata, event.id)
      .run();
    const exam = await env.DB.prepare('SELECT * FROM exams WHERE id=?')
      .bind(student.exam_id)
      .first<ExamRow>();
    await broadcast(env, exam!.id, 'admin', {
      type: 'screenshot_updated',
      event: publicEvent(event),
      student: publicStudent(student),
    });
    return json(publicEvent(event));
  }
  const failureMatch = path.match(/^\/api\/events\/([0-9a-f-]+)\/screenshot-status$/);
  if (failureMatch?.[1] && request.method === 'POST') {
    const { event, student } = await captureOwned(env, request, failureMatch[1]);
    const body = await readJson(request);
    const reasons = new Set([
      'desktop_disconnected',
      'permission_denied',
      'capture_failed',
      'upload_failed',
      'rate_limited',
      'lease_expired',
    ]);
    if (typeof body.reason !== 'string' || !reasons.has(body.reason))
      return error(422, 'Invalid reason');
    const metadata = {
      ...(JSON.parse(event.metadata) as object),
      capture_status: 'unavailable',
      capture_reason: body.reason,
    };
    event.metadata = JSON.stringify(metadata);
    await env.DB.prepare('UPDATE violation_events SET metadata=? WHERE id=?')
      .bind(event.metadata, event.id)
      .run();
    await broadcast(env, student.exam_id, 'admin', {
      type: 'screenshot_updated',
      event: publicEvent(event),
      student: publicStudent(student),
    });
    return json(publicEvent(event));
  }
  const imageMatch = path.match(/^\/api\/screenshots\/([0-9a-f-]+\.jpg)$/);
  if (imageMatch?.[1] && request.method === 'GET') {
    const event = await env.DB.prepare('SELECT * FROM violation_events WHERE screenshot_path=?')
      .bind(imageMatch[1])
      .first<EventRow>();
    if (!event) return error(404, 'Screenshot not found');
    const student = await env.DB.prepare('SELECT * FROM student_sessions WHERE id=?')
      .bind(event.student_session_id)
      .first<StudentRow>();
    await authorizedExam(env, request, student!.exam_id);
    const object = await env.SCREENSHOTS.get(imageMatch[1]);
    if (!object) return error(404, 'Screenshot not found');
    return new Response(object.body, {
      headers: {
        'content-type': 'image/jpeg',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  }
  return null;
}

async function captureOwned(env: Env, request: Request, eventId: string) {
  const event = await env.DB.prepare('SELECT * FROM violation_events WHERE id=?')
    .bind(eventId)
    .first<EventRow>();
  if (!event) throw error(404, 'Event not found');
  const student = await studentAuth(env, request, event.student_session_id);
  const exam = await env.DB.prepare('SELECT * FROM exams WHERE id=?')
    .bind(student.exam_id)
    .first<ExamRow>();
  if (!exam?.active || !student.active) throw error(409, 'Monitoring stopped');
  if (
    event.event_type !== 'TEACHER_SCREENSHOT' &&
    (event.severity !== 'high' ||
      ['STUDENT_DISCONNECTED', 'DESKTOP_GUARD_DISCONNECTED'].includes(event.event_type))
  )
    throw error(409, 'This event does not permit screen capture');
  if (Date.now() - Date.parse(event.timestamp) > 30_000) throw error(409, 'Capture window expired');
  return { event, student };
}

async function webSocket(request: Request, env: Env, path: string) {
  const admin = path.match(/^\/ws\/admin\/([0-9a-f-]+)$/);
  const student = path.match(/^\/ws\/student\/([0-9a-f-]+)$/);
  const id = admin?.[1] || student?.[1];
  if (!id || request.headers.get('upgrade') !== 'websocket') return null;
  let examId = id;
  if (student) {
    const row = await env.DB.prepare('SELECT exam_id FROM student_sessions WHERE id=?')
      .bind(id)
      .first<{ exam_id: string }>();
    if (!row) return error(404, 'Student not found');
    examId = row.exam_id;
  }
  const durableRequest = new Request(`https://room/connect?id=${id}`, request);
  return env.ROOMS.getByName(examId).fetch(durableRequest);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === 'OPTIONS')
        return new Response(null, {
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': 'authorization,content-type',
            'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
          },
        });
      const ws = await webSocket(request, env, url.pathname);
      if (ws) return ws;
      if (url.pathname === '/api/health')
        return json({ status: 'ok', service: 'KOSH!RME Cloudflare' });
      const privacy = privacyPolicy(request, url.pathname);
      if (privacy) return privacy;
      const download = url.pathname.match(
        /^\/downloads\/((?:(?:KOSHIRME|ExamGuard)-\d+\.\d+\.\d+(?:-(?:arm64|x64))?(?:-mac)?|KOSHIRME-\d+\.\d+\.\d+-Windows-source|koshirme-chrome-extension-\d+\.\d+\.\d+)\.(?:dmg|zip|exe))$/,
      );
      if (download?.[1] && (request.method === 'GET' || request.method === 'HEAD')) {
        const object = await env.DOWNLOADS.get(download[1]);
        if (!object) return error(404, 'Download not found');
        const contentType = download[1].endsWith('.dmg')
          ? 'application/x-apple-diskimage'
          : download[1].endsWith('.exe')
            ? 'application/vnd.microsoft.portable-executable'
            : 'application/zip';
        return new Response(request.method === 'HEAD' ? null : object.body, {
          headers: {
            'content-type': contentType,
            'content-disposition': `attachment; filename="${download[1]}"`,
            'content-length': String(object.size),
            'cache-control': 'public, max-age=3600',
          },
        });
      }
      const response =
        (await studentConnect(request, env, url.pathname)) ||
        (await accounts(request, env, url.pathname)) ||
        (await rooms(request, env, url.pathname)) ||
        (await students(request, env, url.pathname)) ||
        (await events(request, env, url.pathname, url));
      if (response) {
        response.headers.set('access-control-allow-origin', '*');
        return response;
      }
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/'))
        return error(404, 'Not found');
      return env.ASSETS.fetch(request);
    } catch (reason) {
      if (reason instanceof Response) return reason;
      console.error(reason);
      return error(500, 'Internal server error');
    }
  },
} satisfies ExportedHandler<Env>;
