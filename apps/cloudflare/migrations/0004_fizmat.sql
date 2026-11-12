ALTER TABLE users ADD COLUMN fizmat_user_id TEXT;
CREATE UNIQUE INDEX users_fizmat_identity ON users(fizmat_user_id) WHERE fizmat_user_id IS NOT NULL;
ALTER TABLE auth_sessions ADD COLUMN credential_version TEXT;
ALTER TABLE exams ADD COLUMN fizmat_contest_id TEXT;
CREATE UNIQUE INDEX exams_fizmat_contest ON exams(fizmat_contest_id) WHERE fizmat_contest_id IS NOT NULL;
