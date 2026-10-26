import type { ExpoConfig } from 'expo/config';

// The Google Maps iOS key comes from the environment (EAS env var GOOGLE_MAPS_IOS_API_KEY, or
// .env.local when building locally) so it never lives in git.
const googleMapsKeyIos = process.env.GOOGLE_MAPS_IOS_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY;

const config: ExpoConfig = {
  name: '캠핑파인더',
  slug: 'camp-finder',
  owner: 'lmorejh',
  scheme: 'campfinder',
  version: '1.0.0',
  platforms: ['ios'],
  // OTA JS updates (eas update --channel preview). Bump `version` whenever native code changes
  // so old installs never receive an incompatible bundle.
  runtimeVersion: { policy: 'appVersion' },
  updates: { url: 'https://u.expo.dev/e30fb8e3-8b46-431f-9248-acbabeb033f8', checkAutomatically: 'ON_LOAD' },
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'com.lmorejh.campfinder',
    supportsTablet: false,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      CFBundleDevelopmentRegion: 'ko',
      // tel: links for campsite phone numbers, Google Maps app for directions
      LSApplicationQueriesSchemes: ['tel', 'comgooglemaps', 'nmap', 'kakaomap'],
    },
  },
  plugins: [
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 180, resizeMode: 'contain', backgroundColor: '#F3F8F1' }],
    'expo-web-browser',
    'expo-font',
    [
      'expo-location',
      { locationWhenInUsePermission: '내 주변 캠핑장을 지도에 보여드리기 위해 현재 위치를 사용해요.' },
    ],
    ['react-native-maps', { iosGoogleMapsApiKey: googleMapsKeyIos }],
  ],
  extra: {
    dataBaseUrl: process.env.DATA_BASE_URL ?? 'https://lmorejh.github.io/camp-finder/data/',
    eas: { projectId: 'e30fb8e3-8b46-431f-9248-acbabeb033f8' },
  },
};

export default config;