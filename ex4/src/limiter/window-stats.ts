/** So request lon nhat nam trong mot cua so truot `windowMs` bat ky (mang `times` da sap xep tang). */
export function maxInAnyWindow(times: ArrayLike<number>, windowMs: number): number {
  let max = 0;
  let left = 0;
  for (let right = 0; right < times.length; right++) {
    while (times[right] - times[left] >= windowMs) left++;
    max = Math.max(max, right - left + 1);
  }
  return max;
}
