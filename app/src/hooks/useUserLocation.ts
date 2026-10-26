import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatLng } from '../types';

export type LocationStatus = 'pending' | 'granted' | 'denied' | 'unavailable';

/**
 * Asks for foreground location permission and keeps following the device
 * while the app is open (moves of ~25m or more are reported).
 */
export function useUserLocation() {
  const [status, setStatus] = useState<LocationStatus>('pending');
  const [location, setLocation] = useState<LatLng | null>(null);
  const subscription = useRef<Location.LocationSubscription | null>(null);

  const start = useCallback(async () => {
    subscription.current?.remove();
    subscription.current = null;

    const { status: perm } = await Location.requestForegroundPermissionsAsync();
    if (perm !== 'granted') {
      setStatus('denied');
      return;
    }
    if (!(await Location.hasServicesEnabledAsync())) {
      setStatus('unavailable');
      return;
    }
    setStatus('granted');

    const last = await Location.getLastKnownPositionAsync();
    if (last) setLocation({ latitude: last.coords.latitude, longitude: last.coords.longitude });

    subscription.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 5000 },
      (pos) => setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => setStatus('unavailable'),
    );
  }, []);

  useEffect(() => {
    start().catch(() => setStatus('unavailable'));
    return () => subscription.current?.remove();
  }, [start]);

  return { status, location, retry: start };
}
