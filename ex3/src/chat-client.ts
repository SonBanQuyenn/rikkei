import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import {
  C2S,
  S2C,
  type Ack,
  type ChatMessage,
  type QueueItem,
  type Role,
  type SeenEvent,
  type SessionView,
  type TypingEvent,
} from './chat/contracts.js';

/** Client mau (logic cua app khach / man hinh nhan vien) dung cho demo va test. */
export class ChatClient {
  readonly socket: Socket;
  readonly messages = new Map<string, ChatMessage>();
  session: SessionView | null = null;
  queue: QueueItem[] = [];
  otherTyping = false;
  seenByOther: string | null = null;
  notices: string[] = [];
  /** Chi gui "da xem" khi khung chat dang mo that su tren thiet bi nay. */
  windowOpen = false;
  private lastTypingSent = 0;

  constructor(
    url: string,
    token: string,
    readonly role: Role,
    private readonly log: (msg: string) => void = () => {},
  ) {
    this.socket = io(url, { auth: { token }, transports: ['websocket'], forceNew: true });
    this.socket.on(S2C.MESSAGE, (m: ChatMessage) => this.receive(m));
    this.socket.on(S2C.SESSION, (s: SessionView) => this.load(s));
    this.socket.on(S2C.TYPING, (e: TypingEvent) => {
      this.otherTyping = e.isTyping;
      this.log(e.isTyping ? `thay "${e.from} dang soan tin..."` : `tat "dang soan tin"`);
    });
    this.socket.on(S2C.SEEN, (e: SeenEvent) => {
      if (e.by === this.role) return;
      this.seenByOther = e.messageId;
      this.log(`thay dau "da xem" (${e.by} xem toi ${e.messageId})`);
    });
    this.socket.on(S2C.QUEUE, (q: QueueItem[]) => {
      this.queue = q;
      this.log(`hang cho: [${q.map((i) => i.sessionId).join(', ')}]`);
    });
    this.socket.on(S2C.ASSIGNED, (e) => this.notice(`${e.agent.name} da tham gia ho tro`));
    this.socket.on(S2C.AGENT_LEFT, (e) => {
      if (this.session) this.session.status = 'waiting';
      this.notice(e.message);
    });
    this.socket.on(S2C.CLOSED, () => {
      if (this.session) this.session.status = 'closed';
      this.notice('Phien chat da ket thuc');
    });
  }

  connected() {
    return new Promise<void>((resolve, reject) => {
      if (this.socket.connected) return resolve();
      this.socket.once('connect', () => resolve());
      this.socket.once('connect_error', reject);
    });
  }

  async openChat() {
    const res: Ack<SessionView> = await this.socket.emitWithAck(C2S.OPEN, {});
    if (!res.ok) throw new Error(res.error);
    this.load(res.data);
    this.openWindow();
    return res.data;
  }

  async accept(sessionId: string) {
    const res: Ack<SessionView> = await this.socket.emitWithAck(C2S.AGENT_ACCEPT, { sessionId });
    if (res.ok) {
      this.load(res.data);
      this.openWindow();
    }
    return res;
  }

  leave() {
    return this.socket.emitWithAck(C2S.AGENT_LEAVE, { sessionId: this.session!.id });
  }

  close() {
    return this.socket.emitWithAck(C2S.CLOSE, { sessionId: this.session!.id });
  }

  /** Gui tin; mat ack thi gui lai voi cung clientMsgId -> server khong nhan doi. */
  async send(text: string, clientMsgId: string = randomUUID()): Promise<Ack<ChatMessage>> {
    const payload = { sessionId: this.session?.id, clientMsgId, text };
    let res: Ack<ChatMessage>;
    try {
      res = await this.socket.timeout(2000).emitWithAck(C2S.MESSAGE, payload);
    } catch {
      res = await this.socket.timeout(2000).emitWithAck(C2S.MESSAGE, payload);
    }
    if (res.ok) this.messages.set(res.data.id, res.data);
    else this.notice(res.error);
    return res;
  }

  /** Goi moi lan go phim; chi gui len server toi da 1 lan/giay. */
  keystroke() {
    if (Date.now() - this.lastTypingSent < 1000 || !this.session) return;
    this.lastTypingSent = Date.now();
    this.socket.emit(C2S.TYPING, { sessionId: this.session.id, isTyping: true });
  }

  openWindow() {
    this.windowOpen = true;
    this.markLatestSeen();
  }

  closeWindow() {
    this.windowOpen = false;
  }

  texts() {
    return [...this.messages.values()].sort((a, b) => a.sentAt - b.sentAt).map((m) => m.text);
  }

  disconnect() {
    this.socket.close();
  }

  private load(s: SessionView) {
    this.session = s;
    for (const m of s.messages) this.messages.set(m.id, m);
  }

  private receive(m: ChatMessage) {
    if (this.messages.has(m.id)) return; // chong hien trung
    this.messages.set(m.id, m);
    this.log(`nhan tin (${m.from}): "${m.text}"`);
    if (m.from !== this.role) this.markLatestSeen();
  }

  private markLatestSeen() {
    if (!this.windowOpen || !this.session) return;
    const last = [...this.messages.values()].filter((m) => m.from !== this.role).at(-1);
    if (last) this.socket.emit(C2S.SEEN, { sessionId: this.session.id, messageId: last.id });
  }

  private notice(msg: string) {
    this.notices.push(msg);
    this.log(`THONG BAO: ${msg}`);
  }
}
