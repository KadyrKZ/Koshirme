CREATE TABLE login_attempts (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start TEXT NOT NULL
);

CREATE INDEX ix_login_attempts_window ON login_attempts(window_start);
