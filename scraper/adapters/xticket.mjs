// 엑스티켓(camp.xticket.kr) 어댑터 — 로그인 불필요(세션 쿠키 + Origin 헤더 필요)
// 1) GET /web/main?shopEncode= → JSESSIONID (샵이 세션에 바인딩)
// 2) POST /Web/Book/GetBookPlayDate.json (play_month) → 판매일별 전체 잔여 수
// 3) POST /Web/Book/GetBookProductGroup.json (start_date,end_date) → 구역(그룹)·기본요금
// 4) POST /Web/Book/GetBookProduct010001.json (product_group_code,start_date,end_date,book_days) → 구역 내 사이트별 상태
import { politeFetch, normalizeResult, log } from '../lib.mjs';
import { nightsBetween, addDays } from '../../docs/pricing.js';

export const platform = 'xticket';
const BASE = 'https://camp.xticket.kr';

export function encodeOf(camp) {
  const m = String(camp.bookingUrl || '').match(/shop_?[eE]ncode=([0-9a-f]{64})/);
  return m ? m[1] : '';
}

async function openSession(enc) {
  const res = await politeFetch(`${BASE}/web/main?shopEncode=${enc}`, { redirect: 'manual' });
  const cookies = (res.headers.getSetCookie ? res.headers.getSetCookie() : []).map((c) => c.split(';')[0]).join('; ');
  if (!cookies) throw new Error('xticket 세션 쿠키 없음');
  // 리다이렉트 체인을 따라가며 쿠키를 유지해 세션에 샵을 바인딩
  let loc = res.headers.get('location');
  for (let i = 0; i < 3 && loc; i++) {
    const r = await politeFetch(new URL(loc, BASE).toString(), { redirect: 'manual', headers: { cookie: cookies } });
    loc = r.status >= 300 && r.status < 400 ? r.headers.get('location') : null;
  }
  return cookies;
}

async function call(cookies, path, params) {
  const res = await politeFetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookies, origin: BASE, accept: 'application/json' },
    body: new URLSearchParams(params).toString(),
  });
  const text = await res.text();
  let j;
  try { j = JSON.parse(text); } catch { throw new Error(`xticket 응답 파싱 실패 ${path}: ${text.slice(0, 80)}`); }
  if (j.error || j.error1) throw new Error(`xticket: ${(j.error || j.error1).message}`);
  return j.data || j;
}

export async function fetchAvailability(camp, from, to) {
  const enc = encodeOf(camp);
  if (!enc) return null;
  const cookies = await openSession(enc);
  const info = await call(cookies, '/Web/Book/GetShopInformation.json', { shop_encode: enc });
  const nights = nightsBetween(from, addDays(to, 1));
  // 판매일 목록(월 단위)
  const months = [...new Set(nights.map((d) => d.slice(0, 7).replace('-', '')))];
  const remain = new Map();
  for (const m of months) {
    const d = await call(cookies, '/Web/Book/GetBookPlayDate.json', { play_month: m });
    for (const r of d.bookPlayDateList || []) remain.set(`${r.play_date.slice(0, 4)}-${r.play_date.slice(4, 6)}-${r.play_date.slice(6, 8)}`, Number(r.book_remain_count));
  }
  const groupsRes = await call(cookies, '/Web/Book/GetBookProductGroup.json', { start_date: from.replace(/-/g, ''), end_date: to.replace(/-/g, '') });
  const groups = groupsRes.bookProductGroupList || [];
  const sites = [];
  for (const g of groups) {
    const site = { id: g.product_group_code, name: g.product_group_name, zone: '', size: '', capacity: '', priceByDate: {}, availableDates: [], countByDate: {}, names: {} };
    for (const d of nights) {
      if (!remain.has(d)) continue; // 판매일 아님
      const ds = d.replace(/-/g, '');
      let list;
      try {
        const r = await call(cookies, '/Web/Book/GetBookProduct010001.json', { product_group_code: g.product_group_code, start_date: ds, end_date: ds, book_days: '1', two_stay_days: info.two_stay_days ?? '0' });
        list = r.bookProductList || [];
      } catch (e) {
        log('xticket product 실패', camp.name, g.product_group_name, d, e.message);
        continue;
      }
      const avail = list.filter((p) => p.status_code === '0' && p.select_yn === '1');
      site.countByDate[d] = avail.length;
      if (avail.length) {
        site.availableDates.push(d);
        site.names[d] = avail.map((p) => p.product_name).slice(0, 12).join(', ') + (avail.length > 12 ? ' 외' : '');
      }
      const fee = avail[0]?.sale_product_fee || list[0]?.product_fee || g.product_fee;
      if (fee) site.priceByDate[d] = Number(fee);
    }
    sites.push(site);
  }
  return normalizeResult(platform, camp, sites.map((s) => ({ ...s, bookUrl: `${BASE}/web/main?shopEncode=${enc}` })), {
    coverage: remain.size ? { from: [...remain.keys()].sort()[0], to: [...remain.keys()].sort().at(-1) } : null,
    note: `${info.shop_name || ''} · 구역별 잔여 면수 기준(판매일만 표시)`,
  });
}
