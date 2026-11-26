// 상태판 탑승권 레일(11-26 작업노트 국제공항). 예전 "오늘 할 일" 칸(today.mjs)을 대신한다.
// 할 일 파일(personal-docs/todo/tasks.json)을 읽고 추가, 완료, 나중에, 오늘로, 단계 바꾸기를 저장한다.
// 계산은 todo.mjs 와 airport.mjs, 저장(충돌 시 한 번 더)은 store.updateTasks 가 한다. 여기는 그리기와 손동작만.
// - 폰: 탑승권을 오른쪽으로 밀면 완료, 왼쪽으로 밀면 나중에. 누르면 뒷면(단계, Redmine, 메모)
// - PC: 같은 기능을 버튼으로. 실수에 대비해 5초 동안 "되돌리기"

import { h, skeleton, failure, empty, errorText } from '../dom.mjs';
import { today } from '../store.mjs';
import { todayView, addTask, completeTask, moveToToday, moveToLater, setStage, needsTicket, restoreTask, STAGES, STAGE_LABEL } from '../todo.mjs';
import { boardingPasses, PASS_LABEL } from '../airport.mjs';
import { LAB } from '../catalog.mjs';

const REDMINE = 'https://redmine.wp-dev.xyz/issues/';
const SWIPE_PX = 90;
const UNDO_MS = 5000;

function saveErrorText(e) {
  if (e?.kind === 'forbidden') return '토큰에 쓰기 권한이 없어요';
  if (e?.kind === 'conflict') return '다른 곳에서 동시에 고쳐 저장하지 못했어요. 다시 해 주세요';
  if (e?.kind) return errorText(e);
  return String(e?.message ?? e);
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
  const status = h('p', { class: 'bp-status', role: 'status' });
  const count = h('span', { class: 'bp-count' });
  const laterBox = h('div', { class: 'later-box' }, skeleton(3));
  const doneBox = h('div', { class: 'done-box' });
  const toast = h('div', { class: 'undo-toast', role: 'status', hidden: true });
  let data = null;
  let busy = false;
  let toastTimer = null;
  let flipped = null; // 뒷면을 보고 있는 할 일 id
  let adding = false;
  let queuedUndo = null; // 다른 저장 중에 누른 되돌리기. 저장이 끝나면 이어서 한다(codex P2 11-26)
  const stacked = () => typeof matchMedia === 'function' && matchMedia('(max-width: 759px)').matches;
  // 발권 칸에 쓰던 값. 다시 그려도(저장 실패 포함) 남아 있고, 발권이 성공했을 때만 비운다(codex P2 11-11)
  const draft = { title: '', stage: 'normal', when: 'today' };

  /** 저장. 끝나기 전까지 버튼을 끈다(두 번 눌러 두 번 저장되지 않게). 실패하면 화면은 그대로 두고 알린다. */
  async function save(change, message, onSaved = () => {}) {
    if (busy) return false;
    busy = true;
    status.className = 'bp-status saving';
    status.textContent = '저장 중';
    for (const el of [passesBox, laterBox].flatMap((b) => [...b.querySelectorAll('button, input, select')])) el.disabled = true;
    let ok = false;
    try {
      const r = await store.updateTasks(change, message);
      data = r.data;
      status.className = 'bp-status';
      status.textContent = '';
      onSaved();
      ok = true;
    } catch (e) {
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
      h('div', { class: 'bp-band' }, flap(p.code, p.status === 'boarding'), h('span', { class: 'bp-state' }, p.status === 'delayed' ? `${PASS_LABEL.delayed} ${p.carryDays}일째` : PASS_LABEL[p.status])),
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
      draw();
      if (r.state === 'missing') passesBox.prepend(empty('할 일 파일이 아직 없어요. 첫 탑승권을 발권하면 만들어져요'));
    } catch (e) {
      count.textContent = '';
      passesBox.replaceChildren(failure(`할 일을 읽지 못했어요 (${errorText(e)})`, () => void load()));
      laterBox.replaceChildren(h('h3', null, '나중에 탑승'), h('p', { class: 'side-empty' }, '할 일을 읽지 못했어요'));
      onChange({ loaded: true, passes: [] });
    }
  }

  void load();
  const now = new Date();
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const rail = h(
    'section',
    { class: 'bp-area', 'aria-label': '오늘 탑승할 주문' },
    h('header', { class: 'bp-head' }, h('h2', null, '오늘 탑승할 주문'), count, h('time', { class: 'bp-clock' }, clock)),
    status,
    h('div', { class: 'bp-rail', 'aria-hidden': 'true' }),
    passesBox,
    h('p', { class: 'bp-hint' }, '폰에서는 오른쪽으로 밀면 탑승 완료, 왼쪽으로 밀면 나중에. 누르면 뒷면을 봐요'),
    toast
  );
  const side = h('div', { class: 'bp-side' }, h('section', { class: 'side-card' }, doneBox), h('section', { class: 'side-card' }, laterBox));
  return { rail, side };
}
