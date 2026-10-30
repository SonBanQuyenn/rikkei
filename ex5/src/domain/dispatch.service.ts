import { Injectable } from '@nestjs/common';
import type { AlertType } from '../contracts/events.js';
import { DriverService } from './driver.service.js';
import { DomainError, DomainEvents } from './domain-events.js';
import { availabilityOf, type Order } from './models.js';
import { OrderService } from './order.service.js';

const UNAVAILABLE_LABEL = { offline: 'offline', off_duty: 'nghi', busy: 'ban don khac' } as const;

/** Nghiep vu dieu phoi: gan don, tai xe phan hoi, cap nhat tien do, canh bao. */
@Injectable()
export class DispatchService {
  constructor(
    private readonly orders: OrderService,
    private readonly drivers: DriverService,
    private readonly events: DomainEvents,
  ) {}

  /** Dieu phoi vien gan (hoac gan lai) don cho tai xe. */
  assign(orderId: unknown, driverId: unknown): Order {
    const order = this.orders.get(orderId);
    if (typeof driverId !== 'string') throw new DomainError('Thieu ma tai xe');
    const driver = this.drivers.get(driverId);
    if (order.driverId === driver.id) throw new DomainError('Don da duoc giao cho tai xe nay');
    if (order.status === 'picked_up' || order.status === 'delivered') {
      throw new DomainError('Don da lay hang, khong the gan lai');
    }
    const availability = availabilityOf(driver);
    if (availability !== 'available') {
      throw new DomainError(`${driver.name} dang ${UNAVAILABLE_LABEL[availability]}, khong the nhan don`);
    }

    // Gan lai: thu hoi don khoi tai xe cu
    const previous = order.driverId;
    if (previous) this.drivers.setActiveOrder(previous, null);
    this.drivers.setActiveOrder(driver.id, order.id);
    this.orders.transition(
      order,
      'offered',
      driver.id,
      previous ? { driverId: previous, reason: 'Dieu phoi vien da chuyen don cho tai xe khac' } : undefined,
    );
    return order;
  }

  respond(driverId: string, orderId: unknown, accept: unknown): Order {
    if (typeof accept !== 'boolean') throw new DomainError('accept phai la true/false');
    const order = this.orders.get(orderId);
    if (order.driverId !== driverId || order.status !== 'offered') {
      throw new DomainError('Ban khong co de nghi nhan don nay');
    }
    this.drivers.touch(driverId);
    if (accept) {
      this.orders.transition(order, 'accepted', driverId);
    } else {
      this.release(order, 'DRIVER_REJECTED', `${this.drivers.get(driverId).name} tu choi don ${order.id}`);
    }
    return order;
  }

  progress(driverId: string, orderId: unknown, status: unknown): Order {
    const order = this.orders.get(orderId);
    if (order.driverId !== driverId) throw new DomainError('Don nay khong phai cua ban');
    const allowed = (order.status === 'accepted' && status === 'picked_up') || (order.status === 'picked_up' && status === 'delivered');
    if (!allowed) throw new DomainError(`Khong the chuyen don tu ${order.status} sang ${String(status)}`);

    this.drivers.touch(driverId);
    this.orders.transition(order, status, driverId);
    if (status === 'delivered') this.drivers.setActiveOrder(driverId, null);
    return order;
  }

  /** Tai xe mat ket noi het thiet bi. */
  driverWentOffline(driverId: string) {
    const driver = this.drivers.get(driverId);
    if (!driver.activeOrderId) return;
    const order = this.orders.get(driver.activeOrderId);
    this.alert('DRIVER_DISCONNECTED', `${driver.name} mat ket noi khi dang xu ly don ${order.id} (${order.status})`, order.id, driverId);
  }

  /** Thu hoi don khoi tai xe, dua ve hang cho va bao dieu phoi vien. */
  release(order: Order, type: AlertType, message: string) {
    const driverId = order.driverId!;
    this.drivers.setActiveOrder(driverId, null);
    this.orders.transition(order, 'pending', null, { driverId, reason: message });
    this.alert(type, message, order.id, driverId);
  }

  alert(type: AlertType, message: string, orderId: string | null, driverId: string | null) {
    this.events.emit('alert', { type, message, orderId, driverId, at: Date.now() });
  }
}
