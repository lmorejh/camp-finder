// 땡큐캠핑(m.thankqcamping.com) 어댑터 — 로그인 불필요
// - 달력: POST /resv/axBeforeShowDay.hbb (campseq, yy, mm) → "date|res_yn|holi|fee|memo|..,...@res_able_dt|res_able_max_dt"
// - 사이트 유형별 잔여/요금/규격: POST /resv/axResCampSite.hbb (campseq, res_dt, res_edt, res_days) → HTML(li.site_div)
import { politeFetch, normalizeResult } from '../lib.mjs';
import { nightsBetween, addDays } from '../../docs/pricing.js';

export const platform = 'thankq';
const BASE = 'https://m.thankqcamping.com';
const form = (o) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

async function post(path, body) {
  const res = await politeFetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form(body) });
  return res.text();
}

export function parseSites(html) {
  const out = [];
  const h = html.replace(/\s+/g, ' ');
  for (const m of h.matchAll(/<div class="site_div[^"]*"[^>]*>([\s\S]*?)<ul class="ico_div">/g)) {
    const b = m[1];
    const name = (b.match(/<p class="na">([^<]*)<\/p>/) || [])[1]?.trim();
    if (!name) continue;
    const tip = (b.match(/<span class="q_tip[^"]*">([\s\S]*?)<\/span>/) || [])[1] || '';
    const cnt = /예약가능/.test(tip) ? Number((tip.match(/<em>(\d+)<\/em>/) || [, '1'])[1]) : 0;
    const size = (b.match(/규격\s*:\s*([^<]+)/) || [])[1]?.trim() || '';
    const time = (b.match(/<p class="time">(입실[^<]*)<\/p>/) || [])[1]?.trim() || '';
    const price = Number(((b.match(/<p class="pri">([\d,]+)원/) || [])[1] || '').replace(/,/g, '')) || null;
    out.push({ name, count: cnt, size, time, price });
  }
  return out;
}

export async function fetchAvailability(camp, from, to) {
  const cseq = camp.platformRef;
  if (!cseq) return null;
  const nights = nightsBetween(from, addDays(to, 1));
  // 예약 가능 기간(달력 응답 꼬리 @res_able_dt|res_able_max_dt)
  let coverage = null;
  try {
    const cal = await post('/resv/axBeforeShowDay.hbb', { campseq: cseq, yy: from.slice(0, 4), mm: from.slice(5, 7), wg_pass: '' });
    const tail = cal.split('@')[1] || '';
    const [a, b] = tail.split('|');
    const iso = (s) => (s && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null);
    const days = cal.split('@')[0].split(',').map((r) => r.split('|')).filter((r) => r[0]);
    const bookable = days.filter((r) => r[1] === 'Y').map((r) => { const [y, m, d] = r[0].split('-'); return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; }).sort();
    if (bookable.length) coverage = { from: bookable[0], to: iso(b) || bookable[bookable.length - 1] };
    void a;
  } catch {}
  const sites = new Map();
  for (const d of nights) {
    if (coverage && (d < coverage.from || d > coverage.to)) continue;
    const html = await post('/resv/axResCampSite.hbb', { campseq: cseq, res_dt: d.replace(/-/g, ''), res_edt: addDays(d, 1).replace(/-/g, ''), res_days: '1', site_tp: '', only_able_yn: '' });
    for (const s of parseSites(html)) {
      const cur = sites.get(s.name) || { id: s.name, name: s.name, zone: s.time, size: s.size, capacity: '', priceByDate: {}, availableDates: [], countByDate: {} };
      if (s.price) cur.priceByDate[d] = s.price;
      cur.countByDate[d] = s.count;
      if (s.count > 0) cur.availableDates.push(d);
      sites.set(s.name, cur);
    }
  }
  return normalizeResult(platform, camp, [...sites.values()].map((s) => ({ ...s, bookUrl: `${BASE}/resv/view.hbb?cseq=${cseq}` })), {
    coverage,
    note: '사이트 유형별 잔여 수 기준(유형 내 개별 자리는 땡큐캠핑에서 선택)',
  });
}
