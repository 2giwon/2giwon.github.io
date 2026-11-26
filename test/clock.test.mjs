import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEGMENTS, clockDigits, colonOn, msToNextSecond, untilOffWork } from '../app/clock.mjs';

const at = (h, m, s = 0, day = 26) => new Date(2026, 10, day, h, m, s); // 2026-11-26 은 목요일

test('C5. 퇴근(오후 5시 30분)까지 남은 시간을 시, 분 네 자리로. 남은 초는 올려서 센다', () => {
  assert.deepEqual(untilOffWork(at(15, 21, 30)), { state: 'working', digits: '0209' });
  assert.deepEqual(untilOffWork(at(9, 0, 0)), { state: 'working', digits: '0830' });
  assert.deepEqual(untilOffWork(at(17, 29, 1)), { state: 'working', digits: '0001' });
});

test('C5. 5시 30분이 되면 퇴근, 주말이면 주말', () => {
  assert.deepEqual(untilOffWork(at(17, 30, 0)), { state: 'done', digits: '0000' });
  assert.deepEqual(untilOffWork(at(22, 0, 0)), { state: 'done', digits: '0000' });
  assert.deepEqual(untilOffWork(at(10, 0, 0, 28)), { state: 'weekend', digits: '----' }); // 토요일
  assert.deepEqual(untilOffWork(at(10, 0, 0, 29)), { state: 'weekend', digits: '----' }); // 일요일
});

test('C5. 줄표(-)는 가운데 막대 하나', () => {
  assert.equal(SEGMENTS['-'], 'g');
});

// 막대 이름: a 위, b 오른쪽 위, c 오른쪽 아래, d 아래, e 왼쪽 아래, f 왼쪽 위, g 가운데

test('C1. 숫자 0~9 가 켜는 막대(7세그먼트 표준)', () => {
  assert.equal(SEGMENTS['0'], 'abcdef');
  assert.equal(SEGMENTS['1'], 'bc');
  assert.equal(SEGMENTS['2'], 'abdeg');
  assert.equal(SEGMENTS['3'], 'abcdg');
  assert.equal(SEGMENTS['4'], 'bcfg');
  assert.equal(SEGMENTS['5'], 'acdfg');
  assert.equal(SEGMENTS['6'], 'acdefg');
  assert.equal(SEGMENTS['7'], 'abc');
  assert.equal(SEGMENTS['8'], 'abcdefg');
  assert.equal(SEGMENTS['9'], 'abcdfg');
});

test('C2. 시계 글자는 24시간제 네 자리(앞자리 0 포함)', () => {
  assert.equal(clockDigits(new Date(2026, 10, 26, 9, 5, 0)), '0905');
  assert.equal(clockDigits(new Date(2026, 10, 26, 23, 59, 59)), '2359');
  assert.equal(clockDigits(new Date(2026, 10, 26, 0, 0, 0)), '0000');
});

test('C3. 가운데 : 는 짝수 초에 켜지고 홀수 초에 꺼진다(1초마다 깜빡)', () => {
  assert.equal(colonOn(new Date(2026, 10, 26, 9, 5, 10)), true);
  assert.equal(colonOn(new Date(2026, 10, 26, 9, 5, 11)), false);
});

test('C4. 다음 초가 바뀌는 순간까지 남은 밀리초(깜빡임을 실제 초에 맞춘다)', () => {
  assert.equal(msToNextSecond(new Date(2026, 10, 26, 9, 5, 10, 250)), 750);
  assert.equal(msToNextSecond(new Date(2026, 10, 26, 9, 5, 10, 0)), 1000);
});
