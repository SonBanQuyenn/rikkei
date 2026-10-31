export const EMAIL_QUEUE = 'order-email';
export const SEND_CONFIRMATION_JOB = 'send-confirmation';

export type ConfirmationJobData = { orderId: string; email: string };
export type ConfirmationJobResult = { sent: boolean; skipped?: 'already-sent'; messageId?: string };
