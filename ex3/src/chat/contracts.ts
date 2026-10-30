/** Hop dong su kien cua khung chat - client va server cung dung chung file nay. */

export type Role = 'customer' | 'agent';
export type SessionStatus = 'waiting' | 'active' | 'closed';

export interface User {
  id: string;
  name: string;
  role: Role;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  clientMsgId: string;
  from: Role;
  senderId: string;
  text: string;
  sentAt: number;
}

export interface SessionView {
  id: string;
  customerId: string;
  agentId: string | null;
  status: SessionStatus;
  messages: ChatMessage[];
  seen: Record<Role, string | null>;
}

export const MAX_MESSAGE_LENGTH = 2000;
export const TYPING_TIMEOUT_MS = 3000;

/** Client -> Server (tat ca deu co ack tra ve Ack<T>). */
export const C2S = {
  OPEN: 'chat:open',
  MESSAGE: 'chat:message',
  TYPING: 'chat:typing',
  SEEN: 'chat:seen',
  CLOSE: 'chat:close',
  AGENT_ACCEPT: 'agent:accept',
  AGENT_LEAVE: 'agent:leave',
} as const;

/** Server -> Client. */
export const S2C = {
  SESSION: 'chat:session',
  MESSAGE: 'chat:message',
  TYPING: 'chat:typing',
  SEEN: 'chat:seen',
  ASSIGNED: 'chat:assigned',
  AGENT_LEFT: 'chat:agent_left',
  CLOSED: 'chat:closed',
  QUEUE: 'queue:updated',
} as const;

export interface OpenPayload {}
export interface SendPayload {
  sessionId: string;
  clientMsgId: string;
  text: string;
}
export interface TypingPayload {
  sessionId: string;
  isTyping: boolean;
}
export interface SeenPayload {
  sessionId: string;
  messageId: string;
}
export interface SessionRef {
  sessionId: string;
}

export type Ack<T> = { ok: true; data: T } | { ok: false; error: string };

export interface TypingEvent {
  sessionId: string;
  from: Role;
  isTyping: boolean;
}
export interface SeenEvent {
  sessionId: string;
  by: Role;
  messageId: string;
}
export interface QueueItem {
  sessionId: string;
  customerId: string;
  waitingSince: number;
}
