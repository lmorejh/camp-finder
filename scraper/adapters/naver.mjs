// 네이버 예약(booking.naver.com) 어댑터 — 로그인 불필요, GraphQL
// - 사이트 목록/크기/정원: query bizItems(businessId)
// - 일자별 재고/요금: query schedule(businessId, businessTypeId, bizItemId, startDateTime, endDateTime)
import { fetchJSON, normalizeResult } from '../lib.mjs';
import { addDays } from '../../docs/pricing.js';

export const platform = 'naver';
const GQL = 'https://booking.naver.com/graphql';
const FLOOR = { OPEN_FIELD: '노지', DECK: '데크', GRAVEL: '파쇄석', GRASS: '잔디', SAND: '모래', SOIL: '흙', CRUSHED_STONE: '파쇄석', PAVEMENT: '포장' };

async function gql(body, ref) {
  const r = await fetchJSON(GQL, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', referer: ref }, body: JSON.stringify(body) });
  if (r.errors) throw new Error('naver graphql: ' + JSON.stringify(r.errors).slice(0, 150));
  return r.data;
}

export async function fetchAvailability(camp, from, to) {
  const bizId = camp.platformRef;
  if (!bizId) return null;
  const typeId = Number((String(camp.bookingUrl).match(/booking\/(\d+)\/bizes/) || [])[1] || 3);
  const ref = `https://booking.naver.com/booking/${typeId}/bizes/${bizId}`;
  const { bizItems } = await gql({
    operationName: 'bizItems',
    variables: { input: { businessId: String(bizId), lang: 'ko' } },
    query: 'query bizItems($input: BizItemsParams){ bizItems(input:$input){ bizItemId name isClosedBooking minBookingCount maxBookingCount bizItemSubType additionalPropertyJson{ accommodationAdditionalProperty } } }',
  }, ref);
  const sites = [];
  for (const it of bizItems || []) {
    if (it.isClosedBooking) continue;
    const acc = it.additionalPropertyJson?.accommodationAdditionalProperty || {};
    const comp = acc.roomCompositions?.[0]?.campingSiteCompositions?.[0];
    const size = comp && comp.width && comp.height ? `${comp.width}×${comp.height}m${comp.floorType ? ' ' + (FLOOR[comp.floorType] || comp.floorType) : ''}` : '';
    const { schedule } = await gql({
      operationName: 'schedule',
      variables: { scheduleParams: { businessId: String(bizId), businessTypeId: typeId, bizItemId: String(it.bizItemId), startDateTime: from, endDateTime: addDays(to, 1) } },
      query: 'query schedule($scheduleParams: ScheduleParams){ schedule(input:$scheduleParams){ bizItemSchedule { daily { date } } } }',
    }, ref);
    const daily = schedule?.bizItemSchedule?.daily?.date || {};
    const priceByDate = {};
    const availableDates = [];
    for (const [d, v] of Object.entries(daily)) {
      if (d < from || d > to) continue;
      const p = v.prices?.[0]?.price;
      if (p) priceByDate[d] = p;
      if (v.isSaleDay && v.isBusinessDay !== false && (v.stock ?? 0) - (v.bookingCount ?? 0) - (v.occupiedBookingCount ?? 0) > 0) availableDates.push(d);
    }
    sites.push({
      id: String(it.bizItemId),
      name: it.name,
      zone: acc.checkInTime ? `입실 ${acc.checkInTime}` : '',
      size,
      capacity: it.maxBookingCount ? `${it.maxBookingCount}명` : '',
      priceByDate,
      availableDates,
      bookUrl: `${ref}/items/${it.bizItemId}`,
    });
  }
  return normalizeResult(platform, camp, sites);
}
