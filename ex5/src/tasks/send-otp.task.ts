import { requireFields, type TaskDefinition } from './task.types.js';

export type SendOtpData = { otpId: string; phone: string; code: string };

/** Viec gap: gui ma OTP. Khoa chong lap = otpId -> khach khong nhan 2 tin cho cung mot ma. */
export const sendOtpTask: TaskDefinition<SendOtpData> = {
  name: 'send-otp',
  queue: 'critical',
  parse: (d) => requireFields<SendOtpData>(d, ['otpId', 'phone', 'code']),
  idempotencyKey: (d) => `otp:${d.otpId}`,
  async run(d, { ports }) {
    await ports.sms.send(d.phone, `Ma xac thuc ShopFast: ${d.code}`, `otp-${d.otpId}`);
    return { delivered: true };
  },
};
