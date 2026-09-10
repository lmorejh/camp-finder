// 메이크티켓/스마틱스(forest.maketicket.co.kr) 어댑터 — 로그인 불필요(예약 진행만 로그인)
// - 상품 페이지 /ticket/{gd_seq} 에서 idkey 추출
// - POST /camp/reserve/calendar.jsp (idkey, gd_seq, yyyymmdd, sd_date) → 월 달력 HTML: 일자별 구역(존)별 잔여 수
//   요금은 달력에 없어 시트 요금으로 추정
import { fetchText, normalizeResult } from '../lib.mjs';
import { nightsBetween, addDays } from '../../docs/pricing.js';

export const platform = 'maketicket';
const BASE = 'https://forest.maketicket.co.kr';

export function gdOf(camp) {
  const m = String(camp.bookingUrl || '').match(/ticket\/(\w+)/i);
  return m ? m[1].toUpperCase() : (camp.platformRef || '').toUpperCase();
}

export async function fetchAvailability(camp, from, to) {
  const gd = gdOf(camp);
  if (!gd) return null;
  const page = await fetchText(`${BASE}/ticket/${gd}`, { headers: { accept: 'text/html' } });
  const idkey = (page.match(/idkey\s*:\s*"([A-Z0-9]+)"/) || page.match(/upidkey=([A-Z0-9]+)/) || [])[1];
  if (!idkey) throw new Error('maketicket idkey를 찾지 못했습니다(판매 종료 상품일 수 있음)');
  const nights = new Set(nightsBetween(from, addDays(to, 1)));
  const months = [...new Set([...nights].map((d) => d.slice(0, 7)))];
  const zones = new Map();
  for (const ym of months) {
    const first = ym.replace('-', '') + '01';
    const html = await fetchText(`${BASE}/camp/reserve/calendar.jsp`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', referer: `${BASE}/ticket/${gd}` },
      body: `idkey=${idkey}&gd_seq=${gd}&yyyymmdd=${first}&sd_date=${first}`,
    });
    for (const m of html.matchAll(/f_SelectDateZone\(\s*"(\d{8})"\s*,\s*"([^"]+)"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"(\d+)"\s*\)[^>]*>\s*<span>\d+<\/span>([^<]*)</g)) {
      const d = `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`;
      if (!nights.has(d)) continue;
      const z = zones.get(m[2]) || { id: m[2], name: m[4].trim(), zone: '', size: '', capacity: '', priceByDate: {}, availableDates: [], countByDate: {} };
      const cnt = Number(m[3]);
      z.countByDate[d] = cnt;
      if (cnt > 0) z.availableDates.push(d);
      zones.set(m[2], z);
    }
  }
  return normalizeResult(platform, camp, [...zones.values()].map((s) => ({ ...s, bookUrl: `${BASE}/ticket/${gd}` })), {
    note: '구역(존)별 잔여 수 기준 · 요금은 시트 기준 추정(자리 선택은 메이크티켓 로그인 후)',
  });
}
