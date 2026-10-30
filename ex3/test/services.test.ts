import { test } from "node:test";
import assert from "node:assert/strict";
import { getOrder, updateShippingAddress } from "../src/services.ts";
import { findProvince } from "../src/address.ts";

test("Đổi thành công: đơn CHO_XAC_NHAN, cùng tỉnh", () => {
  const r = updateShippingAddress("KH01", "1001", "  25   Láng Hạ,  phường Láng ", "ha noi");
  assert.equal(r.newAddress.street, "25 Láng Hạ, phường Láng");
  assert.equal(r.newAddress.province, "Hà Nội");
});

test("Mỗi đơn chỉ đổi 1 lần: đổi lần 2 đơn 1001 bị từ chối", () => {
  assert.throws(() => updateShippingAddress("KH01", "1001", "1 Kim Mã, phường Ba Đình", "Hà Nội"), /tối đa 1 lần/);
});

test("Đơn DANG_CHUAN_BI được đổi, viết tắt HCM vẫn nhận ra", () => {
  const r = updateShippingAddress("KH01", "1002", "10 Pasteur, phường Bến Thành", "HCM");
  assert.equal(r.newAddress.province, "TP Hồ Chí Minh");
});

test("Đơn DANG_GIAO / DA_GIAO: từ chối và hướng dẫn gọi tổng đài", () => {
  assert.throws(() => updateShippingAddress("KH01", "1003", "1 Kim Mã, phường Ba Đình", "Hà Nội"), /tổng đài/);
  assert.throws(() => updateShippingAddress("KH01", "1004", "1 Kim Mã, phường Ba Đình", "Đà Nẵng"), /tổng đài/);
  assert.equal(getOrder("KH01", "1003").canChangeAddress, false);
});

test("Khác tỉnh: yêu cầu hủy đơn và đặt lại", () => {
  assert.throws(() => updateShippingAddress("KH02", "2001", "1 Kim Mã, phường Ba Đình", "Hà Nội"), /hủy đơn và đặt lại/);
});

test("Bẫy: địa chỉ chỉ có khoảng trắng", () => {
  assert.throws(() => updateShippingAddress("KH02", "2001", "     ", "Hải Phòng"), /trống hoặc quá ngắn/);
});

test("Bẫy: thiếu tỉnh/thành hoặc tỉnh không tồn tại", () => {
  assert.throws(() => updateShippingAddress("KH02", "2001", "5 Văn Cao, phường Gia Viên", "   "), /thiếu tỉnh\/thành/);
  assert.throws(() => updateShippingAddress("KH02", "2001", "5 Văn Cao, phường Gia Viên", "Hà Tây"), /chưa nhận ra/);
});

test("Bẫy: đơn của khách khác - không đọc, không ghi được", () => {
  assert.throws(() => getOrder("KH01", "2001"), /Không tìm thấy đơn 2001 trong tài khoản của bạn/);
  assert.throws(() => updateShippingAddress("KH01", "2001", "5 Văn Cao, phường Gia Viên", "Hải Phòng"), /Không tìm thấy/);
  // Don van giu nguyen dia chi cu
  assert.equal(getOrder("KH02", "2001").currentAddress.street, "99 Lạch Tray, phường Gia Viên");
});

test("Nhận diện tên tỉnh", () => {
  assert.equal(findProvince("Thành phố Hồ Chí Minh"), "TP Hồ Chí Minh");
  assert.equal(findProvince("tỉnh Đắk Lắk"), "Đắk Lắk");
  assert.equal(findProvince("TP. Đà Nẵng"), "Đà Nẵng");
  assert.equal(findProvince("Sài Gòn"), "TP Hồ Chí Minh");
});
