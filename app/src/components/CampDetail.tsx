import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { shortLabel, won } from '../lib/dates';
import type { Evaluated, EvaluatedSite } from '../lib/evaluate';
import { formatDistance } from '../lib/geo';
import { colors, radius, statusStyle, type } from '../theme';
import { StatusBadge, priceText } from './CampRow';

const open = (url: string) =>
  WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET }).catch(() =>
    Linking.openURL(url),
  );

async function openDirections(lat: number, lng: number) {
  const app = `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
  if (await Linking.canOpenURL(app).catch(() => false)) return Linking.openURL(app);
  return Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`);
}

interface HeaderProps {
  r: Evaluated;
  distance: number | null;
  favorite: boolean;
  onToggleFavorite: () => void;
  onClose: () => void;
}

export function CampDetailHeader({ r, distance, favorite, onToggleFavorite, onClose }: HeaderProps) {
  const c = r.camp;
  return (
    <View style={styles.header}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.title} numberOfLines={2}>
          {c.name}
        </Text>
        <View style={styles.headerMeta}>
          <StatusBadge r={r} large />
          <Text style={type.caption} numberOfLines={1}>
            {[`${c.province} ${c.city}`.trim(), formatDistance(distance)].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
      <Pressable onPress={onToggleFavorite} hitSlop={10} style={styles.iconBtn} accessibilityLabel="즐겨찾기">
        <Ionicons name={favorite ? 'star' : 'star-outline'} size={20} color={favorite ? colors.star : colors.inkSoft} />
      </Pressable>
      <Pressable onPress={onClose} hitSlop={10} style={styles.iconBtn} accessibilityLabel="닫기">
        <Ionicons name="close" size={20} color={colors.inkSoft} />
      </Pressable>
    </View>
  );
}

interface BodyProps {
  r: Evaluated;
  nights: string[];
}

export function CampDetailBody({ r, nights }: BodyProps) {
  const c = r.camp;
  const price = priceText(r, nights.length);
  const [showAll, setShowAll] = useState(false);
  const sites = [...r.sites].sort(
    (a, b) =>
      Number(b.availableAll) - Number(a.availableAll) || (a.price ?? 1e12) - (b.price ?? 1e12) || a.name.localeCompare(b.name, 'ko'),
  );
  const shown = showAll ? sites : sites.slice(0, 12);
  const info: [string, string][] = [
    ['예약처', c.platformName],
    ['주소', c.address || ''],
    ['구분', c.kind],
    ['바닥', c.siteForm],
    ['주변', (c.envTags || []).join(' · ')],
    ['시설', (c.features || []).join(' · ')],
    ['반려견', c.pet],
    ['동계', c.winter],
    ['시트 요금', c.priceWeekend || c.priceWeekday ? `주말 ${won(c.priceWeekend)} · 주중 ${won(c.priceWeekday)}` : ''],
  ];
  return (
    <View style={styles.body}>
      <View style={styles.priceBox}>
        <Text style={styles.stay}>
          {nights.length ? `${shortLabel(nights[0])} 체크인 · ${nights.length}박` : '날짜를 골라 주세요'}
        </Text>
        <Text style={styles.price}>{price ?? '요금 정보 없음'}</Text>
        {r.minPrice == null && r.est && <Text style={type.caption}>시트의 주말·주중 요금으로 계산한 추정치예요</Text>}
        {r.error && <Text style={type.caption}>{r.error}</Text>}
        {r.fetchedAt && <Text style={type.micro}>예약 현황 조회 {new Date(r.fetchedAt).toLocaleString('ko-KR')}</Text>}
      </View>

      <View style={styles.actions}>
        {!!c.bookingUrl && <Action icon="calendar" label="예약하기" primary onPress={() => open(c.bookingUrl)} />}
        {!!c.tel && <Action icon="call" label="전화" onPress={() => Linking.openURL(`tel:${c.tel}`)} />}
        {c.lat != null && <Action icon="navigate" label="길찾기" onPress={() => openDirections(c.lat!, c.lng!)} />}
      </View>

      {(c.pros.length > 0 || c.cons.length > 0) && (
        <View style={styles.card}>
          {c.pros.map((p) => (
            <Text key={'p' + p} style={styles.pro}>
              👍 {p}
            </Text>
          ))}
          {c.cons.map((p) => (
            <Text key={'c' + p} style={styles.con}>
              👎 {p}
            </Text>
          ))}
        </View>
      )}

      {sites.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            사이트 {sites.length}개
            {r.campLevel
              ? ` · 일자별 잔여 ${nights.map((n) => `${n.slice(5).replace('-', '/')} ${r.campLevel!.availableCountByDate[n] ?? '?'}개`).join(', ')}`
              : ` · 예약가능 ${r.availableSites.length}개`}
          </Text>
          {r.note && <Text style={type.caption}>{r.note}</Text>}
          {shown.map((s) => (
            <SiteRow key={s.id} s={s} nights={nights} fallback={r.est?.total ?? null} />
          ))}
          {sites.length > shown.length && (
            <Pressable onPress={() => setShowAll(true)} style={styles.more}>
              <Text style={styles.moreText}>사이트 {sites.length - shown.length}개 더 보기</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>정보</Text>
        {info
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <View key={k} style={styles.infoRow}>
              <Text style={styles.infoKey}>{k}</Text>
              <Text style={styles.infoVal}>{v}</Text>
            </View>
          ))}
        {!!c.intro && <Text style={styles.intro}>{c.intro}</Text>}
        {!!c.bookingNote && <Text style={styles.intro}>ℹ️ {c.bookingNote}</Text>}
      </View>

      {c.videos.some((v) => v.url) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>포토라이TV 영상</Text>
          {c.videos
            .filter((v) => v.url)
            .slice(0, 3)
            .map((v) => (
              <Pressable key={v.url} onPress={() => open(v.url)} style={styles.linkRow}>
                <Ionicons name="logo-youtube" size={18} color="#E06C6C" />
                <Text style={styles.linkText}>
                  영상 보기{v.date ? ` (${v.date.slice(0, 7)})` : ''}
                  {v.food ? ` · 🍳 ${v.food}` : ''}
                </Text>
              </Pressable>
            ))}
        </View>
      )}
      <View style={{ height: 40 }} />
    </View>
  );
}

function SiteRow({ s, nights, fallback }: { s: EvaluatedSite; nights: string[]; fallback: number | null }) {
  const dots = s.countByDate
    ? nights.map((n) => {
        const c = s.countByDate![n];
        return c == null ? '❔' : c > 0 ? `🟢${c}` : '⚫';
      })
    : s.perNight.map((ok) => (ok == null ? '❔' : ok ? '🟢' : '⚫'));
  const price = s.price != null ? won(s.price) : fallback != null ? `≈${won(fallback)}` : '-';
  const meta = [s.zone, s.size, s.capacity].filter(Boolean).join(' · ');
  return (
    <View style={[styles.site, s.availableAll && { backgroundColor: statusStyle.ok.tint + '55' }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.siteName} numberOfLines={1}>
          {s.name}
        </Text>
        {!!meta && (
          <Text style={type.caption} numberOfLines={1}>
            {meta}
          </Text>
        )}
        <Text style={styles.dots}>{dots.join(' ')}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={styles.sitePrice}>{price}</Text>
        {!!s.bookUrl && (
          <Pressable onPress={() => open(s.bookUrl!)} hitSlop={8}>
            <Text style={styles.linkText}>예약 ↗</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Action({ icon, label, onPress, primary }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, primary && styles.actionPrimary, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={17} color={primary ? '#FFFFFF' : colors.primaryInk} />
      <Text style={[styles.actionText, primary && { color: '#FFFFFF' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...type.title, fontSize: 21 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  body: { paddingHorizontal: 20, gap: 16 },
  priceBox: { gap: 4, padding: 14, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  stay: { fontSize: 13, fontWeight: '600', color: colors.primaryInk },
  price: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 },
  actions: { flexDirection: 'row', gap: 8 },
  action: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  actionPrimary: { backgroundColor: colors.primaryInk },
  actionText: { fontSize: 15, fontWeight: '700', color: colors.primaryInk },
  card: { gap: 6, padding: 14, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  pro: { ...type.body, fontSize: 14 },
  con: { ...type.body, fontSize: 14, color: colors.inkSoft },
  section: { gap: 8 },
  sectionTitle: { ...type.heading, fontSize: 15 },
  site: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  siteName: { fontSize: 14.5, fontWeight: '700', color: colors.ink },
  sitePrice: { fontSize: 14, fontWeight: '700', color: colors.ink },
  dots: { fontSize: 12, letterSpacing: 1 },
  more: { alignItems: 'center', paddingVertical: 10 },
  moreText: { fontSize: 14, fontWeight: '700', color: colors.primaryInk },
  infoRow: { flexDirection: 'row', gap: 12 },
  infoKey: { width: 64, fontSize: 13.5, color: colors.muted, fontWeight: '600' },
  infoVal: { flex: 1, fontSize: 14, color: colors.ink },
  intro: { fontSize: 13.5, color: colors.inkSoft, lineHeight: 20 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  linkText: { fontSize: 14, fontWeight: '600', color: colors.primaryInk },
});
