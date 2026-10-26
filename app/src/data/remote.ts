import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Availability, Camp } from '../types';

// The campsite list and booking status live on the GitHub Pages site (docs/data). GitHub Actions
// refreshes booking status every 30 minutes (sheet campsites) / 3 hours (캠핑지도 campsites), and the
// list itself changes whenever scripts/build-campsites.mjs is re-run. The app downloads them at
// launch and on pull-to-refresh, so new lists never need a reinstall. The last download is kept on
// disk for offline use.
const BASE: string = (Constants.expoConfig?.extra?.dataBaseUrl as string) || 'https://lmorejh.github.io/camp-finder/data/';

interface Version {
  campsites: string;
  count: number;
}
interface CampsFile {
  generatedAt: string;
  count: number;
  campsites: Camp[];
}

export interface CampData {
  camps: Camp[];
  avail: Availability;
  version: string | null;
  availGeneratedAt: string | null;
  extGeneratedAt: string | null;
}

const EMPTY_AVAIL: Availability = { generatedAt: null, adapters: [], camps: {} };

const dir = () => new Directory(Paths.document, 'camp-data');
const file = (name: string) => new File(dir(), name);

async function readJSON<T>(name: string): Promise<T | null> {
  try {
    const f = file(name);
    if (!f.exists) return null;
    return JSON.parse(await f.text()) as T;
  } catch {
    return null;
  }
}
async function writeText(name: string, text: string) {
  try {
    const d = dir();
    if (!d.exists) d.create({ intermediates: true });
    const f = file(name);
    if (!f.exists) f.create({ intermediates: true });
    await f.write(text);
  } catch {
    // Cache is best-effort.
  }
}

async function getText(name: string): Promise<string> {
  // GitHub Pages sends max-age=600; a cache-busting query gets the latest copy.
  const res = await fetch(`${BASE}${name}?t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`${name} ${res.status}`);
  return res.text();
}

function mergeAvailability(core: Availability | null, ext: Availability | null): Availability {
  const out: Availability = { ...(core || EMPTY_AVAIL), camps: { ...(core?.camps || {}) } };
  if (ext) {
    for (const [id, r] of Object.entries(ext.camps || {})) out.camps[id] = { ...r, coverage: r.coverage || ext.window };
    out.adapters = [...new Set([...(out.adapters || []), ...(ext.adapters || [])])];
  }
  return out;
}

export async function loadCached(): Promise<CampData | null> {
  const [camps, version, core, ext] = await Promise.all([
    readJSON<CampsFile>('campsites.json'),
    readJSON<Version>('version.json'),
    readJSON<Availability>('availability.json'),
    readJSON<Availability>('availability-ext.json'),
  ]);
  if (!camps?.campsites?.length) return null;
  return {
    camps: camps.campsites,
    avail: mergeAvailability(core, ext),
    version: version?.campsites ?? null,
    availGeneratedAt: core?.generatedAt ?? null,
    extGeneratedAt: ext?.generatedAt ?? null,
  };
}

/** Downloads what changed. The list (≈4 MB) is fetched only when version.json says it changed. */
export async function fetchFresh(current: CampData | null): Promise<CampData> {
  const versionText = await getText('version.json');
  const version = JSON.parse(versionText) as Version;
  let camps = current?.camps ?? null;
  if (!camps || current?.version !== version.campsites) {
    const text = await getText('campsites.json');
    const parsed = JSON.parse(text) as CampsFile;
    if (!parsed.campsites?.length) throw new Error('캠핑장 목록이 비어 있어요');
    camps = parsed.campsites;
    await writeText('campsites.json', text);
  }
  await writeText('version.json', versionText);
  const [coreText, extText] = await Promise.all([
    getText('availability.json').catch(() => null),
    getText('availability-ext.json').catch(() => null),
  ]);
  const core = coreText ? (JSON.parse(coreText) as Availability) : null;
  const ext = extText ? (JSON.parse(extText) as Availability) : null;
  if (coreText) await writeText('availability.json', coreText);
  if (extText) await writeText('availability-ext.json', extText);
  return {
    camps,
    avail: mergeAvailability(core ?? null, ext ?? null),
    version: version.campsites,
    availGeneratedAt: core?.generatedAt ?? current?.availGeneratedAt ?? null,
    extGeneratedAt: ext?.generatedAt ?? current?.extGeneratedAt ?? null,
  };
}

export function useCampData() {
  const [data, setData] = useState<CampData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<CampData | null>(null);

  const refresh = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const fresh = await fetchFresh(current.current);
      current.current = fresh;
      setData(fresh);
      setError(null);
    } catch (e) {
      setError(current.current ? '최신 정보를 받지 못했어요. 저장된 정보를 보여드려요.' : '캠핑장 정보를 받지 못했어요. 네트워크를 확인해 주세요.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const cached = await loadCached();
      if (cached) {
        current.current = cached;
        setData(cached);
        setLoading(false);
      }
      await refresh();
    })();
  }, [refresh]);

  return { data, loading, refreshing, error, refresh };
}
