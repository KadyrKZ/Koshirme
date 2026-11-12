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
}
export interface JoinInput {
  studentName: string;
  joinCode: string;
}
export interface GuardAPI {
  getState(): Promise<DesktopState>;
  join(input: JoinInput): Promise<void>;
  start(): Promise<void>;
  screenPermission(): Promise<void>;
  copyPairingCode(): Promise<void>;
  onState(callback: (state: DesktopState) => void): () => void;
}
