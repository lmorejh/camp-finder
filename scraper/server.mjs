// 로컬 실시간 서버: docs/ 정적 파일 + /api/availability?from=&to=&ids=a,b (선택 캠핑장을 그 자리에서 조회)
// 사용법: npm run serve  → http://localhost:8787
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAdapters, fetchCamp } from './core.mjs';
import { FileCache } from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const PORT = Number(process.env.PORT || 8787);
const cache = new FileCache(path.join(ROOT, '.cache'), Number(process.env.CF_CACHE_MS || 5 * 60 * 1000));

const { campsites } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/campsites.json'), 'utf8'));
const byId = new Map(campsites.map((c) => [c.id, c]));
const adapters = await loadAdapters();

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/availability') {
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean).slice(0, 40);
      if (!from || !to || !ids.length) {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'from, to, ids 필요' }));
      }
      const camps = {};
      await Promise.all(
        ids.map(async (id) => {
          const camp = byId.get(id);
          if (!camp) return;
          const key = `${id}|${from}|${to}`;
          let r = cache.get(key);
          if (!r) {
            r = await fetchCamp(adapters, camp, from, to);
            if (r.status === 'ok') cache.set(key, r);
          }
          camps[id] = r;
        })
      );
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(JSON.stringify({ generatedAt: new Date().toISOString(), live: true, window: { from, to }, adapters: Object.keys(adapters), camps }));
    }
    // 정적 파일
    let p = decodeURIComponent(url.pathname);
    if (p === '/') p = '/index.html';
    const file = path.join(DOCS, p);
    if (!file.startsWith(DOCS) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.error(`camp-finder 서버: http://localhost:${PORT}  (어댑터: ${Object.keys(adapters).join(', ')})`));
