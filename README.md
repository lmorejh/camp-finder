# ⛺ camp-finder — 전국 캠핑장 예약 통합 조회

**웹: https://lmorejh.github.io/camp-finder/** · 저장소: https://github.com/lmorejh/camp-finder

전국 국공립·지자체·사설 캠핑장 394곳(포토라이TV 캠핑장 목록 기준)의 **예약 가능 여부를 기간별로 한 화면에서** 확인하는 도구입니다.

- 기간(체크인/체크아웃)을 고르면 **예약 가능한 캠핑장**을 우선 정렬해 보여줍니다.
- 캠핑장을 펼치면 **예약 가능한 사이트**, 사이트 **크기·정원**, **선택 기간 요금**, 예약 링크를 표시합니다.
- 캠핑장마다 **장점 2~3개 / 단점 1~2개**를 함께 표시합니다.
- 실시간 조회를 지원하지 않는 예약 방식(자체 홈페이지·네이버 카페·전화)은 **직접확인**으로 표시하고 링크를 제공합니다.

## 사용 방법

### 1) 웹(GitHub Pages)
`docs/` 폴더가 GitHub Pages로 배포됩니다. GitHub Actions가 30분마다 각 예약 플랫폼을 조회해 `docs/data/availability.json`을 갱신합니다(오늘부터 60일 창).

### 2) 로컬 실시간 모드
```bash
npm install
npm run build:data   # data/source/campsites.xlsx → campsites.json
npm run serve        # http://localhost:8787
```
로컬 서버에서는 **"선택 기간 실시간 조회"** 버튼이 나타나며, 화면에 보이는 캠핑장을 그 자리에서 플랫폼에 조회합니다.

### 3) 수동 수집
```bash
npm run scrape                       # 전체(지원 플랫폼) 60일치
node scraper/run.mjs --platform camfit,knps --from 2026-10-01 --to 2026-10-31
node scraper/run.mjs --ids c786abe01 --limit 5
```

## 실시간 조회 어댑터
| 플랫폼 | 제공 범위 | 비고 |
|---|---|---|
| 국립공원 예약시스템 | 사이트별 일자·요금·규격 | 오늘~다음달 말 |
| 숲나들e(자연휴양림) | 휴양림 단위 잔여 수 + 사이트 목록·면적·요금 | 데크별 O/X는 로그인 필요 |
| 땡큐캠핑 | 사이트 유형별 잔여·요금·규격 | |
| 네이버 예약 | 사이트별 재고·요금·크기 | |
| 인터파크/NOL 티켓 | 구역별 잔여 수 | 판매 기간에만 |
| NOL(야놀자) 숙소 | 사이트별 매진 여부·요금 | 30일 창(응답이 커서) |
| 엑스티켓 | 구역별 잔여 면수·요금 | |
| 캠핑톡 | 구역별 재고·요금·크기 | |
| 메이크티켓 | 구역별 잔여 수 | 요금은 시트 추정 |
| 떠나요 | 사이트별 가능 여부 | |
| 티켓플레이·잡자 | 구역별 잔여 면수·요금 | |
| 휴양림 예약시스템(정선) | 예약 가능 사이트 목록·요금 | |

미지원(링크만 제공): 캠핏(Cloudflare 봇 차단), 캠핑코리아(대기열 우회 키 필요), 지자체별 독자 시스템, 네이버 카페·전화·현장선착순.
예약처가 시트와 달라진 곳은 `data/booking-overrides.json`(캠핑장이름|시군 → 실제 예약 URL)로 보정합니다.

## 구조
```
data/source/campsites.xlsx   원본 시트
scripts/build-campsites.mjs  시트 → data/campsites.json, docs/data/campsites.json (플랫폼 감지, 장단점 생성)
scripts/pros-cons.mjs        장단점 규칙
scraper/platforms.mjs        예약 URL/문구 → 플랫폼 식별
scraper/adapters/*.mjs       플랫폼별 실시간 조회 어댑터
scraper/run.mjs              일괄 수집 → docs/data/availability.json
scraper/server.mjs           로컬 정적 서버 + /api/availability (실시간)
docs/                        웹 앱(GitHub Pages)
.github/workflows/refresh.yml 30분 주기 수집
```

## 어댑터 추가하기
`scraper/adapters/<platform>.mjs`에 다음을 export 하면 자동으로 등록됩니다.
```js
export const platform = 'camfit';
export async function fetchAvailability(camp, from, to) {
  // camp: data/campsites.json 항목 (camp.platformRef = 플랫폼 내부 ID)
  // return normalizeResult(platform, camp, [{ id, name, zone, size, capacity, priceByDate:{'YYYY-MM-DD':원}, availableDates:[...], bookUrl }])
}
```
플랫폼 내부 ID가 시트 URL에 없는 경우(숲나들e, 국립공원)는 `scraper/adapters/_map-<platform>.json`에 캠핑장 이름 → ID 매핑을 둡니다.

## 주의
- 각 플랫폼의 공개 페이지를 낮은 빈도로 조회합니다(호스트당 요청 간격 0.7초, 동시 3개). 플랫폼 약관과 부하를 고려해 주기를 늘리지 마세요.
- 요금은 플랫폼 응답값을 우선 사용하고, 없으면 시트의 주말/주중 요금(금·토·공휴일 전날 = 주말)으로 추정합니다. 실제 결제 금액과 다를 수 있습니다.
- 플랫폼 화면 구조가 바뀌면 어댑터가 실패할 수 있으며, 그 경우 해당 캠핑장은 **조회오류**로 표시됩니다.
