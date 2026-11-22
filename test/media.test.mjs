import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute } from '../app/route.mjs';
import { parseMediaIndex, mimeOf, kindOf, isSafeName, mediaPath, durationText } from '../app/media.mjs';

const ok = (items, extra = {}) => JSON.stringify({ version: 1, items, ...extra });

test('샘플 주소는 repo 와 폴더로 나뉜다', () => {
  assert.deepEqual(parseRoute('#/media/personal-docs/video-pipeline/media/voice-test'), {
    name: 'media',
    repo: 'personal-docs',
    folder: 'video-pipeline/media/voice-test',
  });
});

test('폴더가 빠진 샘플 주소는 상태판', () => {
  assert.deepEqual(parseRoute('#/media/personal-docs'), { name: 'dashboard' });
  assert.deepEqual(parseRoute('#/media'), { name: 'dashboard' });
});

test('확장자로 MIME 과 종류를 정한다', () => {
  assert.equal(mimeOf('a.m4a'), 'audio/mp4');
  assert.equal(mimeOf('A.MP4'), 'video/mp4');
  assert.equal(mimeOf('a.png'), 'image/png');
  assert.equal(mimeOf('a.zip'), 'application/octet-stream');
  assert.equal(kindOf('a.m4a'), 'audio');
  assert.equal(kindOf('a.webm'), 'video');
  assert.equal(kindOf('a.jpeg'), 'image');
  assert.equal(kindOf('a.zip'), 'other');
});

test('폴더를 벗어나는 파일 이름은 막는다', () => {
  assert.equal(isSafeName('a.m4a'), true);
  assert.equal(isSafeName('sub/a.m4a'), true);
  assert.equal(isSafeName('../secret.md'), false);
  assert.equal(isSafeName('/etc/passwd'), false);
  assert.equal(isSafeName('a/../../b.m4a'), false);
  assert.equal(isSafeName('./a.m4a'), false);
  assert.equal(isSafeName('a\\b.m4a'), false);
  assert.equal(isSafeName(''), false);
});

test('폴더와 파일 이름을 경로로 합친다', () => {
  assert.equal(mediaPath('a/b', 'c.m4a'), 'a/b/c.m4a');
  assert.equal(mediaPath('a/b/', 'c.m4a'), 'a/b/c.m4a');
  assert.equal(mediaPath('', 'c.m4a'), 'c.m4a');
});

test('목록을 해석하고 빠진 값은 기본값으로 채운다', () => {
  const r = parseMediaIndex(ok([{ file: 'a.m4a' }]));
  assert.equal(r.ok, true);
  assert.equal(r.data.title, '샘플');
  assert.deepEqual(r.data.findings, []);
  const [it] = r.data.items;
  assert.equal(it.label, 'a.m4a', 'label 이 없으면 파일 이름을 쓴다');
  assert.equal(it.kind, 'audio');
  assert.equal(it.mime, 'audio/mp4');
  assert.equal(it.duration, null);
  assert.equal(it.badge, null);
});

test('kind 를 적으면 확장자보다 그것을 따른다', () => {
  const r = parseMediaIndex(ok([{ file: 'a.m4a', kind: 'video' }]));
  assert.equal(r.data.items[0].kind, 'video');
});

test('모르는 kind 는 확장자로 되돌린다', () => {
  const r = parseMediaIndex(ok([{ file: 'a.m4a', kind: '엉뚱한값' }]));
  assert.equal(r.data.items[0].kind, 'audio');
});

test('머리말과 메모를 읽는다', () => {
  const r = parseMediaIndex(
    ok([{ file: 'a.m4a' }], {
      title: '나레이션 샘플',
      updated: '2026-11-22',
      doc: 'video-pipeline/TASKS.md',
      sentence: '용봉차일',
      findings: ['하나', '', 3],
      pending: ['둘'],
    })
  );
  assert.equal(r.data.title, '나레이션 샘플');
  assert.equal(r.data.doc, 'video-pipeline/TASKS.md');
  assert.deepEqual(r.data.findings, ['하나'], '빈 글자와 글자가 아닌 값은 버린다');
  assert.deepEqual(r.data.pending, ['둘']);
});

test('형식이 틀리면 이유를 돌려준다', () => {
  for (const [text, hint] of [
    ['{', 'JSON'],
    ['[]', '객체'],
    ['{"version":1}', 'items'],
    ['{"items":[]}', '비었'],
    ['{"items":[{}]}', 'file'],
    ['{"items":[1]}', '객체'],
    ['{"items":[{"file":"../x.md"}]}', '벗어'],
  ]) {
    const r = parseMediaIndex(text);
    assert.equal(r.ok, false, `${text} 는 거절해야 한다`);
    assert.match(r.error, new RegExp(hint), `${text} 의 이유에 ${hint} 가 있어야 한다`);
  }
});

test('길이는 소수 두 자리로 적고 모르면 빈 글자', () => {
  assert.equal(durationText(8.8), '8.80초');
  assert.equal(durationText(null), '');
  assert.equal(durationText(undefined), '');
});
