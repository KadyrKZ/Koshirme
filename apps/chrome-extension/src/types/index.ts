export type {
  SessionConfig,
  SessionState,
  EventType,
  EventInput,
  ExtensionStatus,
  ViolationEvent,
} from '@koshirme/protocol';
export interface PairSettings {
  secret: string;
  website?: boolean;
  port: number;
}
