import { EventEmitter } from 'node:events';
import { Injectable } from '@nestjs/common';
import type { DispatchAlert, Location } from '../contracts/events.js';
import type { Driver, Order } from './models.js';

/** Su kien noi bo cua tang nghiep vu - gateway lang nghe va quyet dinh ai nhan gi. */
export interface DomainEventMap {
  orderChanged: [{ order: Order; revokedFrom?: { driverId: string; reason: string } }];
  driverChanged: [Driver];
  driverMoved: [{ driver: Driver; location: Location }];
  alert: [DispatchAlert];
}

/** Tach tang nghiep vu khoi tang realtime: domain chi "phat", khong biet socket/room. */
@Injectable()
export class DomainEvents extends EventEmitter<DomainEventMap> {}

export class DomainError extends Error {}
