// 브라우저/Node 공용: 날짜 유틸 + 기간 요금 계산
// 주말요금 적용일: 금·토 숙박 및 공휴일 전날 숙박(대부분의 국공립·사설 캠핑장 관행)
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

export function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function fromISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
/** 체크인~체크아웃 사이 숙박일(체크인 날짜 목록) */
export function nightsBetween(checkIn, checkOut) {
  const out = [];
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) out.push(d);
  return out;
}
/** 해당 숙박일이 주말요금 대상인지(금·토, 공휴일 전날) */
export function isWeekendNight(iso) {
  const dow = fromISO(iso).getDay();
  if (dow === 5 || dow === 6) return true;
  return HOLIDAYS.has(addDays(iso, 1));
}
/** 시트의 주말/주중 요금으로 기간 요금 추정 */
export function estimatePeriodPrice(camp, checkIn, checkOut) {
  const nights = nightsBetween(checkIn, checkOut);
  if (!nights.length) return null;
  let total = 0;
  for (const n of nights) {
    const w = isWeekendNight(n);
    const p = w ? (camp.priceWeekend ?? camp.priceWeekday) : (camp.priceWeekday ?? camp.priceWeekend);
    if (p == null) return null;
    total += p;
  }
  return { total, nights: nights.length, weekendNights: nights.filter(isWeekendNight).length };
}
/** 플랫폼에서 받아온 사이트별 일자 요금으로 기간 요금 합산(모든 날 요금이 있어야 함) */
export function sumSitePrice(site, nights) {
  if (!site.priceByDate) return null;
  let total = 0;
  for (const n of nights) {
    const p = site.priceByDate[n];
    if (p == null) return null;
    total += p;
  }
  return total;
}
/** 사이트가 기간 전체 예약 가능한지 */
export function siteAvailableAll(site, nights) {
  if (!site.availableDates) return false;
  const set = new Set(site.availableDates);
  return nights.every((n) => set.has(n));
}
export const won = (n) => (n == null ? '-' : n.toLocaleString('ko-KR') + '원');
