// 국립공원 예약시스템(reservation.knps.or.kr) 어댑터
// - 달력: POST /reservation/campsiteList.do (dept_id) → HTML 조각(오늘~다음달 말, 사이트별·일자별 예약상태/요금). 로그인 불필요.
// - 규격: GET /contents/C/serviceGuide.do?parkId=&deptId= 의 "영지형태" 블록에서 사이트 범위별 크기 추출
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { politeFetch, fetchText, normalizeResult, log } from '../lib.mjs';

export const platform = 'knps';
const BASE = 'https://reservation.knps.or.kr';
const MAP = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '_map-knps.json'), 'utf8'));
const guideCache = new Map();

export async function fetchAvailability(camp, from, to) {
  const depts = MAP[camp.name];
  if (!depts) return null;
  const sites = [];
  let window = null;
  for (const dept of depts) {
    const html = await fetchCalendar(dept);
    const parsed = parseCalendar(html);
    if (!parsed.rows.length) continue;
    window = window || parsed.window;
    const sizes = await fetchSizes(dept).catch((e) => (log('knps guide 실패', dept, e.message), []));
    for (const r of parsed.rows) {
      const availableDates = [];
      const priceByDate = {};
      for (const c of r.cells) {
        if (c.date < from || c.date > to) continue;
        if (c.status === 'N') availableDates.push(c.date); // N=예약가능, W=대기, C=예약만료, R=예약불가
        if (c.price != null) priceByDate[c.date] = c.price;
      }
      sites.push({
        id: `${dept}:${r.category}:${r.name}`,
        name: r.name + (depts.length > 1 ? ` (${dept.slice(-1)}영지)` : ''),
        zone: r.category,
        size: matchSize(sizes, r.name),
        capacity: r.capacity,
        priceByDate,
        availableDates,
        bookUrl: `${BASE}/reservation/searchSimpleCampReservation.do`,
      });
    }
  }
  return normalizeResult(platform, camp, sites, { coverage: window, note: '국립공원은 매월 예약 오픈 이후 다음달 말까지만 조회됩니다.' });
}

async function fetchCalendar(dept) {
  const res = await politeFetch(`${BASE}/reservation/campsiteList.do`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `dept_id=${dept}&dept_name=&parent_dept_name=&prd_ctg_id=&isGreenpoint=N`,
  }, { timeoutMs: 60000, minGap: 1500 });
  return res.text();
}

/** 달력 HTML → { window:{from,to}, rows:[{category,name,capacity,cells:[{date,status,price}]}] } */
export function parseCalendar(html) {
  const stickyStart = html.indexOf('table-sticky-body');
  const bodyStart = html.indexOf('<table class="table-body">');
  if (stickyStart < 0 || bodyStart < 0) return { rows: [], window: null };
  const labelHtml = html.slice(stickyStart, bodyStart);
  const labels = [];
  let category = '';
  for (const tr of labelHtml.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    let name = '';
    for (const th of tr[1].matchAll(/<th([^>]*)>([\s\S]*?)<\/th>/g)) {
      const txt = th[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (/rowspan/.test(th[1])) category = txt;
      else name = txt;
    }
    labels.push({ category, name });
  }
  const bodyHtml = html.slice(bodyStart);
  const rows = [];
  let i = 0;
  const dates = new Set();
  for (const tr of bodyHtml.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const label = labels[i++] || { category: '', name: '' };
    const cells = [];
    for (const m of tr[1].matchAll(/<i title="[^"]*"\s+class="([^"]*?)\s+(\d{8})_([A-Z])"([^>]*)>/g)) {
      const date = `${m[2].slice(0, 4)}-${m[2].slice(4, 6)}-${m[2].slice(6, 8)}`;
      dates.add(date);
      const amt = m[4].match(/data-sal-amt='?"?(\d+)/);
      cells.push({ date, status: m[3], price: amt ? Number(amt[1]) : null });
    }
    if (!cells.length) continue;
    const cap = (label.name.match(/\((\d+)인\)/) || [])[1];
    rows.push({ category: label.category, name: label.name, capacity: cap ? `${cap}인` : '', cells });
  }
  const sorted = [...dates].sort();
  return { rows, window: sorted.length ? { from: sorted[0], to: sorted[sorted.length - 1] } : null };
}

/** 이용안내의 영지형태 텍스트 → [{ prefix, from, to, text }] */
async function fetchSizes(dept) {
  if (guideCache.has(dept)) return guideCache.get(dept);
  const parkId = dept.slice(0, 3);
  const html = await fetchText(`${BASE}/contents/C/serviceGuide.do?parkId=${parkId}&deptId=${dept}`);
  const rules = parseSizeRules(html);
  guideCache.set(dept, rules);
  return rules;
}

const SIZE_RE_1 = /(?:데크|마사토|잔디|파쇄석|자갈)?\s*\(?[^()]*?\d+(?:\.\d+)?\s*m?\s*[x×*X]\s*\d+(?:\.\d+)?\s*m?\)?/;
const SIZE_RE_2 = /가로\s*:?\s*\d+(?:\.\d+)?\s*m?\s*[,\s]*세로\s*:?\s*\d+(?:\.\d+)?\s*m?/;
const RANGE_RE = /([A-Za-z]?)\s*(\d+)\s*(?:[~\-–]\s*([A-Za-z]?)(\d+))?\s*번?/g;

export function parseSizeRules(html) {
  const rules = [];
  const text = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(tr|dd|li|p)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  const start = text.indexOf('영지형태');
  if (start < 0) return rules;
  const block = text.slice(start, start + 3000);
  for (const line of block.split('\n')) {
    const l = line.replace(/\s+/g, ' ').trim();
    if (!l || !/(m|M|미터)/.test(l)) continue;
    const sizeText = l.replace(/^[-•·\s]+/, '');
    const size = (sizeText.match(SIZE_RE_1) || sizeText.match(SIZE_RE_2) || [])[0];
    if (!size) continue;
    // 범위 토큰(사이즈 텍스트 제거 후): A7~A12, 1~5번, 7~9번, 13~51번, A영지, B1-B10
    const head = sizeText.replace(size, ' ').replace(/(데크|마사토|잔디|파쇄석|자갈|무장애영지)/g, ' ');
    const ranges = [];
    for (const m of head.matchAll(RANGE_RE)) {
      ranges.push({ prefix: (m[1] || '').toUpperCase(), from: Number(m[2]), to: Number(m[4] ?? m[2]) });
    }
    for (const m of head.matchAll(/([A-Z])\s*영지/g)) ranges.push({ prefix: m[1], from: 0, to: 9999 });
    const norm = size.replace(/가로\s*:?\s*/, '').replace(/\s*세로\s*:?\s*/, ' × ').replace(/\s+/g, ' ').trim();
    if (ranges.length) for (const r of ranges) rules.push({ ...r, text: norm });
    else if (/전\s*영지|모든|공통/.test(l)) rules.push({ prefix: '', from: 0, to: 9999, text: norm });
  }
  return rules;
}

function matchSize(rules, name) {
  if (!rules.length) return '';
  const m = name.match(/^([A-Za-z]?)-?(\d+)/);
  if (!m) return '';
  const prefix = m[1].toUpperCase();
  const n = Number(m[2]);
  const hit = rules.find((r) => r.from <= n && n <= r.to && r.prefix === prefix) || rules.find((r) => r.from <= n && n <= r.to && !r.prefix);
  return hit ? hit.text : '';
}
