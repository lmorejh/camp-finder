import type { LatLng, MapRegion } from '../types';

export const KOREA_REGION: MapRegion = {
  latitude: 36.35,
  longitude: 127.85,
  latitudeDelta: 5.6,
  longitudeDelta: 4.2,
};

export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m: number | null | undefined): string {
  if (m == null) return '';
  if (m < 1000) return `${Math.round(m)}m`;
  if (m < 10000) return `${(m / 1000).toFixed(1)}km`;
  return `${Math.round(m / 1000)}km`;
}

export function isInRegion(p: LatLng, r: MapRegion, pad = 0.1): boolean {
  const lat = r.latitudeDelta * (0.5 + pad);
  const lng = r.longitudeDelta * (0.5 + pad);
  return Math.abs(p.latitude - r.latitude) <= lat && Math.abs(p.longitude - r.longitude) <= lng;
}

/** Region that fits all points with some padding (null when empty). */
export function regionForPoints(points: LatLng[], minDelta = 0.02): MapRegion | null {
  if (!points.length) return null;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLng = Math.min(minLng, p.longitude);
    maxLng = Math.max(maxLng, p.longitude);
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(minDelta, (maxLat - minLat) * 1.5),
    longitudeDelta: Math.max(minDelta, (maxLng - minLng) * 1.5),
  };
}
