# 캠핑파인더 iOS 앱

`docs/` 웹과 같은 데이터를 쓰는 **아이폰 전용** Expo(React Native) 앱입니다.

- **Google 지도**(`react-native-maps`, `PROVIDER_GOOGLE`) 위에 전국 캠핑장 4,000여 곳을 예약 상태 색으로 표시합니다.
  - 🟩 예약가능 · 🟥 만실 · 🟦 조회범위 밖 · 🟨 직접확인 · 🟪 카페·전화·현장 예약
- 날짜(체크인·박수)를 고르면 예약 가능한 캠핑장·사이트·기간 요금을 계산합니다(웹 `docs/app.js`와 같은 규칙, `src/lib/evaluate.ts`).
- 필터: 예약가능만, 즐겨찾기, 실시간 조회, 국공립, 반려견, 글램핑, 카라반, 계곡, 바다 / 이름·지역·시설 검색
- 상세: 예약하기(앱 안 사파리), 전화, 길찾기(Google 지도), 사이트별 일자 현황, 장단점, 포토라이TV 영상
- 파스텔 톤 테마(`src/theme.ts`), 지도 스타일은 iOS에서 첫 타일 로드 후 적용(맛도리GO에서 확인한 iOS 27 빈 지도 문제 회피)

## 목록 갱신 — 재설치 필요 없음

앱은 실행할 때와 목록을 당겨서 새로고침할 때 GitHub Pages에서 데이터를 받습니다.

| 파일 | 내용 | 갱신 |
|---|---|---|
| `docs/data/version.json` | 목록 해시 | `npm run build:data` 때 |
| `docs/data/campsites.json` | 캠핑장 목록(해시가 바뀐 경우에만 다시 받음) | `npm run build:data` 때 |
| `docs/data/availability.json` | 시트 캠핑장 예약 현황 | GitHub Actions 30분마다 |
| `docs/data/availability-ext.json` | 캠핑지도에서 추가된 캠핑장 예약 현황 | GitHub Actions 3시간마다 |

받은 데이터는 폰에 저장해 두었다가 오프라인일 때 사용합니다. 목록을 바꾸려면 저장소 루트에서
`node scripts/fetch-campingjido.mjs`(캠핑지도 목록 다시 받기) → `npm run build:data` → 커밋·푸시하면 끝입니다.

화면·기능(JS) 수정은 expo-updates로 배포합니다: `eas update --channel preview --message "…"`.
네이티브 코드나 앱 설정을 바꿀 때는 `app.config.ts`의 `version`을 올리고 새로 빌드하세요.

## 빌드

```bash
cd app
npm install
npx tsc --noEmit && npx jest
# 클라우드 빌드(EAS, 계정 @lmorejh, 개인 Apple 팀) — 등록된 아이폰에만 설치되는 ad hoc 빌드
npx eas-cli build --profile preview --platform ios
```

- Google Maps iOS 키는 EAS 환경변수 `GOOGLE_MAPS_IOS_API_KEY`(preview·production)에 있습니다. 키는 번들 ID
  `com.lmorejh.campfinder`로 제한돼 있습니다.
- 새 아이폰은 `eas device:create`로 등록한 뒤 다시 빌드해야 설치됩니다.
