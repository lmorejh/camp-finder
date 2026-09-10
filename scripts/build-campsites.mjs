// 시트(캠핑장리스트.xlsx) → data/campsites.json + docs/data/campsites.json
// 사용법: npm run build:data  (또는 node scripts/build-campsites.mjs [xlsx 경로])
import XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { detectPlatform } from '../scraper/platforms.mjs';
import { buildProsCons } from './pros-cons.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = process.argv[2] || path.join(ROOT, 'data/source/campsites.xlsx');

const wb = XLSX.readFile(SRC);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

// 셀 하이퍼링크(유튜브 영상 링크) 추출: 열 N(13) 기준
function cellLink(r, c) {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = ws[addr];
  return cell && cell.l && cell.l.Target ? cell.l.Target : '';
}

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const num = (v) => {
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const parseDate = (v) => {
  if (!v) return null;
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null;
  }
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
};

// 헤더 행 찾기
const headerIdx = rows.findIndex((r) => clean(r[0]) === '캠핑장이름');
if (headerIdx < 0) throw new Error('헤더 행(캠핑장이름)을 찾지 못했습니다');

const camps = new Map();
for (let i = headerIdx + 1; i < rows.length; i++) {
  const r = rows[i];
  const name = clean(r[0]);
  if (!name) continue;
  const province = clean(r[1]);
  const city = clean(r[2]);
  const kind = clean(r[3]);
  const priceWeekend = num(r[7]);
  const priceWeekday = num(r[8]);
  // 캠핑장 정보가 전혀 없는 여행기 행(예: 동해안부부여행) 제외
  if (!kind && !priceWeekend && !priceWeekday && !clean(r[9])) continue;

  const key = `${name}|${city}`;
  const video = {
    date: parseDate(r[15]),
    food: clean(r[14]),
    url: (cellLink(i, 13) || cellLink(i, 0)).replace(/&amp;/g, '&'),
  };
  if (!camps.has(key)) {
    const id = 'c' + crypto.createHash('sha1').update(key).digest('hex').slice(0, 8);
    const bookingRaw = clean(r[9]);
    const platform = detectPlatform(bookingRaw);
    camps.set(key, {
      id,
      name,
      province,
      city,
      kind, // 국립공원관리공단 / 국립휴양림 / 공립휴양림 / 지자체시설공사 / 국민여가캠핑장 / 사설캠핑장
      siteForm: clean(r[4]), // 데크/파쇄석/마사토/잔디/혼용
      environment: clean(r[5]),
      season: clean(r[6]),
      priceWeekend,
      priceWeekday,
      bookingRaw,
      platform: platform.id,
      platformName: platform.name,
      bookingUrl: platform.url,
      platformRef: platform.ref, // 플랫폼 내부 식별자(캠핏 campId, 땡큐캠핑 cseq 등)
      pet: clean(r[10]),
      privateFacility: clean(r[11]),
      winter: clean(r[12]),
      videos: [],
    });
  }
  const c = camps.get(key);
  if (video.date || video.food || video.url) c.videos.push(video);
  // 비어 있던 필드는 뒤 행에서 보충
  for (const [k, col] of [['environment', 5], ['season', 6], ['pet', 10], ['privateFacility', 11], ['winter', 12], ['siteForm', 4]]) {
    if (!c[k] && clean(r[col])) c[k] = clean(r[col]);
  }
  if (!c.priceWeekend && priceWeekend) c.priceWeekend = priceWeekend;
  if (!c.priceWeekday && priceWeekday) c.priceWeekday = priceWeekday;
}

const list = [...camps.values()].map((c) => {
  c.videos.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const pc = buildProsCons(c);
  return { ...c, pros: pc.pros, cons: pc.cons };
});

const out = { generatedAt: new Date().toISOString(), source: path.basename(SRC), count: list.length, campsites: list };
for (const p of ['data/campsites.json', 'docs/data/campsites.json']) {
  fs.mkdirSync(path.dirname(path.join(ROOT, p)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, p), JSON.stringify(out, null, 1));
}
const byPlatform = {};
for (const c of list) byPlatform[c.platform] = (byPlatform[c.platform] || 0) + 1;
console.log(`campsites: ${list.length}`);
console.log(byPlatform);
