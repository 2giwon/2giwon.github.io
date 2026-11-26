// 디자인 샘플 화면(11-26). personal-docs 의 샘플 HTML 을 토큰으로 읽어 그림자 영역(Shadow DOM)에 그린다.
// 그림자 영역이라 샘플 CSS 와 작업노트 CSS 가 섞이지 않는다. 샘플의 스크립트는 지우고, 하던 일(PC 화면 크기 맞추기,
// 메뉴 눌러 이동)만 여기서 대신한다. 새 디자인을 정한 뒤에도 지우지 않는다(사용자 지시 11-26).

import { h, skeleton, failure, empty, errorText } from '../dom.mjs';
import { SAMPLES, prepareSample } from '../samples.mjs';

// 샘플 안 메뉴가 작업노트 위 막대 아래에 붙도록 위치만 고친다
const HOST_CSS = `
:host { display: block; border-radius: 12px; overflow: clip; }
.jump { top: 56px !important; }
.concept { scroll-margin-top: 150px !important; }
`;

let screenSeq = 0;

function fit(shadow) {
  for (const w of shadow.querySelectorAll('.pcwrap')) {
    const pc = w.querySelector('.pc');
    if (pc && w.clientWidth) pc.style.transform = `scale(${w.clientWidth / 1280})`;
  }
}

export function samplesScreen(store, sample) {
  const mySeq = ++screenSeq;
  const slot = h('div', { class: 'samples-slot' }, skeleton(6));
  const tabs = h(
    'nav',
    { class: 'samples-tabs', 'aria-label': '샘플 고르기' },
    SAMPLES.map((s) =>
      h('a', { class: `samples-tab${s.id === sample ? ' on' : ''}`, href: s.id === 'all' ? '#/samples' : `#/samples/${s.id}`, 'aria-current': s.id === sample ? 'page' : null }, s.label)
    )
  );

  function mount({ css, body, bodyClass }) {
    const host = h('div', { class: `samples-host ${bodyClass}`.trim() });
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `${css}\n${HOST_CSS}`;
    const wrap = document.createElement('div');
    wrap.innerHTML = body; // 내 비공개 repo 의 샘플. 실행 코드(script, on... 속성)는 prepareSample 이 지웠다
    shadow.replaceChildren(style, wrap);

    // 샘플 메뉴(#a 같은 주소)는 작업노트 화면 이동이 아니라 샘플 안에서 그 자리로 내려가게
    wrap.addEventListener('click', (ev) => {
      const a = ev.target.closest('a[href^="#"]');
      if (!a) return;
      ev.preventDefault();
      shadow.getElementById(a.getAttribute('href').slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    slot.replaceChildren(host);
    const ro = new ResizeObserver(() => fit(shadow));
    for (const w of shadow.querySelectorAll('.pcwrap')) ro.observe(w);
    fit(shadow);
    window.addEventListener('hashchange', () => ro.disconnect(), { once: true });
  }

  async function load() {
    slot.replaceChildren(skeleton(6));
    let html;
    try {
      html = await store.sampleHtml(sample);
    } catch (e) {
      if (mySeq !== screenSeq) return;
      slot.replaceChildren(failure(`샘플을 못 불러왔어요 (${errorText(e)})`, () => void load()));
      return;
    }
    if (mySeq !== screenSeq) return;
    if (html === null) {
      slot.replaceChildren(empty('샘플 파일이 아직 없어요'));
      return;
    }
    const r = prepareSample(html);
    if (!r.ok) {
      slot.replaceChildren(failure(`샘플을 못 불러왔어요 (${r.error})`, () => void load()));
      return;
    }
    mount(r);
  }

  void load();
  return h(
    'div',
    { class: 'samples-page' },
    h('h1', null, '디자인 샘플'),
    h('p', { class: 'hint' }, '작업노트 새 디자인을 고를 때 만든 샘플이에요. 지금 디자인은 H와 I 섞기의 섞기 2예요.'),
    tabs,
    slot
  );
}
