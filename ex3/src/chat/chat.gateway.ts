import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { authenticate } from '../auth.js';
import { ChatError, ChatService } from './chat.service.js';
import {
  C2S,
  S2C,
  TYPING_TIMEOUT_MS,
  type Ack,
  type SeenPayload,
  type SendPayload,
  type SessionRef,
  type TypingPayload,
  type User,
} from './contracts.js';

const userRoom = (userId: string) => `user:${userId}`;
const sessionRoom = (sessionId: string) => `session:${sessionId}`;
const AGENTS_ROOM = 'agents';

@WebSocketGateway({ cors: { origin: '*' }, maxHttpBufferSize: 100_000 })
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChatGateway.name);

  /** Co the giam trong test. */
  typingTimeoutMs = TYPING_TIMEOUT_MS;
  agentGraceMs = 15_000;

  /** `${sessionId}:${userId}` -> timer tu tat "dang soan tin". */
  private readonly typingTimers = new Map<string, NodeJS.Timeout>();
  /** agentId -> timer tra phien ve hang cho khi nhan vien mat ket noi qua lau. */
  private readonly agentGrace = new Map<string, NodeJS.Timeout>();

  constructor(private readonly chat: ChatService) {}

  afterInit(server: Server) {
    server.use((socket, next) => {
      const user = authenticate(socket.handshake.auth?.token);
      if (!user) return next(new Error('UNAUTHORIZED'));
      socket.data.user = user;
      next();
    });
  }

  async handleConnection(socket: Socket) {
    const user = this.userOf(socket);
    // Moi thiet bi cua cung mot nguoi vao chung room user:<id> -> dong bo nhieu thiet bi.
    await socket.join(userRoom(user.id));
    const rooms = this.chat.activeSessionsOf(user).map((s) => sessionRoom(s.id));
    if (rooms.length) await socket.join(rooms);

    if (user.role === 'agent') {
      await socket.join(AGENTS_ROOM);
      clearTimeout(this.agentGrace.get(user.id));
      this.agentGrace.delete(user.id);
      socket.emit(S2C.QUEUE, this.chat.queue());
    }
  }

  handleDisconnect(socket: Socket) {
    const user: User | undefined = socket.data.user;
    if (!user || this.deviceCount(user.id) > 0) return;

    // Nguoi dung khong con thiet bi nao: tat "dang soan tin" con treo.
    for (const s of this.chat.activeSessionsOf(user)) this.stopTyping(user, s.id);

    if (user.role === 'agent' && this.chat.activeSessionsOf(user).length) {
      const timer = setTimeout(() => {
        this.agentGrace.delete(user.id);
        for (const s of this.chat.activeSessionsOf(user)) this.agentLeft(user, s.id);
      }, this.agentGraceMs);
      this.agentGrace.set(user.id, timer);
    }
  }

  @SubscribeMessage(C2S.OPEN)
  onOpen(@ConnectedSocket() socket: Socket) {
    return this.handle(async () => {
      const user = this.userOf(socket);
      const { session, created } = this.chat.open(user);
      await this.server.in(userRoom(user.id)).socketsJoin(sessionRoom(session.id));
      // Dong bo cho cac thiet bi khac cua khach
      socket.to(userRoom(user.id)).emit(S2C.SESSION, session);
      if (created) this.broadcastQueue();
      return session;
    });
  }

  @SubscribeMessage(C2S.MESSAGE)
  onMessage(@MessageBody() body: SendPayload, @ConnectedSocket() socket: Socket) {
    return this.handle(() => {
      const user = this.userOf(socket);
      const { message, duplicate } = this.chat.addMessage(user, body);
      if (!duplicate) {
        // Gui toi moi socket trong phien tru chinh socket gui (no da co ack),
        // ke ca thiet bi khac cua nguoi gui.
        socket.to(sessionRoom(message.sessionId)).emit(S2C.MESSAGE, message);
        this.stopTyping(user, message.sessionId);
      }
      return message;
    });
  }

  @SubscribeMessage(C2S.TYPING)
  onTyping(@MessageBody() body: TypingPayload, @ConnectedSocket() socket: Socket) {
    return this.handle(() => {
      const user = this.userOf(socket);
      const sessionId = body?.sessionId;
      if (!this.chat.activeSessionsOf(user).some((s) => s.id === sessionId)) {
        throw new ChatError('Ban khong tham gia phien chat nay');
      }
      if (!body.isTyping) return this.stopTyping(user, sessionId);

      const key = `${sessionId}:${user.id}`;
      const wasTyping = this.typingTimers.has(key);
      clearTimeout(this.typingTimers.get(key));
      // 3 giay khong co tin hieu go phim moi -> tu tat
      this.typingTimers.set(key, setTimeout(() => this.stopTyping(user, sessionId), this.typingTimeoutMs));
      if (!wasTyping) this.emitToOthers(user, sessionId, S2C.TYPING, { sessionId, from: user.role, isTyping: true });
    });
  }

  @SubscribeMessage(C2S.SEEN)
  onSeen(@MessageBody() body: SeenPayload, @ConnectedSocket() socket: Socket) {
    return this.handle(() => {
      const user = this.userOf(socket);
      const event = this.chat.markSeen(user, body?.sessionId, body?.messageId);
      if (event) this.server.to(sessionRoom(event.sessionId)).emit(S2C.SEEN, event);
      return event;
    });
  }

  @SubscribeMessage(C2S.AGENT_ACCEPT)
  onAccept(@MessageBody() body: SessionRef, @ConnectedSocket() socket: Socket) {
    return this.handle(async () => {
      const agent = this.userOf(socket);
      const session = this.chat.accept(agent, body?.sessionId);
      await this.server.in(userRoom(agent.id)).socketsJoin(sessionRoom(session.id));
      this.server.to(sessionRoom(session.id)).emit(S2C.ASSIGNED, {
        sessionId: session.id,
        agent: { id: agent.id, name: agent.name },
      });
      this.broadcastQueue();
      return session;
    });
  }

  @SubscribeMessage(C2S.AGENT_LEAVE)
  onLeave(@MessageBody() body: SessionRef, @ConnectedSocket() socket: Socket) {
    return this.handle(() => this.agentLeft(this.userOf(socket), body?.sessionId));
  }

  @SubscribeMessage(C2S.CLOSE)
  onClose(@MessageBody() body: SessionRef, @ConnectedSocket() socket: Socket) {
    return this.handle(() => {
      const user = this.userOf(socket);
      const wasWaiting = this.chat.queue().some((q) => q.sessionId === body?.sessionId);
      const session = this.chat.close(user, body?.sessionId);
      this.clearTypingOf(session.id);
      this.server.to(sessionRoom(session.id)).emit(S2C.CLOSED, { sessionId: session.id, by: user.role });
      this.server.in(sessionRoom(session.id)).socketsLeave(sessionRoom(session.id));
      if (wasWaiting) this.broadcastQueue();
      return session;
    });
  }

  private agentLeft(agent: User, sessionId: string) {
    const session = this.chat.leave(agent, sessionId);
    this.stopTyping(agent, session.id);
    this.server.in(userRoom(agent.id)).socketsLeave(sessionRoom(session.id));
    this.server.to(sessionRoom(session.id)).emit(S2C.AGENT_LEFT, {
      sessionId: session.id,
      message: 'Nhan vien da roi cuoc tro chuyen. Ban dang duoc chuyen toi nhan vien khac, vui long cho.',
    });
    this.broadcastQueue();
    return session;
  }

  private stopTyping(user: User, sessionId: string) {
    const key = `${sessionId}:${user.id}`;
    if (!this.typingTimers.has(key)) return;
    clearTimeout(this.typingTimers.get(key));
    this.typingTimers.delete(key);
    this.emitToOthers(user, sessionId, S2C.TYPING, { sessionId, from: user.role, isTyping: false });
  }

  private clearTypingOf(sessionId: string) {
    for (const [key, timer] of this.typingTimers) {
      if (key.startsWith(`${sessionId}:`)) {
        clearTimeout(timer);
        this.typingTimers.delete(key);
      }
    }
  }

  /** Gui toi phia ben kia cua phien (bo qua moi thiet bi cua chinh nguoi gui). */
  private emitToOthers(user: User, sessionId: string, event: string, payload: unknown) {
    this.server.to(sessionRoom(sessionId)).except(userRoom(user.id)).emit(event, payload);
  }

  private broadcastQueue() {
    this.server.to(AGENTS_ROOM).emit(S2C.QUEUE, this.chat.queue());
  }

  private deviceCount(userId: string) {
    return this.server.sockets.adapter.rooms.get(userRoom(userId))?.size ?? 0;
  }

  private userOf(socket: Socket): User {
    return socket.data.user;
  }

  /** Moi handler tra ve Ack: loi nghiep vu -> thong bao than thien, loi khac -> khong lam sap server. */
  private async handle<T>(fn: () => T | Promise<T>): Promise<Ack<T>> {
    try {
      return { ok: true, data: await fn() };
    } catch (err) {
      if (err instanceof ChatError) return { ok: false, error: err.message };
      this.logger.error(err);
      return { ok: false, error: 'Co loi xay ra, vui long thu lai' };
    }
  }

  onModuleDestroy() {
    [...this.typingTimers.values(), ...this.agentGrace.values()].forEach(clearTimeout);
  }
}
