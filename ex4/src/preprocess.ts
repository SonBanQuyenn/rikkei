import { HEAD_CHARS, MAX_TICKET_CHARS } from "./config.ts";

export interface PreparedTicket {
  text: string;
  originalChars: number;
  truncated: boolean;
}

// Bay ticket 4.000 tu: khach dan ca lich su chat. Van de can xu ly nam o dau (tieu de)
// va o cuoi (tin nhan moi nhat), nen giu 2 phan nay va luoc bot phan giua.
export function prepareTicket(raw: string): PreparedTicket {
  const text = raw.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length <= MAX_TICKET_CHARS) {
    return { text, originalChars: raw.length, truncated: false };
  }
  const tailChars = MAX_TICKET_CHARS - HEAD_CHARS;
  const omitted = text.length - MAX_TICKET_CHARS;
  return {
    text:
      text.slice(0, HEAD_CHARS) +
      `\n\n[... đã lược bớt ${omitted} ký tự lịch sử chat ở giữa ...]\n\n` +
      text.slice(-tailChars),
    originalChars: raw.length,
    truncated: true,
  };
}
