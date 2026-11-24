import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recolorChart } from '../app/draw.mjs';
import { figureColors } from '../app/theme.mjs';

// Chart.js 는 만들 때 색을 그래프 안에 담아 둔다. 기본값만 바꾸면 이미 그린 그래프는 예전 색 그대로다(11-24 실화면에서 확인)
function fakeChart(type) {
  return {
    config: { type },
    data: { datasets: [{ borderColor: '#fff' }] },
    options: {
      scales: type === 'pie' ? {} : { x: { ticks: {}, grid: {}, border: {} }, y: { ticks: {}, grid: {}, border: {} } },
      plugins: { legend: { labels: {} } },
    },
    updated: null,
    update(mode) {
      this.updated = mode;
    },
  };
}

test('이미 그린 막대그래프의 글자색, 격자선, 범례 색을 새 화면 밝기로 바꾼다', () => {
  const c = fakeChart('bar');
  const light = figureColors('light');
  recolorChart(c, light);
  assert.equal(c.options.color, light.text);
  for (const s of Object.values(c.options.scales)) {
    assert.equal(s.ticks.color, light.text);
    assert.equal(s.grid.color, light.grid);
    assert.equal(s.border.color, light.grid);
  }
  assert.equal(c.options.plugins.legend.labels.color, light.text);
  assert.equal(c.updated, 'none');
});

test('원그래프는 조각 사이 선도 바꾸고, 막대그래프 막대 색은 건드리지 않는다', () => {
  const dark = figureColors('dark');
  const pie = fakeChart('pie');
  recolorChart(pie, dark);
  assert.equal(pie.data.datasets[0].borderColor, dark.pieBorder);
  const bar = fakeChart('bar');
  recolorChart(bar, dark);
  assert.equal(bar.data.datasets[0].borderColor, '#fff');
});
