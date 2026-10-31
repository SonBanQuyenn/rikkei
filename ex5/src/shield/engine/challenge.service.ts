import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, randomInt } from 'node:crypto';
import { Clock } from '../clock.js';
import { PolicyConfigStore } from '../config/policy-config.store.js';
import { ShieldStore } from '../storage/shield-store.js';
import { BlockLogService } from './block-log.service.js';

interface Challenge {
  id: string;
  question: string;
  answer: string;
  deviceId: string;
  blockLogId: string;
  attempts: number;
}

interface Pass {
  deviceId: string;
}

const challengeKey = (id: string) => `challenge:${id}`;
const passKey = (token: string) => `pass:${token}`;

/**
 * Thu thach thay cho chan cung: nguoi that luon co duong di tiep (giai thu thach),
 * bot tu dong thi dung lai. Moi lan giai dung = mot lan chan nham da duoc do.
 * (Mo phong CAPTCHA bang phep cong; thuc te thay bang reCAPTCHA/Turnstile/OTP.)
 */
@Injectable()
export class ChallengeService {
  constructor(
    private readonly store: ShieldStore,
    private readonly config: PolicyConfigStore,
    private readonly blockLog: BlockLogService,
    private readonly clock: Clock,
  ) {}

  issue(deviceId: string, blockLogId: string, id = `chl-${randomBytes(8).toString('hex')}`) {
    const a = randomInt(1, 10);
    const b = randomInt(1, 10);
    const challenge: Challenge = { id, question: `${a} + ${b} = ?`, answer: String(a + b), deviceId, blockLogId, attempts: 0 };
    this.store.put(challengeKey(id), challenge, this.clock.now(), this.config.get().challenge.challengeTtlMs);
    return { id, question: challenge.question };
  }

  solve(id: string, deviceId: string, answer: unknown) {
    const now = this.clock.now();
    const challenge = this.store.get<Challenge>(challengeKey(id), now);
    if (!challenge || challenge.deviceId !== deviceId) throw new NotFoundException('Thử thách không tồn tại hoặc đã hết hạn.');

    if (String(answer ?? '').trim() !== challenge.answer) {
      challenge.attempts++;
      if (challenge.attempts >= this.config.get().challenge.maxAttempts) this.store.delete(challengeKey(id));
      else this.store.put(challengeKey(id), challenge, now, this.config.get().challenge.challengeTtlMs);
      throw new BadRequestException('Câu trả lời chưa đúng.');
    }

    this.store.delete(challengeKey(id));
    this.blockLog.markFalsePositive(challenge.blockLogId, 'challenge-solved');
    const passToken = `pass-${randomBytes(12).toString('hex')}`;
    const ttl = this.config.get().challenge.passTtlMs;
    this.store.put<Pass>(passKey(passToken), { deviceId }, now, ttl);
    return { passToken, expiresInSeconds: Math.floor(ttl / 1000) };
  }

  isValidPass(token: string | undefined, deviceId: string, now: number) {
    if (!token) return false;
    return this.store.get<Pass>(passKey(token), now)?.deviceId === deviceId;
  }
}
