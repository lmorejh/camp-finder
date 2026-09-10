// 어댑터 로딩과 단일 캠핑장 조회(에러 격리)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** scraper/adapters/*.mjs 를 모두 로드. 각 모듈은 { platform, fetchAvailability(camp, from, to) } 를 export */
export async function loadAdapters() {
  const dir = path.join(__dirname, 'adapters');
  const adapters = {};
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.mjs') || f.startsWith('_')) continue;
    const mod = await import(path.join(dir, f).replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
    if (mod.platform && typeof mod.fetchAvailability === 'function') adapters[mod.platform] = mod;
  }
  return adapters;
}

/** 어댑터별 prefetch(camps, from, to) 훅 호출(지역 단위 일괄 조회 등) */
export async function prefetchAll(adapters, camps, from, to) {
  for (const [id, ad] of Object.entries(adapters)) {
    if (typeof ad.prefetch !== 'function') continue;
    const mine = camps.filter((c) => c.platform === id);
    if (!mine.length) continue;
    try {
      await ad.prefetch(mine, from, to);
    } catch (e) {
      console.error(`[prefetch:${id}]`, e.message);
    }
  }
}

export async function fetchCamp(adapters, camp, from, to) {
  const ad = adapters[camp.platform];
  if (!ad) return { campId: camp.id, platform: camp.platform, status: 'unsupported', fetchedAt: new Date().toISOString(), sites: [] };
  try {
    const r = await ad.fetchAvailability(camp, from, to);
    if (!r) return { campId: camp.id, platform: camp.platform, status: 'unmapped', fetchedAt: new Date().toISOString(), sites: [], error: '플랫폼 내 캠핑장 매핑 없음' };
    return r;
  } catch (e) {
    return { campId: camp.id, platform: camp.platform, status: 'error', fetchedAt: new Date().toISOString(), sites: [], error: String(e.message || e).slice(0, 200) };
  }
}
