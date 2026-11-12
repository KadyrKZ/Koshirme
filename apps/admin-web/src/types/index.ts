export type { Exam, Student, ViolationEvent, EventType, AdminMessage } from '@koshirme/protocol';
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'teacher';
  active: boolean;
}
export interface LoginResponse {
  token: string;
  user: User;
}
