import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadow } from '../theme';

export type SheetSnap = 0 | 1 | 2; // peek, half, full

export interface BottomSheetHandle {
  snapTo: (snap: SheetSnap) => void;
}

interface Props {
  header: ReactNode;
  children: ReactNode;
  peekHeight: number;
  onSnap?: (snap: SheetSnap) => void;
}

/**
 * Three-stop sheet (peek / half / full). The header is the drag handle so the
 * content below can scroll freely without fighting the gesture.
 */
export const BottomSheet = forwardRef<BottomSheetHandle, Props>(function BottomSheet(
  { header, children, peekHeight, onSnap },
  ref,
) {
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sheetH = screenH - insets.top - 12;

  // translateY offsets for each stop (0 == fully open)
  const stops = useMemo(
    () => [sheetH - peekHeight - insets.bottom, sheetH - Math.round(screenH * 0.48), 0],
    [sheetH, peekHeight, insets.bottom, screenH],
  );
  const y = useRef(new Animated.Value(stops[0])).current;
  const current = useRef<SheetSnap>(0);
  const dragStart = useRef(0);
  const onSnapRef = useRef(onSnap);
  onSnapRef.current = onSnap;

  const snapTo = (snap: SheetSnap) => {
    current.current = snap;
    Animated.spring(y, {
      toValue: stops[snap],
      useNativeDriver: true,
      damping: 26,
      stiffness: 260,
      mass: 0.9,
    }).start();
    onSnapRef.current?.(snap);
  };
  useImperativeHandle(ref, () => ({ snapTo }));

  // Keep the current stop when the window size changes (rotation, split view).
  useEffect(() => {
    y.setValue(stops[current.current]);
  }, [stops, y]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          y.stopAnimation((v) => (dragStart.current = v));
        },
        onPanResponderMove: (_, g) => {
          const next = Math.min(stops[0] + 40, Math.max(-20, dragStart.current + g.dy));
          y.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          const projected = dragStart.current + g.dy + g.vy * 140;
          let best: SheetSnap = 0;
          stops.forEach((s, i) => {
            if (Math.abs(s - projected) < Math.abs(stops[best] - projected)) best = i as SheetSnap;
          });
          snapTo(best);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stops],
  );

  return (
    <Animated.View
      style={[styles.sheet, { height: sheetH, transform: [{ translateY: y }] }]}
      accessibilityRole="adjustable"
    >
      <View {...pan.panHandlers}>
        <View style={styles.grabber} />
        {header}
      </View>
      <View style={styles.body}>{children}</View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadow.lifted,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 5,
    borderRadius: 3,
    marginTop: 10,
    marginBottom: 6,
    backgroundColor: colors.hairline,
  },
  body: { flex: 1 },
});
