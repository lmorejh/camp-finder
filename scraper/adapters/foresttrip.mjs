// 숲나들e(foresttrip.go.kr) 어댑터 — 로그인 없이 가능한 범위
// - 휴양림 목록/ID: _foresttrip-instt.json (시트 이름과 자동 매칭 + _map-foresttrip.json 수동 보정)
// - 사이트 목록·면적·정원: GET /pot/rm/fa/selectCmpgrArmpListView.do?hmpgId=&menuId=002002002
// - 사이트 요금(비수기/성수기 × 평일/주말): GET /pot/rm/fa/selectCmpgrArmpDtlView.do?insttId=&goodsId=
// - 일자별 잔여 야영 사이트 수(휴양림 단위): POST /rep/or/innerFcfsRcrfrDtlDetls.do?_csrf= (세션 쿠키 필요)
//   ※ 데크별 O/X 달력은 로그인 페이지(/rep/or/sssn/*)에만 있어 제공하지 않음 → 화면에는 "잔여 N개"로 표시
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { politeFetch, fetchText, fetchJSON, normalizeResult, log } from '../lib.mjs';
import { nightsBetween, isWeekendNight, addDays } from '../../docs/pricing.js';

export const platform = 'foresttrip';
const BASE = 'https://www.foresttrip.go.kr';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, '..', '..');
const CATALOG_PATH = path.join(ROOT, 'data/cache/foresttrip-catalog.json');
const CATALOG_TTL_DAYS = Number(process.env.CF_FT_CATALOG_DAYS || 14);
const PEOPLE = String(process.env.CF_PEOPLE || 2);

const INSTT = JSON.parse(fs.readFileSync(path.join(DIR, '_foresttrip-instt.json'), 'utf8')).list;
let MANUAL = {};
try { MANUAL = JSON.parse(fs.readFileSync(path.join(DIR, '_map-foresttrip.json'), 'utf8')); } catch {}

// ---------- 이름 매칭 ----------
const norm = (s) => String(s || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, '').replace(/(국민여가캠핑장|오토캠핑장|캠핑장|야영장)$/g, '').replace(/자연휴양림|휴양림/g, '');
export function resolveInstt(camp) {
  if (MANUAL[camp.name] !== undefined) return MANUAL[camp.name] ? INSTT.find((i) => i.id === MANUAL[camp.name]) : null;
  const key = norm(camp.name);
  if (!key) return null;
  let hit = INSTT.find((i) => norm(i.name) === key);
  if (!hit && key.length >= 2) {
    const cands = INSTT.filter((i) => norm(i.name).includes(key) || key.includes(norm(i.name)));
    hit = cands.length === 1 ? cands[0] : cands.find((i) => i.name.includes(camp.city.replace(/(시|군)$/, '')));
  }
  return hit || null;
}

// ---------- 세션(_csrf + 쿠키) ----------
let session = null;
async function getSession(force = false) {
  if (session && !force && Date.now() - session.at < 20 * 60 * 1000) return session;
  const res = await politeFetch(`${BASE}/rep/or/fcfsRsrvtMain.do?hmpgId=FRIP`);
  const html = await res.text();
  const csrf = (html.match(/name="_csrf"\s+value="([^"]+)"/) || [])[1];
  const cookies = (res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean)).map((c) => c.split(';')[0]).join('; ');
  if (!csrf) throw new Error('숲나들e _csrf 토큰을 찾지 못했습니다');
  session = { csrf, cookies, at: Date.now() };
  return session;
}

// ---------- 일자별 잔여 사이트 수(지역 단위 일괄 조회, 결과 캐시) ----------
const countCache = new Map(); // `${region}|${date}` → Map(insttId → count)
async function regionCounts(region, date) {
  const key = `${region}|${date}`;
  if (countCache.has(key)) return countCache.get(key);
  const s = await getSession();
  const body = {
    srchInsttArcd: String(region), srchInsttId: '', srchRsrvtBgDt: date.replace(/-/g, ''), srchRsrvtEdDt: addDays(date, 1).replace(/-/g, ''),
    srchStngNofpr: PEOPLE, srchSthngCnt: '1', houseCampSctin: '02', rsrvtPssblYn: 'N', gNowPage: '1',
    goodsClsscHouseCdArr: [], goodsClsscCampCdArr: ['02002'], srchInsttTpcd: [], srtngOrdr: 'consonant',
  };
  const doPost = async (sess) => politeFetch(`${BASE}/rep/or/innerFcfsRcrfrDtlDetls.do?_csrf=${sess.csrf}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=UTF-8', cookie: sess.cookies, referer: `${BASE}/rep/or/fcfsRsrvtMain.do?hmpgId=FRIP` },
    body: JSON.stringify(body),
  });
  let res = await doPost(s);
  if (res.status === 403 || res.status === 302) res = await doPost(await getSession(true));
  const html = await res.text();
  const map = new Map();
  for (const m of html.matchAll(/<div class="rc_item">([\s\S]*?)insttItems\.arrInstt\.push\(\{\s*insttId:"([^"]+)"/g)) {
    const cnt = Number((m[1].match(/예약가능 객실 수\s*:\s*([\d,]+)/) || [, '0'])[1].replace(/,/g, ''));
    map.set(m[2], cnt);
  }
  countCache.set(key, map);
  return map;
}

/** 실행기가 캠핑장 순회 전에 한 번 호출: 필요한 지역×일자 조합을 미리 조회 */
export async function prefetch(camps, from, to) {
  const regions = new Set(camps.map((c) => resolveInstt(c)?.region).filter(Boolean));
  const nights = nightsBetween(from, addDays(to, 1));
  log(`foresttrip prefetch: 지역 ${[...regions].join(',')} × ${nights.length}일`);
  for (const r of regions) for (const d of nights) await regionCounts(r, d).catch((e) => log('foresttrip count 실패', r, d, e.message));
}

// ---------- 사이트 카탈로그(목록 + 요금), 파일 캐시 ----------
let catalog = null;
function loadCatalog() {
  if (catalog) return catalog;
  try { catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8')); } catch { catalog = {}; }
  return catalog;
}
function saveCatalog() {
  fs.mkdirSync(path.dirname(CATALOG_PATH), { recursive: true });
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog));
}
const won = (s) => Number(String(s).replace(/[^0-9]/g, '')) || null;

export function parseSiteList(html) {
  const sites = [];
  for (const m of html.matchAll(/<tr[^>]*id="tr_([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const tds = [...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((t) => t[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    const [type, name, capArea] = tds;
    const cap = (capArea?.match(/(\d+)\s*인/) || [])[1];
    const area = (capArea?.match(/([\d.]+)\s*㎡/) || [])[1];
    const dim = (name?.match(/(\d+(?:\.\d+)?)\s*m?\s*[xX×*]\s*(\d+(?:\.\d+)?)\s*m?/) || []);
    sites.push({ goodsId: m[1], type, name, capacity: cap ? `${cap}인` : '', area: area ? `${area}㎡` : '', dim: dim[1] ? `${dim[1]}×${dim[2]}m` : '' });
  }
  return sites;
}
export function parseDetail(html) {
  const t = html.replace(/\s+/g, ' ');
  const sec = (label) => {
    const i = t.indexOf(`rowspan="2">${label}</th>`);
    if (i < 0) return null;
    const chunk = t.slice(i, i + 400);
    return { weekday: won((chunk.match(/평일요금\s*([\d,]+)/) || [])[1]), weekend: won((chunk.match(/주말요금\s*([\d,]+)/) || [])[1]) };
  };
  const time = (t.match(/입\/퇴실 시간<\/th>\s*<td[^>]*>([^<]+)/) || [])[1]?.trim() || '';
  const sizeNote = (t.match(/크기\)?\s*[:：]\s*([^<]{0,60})/) || [])[1]?.trim() || '';
  return { off: sec('비수기'), peak: sec('성수기'), time, sizeNote };
}

async function getCatalog(instt) {
  const cat = loadCatalog();
  const cur = cat[instt.id];
  if (cur && Date.now() - new Date(cur.fetchedAt).getTime() < CATALOG_TTL_DAYS * 864e5) return cur;
  log('foresttrip 카탈로그 갱신', instt.id, instt.name);
  const listHtml = await fetchText(`${BASE}/pot/rm/fa/selectCmpgrArmpListView.do?hmpgId=${instt.id}&menuId=002002002`);
  const sites = parseSiteList(listHtml);
  // 요금은 (유형, 정원, 면적) 그룹당 대표 1개만 상세 조회
  const groups = new Map();
  for (const s of sites) {
    const g = `${s.type}|${s.capacity}|${s.area}|${s.dim}`;
    if (!groups.has(g)) groups.set(g, s.goodsId);
  }
  const priceByGroup = {};
  for (const [g, goodsId] of groups) {
    try {
      const html = await fetchText(`${BASE}/pot/rm/fa/selectCmpgrArmpDtlView.do?insttId=${instt.id}&goodsId=${goodsId}`);
      priceByGroup[g] = parseDetail(html);
    } catch (e) {
      log('foresttrip 상세 실패', instt.id, goodsId, e.message);
    }
  }
  let bookable = null;
  try {
    const info = await fetchJSON(`${BASE}/rep/or/selectFcFsRcfrsFcltInfo.do?insttId=${instt.id}`, { headers: { accept: 'application/json' } });
    const ds = (info.useDtList || []).map((x) => `${x.schdlDt.slice(0, 4)}-${x.schdlDt.slice(4, 6)}-${x.schdlDt.slice(6, 8)}`).sort();
    if (ds.length) bookable = { from: ds[0], to: ds[ds.length - 1] };
  } catch {}
  cat[instt.id] = { fetchedAt: new Date().toISOString(), sites: sites.map((s) => ({ ...s, group: `${s.type}|${s.capacity}|${s.area}|${s.dim}` })), priceByGroup, bookable };
  saveCatalog();
  return cat[instt.id];
}

const isPeak = (iso) => {
  const md = iso.slice(5);
  return md >= '07-01' && md <= '08-31';
};

export async function fetchAvailability(camp, from, to) {
  const instt = resolveInstt(camp);
  if (!instt) return null;
  const cat = await getCatalog(instt);
  const nights = nightsBetween(from, addDays(to, 1));
  const availableCountByDate = {};
  for (const d of nights) {
    if (cat.bookable && (d < cat.bookable.from || d > cat.bookable.to)) continue; // 예약창 밖: 미정
    const m = await regionCounts(instt.region, d).catch(() => null);
    if (m && m.has(instt.id)) availableCountByDate[d] = m.get(instt.id);
  }
  const sites = cat.sites.map((s) => {
    const p = cat.priceByGroup[s.group];
    const priceByDate = {};
    if (p && (p.off || p.peak)) {
      for (const d of nights) {
        const season = isPeak(d) ? p.peak || p.off : p.off || p.peak;
        const v = isWeekendNight(d) ? season.weekend ?? season.weekday : season.weekday ?? season.weekend;
        if (v) priceByDate[d] = v;
      }
    }
    return {
      id: s.goodsId,
      name: s.name,
      zone: s.type,
      size: s.dim || s.area || (p?.sizeNote ?? ''),
      capacity: s.capacity,
      priceByDate,
      availability: 'unknown', // 데크별 현황은 로그인 필요
      bookUrl: `${BASE}/indvz/main.do?hmpgId=${instt.id}`,
    };
  });
  return normalizeResult(platform, camp, sites, {
    campLevel: { availableCountByDate, people: Number(PEOPLE) },
    coverage: cat.bookable,
    note: `${instt.name} · 잔여 수는 ${PEOPLE}인 기준 휴양림 단위(데크별 현황은 숲나들e 로그인 후 확인)`,
    instt: { id: instt.id, name: instt.name, url: `${BASE}/indvz/main.do?hmpgId=${instt.id}` },
  });
}
