import type { FilterKey } from '../components/FilterBar';
import type { Camp } from '../types';
import type { Evaluated } from './evaluate';

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/** Lowercased, space-free text used for search. */
export function searchText(c: Camp): string {
  return norm(
    [c.name, c.province, c.city, c.address, c.kind, c.siteForm, c.environment, c.intro, c.platformName, ...(c.features || []), ...(c.envTags || [])]
      .filter(Boolean)
      .join(' '),
  );
}

export function matchesQuery(text: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((w) => text.includes(w));
}

const PUBLIC = /국립|공립|지자체|국민여가|휴양림/;

export function passesFilters(r: Evaluated, active: Set<FilterKey>, favorites: Set<string>, liveAdapters: Set<string>): boolean {
  const c = r.camp;
  if (active.has('available') && r.status !== 'ok') return false;
  if (active.has('favorites') && !favorites.has(c.id)) return false;
  if (active.has('live') && !liveAdapters.has(c.platform)) return false;
  if (active.has('public') && !PUBLIC.test(c.kind)) return false;
  if (active.has('pet') && !/가능/.test(c.pet)) return false;
  if (active.has('glamping') && !(c.features || []).includes('글램핑') && !/글램핑/.test(c.name)) return false;
  if (active.has('caravan') && !(c.features || []).includes('카라반') && !/카라반/.test(c.name)) return false;
  if (active.has('valley') && !(c.envTags || []).includes('계곡') && !/계곡/.test(c.environment + c.name)) return false;
  if (active.has('beach') && !(c.envTags || []).includes('바다') && !/바다|해변|해수욕/.test(c.environment + c.name)) return false;
  return true;
}
