export const PLATFORM_URL = 'https://koshirme.stream';
export const WAITING_URL = 'https://fizmat.win/waiting';

// Every contest field follows the same policy; private query data is never stored.
export function normalizeAllowedUrl(input: unknown): string | null {
  if (
    typeof input !== 'string' ||
    input.length > 2048 ||
    !/^https:\/\/[^/\\\s]/i.test(input.trim())
  )
    return null;
  try {
    const url = new URL(input.trim());
    if (
      url.protocol !== 'https:' ||
      !url.hostname ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443')
    )
      return null;
    return `${url.origin}${url.pathname || '/'}`;
  } catch {
    return null;
  }
}

export type Severity = 'info' | 'medium' | 'high';
export const EVENT_RULES = {
  PAGE_HIDDEN: { severity: 'medium', risk: 5 },
  NEW_TAB: { severity: 'medium', risk: 10 },
  TAB_CHANGED: { severity: 'high', risk: 20 },
  GOOGLE_LENS_ATTEMPT: { severity: 'high', risk: 0 },
  BROWSER_UI_ATTEMPT: { severity: 'high', risk: 15 },
  CHROME_FOCUS_LOST: { severity: 'high', risk: 25 },
  DESKTOP_GUARD_DISCONNECTED: { severity: 'high', risk: 30 },
  STUDENT_DISCONNECTED: { severity: 'high', risk: 30 },
  STUDENT_RECONNECTED: { severity: 'info', risk: 0 },
  TEACHER_SCREENSHOT: { severity: 'info', risk: 0 },
  RETURN_TO_EXAM: { severity: 'info', risk: 0 },
} as const;
export type EventType = keyof typeof EVENT_RULES;
export interface Exam {
  id: string;
  title: string;
  join_code: string;
  allowed_url: string;
  allowed_urls: string[];
  created_at: string;
  start_time: string | null;
  active: boolean;
  paused: boolean;
  finished_at: string | null;
}
export interface Student {
  finished_at?: string | null;
  finish_reason?: string | null;
  id: string;
  exam_id: string;
  student_name: string;
  connected: boolean;
  active: boolean;
  ready: boolean;
  started_at: string;
  last_seen: string;
  risk_score: number;
  violations_count: number;
  last_event: EventType | null;
}
export interface ViolationEvent {
  id: string;
  student_session_id: string;
  event_type: EventType;
  severity: Severity;
  timestamp: string;
  current_url: string | null;
  screenshot_path: string | null;
  metadata: Record<string, unknown>;
}
export interface EventInput {
  id: string;
  student_session_id: string;
  event_type: EventType;
  severity: Severity;
  timestamp: string;
  current_url: string | null;
  metadata: Record<string, unknown>;
}
export interface SessionConfig {
  fizmat?: { contest_id: string; user_id: string };
  session: Student;
  exam: Exam;
  token: string;
  backend_url: string;
  monitoring_allowed: boolean;
}
export interface SessionState {
  type: 'session_state' | 'heartbeat_ack';
  session: Student;
  exam: Exam;
  lease_seconds: number;
}
export type AdminMessage =
  | { type: 'snapshot'; exam: Exam; students: Student[] }
  | { type: 'student_updated'; student: Student }
  | { type: 'event_created' | 'screenshot_updated'; event: ViolationEvent; student: Student }
  | { type: 'exam_updated'; exam: Exam }
  | { type: 'pong' };
export type StudentMessage =
  SessionState | { type: 'capture_request'; event_id: string } | { type: 'error'; detail: string };
export interface ExtensionStatus {
  desktop: boolean;
  backend: boolean;
  monitoring: boolean;
  examTitle: string | null;
  allowedUrl: string | null;
  allowedUrls: string[];
  error: string | null;
}
export function examAllowedUrls(
  exam: Pick<Exam, 'allowed_url'> & Partial<Pick<Exam, 'allowed_urls'>>,
): string[] {
  return exam.allowed_urls?.length ? exam.allowed_urls : [exam.allowed_url];
}
export function isAllowedUrl(current: string | undefined, allowed: string | string[]): boolean {
  return (Array.isArray(allowed) ? allowed : [allowed]).some((value) => {
    try {
      const candidate = new URL(current ?? '');
      const base = new URL(value);
      const path = base.pathname.replace(/\/+$/, '');
      return (
        candidate.origin === base.origin &&
        (candidate.pathname === path || candidate.pathname.startsWith(`${path}/`))
      );
    } catch {
      return false;
    }
  });
}
// Query strings, fragments and credentials never enter the event log.
export function sanitizeUrl(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:')
      return `${url.origin}${url.pathname}`.slice(0, 2048);
    return `${url.protocol}//${url.hostname}${url.pathname}`.slice(0, 2048);
  } catch {
    return null;
  }
}
export function websocketUrl(base: string, path: string): string {
  const url = new URL(path, base);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}
