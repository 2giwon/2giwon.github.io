// 상태판 맨 앞 "오늘 할 일" 칸. 할 일 파일(personal-docs/todo/tasks.json)을 읽고, 추가, 완료, 옮기기, 단계 바꾸기를 저장한다.
// 계산은 todo.mjs, 저장(충돌 시 한 번 더)은 store.updateTasks 가 한다. 여기는 그리기와 버튼만.

import { h, skeleton, failure, empty, errorText } from '../dom.mjs';
import { today } from '../store.mjs';
import {
  todayView,
  addTask,
  completeTask,
  moveToToday,
  moveToLater,
  setStage,
  needsTicket,
  STAGES,
  STAGE_LABEL,
} from '../todo.mjs';

const REDMINE = 'https://redmine.wp-dev.xyz/issues/';

function saveErrorText(e) {
  if (e?.kind === 'forbidden') return '토큰에 쓰기 권한이 없습니다';
  if (e?.kind === 'conflict') return '다른 곳에서 동시에 고쳐 저장하지 못했습니다. 다시 시도해 주세요';
  if (e?.kind) return errorText(e);
  return String(e?.message ?? e);
}

export function todaySection(store) {
  const body = h('div', { class: 'today-body' }, skeleton(3));
  const status = h('p', { class: 'today-status', role: 'status' });
  const count = h('span', { class: 'badge muted' });
  let data = null;
  let busy = false;
  // 추가 칸에 쓰던 값. 화면을 다시 그려도(저장 실패 포함) 남아 있고, 추가가 성공했을 때만 비운다(codex P2 11-11)
  const draft = { title: '', stage: 'normal', when: 'today' };

  /** 저장. 끝나기 전까지 칸 안 버튼을 전부 끈다(두 번 눌러 두 번 저장되지 않게). 실패하면 화면은 그대로 둔다. */
  async function save(change, message, onSaved = () => {}) {
    if (busy) return;
    busy = true;
    status.className = 'today-status';
    status.textContent = '저장 중';
    for (const el of body.querySelectorAll('button, input, select')) el.disabled = true;
    try {
      const r = await store.updateTasks(change, message);
      data = r.data;
      status.textContent = '';
      onSaved();
    } catch (e) {
      status.className = 'today-status error';
      status.textContent = `저장하지 못했습니다 (${saveErrorText(e)})`;
    } finally {
      busy = false;
      draw();
    }
  }

  function taskRow({ task, carryDays }) {
    const stageSelect = h(
      'select',
      { class: 'today-stage', 'aria-label': `${task.title} 단계` },
      STAGES.map((s) => h('option', { value: s, selected: s === task.stage }, STAGE_LABEL[s]))
    );
    stageSelect.addEventListener('change', () =>
      void save((d) => setStage(d, task.id, stageSelect.value), `할 일 단계: ${task.title} → ${STAGE_LABEL[stageSelect.value]}`)
    );
    return h(
      'li',
      { class: `today-item stage-${task.stage}` },
      h('button', {
        type: 'button',
        class: 'today-check',
        'aria-label': `${task.title} 완료`,
        onclick: () => void save((d) => completeTask(d, task.id, today()), `할 일 완료: ${task.title}`),
      }),
      h(
        'div',
        { class: 'today-main' },
        h('span', { class: 'today-title' }, task.title),
        h(
          'div',
          { class: 'today-meta' },
          h('span', { class: `badge stage ${task.stage}` }, STAGE_LABEL[task.stage]),
          carryDays > 0 ? h('span', { class: 'badge warn' }, `${carryDays}일째`) : null,
          task.redmine !== null ? h('a', { class: 'badge ticket', href: `${REDMINE}${task.redmine}`, target: '_blank', rel: 'noopener' }, `#${task.redmine}`) : null,
          needsTicket(task) ? h('span', { class: 'badge risk' }, '티켓 없음') : null,
          task.due ? h('span', { class: 'today-due' }, `마감 ${task.due.slice(5)}`) : null,
          task.project ? h('span', { class: 'today-project' }, task.project) : null
        )
      ),
      h(
        'div',
        { class: 'today-actions' },
        stageSelect,
        h('button', { type: 'button', class: 'link', onclick: () => void save((d) => moveToLater(d, task.id), `할 일 나중에: ${task.title}`) }, '나중에')
      )
    );
  }

  function addForm() {
    const title = h('input', { type: 'text', class: 'today-input', placeholder: '할 일 추가', 'aria-label': '추가할 할 일', maxlength: '200' });
    title.value = draft.title;
    title.addEventListener('input', () => (draft.title = title.value));
    const stage = h('select', { 'aria-label': '추가할 할 일 단계' }, STAGES.map((s) => h('option', { value: s, selected: s === draft.stage }, STAGE_LABEL[s])));
    stage.addEventListener('change', () => (draft.stage = stage.value));
    const when = h(
      'select',
      { 'aria-label': '언제 할지' },
      h('option', { value: 'today', selected: draft.when === 'today' }, '오늘'),
      h('option', { value: 'later', selected: draft.when === 'later' }, '나중에')
    );
    when.addEventListener('change', () => (draft.when = when.value));
    const form = h('form', { class: 'today-add' }, title, stage, when, h('button', { type: 'submit', class: 'today-add-btn' }, '추가'));
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const t = title.value.trim();
      if (!t) return title.focus();
      const s = stage.value;
      const later = when.value === 'later';
      void save(
        (d) => addTask(d, { title: t, stage: s, doOn: later ? null : today() }, today()),
        `할 일 추가: ${t}`,
        () => Object.assign(draft, { title: '', stage: 'normal', when: 'today' })
      );
    });
    return form;
  }

  function draw() {
    const v = todayView(data.tasks, today());
    count.textContent = `${v.today.length}`;
    // replaceChildren 은 null 을 "null" 글자로 넣는다 → 빈 자리는 걸러 낸다(codex P3 11-11)
    const parts = [
      v.today.length ? h('ol', { class: 'today-list' }, v.today.map(taskRow)) : empty('오늘 할 일이 없습니다'),
      addForm(),
      v.doneToday.length
        ? h(
            'ul',
            { class: 'today-done' },
            v.doneToday.map((t) => h('li', null, h('span', { class: 'today-done-mark', 'aria-hidden': 'true' }, '✓'), t.title))
          )
        : null,
      h(
        'details',
        { class: 'today-later' },
        h('summary', null, `나중에 ${v.later.length}개`),
        v.later.length
          ? h(
              'ul',
              null,
              v.later.map((t) =>
                h(
                  'li',
                  null,
                  h('span', { class: 'today-later-title' }, t.title),
                  h('button', { type: 'button', class: 'link', onclick: () => void save((d) => moveToToday(d, t.id, today()), `할 일 오늘로: ${t.title}`) }, '오늘로')
                )
              )
            )
          : empty('나중에 할 일이 없습니다')
      ),
    ];
    body.replaceChildren(...parts.filter(Boolean));
  }

  async function load() {
    body.replaceChildren(skeleton(3));
    status.textContent = '';
    try {
      const r = await store.tasks();
      if (r.state === 'invalid') {
        count.textContent = '';
        body.replaceChildren(failure(`할 일 파일 형식이 맞지 않습니다 (${r.error})`, load));
        return;
      }
      data = r.data;
      draw();
      if (r.state === 'missing') body.prepend(empty('할 일 파일이 아직 없습니다. 첫 할 일을 추가하면 만들어집니다'));
    } catch (e) {
      count.textContent = '';
      body.replaceChildren(failure(`할 일을 읽지 못했습니다 (${errorText(e)})`, load));
    }
  }

  void load();
  return h('section', { class: 'group today' }, h('h2', null, '오늘 할 일', count), status, body);
}
