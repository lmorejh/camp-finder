// 떠나요(booking.ddnayo.com) 어댑터 — JSON API는 로그인·쿠키 없이 응답(HTML 페이지만 Akamai 보호)
// GET /booking-calendar-api/calendar/v2/accommodation/{id}/reservation-calendar?month=YYYYMM
//   → rowDtos[].columnDtos[].detailDtos[] { roomTypeId, roomId, roomName, statusCode(0010=가능,0030=완료), salePrice, isReservable }
import { fetchJSON, normalizeResult } from '../lib.mjs';
import { nightsBetween, addDays } from '../../docs/pricing.js';

export const platform = 'ddnayo';
const API = 'https://booking.ddnayo.com/booking-calendar-api';

export function accommodationIdOf(camp) {
  const m = String(camp.bookingUrl || '').match(/accommodationId=(\d+)/);
  return m ? m[1] : camp.platformRef || '';
}

export async function fetchAvailability(camp, from, to) {
  const id = accommodationIdOf(camp);
  if (!id) return null;
  const nights = new Set(nightsBetween(from, addDays(to, 1)));
  const months = [...new Set([...nights].map((d) => d.slice(0, 7).replace('-', '')))];
  const sites = new Map();
  let availableDays = null;
  for (const m of months) {
    const j = await fetchJSON(`${API}/calendar/v2/accommodation/${id}/reservation-calendar?month=${m}`, { headers: { accept: 'application/json', referer: `https://booking.ddnayo.com/booking-calendar-status?accommodationId=${id}` } });
    if (!j.success) throw new Error(`ddnayo: ${j.message || '응답 실패'}`);
    availableDays ??= j.data?.availableReservationDays ?? null;
    for (const row of j.data?.rowDtos || []) {
      for (const col of row.columnDtos || []) {
        const d = col.date;
        if (!nights.has(d)) continue;
        for (const r of col.detailDtos || []) {
          const key = String(r.roomId);
          const s = sites.get(key) || { id: key, name: r.roomName, zone: r.roomTypeName || '', size: '', capacity: '', priceByDate: {}, availableDates: [] };
          if (r.salePrice) s.priceByDate[d] = Number(r.salePrice);
          if (r.isReservable && r.statusCode === '0010') s.availableDates.push(d);
          sites.set(key, s);
        }
      }
    }
  }
  return normalizeResult(platform, camp, [...sites.values()].map((s) => ({ ...s, bookUrl: `https://booking.ddnayo.com/booking-calendar-status?accommodationId=${id}` })), {
    note: availableDays ? `떠나요 예약 가능 기간: 오늘부터 ${availableDays}일` : '',
  });
}
