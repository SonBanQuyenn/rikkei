// Đọc bí mật kết nối CSDL từ Secrets Manager, có cache ngắn hạn và làm mới theo yêu cầu.
import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

export class CachedSecret {
  /**
   * @param {import('@aws-sdk/client-secrets-manager').SecretsManagerClient} client
   * @param {string} secretId
   * @param {number} ttlMs
   */
  constructor(client, secretId, ttlMs) {
    this.client = client;
    this.secretId = secretId;
    this.ttlMs = ttlMs;
    this.value = null;
    this.versionId = null;
    this.fetchedAt = 0;
    this.inflight = null;
  }

  /** Trả về JSON bí mật (phiên bản AWSCURRENT). forceRefresh=true khi vừa gặp lỗi xác thực. */
  async get({ forceRefresh = false } = {}) {
    const fresh = this.value && Date.now() - this.fetchedAt < this.ttlMs;
    if (fresh && !forceRefresh) return this.value;
    // Gộp các lời gọi đồng thời thành một request
    if (!this.inflight) {
      this.inflight = this.client
        .send(new GetSecretValueCommand({ SecretId: this.secretId, VersionStage: 'AWSCURRENT' }))
        .then((res) => {
          const changed = this.versionId && this.versionId !== res.VersionId;
          this.value = JSON.parse(res.SecretString);
          this.versionId = res.VersionId;
          this.fetchedAt = Date.now();
          if (changed) console.info(`[secrets] ${this.secretId} đã xoay vòng sang phiên bản ${res.VersionId}`);
          return this.value;
        })
        .finally(() => {
          this.inflight = null;
        });
    }
    return this.inflight;
  }
}
