// Personal install page for the 캠핑파인더 ad hoc iOS build (Cloudflare Worker "camp-finder-install").
//
//   GET <INSTALL_PATH>           HTML page with the "install on iPhone" button
//   GET <INSTALL_PATH>/ios.plist itms-services manifest
//   GET <INSTALL_PATH>/app.ipa   proxies IOS_IPA_URL (EAS artifact) so iOS sees one stable URL
//
// Worker vars (set at deploy time): INSTALL_PATH (random, not guessable), IOS_IPA_URL, APP_VERSION.
// Ad hoc builds only install on iPhones registered to the Apple team (eas device:create).
//
//   wrangler deploy app/install/worker.mjs --name camp-finder-install --compatibility-date 2025-01-01 \
//     --var INSTALL_PATH:/i/<random> --var IOS_IPA_URL:<eas artifact url> --var APP_VERSION:1.0.0

const BUNDLE_ID = 'com.lmorejh.campfinder';
const TITLE = '캠핑파인더';
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs><radialGradient id="g" cx="25%" cy="18%" r="100%"><stop offset="0" stop-color="#D3F1DF"/><stop offset="1" stop-color="#93D2B1"/></radialGradient></defs><rect width="1024" height="1024" fill="url(#g)"/><circle cx="760" cy="250" r="70" fill="#FFF3C9"/><path d="M0 830 C 220 700 400 700 512 745 C 640 695 820 690 1024 830 L 1024 1024 L 0 1024 Z" fill="#7CC39E" opacity="0.55"/><path d="M512 300 L 800 790 L 224 790 Z" fill="#fff"/><path d="M512 300 L 800 790 L 640 790 Z" fill="#FFDCC8"/><path d="M512 520 L 610 790 L 414 790 Z" fill="#2F7D5B"/><line x1="512" y1="300" x2="512" y2="230" stroke="#fff" stroke-width="22" stroke-linecap="round"/><path d="M512 232 L 600 262 L 512 292 Z" fill="#FFB9A0"/><rect x="170" y="786" width="684" height="26" rx="13" fill="#fff" opacity="0.9"/></svg>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const base = (env.INSTALL_PATH || '/install').replace(/\/+$/, '');
    if (request.method !== 'GET' || !url.pathname.startsWith(base)) return new Response('Not found', { status: 404 });
    const rest = url.pathname.slice(base.length);
    const origin = url.origin;
    if (rest === '' || rest === '/') return html(page(env, origin + base));
    if (rest === '/ios.plist' && env.IOS_IPA_URL) {
      return new Response(manifest(origin + base + '/app.ipa', env.APP_VERSION || '1.0.0'), {
        headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    if (rest === '/app.ipa' && env.IOS_IPA_URL) {
      const upstream = await fetch(env.IOS_IPA_URL, { redirect: 'follow' });
      if (!upstream.ok) return new Response('download unavailable', { status: 502 });
      const headers = { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' };
      const len = upstream.headers.get('content-length');
      if (len) headers['Content-Length'] = len;
      return new Response(upstream.body, { headers });
    }
    return new Response('Not found', { status: 404 });
  },
};

function manifest(ipaUrl, version) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>items</key><array><dict>
<key>assets</key><array><dict><key>kind</key><string>software-package</string><key>url</key><string>${escapeXml(ipaUrl)}</string></dict></array>
<key>metadata</key><dict><key>bundle-identifier</key><string>${BUNDLE_ID}</string><key>bundle-version</key><string>${escapeXml(version)}</string><key>kind</key><string>software</string><key>title</key><string>${TITLE}</string></dict>
</dict></array></dict></plist>`;
}

function page(env, base) {
  const ios = env.IOS_IPA_URL
    ? `<a class="btn" href="itms-services://?action=download-manifest&amp;url=${encodeURIComponent(base + '/ios.plist')}">아이폰에 설치</a>
       <p class="note">설치 후 처음 한 번: 설정 &gt; 개인정보 보호 및 보안 &gt; <b>개발자 모드</b>가 꺼져 있으면 켜기 → 재시동 → 켬 확인.<br>등록된 아이폰에서만 설치됩니다. 캠핑장 목록·예약 현황은 앱이 알아서 새로 받아요(재설치 불필요).</p>`
    : `<span class="btn off">아이폰 버전 준비 중</span>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${TITLE} 설치</title>
<style>
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',Pretendard,'Malgun Gothic',sans-serif;background:linear-gradient(#DDF2E5,#F7FAF6 60%);color:#25302A;min-height:100vh}
main{max-width:420px;margin:0 auto;padding:56px 24px;text-align:center}
.icon svg{width:112px;height:112px;border-radius:26px;box-shadow:0 10px 30px rgba(47,90,68,.22)}
h1{font-size:30px;margin:20px 0 6px;letter-spacing:-.6px}
.sub{color:#56635B;margin:0 0 32px}
.btn{display:block;padding:17px;border-radius:16px;background:#2F7D5B;color:#fff;font-weight:700;font-size:18px;text-decoration:none;margin-top:14px}
.btn.off{background:#E5ECE4;color:#93A098}
.note{font-size:13px;color:#93A098;line-height:1.6;margin:10px 4px 18px}
</style></head><body><main>
<div class="icon">${ICON_SVG}</div>
<h1>${TITLE}</h1><p class="sub">전국 캠핑장 예약 현황을 Google 지도에서 한눈에</p>
${ios}
</main></body></html>`;
}

function html(body) {
  return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
}
