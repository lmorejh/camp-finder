import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const KEY = 'favorites:v1';

/** Starred campsite ids, kept on the phone. */
export function useFavorites() {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => v && setIds(new Set(JSON.parse(v) as string[])))
      .catch(() => {});
  }, []);
  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      AsyncStorage.setItem(KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);
  return { favorites: ids, toggleFavorite: toggle };
}
