/**
 * Hop dong su kien cua Trung tam dieu phoi giao hang.
 * Day la nguon duy nhat cho ten su kien va kieu du lieu - gateway, client va test cung dung.
 */

export type Role = 'customer' | 'driver' | 'dispatcher';

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
}

export type OrderStatus = 'pending' | 'offered' | 'accepted' | 'picked_up' | 'delivered';
export type DriverAvailability = 'offline' | 'off_duty' | 'available' | 'busy';

export interface Location {
  lat: number;
  lng: number;
}

/** Ban day du - chi dieu phoi vien nhan. */
export interface OrderView {
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

/** Ban rut gon cho khach: khong co thong tin khach khac hay noi bo dieu phoi. */
export interface CustomerOrderView {
  orderId: string;
  status: OrderStatus;
  driverName: string | null;
  updatedAt: number;
}

/** Ban cho tai xe: chi nhung gi can de giao don. */
export interface DriverTaskView {
  orderId: string;
  pickup: string;
  dropoff: string;
  customerName: string;
  status: OrderStatus;
}

export interface DriverView {
  id: string;
  name: string;
  availability: DriverAvailability;
  location: Location | null;
  lastSeenAt: number | null;
  activeOrderId: string | null;
}

export type AlertType = 'ORDER_STUCK' | 'OFFER_TIMEOUT' | 'DRIVER_REJECTED' | 'DRIVER_SILENT' | 'DRIVER_DISCONNECTED';

export interface DispatchAlert {
  type: AlertType;
  orderId: string | null;
  driverId: string | null;
  message: string;
  at: number;
}

// ---------------- Client -> Server ----------------

export const C2S = {
  CUSTOMER_PLACE_ORDER: 'customer:place_order',
  DRIVER_SET_STATUS: 'driver:set_status',
  DRIVER_LOCATION: 'driver:location',
  DRIVER_RESPOND: 'driver:respond',
  DRIVER_PROGRESS: 'driver:progress',
  DISPATCH_ASSIGN: 'dispatch:assign',
} as const;

export interface PlaceOrderPayload {
  pickup: string;
  dropoff: string;
}
export interface SetStatusPayload {
  status: 'available' | 'off_duty';
}
export type LocationPayload = Location;
export interface RespondPayload {
  orderId: string;
  accept: boolean;
}
export interface ProgressPayload {
  orderId: string;
  status: 'picked_up' | 'delivered';
}
export interface AssignPayload {
  orderId: string;
  driverId: string;
}

/** Moi su kien client -> server deu nhan ack dang nay. */
export type Ack<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/** Vai tro duoc phep gui tung su kien. */
export const C2S_ROLES: Record<(typeof C2S)[keyof typeof C2S], Role> = {
  [C2S.CUSTOMER_PLACE_ORDER]: 'customer',
  [C2S.DRIVER_SET_STATUS]: 'driver',
  [C2S.DRIVER_LOCATION]: 'driver',
  [C2S.DRIVER_RESPOND]: 'driver',
  [C2S.DRIVER_PROGRESS]: 'driver',
  [C2S.DISPATCH_ASSIGN]: 'dispatcher',
};

// ---------------- Server -> Client ----------------

export const S2C = {
  /** -> dieu phoi vien khi vua ket noi: { orders: OrderView[], drivers: DriverView[] } */
  DISPATCH_SNAPSHOT: 'dispatch:snapshot',
  /** -> dieu phoi vien: OrderView */
  DISPATCH_ORDER: 'dispatch:order_updated',
  /** -> dieu phoi vien: DriverView */
  DISPATCH_DRIVER: 'dispatch:driver_updated',
  /** -> dieu phoi vien: DispatchAlert */
  DISPATCH_ALERT: 'dispatch:alert',
  /** -> dung tai xe duoc giao: DriverTaskView */
  DRIVER_TASK: 'driver:task',
  /** -> tai xe bi thu hoi don: { orderId, reason } */
  DRIVER_TASK_REVOKED: 'driver:task_revoked',
  /** -> dung khach chu don: CustomerOrderView */
  CUSTOMER_ORDER: 'customer:order_status',
  /** -> dung khach chu don khi don dang giao: { orderId, location } */
  CUSTOMER_DRIVER_LOCATION: 'customer:driver_location',
} as const;

export interface DispatchSnapshot {
  orders: OrderView[];
  drivers: DriverView[];
}
export interface TaskRevoked {
  orderId: string;
  reason: string;
}
export interface CustomerDriverLocation {
  orderId: string;
  location: Location;
}
