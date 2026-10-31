/**
 * So lieu bai toan va cac nguong da chon (xem bao-cao.md, muc A).
 */
export const CAMPAIGN_SIZE = 500_000;
export const CAMPAIGN_DEADLINE_SEC = 2 * 3600;
/** Thong luong toi thieu: 500.000 / 7.200 s = 69,4 email/s. */
export const REQUIRED_RATE_PER_SEC = CAMPAIGN_SIZE / CAMPAIGN_DEADLINE_SEC;

/** Gioi han cua nha cung cap: 100 lan goi/giay, vuot nguong bi chan 10 phut. */
export const PROVIDER_LIMIT_PER_SEC = 100;
export const PROVIDER_BLOCK_MS = 10 * 60_000;

/**
 * Bo dem cua so truot dung chung (Redis) cho moi tien trinh:
 *  - Tong moi loai email <= 90 lan/giay VA <= 9 lan/100 ms. Cua so con 100 ms dan deu luot goi, khong cho
 *    don cum dau giay; nho vay du do tre mang lam lech toi 100 ms, nha cung cap van chi thay toi da
 *    90 + 9 = 99 < 100 lan trong bat ky giay nao.
 *  - Rieng email chien dich <= 76/giay va <= 8/100 ms (du 69,4/s yeu cau, du phong ~9%).
 *  - Chien dich con phai nhuong: chi lay suat khi TONG < 85/giay -> luon de san >= 5 suat/giay cho email
 *    giao dich goi ngay; khi giao dich tang dot bien, chien dich tu cham lai, giao dich khong bi cham.
 */
export const RATE_WINDOW_MS = 1_000;
export const BURST_WINDOW_MS = 100;
export const TOTAL_CAP_PER_SEC = 90;
export const TOTAL_CAP_PER_BURST = 9;
export const CAMPAIGN_CAP_PER_SEC = 76;
export const CAMPAIGN_CAP_PER_BURST = 8;
export const CAMPAIGN_YIELD_TOTAL_PER_SEC = 85;

/** Ha tang toi da 4 tien trinh; moi tien trinh chay ca worker chien dich va worker giao dich. */
export const MAX_PROCESSES = 4;
export const CAMPAIGN_CONCURRENCY_PER_PROCESS = 10;
export const TRANSACTIONAL_CONCURRENCY_PER_PROCESS = 10;

export const CAMPAIGN_QUEUE = 'campaign-email';
export const TRANSACTIONAL_QUEUE = 'transactional-email';

/** Loi tam thoi (5xx, timeout): thu lai 3 lan, cho 5s, 10s. Dia chi khong ton tai: khong thu lai. */
export const CAMPAIGN_ATTEMPTS = 3;
export const CAMPAIGN_BACKOFF_MS = 5_000;
