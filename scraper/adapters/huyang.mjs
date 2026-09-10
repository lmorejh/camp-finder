// 휴양림 예약시스템(*.huyang.co.kr, 정선군시설관리공단 등) 어댑터 — ASP 서버 렌더링, 로그인 불필요
// - 월 달력: POST /reservation.asp?location=002 (wh_year, wh_month, man=1, wloc) → 예약 가능일(td.open)
// - 일자별 사이트 목록: POST /reservation.asp?location=002_01 (syyyy,smm,sdd,edd=0,man=1,wloc) + 같은 호스트 Referer
//   → 예약 가능한 사이트만 행으로 나옴(비수기 평일/주말, 성수기 요금 포함)
import { politeFetch, normalizeResult, log } from '../lib.mjs';
import { nightsBetween, addDays, isWeekendNight } from '../../docs/pricing.js';

export const platform = 'huyang';

function target(camp) {
  const u = new URL(camp.bookingUrl);
  const wloc = u.searchParams.get('wloc') || '';
  return { origin: `${u.protocol}//${u.host}`, wloc };
}
const won = (s) => Number(String(s || '').replace(/[^0-9]/g, '')) || null;

export async function fetchAvailability(camp, from, to) {
  if (!/huyang\.co\.kr/.test(camp.bookingUrl || '')) return null;
  const { origin, wloc } = target(camp);
  const referer = `${origin}/reservation.asp?location=002&wloc=${wloc}`;
  const nights = nightsBetween(from, addDays(to, 1));
  // 달력에서 예약 가능일 수집
  const open = new Set();
  for (const ym of [...new Set(nights.map((d) => d.slice(0, 7)))]) {
    const [y, m] = ym.split('-');
    const res = await politeFetch(`${origin}/reservation.asp?location=002`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', referer }, body: `wh_year=${y}&wh_month=${Number(m)}&man=1&wloc=${wloc}`,
    });
    const html = await res.text();
    for (const mm of html.matchAll(/<td class="open">[\s\S]*?name="sdd" value="(\d+)"/g)) open.add(`${y}-${m}-${String(mm[1]).padStart(2, '0')}`);
  }
  const sites = new Map();
  for (const d of nights) {
    if (!open.has(d)) continue;
    const [y, m, dd] = d.split('-');
    let html;
    try {
      const res = await politeFetch(`${origin}/reservation.asp?location=002_01`, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', referer }, body: `syyyy=${y}&smm=${Number(m)}&sdd=${Number(dd)}&edd=0&man=1&wloc=${wloc}`, redirect: 'manual',
      });
      if (res.status >= 300) continue; // alert 리다이렉트(당일/종료)
      html = await res.text();
    } catch (e) {
      log('huyang 실패', camp.name, d, e.message);
      continue;
    }
    for (const row of html.matchAll(/<tr[^>]*>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>[\s\S]*?rsv_info"?\s*\/?>/g)) {
      const name = row[1].trim();
      const s = sites.get(name) || { id: name, name, zone: '', size: '', capacity: '', priceByDate: {}, availableDates: [] };
      const md = d.slice(5);
      const peak = md >= '07-01' && md <= '08-31';
      const price = peak ? won(row[4]) : isWeekendNight(d) ? won(row[3]) : won(row[2]);
      if (price) s.priceByDate[d] = price;
      s.availableDates.push(d);
      sites.set(name, s);
    }
  }
  const sorted = [...open].sort();
  return normalizeResult(platform, camp, [...sites.values()].map((s) => ({ ...s, bookUrl: referer })), {
    coverage: sorted.length ? { from: sorted[0], to: sorted.at(-1) } : null,
    note: '예약 가능한 사이트만 목록에 표시되는 시스템(크기 정보 미제공)',
  });
}
