export interface Env {
  DB: D1Database;
  FIZMAT_DB?: D1Database;
  FIZMAT?: Fetcher;
  FIZMAT_INTEGRATION_KEY?: string;
  SCREENSHOTS: R2Bucket;
  DOWNLOADS: R2Bucket;
  ROOMS: DurableObjectNamespace;
  ASSETS: Fetcher;
  BOOTSTRAP_TOKEN?: string;
}
export interface UserRow {
  id: string;
  fizmat_user_id?: string | null;
  email: string;
  name: string;
  password_hash: string;
  role: 'admin' | 'teacher';
  active: number;
  created_at: string;
}
export interface ExamRow {
  fizmat_contest_id?: string | null;
  id: string;
  owner_id: string;
  title: string;
  join_code: string;
  allowed_url: string;
  allowed_urls: string;
  created_at: string;
  start_time: string | null;
  finished_at: string | null;
  active: number;
  paused: number;
}
export interface StudentRow {
  finished_at?: string | null;
  finish_reason?: string | null;
  fizmat_user_id?: string | null;
  fizmat_session_hash?: string | null;
  id: string;
  exam_id: string;
  student_name: string;
  token_hash: string;
  connected: number;
  active: number;
  ready: number;
  started_at: string;
  last_seen: string;
  desktop_last_seen: string | null;
  risk_score: number;
  violations_count: number;
  last_event: string | null;
}
export interface EventRow {
  id: string;
  student_session_id: string;
  event_type: string;
  severity: string;
  current_url: string | null;
  timestamp: string;
  screenshot_path: string | null;
  metadata: string;
}
