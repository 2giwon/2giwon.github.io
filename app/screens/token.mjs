// 토큰 화면: 토큰이 없거나 만료됐을 때 보이는 유일한 화면. 공개 방문자가 보는 것도 이 화면뿐이다.

import { h } from '../dom.mjs';
import { saveToken } from '../token.mjs';

const NEW_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

export function tokenScreen({ reason = null, onSaved }) {
  const error = h('p', { class: 'form-error', role: 'alert' });
  const tokenInput = h('input', {
    id: 'token',
    type: 'password',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    placeholder: 'github_pat_...',
    required: true,
  });
  const expiresInput = h('input', { id: 'expires', type: 'date' });

  const form = h(
    'form',
    {
      class: 'token-form',
      onsubmit: (ev) => {
        ev.preventDefault();
        try {
          saveToken(localStorage, { token: tokenInput.value, expiresOn: expiresInput.value || null });
          onSaved();
        } catch (e) {
          error.textContent = e.message;
        }
      },
    },
    h('label', { for: 'token' }, '토큰'),
    tokenInput,
    h('label', { for: 'expires' }, '만료일 (선택, 넣으면 2주 전부터 알려 드립니다)'),
    expiresInput,
    error,
    h('button', { type: 'submit', class: 'primary' }, '저장')
  );

  return h(
    'section',
    { class: 'token-screen' },
    h('h1', null, '작업노트'),
    reason ? h('p', { class: 'banner warn', role: 'alert' }, reason) : null,
    h('p', null, '나만 보는 작업 문서 화면입니다. 토큰을 넣어야 볼 수 있습니다.'),
    form,
    // 저장소 이름과 권한 설명은 화면에 적지 않는다(누구나 보는 화면이라, 사용자 요청 11-09). 링크만 둔다
    h('p', { class: 'hint' }, h('a', { href: NEW_TOKEN_URL, target: '_blank', rel: 'noopener noreferrer' }, '토큰 만들러 가기')),
    h('a', { class: 'blog-link', href: '/android-weekly-study/' }, '안드로이드 위클리 공부 노트 보러 가기 →')
  );
}
