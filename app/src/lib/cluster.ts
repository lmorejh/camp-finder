import type { MapRegion } from '../types';
import type { Evaluated } from './evaluate';

export type MapItem =
  | { kind: 'place'; id: string; latitude: number; longitude: number; item: Evaluated }
  | { kind: 'cluster'; id: string; latitude: number; longitude: number; count: number; okCount: number; members: Evaluated[] };

/**
 * Grid clustering (same approach as 맛도리GO): the visible region is split into grid × grid
 * cells and any cell with `minClusterSize`+ campsites collapses into one bubble. Zoomed in far
 * enough, every campsite gets its own pin. Linear work, fine for 4,000+ points.
 */
export function clusterForRegion(
  places: Evaluated[],
  region: MapRegion,
  grid = 7,
  minClusterSize = 3,
  streetLevelDelta = 0.08,
  maxPins = 150,
): MapItem[] {
  const streetLevel =
    region.latitudeDelta <= streetLevelDelta / 4 ||
    (region.latitudeDelta <= streetLevelDelta && places.length <= maxPins);
  const cellLat = region.latitudeDelta / grid;
  const cellLng = region.longitudeDelta / grid;
  const buckets = new Map<string, Evaluated[]>();
  for (const r of places) {
    const { lat, lng } = r.camp;
    if (lat == null || lng == null) continue;
    const key = `${Math.floor(lat / cellLat)}:${Math.floor(lng / cellLng)}`;
    const b = buckets.get(key);
    if (b) b.push(r);
    else buckets.set(key, [r]);
  }
  const items: MapItem[] = [];
  for (const [key, members] of buckets) {
    if (streetLevel || members.length < minClusterSize) {
      for (const r of members) {
        items.push({ kind: 'place', id: r.camp.id, latitude: r.camp.lat!, longitude: r.camp.lng!, item: r });
      }
      continue;
    }
    let lat = 0, lng = 0, okCount = 0;
    for (const m of members) {
      lat += m.camp.lat!;
      lng += m.camp.lng!;
      if (m.status === 'ok') okCount++;
    }
    items.push({
      kind: 'cluster',
      id: `c:${key}:${members.length}:${okCount}`,
      latitude: lat / members.length,
      longitude: lng / members.length,
      count: members.length,
      okCount,
      members,
    });
  }
  return items;
}
