// 시트의 "홈페이지,예약사이트" 셀 값 → 예약 플랫폼 식별
// 각 플랫폼의 실시간 조회 어댑터는 scraper/adapters/<id>.mjs 에 있음(없으면 수동 확인 링크만 제공)

export const PLATFORMS = {
  foresttrip: { name: '숲나들e(국립·공립 자연휴양림)', home: 'https://www.foresttrip.go.kr', live: true },
  knps: { name: '국립공원 예약시스템', home: 'https://reservation.knps.or.kr', live: true },
  camfit: { name: '캠핏(자동조회 차단)', home: 'https://camfit.co.kr', live: false },
  thankq: { name: '땡큐캠핑', home: 'https://m.thankqcamping.com', live: true },
  naver: { name: '네이버 예약', home: 'https://booking.naver.com', live: true },
  interpark: { name: '인터파크/NOL 티켓', home: 'https://tickets.interpark.com', live: true },
  ticketplay: { name: '티켓플레이', home: '', live: true },
  zapza: { name: '잡자', home: '', live: true },
  ddnayo: { name: '떠나요', home: 'https://booking.ddnayo.com', live: false },
  seoul: { name: '서울시 공공서비스예약', home: 'https://yeyak.seoul.go.kr', live: false },
  navercafe: { name: '네이버 카페(수기 예약)', home: '', live: false },
  own: { name: '캠핑장 자체 홈페이지', home: '', live: false },
  website: { name: '자체 홈페이지', home: '', live: false },
  phone: { name: '전화 예약', home: '', live: false },
  walkin: { name: '선착순(현장)', home: '', live: false },
  closed: { name: '폐업/운영 중단', home: '', live: false },
  unknown: { name: '예약 방식 미확인', home: '', live: false },
};

export function detectPlatform(raw) {
  const s = String(raw || '').trim();
  const lower = s.toLowerCase();
  const url = /^(https?:\/\/|bit\.ly)/i.test(s) ? (s.startsWith('http') ? s : 'https://' + s) : '';
  const mk = (id, ref = '', u = url) => ({ id, name: PLATFORMS[id].name, ref, url: u || PLATFORMS[id].home });

  if (!s) return mk('unknown');
  if (/폐업/.test(s)) return mk('closed', '', '');
  if (/전화/.test(s)) return mk('phone', '', '');
  if (/선착순/.test(s)) return mk('walkin', '', '');
  if (/숲나들/.test(s) || lower.includes('foresttrip.go.kr')) return mk('foresttrip', '', 'https://www.foresttrip.go.kr');
  if (/국립공원/.test(s) || lower.includes('knps.or.kr')) return mk('knps', '', 'https://reservation.knps.or.kr');
  if (lower.includes('camfit.co.kr')) {
    const m = s.match(/camp\/([0-9a-f]{24})/i);
    return mk('camfit', m ? m[1] : '');
  }
  if (lower.includes('thankqcamping')) {
    const m = s.match(/cseq=(\d+)/);
    return mk('thankq', m ? m[1] : '');
  }
  if (lower.includes('booking.naver.com')) {
    const m = s.match(/bizes\/(\d+)/);
    return mk('naver', m ? m[1] : '');
  }
  if (/네이버\s*예약/.test(s) || lower.includes('map.naver.com') || lower.includes('place.naver.com')) return mk('naver');
  if (lower.includes('cafe.naver.com')) return mk('navercafe');
  if (/인터파크/.test(s) || lower.includes('interpark') || lower.includes('nol.yanolja.com/ticket')) {
    const m = s.match(/(?:goods|products)\/(\d{6,})/);
    return mk('interpark', m ? m[1] : '');
  }
  if (lower.includes('ticketplay.zone')) return mk('ticketplay');
  if (lower.includes('zapza.me')) return mk('zapza');
  if (lower.includes('ddnayo.com')) return mk('ddnayo');
  if (lower.includes('yeyak.seoul.go.kr')) return mk('seoul');
  if (url) return mk('website');
  if (/자체홈페이지|지자체홈페이지|지자체사이트/.test(s)) return mk('own', '', '');
  return mk('unknown', '', '');
}
