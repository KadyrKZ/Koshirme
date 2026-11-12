CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','teacher')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
CREATE TABLE exams (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  join_code TEXT NOT NULL,
  allowed_url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  start_time TEXT,
  finished_at TEXT,
  active INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX exams_owner ON exams(owner_id);
CREATE INDEX exams_join_code ON exams(join_code, finished_at);
CREATE TABLE student_sessions (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id),
  student_name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  connected INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 0,
  ready INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  desktop_last_seen TEXT,
  risk_score INTEGER NOT NULL DEFAULT 0,
  violations_count INTEGER NOT NULL DEFAULT 0,
  last_event TEXT
);
CREATE INDEX student_sessions_exam ON student_sessions(exam_id);
CREATE TABLE violation_events (
  id TEXT PRIMARY KEY,
  student_session_id TEXT NOT NULL REFERENCES student_sessions(id),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  current_url TEXT,
  timestamp TEXT NOT NULL,
  screenshot_path TEXT UNIQUE,
  metadata TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX events_session_time ON violation_events(student_session_id, timestamp DESC);
