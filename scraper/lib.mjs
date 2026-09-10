// 어댑터 공용 유틸: 요청 제한, 재시도, 캐시, 로깅
import fs from 'node:fs';
import path from 'node:path';

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 camp-finder/0.1 (+personal availability checker)';

const DEFAULT_MIN_GAP_MS = Number(process.env.CF_MIN_GAP_MS || 700); // 플랫폼별 요청 간 최소 간격(서버 부담 최소화)
const lastCallByHost = new Map();

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 호스트별 간격 제한 + 재시도가 있는 fetch. 응답 본문을 text로 반환 */
export async function politeFetch(url, opts = {}, { retries = 2, minGap = DEFAULT_MIN_GAP_MS, timeoutMs = 20000 } = {}) {
  const host = new URL(url).host;
  const last = lastCallByHost.get(host) || 0;
  const wait = last + minGap - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallByHost.set(host, Date.now());

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...opts,
        signal: ctrl.signal,
        headers: { 'user-agent': UA, 'accept-language': 'ko-KR,ko;q=0.9', ...(opts.headers || {}) },
      });
      clearTimeout(t);
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      await sleep(800 * (attempt + 1));
    }
  }
  throw lastErr;
}

export async function fetchJSON(url, opts, extra) {
  const res = await politeFetch(url, opts, extra);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`JSON 파싱 실패 (${res.status}) ${url}: ${text.slice(0, 120)}`);
  }
}

export async function fetchText(url, opts, extra) {
  const res = await politeFetch(url, opts, extra);
  return res.text();
}

export function log(...a) {
  console.error(new Date().toISOString().slice(11, 19), ...a);
}

/** 간단한 파일 캐시(로컬 서버 모드에서 같은 조회 반복 방지) */
export class FileCache {
  constructor(dir, ttlMs) {
    this.dir = dir;
    this.ttl = ttlMs;
    fs.mkdirSync(dir, { recursive: true });
  }
  file(key) {
    return path.join(this.dir, encodeURIComponent(key) + '.json');
  }
  get(key) {
    try {
      const f = this.file(key);
      const st = fs.statSync(f);
      if (Date.now() - st.mtimeMs > this.ttl) return null;
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {
      return null;
    }
  }
  set(key, val) {
    fs.writeFileSync(this.file(key), JSON.stringify(val));
  }
}

/** 어댑터 반환 형식 정규화
 * sites: [{ id, name, zone, size, capacity, priceByDate:{ 'YYYY-MM-DD': number }, availableDates:[...], bookUrl }]
 */
export function normalizeResult(platform, camp, sites, extra = {}) {
  return {
    campId: camp.id,
    platform,
    status: 'ok',
    fetchedAt: new Date().toISOString(),
    sites: sites.map((s) => ({
      id: String(s.id ?? s.name),
      name: s.name || String(s.id),
      zone: s.zone || '',
      size: s.size || '',
      capacity: s.capacity || '',
      priceByDate: s.priceByDate || {},
      availableDates: [...new Set(s.availableDates || [])].sort(),
      bookUrl: s.bookUrl || camp.bookingUrl,
    })),
    ...extra,
  };
}
