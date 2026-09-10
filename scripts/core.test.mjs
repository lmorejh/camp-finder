import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform } from '../scraper/platforms.mjs';
import { nightsBetween, isWeekendNight, estimatePeriodPrice, sumSitePrice, siteAvailableAll } from '../docs/pricing.js';
import { buildProsCons } from './pros-cons.mjs';

test('플랫폼 감지', () => {
  assert.equal(detectPlatform('숲나들이').id, 'foresttrip');
  assert.equal(detectPlatform('https://www.foresttrip.go.kr/main.do').id, 'foresttrip');
  assert.equal(detectPlatform('국립공원관리공단').id, 'knps');
  const cf = detectPlatform('https://camfit.co.kr/camp/65b33e31c87842001e679105');
  assert.equal(cf.id, 'camfit');
  assert.equal(cf.ref, '65b33e31c87842001e679105');
  const tq = detectPlatform('https://m.thankqcamping.com/resv/view.hbb?cseq=4034&go_main=Y&path=RP');
  assert.equal(tq.id, 'thankq');
  assert.equal(tq.ref, '4034');
  const nv = detectPlatform('https://booking.naver.com/booking/3/bizes/331279?tr=bnm');
  assert.equal(nv.id, 'naver');
  assert.equal(nv.ref, '331279');
  assert.equal(detectPlatform('네이버예약').id, 'naver');
  assert.equal(detectPlatform('https://cafe.naver.com/yonggokli').id, 'navercafe');
  assert.equal(detectPlatform('인터파크').id, 'interpark');
  assert.equal(detectPlatform('자체홈페이지').id, 'own');
  assert.equal(detectPlatform('https://wangter.kr/').id, 'website');
  assert.equal(detectPlatform('bit.ly/2VwIJow').url, 'https://bit.ly/2VwIJow');
  assert.equal(detectPlatform('').id, 'unknown');
  assert.equal(detectPlatform('폐업함').id, 'closed');
});

test('숙박일·주말 판정', () => {
  assert.deepEqual(nightsBetween('2026-10-02', '2026-10-04'), ['2026-10-02', '2026-10-03']);
  assert.equal(isWeekendNight('2026-10-02'), true); // 금
  assert.equal(isWeekendNight('2026-10-03'), true); // 토
  assert.equal(isWeekendNight('2026-10-04'), true); // 일요일이지만 다음날 10/5 대체공휴일 → 주말요금
  assert.equal(isWeekendNight('2026-10-06'), false); // 화
  assert.equal(isWeekendNight('2026-09-23'), true); // 추석 전날(수)
  assert.equal(isWeekendNight('2026-09-14'), false); // 평일 월
});

test('기간 요금 추정', () => {
  const camp = { priceWeekend: 30000, priceWeekday: 20000 };
  const r = estimatePeriodPrice(camp, '2026-09-17', '2026-09-20'); // 목,금,토
  assert.deepEqual(r, { total: 80000, nights: 3, weekendNights: 2 });
  assert.equal(estimatePeriodPrice({ priceWeekend: null, priceWeekday: null }, '2026-09-17', '2026-09-18'), null);
  assert.equal(estimatePeriodPrice(camp, '2026-09-18', '2026-09-18'), null);
});

test('사이트 요금 합산·가용성', () => {
  const site = { priceByDate: { '2026-09-18': 40000, '2026-09-19': 40000 }, availableDates: ['2026-09-18', '2026-09-19'] };
  const nights = ['2026-09-18', '2026-09-19'];
  assert.equal(sumSitePrice(site, nights), 80000);
  assert.equal(siteAvailableAll(site, nights), true);
  assert.equal(siteAvailableAll(site, ['2026-09-18', '2026-09-20']), false);
  assert.equal(sumSitePrice(site, ['2026-09-20']), null);
});

test('장단점 생성', () => {
  const pc = buildProsCons({ environment: '울산바위조망', season: '4계절모두추천', pet: '애견불가', winter: '동계개장', priceWeekend: 60000, siteForm: '파쇄석', kind: '사설캠핑장', platform: 'website' });
  assert.equal(pc.pros.length, 3);
  assert.equal(pc.pros[0], '울산바위조망');
  assert.equal(pc.cons.length, 2);
  assert.ok(pc.cons.includes('반려견 동반 불가'));
});
