import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet, type BottomSheetHandle } from '../components/BottomSheet';
import { CampDetailBody, CampDetailHeader } from '../components/CampDetail';
import { CampRow } from '../components/CampRow';
import { DateSheet } from '../components/DateSheet';
import { FilterBar, type FilterKey } from '../components/FilterBar';
import { ClusterMarker, CampMarker } from '../components/Markers';
import { SearchBar } from '../components/SearchBar';
import { useFavorites } from '../data/favorites';
import { useCampData } from '../data/remote';
import { useUserLocation } from '../hooks/useUserLocation';
import { clusterForRegion } from '../lib/cluster';
import { defaultStay, nightsBetween } from '../lib/dates';
import { compareEvaluated, evaluate, type Evaluated } from '../lib/evaluate';
import { matchesQuery, passesFilters, searchText } from '../lib/filter';
import { KOREA_REGION, distanceMeters, isInRegion, regionForPoints } from '../lib/geo';
import { colors, mapStyleIos, radius, shadow, type } from '../theme';
import type { LatLng, MapRegion } from '../types';

const PEEK = 200;
const LIST_LIMIT = 80;
const NEIGHBORHOOD_DELTA = 0.35; // ≈ 40km tall viewport: campsites are spread out

export function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const sheetRef = useRef<BottomSheetHandle>(null);

  const { data, loading, refreshing, error, refresh } = useCampData();
  const { favorites, toggleFavorite } = useFavorites();
  const { status: locStatus, location, retry: retryLocation } = useUserLocation();

  const [{ checkIn, checkOut }, setStay] = useState(defaultStay);
  const [dateOpen, setDateOpen] = useState(false);
  const [filters, setFilters] = useState<Set<FilterKey>>(new Set());
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [region, setRegion] = useState<MapRegion>(KOREA_REGION);
  const [iosStyleOn, setIosStyleOn] = useState(false);
  // Height of the search + filter bar; the fully open sheet stops just below it so its header
  // (drag handle, close button) is never hidden behind the bar.
  const [topBarH, setTopBarH] = useState(insets.top + 110);
  const centeredOnUser = useRef(false);

  const nights = useMemo(() => nightsBetween(checkIn, checkOut), [checkIn, checkOut]);
  const camps = data?.camps ?? [];
  const avail = data?.avail;
  const liveAdapters = useMemo(() => new Set(avail?.adapters ?? []), [avail]);
  const textIndex = useMemo(() => new Map(camps.map((c) => [c.id, searchText(c)])), [camps]);

  const evaluated = useMemo(
    () => (avail ? camps.map((c) => evaluate(c, avail, nights)) : []),
    [camps, avail, nights],
  );
  const filtered = useMemo(
    () => evaluated.filter((r) => passesFilters(r, filters, favorites, liveAdapters)),
    [evaluated, filters, favorites, liveAdapters],
  );
  const mappable = useMemo(() => filtered.filter((r) => r.camp.lat != null && r.camp.lng != null), [filtered]);
  const visible = useMemo(
    () => mappable.filter((r) => isInRegion({ latitude: r.camp.lat!, longitude: r.camp.lng! }, region, 0)),
    [mappable, region],
  );
  const mapItems = useMemo(() => {
    const padded = mappable.filter((r) => isInRegion({ latitude: r.camp.lat!, longitude: r.camp.lng! }, region));
    return clusterForRegion(padded, region);
  }, [mappable, region]);

  // First GPS fix: fly to the user's area.
  useEffect(() => {
    if (!location || centeredOnUser.current) return;
    centeredOnUser.current = true;
    mapRef.current?.animateToRegion({ ...location, latitudeDelta: NEIGHBORHOOD_DELTA, longitudeDelta: NEIGHBORHOOD_DELTA }, 700);
  }, [location]);

  const origin: LatLng = location ?? { latitude: region.latitude, longitude: region.longitude };
  const distanceTo = useCallback(
    (r: Evaluated) =>
      r.camp.lat != null && r.camp.lng != null ? distanceMeters(origin, { latitude: r.camp.lat, longitude: r.camp.lng }) : null,
    [origin.latitude, origin.longitude], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const list = useMemo(() => {
    return [...visible]
      .sort((a, b) => compareEvaluated(a, b) || (distanceTo(a) ?? 1e9) - (distanceTo(b) ?? 1e9))
      .slice(0, LIST_LIMIT);
  }, [visible, distanceTo]);
  const okInView = useMemo(() => visible.filter((r) => r.status === 'ok').length, [visible]);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return filtered
      .filter((r) => matchesQuery(textIndex.get(r.camp.id) ?? '', q))
      .sort((a, b) => compareEvaluated(a, b) || (distanceTo(a) ?? 1e9) - (distanceTo(b) ?? 1e9))
      .slice(0, 200);
  }, [filtered, query, textIndex, distanceTo]);

  const selected = useMemo(() => (selectedId ? evaluated.find((r) => r.camp.id === selectedId) ?? null : null), [evaluated, selectedId]);

  const focusOn = useCallback((r: Evaluated) => {
    setSelectedId(r.camp.id);
    sheetRef.current?.snapTo(1);
    if (r.camp.lat == null || r.camp.lng == null) return;
    const delta = 0.05;
    mapRef.current?.animateToRegion(
      { latitude: r.camp.lat - delta * 0.28, longitude: r.camp.lng, latitudeDelta: delta, longitudeDelta: delta },
      450,
    );
  }, []);

  const closeSearch = () => {
    Keyboard.dismiss();
    setSearching(false);
  };
  const closeDetail = () => {
    setSelectedId(null);
    sheetRef.current?.snapTo(0);
  };
  const toggleFilter = (k: FilterKey) =>
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const recenter = () => {
    if (!location) {
      retryLocation();
      return;
    }
    mapRef.current?.animateToRegion({ ...location, latitudeDelta: NEIGHBORHOOD_DELTA, longitudeDelta: NEIGHBORHOOD_DELTA }, 500);
  };

  const updatedAt = data?.availGeneratedAt ? new Date(data.availGeneratedAt) : null;
  const updatedLabel = updatedAt
    ? `예약 현황 ${updatedAt.getMonth() + 1}/${updatedAt.getDate()} ${String(updatedAt.getHours()).padStart(2, '0')}:${String(updatedAt.getMinutes()).padStart(2, '0')} 기준`
    : '';
  const liveUntil = avail?.window?.to ?? null;

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        // Apply the pastel style only after the first tiles load (styling at startup left the
        // Google basemap blank on iOS 27 in 맛도리GO).
        customMapStyle={iosStyleOn ? mapStyleIos : undefined}
        onMapLoaded={() => {
          if (!iosStyleOn) setTimeout(() => setIosStyleOn(true), 400);
        }}
        initialRegion={KOREA_REGION}
        onRegionChangeComplete={setRegion}
        onPress={() => selected && closeDetail()}
        showsUserLocation={locStatus === 'granted'}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        showsPointsOfInterests={false}
        mapPadding={{ top: insets.top + 110, right: 0, bottom: PEEK, left: 0 }}
      >
        {mapItems.map((item) =>
          item.kind === 'place' ? (
            <CampMarker
              key={item.id + item.item.status}
              item={item.item}
              selected={selectedId === item.id}
              favorite={favorites.has(item.id)}
              onPress={focusOn}
            />
          ) : (
            <ClusterMarker
              key={item.id}
              latitude={item.latitude}
              longitude={item.longitude}
              count={item.count}
              okCount={item.okCount}
              onPress={() => {
                const target = regionForPoints(item.members.map((m) => ({ latitude: m.camp.lat!, longitude: m.camp.lng! })));
                if (target) mapRef.current?.animateToRegion(target, 450);
              }}
            />
          ),
        )}
      </MapView>

      <View
        style={[styles.top, { paddingTop: insets.top + 8 }]}
        pointerEvents="box-none"
        onLayout={(e) => setTopBarH(Math.round(e.nativeEvent.layout.height))}
      >
        <View style={styles.searchWrap}>
          <SearchBar value={query} onChangeText={setQuery} focused={searching} onFocus={() => setSearching(true)} onCancel={closeSearch} />
        </View>
        <FilterBar checkIn={checkIn} nights={nights.length} active={filters} onToggle={toggleFilter} onPickDates={() => setDateOpen(true)} />
        {!!error && (
          <Pressable onPress={() => refresh(true)} style={styles.banner}>
            <Text style={styles.bannerText}>{error} 눌러서 다시 시도</Text>
          </Pressable>
        )}
      </View>

      {!searching && (
        <Pressable onPress={recenter} style={[styles.fab, { bottom: PEEK + insets.bottom + 18 }]} accessibilityLabel="내 위치로 이동">
          <Ionicons name={location ? 'navigate' : 'navigate-outline'} size={20} color={location ? colors.primaryInk : colors.muted} />
        </Pressable>
      )}

      <BottomSheet
        ref={sheetRef}
        peekHeight={PEEK}
        topOffset={topBarH + 8}
        header={
          selected ? (
            <CampDetailHeader
              r={selected}
              distance={distanceTo(selected)}
              favorite={favorites.has(selected.camp.id)}
              onToggleFavorite={() => toggleFavorite(selected.camp.id)}
              onClose={closeDetail}
            />
          ) : (
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                이 지역 <Text style={styles.accent}>예약가능 {okInView}곳</Text>
              </Text>
              <Text style={styles.sheetSub}>
                {loading
                  ? '캠핑장 정보를 받는 중…'
                  : `지도 안 ${visible.length.toLocaleString('ko-KR')}곳 · 전체 ${camps.length.toLocaleString('ko-KR')}곳${updatedLabel ? ' · ' + updatedLabel : ''}`}
              </Text>
            </View>
          )
        }
      >
        {selected ? (
          <ScrollView key={selected.camp.id} showsVerticalScrollIndicator={false}>
            <CampDetailBody r={selected} nights={nights} />
          </ScrollView>
        ) : loading && !data ? (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.primaryInk} />
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={(r) => r.camp.id}
            renderItem={({ item }) => (
              <CampRow r={item} nights={nights.length} distance={distanceTo(item)} favorite={favorites.has(item.camp.id)} onPress={focusOn} />
            )}
            ItemSeparatorComponent={Separator}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refresh(true)} tintColor={colors.primaryInk} />}
            ListEmptyComponent={<Empty text={filters.size ? '조건에 맞는 캠핑장이 이 지역에 없어요' : '지도를 움직여 캠핑장을 찾아보세요'} />}
            ListFooterComponent={
              visible.length > list.length ? (
                <Text style={styles.footer}>가까운 {list.length}곳만 보여드려요. 지도를 확대하면 더 정확해요.</Text>
              ) : undefined
            }
            initialNumToRender={10}
          />
        )}
      </BottomSheet>

      {searching && (
        <View style={[styles.overlay, { paddingTop: insets.top + 8 + 50 + 52 }]}>
          <FlatList
            data={results}
            keyExtractor={(r) => r.camp.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            renderItem={({ item }) => (
              <CampRow
                r={item}
                nights={nights.length}
                distance={distanceTo(item)}
                favorite={favorites.has(item.camp.id)}
                onPress={(r) => {
                  closeSearch();
                  focusOn(r);
                }}
              />
            )}
            ItemSeparatorComponent={Separator}
            ListHeaderComponent={
              query.trim() ? <Text style={styles.resultCount}>검색 결과 {results.length}곳</Text> : <SearchHints onPick={setQuery} />
            }
            ListEmptyComponent={query.trim() ? <Empty text={`'${query}'에 맞는 캠핑장이 없어요`} /> : undefined}
            contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          />
        </View>
      )}

      <DateSheet
        visible={dateOpen}
        checkIn={checkIn}
        checkOut={checkOut}
        liveUntil={liveUntil}
        onClose={() => setDateOpen(false)}
        onApply={(a, b) => {
          setStay({ checkIn: a, checkOut: b });
          setDateOpen(false);
        }}
      />
    </View>
  );
}

const HINTS = ['가평', '계곡', '바다', '글램핑', '카라반', '자연휴양림', '국립공원', '반려견', '제주'];

function SearchHints({ onPick }: { onPick: (q: string) => void }) {
  return (
    <View style={styles.hints}>
      <Text style={styles.hintsTitle}>이렇게 찾아보세요</Text>
      <View style={styles.hintWrap}>
        {HINTS.map((h) => (
          <Pressable key={h} onPress={() => onPick(h)} style={styles.hint}>
            <Text style={styles.hintText}>{h}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={type.caption}>캠핑장 이름, 지역, 주변 환경, 시설로 검색할 수 있어요.</Text>
    </View>
  );
}

const Separator = () => <View style={styles.separator} />;

const Empty = ({ text }: { text: string }) => (
  <View style={styles.empty}>
    <Text style={styles.emptyEmoji}>⛺</Text>
    <Text style={type.caption}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, gap: 6 },
  searchWrap: { paddingHorizontal: 16 },
  banner: { marginHorizontal: 16, padding: 10, borderRadius: radius.sm, backgroundColor: colors.butter },
  bannerText: { fontSize: 12.5, color: colors.butterInk, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    ...shadow.soft,
  },
  sheetHeader: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12, gap: 4 },
  sheetTitle: { ...type.heading, fontSize: 19 },
  accent: { color: colors.primaryInk },
  sheetSub: { ...type.caption },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: colors.bg, zIndex: 10 },
  resultCount: { ...type.micro, paddingHorizontal: 20, paddingVertical: 10 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 82, backgroundColor: colors.hairline },
  footer: { ...type.caption, textAlign: 'center', paddingVertical: 16 },
  hints: { paddingHorizontal: 20, paddingTop: 16, gap: 12 },
  hintsTitle: { ...type.heading, fontSize: 15 },
  hintWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { paddingHorizontal: 14, height: 34, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  hintText: { fontSize: 14, fontWeight: '600', color: colors.primaryInk },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyEmoji: { fontSize: 32 },
});
