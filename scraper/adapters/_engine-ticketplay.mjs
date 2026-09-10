// 티켓플레이(ticketplay.zone) / 잡자(zapza.me) 공용 엔진 — 로그인 불필요
// POST {base}/productSearchJson (stay_cnt, check_in=YYYYMMDD) → 구역별 잔여 수(ROOM_CNT)/총 수/요금(USE_AMT)
import { politeFetch, normalizeResult } from '../lib.mjs';
import { nightsBetween, addDays } from '../../docs/pricing.js';

export function makeAdapter(platform) {
  function baseOf(camp) {
    const u = new URL(camp.bookingUrl);
    const prefix = u.host.endsWith('zapza.me') ? '/Home/realtime/R10100' : '/portal/realtime';
    return `${u.protocol}//${u.host}${prefix}`;
  }
  async function fetchAvailability(camp, from, to) {
    if (!camp.bookingUrl) return null;
    const base = baseOf(camp);
    const nights = nightsBetween(from, addDays(to, 1));
    const zones = new Map();
    let failures = 0;
    for (const d of nights) {
      let json;
      try {
        const res = await politeFetch(`${base}/productSearchJson`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `stay_cnt=1&check_in=${d.replace(/-/g, '')}` }, { retries: 1 });
        if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
        json = JSON.parse(await res.text());
      } catch (e) {
        if (++failures >= 3) throw new Error(`${platform} 응답 실패(${e.message})`);
        continue;
      }
      for (const z of json.RESULT_DATA || []) {
        const key = String(z.ROOM_AREA_NO);
        const cur = zones.get(key) || { id: key, name: z.ROOM_AREA_NAME, zone: `총 ${z.TOT_ROOM_CNT}면`, size: '', capacity: '', priceByDate: {}, availableDates: [], countByDate: {} };
        if (z.USE_AMT) cur.priceByDate[d] = Number(z.USE_AMT);
        cur.countByDate[d] = z.ROOM_CNT;
        if (z.ROOM_CNT > 0) cur.availableDates.push(d);
        zones.set(key, cur);
      }
    }
    return normalizeResult(platform, camp, [...zones.values()].map((s) => ({ ...s, bookUrl: `${base}/productSearch` })), {
      note: '구역별 잔여 면수 기준(구역 내 개별 자리는 예약 페이지에서 선택)',
    });
  }
  return { platform, fetchAvailability };
}
