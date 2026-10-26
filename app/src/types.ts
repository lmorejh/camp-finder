/** One campsite from docs/data/campsites.json (built by scripts/build-campsites.mjs). */
export interface Camp {
  id: string;
  /** core = original sheet (refreshed every 30 min), ext = added from 캠핑지도 (every 3 h) */
  tier?: 'core' | 'ext';
  name: string;
  province: string;
  city: string;
  kind: string;
  siteForm: string;
  environment: string;
  intro?: string;
  season: string;
  priceWeekend: number | null;
  priceWeekday: number | null;
  bookingRaw: string;
  bookingNote: string;
  platform: string;
  platformName: string;
  bookingUrl: string;
  pet: string;
  privateFacility: string;
  winter: string;
  videos: { date: string | null; food: string; url: string }[];
  pros: string[];
  cons: string[];
  lat?: number;
  lng?: number;
  address?: string;
  tel?: string;
  features?: string[];
  envTags?: string[];
}

export interface Site {
  id: string;
  name: string;
  zone?: string;
  size?: string;
  capacity?: string;
  priceByDate?: Record<string, number>;
  availableDates?: string[];
  countByDate?: Record<string, number>;
  bookUrl?: string;
}

export interface CampAvailability {
  campId: string;
  platform: string;
  status: 'ok' | 'error' | 'unmapped' | 'unsupported';
  fetchedAt: string;
  sites: Site[];
  campLevel?: { availableCountByDate: Record<string, number> };
  note?: string;
  error?: string;
  coverage?: { from: string; to: string };
}

export interface Availability {
  generatedAt: string | null;
  window?: { from: string; to: string };
  adapters: string[];
  camps: Record<string, CampAvailability>;
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface MapRegion extends LatLng {
  latitudeDelta: number;
  longitudeDelta: number;
}
