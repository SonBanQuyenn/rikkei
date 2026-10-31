import { Injectable, NotFoundException } from '@nestjs/common';
import type { PlanName } from './plans.js';

interface Merchant {
  id: string;
  name: string;
  plan: PlanName;
}

interface ApiKey {
  key: string;
  merchantId: string;
  revoked: boolean;
}

export type KeyResolution =
  | { status: 'valid'; merchant: Merchant }
  | { status: 'missing' | 'unknown' | 'revoked' };

/** Kho nha ban hang + khoa API (in-memory, thay bang DB o moi truong that). */
@Injectable()
export class MerchantStore {
  private merchants = new Map<string, Merchant>();
  private keys = new Map<string, ApiKey>();

  constructor() {
    this.addMerchant('m-free', 'Shop Hoa Mai', 'free', 'key-free-001');
    this.addMerchant('m-pro', 'Shop Tan Phat', 'pro', 'key-pro-001');
    this.addMerchant('m-ent', 'Tap doan Dai Viet', 'enterprise', 'key-ent-001');
  }

  addMerchant(id: string, name: string, plan: PlanName, apiKey: string) {
    this.merchants.set(id, { id, name, plan });
    this.keys.set(apiKey, { key: apiKey, merchantId: id, revoked: false });
  }

  resolveKey(key: string | undefined): KeyResolution {
    if (!key) return { status: 'missing' };
    const apiKey = this.keys.get(key);
    if (!apiKey) return { status: 'unknown' };
    if (apiKey.revoked) return { status: 'revoked' };
    // Luon doc goi HIEN TAI cua nha ban hang -> nang goi co hieu luc ngay request ke tiep
    return { status: 'valid', merchant: this.getMerchant(apiKey.merchantId) };
  }

  changePlan(merchantId: string, plan: PlanName) {
    const merchant = this.getMerchant(merchantId);
    merchant.plan = plan;
    return merchant;
  }

  revokeKey(key: string) {
    const apiKey = this.keys.get(key);
    if (!apiKey) throw new NotFoundException(`Khong tim thay khoa API ${key}`);
    apiKey.revoked = true;
  }

  private getMerchant(id: string) {
    const merchant = this.merchants.get(id);
    if (!merchant) throw new NotFoundException(`Khong tim thay nha ban hang ${id}`);
    return merchant;
  }
}
