import type { Exam, Student } from '@koshirme/protocol';
export interface DesktopState {
  websiteConnected?: boolean;
  starting: boolean;
  backend: boolean;
  extension: boolean;
  permission: string;
  pairingCode: string;
  session: Student | null;
  exam: Exam | null;
  monitoring: boolean;
  consented: boolean;
  error: string | null;
  applicationError?: string | null;
}
export interface JoinInput {
  studentName: string;
  joinCode: string;
}
export interface GuardAPI {
  getState(): Promise<DesktopState>;
  screenPermission(): Promise<void>;
  checkApplications(): Promise<void>;
  onState(callback: (state: DesktopState) => void): () => void;
}
