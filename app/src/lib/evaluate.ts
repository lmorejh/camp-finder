// Same status rules as docs/app.js `evaluate()`.
import type { Availability, Camp, Site } from '../types';
import { addDays, isWeekendNight, nightsBetween } from './dates';

export type Status =
  | 'ok' | 'full' | 'manual' | 'blocked' | 'cafe' | 'phone' | 'walkin' | 'closed' | 'err' | 'outside';

export const STATUS_LABEL: Record<Status, string> = {
  ok: '예약가능', full: '만실', manual: '직접확인', blocked: '캠핏 차단', cafe: '카페예약', phone: '전화예약',
  walkin: '현장선착순', closed: '운영종료', err: '조회오류', outside: '조회범위 밖',
};
export const STATUS_ORDER: Record<Status, number> = {
  ok: 0, outside: 1, full: 2, manual: 3, blocked: 4, err: 5, cafe: 6, phone: 7, walkin: 8, closed: 9,
};
const MANUAL_STATUS: Record<string, Status> = { camfit: 'blocked', navercafe: 'cafe', phone: 'phone', walkin: 'walkin', closed: 'closed' };

export interface EvaluatedSite extends Site {
  availableAll: boolean | null;
  price: number | null;
  perNight: (boolean | null)[];
}

export interface Evaluated {
  camp: Camp;
  status: Status;
  est: { total: number; nights: number; weekendNights: number } | null;
  sites: EvaluatedSite[];
  availableSites: EvaluatedSite[];
  minPrice: number | null;
  minCount?: number | null;
  campLevel?: { availableCountByDate: Record<string, number> };
  note?: string;
  error?: string;
  fetchedAt?: string;
}

export function estimatePeriodPrice(camp: Camp, nights: string[]) {
  if (!nights.length) return null;
  let total = 0;
  for (const n of nights) {
    const w = isWeekendNight(n);
    const p = w ? camp.priceWeekend ?? camp.priceWeekday : camp.priceWeekday ?? camp.priceWeekend;
    if (p == null) return null;
    total += p;
  }
  return { total, nights: nights.length, weekendNights: nights.filter(isWeekendNight).length };
}

export function sumSitePrice(site: Site, nights: string[]): number | null {
  if (!site.priceByDate) return null;
  let total = 0;
  for (const n of nights) {
    const p = site.priceByDate[n];
    if (p == null) return null;
    total += p;
  }
  return total;
}

export function siteAvailableAll(site: Site, nights: string[]): boolean {
  if (!site.availableDates) return false;
  const set = new Set(site.availableDates);
  return nights.every((n) => set.has(n));
}

export function manualStatus(camp: Camp): Status {
  return MANUAL_STATUS[camp.platform] || 'manual';
}

export function evaluate(camp: Camp, avail: Availability, nights: string[]): Evaluated {
  const a = avail.camps[camp.id];
  const est = estimatePeriodPrice(camp, nights);
  const base: Evaluated = { camp, est, sites: [], availableSites: [], minPrice: null, status: manualStatus(camp) };
  if (!nights.length) return base;
  if (!a || a.status === 'unsupported') return base;
  if (a.status === 'unmapped') return { ...base, error: a.error };
  if (a.status === 'error') return { ...base, status: 'err', error: a.error, fetchedAt: a.fetchedAt };
  const win = a.coverage || avail.window;
  const inWindow = !win || (nights[0] >= win.from && nights[nights.length - 1] <= win.to);
  if (!a.campLevel && !a.sites.length) return { ...base, status: 'outside', note: a.note, fetchedAt: a.fetchedAt };
  if (a.campLevel) {
    const counts = nights.map((n) => a.campLevel!.availableCountByDate[n]);
    const known = counts.every((c) => c != null);
    const minCount = known ? Math.min(...counts) : null;
    const sites = a.sites.map((s) => ({ ...s, availableAll: null, price: sumSitePrice(s, nights), perNight: nights.map(() => null) }));
    const prices = sites.map((s) => s.price).filter((p): p is number => p != null);
    return {
      ...base, sites, campLevel: a.campLevel, minCount, note: a.note, fetchedAt: a.fetchedAt,
      minPrice: prices.length ? Math.min(...prices) : null,
      status: !known || !inWindow ? 'outside' : (minCount ?? 0) > 0 ? 'ok' : 'full',
    };
  }
  const sites = a.sites.map((s) => {
    const set = new Set(s.availableDates || []);
    return {
      ...s,
      availableAll: nights.every((n) => set.has(n)),
      price: sumSitePrice(s, nights),
      perNight: nights.map((n) => set.has(n)),
    };
  });
  const availableSites = sites.filter((s) => s.availableAll);
  const prices = availableSites.map((s) => s.price).filter((p): p is number => p != null);
  return {
    ...base, sites, availableSites, note: a.note, fetchedAt: a.fetchedAt,
    minPrice: prices.length ? Math.min(...prices) : null,
    status: !inWindow ? 'outside' : availableSites.length ? 'ok' : 'full',
  };
}

export function stayNights(checkIn: string, checkOut: string) {
  return nightsBetween(checkIn, checkOut);
}
export { addDays };

/** Price used for sorting/labels: live platform price first, sheet estimate second. */
export function priceOf(r: Evaluated): number | null {
  return r.minPrice ?? r.est?.total ?? null;
}

export function compareEvaluated(a: Evaluated, b: Evaluated): number {
  return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (priceOf(a) ?? 1e12) - (priceOf(b) ?? 1e12);
}
