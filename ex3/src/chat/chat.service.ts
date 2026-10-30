import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  MAX_MESSAGE_LENGTH,
  type ChatMessage,
  type QueueItem,
  type Role,
  type SeenEvent,
  type SendPayload,
  type SessionStatus,
  type SessionView,
  type User,
} from './contracts.js';

/** Loi nghiep vu - message duoc hien thang cho nguoi dung. */
export class ChatError extends Error {}

interface Session {
  id: string;
  customerId: string;
  agentId: string | null;
  status: SessionStatus;
  messages: ChatMessage[];
  byClientMsgId: Map<string, ChatMessage>;
  seen: Record<Role, string | null>;
  waitingSince: number;
}

/** Trang thai phien chat - nguon su that duy nhat, nam tren server (khong nam tren thiet bi). */
@Injectable()
export class ChatService {
  private readonly sessions = new Map<string, Session>();
  private readonly openByCustomer = new Map<string, string>();

  /** Khach mo khung chat: noi lai phien dang mo cua chinh khach, neu khong co thi tao moi. */
  open(customer: User): { session: SessionView; created: boolean } {
    if (customer.role !== 'customer') throw new ChatError('Chi khach hang moi mo duoc phien chat');
    const existing = this.openByCustomer.get(customer.id);
    if (existing) return { session: this.view(this.sessions.get(existing)!), created: false };

    const session: Session = {
      id: `S-${randomUUID().slice(0, 8)}`,
      customerId: customer.id,
      agentId: null,
      status: 'waiting',
      messages: [],
      byClientMsgId: new Map(),
      seen: { customer: null, agent: null },
      waitingSince: Date.now(),
    };
    this.sessions.set(session.id, session);
    this.openByCustomer.set(customer.id, session.id);
    return { session: this.view(session), created: true };
  }

  /** Them tin nhan. Gui lai cung clientMsgId (mang chap chon, 2 thiet bi) -> tra ban cu, khong nhan doi. */
  addMessage(user: User, payload: SendPayload): { message: ChatMessage; duplicate: boolean } {
    const session = this.participantSession(user, payload?.sessionId);
    if (session.status === 'closed') throw new ChatError('Phien chat da ket thuc');
    if (typeof payload.clientMsgId !== 'string' || payload.clientMsgId === '') {
      throw new ChatError('Thieu ma tin nhan');
    }
    const old = session.byClientMsgId.get(payload.clientMsgId);
    if (old) return { message: old, duplicate: true };

    const message: ChatMessage = {
      id: `M-${randomUUID().slice(0, 8)}`,
      sessionId: session.id,
      clientMsgId: payload.clientMsgId,
      from: user.role,
      senderId: user.id,
      text: validateText(payload.text),
      sentAt: Date.now(),
    };
    session.messages.push(message);
    session.byClientMsgId.set(message.clientMsgId, message);
    return { message, duplicate: false };
  }

  /** Danh dau "da xem" toi tin nhan messageId cua phia ben kia. Tra null neu khong tien len. */
  markSeen(user: User, sessionId: string, messageId: string): SeenEvent | null {
    const session = this.participantSession(user, sessionId);
    const idx = session.messages.findIndex((m) => m.id === messageId);
    if (idx < 0) throw new ChatError('Tin nhan khong ton tai');
    if (session.messages[idx].from === user.role) return null; // tu xem tin cua minh: bo qua
    const current = session.messages.findIndex((m) => m.id === session.seen[user.role]);
    if (idx <= current) return null; // chi tien, khong lui
    session.seen[user.role] = messageId;
    return { sessionId, by: user.role, messageId };
  }

  accept(agent: User, sessionId: string): SessionView {
    if (agent.role !== 'agent') throw new ChatError('Chi nhan vien moi nhan duoc phien');
    const session = this.find(sessionId);
    if (session.status !== 'waiting') throw new ChatError('Phien nay da co nhan vien khac nhan');
    session.agentId = agent.id;
    session.status = 'active';
    return this.view(session);
  }

  /** Nhan vien roi phien -> phien quay ve hang cho. */
  leave(agent: User, sessionId: string): SessionView {
    const session = this.participantSession(agent, sessionId);
    if (agent.role !== 'agent' || session.status !== 'active') throw new ChatError('Khong the roi phien nay');
    session.agentId = null;
    session.status = 'waiting';
    session.waitingSince = Date.now();
    return this.view(session);
  }

  close(user: User, sessionId: string): SessionView {
    const session = this.participantSession(user, sessionId);
    if (session.status === 'closed') throw new ChatError('Phien chat da ket thuc');
    session.status = 'closed';
    this.openByCustomer.delete(session.customerId);
    return this.view(session);
  }

  queue(): QueueItem[] {
    return [...this.sessions.values()]
      .filter((s) => s.status === 'waiting')
      .sort((a, b) => a.waitingSince - b.waitingSince)
      .map((s) => ({ sessionId: s.id, customerId: s.customerId, waitingSince: s.waitingSince }));
  }

  activeSessionsOf(user: User): SessionView[] {
    return [...this.sessions.values()]
      .filter((s) => s.status !== 'closed')
      .filter((s) => (user.role === 'customer' ? s.customerId : s.agentId) === user.id)
      .map((s) => this.view(s));
  }

  private find(sessionId: unknown): Session {
    const session = typeof sessionId === 'string' ? this.sessions.get(sessionId) : undefined;
    if (!session) throw new ChatError('Phien chat khong ton tai');
    return session;
  }

  /** Chi khach chu phien va nhan vien dang phu trach moi thao tac duoc tren phien. */
  private participantSession(user: User, sessionId: unknown): Session {
    const session = this.find(sessionId);
    const owner = user.role === 'customer' ? session.customerId : session.agentId;
    if (owner !== user.id) throw new ChatError('Ban khong tham gia phien chat nay');
    return session;
  }

  private view(s: Session): SessionView {
    return {
      id: s.id,
      customerId: s.customerId,
      agentId: s.agentId,
      status: s.status,
      messages: [...s.messages],
      seen: { ...s.seen },
    };
  }
}

export function validateText(text: unknown): string {
  if (typeof text !== 'string') throw new ChatError('Tin nhan khong hop le');
  const trimmed = text.trim();
  if (trimmed === '') throw new ChatError('Tin nhan khong duoc de trong');
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new ChatError(
      `Tin nhan qua dai (${trimmed.length} ky tu). Vui long chia nho, toi da ${MAX_MESSAGE_LENGTH} ky tu moi tin.`,
    );
  }
  return trimmed;
}
