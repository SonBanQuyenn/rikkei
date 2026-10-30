import { Logger, OnModuleDestroy } from '@nestjs/common';
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
import { AuthService } from '../auth/auth.service.js';
import {
  C2S,
  C2S_ROLES,
  S2C,
  type Ack,
  type AssignPayload,
  type AuthUser,
  type PlaceOrderPayload,
  type ProgressPayload,
  type RespondPayload,
  type SetStatusPayload,
} from '../contracts/events.js';
import { DispatchService } from '../domain/dispatch.service.js';
import { DomainError, DomainEvents, type DomainEventMap } from '../domain/domain-events.js';
import { DriverService } from '../domain/driver.service.js';
import { OrderService } from '../domain/order.service.js';
import { wsAuth } from './ws-auth.middleware.js';
import { toCustomerView, toDriverTask, toDriverView, toOrderView } from './projections.js';

const Rooms = {
  dispatchers: 'dispatchers',
  driver: (id: string) => `driver:${id}`,
  customer: (id: string) => `customer:${id}`,
};

/**
 * Tang realtime: xac thuc, gan room theo vai tro, nhan lenh tu client va
 * phat su kien nghiep vu toi dung nhom nguoi nhan. Khong chua quy tac nghiep vu.
 */
@WebSocketGateway({
  cors: { origin: '*' },
  pingInterval: 10_000,
  pingTimeout: 5_000,
  maxHttpBufferSize: 10_000,
})
export class DispatchGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(DispatchGateway.name);
  private readonly unbind: Array<() => void> = [];

  constructor(
    private readonly auth: AuthService,
    private readonly events: DomainEvents,
    private readonly orders: OrderService,
    private readonly drivers: DriverService,
    private readonly dispatch: DispatchService,
  ) {}

  afterInit(server: Server) {
    server.use(wsAuth(this.auth));
    this.on('orderChanged', ({ order, revokedFrom }) => {
      this.server.to(Rooms.dispatchers).emit(S2C.DISPATCH_ORDER, toOrderView(order));
      const driverName = order.driverId ? this.drivers.get(order.driverId).name : null;
      this.server.to(Rooms.customer(order.customerId)).emit(S2C.CUSTOMER_ORDER, toCustomerView(order, driverName));
      if (order.driverId) this.server.to(Rooms.driver(order.driverId)).emit(S2C.DRIVER_TASK, toDriverTask(order));
      if (revokedFrom) {
        this.server
          .to(Rooms.driver(revokedFrom.driverId))
          .emit(S2C.DRIVER_TASK_REVOKED, { orderId: order.id, reason: revokedFrom.reason });
      }
    });
    this.on('driverChanged', (driver) => {
      this.server.to(Rooms.dispatchers).emit(S2C.DISPATCH_DRIVER, toDriverView(driver));
    });
    this.on('driverMoved', ({ driver, location }) => {
      this.server.to(Rooms.dispatchers).emit(S2C.DISPATCH_DRIVER, toDriverView(driver));
      // Khach chi thay vi tri tai xe dang giao chinh don cua minh
      if (!driver.activeOrderId) return;
      const order = this.orders.get(driver.activeOrderId);
      if (order.status === 'accepted' || order.status === 'picked_up') {
        this.server.to(Rooms.customer(order.customerId)).emit(S2C.CUSTOMER_DRIVER_LOCATION, { orderId: order.id, location });
      }
    });
    this.on('alert', (alert) => {
      this.logger.warn(`[${alert.type}] ${alert.message}`);
      this.server.to(Rooms.dispatchers).emit(S2C.DISPATCH_ALERT, alert);
    });
  }

  async handleConnection(socket: Socket) {
    const user = this.userOf(socket);
    try {
      if (user.role === 'dispatcher') {
        await socket.join(Rooms.dispatchers);
        socket.emit(S2C.DISPATCH_SNAPSHOT, {
          orders: this.orders.list().map(toOrderView),
          drivers: this.drivers.list().map(toDriverView),
        });
      } else if (user.role === 'driver') {
        await socket.join(Rooms.driver(user.id));
        this.drivers.connected(user.id);
        // Noi lai giua chung: gui lai nhiem vu dang lam
        const active = this.drivers.get(user.id).activeOrderId;
        if (active) socket.emit(S2C.DRIVER_TASK, toDriverTask(this.orders.get(active)));
      } else {
        await socket.join(Rooms.customer(user.id));
        for (const o of this.orders.ofCustomer(user.id)) {
          if (o.status === 'delivered') continue;
          const driverName = o.driverId ? this.drivers.get(o.driverId).name : null;
          socket.emit(S2C.CUSTOMER_ORDER, toCustomerView(o, driverName));
        }
      }
      this.logger.log(`${user.role} ${user.id} ket noi (${socket.id})`);
    } catch (err) {
      this.logger.error(err);
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    const user: AuthUser | undefined = socket.data.user;
    if (!user) return; // bi tu choi tu luc bat tay
    this.logger.log(`${user.role} ${user.id} ngat ket noi`);
    try {
      // Room do socket.io tu don; chi can cap nhat trang thai tai xe
      if (user.role === 'driver' && this.drivers.disconnected(user.id)) this.dispatch.driverWentOffline(user.id);
    } catch (err) {
      this.logger.error(err);
    }
  }

  @SubscribeMessage(C2S.CUSTOMER_PLACE_ORDER)
  placeOrder(@MessageBody() body: PlaceOrderPayload, @ConnectedSocket() socket: Socket) {
    return this.run(socket, C2S.CUSTOMER_PLACE_ORDER, (user) => {
      const order = this.orders.place(user, body);
      return toCustomerView(order, null);
    });
  }

  @SubscribeMessage(C2S.DRIVER_SET_STATUS)
  setStatus(@MessageBody() body: SetStatusPayload, @ConnectedSocket() socket: Socket) {
    return this.run(socket, C2S.DRIVER_SET_STATUS, (user) => toDriverView(this.drivers.setDuty(user.id, body?.status)));
  }

  @SubscribeMessage(C2S.DRIVER_LOCATION)
  location(@MessageBody() body: unknown, @ConnectedSocket() socket: Socket) {
    return this.run(socket, C2S.DRIVER_LOCATION, (user) => {
      this.drivers.updateLocation(user.id, body);
      return null;
    });
  }

  @SubscribeMessage(C2S.DRIVER_RESPOND)
  respond(@MessageBody() body: RespondPayload, @ConnectedSocket() socket: Socket) {
    return this.run(socket, C2S.DRIVER_RESPOND, (user) =>
      toDriverTask(this.dispatch.respond(user.id, body?.orderId, body?.accept)),
    );
  }

  @SubscribeMessage(C2S.DRIVER_PROGRESS)
  progress(@MessageBody() body: ProgressPayload, @ConnectedSocket() socket: Socket) {
    return this.run(socket, C2S.DRIVER_PROGRESS, (user) =>
      toDriverTask(this.dispatch.progress(user.id, body?.orderId, body?.status)),
    );
  }

  @SubscribeMessage(C2S.DISPATCH_ASSIGN)
  assign(@MessageBody() body: AssignPayload, @ConnectedSocket() socket: Socket) {
    return this.run(socket, C2S.DISPATCH_ASSIGN, () => toOrderView(this.dispatch.assign(body?.orderId, body?.driverId)));
  }

  /** Kiem tra quyen theo hop dong + bat moi ngoai le: client luon nhan ack, server khong bao gio crash. */
  private run<T>(socket: Socket, event: keyof typeof C2S_ROLES, fn: (user: AuthUser) => T): Ack<T> {
    const user = this.userOf(socket);
    if (C2S_ROLES[event] !== user.role) return { ok: false, error: 'Ban khong co quyen thuc hien thao tac nay' };
    try {
      return { ok: true, data: fn(user) };
    } catch (err) {
      if (err instanceof DomainError) return { ok: false, error: err.message };
      this.logger.error(err);
      return { ok: false, error: 'Loi he thong, vui long thu lai' };
    }
  }

  /** Dang ky listener tu tang nghiep vu; loi khi phat khong duoc lan nguoc vao nghiep vu. */
  private on<K extends keyof DomainEventMap>(event: K, handler: (...args: DomainEventMap[K]) => void) {
    const safe = (...args: DomainEventMap[K]) => {
      try {
        handler(...args);
      } catch (err) {
        this.logger.error(err);
      }
    };
    this.events.on(event, safe as never);
    this.unbind.push(() => this.events.off(event, safe as never));
  }

  private userOf(socket: Socket): AuthUser {
    return socket.data.user;
  }

  onModuleDestroy() {
    this.unbind.forEach((fn) => fn());
  }
}
