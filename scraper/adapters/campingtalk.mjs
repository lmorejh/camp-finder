// 캠핑톡(campingtalk.me) 어댑터 — 공개 API(info.campingtalk.me), 로그인 불필요
// - 사이트(구역) 목록·크기·정원: GET /api/v1/domain/siteGroup/list?campId=
// - 일자×구역 재고/요금: GET /product/v3/channel/camp/camp/{campId}/schedule/list?bookingStartDate&bookingEndDate&pagePerCount=-1
import { fetchJSON, normalizeResult } from '../lib.mjs';

export const platform = 'campingtalk';
const API = 'https://info.campingtalk.me';

export function campIdOf(camp) {
  const m = String(camp.bookingUrl || '').match(/camp\/(\d+)|campid=(\d+)/i);
  return m ? m[1] || m[2] : camp.platformRef || '';
}

export async function fetchAvailability(camp, from, to) {
  const id = campIdOf(camp);
  if (!id) return null;
  const groups = await fetchJSON(`${API}/api/v1/domain/siteGroup/list?campId=${id}`);
  const glist = groups.data?.list || groups.data || [];
  const sched = await fetchJSON(`${API}/product/v3/channel/camp/camp/${id}/schedule/list?bookingStartDate=${from.replace(/-/g, '')}&bookingEndDate=${to.replace(/-/g, '')}&siteGroupId=&sortIndex=forCa&pagePerCount=-1`);
  const rows = sched.data?.list || [];
  const sites = new Map();
  for (const g of glist) {
    const size = g.sizeX && g.sizeY ? `${g.sizeX}×${g.sizeY}m` : (g.size || '').replace(/null/g, '').replace(/가로\s*m X 세로\s*m\s*/, '').trim();
    sites.set(String(g.siteGroupId), {
      id: String(g.siteGroupId), name: (g.siteGroupName || '').replace(/\*/g, '').trim(), zone: '', size,
      capacity: g.maxQuota ? `${g.baseQuota || ''}~${g.maxQuota}명`.replace(/^~/, '') : '', priceByDate: {}, availableDates: [], countByDate: {},
    });
  }
  for (const r of rows) {
    const d = String(r.calendarDate || r.campDate || '');
    if (d.length !== 8) continue;
    const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    if (iso < from || iso > to) continue;
    const key = String(r.siteGroupId);
    const s = sites.get(key) || { id: key, name: (r.siteGroupName || '').replace(/\*/g, '').trim(), zone: '', size: '', capacity: '', priceByDate: {}, availableDates: [], countByDate: {} };
    const stock = r.saleYn === 'Y' ? Number(r.currentStock ?? r.stock ?? 0) : 0;
    s.countByDate[iso] = stock;
    if (stock > 0) s.availableDates.push(iso);
    const p = r.currentPrice ?? r.price ?? r.normalPrice;
    if (p) s.priceByDate[iso] = Number(p);
    sites.set(key, s);
  }
  return normalizeResult(platform, camp, [...sites.values()].map((s) => ({ ...s, bookUrl: `https://www.campingtalk.me/booking/camp/${id}` })), {
    note: rows.length ? '' : '선택 기간이 캠핑톡 판매 오픈 전이거나 운영일이 아님',
  });
}
