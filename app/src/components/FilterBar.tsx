import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { shortLabel } from '../lib/dates';
import { colors, radius, shadow } from '../theme';

export type FilterKey = 'available' | 'favorites' | 'pet' | 'glamping' | 'caravan' | 'valley' | 'beach' | 'live' | 'public';

export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'available', label: '예약가능만' },
  { key: 'favorites', label: '⭐ 즐겨찾기' },
  { key: 'live', label: '실시간 조회' },
  { key: 'public', label: '국공립' },
  { key: 'pet', label: '🐶 반려견' },
  { key: 'glamping', label: '글램핑' },
  { key: 'caravan', label: '카라반' },
  { key: 'valley', label: '계곡' },
  { key: 'beach', label: '바다' },
];

interface Props {
  checkIn: string;
  nights: number;
  active: Set<FilterKey>;
  onToggle: (k: FilterKey) => void;
  onPickDates: () => void;
}

export function FilterBar({ checkIn, nights, active, onToggle, onPickDates }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onPickDates} style={[styles.chip, styles.date]} accessibilityLabel="날짜 선택">
        <Ionicons name="calendar-outline" size={15} color="#FFFFFF" />
        <Text style={styles.dateText}>
          {shortLabel(checkIn)} · {nights}박
        </Text>
      </Pressable>
      {FILTERS.map((f) => {
        const on = active.has(f.key);
        return (
          <Pressable key={f.key} onPress={() => onToggle(f.key)} style={[styles.chip, on && styles.chipOn]}>
            <Text style={[styles.text, on && styles.textOn]}>{f.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 16, paddingVertical: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...shadow.soft,
  },
  chipOn: { backgroundColor: colors.primarySoft, borderWidth: 1.5, borderColor: colors.primary },
  text: { fontSize: 14, fontWeight: '600', color: colors.inkSoft },
  textOn: { color: colors.primaryInk },
  date: { backgroundColor: colors.primaryInk },
  dateText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
