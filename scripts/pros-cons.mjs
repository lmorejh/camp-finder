// 시트 정보(환경 메모·추천계절·요금·애견·시설·동계·바닥재·성격·예약방식)로 캠핑장별 장점 2~3개, 단점 1~2개 생성
const won = (n) => n.toLocaleString('ko-KR') + '원';

export function buildProsCons(c) {
  const pros = [];
  const cons = [];
  const env = (c.environment || '').replace(/\s+/g, ' ').trim();
  const isPublic = /국립|공립|지자체|국민여가/.test(c.kind || '');

  // 1) 환경 메모(유튜버가 직접 남긴 한 줄 평)를 최우선 장점으로
  if (env) pros.push(env.length > 40 ? env.slice(0, 40) + '…' : env);

  // 2) 추천 계절
  if (/4계절/.test(c.season)) pros.push('사계절 이용 추천');
  else if (/여름/.test(c.season)) pros.push('여름 물놀이·계곡에 특히 좋음');
  else if (/봄가을|봄·가을/.test(c.season)) pros.push('봄·가을에 최적');

  // 3) 편의·정책
  if (c.privateFacility) pros.push(`사이트별 ${c.privateFacility}`);
  if (/^애견가능/.test(c.pet)) pros.push('반려견 동반 가능');
  else if (/일부/.test(c.pet)) pros.push('일부 사이트 반려견 동반 가능');
  if (/동계개장/.test(c.winter)) pros.push('겨울에도 운영');

  // 4) 요금
  if (c.priceWeekend && c.priceWeekend <= 20000) pros.push(`저렴한 요금(주말 ${won(c.priceWeekend)})`);
  else if (isPublic && c.priceWeekend && c.priceWeekend <= 35000) pros.push(`국공립 시설의 합리적 요금(주말 ${won(c.priceWeekend)})`);

  // 5) 바닥재
  const form = c.siteForm || '';
  if (/잔디/.test(form)) pros.push('잔디 사이트');
  else if (/파쇄석/.test(form)) pros.push('파쇄석 사이트(배수 양호)');
  else if (/데크/.test(form)) pros.push('데크 사이트(바닥 정리·배수 편리)');

  // ---- 단점 ----
  if (/애견불가/.test(c.pet)) cons.push('반려견 동반 불가');
  if (/동계폐장/.test(c.winter)) cons.push('동계 미운영');
  if (c.priceWeekend && c.priceWeekend >= 60000) cons.push(`요금이 높은 편(주말 ${won(c.priceWeekend)})`);
  if (c.platform === 'foresttrip') cons.push('인기 휴양림은 추첨제·예약 경쟁 치열');
  else if (c.platform === 'knps') cons.push('예약 오픈일 선착순 경쟁 치열');
  else if (['navercafe', 'phone', 'own', 'website', 'unknown'].includes(c.platform)) cons.push('실시간 온라인 조회 불가(홈페이지·카페·전화 확인 필요)');
  if (/마사토/.test(form)) cons.push('마사토 바닥: 우천 시 진흙·배수 취약');
  else if (/^데크$/.test(form)) cons.push('데크 규격에 따라 대형 텐트 설치 제한');
  if (c.platform === 'closed') cons.unshift('폐업/운영 중단 정보 있음');
  if (!env && !c.season) cons.push('상세 후기 정보 부족');

  return { pros: pros.slice(0, 3), cons: cons.slice(0, 2) };
}
