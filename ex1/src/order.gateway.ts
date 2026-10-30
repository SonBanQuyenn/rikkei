import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

/** Moi don hang co mot room rieng: chi socket dang theo doi don do moi o trong room. */
export const orderRoom = (orderId: string) => `order:${orderId}`;

@WebSocketGateway({ cors: { origin: '*' } })
export class OrderGateway implements OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(OrderGateway.name);

  // Khong con Map tu quan ly: socket.io tu theo doi thanh vien room va tu xoa
  // socket khoi moi room khi no ngat ket noi -> khong con gi ro ri sau disconnect.
  // Mot client cung theo doi duoc nhieu don (moi don mot room), khong bi ghi de.

  @SubscribeMessage('order:track')
  async handleTrack(@MessageBody() orderId: unknown, @ConnectedSocket() client: Socket) {
    if (typeof orderId !== 'string' || orderId.trim() === '') {
      return { ok: false, error: 'orderId khong hop le' };
    }
    await client.join(orderRoom(orderId));
    return { ok: true };
  }

  @SubscribeMessage('order:untrack')
  async handleUntrack(@MessageBody() orderId: unknown, @ConnectedSocket() client: Socket) {
    if (typeof orderId !== 'string') return { ok: false, error: 'orderId khong hop le' };
    await client.leave(orderRoom(orderId));
    return { ok: true };
  }

  notifyStatusChanged(orderId: string, status: string) {
    // Chi phat vao room cua don hang, khong broadcast toan server.
    this.server.to(orderRoom(orderId)).emit('order:updated', { orderId, status });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`client roi di: ${client.id}`);
  }
}
