// 시트 캠핑장(core) + 좌표(data/coords.json) + 캠핑지도 목록(data/source/campingjido.json) 병합
//  - 시트 캠핑장: 좌표·주소·전화·시설 정보를 보충(예약 플랫폼·요금 등 시트 정보는 유지)
//  - 캠핑지도에만 있는 캠핑장: tier 'ext'로 추가(예약 URL로 플랫폼 감지, 시설 플래그로 바닥·환경·편의 태그 생성)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const REGION1 = {
  11: '서울시', 26: '부산시', 27: '대구시', 28: '인천시', 29: '광주시', 30: '대전시', 31: '울산시', 36: '세종시',
  41: '경기도', 42: '강원도', 51: '강원도', 43: '충청북도', 44: '충청남도', 45: '전라북도', 52: '전라북도',
  46: '전라남도', 47: '경상북도', 48: '경상남도', 50: '제주도',
};
const PROV_BY_PREFIX = [
  ['서울', '서울시'], ['부산', '부산시'], ['대구', '대구시'], ['인천', '인천시'], ['광주', '광주시'], ['대전', '대전시'],
  ['울산', '울산시'], ['세종', '세종시'], ['경기', '경기도'], ['강원', '강원도'], ['충청북', '충청북도'], ['충북', '충청북도'],
  ['충청남', '충청남도'], ['충남', '충청남도'], ['전라북', '전라북도'], ['전북', '전라북도'], ['전라남', '전라남도'],
  ['전남', '전라남도'], ['경상북', '경상북도'], ['경북', '경상북도'], ['경상남', '경상남도'], ['경남', '경상남도'], ['제주', '제주도'],
];

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
export const normName = (s) => clean(s).replace(/\([^)]*\)/g, '').replace(/[\s·・\-_.,'"]/g, '').toLowerCase();
export const coreName = (s) => normName(s).replace(/^(국립|도립|군립|시립)/, '').replace(/(오토|자동차)?(캠핑장|야영장|캠프장|캠핑파크|캠핑리조트|캠핑|글램핑|카라반)$/, '');
const cityKey = (s) => clean(s).replace(/(특별자치시|특별자치도|광역시|특별시|시|군|구|도)$/, '');

export function provinceOf(addr, region1) {
  const t = clean(addr);
  for (const [p, name] of PROV_BY_PREFIX) if (t.startsWith(p)) return name;
  return REGION1[region1] || '';
}
export function cityOf(addr) {
  const tok = clean(addr).split(' ');
  const i = PROV_BY_PREFIX.some(([p]) => (tok[0] || '').startsWith(p)) ? 1 : 0;
  const c = tok[i] || '';
  return /(시|군|구)$/.test(c) ? c : '';
}

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
/** 이름 유사도: 3 = 핵심 이름 일치, 2 = 포함, 1 = 긴 공통부분, 0 = 다름 */
export function nameScore(a, b) {
  const x = coreName(a), y = coreName(b);
  if (!x || !y) return 0;
  if (x === y) return 3;
  if (Math.min(x.length, y.length) >= 2 && (x.includes(y) || y.includes(x))) return 2;
  // Partial overlap only counts on the distinctive part of the name (generic words removed).
  const GENERIC = /(국립공원|국립|자연휴양림|휴양림|국민여가|해수욕장|관리소|야영장|캠핑장|캠핑|오토|자동차|일반|해상|해안|공원|관광지)/g;
  const xs = x.replace(GENERIC, ''), ys = y.replace(GENERIC, '');
  if (xs.length >= 2 && ys.length >= 2 && lcs(xs, ys) >= Math.max(2, Math.ceil(0.75 * Math.min(xs.length, ys.length)))) return 1;
  return 0;
}
export function distKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const FEATURE_LABEL = {
  glamping: '글램핑', caravan: '카라반', autocamping: '오토캠핑', carbakcamping: '차박', power: '전기', wifi: '와이파이',
  shower: '샤워장', pool: '수영장', playground: '놀이터', playinfra: '놀이시설', experience: '체험', longtime: '장박', fire: '불멍(화로)',
};
const ENV_LABEL = { valley: '계곡', beach: '바다', forest: '숲', mountain: '산', lake: '호수', river: '강', island: '섬' };
const FORM_LABEL = { deck: '데크', pastone: '파쇄석', jandi: '잔디', soil: '마사토', stone: '자갈' };

function featuresOf(flags) {
  return flags.map((f) => FEATURE_LABEL[f]).filter(Boolean);
}
function kindOf(name) {
  if (/자연휴양림|휴양림/.test(name)) return '휴양림';
  if (/국민여가/.test(name)) return '국민여가캠핑장';
  return '사설캠핑장';
}

/** 캠핑지도 내부 중복(같은 캠핑장이 두 번 등록) 제거: 핵심 이름이 같고 500m 이내면 정보가 많은 쪽을 남김 */
function dedupeCampingjido(list) {
  const byName = new Map();
  for (const x of list) {
    const k = coreName(x.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(x);
  }
  const out = [];
  let dropped = 0;
  for (const group of byName.values()) {
    const kept = [];
    for (const x of group.sort((a, b) => Number(b.confirmed) - Number(a.confirmed) || b.visits - a.visits || b.comments - a.comments)) {
      if (kept.some((k) => distKm(k, x) < 0.5)) { dropped++; continue; }
      kept.push(x);
    }
    out.push(...kept);
  }
  return { list: out, dropped };
}

export function mergeSources(camps, { root, detectPlatform, overrides = {} }) {
  const coreList = [...camps.values()];
  // 1) 좌표 보충(시트 캠핑장)
  let coords = {};
  try { coords = JSON.parse(fs.readFileSync(path.join(root, 'data/coords.json'), 'utf8')); } catch {}
  for (const c of coreList) {
    c.tier = 'core';
    const g = coords[c.id];
    if (g) Object.assign(c, { lat: g.lat, lng: g.lng, address: c.address || g.address || '', tel: c.tel || g.tel || '' });
  }

  // 2) 캠핑지도
  let src;
  try { src = JSON.parse(fs.readFileSync(path.join(root, 'data/source/campingjido.json'), 'utf8')); } catch { return { matched: 0, added: 0 }; }
  const { list: cj, dropped } = dedupeCampingjido(src.camps);
  let matched = 0, added = 0, coordFromCj = 0;
  const usedCore = new Set();
  // 거리 + 이름이 모두 맞는 쌍을 먼저 확정하고(가까운 순), 좌표가 없는 시트 캠핑장은 시·군 + 이름으로 매칭
  const pairs = [];
  for (const x of cj) {
    for (const c of coreList) {
      const ns = nameScore(c.name, x.name);
      if (!ns) continue;
      if (c.lat != null) {
        const d = distKm(c, x);
        if (d <= (ns >= 2 ? 3 : 1)) pairs.push({ c, x, rank: ns * 10 - d });
      } else {
        const ck = cityKey(c.city);
        if (ck && x.address.includes(ck) && ns >= 2) pairs.push({ c, x, rank: ns * 10 - 5 });
      }
    }
  }
  pairs.sort((a, b) => b.rank - a.rank);
  const usedCj = new Set();
  for (const { c, x } of pairs) {
    if (usedCore.has(c.id) || usedCj.has(x.id)) continue;
    usedCore.add(c.id);
    usedCj.add(x.id);
    matched++;
    if (c.lat == null) { c.lat = x.lat; c.lng = x.lng; coordFromCj++; }
    c.address = x.address || c.address || '';
    c.tel = c.tel || x.tel || '';
    c.campingjidoId = x.id;
    c.features = featuresOf(x.flags);
    c.envTags = x.flags.map((f) => ENV_LABEL[f]).filter(Boolean);
    if (!c.siteForm) c.siteForm = x.flags.map((f) => FORM_LABEL[f]).filter(Boolean).join('/');
    if (!c.pet && x.flags.includes('pet')) c.pet = '애견가능';
    if (!c.intro && x.intro) c.intro = x.intro;
  }

  // 3) 캠핑지도에만 있는 캠핑장 추가
  for (const x of cj) {
    if (usedCj.has(x.id)) continue;
    const province = provinceOf(x.address, x.region1);
    const city = cityOf(x.address) || cityOf(x.address1);
    const key = `${x.name}|${city}`;
    if (camps.has(key)) continue;
    const ov = overrides[key];
    let bookingRaw = ov?.url || x.reservUrl || '';
    if (!bookingRaw) bookingRaw = x.flags.includes('reservtel') ? '전화예약' : x.flags.includes('reservoffline') ? '현장 선착순' : '';
    const platform = detectPlatform(bookingRaw);
    const envTags = x.flags.map((f) => ENV_LABEL[f]).filter(Boolean);
    camps.set(key, {
      id: 'j' + crypto.createHash('sha1').update('cj' + x.id).digest('hex').slice(0, 8),
      tier: 'ext',
      name: x.name,
      province,
      city,
      kind: kindOf(x.name),
      siteForm: x.flags.map((f) => FORM_LABEL[f]).filter(Boolean).join('/'),
      environment: '',
      intro: x.intro || '',
      season: '',
      priceWeekend: null,
      priceWeekday: null,
      bookingRaw,
      sheetBooking: '',
      bookingNote: ov?.note || '',
      platform: platform.id,
      platformName: platform.name,
      bookingUrl: platform.url,
      platformRef: platform.ref,
      pet: x.flags.includes('pet') ? '애견가능' : '',
      privateFacility: '',
      winter: '',
      videos: [],
      lat: x.lat,
      lng: x.lng,
      address: x.address,
      tel: x.tel,
      features: featuresOf(x.flags),
      envTags,
      campingjidoId: x.id,
      source: 'campingjido',
    });
    added++;
  }
  return { matched, added, dropped, coordFromCj, coreWithoutCoords: coreList.filter((c) => c.lat == null).map((c) => `${c.name}(${c.city})`) };
}
