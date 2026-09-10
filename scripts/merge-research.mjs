// 조사 결과(research_result_*.json) → data/booking-overrides.json 병합
// 사용법: node scripts/merge-research.mjs <결과 JSON 파일 ...>
// 결과 항목: {id, name, city, status: found|not_found|closed|phone|walkin|cafe, engine, url, ref, note}
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/booking-overrides.json');
const { campsites } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/campsites.json'), 'utf8'));
const byId = new Map(campsites.map((c) => [c.id, c]));

let overrides = {};
try { overrides = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {}

// 엔진 → 플랫폼 감지기가 이해하는 URL/문구로 변환
function toBooking(r) {
  const e = (r.engine || '').toLowerCase();
  if (r.status === 'closed') return '폐업함';
  if (r.status === 'phone' || e === 'phone') return '전화예약';
  if (r.status === 'walkin' || e === 'walkin') return '선착순';
  if (r.status === 'cafe' || e === 'cafe') return r.url && /cafe\.naver/.test(r.url) ? r.url : 'https://cafe.naver.com/';
  if (r.status !== 'found' || !r.url) return null;
  return r.url;
}

const stats = {};
for (const file of process.argv.slice(2)) {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const r of rows) {
    const camp = byId.get(r.id);
    if (!camp) { console.error('id 없음:', r.id, r.name); continue; }
    const booking = toBooking(r);
    const key = `${camp.name}|${camp.city}`;
    const tag = r.status === 'found' ? (r.engine || 'other') : r.status;
    stats[tag] = (stats[tag] || 0) + 1;
    if (!booking) continue;
    overrides[key] = { url: booking, engine: r.engine || '', ref: r.ref || '', note: r.note || '', source: path.basename(file) };
  }
}
fs.writeFileSync(OUT, JSON.stringify(overrides, null, 1));
console.log('overrides:', Object.keys(overrides).length, '\n', stats);
