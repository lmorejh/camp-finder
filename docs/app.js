import { toISO, addDays, nightsBetween, estimatePeriodPrice, sumSitePrice, siteAvailableAll, won, isWeekendNight } from './pricing.js';

const $ = (s) => document.querySelector(s);
const state = { camps: [], avail: { camps: {} }, live: false, lastLive: null };

// ---------- 데이터 로딩 ----------
async function loadJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

async function init() {
  const today = toISO(new Date());
  // 기본값: 다음 주 금요일 1박
  const d = new Date();
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
  $('#checkIn').value = toISO(d);
  $('#checkOut').value = addDays(toISO(d), 1);
  $('#checkIn').min = today;
  $('#checkOut').min = addDays(today, 1);

  const campsData = await loadJSON('data/campsites.json');
  state.camps = campsData.campsites;
  $('#totalCount').textContent = state.camps.length;
  try {
    state.avail = await loadJSON('data/availability.json');
  } catch {
    state.avail = { camps: {}, generatedAt: null };
  }
  // 로컬 서버(실시간 API)가 있는지 확인
  try {
    const r = await fetch('/api/availability?probe=1', { method: 'GET' });
    state.live = r.status === 400; // 파라미터 없으면 400 → API 존재
  } catch {
    state.live = false;
  }
  $('#btnLive').hidden = !state.live;
  fillSelects();
  bind();
  render();
}

function fillSelects() {
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  for (const p of uniq(state.camps.map((c) => c.province))) $('#province').append(new Option(p, p));
  for (const k of uniq(state.camps.map((c) => c.kind))) $('#kind').append(new Option(k, k));
  const plats = {};
  for (const c of state.camps) plats[c.platform] = c.platformName;
  for (const [id, name] of Object.entries(plats).sort((a, b) => a[1].localeCompare(b[1], 'ko'))) $('#platform').append(new Option(name, id));
  fillCities();
}
function fillCities() {
  const prov = $('#province').value;
  const sel = $('#city');
  sel.innerHTML = '<option value="">전체</option>';
  const cities = [...new Set(state.camps.filter((c) => !prov || c.province === prov).map((c) => c.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  for (const c of cities) sel.append(new Option(c, c));
}

function bind() {
  for (const id of ['checkIn', 'checkOut', 'province', 'city', 'kind', 'platform', 'sort', 'onlyAvailable', 'onlyLive', 'pet', 'winter']) {
    $('#' + id).addEventListener('change', () => {
      if (id === 'province') fillCities();
      if (id === 'checkIn' && $('#checkOut').value <= $('#checkIn').value) $('#checkOut').value = addDays($('#checkIn').value, 1);
      render();
    });
  }
  let t;
  $('#q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(render, 150); });
  $('#btnLive').addEventListener('click', liveFetch);
}

// ---------- 상태 계산 ----------
function evaluate(camp, nights) {
  const a = state.avail.camps[camp.id];
  const est = estimatePeriodPrice(camp, nights[0], addDays(nights[nights.length - 1], 1));
  const base = { camp, est, sites: [], availableSites: [], minPrice: null };
  if (!a || a.status === 'unsupported') return { ...base, status: 'manual' };
  if (a.status === 'error' || a.status === 'unmapped') return { ...base, status: 'err', error: a.error, fetchedAt: a.fetchedAt };
  const win = a.coverage || state.avail.window;
  const inWindow = !win || (nights[0] >= win.from && nights[nights.length - 1] <= win.to);
  // 휴양림 단위 잔여 수만 제공되는 플랫폼(숲나들e): 사이트별 O/X 대신 일자별 잔여 수로 판정
  if (a.campLevel) {
    const counts = nights.map((n) => a.campLevel.availableCountByDate[n]);
    const known = counts.every((c) => c != null);
    const minCount = known ? Math.min(...counts) : null;
    const sites = a.sites.map((s) => ({ ...s, availableAll: null, price: sumSitePrice(s, nights), perNight: nights.map(() => null) }));
    const prices = sites.map((s) => s.price).filter((p) => p != null);
    return {
      ...base, sites, availableSites: [], campLevel: a.campLevel, minCount, note: a.note,
      minPrice: prices.length ? Math.min(...prices) : null,
      status: !known || !inWindow ? 'outside' : minCount > 0 ? 'ok' : 'full',
      fetchedAt: a.fetchedAt,
    };
  }
  const sites = a.sites.map((s) => {
    const availableAll = siteAvailableAll(s, nights);
    const price = sumSitePrice(s, nights);
    return { ...s, availableAll, price, perNight: nights.map((n) => (s.availableDates || []).includes(n)) };
  });
  const availableSites = sites.filter((s) => s.availableAll);
  const prices = availableSites.map((s) => s.price).filter((p) => p != null);
  return {
    ...base,
    sites,
    availableSites,
    note: a.note,
    minPrice: prices.length ? Math.min(...prices) : null,
    status: !inWindow ? 'outside' : availableSites.length ? 'ok' : 'full',
    fetchedAt: a.fetchedAt,
  };
}

const STATUS_LABEL = { ok: '예약가능', full: '만실', manual: '직접확인', err: '조회오류', outside: '조회범위 밖' };
const STATUS_CLASS = { ok: 'ok', full: 'full', manual: 'manual', err: 'err', outside: 'unknown' };
const STATUS_ORDER = { ok: 0, outside: 1, full: 2, manual: 3, err: 4 };

// ---------- 렌더 ----------
function render() {
  const checkIn = $('#checkIn').value;
  const checkOut = $('#checkOut').value;
  const nights = nightsBetween(checkIn, checkOut);
  $('#nightsLabel').textContent = nights.length ? `${nights.length}박 · 주말요금 ${nights.filter(isWeekendNight).length}박` : '체크아웃은 체크인 다음날 이후여야 합니다';
  const f = {
    province: $('#province').value, city: $('#city').value, kind: $('#kind').value, platform: $('#platform').value,
    onlyAvailable: $('#onlyAvailable').checked, onlyLive: $('#onlyLive').checked, pet: $('#pet').checked, winter: $('#winter').checked,
    q: $('#q').value.trim().toLowerCase(),
  };
  const liveSet = new Set(state.avail.adapters || []);
  let rows = state.camps
    .filter((c) => (!f.province || c.province === f.province) && (!f.city || c.city === f.city) && (!f.kind || c.kind === f.kind) && (!f.platform || c.platform === f.platform))
    .filter((c) => !f.pet || /가능/.test(c.pet))
    .filter((c) => !f.winter || /동계개장/.test(c.winter))
    .filter((c) => !f.onlyLive || liveSet.has(c.platform))
    .filter((c) => !f.q || [c.name, c.environment, c.province, c.city, c.kind, c.platformName].join(' ').toLowerCase().includes(f.q))
    .map((c) => (nights.length ? evaluate(c, nights) : { camp: c, status: 'manual', est: null, sites: [], availableSites: [] }));
  if (f.onlyAvailable) rows = rows.filter((r) => r.status === 'ok');

  const sort = $('#sort').value;
  const priceOf = (r) => r.minPrice ?? r.est?.total ?? Infinity;
  rows.sort((a, b) => {
    if (sort === 'name') return a.camp.name.localeCompare(b.camp.name, 'ko');
    if (sort === 'priceAsc') return priceOf(a) - priceOf(b);
    if (sort === 'priceDesc') return (priceOf(b) === Infinity ? -1 : priceOf(b)) - (priceOf(a) === Infinity ? -1 : priceOf(a));
    return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || priceOf(a) - priceOf(b) || a.camp.name.localeCompare(b.camp.name, 'ko');
  });

  const counts = {};
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
  $('#summary').innerHTML = `<span><b>${rows.length}</b>곳 표시</span>` + Object.entries(counts).map(([k, v]) => `<span class="st ${STATUS_CLASS[k]}">${STATUS_LABEL[k]} ${v}</span>`).join('');

  const gen = state.lastLive || state.avail.generatedAt;
  $('#dataMeta').textContent = gen
    ? `예약 현황 갱신: ${new Date(gen).toLocaleString('ko-KR')} · 조회 범위 ${state.avail.window?.from ?? '-'} ~ ${state.avail.window?.to ?? '-'} · 실시간 어댑터: ${(state.avail.adapters || []).join(', ') || '없음'}${state.live ? ' · 로컬 실시간 모드' : ''}`
    : '예약 현황 데이터가 아직 없습니다(캠핑장 목록·요금 추정만 표시). GitHub Actions 또는 npm run scrape 실행 후 갱신됩니다.';

  const root = $('#results');
  root.innerHTML = '';
  if (!rows.length) { root.innerHTML = '<p class="empty">조건에 맞는 캠핑장이 없습니다.</p>'; return; }
  const frag = document.createDocumentFragment();
  for (const r of rows) frag.append(card(r, nights));
  root.append(frag);
}

function card(r, nights) {
  const { camp: c } = r;
  const el = $('#cardTpl').content.firstElementChild.cloneNode(true);
  el.querySelector('.name').textContent = c.name;
  const tags = [c.province + (c.city ? ' ' + c.city : ''), c.kind, c.siteForm, c.pet, c.winter, c.privateFacility].filter(Boolean);
  const liveSet = new Set(state.avail.adapters || []);
  el.querySelector('.tags').innerHTML = tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('') + `<span class="tag ${liveSet.has(c.platform) ? 'live' : ''}">${esc(c.platformName)}${liveSet.has(c.platform) ? ' · 실시간' : ''}</span>`;
  const st = el.querySelector('.status');
  st.textContent = STATUS_LABEL[r.status] + (r.status === 'ok' ? (r.campLevel ? ` · 잔여 ${r.minCount}개↑` : ` · ${r.availableSites.length}개 사이트`) : '');
  st.className = 'status ' + STATUS_CLASS[r.status];
  st.title = r.error || (r.fetchedAt ? '조회 시각 ' + new Date(r.fetchedAt).toLocaleString('ko-KR') : '');

  const price = el.querySelector('.price');
  if (r.minPrice != null) price.innerHTML = `<b>${won(r.minPrice)}</b>부터 <small>${nights.length}박 · 플랫폼 실시간 요금</small>`;
  else if (r.est) price.innerHTML = `<b>${won(r.est.total)}</b> <small>${r.est.nights}박 추정(주말 ${r.est.weekendNights}박) · 시트 요금 기준</small>`;
  else price.innerHTML = `<small>요금 정보 없음</small>`;

  el.querySelector('.pros').innerHTML = c.pros.map((p) => `<li>${esc(p)}</li>`).join('');
  el.querySelector('.cons').innerHTML = c.cons.map((p) => `<li>${esc(p)}</li>`).join('');

  const links = [];
  if (c.bookingUrl) links.push(`<a href="${esc(c.bookingUrl)}" target="_blank" rel="noopener">예약 페이지 ↗</a>`);
  else if (c.bookingRaw) links.push(`<span class="note">예약: ${esc(c.bookingRaw)}</span>`);
  for (const v of c.videos.filter((v) => v.url).slice(0, 2)) links.push(`<a href="${esc(v.url)}" target="_blank" rel="noopener">▶ 포토라이TV 영상${v.date ? ' (' + v.date.slice(0, 7) + ')' : ''}</a>`);
  if (c.videos.some((v) => v.food)) links.push(`<span class="note">🍳 ${esc(c.videos.map((v) => v.food).filter(Boolean).slice(0, 2).join(' / '))}</span>`);
  el.querySelector('.links').innerHTML = links.join('');

  const det = el.querySelector('.sites');
  if (r.sites.length) {
    det.querySelector('summary').textContent = r.campLevel
      ? `사이트 ${r.sites.length}개 보기 (일자별 잔여: ${nights.map((n) => `${n.slice(5)} ${r.campLevel.availableCountByDate[n] ?? '?'}개`).join(', ')})`
      : `사이트 ${r.sites.length}개 보기 (예약가능 ${r.availableSites.length}개)`;
    det.querySelector('.sites-body').innerHTML = (r.note ? `<p class="note">${esc(r.note)}</p>` : '') + sitesTable(r, nights);
  } else {
    det.remove();
  }
  return el;
}

function sitesTable(r, nights) {
  const sorted = [...r.sites].sort((a, b) => Number(b.availableAll) - Number(a.availableAll) || (a.price ?? 1e12) - (b.price ?? 1e12) || a.name.localeCompare(b.name, 'ko'));
  const head = `<tr><th>사이트</th><th>구역</th><th>크기</th><th>정원</th><th>기간 요금(${nights.length}박)</th><th>일자별 (${nights.map((n) => n.slice(5)).join(', ')})</th><th></th></tr>`;
  const body = sorted
    .map((s) => {
      const dots = s.countByDate
        ? nights.map((n) => { const c = s.countByDate[n]; return c == null ? '❔' : c > 0 ? `🟢${c}` : '⚫'; }).join(' ')
        : s.perNight.map((ok) => (ok == null ? '❔' : ok ? '🟢' : '⚫')).join('');
      const price = s.price != null ? won(s.price) : r.est ? `≈${won(r.est.total)}` : '-';
      return `<tr class="${s.availableAll ? 'avail' : ''}"><td>${esc(s.name)}</td><td>${esc(s.zone || '-')}</td><td>${esc(s.size || '-')}</td><td>${esc(s.capacity || '-')}</td><td>${price}</td><td class="dots" title="🟢 예약가능 ⚫ 마감">${dots}</td><td>${s.bookUrl ? `<a href="${esc(s.bookUrl)}" target="_blank" rel="noopener">예약 ↗</a>` : ''}</td></tr>`;
    })
    .join('');
  return `<table>${head}${body}</table>`;
}

// ---------- 로컬 실시간 조회 ----------
async function liveFetch() {
  const btn = $('#btnLive');
  btn.disabled = true;
  const from = $('#checkIn').value;
  const to = $('#checkOut').value;
  const liveSet = new Set(state.avail.adapters || []);
  const f = { province: $('#province').value, city: $('#city').value, platform: $('#platform').value, q: $('#q').value.trim().toLowerCase() };
  const ids = state.camps
    .filter((c) => liveSet.has(c.platform) && (!f.province || c.province === f.province) && (!f.city || c.city === f.city) && (!f.platform || c.platform === f.platform) && (!f.q || c.name.toLowerCase().includes(f.q)))
    .map((c) => c.id);
  if (ids.length > 40 && !confirm(`${ids.length}곳을 실시간 조회합니다(플랫폼 부담을 줄이려면 지역·플랫폼을 좁혀 주세요). 계속할까요?`)) { btn.disabled = false; return; }
  try {
    for (let i = 0; i < ids.length; i += 20) {
      btn.textContent = `조회 중… ${Math.min(i + 20, ids.length)}/${ids.length}`;
      const r = await loadJSON(`/api/availability?from=${from}&to=${to}&ids=${ids.slice(i, i + 20).join(',')}`);
      Object.assign(state.avail.camps, r.camps);
      state.avail.window = { from, to: addDays(to, -1) };
      state.avail.adapters = r.adapters;
      state.lastLive = r.generatedAt;
      render();
    }
  } catch (e) {
    alert('실시간 조회 실패: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 선택 기간 실시간 조회';
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

init().catch((e) => { $('#dataMeta').textContent = '초기화 실패: ' + e.message; });
