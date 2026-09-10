// 전체(또는 선택) 캠핑장의 예약 현황을 수집해 docs/data/availability.json 으로 저장
// 사용법: node scraper/run.mjs [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--platform camfit,knps] [--ids c123,c456] [--limit N]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAdapters, fetchCamp, prefetchAll } from './core.mjs';
import { addDays, toISO } from '../docs/pricing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : [])).filter((x) => x.length)
);

const today = toISO(new Date());
const from = args.from || today;
const to = args.to || addDays(today, Number(process.env.CF_WINDOW_DAYS || 60));
const onlyPlatforms = args.platform ? String(args.platform).split(',') : null;
const onlyIds = args.ids ? String(args.ids).split(',') : null;
const limit = args.limit ? Number(args.limit) : Infinity;
const concurrency = Number(process.env.CF_CONCURRENCY || 3);

const { campsites } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/campsites.json'), 'utf8'));
const adapters = await loadAdapters();

let targets = campsites.filter((c) => adapters[c.platform]);
if (onlyPlatforms) targets = targets.filter((c) => onlyPlatforms.includes(c.platform));
if (onlyIds) targets = targets.filter((c) => onlyIds.includes(c.id));
targets = targets.slice(0, limit);

console.error(`조회 대상 ${targets.length}곳, 기간 ${from} ~ ${to}, 어댑터: ${Object.keys(adapters).join(', ')}`);

const outPath = path.join(ROOT, 'docs/data/availability.json');
let prev = { camps: {} };
try { prev = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch {}

const results = { ...prev.camps };
await prefetchAll(adapters, targets, from, to);
let i = 0;
async function worker() {
  while (i < targets.length) {
    const camp = targets[i++];
    const r = await fetchCamp(adapters, camp, from, to);
    results[camp.id] = r;
    const n = r.sites ? r.sites.length : 0;
    console.error(`[${r.status}] ${camp.platform} ${camp.name} sites=${n}${r.error ? ' ' + r.error : ''}`);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));

const platformSummary = {};
for (const r of Object.values(results)) {
  const k = r.platform;
  platformSummary[k] ??= { ok: 0, error: 0, sites: 0 };
  if (r.status === 'ok') platformSummary[k].ok++; else platformSummary[k].error++;
  platformSummary[k].sites += r.sites ? r.sites.length : 0;
}
const out = { generatedAt: new Date().toISOString(), window: { from, to }, adapters: Object.keys(adapters), platformSummary, camps: results };
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out));
console.error('저장:', path.relative(ROOT, outPath), JSON.stringify(platformSummary));
