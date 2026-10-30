import type { CustomerOrderView, DriverTaskView, DriverView, OrderView } from '../contracts/events.js';
import { availabilityOf, type Driver, type Order } from '../domain/models.js';

/** Moi nhom nguoi dung chi nhan dung phan du lieu thuoc pham vi cua minh. */

export const toOrderView = (o: Order): OrderView => ({ ...o });

export const toCustomerView = (o: Order, driverName: string | null): CustomerOrderView => ({
  orderId: o.id,
  status: o.status,
  // Khach chi biet ten tai xe sau khi tai xe da nhan don
  driverName: o.status === 'offered' || o.status === 'pending' ? null : driverName,
  updatedAt: o.statusSince,
});

export const toDriverTask = (o: Order): DriverTaskView => ({
  orderId: o.id,
  pickup: o.pickup,
  dropoff: o.dropoff,
  customerName: o.customerName,
  status: o.status,
});

export const toDriverView = (d: Driver): DriverView => ({
  id: d.id,
  name: d.name,
  availability: availabilityOf(d),
  location: d.location,
  lastSeenAt: d.lastSeenAt,
  activeOrderId: d.activeOrderId,
});
