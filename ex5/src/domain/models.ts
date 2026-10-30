import type { DriverAvailability, Location, OrderStatus } from '../contracts/events.js';

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  pickup: string;
  dropoff: string;
  status: OrderStatus;
  driverId: string | null;
  createdAt: number;
  statusSince: number;
}

export interface Driver {
  id: string;
  name: string;
  /** So thiet bi dang ket noi. 0 = offline. */
  connections: number;
  duty: 'available' | 'off_duty';
  location: Location | null;
  /** Lan cuoi tai xe gui vi tri / tien do. */
  lastSeenAt: number | null;
  activeOrderId: string | null;
}

export function availabilityOf(d: Driver): DriverAvailability {
  if (d.connections === 0) return 'offline';
  if (d.activeOrderId) return 'busy';
  return d.duty;
}
