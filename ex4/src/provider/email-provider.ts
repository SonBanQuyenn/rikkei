export type SendRequest = {
  to: string;
  subject: string;
  html: string;
  /** Nha cung cap khong gui lan hai cho cung khoa (chong trung khi thu lai sau timeout). */
  idempotencyKey: string;
  kind: 'campaign' | 'transactional';
};

/** Dia chi khong ton tai (hard bounce 550) - thu lai vo ich. */
export class InvalidRecipientError extends Error {}
/** Nha cung cap bao vuot nguong (429) - da bi chan. */
export class ProviderBlockedError extends Error {
  constructor(readonly retryAfterMs: number) {
    super(`Nha cung cap chan ${retryAfterMs} ms`);
  }
}

export interface EmailProvider {
  send(req: SendRequest): Promise<{ messageId: string }>;
}

/** Client HTTP toi nha cung cap email. */
export class HttpEmailProvider implements EmailProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 10_000,
  ) {}

  async send(req: SendRequest) {
    const res = await fetch(`${this.baseUrl}/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': req.idempotencyKey },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (res.status === 550) throw new InvalidRecipientError(`Dia chi khong ton tai: ${req.to}`);
    if (res.status === 429) throw new ProviderBlockedError(Number(res.headers.get('retry-after-ms') ?? 600_000));
    if (!res.ok) throw new Error(`Nha cung cap loi ${res.status}`);
    return (await res.json()) as { messageId: string };
  }
}
