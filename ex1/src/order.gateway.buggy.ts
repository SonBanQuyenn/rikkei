// Ban goc dang chay tren staging - giu nguyen de tai hien loi trong test.
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class BuggyOrderGateway {
  @WebSocketServer() server: Server;
  tracked = new Map<string, string>();

  @SubscribeMessage('order:track')
  handleTrack(@MessageBody() orderId: string, @ConnectedSocket() client: Socket) {
    this.tracked.set(client.id, orderId);
    return { ok: true };
  }

  notifyStatusChanged(orderId: string, status: string) {
    this.server.emit('order:updated', { orderId, status });
  }

  handleDisconnect(client: Socket) {
    console.log('client roi di:', client.id);
  }
}
