// 인터파크 티켓 / NOL 티켓(nol.yanolja.com) 어댑터 — 지자체 캠핑장이 "레저 상품"으로 등록된 경우
// - 상품 페이지 HTML에서 goodsKey("goodsCode:placeCode") 추출
// - GET /ticket/products/api/schedules?goodsKey=&playStartDate=&playEndDate= → 회차(=숙박일) 목록
// - GET /ticket/products/api/remaining-seats?goodsCode=&playSeq= → 좌석등급(=구역)별 잔여 수
//   ※ 좌석(개별 사이트) 선택 화면은 로그인 필요 → 구역 단위 잔여 수까지만 제공. 판매 기간 외 날짜는 잔여 정보 없음.
import { fetchText, fetchJSON, normalizeResult } from '../lib.mjs';
import { nightsBetween, addDays } from '../../docs/pricing.js';

export const platform = 'interpark';
const BASE = 'https://nol.yanolja.com';

function goodsCodeOf(camp) {
  const m = String(camp.bookingUrl || '').match(/(?:goods|products)\/(\d{6,})/);
  return m ? m[1] : camp.platformRef || '';
}

export async function fetchAvailability(camp, from, to) {
  const code = goodsCodeOf(camp);
  if (!code) return null;
  const html = await fetchText(`${BASE}/ticket/products/${code}`, { headers: { accept: 'text/html' } });
  const goodsKey = (html.match(/"goodsKey"\s*:\s*"([^"]+)"/) || html.match(/goodsKey\\?"?:\\?"([^"\\]+)/) || [])[1];
  if (!goodsKey) throw new Error('goodsKey를 찾지 못했습니다(판매 종료 상품일 수 있음)');
  const sch = await fetchJSON(`${BASE}/ticket/products/api/schedules?goodsKey=${encodeURIComponent(goodsKey)}&playStartDate=${from}&playEndDate=${addDays(to, 1)}`, { headers: { accept: 'application/json', referer: `${BASE}/ticket/products/${code}` } });
  const rounds = (sch.content || []).filter((r) => r.playDate >= from && r.playDate <= to);
  const nights = new Set(nightsBetween(from, addDays(to, 1)));
  const zones = new Map();
  const now = Date.now();
  let onSale = 0;
  for (const r of rounds) {
    if (!nights.has(r.playDate)) continue;
    const open = r.saleOpenTime ? new Date(r.saleOpenTime.replace(' ', 'T') + '+09:00').getTime() : 0;
    const close = r.saleCloseTime ? new Date(r.saleCloseTime.replace(' ', 'T') + '+09:00').getTime() : Infinity;
    if (now < open || now > close) continue; // 판매 기간 외
    onSale++;
    const rs = await fetchJSON(`${BASE}/ticket/products/api/remaining-seats?goodsCode=${code}&playSeq=${r.playSeq}`, { headers: { accept: 'application/json', referer: `${BASE}/ticket/products/${code}` } });
    for (const s of rs.remainSeat || []) {
      const key = String(s.seatGrade ?? s.seatGradeName);
      const cur = zones.get(key) || { id: key, name: s.seatGradeName || `구역 ${key}`, zone: '', size: '', capacity: '', priceByDate: {}, availableDates: [], countByDate: {} };
      cur.countByDate[r.playDate] = s.remainCnt;
      if (s.remainCnt > 0) cur.availableDates.push(r.playDate);
      zones.set(key, cur);
    }
  }
  return normalizeResult(platform, camp, [...zones.values()].map((s) => ({ ...s, bookUrl: `${BASE}/ticket/products/${code}` })), {
    note: onSale ? '구역(좌석등급)별 잔여 수 기준. 개별 사이트 선택은 NOL 로그인 후 가능' : '선택 기간이 판매 기간 밖(매월 정해진 날짜에 다음 달분 오픈)',
    coverage: rounds.length ? { from: rounds[0].playDate, to: rounds[rounds.length - 1].playDate } : null,
  });
}
