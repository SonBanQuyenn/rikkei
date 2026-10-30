export const TEAMS = ["DON_HANG_VAN_CHUYEN", "THANH_TOAN", "KHO_SAN_PHAM", "KY_THUAT_TAI_KHOAN"] as const;
export type Team = (typeof TEAMS)[number];

// Hang doi phan loai thu cong khi he thong khong kip quyet dinh
export const MANUAL_QUEUE = "PHAN_LOAI_THU_CONG";

export const TEAM_DESCRIPTIONS: Record<Team, string> = {
  DON_HANG_VAN_CHUYEN: "trạng thái đơn, giao hàng, đổi địa chỉ, hủy đơn, giao chậm",
  THANH_TOAN: "thanh toán lỗi, trừ tiền 2 lần, hoàn tiền, hóa đơn",
  KHO_SAN_PHAM: "tồn kho, còn hàng/hết hàng, thông tin sản phẩm, hàng lỗi cần đổi",
  KY_THUAT_TAI_KHOAN: "đăng nhập, tài khoản, lỗi ứng dụng/website, mã giảm giá không áp dụng được",
};

export const MODEL = "claude-haiku-5-5";

// SLA phan hoi khach 5s, chua 0.5s cho phan ghi nhan va tra loi
export const DEADLINE_MS = 4_500;

// Ticket dai: giu phan dau (thuong la de bai) va phan cuoi (tin nhan moi nhat)
export const MAX_TICKET_CHARS = 6_000;
export const HEAD_CHARS = 1_500;

// Toi da so van de tach ra tu mot ticket
export const MAX_ISSUES = 3;
