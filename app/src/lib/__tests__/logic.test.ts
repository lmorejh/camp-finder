import fs from 'node:fs';
import path from 'node:path';
import { clusterForRegion } from '../cluster';
import { addDays, defaultStay, isWeekendNight, nightsBetween } from '../dates';
import { compareEvaluated, estimatePeriodPrice, evaluate } from '../evaluate';
import { matchesQuery, passesFilters, searchText } from '../filter';
import { KOREA_REGION } from '../geo';
import type { Availability, Camp } from '../../types';

const camp = (over: Partial<Camp> = {}): Camp => ({
  id: 'c1', name: '테스트 캠핑장', province: '경기도', city: '가평군', kind: '사설캠핑장', siteForm: '데크', environment: '',
  season: '', priceWeekend: 40000, priceWeekday: 30000, bookingRaw: '', bookingNote: '', platform: 'naver', platformName: '네이버 예약',
  bookingUrl: '', pet: '', privateFacility: '', winter: '', videos: [], pros: [], cons: [], lat: 37.8, lng: 127.5, ...over,
});

describe('dates', () => {
  test('weekend nights: Fri/Sat and the night before a holiday', () => {
    expect(isWeekendNight('2026-10-30')).toBe(true); // Fri
    expect(isWeekendNight('2026-10-28')).toBe(false); // Wed
    expect(isWeekendNight('2026-12-24')).toBe(true); // before Christmas
  });
  test('default stay is the coming Friday, one night', () => {
    const s = defaultStay(new Date(2026, 9, 26)); // Mon
    expect(s).toEqual({ checkIn: '2026-10-30', checkOut: '2026-10-31' });
  });
  test('nightsBetween', () => {
    expect(nightsBetween('2026-10-30', '2026-11-01')).toEqual(['2026-10-30', '2026-10-31']);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('evaluate', () => {
  const nights = ['2026-10-30', '2026-10-31'];
  const avail: Availability = {
    generatedAt: null, window: { from: '2026-10-26', to: '2026-12-25' }, adapters: ['naver'],
    camps: {
      c1: { campId: 'c1', platform: 'naver', status: 'ok', fetchedAt: '', sites: [
        { id: 'a', name: 'A1', availableDates: ['2026-10-30', '2026-10-31'], priceByDate: { '2026-10-30': 50000, '2026-10-31': 50000 } },
        { id: 'b', name: 'B1', availableDates: ['2026-10-30'] },
      ] },
      c2: { campId: 'c2', platform: 'naver', status: 'ok', fetchedAt: '', sites: [{ id: 'x', name: 'X', availableDates: [] }] },
      c3: { campId: 'c3', platform: 'naver', status: 'error', fetchedAt: '', sites: [], error: 'boom' },
    },
  };
  test('available when a site is free every night; min price from the platform', () => {
    const r = evaluate(camp(), avail, nights);
    expect(r.status).toBe('ok');
    expect(r.availableSites.map((s) => s.id)).toEqual(['a']);
    expect(r.minPrice).toBe(100000);
  });
  test('full, error, manual and outside-window', () => {
    expect(evaluate(camp({ id: 'c2' }), avail, nights).status).toBe('full');
    expect(evaluate(camp({ id: 'c3' }), avail, nights).status).toBe('err');
    expect(evaluate(camp({ id: 'c9', platform: 'camfit' }), avail, nights).status).toBe('blocked');
    expect(evaluate(camp({ id: 'c9', platform: 'phone' }), avail, nights).status).toBe('phone');
    expect(evaluate(camp(), avail, ['2027-01-08']).status).toBe('outside');
  });
  test('sheet price estimate uses weekend price on Fri/Sat', () => {
    expect(estimatePeriodPrice(camp(), ['2026-10-29', '2026-10-30'])?.total).toBe(70000);
  });
  test('available campsites sort first', () => {
    const rows = ['c2', 'c1', 'c3'].map((id) => evaluate(camp({ id }), avail, nights)).sort(compareEvaluated);
    expect(rows[0].camp.id).toBe('c1');
  });
});

describe('filters and search', () => {
  test('search matches every word across name, region and features', () => {
    const t = searchText(camp({ features: ['글램핑'], envTags: ['계곡'] }));
    expect(matchesQuery(t, '가평 계곡')).toBe(true);
    expect(matchesQuery(t, '제주')).toBe(false);
  });
  test('filters', () => {
    const r = evaluate(camp({ pet: '애견가능', features: ['카라반'] }), { generatedAt: null, adapters: [], camps: {} }, ['2026-10-30']);
    expect(passesFilters(r, new Set(['pet', 'caravan']), new Set(), new Set())).toBe(true);
    expect(passesFilters(r, new Set(['available']), new Set(), new Set())).toBe(false);
    expect(passesFilters(r, new Set(['favorites']), new Set(['c1']), new Set())).toBe(true);
  });
});

describe('published data', () => {
  const dataDir = path.join(__dirname, '../../../../docs/data');
  const camps: Camp[] = JSON.parse(fs.readFileSync(path.join(dataDir, 'campsites.json'), 'utf8')).campsites;
  const avail: Availability = JSON.parse(fs.readFileSync(path.join(dataDir, 'availability.json'), 'utf8'));
  test('list has 4,000+ campsites and nearly all have coordinates', () => {
    expect(camps.length).toBeGreaterThan(4000);
    expect(camps.filter((c) => c.lat != null).length / camps.length).toBeGreaterThan(0.99);
    expect(new Set(camps.map((c) => c.id)).size).toBe(camps.length);
  });
  test('every campsite evaluates and clusters without errors', () => {
    const { checkIn, checkOut } = defaultStay();
    const rows = camps.map((c) => evaluate(c, avail, nightsBetween(checkIn, checkOut)));
    expect(rows.some((r) => r.status === 'ok')).toBe(true);
    const items = clusterForRegion(rows, KOREA_REGION);
    expect(items.length).toBeLessThan(200);
    expect(items.reduce((n, i) => n + (i.kind === 'cluster' ? i.count : 1), 0)).toBe(rows.filter((r) => r.camp.lat != null).length);
  });
});