import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import { startServer } from '../src/app.js';
import { ChatClient } from '../src/chat-client.js';
import { ChatGateway } from '../src/chat/chat.gateway.js';
import type { Role } from '../src/chat/contracts.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (cond: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timeout');
    await sleep(10);
  }
};

describe('Khung chat ho tro khach hang', () => {
  let app: INestApplication;
  let url: string;
  const clients: ChatClient[] = [];
  const connect = async (token: string, role: Role) => {
    const c = new ChatClient(url, token, role);
    clients.push(c);
    await c.connected();
    return c;
  };

  before(async () => {
    app = await startServer(0, false);
    url = `http://localhost:${app.getHttpServer().address().port}`;
    const gw = app.get(ChatGateway);
    gw.typingTimeoutMs = 300;
    gw.agentGraceMs = 200;
  });
  after(async () => {
    clients.forEach((c) => c.disconnect());
    await app.close();
  });

  test('mo khung chat: tao phien moi, mo lai thi noi lai dung phien cu cua chinh khach', async () => {
    const phone = await connect('tk-c01', 'customer');
    const s1 = await phone.openChat();
    const s2 = await phone.openChat();
    assert.equal(s1.id, s2.id);
    assert.equal(s1.status, 'waiting');

    const other = await connect('tk-c02', 'customer');
    assert.notEqual((await other.openChat()).id, s1.id);
    await other.close();
    await phone.close();
  });

  test('tin nhan hien o ca 2 phia duoi 1 giay; 2 thiet bi dong bo, khong nhan doi', async () => {
    const phone = await connect('tk-c01', 'customer');
    const laptop = await connect('tk-c01', 'customer');
    const agent = await connect('tk-a01', 'agent');
    const session = await phone.openChat();
    await laptop.openChat();
    assert.equal(laptop.session!.id, session.id);
    await until(() => agent.queue.some((q) => q.sessionId === session.id));
    assert.equal((await agent.accept(session.id)).ok, true);

    const t0 = Date.now();
    await phone.send('Don DH-001 cua toi giao chua?', 'cm-1');
    await until(() => agent.texts().length === 1 && laptop.texts().length === 1);
    assert.ok(Date.now() - t0 < 1000);

    await agent.send('Don dang giao, du kien 15h a');
    await until(() => phone.texts().length === 2 && laptop.texts().length === 2);

    // Gui lai cung clientMsgId (mat ack / bam 2 lan) -> khong nhan doi
    await phone.send('Don DH-001 cua toi giao chua?', 'cm-1');
    await sleep(100);
    assert.deepEqual(agent.texts(), ['Don DH-001 cua toi giao chua?', 'Don dang giao, du kien 15h a']);
    assert.deepEqual(laptop.texts(), agent.texts());
    assert.deepEqual(phone.texts(), agent.texts());
    await phone.close();
  });

  test('chan tin rong, chi khoang trang va tin 20.000 ky tu voi thong bao than thien', async () => {
    const c = await connect('tk-c02', 'customer');
    await c.openChat();
    const empty = await c.send('');
    const spaces = await c.send('    \n\t  ');
    const huge = await c.send('a'.repeat(20_000));
    assert.deepEqual(empty, { ok: false, error: 'Tin nhan khong duoc de trong' });
    assert.deepEqual(spaces, { ok: false, error: 'Tin nhan khong duoc de trong' });
    assert.equal(huge.ok, false);
    assert.match((huge as { error: string }).error, /qua dai .*toi da 2000/);
    assert.equal(c.texts().length, 0);
    await c.close();
  });

  test('"dang soan tin" hien voi ben kia va tu tat khi khong go nua', async () => {
    const customer = await connect('tk-c01', 'customer');
    const agent = await connect('tk-a02', 'agent');
    const s = await customer.openChat();
    await agent.accept(s.id);

    customer.keystroke();
    await until(() => agent.otherTyping);
    assert.equal(customer.otherTyping, false); // khong tu thay chinh minh
    await until(() => !agent.otherTyping, 1000); // timeout (300ms trong test, 3s that)
    await customer.close();
  });

  test('"da xem" chi gui khi ben kia thuc su mo khung chat', async () => {
    const customer = await connect('tk-c01', 'customer');
    const agent = await connect('tk-a01', 'agent');
    const s = await customer.openChat();
    await agent.accept(s.id);

    agent.closeWindow(); // nhan vien dang o phien khac
    const sent = await customer.send('Alo?');
    await sleep(150);
    assert.equal(customer.seenByOther, null);

    agent.openWindow();
    await until(() => customer.seenByOther === (sent.ok && sent.data.id));
    await customer.close();
  });

  test('nhan vien roi phien: khach nhan thong bao, phien ve hang cho cho nhan vien khac', async () => {
    const customer = await connect('tk-c02', 'customer');
    const lan = await connect('tk-a01', 'agent');
    const minh = await connect('tk-a02', 'agent');
    const s = await customer.openChat();
    await until(() => minh.queue.some((q) => q.sessionId === s.id));
    await lan.accept(s.id);
    await until(() => !minh.queue.some((q) => q.sessionId === s.id));

    await lan.leave();
    await until(() => customer.notices.some((n) => n.includes('roi cuoc tro chuyen')));
    assert.equal(customer.session!.status, 'waiting');
    await until(() => minh.queue.some((q) => q.sessionId === s.id));

    // Nhan vien cu khong con quyen gui vao phien
    assert.equal((await lan.send('con do khong?')).ok, false);
    assert.equal((await minh.accept(s.id)).ok, true);
    await customer.close();
  });

  test('nhan vien mat ket noi qua lau thi phien cung ve hang cho; nguoi la khong vao duoc phien', async () => {
    const customer = await connect('tk-c01', 'customer');
    const agent = await connect('tk-a02', 'agent');
    const s = await customer.openChat();
    await agent.accept(s.id);
    const stranger = await connect('tk-c02', 'customer');
    const res = await stranger.socket.emitWithAck('chat:message', { sessionId: s.id, clientMsgId: 'x', text: 'hi' });
    assert.deepEqual(res, { ok: false, error: 'Ban khong tham gia phien chat nay' });

    agent.disconnect();
    await until(() => customer.session!.status === 'waiting', 2000);
    await customer.close();
  });

  test('ket noi khong co token hop le bi tu choi ngay khi bat tay', async () => {
    const bad = new ChatClient(url, 'sai', 'customer');
    clients.push(bad);
    await assert.rejects(bad.connected(), /UNAUTHORIZED/);
  });
});
