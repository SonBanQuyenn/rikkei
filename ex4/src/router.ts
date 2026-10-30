// Dieu phoi kien truc lai: phan loai truoc, chi day sang agent nhung van de can tra cuu
import Anthropic from "@anthropic-ai/sdk";
import { DEADLINE_MS, MANUAL_QUEUE, type Team } from "./config.ts";
import { prepareTicket } from "./preprocess.ts";
import { classifyTicket, type Issue } from "./classifier.ts";
import { resolveIssue } from "./resolver.ts";

export interface Route {
  summary: string;
  team: Team | typeof MANUAL_QUEUE;
  method: "classifier" | "agent" | "fallback";
  note?: string;
}

export interface RoutingResult {
  ticketId: string;
  routes: Route[];
  truncated: boolean;
  latencyMs: number;
}

export async function routeTicket(
  client: Anthropic,
  ticketId: string,
  rawText: string,
  deadlineMs = DEADLINE_MS,
): Promise<RoutingResult> {
  const started = Date.now();
  const prepared = prepareTicket(rawText);
  // Mot deadline chung cho ca ticket, huy moi request con dang chay khi het gio
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("deadline", "TimeoutError")), deadlineMs);
  try {
    return await routeWithin(client, ticketId, prepared, started, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function routeWithin(
  client: Anthropic,
  ticketId: string,
  prepared: ReturnType<typeof prepareTicket>,
  started: number,
  signal: AbortSignal,
): Promise<RoutingResult> {
  let issues: Issue[];
  try {
    issues = await classifyTicket(client, prepared.text, signal);
  } catch (err) {
    return {
      ticketId,
      routes: [{ summary: "(chưa phân loại được)", team: MANUAL_QUEUE, method: "fallback", note: describe(err) }],
      truncated: prepared.truncated,
      latencyMs: Date.now() - started,
    };
  }

  // Bay ticket 2 van de: moi van de duoc dinh tuyen rieng, chay song song
  const routes = await Promise.all(
    issues.map(async (issue): Promise<Route> => {
      if (!issue.needsLookup) return { summary: issue.summary, team: issue.team, method: "classifier" };
      try {
        const { team, reason } = await resolveIssue(client, issue, signal);
        return { summary: issue.summary, team, method: "agent", note: reason };
      } catch (err) {
        // Het gio hoac agent loi: dung nhan so bo cua bo phan loai thay vi bo trong
        return { summary: issue.summary, team: issue.team, method: "fallback", note: describe(err) };
      }
    }),
  );

  return { ticketId, routes, truncated: prepared.truncated, latencyMs: Date.now() - started };
}

function describe(err: unknown): string {
  if (err instanceof Anthropic.APIUserAbortError) return "quá hạn thời gian phản hồi";
  if (err instanceof Anthropic.APIError) return `lỗi API: ${err.message}`;
  if (err instanceof Error && err.name === "TimeoutError") return "quá hạn thời gian phản hồi";
  return err instanceof Error ? err.message : String(err);
}
