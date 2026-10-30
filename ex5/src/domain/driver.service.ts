import { Injectable } from '@nestjs/common';
import { USERS } from '../auth/auth.service.js';
import type { Location } from '../contracts/events.js';
import { DomainError, DomainEvents } from './domain-events.js';
import type { Driver } from './models.js';

@Injectable()
export class DriverService {
  private readonly drivers = new Map<string, Driver>();

  constructor(private readonly events: DomainEvents) {
    for (const u of Object.values(USERS)) {
      if (u.role !== 'driver') continue;
      this.drivers.set(u.id, {
        id: u.id,
        name: u.name,
        connections: 0,
        duty: 'off_duty',
        location: null,
        lastSeenAt: null,
        activeOrderId: null,
      });
    }
  }

  get(id: string): Driver {
    const d = this.drivers.get(id);
    if (!d) throw new DomainError('Tai xe khong ton tai');
    return d;
  }

  list(): Driver[] {
    return [...this.drivers.values()];
  }

  connected(id: string) {
    const d = this.get(id);
    d.connections++;
    if (d.connections === 1) this.events.emit('driverChanged', d);
  }

  /** Tra ve true neu day la thiet bi cuoi cung cua tai xe (tai xe thuc su offline). */
  disconnected(id: string): boolean {
    const d = this.get(id);
    d.connections = Math.max(0, d.connections - 1);
    if (d.connections > 0) return false;
    this.events.emit('driverChanged', d);
    return true;
  }

  setDuty(id: string, duty: unknown) {
    if (duty !== 'available' && duty !== 'off_duty') throw new DomainError('Trang thai phai la available hoac off_duty');
    const d = this.get(id);
    if (duty === 'off_duty' && d.activeOrderId) throw new DomainError('Hoan thanh don dang giao truoc khi nghi');
    d.duty = duty;
    this.events.emit('driverChanged', d);
    return d;
  }

  updateLocation(id: string, loc: unknown) {
    const { lat, lng } = (loc ?? {}) as Partial<Location>;
    const valid =
      typeof lat === 'number' && typeof lng === 'number' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    if (!valid) throw new DomainError('Toa do khong hop le');
    const d = this.get(id);
    d.location = { lat, lng };
    d.lastSeenAt = Date.now();
    this.events.emit('driverMoved', { driver: d, location: d.location });
    return d;
  }

  touch(id: string) {
    this.get(id).lastSeenAt = Date.now();
  }

  setActiveOrder(id: string, orderId: string | null) {
    const d = this.get(id);
    d.activeOrderId = orderId;
    this.events.emit('driverChanged', d);
  }
}
