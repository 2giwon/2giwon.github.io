// 상태판 탑승권 레일(11-26 작업노트 국제공항). 예전 "오늘 할 일" 칸(today.mjs)을 대신한다.
// 할 일 파일(personal-docs/todo/tasks.json)을 읽고 추가, 완료, 나중에, 오늘로, 단계 바꾸기를 저장한다.
// 계산은 todo.mjs 와 airport.mjs, 저장(충돌 시 한 번 더)은 store.updateTasks 가 한다. 여기는 그리기와 손동작만.
// - 폰: 탑승권을 오른쪽으로 밀면 완료, 왼쪽으로 밀면 나중에. 누르면 뒷면(단계, Redmine, 메모)
// - PC: 같은 기능을 버튼으로. 실수에 대비해 5초 동안 "되돌리기"

import { h, skeleton, failure, empty, errorText } from '../dom.mjs';
import { today } from '../store.mjs';
import { todayView, addTask, completeTask, moveToToday, moveToLater, setStage, needsTicket, restoreTask, STAGES, STAGE_LABEL } from '../todo.mjs';
import { boardingPasses, PASS_LABEL, flapFrames } from '../airport.mjs';
import { LAB } from '../catalog.mjs';
import { nowWorldClock, offWorkClock } from '../clock.mjs';
import { LIVE_MS, canRefresh, tasksChanged } from '../live.mjs';

const REDMINE = 'https://redmine.wp-dev.xyz/issues/';
const SWIPE_PX = 90;
const UNDO_MS = 5000;

/**
 * 레일을 옆으로 넘기면 집게에 매달린 탑승권이 실제 종이처럼 흔들린다(11-26 사용자 요청).
 * - 움직이는 동안: 넘기는 속도에 비례해 반대쪽으로 처지며 따라온다(빠를수록 더 기운다)
 * - 멈추면: 제자리를 살짝 지나쳤다가 금방 가라앉는다
 * 처음 만든 방식(스크롤할 때마다 밀어 주기)은 움직이는 동안엔 거의 안 기울고 멈춘 뒤에야 크게 흔들려 부자연스러웠다(사용자 지적).
 * 그래서 화면 한 장(프레임)마다 레일의 속도를 재고, 그 속도가 정한 "목표 기울기"를 용수철로 따라가게 했다.
 * 각도는 레일의 --swing 값으로 넘기고 탑승권마다 --k 를 곱해 조금씩 다르게 흔들린다(style.css). 움직임 줄이기 설정이면 흔들지 않는다.
 */
function swingOnScroll(box) {
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const MAX = 7; // 도
  const DRAG = 0.45; // 속도 1px/프레임 당 기울기(도)
  const STIFF = 0.1; // 목표로 당기는 힘(작을수록 천천히 흔들린다)
  const DAMP = 0.86; // 흔들림이 줄어드는 정도(작을수록 빨리 가라앉는다)
  let lastPos = box.scrollLeft;
  let speed = 0;
  let angle = 0;
  let vel = 0;
  let raf = 0;
  // 사람이 넘긴 스크롤에만 흔든다. 탑승권이 기울면 레일 폭이 바뀌어 스크롤 위치가 저절로 바뀔 수 있는데,
  // 그것까지 흔들면 기울기가 끝없이 커진다(11-26 실제로 확인)
  let userUntil = 0;
  const kick = () => {
    if (!raf) {
      lastPos = box.scrollLeft;
      raf = requestAnimationFrame(step);
    }
  };
  const touched = () => {
    userUntil = performance.now() + 500;
    kick();
  };
  for (const ev of ['wheel', 'pointerdown', 'pointermove', 'touchmove', 'keydown']) box.addEventListener(ev, touched, { passive: true });

  function step() {
    const pos = box.scrollLeft;
    const moved = performance.now() < userUntil ? pos - lastPos : 0;
    lastPos = pos;
    speed = speed * 0.6 + moved * 0.4; // 속도를 부드럽게(트랙패드의 들쭉날쭉한 값 정리)
    const target = Math.max(-MAX, Math.min(MAX, -speed * DRAG));
    vel = (vel + (target - angle) * STIFF) * DAMP;
    angle = Math.max(-MAX, Math.min(MAX, angle + vel));
    const resting = Math.abs(angle) < 0.02 && Math.abs(vel) < 0.02 && Math.abs(speed) < 0.05 && performance.now() > userUntil;
    if (resting) {
      angle = vel = speed = 0;
      raf = 0;
      box.style.setProperty('--swing', '0deg');
      return;
    }
    box.style.setProperty('--swing', `${angle.toFixed(2)}deg`);
    raf = requestAnimationFrame(step);
  }
  box.addEventListener('scroll', kick, { passive: true });
}

function saveErrorText(e) {
  if (e?.kind === 'forbidden') return '토큰에 쓰기 권한이 없어요';
  if (e?.kind === 'conflict') return '다른 곳에서 동시에 고쳐 저장하지 못했어요. 다시 해 주세요';
  if (e?.kind) return errorText(e);
  return String(e?.message ?? e);
}

const FLAP_TICK_MS = 45; // 글자판 한 장 넘기는 간격
const FLAP_EVERY_MS = 9000; // 탑승권 편명도 이만큼마다 한 장씩 차례로 촤르르
const FLAP_PASS_GAP_MS = 160; // 탑승권과 탑승권 사이 시간차
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * 전광판 글자판 하나(LM1 처럼 여러 칸). spin(새 글자) 로 스플릿 플랩 전광판처럼 촤르르 돌다 멈춘다(11-26 사용자 요청).
 * 탑승권 머리띠와 출발 안내판(dashboard.mjs) 이 함께 쓴다
 */
export function flapBoard(code, cls = 'board-flap') {
  const el = h('span', { class: `flap ${cls}`, 'aria-label': `편명 ${code}` });
  let current = '';
  let timer = 0;
  const show = (text) => {
    const cells = [...text];
    while (el.children.length < cells.length) el.append(h('i', { 'aria-hidden': 'true' }));
    while (el.children.length > cells.length) el.lastChild.remove();
    cells.forEach((c, i) => {
      const cell = el.children[i];
      if (cell.textContent !== c) {
        cell.textContent = c;
        cell.classList.remove('tick');
        void cell.offsetWidth; // 같은 칸이 연달아 바뀌어도 넘기는 움직임이 다시 보이게
        cell.classList.add('tick');
      }
    });
  };
  const spin = (target) => {
    clearInterval(timer);
    el.setAttribute('aria-label', `편명 ${target}`);
    current = target;
    if (reducedMotion() || !el.isConnected) return show(target);
    const frames = flapFrames(target);
    let k = 0;
    timer = setInterval(() => {
      show(frames[k]);
      k += 1;
      if (k >= frames.length) clearInterval(timer);
    }, FLAP_TICK_MS);
  };
  show(code);
  current = code;
  return { el, spin, get code() { return current; } };
}

/** 글자판 모양 편명(LM1) */
export function flap(code, flip = false) {
  return h('span', { class: `flap${flip ? ' flip' : ''}`, 'aria-label': `편명 ${code}` }, [...code].map((c) => h('i', { 'aria-hidden': 'true' }, c)));
}

const cell = (label, value) => h('div', { class: 'bp-cell' }, h('small', null, label), h('b', null, value));

/**
 * @param {object} store
 * @param {object[]} projects 상태판 프로젝트(짝 맞추기와 편명용)
 * @param {(state:{loaded:boolean, passes:object[]}) => void} onChange 관제탑 띠가 오늘 할 일 수를 알 수 있게 그릴 때마다 알린다
 * @returns {{rail: HTMLElement, side: HTMLElement}}
 */
export function passesSection(store, projects, onChange = () => {}) {
  const passesBox = h('div', { class: 'bp-rail-passes' }, [1, 2, 3].map(() => h('div', { class: 'bp bp-skeleton' }, skeleton(4))));
  swingOnScroll(passesBox);
  const status = h('p', { class: 'bp-status', role: 'status' });
  const count = h('span', { class: 'bp-count' });
  const laterBox = h('div', { class: 'later-box' }, skeleton(3));
  const doneBox = h('div', { class: 'done-box' });
  const toast = h('div', { class: 'undo-toast', role: 'status', hidden: true });
  let data = null;
  let sha = null; // 지금 그린 할 일 파일의 지문. 실시간 갱신이 바뀌었는지 비교한다
  let liveError = false; // 상태 줄에 실시간 갱신 실패를 띄웠는지(저장 안내를 지우지 않으려고 따로 둔다)
  // 저장이나 다시 읽기를 시작할 때마다 1씩 올린다. 다시 읽기 응답이 왔을 때 그 사이 번호가 바뀌었으면
  // 더 새로운 저장이나 읽기가 있었다는 뜻이라 버린다(늦게 온 예전 응답이 저장한 내용을 덮지 않게, codex P2 11-26)
  let seq = 0;
  let saveFailed = false; // 저장 실패 안내가 떠 있다. 다시 읽기가 이 안내를 덮거나 지우지 않는다(codex P2 11-26)
  let refreshing = false; // 다시 읽기는 한 번에 하나만. 응답이 확인 간격(10초)보다 늦어도 다음 읽기가 앞 응답을 계속 버리지 않게(codex P2 11-26)
  let busy = false;
  let toastTimer = null;
  let flipped = null; // 뒷면을 보고 있는 할 일 id
  let adding = false;
  let queuedUndo = null; // 다른 저장 중에 누른 되돌리기. 저장이 끝나면 이어서 한다(codex P2 11-26)
  // 탑승권 머리띠 편명 글자판. 다시 그릴 때마다 새로 모으고, 몇 초마다 한 장씩 차례로 촤르르 돈다(11-26 사용자 요청)
  let passBoards = [];
  const passBoard = (code) => {
    const b = flapBoard(code, 'pass-flap');
    passBoards.push(b);
    return b.el;
  };
  const flipPasses = () => passBoards.forEach((b, i) => setTimeout(() => b.spin(b.code), i * FLAP_PASS_GAP_MS));
  const flipLoop = setInterval(() => {
    if (data && !passesBox.isConnected) return clearInterval(flipLoop); // 다른 화면으로 가면 멈춘다
    flipPasses();
  }, FLAP_EVERY_MS);
  const stacked = () => typeof matchMedia === 'function' && matchMedia('(max-width: 759px)').matches;
  // 발권 칸에 쓰던 값. 다시 그려도(저장 실패 포함) 남아 있고, 발권이 성공했을 때만 비운다(codex P2 11-11)
  const draft = { title: '', stage: 'normal', when: 'today' };

  /** 저장. 끝나기 전까지 버튼을 끈다(두 번 눌러 두 번 저장되지 않게). 실패하면 화면은 그대로 두고 알린다. */
  async function save(change, message, onSaved = () => {}) {
    if (busy) return false;
    busy = true;
    seq += 1;
    liveError = false; // 상태 줄은 이제 저장 안내 차지. 다시 읽기가 회복돼도 저장 실패 안내를 지우지 않는다(codex P2 11-26)
    status.className = 'bp-status saving';
    status.textContent = '저장 중';
    for (const el of [passesBox, laterBox].flatMap((b) => [...b.querySelectorAll('button, input, select')])) el.disabled = true;
    let ok = false;
    try {
      const r = await store.updateTasks(change, message);
      data = r.data;
      sha = r.sha;
      liveError = false;
      saveFailed = false;
      status.className = 'bp-status';
      status.textContent = '';
      onSaved();
      ok = true;
    } catch (e) {
      saveFailed = true;
      status.className = 'bp-status error';
      status.textContent = `저장하지 못했어요 (${saveErrorText(e)})`;
    } finally {
      busy = false;
      draw();
    }
    if (queuedUndo) {
      const run = queuedUndo;
      queuedUndo = null;
      run();
    }
    return ok;
  }

  function showUndo(text, undo) {
    clearTimeout(toastTimer);
    toast.hidden = false;
    toast.replaceChildren(
      h('span', null, text),
      h(
        'button',
        {
          type: 'button',
          class: 'undo-btn',
          onclick: () => {
            toast.hidden = true;
            if (busy) {
              queuedUndo = undo;
              status.textContent = '저장이 끝나면 되돌려요';
            } else undo();
          },
        },
        '되돌리기'
      )
    );
    toastTimer = setTimeout(() => (toast.hidden = true), UNDO_MS);
  }

  function complete(task) {
    const prev = { status: task.status, doOn: task.doOn, doneOn: task.doneOn ?? null };
    void save((d) => completeTask(d, task.id, today()), `할 일 완료: ${task.title}`).then((ok) => {
      if (ok) showUndo(`탑승 완료: ${task.title}`, () => void save((d) => restoreTask(d, task.id, prev), `할 일 되돌리기: ${task.title}`));
    });
  }

  function later(task) {
    const prev = { status: task.status, doOn: task.doOn, doneOn: task.doneOn ?? null };
    void save((d) => moveToLater(d, task.id), `할 일 나중에: ${task.title}`).then((ok) => {
      if (ok) showUndo(`나중에 탑승: ${task.title}`, () => void save((d) => restoreTask(d, task.id, prev), `할 일 되돌리기: ${task.title}`));
    });
  }

  /**
   * 폰 손가락으로 밀기. 마우스는 버튼을 쓴다(실수로 끌리지 않게).
   * 탑승권이 겹쳐 쌓이는 폰 배치에서만 민다. 넓은 화면의 가로 레일에서는 손가락이 레일을 옆으로 넘겨야 한다(codex P2 11-26)
   */
  function swipeable(el, task) {
    let x0 = null;
    let dx = 0;
    el.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType !== 'touch' || busy || !stacked() || ev.target.closest('button, select, input, a')) return;
      x0 = ev.clientX;
      dx = 0;
      el.classList.add('dragging');
    });
    el.addEventListener('pointermove', (ev) => {
      if (x0 === null) return;
      dx = ev.clientX - x0;
      el.style.transform = `translateX(${dx}px) rotate(${dx / 24}deg)`;
      el.dataset.hint = dx > SWIPE_PX ? 'done' : dx < -SWIPE_PX ? 'later' : '';
    });
    const end = () => {
      if (x0 === null) return;
      x0 = null;
      el.classList.remove('dragging');
      if (dx > SWIPE_PX) {
        el.classList.add('fly-right');
        complete(task);
      } else if (dx < -SWIPE_PX) {
        el.classList.add('fly-left');
        later(task);
      } else {
        el.style.transform = '';
        el.dataset.hint = '';
      }
      if (Math.abs(dx) > 8) el.dataset.moved = '1'; // 민 뒤에 따라오는 click 은 뒤집기로 치지 않는다
    };
    // 브라우저나 기기가 손동작을 끊으면(pointercancel) 저장하지 않고 제자리로 돌린다(codex P2 11-26)
    const cancel = () => {
      if (x0 === null) return;
      x0 = null;
      el.classList.remove('dragging');
      el.style.transform = '';
      el.dataset.hint = '';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', cancel);
  }

  function backSide(p) {
    const t = p.task;
    const stageSelect = h('select', { class: 'bp-stage', 'aria-label': `${t.title} 단계` }, STAGES.map((s) => h('option', { value: s, selected: s === t.stage }, STAGE_LABEL[s])));
    stageSelect.addEventListener('change', () => void save((d) => setStage(d, t.id, stageSelect.value), `할 일 단계: ${t.title} → ${STAGE_LABEL[stageSelect.value]}`));
    return h(
      'div',
      { class: 'bp-back' },
      h('div', { class: 'bp-band' }, flap(p.code), h('span', { class: 'bp-state' }, '탑승권 뒷면')),
      h(
        'div',
        { class: 'bp-body' },
        h('h3', { class: 'bp-title' }, t.title),
        h('label', { class: 'bp-field' }, h('small', null, '단계'), stageSelect),
        t.redmine !== null ? h('a', { class: 'bp-ticket', href: `${REDMINE}${t.redmine}`, target: '_blank', rel: 'noopener' }, `Redmine #${t.redmine}`) : null,
        needsTicket(t) ? h('p', { class: 'bp-warn' }, '티켓 없음. 시작할 때 Redmine 티켓과 시트 행을 만들어요') : null,
        t.due ? h('p', { class: 'bp-line' }, `마감 ${t.due}`) : null,
        t.note ? h('p', { class: 'bp-note' }, t.note) : null,
        t.project ? h('p', { class: 'bp-line' }, `프로젝트 ${t.project}`) : null
      ),
      h('div', { class: 'bp-actions' }, h('button', { type: 'button', class: 'bp-btn', onclick: () => ((flipped = null), draw()) }, '앞면 보기'))
    );
  }

  function passEl(p) {
    const t = p.task;
    const gate = p.project ? (p.project.repo === LAB ? '회사' : '개인') : '개인';
    const front = h(
      'div',
      { class: 'bp-front' },
      h('div', { class: 'bp-band' }, passBoard(p.code), h('span', { class: 'bp-state' }, p.status === 'delayed' ? `${PASS_LABEL.delayed} ${p.carryDays}일째` : PASS_LABEL[p.status])),
      h(
        'div',
        { class: 'bp-body' },
        p.urgent ? h('span', { class: 'bp-stamp' }, '긴급') : null,
        h('h3', { class: 'bp-title' }, t.title),
        h('p', { class: 'bp-proj' }, p.project?.label ?? (t.project || '프로젝트 없음')),
        h('div', { class: 'bp-meta' }, cell('게이트', gate), cell('대기', p.carryDays > 0 ? `${p.carryDays}일째` : '오늘'), cell('단계', STAGE_LABEL[t.stage])),
        h('div', { class: 'bp-perf', 'aria-hidden': 'true' }),
        h('div', { class: 'bp-code', 'aria-hidden': 'true' })
      ),
      h(
        'div',
        { class: 'bp-actions' },
        // 뒷면 버튼: 키보드로도 단계와 Redmine 에 닿게(codex P2 11-26). 탑승권을 눌러 뒤집는 것과 같다
        h('button', { type: 'button', class: 'bp-btn bp-flip', 'aria-label': `${t.title} 뒷면 보기`, onclick: () => ((flipped = t.id), draw()) }, '뒷면'),
        h('button', { type: 'button', class: 'bp-btn', onclick: () => later(t) }, '나중에'),
        h('button', { type: 'button', class: 'bp-btn go', onclick: () => complete(t) }, '탑승 완료')
      )
    );
    const isBack = flipped === t.id;
    const el = h('article', { class: `bp st-${p.status}${isBack ? ' flipped' : ''}`, 'aria-label': `${p.code} ${t.title}` }, isBack ? backSide(p) : front);
    // 탑승권을 누르면 뒤집는다(버튼, 링크, 입력 칸은 제외)
    el.addEventListener('click', (ev) => {
      if (ev.target.closest('button, select, input, a, label')) return;
      if (el.dataset.moved) {
        delete el.dataset.moved;
        return;
      }
      flipped = isBack ? null : t.id;
      draw();
    });
    if (!isBack) swipeable(el, t);
    return el;
  }

  function addTile() {
    if (!adding) {
      return h('button', { type: 'button', class: 'bp bp-add', onclick: () => ((adding = true), draw()) }, h('span', { class: 'bp-add-plus', 'aria-hidden': 'true' }, '+'), '발권 (할 일 추가)');
    }
    const title = h('input', { type: 'text', class: 'bp-input', placeholder: '무엇을 할까요', 'aria-label': '추가할 할 일', maxlength: '200' });
    title.value = draft.title;
    title.addEventListener('input', () => (draft.title = title.value));
    const stage = h('select', { 'aria-label': '추가할 할 일 단계' }, STAGES.map((s) => h('option', { value: s, selected: s === draft.stage }, STAGE_LABEL[s])));
    stage.addEventListener('change', () => (draft.stage = stage.value));
    const when = h('select', { 'aria-label': '언제 할지' }, h('option', { value: 'today', selected: draft.when === 'today' }, '오늘'), h('option', { value: 'later', selected: draft.when === 'later' }, '나중에'));
    when.addEventListener('change', () => (draft.when = when.value));
    const form = h(
      'form',
      { class: 'bp bp-add-form' },
      h('div', { class: 'bp-band' }, h('span', { class: 'bp-state' }, '새 탑승권 발권')),
      h('div', { class: 'bp-body' }, title, h('div', { class: 'bp-add-row' }, stage, when)),
      h('div', { class: 'bp-actions' }, h('button', { type: 'button', class: 'bp-btn', onclick: () => ((adding = false), draw()) }, '닫기'), h('button', { type: 'submit', class: 'bp-btn go' }, '발권'))
    );
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const t = title.value.trim();
      if (!t) return title.focus();
      const s = stage.value;
      const isLater = when.value === 'later';
      void save(
        (d) => addTask(d, { title: t, stage: s, doOn: isLater ? null : today() }, today()),
        `할 일 추가: ${t}`,
        () => Object.assign(draft, { title: '', stage: 'normal', when: 'today' })
      );
    });
    queueMicrotask(() => title.focus());
    return form;
  }

  function draw() {
    const v = todayView(data.tasks, today());
    const passes = boardingPasses(v.today, projects);
    count.textContent = `${passes.length}장`;
    passBoards = [];
    passesBox.replaceChildren(...(passes.length ? passes.map(passEl) : [h('div', { class: 'bp bp-empty' }, h('p', null, '오늘 탑승할 주문이 없어요'), h('small', null, '나중에 목록에서 오늘로 옮기거나 새로 발권해요'))]), addTile());

    doneBox.replaceChildren(
      h('h3', null, `오늘 도착 ${v.doneToday.length}`),
      v.doneToday.length ? h('ul', { class: 'done-list' }, v.doneToday.map((t) => h('li', null, h('span', { class: 'done-mark', 'aria-hidden': 'true' }, '✓'), t.title))) : h('p', { class: 'side-empty' }, '아직 끝낸 일이 없어요')
    );
    // 나중에는 접지 않고 늘 펼쳐 둔다 — 접어 두면 열어 보지 않게 된다(11-19 사용자 결정)
    laterBox.replaceChildren(
      h('h3', null, `나중에 탑승 ${v.later.length}`),
      v.later.length
        ? h(
            'ul',
            { class: 'later-list' },
            v.later.map((t) =>
              h(
                'li',
                null,
                h('span', { class: `later-dot ${t.stage}`, title: STAGE_LABEL[t.stage], 'aria-hidden': 'true' }),
                h('span', { class: 'later-title', title: t.title }, t.title),
                h('button', { type: 'button', class: 'later-btn', onclick: () => void save((d) => moveToToday(d, t.id, today()), `할 일 오늘로: ${t.title}`) }, '오늘로')
              )
            )
          )
        : h('p', { class: 'side-empty' }, '나중에 할 일이 없어요')
    );
    onChange({ loaded: true, passes });
  }

  async function load() {
    passesBox.replaceChildren(...[1, 2, 3].map(() => h('div', { class: 'bp bp-skeleton' }, skeleton(4))));
    laterBox.replaceChildren(h('h3', null, '나중에 탑승'), skeleton(3));
    status.textContent = '';
    try {
      const r = await store.tasks();
      if (r.state === 'invalid') {
        count.textContent = '';
        passesBox.replaceChildren(failure(`할 일 파일 형식이 맞지 않아요 (${r.error})`, () => void load()));
        laterBox.replaceChildren();
        onChange({ loaded: true, passes: [] });
        return;
      }
      data = r.data;
      sha = r.sha;
      draw();
      setTimeout(flipPasses, 900); // 처음 열 때 한 번
      if (r.state === 'missing') passesBox.prepend(empty('할 일 파일이 아직 없어요. 첫 탑승권을 발권하면 만들어져요'));
    } catch (e) {
      count.textContent = '';
      passesBox.replaceChildren(failure(`할 일을 읽지 못했어요 (${errorText(e)})`, () => void load()));
      laterBox.replaceChildren(h('h3', null, '나중에 탑승'), h('p', { class: 'side-empty' }, '할 일을 읽지 못했어요'));
      onChange({ loaded: true, passes: [] });
    }
  }

  /**
   * 실시간 갱신(11-26 사용자 요청). /todo 나 다른 기기에서 할 일을 바꾸면 새로 고침 없이 레일에 나타난다.
   * 10초마다, 그리고 화면으로 돌아오는 순간 할 일 파일을 다시 읽고 지문이 바뀌었을 때만 다시 그린다(live.mjs).
   * 저장 중, 발권 칸에 쓰는 중, 탑승권을 미는 중, 뒷면 칸을 만지는 중에는 건드리지 않는다.
   * 실패하면 화면은 그대로 두고 상태 줄에 알리며, 다음 확인이 성공하면 안내를 지운다.
   */
  async function refresh() {
    if (!data || !passesBox.isConnected) return; // 첫 읽기 전이거나 실패했다(실패 칸에 다시 시도 버튼이 있다), 또는 화면에 없다
    // 지금 사용자가 무언가를 하는 중인지. 요청 전과 응답 뒤에 두 번 본다(기다리는 사이 밀기를 시작할 수 있다, codex P2 11-26)
    const calm = () => {
      const active = document.activeElement;
      // 입력 칸을 만지는 중이거나, 키보드로 레일의 버튼에 초점을 둔 중이면(다시 그리면 초점이 사라진다, codex P2 11-26)
      const editing = !!active?.matches?.('input, select, textarea, :focus-visible') && (passesBox.contains(active) || laterBox.contains(active));
      const dragging = !!passesBox.querySelector('.dragging, .fly-right, .fly-left');
      return canRefresh({ hidden: document.hidden, busy, adding, dragging, editing });
    };
    if (refreshing || !calm()) return;
    const mine = ++seq;
    let r;
    refreshing = true;
    try {
      r = await store.tasks();
    } catch (e) {
      if (mine !== seq || busy || saveFailed) return;
      liveError = true;
      status.className = 'bp-status error';
      status.textContent = `새 할 일을 확인하지 못했어요 (${errorText(e)}). 잠시 뒤 다시 확인해요`;
      return;
    } finally {
      refreshing = false;
    }
    // 읽는 사이 저장이나 더 새로운 읽기가 있었거나, 화면을 떠났거나, 손을 대기 시작했으면 이 응답은 버린다
    if (mine !== seq || !passesBox.isConnected || !calm()) return;
    if (r.state === 'invalid') {
      if (saveFailed) return;
      liveError = true;
      status.className = 'bp-status error';
      status.textContent = `새 할 일 파일 형식이 맞지 않아요 (${r.error}). 지금 화면은 마지막으로 읽은 내용이에요`;
      return;
    }
    if (liveError) {
      liveError = false;
      status.className = 'bp-status';
      status.textContent = '';
    }
    if (!tasksChanged(sha, r.sha)) return;
    data = r.data;
    sha = r.sha;
    const left = passesBox.scrollLeft; // 넘겨 보던 자리를 지킨다
    draw();
    passesBox.scrollLeft = left;
  }
  // 화면에 한 번 붙은 뒤 떨어지면(다른 화면으로 가면) 10초 반복과 탭 전환 알림을 함께 치운다.
  // 첫 읽기가 실패했어도 치운다(data 와 무관하게, codex P2 11-26)
  let attached = false;
  const gone = () => {
    if (passesBox.isConnected) attached = true;
    if (!attached || passesBox.isConnected) return false;
    clearInterval(liveLoop);
    document.removeEventListener('visibilitychange', onVisible);
    return true;
  };
  const liveLoop = setInterval(() => {
    if (!gone()) void refresh();
  }, LIVE_MS);
  const onVisible = () => {
    if (!gone() && !document.hidden) void refresh();
  };
  document.addEventListener('visibilitychange', onVisible);
  // 상태판은 이 칸을 만든 바로 뒤 화면에 붙인다. 그 직후 붙었는지 기록해 둬야 첫 확인 전에 떠나도 치운다(codex P2 11-26)
  setTimeout(gone, 0);

  void load();
  const rail = h(
    'section',
    { class: 'bp-area', 'aria-label': '오늘 탑승할 주문' },
    // 시계 두 개(세계 시계처럼): 서울 지금(노랑), 퇴근까지(빨강, 퇴근 뒤 초록). 막대 7개 숫자, : 가 1초마다 깜빡인다(11-26 사용자 요청, clock.mjs)
    h('header', { class: 'bp-head' }, h('h2', null, '오늘 탑승할 주문'), count, h('span', { class: 'dc-pair' }, nowWorldClock(h), offWorkClock(h))),
    status,
    h('div', { class: 'bp-rail', 'aria-hidden': 'true' }),
    passesBox,
    h('p', { class: 'bp-hint' }, '폰에서는 오른쪽으로 밀면 탑승 완료, 왼쪽으로 밀면 나중에. 누르면 뒷면을 봐요'),
    toast
  );
  const side = h('div', { class: 'bp-side' }, h('section', { class: 'side-card' }, doneBox), h('section', { class: 'side-card' }, laterBox));
  return { rail, side };
}
