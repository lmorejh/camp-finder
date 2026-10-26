// Port of docs/pricing.js (web) so the app computes the same statuses and prices.
// 주말요금 적용일: 금·토 숙박 및 공휴일 전날 숙박
export const HOLIDAYS = new Set([
  // 2026
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01', '2026-03-02',
  '2026-05-05', '2026-05-24', '2026-05-25', '2026-06-03', '2026-06-06', '2026-08-15', '2026-08-17',
  '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25',
  // 2027
  '2027-01-01', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-03-01',
  '2027-05-05', '2027-05-13', '2027-06-06', '2027-06-07', '2027-08-15', '2027-08-16',
  '2027-09-14', '2027-09-15', '2027-09-16', '2027-10-03', '2027-10-04', '2027-10-09', '2027-10-11', '2027-12-25', '2027-12-27',
]);

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
/** Nights between check-in and check-out (list of check-in dates). */
export function nightsBetween(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) out.push(d);
  return out;
}
export function isWeekendNight(iso: string): boolean {
  const dow = fromISO(iso).getDay();
  if (dow === 5 || dow === 6) return true;
  return HOLIDAYS.has(addDays(iso, 1));
}
export function isHoliday(iso: string): boolean {
  return HOLIDAYS.has(iso) || fromISO(iso).getDay() === 0;
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
/** "10/30(금)" */
export function shortLabel(iso: string): string {
  const d = fromISO(iso);
  return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;
}

/** Default stay: the coming Friday, one night (same as the web). */
export function defaultStay(now = new Date()): { checkIn: string; checkOut: string } {
  const d = new Date(now);
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
  const checkIn = toISO(d);
  return { checkIn, checkOut: addDays(checkIn, 1) };
}

export const won = (n: number | null | undefined) => (n == null ? '-' : n.toLocaleString('ko-KR') + '원');
