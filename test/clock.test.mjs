import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEGMENTS, clockDigits, colonOn, msToNextSecond } from '../app/clock.mjs';

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
