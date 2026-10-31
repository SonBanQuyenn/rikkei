import type { QueueConfig, QueueKey } from '../config/queues.config.js';
import type { Alert, AlertEvent, DashboardSnapshot } from '../monitoring/dashboard.types.js';

const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const secs = (ms: number | null) => (ms === null ? '-' : `${(ms / 1000).toFixed(0)}s`);

/** Trang bang dieu khien don gian, tu lam moi moi 3 giay. */
export function renderDashboardHtml(
  snap: DashboardSnapshot,
  active: (Alert & { since: number })[],
  history: AlertEvent[],
  cfg: Record<QueueKey, QueueConfig>,
) {
  const rows = snap.queues
    .map(
      (q) => `<tr class="${active.some((a) => a.target === q.key) ? 'bad' : ''}">
  <td><b>${esc(q.key)}</b><br><small>${esc(q.purpose)}</small></td>
  <td>${q.waiting}</td><td>${q.active}</td><td>${q.delayed}</td><td>${q.completed}</td><td>${q.failed}</td>
  <td>${q.workers}${q.paused ? ' (tam dung)' : ''}</td><td>${Math.round(q.window.failureRate * 100)}%</td>
  <td>${secs(q.oldestWaitingMs)}</td><td><small>${esc(cfg[q.key].rationale)}</small></td></tr>`,
    )
    .join('');
  const schedules = snap.schedules
    .map((s) => `<li>${esc(s.id)}: lan thanh cong gan nhat cach day ${secs(s.sinceSuccessMs)} (lich ${secs(s.everyMs)}, canh bao sau ${secs(s.staleAfterMs)})</li>`)
    .join('');
  const alerts = active.length
    ? active.map((a) => `<li class="${a.severity}">[${a.severity}] ${esc(a.message)}</li>`).join('')
    : '<li class="ok">Khong co canh bao</li>';
  const events = history.map((e) => `<li>${new Date(e.at).toLocaleTimeString()} ${e.status}: ${esc(e.message)}</li>`).join('');

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta http-equiv="refresh" content="3">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>ShopFast - tac vu nen</title>
<style>
body{font:14px system-ui,sans-serif;margin:16px;background:#f7f7f8;color:#1d1d1f}
table{border-collapse:collapse;width:100%;background:#fff}td,th{border:1px solid #ddd;padding:6px;text-align:right;vertical-align:top}
td:first-child,td:last-child,th:first-child{text-align:left}tr.bad{background:#fff1f0}
.critical{color:#b00020;font-weight:600}.warning{color:#a15c00}.ok{color:#137333}small{color:#666}
</style></head><body>
<h1>Trung tam dieu hanh tac vu nen</h1>
<h2>Canh bao dang mo</h2><ul>${alerts}</ul>
<h2>Hang doi</h2>
<table><tr><th>Hang doi</th><th>Dang cho</th><th>Dang chay</th><th>Cho thu lai</th><th>Hoan tat</th><th>That bai</th><th>Worker</th><th>Ti le loi</th><th>Cho lau nhat</th><th>Cau hinh &amp; ly do</th></tr>${rows}</table>
<h2>Viec dinh ky</h2><ul>${schedules}</ul>
<h2>Lich su canh bao</h2><ul>${events}</ul>
<p><small>Cap nhat ${new Date(snap.at).toLocaleTimeString()} - JSON: /api/dashboard, /api/alerts</small></p>
</body></html>`;
}
