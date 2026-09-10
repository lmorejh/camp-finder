// NOL(야놀자) 숙소 페이지(nol.yanolja.com/stay/domestic/{id}) 어댑터 — 지자체 캠핑장이 인터파크에서 이전한 곳
// tRPC 공개 쿼리: GET /stay/api/trpc/stay.properties.detail?input={"json":{"stayId","query":{checkInDate,checkOutDate,adultPax,childrenAges}}}
//   → json.roomTypes[] { roomTypeInfo{roomTypeId, roomTypeName, zoneName, infos[].title}, ratePlans[]{price{rate, soldOut}, validation{availability}} }
// 응답이 날짜당 약 700KB라 조회 창을 CF_NOL_DAYS(기본 30일)로 제한
import { fetchJSON, normalizeResult } from '../lib.mjs';
import { nightsBetween, addDays } from '../../docs/pricing.js';

export const platform = 'nolstay';
const BASE = 'https://nol.yanolja.com';
const MAX_DAYS = Number(process.env.CF_NOL_DAYS || 30);
const ADULTS = Number(process.env.CF_PEOPLE || 2);

export function stayIdOf(camp) {
  const m = String(camp.bookingUrl || '').match(/(?:domestic|places)\/(\d+)/);
  return m ? m[1] : camp.platformRef || '';
}

export async function fetchAvailability(camp, from, to) {
  const id = stayIdOf(camp);
  if (!id) return null;
  const nights = nightsBetween(from, addDays(to, 1)).slice(0, MAX_DAYS);
  const sites = new Map();
  let name = '';
  for (const d of nights) {
    const input = encodeURIComponent(JSON.stringify({ json: { stayId: id, query: { checkInDate: d, checkOutDate: addDays(d, 1), adultPax: ADULTS, childrenAges: [] } } }));
    const r = await fetchJSON(`${BASE}/stay/api/trpc/stay.properties.detail?input=${input}`, { headers: { accept: 'application/json', referer: `${BASE}/stay/domestic/${id}` } }, { minGap: 1000, timeoutMs: 40000 });
    const j = r.result?.data?.json;
    if (!j) throw new Error('nolstay 응답 형식 오류');
    name = j.atf?.name || name;
    for (const rt of j.roomTypes || []) {
      const info = rt.roomTypeInfo || {};
      const key = String(info.roomTypeId);
      const cap = (info.infos || []).map((x) => x.title).find((t) => /인/.test(t || '')) || '';
      const s = sites.get(key) || { id: key, name: (info.roomTypeName || '').replace(/\s+/g, ' ').trim(), zone: info.zoneName || '', size: '', capacity: cap.replace(/기준\s*/, ''), priceByDate: {}, availableDates: [] };
      const plans = rt.ratePlans || [];
      const ok = plans.find((p) => p.price && !p.price.soldOut && p.validation?.availability !== 'INVALID');
      const priced = ok || plans.find((p) => p.price?.rate);
      const rate = Number(String(priced?.price?.rate || '').replace(/[^0-9]/g, ''));
      if (rate) s.priceByDate[d] = rate;
      if (ok) s.availableDates.push(d);
      sites.set(key, s);
    }
  }
  return normalizeResult(platform, camp, [...sites.values()].map((s) => ({ ...s, bookUrl: `${BASE}/stay/domestic/${id}` })), {
    coverage: { from: nights[0], to: nights[nights.length - 1] },
    note: `${name} · NOL 숙소 기준 ${ADULTS}인, 오늘부터 ${nights.length}일 범위만 조회`,
  });
}
