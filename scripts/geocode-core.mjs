// 시트 캠핑장(좌표 없음) → 장소 검색으로 좌표 보충 → data/coords.json
// 사용법: NAVER_CLIENT_ID=... NAVER_CLIENT_SECRET=... node scripts/geocode-core.mjs [--all]
//   (NAVER API HUB 검색 키. 없으면 KAKAO_REST_API_KEY로 카카오 로컬 키워드 검색)
// 이미 data/coords.json에 있는 캠핑장은 건너뜁니다(--all이면 다시 조회). 키는 저장소에 넣지 마세요.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = process.env.KAKAO_REST_API_KEY;
const NAVER = process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET;
if (!KEY && !NAVER) throw new Error('NAVER_CLIENT_ID/NAVER_CLIENT_SECRET 또는 KAKAO_REST_API_KEY 환경변수가 필요합니다');
const OUT = path.join(ROOT, 'data/coords.json');
const all = process.argv.includes('--all');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { campsites } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/campsites.json'), 'utf8'));
let coords = {};
try { coords = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {}

const norm = (s) => String(s || '').replace(/\([^)]*\)/g, '').replace(/[\s·・\-_.,'"]/g, '').toLowerCase();
const core = (s) => norm(s).replace(/(오토|자동차)?(캠핑장|야영장|캠프장|캠핑파크|캠핑|글램핑)$/, '');
const cityKey = (s) => String(s || '').replace(/(특별자치시|특별자치도|광역시|특별시|시|군|구)$/, '');

// 공통 형태: { id, place_name, address_name, road_address_name, x(lng), y(lat), category_name, phone }
async function kakao(query) {
  if (NAVER) return naver(query);
  const u = `https://dapi.kakao.com/v2/local/search/keyword.json?size=15&query=${encodeURIComponent(query)}`;
  for (let t = 0; t < 3; t++) {
    const r = await fetch(u, { headers: { Authorization: `KakaoAK ${KEY}` } });
    if (r.ok) return (await r.json()).documents || [];
    if (r.status === 429) await sleep(3000);
    else throw new Error(`kakao ${r.status} ${await r.text()}`);
  }
  return [];
}
async function naver(query) {
  const u = `https://naverapihub.apigw.ntruss.com/search/v1/local?display=5&query=${encodeURIComponent(query)}`;
  for (let t = 0; t < 3; t++) {
    const r = await fetch(u, { headers: { 'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_CLIENT_ID, 'X-NCP-APIGW-API-KEY': process.env.NAVER_CLIENT_SECRET } });
    if (r.ok) {
      return ((await r.json()).items || []).map((d) => ({
        id: 'n' + d.mapx + d.mapy,
        place_name: d.title.replace(/<[^>]+>/g, ''),
        address_name: d.address, road_address_name: d.roadAddress,
        x: Number(d.mapx) / 1e7, y: Number(d.mapy) / 1e7,
        category_name: d.category, phone: d.telephone,
      }));
    }
    if (r.status === 429) await sleep(2000);
    else throw new Error(`naver ${r.status} ${await r.text()}`);
  }
  return [];
}

/** 가장 긴 공통 부분 문자열 길이 */
export function lcs(a, b) {
  let best = 0;
  const prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : 0;
      if (prev[j] > best) best = prev[j];
      diag = tmp;
    }
  }
  return best;
}

// 시·도 이름 → 짧은 키(행정구역 개편 이름도 같은 키): 전라북도/전북특별자치도 → 전북
export function provKey(s) {
  const t = String(s || '').trim();
  const pairs = [['충청북', '충북'], ['충청남', '충남'], ['경상북', '경북'], ['경상남', '경남'], ['전라북', '전북'], ['전라남', '전남']];
  for (const [a, b] of pairs) if (t.startsWith(a)) return b;
  return t.slice(0, 2);
}

function pick(docs, camp, relaxed = false) {
  const ck = cityKey(camp.city).replace(/도$/, '');
  const pk = provKey(camp.province);
  const n = core(camp.name);
  const addr = (d) => `${d.address_name || ''} ${d.road_address_name || ''}`;
  const inCity = docs.filter((d) => (relaxed ? provKey(addr(d).trim()) === pk : !ck || addr(d).includes(ck)));
  const scored = inCity
    .map((d) => {
      const dn = core(d.place_name);
      let s = 0;
      if (dn === n) s += 10;
      else if (n.length >= 2 && (dn.includes(n) || n.includes(dn))) s += 6;
      else if (lcs(dn, n) >= Math.max(3, Math.ceil(0.6 * Math.min(dn.length, n.length)))) s += 6;
      if (/야영|캠핑|휴양림|오토캠|글램핑|카라반/.test(d.category_name || '')) s += 3;
      return { d, s };
    })
    .filter((x) => x.s >= (relaxed ? 9 : 6))
    .sort((a, b) => b.s - a.s);
  return scored[0]?.d || null;
}

let done = 0, miss = 0;
for (const c of campsites) {
  if (c.province === '일본') continue;
  if (!all && coords[c.id]) continue;
  let hit = null;
  for (const q of [c.name, `${c.city} ${c.name}`, `${c.city} ${core(c.name)}`]) {
    const docs = await kakao(q);
    hit = pick(docs, c) || pick(docs, c, true);
    await sleep(120);
    if (hit) break;
  }
  if (hit) {
    coords[c.id] = { lat: Number(hit.y), lng: Number(hit.x), address: hit.road_address_name || hit.address_name, tel: hit.phone || '', placeId: hit.id, name: c.name };
    done++;
  } else {
    miss++;
    console.error('좌표 없음:', c.name, c.city);
  }
}
fs.writeFileSync(OUT, JSON.stringify(coords, null, 1));
console.error(`좌표 ${done}곳 추가, 실패 ${miss}곳, 총 ${Object.keys(coords).length}곳 → data/coords.json`);
