import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import type { Evaluated } from '../lib/evaluate';
import { colors, shadow, statusStyle } from '../theme';

interface PlaceProps {
  item: Evaluated;
  selected: boolean;
  favorite: boolean;
  onPress: (r: Evaluated) => void;
}

export const CampMarker = memo(function CampMarker({ item, selected, favorite, onPress }: PlaceProps) {
  const s = statusStyle[item.status];
  return (
    <Marker
      coordinate={{ latitude: item.camp.lat!, longitude: item.camp.lng! }}
      onPress={(e) => {
        e.stopPropagation();
        onPress(item);
      }}
      anchor={{ x: 0.5, y: 1 }}
      // Re-render the bitmap only while selected; static otherwise for performance.
      tracksViewChanges={selected}
      zIndex={selected ? 10 : item.status === 'ok' ? 3 : 1}
      accessibilityLabel={item.camp.name}
    >
      <View style={styles.pinWrap}>
        <View
          style={[
            styles.pin,
            { backgroundColor: s.tint, borderColor: selected ? s.ink : colors.surface },
            selected && styles.pinSelected,
          ]}
        >
          <Text style={selected ? styles.emojiLarge : styles.emoji}>{favorite ? '⭐' : '⛺'}</Text>
        </View>
        <View style={[styles.tail, { borderTopColor: selected ? s.ink : colors.surface }]} />
      </View>
    </Marker>
  );
});

interface ClusterProps {
  latitude: number;
  longitude: number;
  count: number;
  okCount: number;
  onPress: () => void;
}

export const ClusterMarker = memo(function ClusterMarker({ latitude, longitude, count, okCount, onPress }: ClusterProps) {
  const size = count < 10 ? 40 : count < 50 ? 48 : count < 200 ? 56 : 62;
  const hasOk = okCount > 0;
  return (
    <Marker coordinate={{ latitude, longitude }} onPress={onPress} tracksViewChanges={false} anchor={{ x: 0.5, y: 0.5 }}>
      <View
        style={[
          styles.cluster,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: hasOk ? colors.primarySoft : colors.surfaceMuted },
        ]}
      >
        <Text style={[styles.clusterText, !hasOk && { color: colors.inkSoft }]}>{count}</Text>
        {hasOk && <Text style={styles.clusterOk}>가능 {okCount}</Text>}
      </View>
    </Marker>
  );
});

const styles = StyleSheet.create({
  pinWrap: { alignItems: 'center' },
  pin: { width: 34, height: 34, borderRadius: 17, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  pinSelected: { width: 44, height: 44, borderRadius: 22, borderWidth: 3 },
  emoji: { fontSize: 15 },
  emojiLarge: { fontSize: 20 },
  tail: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  cluster: { alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.surface, ...shadow.soft },
  clusterText: { color: colors.primaryInk, fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  clusterOk: { color: colors.primaryInk, fontSize: 9, fontWeight: '700', marginTop: -1 },
});
