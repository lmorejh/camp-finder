import type { Status } from './lib/evaluate';

// Pastel camping palette: sage/mint as the brand color, peach and butter as accents.
export const colors = {
  bg: '#F7FAF6',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F5EF',
  ink: '#25302A',
  inkSoft: '#56635B',
  muted: '#93A098',
  hairline: '#E5ECE4',
  primary: '#9ED8B8',
  primaryInk: '#2F7D5B',
  primarySoft: '#E2F4EA',
  peach: '#FFDCC8',
  peachInk: '#B5643F',
  butter: '#FFF0BF',
  butterInk: '#8F7420',
  sky: '#D6EAFA',
  skyInk: '#3F78A8',
  lilac: '#ECE6F7',
  lilacInk: '#6D5CA8',
  star: '#F2B84B',
  scrim: 'rgba(37, 48, 42, 0.18)',
};

export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 };

export const type = {
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.4, color: colors.ink },
  heading: { fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.3, color: colors.ink },
  body: { fontSize: 15, fontWeight: '400' as const, letterSpacing: -0.2, color: colors.ink, lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '500' as const, letterSpacing: -0.1, color: colors.muted },
  micro: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0, color: colors.muted },
};

export const shadow = {
  soft: {
    shadowColor: '#2F5A44',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  lifted: {
    shadowColor: '#2F5A44',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
};

/** Pastel fill + readable ink per booking status (pins, badges). */
export const statusStyle: Record<Status, { tint: string; ink: string }> = {
  ok: { tint: '#BFEBD2', ink: '#24794F' },
  full: { tint: '#FFD3DC', ink: '#B2486A' },
  outside: { tint: '#DCE6F5', ink: '#5470A0' },
  manual: { tint: '#FFEDB3', ink: '#8F7420' },
  blocked: { tint: '#FFE2C8', ink: '#A9672C' },
  err: { tint: '#E9E9EC', ink: '#74747E' },
  cafe: { tint: '#EAE5F5', ink: '#6D5CA8' },
  phone: { tint: '#EAE5F5', ink: '#6D5CA8' },
  walkin: { tint: '#EAE5F5', ink: '#6D5CA8' },
  closed: { tint: '#E9E9EC', ink: '#74747E' },
};

/** Soft Google Maps style. iOS uses per-feature rules only (a catch-all style blanked the basemap on iOS 27 in 맛도리GO). */
export const mapStyleIos = [
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#F3F6F0' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#EDF4EA' }] },
  { featureType: 'administrative', elementType: 'labels.text.fill', stylers: [{ color: '#86928B' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#DCE5DA' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#DDF0E0' }] },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8C978F' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#FCFDFB' }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#FBEBDD' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#F3DDCB' }] },
  { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#E3E9E1' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#D2E8F5' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#94B4C8' }] },
];
