// 캠핑지도(map.campingjido.com) 전국 캠핑장 목록 → data/source/campingjido.json
// 사용법: node scripts/fetch-campingjido.mjs   (약 140페이지, 페이지당 0.8초 간격 ≈ 2분)
// 목록 API는 운영 중(isopen=1)인 캠핑장만 30개씩 돌려줍니다. 앱·웹에 필요한 필드만 남겨 저장합니다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/source/campingjido.json');
const API = 'https://map.campingjido.com/server/api/?c=Campingjido&m=getCampingList&limit=30&keyword=&page=';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FLAGS = [
  'isreservinternet', 'isreservtel', 'isreservoffline', 'iscommoncamping', 'isautocamping', 'iscaravan', 'iscarbakcamping',
  'isglamping', 'isforest', 'ismountain', 'isvalley', 'isriver', 'islake', 'isbeach', 'isisland', 'isjandi', 'isstone',
  'isdeck', 'ispastone', 'issoil', 'ispower', 'iswifi', 'istoilet', 'isshower', 'iswater', 'isfire', 'ispool',
  'isplayinfra', 'isplayground', 'ispet', 'isexperience', 'islongtime',
];

async function page(n) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(API + n, { headers: { 'User-Agent': 'Mozilla/5.0 (camp-finder)', Referer: 'https://map.campingjido.com/camping' } });
      if (r.ok) return (await r.json()).data || [];
    } catch {}
    await sleep(2000 * (t + 1));
  }
  throw new Error(`page ${n} failed`);
}

const all = new Map();
for (let n = 1; n < 400; n++) {
  const rows = await page(n);
  if (!rows.length) break;
  for (const x of rows) {
    const flags = FLAGS.filter((f) => Number(x[f]) === 1).map((f) => f.slice(2));
    all.set(x.campingid, {
      id: x.campingid,
      name: String(x.name || '').replace(/<[^>]+>/g, '').trim(),
      region1: x.c_region1_code,
      region2: x.c_region2_code,
      address: x.address2 || x.address || '',
      address1: x.address || '',
      lat: x.lat,
      lng: x.lng,
      tel: x.tel || '',
      reservUrl: x.reservurl || '',
      intro: x.inlinecontents || '',
      source: x.source || '',
      gocampingId: x.contentid || '',
      flags,
      confirmed: Number(x.isconfirm) === 1,
      visits: Number(x.conqcnt) || 0,
      comments: Number(x.commentcnt) || 0,
      modified: x.modifydate || '',
    });
  }
  process.stderr.write(`\rpage ${n} · ${all.size}곳`);
  await sleep(800);
}
const list = [...all.values()].sort((a, b) => a.id - b.id);
if (list.length < 1000) throw new Error(`목록이 너무 적습니다(${list.length}) — API 변경 여부를 확인하세요`);
fs.writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), source: 'https://map.campingjido.com/camping', count: list.length, camps: list }, null, 0));
console.error(`\n저장: ${path.relative(ROOT, OUT)} (${list.length}곳)`);
