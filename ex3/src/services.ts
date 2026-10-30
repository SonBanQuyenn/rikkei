// Nghiep vu doi dia chi - moi rang buoc deu kiem tra o day, khong phu thuoc vao model
import { HOTLINE, orders, type Order, type OrderStatus } from "./data.ts";
import { cleanText, findProvince } from "./address.ts";

// Loi nghiep vu: message than thien, model doc lai cho khach
export class BusinessError extends Error {}

const CHANGEABLE: OrderStatus[] = ["CHO_XAC_NHAN", "DANG_CHUAN_BI"];
const MAX_ADDRESS_CHANGES = 1;

const STATUS_LABEL: Record<OrderStatus, string> = {
  CHO_XAC_NHAN: "chờ xác nhận",
  DANG_CHUAN_BI: "đang chuẩn bị hàng",
  DANG_GIAO: "đang giao",
  DA_GIAO: "đã giao",
  DA_HUY: "đã hủy",
};

// Bay: don khong thuoc ve khach -> bao "khong tim thay", khong tiet lo don ton tai
function getOwnedOrder(customerId: string, orderId: string): Order {
  const order = orders.get(cleanText(orderId));
  if (!order || order.customerId !== customerId) {
    throw new BusinessError(`Không tìm thấy đơn ${orderId} trong tài khoản của bạn. Bạn kiểm tra lại mã đơn giúp ShopFast nhé.`);
  }
  return order;
}

// Kiem tra don co du dieu kien doi dia chi khong (dung chung cho tool doc va tool ghi)
function checkChangeable(order: Order): string | null {
  if (order.status === "DANG_GIAO" || order.status === "DA_GIAO") {
    return `Đơn ${order.orderId} ${STATUS_LABEL[order.status]} nên không thể đổi địa chỉ nữa. Bạn vui lòng liên hệ tổng đài ${HOTLINE} để được hỗ trợ.`;
  }
  if (!CHANGEABLE.includes(order.status)) {
    return `Đơn ${order.orderId} ${STATUS_LABEL[order.status]} nên không thể đổi địa chỉ.`;
  }
  if (order.addressChangeCount >= MAX_ADDRESS_CHANGES) {
    return `Đơn ${order.orderId} đã đổi địa chỉ ${order.addressChangeCount} lần. Mỗi đơn chỉ được đổi tối đa ${MAX_ADDRESS_CHANGES} lần.`;
  }
  return null;
}

// Tool doc
export function getOrder(customerId: string, orderId: string) {
  const order = getOwnedOrder(customerId, orderId);
  const blockedReason = checkChangeable(order);
  return {
    orderId: order.orderId,
    status: order.status,
    statusLabel: STATUS_LABEL[order.status],
    currentAddress: order.address,
    addressChangeCount: order.addressChangeCount,
    canChangeAddress: blockedReason === null,
    blockedReason,
  };
}

// Tool ghi - kiem tra lai TAT CA dieu kien ngay truoc khi ghi
export function updateShippingAddress(customerId: string, orderId: string, street: string, province: string) {
  const order = getOwnedOrder(customerId, orderId);

  const blockedReason = checkChangeable(order);
  if (blockedReason) throw new BusinessError(blockedReason);

  // Bay: dia chi chi co khoang trang
  const cleanStreet = cleanText(street ?? "");
  if (cleanStreet.length < 5 || !/[\p{L}\d]/u.test(cleanStreet)) {
    throw new BusinessError("Địa chỉ mới đang trống hoặc quá ngắn. Bạn vui lòng cho biết số nhà, tên đường và phường/xã nhé.");
  }

  // Bay: thieu ten tinh/thanh
  const cleanProvince = cleanText(province ?? "");
  if (!cleanProvince) {
    throw new BusinessError("Địa chỉ mới còn thiếu tỉnh/thành phố. Bạn bổ sung giúp ShopFast nhé.");
  }
  const newProvince = findProvince(cleanProvince);
  if (!newProvince) {
    throw new BusinessError(`ShopFast chưa nhận ra tỉnh/thành "${cleanProvince}". Bạn kiểm tra lại tên tỉnh/thành phố giúp nhé.`);
  }

  if (newProvince !== order.address.province) {
    throw new BusinessError(
      `Địa chỉ mới ở ${newProvince}, khác tỉnh/thành với địa chỉ cũ (${order.address.province}). ` +
        "Trường hợp này không đổi địa chỉ được, bạn cần hủy đơn và đặt lại đơn mới.",
    );
  }

  const oldAddress = order.address;
  order.address = { street: cleanStreet, province: newProvince };
  order.addressChangeCount += 1;
  return { orderId: order.orderId, oldAddress, newAddress: order.address, message: "Đã cập nhật địa chỉ giao hàng." };
}
