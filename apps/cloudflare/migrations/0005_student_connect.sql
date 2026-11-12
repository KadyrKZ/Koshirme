ALTER TABLE student_sessions ADD COLUMN fizmat_user_id TEXT;
ALTER TABLE student_sessions ADD COLUMN fizmat_session_hash TEXT;
CREATE UNIQUE INDEX student_fizmat_identity ON student_sessions(exam_id, fizmat_user_id);
CREATE TABLE student_launch_tickets (
  token_hash TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE(exam_id,user_id,session_hash)
);
