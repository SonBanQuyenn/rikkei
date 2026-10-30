// --- phia server ---
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

/** Token gia lap -> ma tai xe. */
export const DRIVER_TOKENS: Record<string, string> = {
  'token-tx01': 'TX01',
  'token-tx02': 'TX02',
};

export const zoneRoom = (zone: string) => `zone:${zone}`;

@WebSocketGateway({
  cors: { origin: '*' },
  // (5) khoang thoi gian cho truoc khi coi la mat ket noi:
  //     server ping moi 10s, khong nhan pong trong 5s -> dong ket noi, phat 'disconnect'.
  //     => dien thoai tat may/mat song bi danh dau offline sau toi da ~15s
  //        thay vi treo "online" mai.
  pingInterval: 10_000,
  pingTimeout: 5_000,
})
export class DriverGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger('DriverGateway');

  /** driverId -> so socket dang mo (1 tai xe co the co 2 thiet bi). */
  readonly online = new Map<string, number>();
  /** Dem so lan bat tay toi server - dung de quan sat bao request. */
  handshakes = 0;

  afterInit(server: Server) {
    server.use((socket, next) => {
      this.handshakes++;
      const driverId = DRIVER_TOKENS[socket.handshake.auth?.token];
      if (!driverId) return next(new Error('UNAUTHORIZED'));
      socket.data.driverId = driverId;
      next();
    });
  }

  handleConnection(client: Socket) {
    const id: string = client.data.driverId;
    this.online.set(id, (this.online.get(id) ?? 0) + 1);
    this.logger.log(`${id} ONLINE (socket ${client.id})`);
  }

  handleDisconnect(client: Socket) {
    const id: string = client.data.driverId;
    if (!id) return;
    const left = (this.online.get(id) ?? 1) - 1;
    if (left <= 0) this.online.delete(id);
    else this.online.set(id, left);
    this.logger.log(`${id} OFFLINE (${left} thiet bi con lai)`);
  }

  @SubscribeMessage('driver:join_zones')
  async joinZones(@MessageBody() zones: unknown, @ConnectedSocket() client: Socket) {
    if (!Array.isArray(zones) || !zones.every((z) => typeof z === 'string')) {
      return { ok: false, error: 'zones phai la mang chuoi' };
    }
    await client.join(zones.map(zoneRoom));
    this.logger.log(`${client.data.driverId} dang ky khu vuc: ${zones.join(', ')}`);
    return { ok: true };
  }

  dispatchToZone(zone: string, orderId: string) {
    this.server.to(zoneRoom(zone)).emit('order:new', { orderId, zone });
  }
}
