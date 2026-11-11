import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLinks, LINKS_REPO, LINKS_PATH } from '../app/links.mjs';

test('바로가기 파일 위치는 비공개 personal-docs 의 worknote/links.json', () => {
  assert.equal(LINKS_REPO, 'personal-docs');
  assert.equal(LINKS_PATH, 'worknote/links.json');
});

test('정상 파일을 읽어 이름과 주소를 돌려준다', () => {
  const r = parseLinks(JSON.stringify({ links: [{ title: 'cmux 원격', url: 'http://100.68.32.7:4399/' }] }));
  assert.deepEqual(r, { ok: true, links: [{ title: 'cmux 원격', url: 'http://100.68.32.7:4399/' }] });
});

test('http, https 가 아닌 주소(javascript: 등)와 이름 없는 줄은 뺀다', () => {
  const r = parseLinks(
    JSON.stringify({
      links: [
        { title: '나쁜', url: 'javascript:alert(1)' },
        { title: '데이터', url: 'data:text/html,hi' },
        { title: '  ', url: 'https://a.example/' },
        { title: '깨진 주소', url: 'http//nope' },
        { title: '좋은', url: 'https://b.example/x' },
        'not-object',
      ],
    })
  );
  assert.deepEqual(r, { ok: true, links: [{ title: '좋은', url: 'https://b.example/x' }] });
});

test('JSON 이 아니거나 links 목록이 없으면 형식 오류', () => {
  assert.equal(parseLinks('{ 깨짐').ok, false);
  assert.equal(parseLinks(JSON.stringify({ items: [] })).ok, false);
});
