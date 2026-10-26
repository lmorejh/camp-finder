import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { won } from '../lib/dates';
import { STATUS_LABEL, type Evaluated } from '../lib/evaluate';
import { formatDistance } from '../lib/geo';
import { colors, radius, statusStyle, type } from '../theme';

export function StatusBadge({ r, large = false }: { r: Evaluated; large?: boolean }) {
  const s = statusStyle[r.status];
  const extra =
    r.status === 'ok'
      ? r.campLevel
        ? ` · 잔여 ${r.minCount}+`
        : r.availableSites.length
          ? ` · ${r.availableSites.length}개`
          : ''
      : '';
  return (
    <View style={[styles.badge, { backgroundColor: s.tint }, large && styles.badgeLarge]}>
      <Text style={[styles.badgeText, { color: s.ink }, large && styles.badgeTextLarge]}>
        {STATUS_LABEL[r.status]}
        {extra}
      </Text>
    </View>
  );
}

export function priceText(r: Evaluated, nights: number): string | null {
  if (r.minPrice != null) return `${won(r.minPrice)}부터 · ${nights}박`;
  if (r.est) return `≈ ${won(r.est.total)} · ${nights}박 추정`;
  return null;
}

interface Props {
  r: Evaluated;
  nights: number;
  distance: number | null;
  favorite: boolean;
  onPress: (r: Evaluated) => void;
}

export const CampRow = memo(function CampRow({ r, nights, distance, favorite, onPress }: Props) {
  const c = r.camp;
  const price = priceText(r, nights);
  const tags = [c.kind, c.siteForm, ...(c.features || []).slice(0, 2)].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={() => onPress(r)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={[styles.icon, { backgroundColor: statusStyle[r.status].tint }]}>
        <Text style={styles.emoji}>{favorite ? '⭐' : '⛺'}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {c.name}
          </Text>
          <StatusBadge r={r} />
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {[`${c.province} ${c.city}`.trim(), formatDistance(distance)].filter(Boolean).join(' · ')}
        </Text>
        {!!tags && (
          <Text style={styles.tags} numberOfLines={1}>
            {tags}
          </Text>
        )}
        {price && <Text style={styles.price}>{price}</Text>}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14, paddingHorizontal: 20, paddingVertical: 12, alignItems: 'flex-start' },
  pressed: { backgroundColor: colors.surfaceMuted },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 22 },
  body: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { ...type.heading, fontSize: 16, flexShrink: 1 },
  meta: { ...type.caption },
  tags: { fontSize: 12.5, color: colors.inkSoft },
  price: { fontSize: 14, fontWeight: '700', color: colors.primaryInk, marginTop: 1 },
  badge: { paddingHorizontal: 8, height: 22, borderRadius: radius.pill, justifyContent: 'center' },
  badgeLarge: { height: 28, paddingHorizontal: 12 },
  badgeText: { fontSize: 11.5, fontWeight: '800', letterSpacing: -0.1 },
  badgeTextLarge: { fontSize: 13.5 },
});
