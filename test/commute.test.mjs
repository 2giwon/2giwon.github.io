import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commuteMode, busSeconds, catchableBus, homePlan, badgeText, dataAgeSec, busList, staleText, ROUTE } from '../app/commute.mjs';

// 2026-11-26 은 목요일
const at = (h, m, day = 26) => new Date(2026, 10, day, h, m, 0);

test('B1. 평일 17:00~18:00 은 자동(30초마다), 18:00 뒤는 버튼, 17:00 전과 주말은 숨김', () => {
  assert.equal(commuteMode(at(16, 59)), 'hidden');
  assert.equal(commuteMode(at(17, 0)), 'auto');
  assert.equal(commuteMode(at(17, 59)), 'auto');
  assert.equal(commuteMode(at(18, 0)), 'manual');
  assert.equal(commuteMode(at(22, 30)), 'manual');
  assert.equal(commuteMode(at(17, 30, 28)), 'hidden'); // 토요일
  assert.equal(commuteMode(at(17, 30, 29)), 'hidden'); // 일요일
});

test('B7. 테스트 스위치(주소의 ?commute=auto|manual)는 시각과 상관없이 그 모드로, 다른 값은 무시', () => {
  assert.equal(commuteMode(at(9, 0), 'auto'), 'auto');
  assert.equal(commuteMode(at(9, 0, 28), 'manual'), 'manual'); // 토요일 아침이어도
  assert.equal(commuteMode(at(9, 0), 'hidden'), 'hidden');
  assert.equal(commuteMode(at(9, 0), 'xyz'), 'hidden'); // 모르는 값은 무시하고 시각대로
  assert.equal(commuteMode(at(17, 30), null), 'auto');
});

test('B8. 지난 시간은 서울시가 정보를 만든 시각(mkTm, 한국 시각)부터 잰다. 없으면 Worker 가 받은 시각', () => {
  // 시간대를 직접 적는다. GitHub 자동 검사는 UTC 라 기기 시간대로 만들면 깨진다(codex P2 11-27)
  const now = new Date('2026-11-27T17:10:30+09:00');
  assert.equal(dataAgeSec({ mkTm: '2026-11-27 17:10:00.0', fetchedAt: '2026-11-27T17:10:20+09:00' }, now), 30);
  assert.equal(dataAgeSec({ fetchedAt: '2026-11-27T17:10:20+09:00' }, now), 10);
  assert.equal(dataAgeSec({ mkTm: '깨진 값' }, now), 0);
  assert.equal(dataAgeSec({ mkTm: '2026-11-27 17:11:00.0' }, now), 0); // 시계가 어긋나 미래면 0
  assert.equal(dataAgeSec({ mkTm: '2026-11-27 08:10:00.0' }, new Date('2026-11-27T08:10:05+09:00')), 5); // 아침도
});

test('B9. 이번 버스와 다음 버스: 지난 시간만큼 줄인 남은 초와, 걸어가서 탈 수 있는지', () => {
  const stopData = { arrmsg1: 'x', traTime1: '200', arrmsg2: 'y', traTime2: '900' };
  assert.deepEqual(busList(stopData, 30), [
    { order: 1, sec: 170, catchable: false, gone: false },
    { order: 2, sec: 870, catchable: true, gone: false },
  ]);
  assert.deepEqual(busList({ arrmsg1: '운행종료', traTime1: '0', arrmsg2: '', traTime2: '' }, 0), [
    { order: 1, sec: null, catchable: false, gone: false },
    { order: 2, sec: null, catchable: false, gone: false },
  ]);
  // 예측 시각이 지났으면 "1분 안에"로 남기지 않고 지나갔을 수 있다고 표시한다(codex P2 11-27)
  assert.deepEqual(busList({ arrmsg1: 'x', traTime1: '20' }, 60)[0], { order: 1, sec: null, catchable: false, gone: true });
});

test('B10. 받은 지 1분 30초가 넘으면 "N분 전 정보"', () => {
  assert.equal(staleText(30), null);
  assert.equal(staleText(89), null);
  assert.equal(staleText(90), '2분 전 정보');
  assert.equal(staleText(600), '10분 전 정보');
});

test('B2. 도착 정보는 traTime(초)으로 읽고, 운행종료나 출발대기는 모름(null)', () => {
  assert.equal(busSeconds('2분38초후[1번째 전]', '158'), 158);
  assert.equal(busSeconds('곧 도착', '5'), 5);
  assert.equal(busSeconds('운행종료', '0'), null);
  assert.equal(busSeconds('출발대기', '0'), null);
  assert.equal(busSeconds('3분후[2번째 전]', ''), null); // 숫자가 없으면 모름
});

// 서울시 API getArrInfoByRouteAll 의 실제 응답(11-26 16:3x)에서 두 정류장만 뗀 모양
const stop = { arrmsg1: '2분38초후[1번째 전]', traTime1: '158', vehId1: '111', arrmsg2: '21분40초후[11번째 전]', traTime2: '1300', vehId2: '222' };
const nodeul = { arrmsg1: '10분16초후[4번째 전]', traTime1: '616', vehId1: '111', arrmsg2: '29분18초후[14번째 전]', traTime2: '1758', vehId2: '222' };

test('B3. 정류장까지 걸어서 3분이라 그보다 먼저 오는 버스는 못 탄다. 탈 수 있는 첫 버스를 고른다', () => {
  // 250초 뒤 도착 → 걸어서 180초라 탈 수 있고, 걷는 시간 + 2분 안이라 "지금 바로 나가야 함"
  const ok = { ...stop, traTime1: '250' };
  assert.deepEqual(catchableBus(ok, nodeul), { waitSec: 250, rideSec: 616 - 250, vehId: '111', missedFirst: false, late: true });
  // 실제 응답의 158초는 걸어가는 180초보다 빨라 못 탄다 → 두 번째 버스
  const soon = stop;
  assert.deepEqual(catchableBus(soon, nodeul), { waitSec: 1300, rideSec: 1758 - 1300, vehId: '222', missedFirst: true, late: false });
});

test('B3. 노들역 쪽에서 같은 차량을 못 찾으면 버스 구간은 예전 분석값(퇴근 정체 포함)으로', () => {
  const r = catchableBus({ ...stop, traTime1: '400' }, { ...nodeul, vehId1: 'x', vehId2: 'y' });
  assert.equal(r.rideSec, ROUTE.busRideFallbackMin * 60);
});

test('B5. Worker 가 받은 뒤 지난 시간(ageSec)만큼 도착까지 남은 시간에서 뺀다(리뷰 P2 11-26)', () => {
  const r = catchableBus({ ...stop, traTime1: '400' }, nodeul, 30);
  assert.equal(r.waitSec, 370);
  assert.equal(r.rideSec, 616 - 400); // 버스 구간 길이는 그대로
  // 늦게 받아서 걸어가는 3분 안으로 들어오면 그 버스는 못 탄다
  assert.equal(catchableBus({ ...stop, traTime1: '200' }, nodeul, 30).vehId, '222');
});

test('B3. 두 대 다 못 타거나 정보가 없으면 null', () => {
  assert.equal(catchableBus({ ...stop, traTime1: '60', traTime2: '100' }, nodeul), null);
  assert.equal(catchableBus({ arrmsg1: '운행종료', traTime1: '0', arrmsg2: '운행종료', traTime2: '0' }, nodeul), null);
});

test('B4. 두 경로의 집 도착 시각을 계산해 빠른 쪽을 추천한다', () => {
  const now = at(17, 30);
  const bus = { waitSec: 600, rideSec: 480, vehId: '1', missedFirst: false, late: false };
  const p = homePlan(now, bus);
  // 6211: 17:30 + 대기 10분 + 버스 8분 + 노들역 환승 5분 + 9호선 기다림 3분 + 9호선 24분 + 집까지 7분 = 18:27
  assert.equal(p.bus.homeAt.getHours() * 60 + p.bus.homeAt.getMinutes(), 18 * 60 + 27);
  assert.equal(p.bus.boardAt.getMinutes(), 40);
  // 지하철: 17:30 + 60분 = 18:30
  assert.equal(p.subway.homeAt.getHours() * 60 + p.subway.homeAt.getMinutes(), 18 * 60 + 30);
  assert.equal(p.pick, 'bus');
  assert.equal(p.diffMin, 3);
});

test('B4. 6211 이 오래 걸리면 지하철, 버스 정보가 없으면 지하철', () => {
  const now = at(17, 30);
  assert.equal(homePlan(now, { waitSec: 1500, rideSec: 480 }).pick, 'subway');
  const none = homePlan(now, null);
  assert.equal(none.pick, 'subway');
  assert.equal(none.bus, null);
});

test('B6. 시계 옆 추천 알약: 추천 경로, 도착까지 남은 시간, 집 도착 시각을 한 줄로', () => {
  const now = at(17, 6);
  const bus = { waitSec: 960, rideSec: 480, vehId: '1', missedFirst: false, late: false };
  const p = homePlan(now, bus); // 6211 쪽 집 18:09 > 지하철 18:06
  assert.deepEqual(badgeText(p, bus), { tone: 'subway', text: '지하철 → 집 18:06', hurry: false });
  const fast = { waitSec: 240, rideSec: 480, vehId: '1', missedFirst: false, late: true };
  assert.deepEqual(badgeText(homePlan(now, fast), fast), { tone: 'bus', text: '6211 4분 뒤 도착 → 집 17:57', hurry: true });
  const soon = { ...fast, waitSec: 40 };
  assert.equal(badgeText(homePlan(now, soon), soon).text.startsWith('6211 1분 안에 도착'), true);
  assert.deepEqual(badgeText(homePlan(now, null), null), { tone: 'subway', text: '지하철 → 집 18:06', hurry: false });
});
