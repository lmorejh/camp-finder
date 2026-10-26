import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { addDays, fromISO, isHoliday, nightsBetween, shortLabel, toISO } from '../lib/dates';
import { colors, radius, type } from '../theme';

interface Props {
  visible: boolean;
  checkIn: string;
  checkOut: string;
  /** Last date covered by live booking status (for the hint). */
  liveUntil?: string | null;
  onClose: () => void;
  onApply: (checkIn: string, checkOut: string) => void;
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = 7;

/** Weeks of the month (Sunday first), each exactly 7 cells; null = blank. */
export function monthWeeks(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(first.getDay()).fill(null);
  for (let d = 1; d <= days; d++) cells.push(toISO(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function DateSheet({ visible, checkIn, checkOut, liveUntil, onClose, onApply }: Props) {
  const [start, setStart] = useState<string | null>(checkIn);
  const [end, setEnd] = useState<string | null>(checkOut);
  useEffect(() => {
    if (visible) {
      setStart(checkIn);
      setEnd(checkOut);
    }
  }, [visible, checkIn, checkOut]);

  const today = toISO(new Date());
  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: MONTHS }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      return { key: `${d.getFullYear()}-${d.getMonth()}`, year: d.getFullYear(), month: d.getMonth(), weeks: monthWeeks(d.getFullYear(), d.getMonth()) };
    });
  }, []);

  const pick = (iso: string) => {
    if (!start || end || iso <= start) {
      setStart(iso);
      setEnd(null);
    } else {
      setEnd(iso);
    }
  };

  const nights = start && end ? nightsBetween(start, end).length : 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.cancel}>취소</Text>
          </Pressable>
          <Text style={type.heading}>날짜 선택</Text>
          <Pressable
            onPress={() => start && onApply(start, end ?? addDays(start, 1))}
            hitSlop={10}
            disabled={!start}
          >
            <Text style={[styles.apply, !start && { color: colors.muted }]}>적용</Text>
          </Pressable>
        </View>
        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            {start ? shortLabel(start) : '체크인'} → {end ? shortLabel(end) : start ? '체크아웃 선택' : '체크아웃'}
            {nights ? `  ·  ${nights}박` : ''}
          </Text>
          {liveUntil && <Text style={type.caption}>실시간 예약 현황은 {shortLabel(liveUntil)}까지 조회돼요</Text>}
        </View>
        <View style={styles.weekRow}>
          {WEEK.map((w, i) => (
            <Text key={w} style={[styles.week, i === 0 && styles.sun, i === 6 && styles.sat]}>
              {w}
            </Text>
          ))}
        </View>
        <FlatList
          data={months}
          keyExtractor={(m) => m.key}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item: m }) => (
            <View style={styles.month}>
              <Text style={styles.monthTitle}>
                {m.year}년 {m.month + 1}월
              </Text>
              {m.weeks.map((week, w) => (
              <View key={w} style={styles.week7}>
                {week.map((iso, i) => {
                  if (!iso) return <View key={i} style={styles.cell} />;
                  const past = iso < today;
                  const isStart = iso === start;
                  const isEnd = iso === end;
                  const inRange = !!start && !!end && iso > start && iso < end;
                  const dow = fromISO(iso).getDay();
                  return (
                    <Pressable key={iso} disabled={past} onPress={() => pick(iso)} style={styles.cell}>
                      <View style={[styles.dayBox, inRange && styles.range, (isStart || isEnd) && styles.picked]}>
                        <Text
                          style={[
                            styles.day,
                            dow === 6 && styles.sat,
                            isHoliday(iso) && styles.sun,
                            past && styles.past,
                            (isStart || isEnd) && styles.pickedText,
                          ]}
                        >
                          {fromISO(iso).getDate()}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              ))}
            </View>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 },
  cancel: { fontSize: 16, color: colors.inkSoft },
  apply: { fontSize: 16, fontWeight: '700', color: colors.primaryInk },
  summary: { marginHorizontal: 20, padding: 14, borderRadius: radius.md, backgroundColor: colors.primarySoft, gap: 4 },
  summaryText: { fontSize: 17, fontWeight: '700', color: colors.primaryInk },
  weekRow: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 14, paddingBottom: 6 },
  week: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: colors.muted },
  month: { paddingHorizontal: 12, paddingTop: 12 },
  monthTitle: { ...type.heading, fontSize: 16, paddingHorizontal: 8, paddingBottom: 6 },
  // Explicit 7-cell rows with flex: 1 (percentage widths + flexWrap can round past 100% and
  // push Saturday onto the next line, which shifts every date under the wrong weekday).
  week7: { flexDirection: 'row' },
  cell: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
  dayBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  range: { backgroundColor: colors.primarySoft, borderRadius: 12 },
  picked: { backgroundColor: colors.primaryInk },
  day: { fontSize: 16, color: colors.ink, textAlign: 'center' },
  pickedText: { color: '#FFFFFF', fontWeight: '800' },
  past: { color: '#C8CFCA' },
  sun: { color: '#D46A7E' },
  sat: { color: '#5B86C2' },
});
