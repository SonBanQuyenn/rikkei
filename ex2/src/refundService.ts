import { validateRefundInput } from "./refundTool.ts";

export interface RefundTicket {
  ticketId: string;
  orderId: string;
  amount: number;
  reason: string;
  createdAt: string;
}

// Kho phieu hoan gia lap
const tickets: RefundTicket[] = [];

export function createRefund(input: unknown): RefundTicket {
  const checked = validateRefundInput(input);
  if (!checked.ok) throw new Error(checked.error);

  const ticket: RefundTicket = {
    ticketId: `RF-${String(tickets.length + 1).padStart(4, "0")}`,
    ...checked.value,
    createdAt: new Date().toISOString(),
  };
  tickets.push(ticket);
  return ticket;
}
