(function () {
  'use strict';
  const M = window.LifeCalendar;
  const KEY = 'lifecraft-public-tasks-v1';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const dateFormat = (day, options) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', ...options }).format(new Date(day + 'T12:00:00Z'));
  const categoryNames = { work: '工作', life: '生活', study: '学习' };
  let selected = M.today();
  let month = selected.slice(0, 7) + '-01';
  let view = matchMedia('(max-width:760px)').matches ? 'day' : 'week';
  let categories = new Set(M.CATEGORIES);
  let search = '';
  let editingId = null;
  let draggingId = null;
  let undoAction = null;
  let toastTimer;
  let originalCorrupt = null;
  let storageBlocked = false;
  let data = load();

  function warn(message) {
    $('#storage-warning').textContent = message;
    $('#storage-warning').hidden = false;
    $('#save-status').textContent = '尚未保存，请导出备份';
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? M.parseBackup(raw) : { version: 1, tasks: structuredClone(window.LIFE_CALENDAR_SEED) };
    } catch (error) {
      storageBlocked = true;
      try { originalCorrupt = localStorage.getItem(KEY); } catch { /* Browser access is unavailable. */ }
      warn('无法读取原有记录，已显示初始清单，暂不覆盖存储。请从「数据与来源」导出原始记录，再导入有效备份。');
      return { version: 1, tasks: structuredClone(window.LIFE_CALENDAR_SEED) };
    }
  }
  function save() {
    if (storageBlocked) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      $('#save-status').innerHTML = '<span></span>保存在此浏览器';
      $('#storage-warning').hidden = true;
    } catch {
      warn('浏览器未能保存。当前修改仍在页面里，请导出备份，避免刷新后丢失。');
    }
  }
  function visible(task) {
    return categories.has(task.category) && (!search || `${task.title} ${task.notes}`.toLocaleLowerCase().includes(search));
  }
  function shownDays() {
    return view === 'day' ? [selected] : Array.from({ length: 7 }, (_, i) => M.addDays(M.monday(selected), i));
  }
  function selectDay(day) {
    selected = day;
    month = day.slice(0, 7) + '-01';
    render();
    closeNav();
  }
  function renderOverview() {
    const stat = M.stats(data.tasks, selected);
    const items = [
      ['calendar-blank', '今日概览', dateFormat(selected, { month: 'long', day: 'numeric' }), 'default', dateFormat(selected, { weekday: 'short' })],
      ['clock', '已安排', M.duration(stat.busy), 'blue', '时段占用'],
      ['plus', '可安排时间', M.duration(stat.free), 'free', '09:00 至 19:00'],
      ['check', '已完成', `${stat.done} / ${stat.total}`, 'green', '项待办'],
    ];
    $('#overview').innerHTML = items.map(([symbol, label, value, color, detail]) => `<div class="overview-item ${color}"><span class="overview-icon">${icon(symbol)}</span><div><div class="overview-label caption-5">${label}</div><div class="overview-value title-2">${value}<small>${detail}</small></div></div></div>`).join('');
    $('#overview').setAttribute('aria-label', `${selected}：已安排 ${M.duration(stat.busy)}，可安排 ${M.duration(stat.free)}，完成 ${stat.done} 项，共 ${stat.total} 项`);
    for (const category of M.CATEGORIES) $(`[data-category-count="${category}"]`).textContent = data.tasks.filter(t => t.category === category && !t.done).length;
  }
  function renderMonth() {
    $('#mini-title').textContent = dateFormat(month, { year: 'numeric', month: 'long' });
    const first = M.monday(month);
    const week = M.monday(selected);
    const today = M.today();
    $('#mini-days').innerHTML = Array.from({ length: 42 }, (_, i) => {
      const day = M.addDays(first, i);
      const due = data.tasks.some(t => t.due === day && !t.done);
      const classes = [day.slice(0, 7) !== month.slice(0, 7) ? 'outside' : '', M.monday(day) === week ? 'in-week' : '', day === selected ? 'selected' : '', day === today ? 'is-today' : '', due ? 'has-deadline' : ''].join(' ');
      return `<button class="${classes}" data-select-day="${day}" aria-label="${day}${due ? '，有到期事项' : ''}" aria-pressed="${day === selected}"${day === today ? ' aria-current="date"' : ''}>${Number(day.slice(8))}</button>`;
    }).join('');
  }
  function allDayItems(day) {
    return data.tasks.filter(t => visible(t) && ((t.due === day && !t.done) || (t.date === day && !M.scheduled(t))));
  }
  function eventPositions(tasks) {
    // Imported schedules may overlap. Give each connected group separate lanes.
    const result = new Map();
    const ordered = [...tasks].sort((a, b) => M.minutes(a.start) - M.minutes(b.start));
    let group = [], end = -1;
    function finish() {
      const lanes = [];
      for (const task of group) {
        let lane = lanes.findIndex(until => until <= M.minutes(task.start));
        if (lane < 0) lane = lanes.length;
        lanes[lane] = M.minutes(task.end);
        result.set(task.id, { lane, count: 0 });
      }
      for (const task of group) result.get(task.id).count = lanes.length;
    }
    for (const task of ordered) {
      if (M.minutes(task.start) >= end) { finish(); group = []; end = -1; }
      group.push(task);
      end = Math.max(end, M.minutes(task.end));
    }
    finish();
    return result;
  }
  function renderEvent(task, position) {
    const start = Math.max(M.DAY_START, M.minutes(task.start));
    const end = Math.min(M.DAY_END, M.minutes(task.end));
    if (end <= start) return '';
    const span = end - start;
    const due = !task.done && (task.due === task.date || M.overdue(task));
    const classes = ['event', task.done ? 'done' : due ? 'due' : '', task.proposed ? 'proposed' : '', span < 45 ? 'compact' : '', span < 25 ? 'tiny' : ''].join(' ');
    const lane = position || { lane: 0, count: 1 };
    const style = `top:calc(var(--hour)*${(start - M.DAY_START) / 60});height:calc(var(--hour)*${span / 60} - 4px);left:calc(${100 * lane.lane / lane.count}% + 4px);right:calc(${100 * (lane.count - lane.lane - 1) / lane.count}% + 4px)`;
    return `<button class="${classes}" data-edit="${escape(task.id)}" draggable="true" style="${style}" aria-label="${escape(task.title)}，${task.start} 至 ${task.end}，${task.done ? '已完成' : task.proposed ? '建议安排' : '已安排'}"><span class="event-time">${task.start} – ${task.end}</span><strong class="event-title">${escape(task.title)}</strong><span class="event-meta">${task.done ? '✓ 已完成' : due ? '截止事项' : `${categoryNames[task.category]}${task.proposed ? ' · 建议' : ''}`}</span></button>`;
  }
  function renderCalendar() {
    const days = shownDays();
    const today = M.today();
    $('#calendar-content').style.setProperty('--days', days.length);
    $('#calendar-content').classList.toggle('day-view', view === 'day');
    const start = days[0], end = days.at(-1);
    $('#timeline-heading').textContent = view === 'day' ? dateFormat(selected, { year: 'numeric', month: 'long', day: 'numeric' }) : start.slice(0, 7) === end.slice(0, 7) ? `${dateFormat(start, { year: 'numeric', month: 'long' })} ${Number(start.slice(8))} 至 ${Number(end.slice(8))} 日` : `${dateFormat(start, { month: 'numeric', day: 'numeric' })} 至 ${dateFormat(end, { month: 'numeric', day: 'numeric' })}`;
    for (const button of $$('[data-view]')) button.setAttribute('aria-pressed', button.dataset.view === view);
    $('#range-prev').setAttribute('aria-label', view === 'day' ? '前一天' : '上一周');
    $('#range-next').setAttribute('aria-label', view === 'day' ? '后一天' : '下一周');
    $('#week-header').innerHTML = '<span class="zone-label">GMT+1</span>' + days.map(day => {
      const count = data.tasks.filter(t => t.date === day && visible(t)).length;
      return `<button class="day-heading ${day === selected ? 'selected' : ''} ${day === today ? 'is-today' : ''} ${new Date(day + 'T12:00Z').getUTCDay() % 6 === 0 ? 'weekend' : ''}" data-select-day="${day}" aria-label="选择 ${day}" aria-pressed="${day === selected}"><span class="caption-5">${day === today ? '今天' : dateFormat(day, { weekday: 'short' })}</span><strong class="day-number">${Number(day.slice(8))}</strong>${count ? `<span class="day-count">${count}</span>` : ''}</button>`;
    }).join('');
    // Derive the local offset for the viewed date, including daylight-saving time.
    const zone = new Intl.DateTimeFormat('en', { timeZone: M.ZONE, timeZoneName: 'shortOffset' }).formatToParts(new Date(selected + 'T12:00Z')).find(part => part.type === 'timeZoneName');
    $('.zone-label').textContent = zone.value;
    $('#all-day-row').innerHTML = '<span class="all-day-label">全天</span>' + days.map(day => {
      const tasks = allDayItems(day);
      return `<div class="all-day-cell ${day === selected ? 'selected' : ''}">${tasks.slice(0, 2).map(task => `<button class="all-day-pill ${task.done ? 'done' : task.due === day ? 'due' : ''}" data-edit="${escape(task.id)}" title="${escape(task.title)}">${task.done ? '✓ ' : task.due === day ? '截止 · ' : ''}${escape(task.title)}</button>`).join('')}${tasks.length > 2 ? `<button class="all-day-pill" data-select-day="${day}">另 ${tasks.length - 2} 项待办</button>` : tasks.length ? '' : '<span class="all-day-empty">·</span>'}</div>`;
    }).join('');
    $('#time-grid').innerHTML = `<div class="time-labels">${Array.from({ length: 11 }, (_, i) => `<span class="time-label" style="top:calc(var(--hour)*${i})">${M.clock(M.DAY_START + i * 60)}</span>`).join('')}</div>` + days.map(day => {
      const tasks = data.tasks.filter(t => t.date === day && M.scheduled(t) && visible(t));
      const positions = eventPositions(tasks);
      const slots = $('#show-free').checked ? M.freeSlots(data.tasks, day).map(([a, b]) => `<button class="free-slot ${b - a < 45 ? 'short' : ''}" data-free-date="${day}" data-free-start="${a}" data-free-end="${b}" style="top:calc(var(--hour)*${(a - M.DAY_START) / 60});height:calc(var(--hour)*${(b - a) / 60} - 4px)" aria-label="${day} 可安排 ${M.clock(a)} 至 ${M.clock(b)}，${M.duration(b - a)}"><span class="free-label">${view === 'day' ? '+ ' : ''}空闲 ${M.duration(b - a)}</span><span class="free-time">${M.clock(a)} – ${M.clock(b)}</span></button>`).join('') : '';
      return `<div class="day-column ${day === selected ? 'selected' : ''} ${new Date(day + 'T12:00Z').getUTCDay() % 6 === 0 ? 'weekend' : ''}" data-column="${day}" aria-label="${day} 时间线">${'<div class="hour-line"></div>'.repeat(10)}${slots}${tasks.map(task => renderEvent(task, positions.get(task.id))).join('')}</div>`;
    }).join('');
    const offHours = data.tasks.filter(t => days.includes(t.date) && M.scheduled(t) && visible(t) && (M.minutes(t.start) < M.DAY_START || M.minutes(t.end) > M.DAY_END));
    $('.off-hours')?.remove();
    if (offHours.length) $('#calendar-content').insertAdjacentHTML('beforeend', `<div class="off-hours caption-5"><strong>09:00 至 19:00 之外的安排</strong>${offHours.map(t => `<button data-edit="${escape(t.id)}">${t.date.slice(5)} ${t.start} 至 ${t.end} · ${escape(t.title)}</button>`).join('')}</div>`);
    $('#calendar-hint').textContent = search || categories.size < 3 ? '空闲仍按全部安排计算' : '点击空白处安排时间';
    renderNow();
  }
  function renderNow() {
    $$('.now-line').forEach(line => line.remove());
    const column = $(`[data-column="${M.today()}"]`);
    if (!column) return;
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: M.ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    const minute = M.minutes(time);
    if (minute >= M.DAY_START && minute < M.DAY_END) column.insertAdjacentHTML('beforeend', `<div class="now-line" style="top:calc(var(--hour)*${(minute - M.DAY_START) / 60})" aria-label="现在 ${time}"></div>`);
  }
  function todoRow(task) {
    return `<article class="todo-row ${task.done ? 'done' : ''}"><button class="todo-check" data-complete="${escape(task.id)}" aria-label="${task.done ? '恢复待办' : '标记完成'}：${escape(task.title)}" aria-pressed="${task.done}">${task.done ? icon('check') : ''}</button><button class="todo-main" data-edit="${escape(task.id)}"><span class="todo-title">${escape(task.title)}</span><span class="todo-metadata">${M.scheduled(task) ? `${task.start} – ${task.end}` : task.done ? `已完成 · 未记时段` : `预计 ${M.duration(task.estimate)}`}<span class="separator">·</span>${categoryNames[task.category]}${task.proposed && !task.done ? '<span class="separator">·</span>建议' : ''}${task.due ? `<span class="due-label">${M.overdue(task) ? '已逾期 · ' : '截止 '}${task.due.slice(5)}${task.dueTime ? ' ' + task.dueTime : ''}</span>` : ''}</span></button>${!M.scheduled(task) && !task.done ? `<button class="schedule-button" data-edit="${escape(task.id)}">安排</button>` : ''}</article>`;
  }
  function renderDay() {
    const stat = M.stats(data.tasks, selected);
    $('#selected-weekday').textContent = `${selected === M.today() ? 'TODAY · ' : ''}${dateFormat(selected, { weekday: 'long' })}`;
    $('#day-title').textContent = `${dateFormat(selected, { month: 'long', day: 'numeric' })}的待办`;
    $('#day-progress').textContent = `${stat.done} / ${stat.total} 完成`;
    $('#day-progress-bar').style.width = `${stat.total ? stat.done / stat.total * 100 : 0}%`;
    const tasks = data.tasks.filter(t => t.date === selected && visible(t));
    const groups = [
      ['已安排', tasks.filter(t => !t.done && M.scheduled(t)).sort((a, b) => a.start.localeCompare(b.start))],
      ['待安排', tasks.filter(t => !t.done && !M.scheduled(t))],
      ['已完成', tasks.filter(t => t.done)],
    ];
    $('#day-tasks').innerHTML = groups.filter(([, list]) => list.length).map(([name, list]) => `<section class="day-group"><div class="section-heading"><h3 class="caption-4">${name}</h3><span class="caption-5">${list.length}</span></div>${list.map(todoRow).join('')}</section>`).join('') || `<div class="empty-state">${icon('calendar-blank')}<strong class="title-4">${search || categories.size < 3 ? '没有匹配的待办' : '这一天，留一点余地。'}</strong><p class="caption-5">${search || categories.size < 3 ? '调整搜索或重新勾选分类。' : '记下想做的事，再安排一个合适的时间。'}</p><button class="secondary-button button-Xsm" data-new>新建一项待办</button></div>`;
    const deadlines = data.tasks.filter(t => t.due && !t.done && visible(t)).sort((a, b) => (a.due + a.dueTime).localeCompare(b.due + b.dueTime)).slice(0, 3);
    $('#upcoming-deadlines').innerHTML = deadlines.map(task => `<button class="deadline-card" data-deadline="${escape(task.id)}" aria-label="查看 ${escape(task.title)}，${task.due} 截止"><span class="deadline-date"><small>${Number(task.due.slice(5, 7))}月</small><strong>${Number(task.due.slice(8))}</strong></span><span class="deadline-copy"><strong>${escape(task.title)}</strong><span>${M.overdue(task) ? '已逾期' : task.due === M.today() ? '今天截止' : dateFormat(task.due, { weekday: 'long' })}${task.dueTime ? ' · ' + task.dueTime : ''}</span></span></button>`).join('') || '<p class="deadline-empty caption-5">暂时没有待完成的截止事项。</p>';
  }
  function render() {
    renderOverview(); renderMonth(); renderCalendar(); renderDay();
    window.dispatchEvent(new CustomEvent('life:change'));
  }
  function sourceURL(source) {
    if (!source) return null;
    try {
      const url = new URL(source, location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  }
  function openEditor(id = null, initial = {}) {
    editingId = id;
    const task = id ? data.tasks.find(t => t.id === id) : { title: '', date: selected, start: '', end: '', due: '', dueTime: '', category: 'work', estimate: 60, notes: '', proposed: false, done: false, ...initial };
    if (!task) return;
    $('#task-dialog-title').textContent = id ? '把这件事安排好' : '新建待办';
    for (const [field, property] of Object.entries({ title: 'title', date: 'date', start: 'start', end: 'end', due: 'due', 'due-time': 'dueTime', category: 'category', estimate: 'estimate', notes: 'notes' })) $(`#task-${field}`).value = task[property] || '';
    $('#task-proposed').checked = task.proposed;
    $('#task-done').checked = task.done;
    const source = sourceURL(task.source);
    $('#task-source').hidden = !source;
    if (source) $('#task-source').href = source;
    else $('#task-source').removeAttribute('href');
    $('#delete-task').hidden = !id;
    $('#form-error').hidden = true;
    closeNav();
    $('#task-dialog').showModal();
    $('#task-title').focus();
  }
  function notify(message, undo = null) {
    clearTimeout(toastTimer);
    undoAction = undo;
    $('#toast-text').textContent = message;
    $('#undo').hidden = !undo;
    $('#toast').hidden = false;
    toastTimer = setTimeout(() => { $('#toast').hidden = true; undoAction = null; }, undo ? 12000 : 6000);
  }
  function commit(message, undo) { save(); render(); notify(message, undo); }
  function saveForm(event) {
    event.preventDefault();
    const existing = editingId && data.tasks.find(t => t.id === editingId);
    const task = { source: '', ...existing, id: editingId || 'task-' + crypto.randomUUID(), title: $('#task-title').value.trim(), date: $('#task-date').value, start: $('#task-start').value, end: $('#task-end').value, due: $('#task-due').value, dueTime: $('#task-due-time').value, category: $('#task-category').value, estimate: Number($('#task-estimate').value), notes: $('#task-notes').value.trim(), proposed: $('#task-proposed').checked, done: $('#task-done').checked };
    const overlap = M.conflict(data.tasks, task);
    const error = M.validateTask(task) || (overlap && `与「${overlap.title}」的 ${overlap.start} 至 ${overlap.end} 重叠，请调整时间。`);
    if (error) { $('#form-error').textContent = error; $('#form-error').hidden = false; return; }
    if (existing) data.tasks = data.tasks.map(t => t.id === task.id ? task : t);
    else data.tasks.push(task);
    selected = task.date;
    month = selected.slice(0, 7) + '-01';
    $('#task-dialog').close();
    commit(existing ? '待办与时间已更新' : '已记下一项待办');
  }
  function toggleComplete(id) {
    const task = data.tasks.find(t => t.id === id);
    if (!task) return;
    task.done = !task.done;
    const previous = !task.done;
    commit(task.done ? '已完成一件事，给自己留一点余地。' : '已恢复为待办', () => {
      const current = data.tasks.find(t => t.id === id);
      if (current) current.done = previous;
      save(); render();
    });
  }
  function download(contents, filename) {
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportData() {
    const game = window.LifeGame?.getState();
    if (originalCorrupt) {
      download(JSON.stringify({ ...data, game, originalRecord: originalCorrupt, exportedAt: new Date().toISOString(), timezone: M.ZONE }, null, 2), `life-calendar-recovery-${M.today()}.json`);
      notify('已导出当前页面备份，文件中同时保留了原始记录');
    } else {
      download(JSON.stringify({ ...data, game, exportedAt: new Date().toISOString(), timezone: M.ZONE }, null, 2), `lifecraft-${M.today()}.json`);
      notify('日历备份已导出');
    }
  }
  async function importData(file) {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('备份超过 5 MB，请选择有效的日历备份');
      const raw = await file.text();
      const imported = M.parseBackup(raw);
      const game = JSON.parse(raw).game;
      if (game !== undefined) window.LifeGameModel.parse(game);
      download(originalCorrupt || JSON.stringify({ ...data, game: window.LifeGame?.getState() }, null, 2), `life-calendar-before-import-${M.today()}.json`);
      data = imported; originalCorrupt = null; storageBlocked = false;
      if (game !== undefined) window.LifeGame?.setState(game);
      $('#data-message').textContent = '';
      commit(`已导入 ${data.tasks.length} 项待办；导入前记录已下载备份`);
    } catch (error) {
      $('#data-message').textContent = `导入失败：${error.message}。现有记录已保留。`;
    }
    $('#import-file').value = '';
  }
  function closeNav() { $('#sidebar').classList.remove('open'); $('#mobile-shade').hidden = true; $('#mobile-menu').setAttribute('aria-expanded', 'false'); if (matchMedia('(max-width:760px)').matches) $('#sidebar').inert = true; }
  function openSearch() { $('#search-bar').hidden = false; closeNav(); $('#search').focus(); }
  function openData() { $('#data-message').textContent = ''; $('#data-dialog').showModal(); }
  function moveMonth(amount) {
    const date = new Date(month + 'T12:00Z');
    date.setUTCMonth(date.getUTCMonth() + amount);
    month = date.toISOString().slice(0, 10);
    renderMonth();
  }
  function dropTime(event, column) {
    const height = parseFloat(getComputedStyle(column).height);
    const minute = M.DAY_START + Math.round((event.clientY - column.getBoundingClientRect().top) / height * (M.DAY_END - M.DAY_START) / 15) * 15;
    return Math.max(M.DAY_START, Math.min(M.DAY_END - 15, minute));
  }

  document.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.edit) openEditor(target.dataset.edit);
    else if (target.dataset.complete) toggleComplete(target.dataset.complete);
    else if (target.dataset.selectDay) selectDay(target.dataset.selectDay);
    else if (target.hasAttribute('data-new')) openEditor();
    else if (target.dataset.deadline) {
      const task = data.tasks.find(t => t.id === target.dataset.deadline);
      selectDay(task.due);
      notify('已跳到截止日期；点击红色事项查看详情');
    } else if (target.dataset.freeDate) {
      const gapStart = Number(target.dataset.freeStart), gapEnd = Number(target.dataset.freeEnd);
      const column = target.closest('[data-column]');
      const start = event.detail && column ? Math.max(gapStart, Math.min(gapEnd - 15, dropTime(event, column))) : gapStart;
      const end = Math.min(start + 60, gapEnd);
      openEditor(null, { date: target.dataset.freeDate, start: M.clock(start), end: M.clock(end), estimate: end - start });
    } else if (target.dataset.view) { view = target.dataset.view; renderCalendar(); }
    else if (target.dataset.close) $('#' + target.dataset.close).close();
  });
  $('#task-form').addEventListener('submit', saveForm);
  $('#add-task').addEventListener('click', () => openEditor());
  $('#go-today').addEventListener('click', () => selectDay(M.today()));
  $('#mini-prev').addEventListener('click', () => moveMonth(-1));
  $('#mini-next').addEventListener('click', () => moveMonth(1));
  $('#range-prev').addEventListener('click', () => selectDay(M.addDays(selected, view === 'day' ? -1 : -7)));
  $('#range-next').addEventListener('click', () => selectDay(M.addDays(selected, view === 'day' ? 1 : 7)));
  $('#show-free').addEventListener('change', renderCalendar);
  $$('.filter-row input').forEach(input => input.addEventListener('change', () => { if (input.checked) categories.add(input.value); else categories.delete(input.value); render(); }));
  $('#search-launch').addEventListener('click', openSearch);
  $('#search-close').addEventListener('click', () => { $('#search-bar').hidden = true; $('#search').value = ''; search = ''; render(); $('#search-launch').focus(); });
  $('#search').addEventListener('input', () => { search = $('#search').value.trim().toLocaleLowerCase(); renderCalendar(); renderDay(); });
  $('#backup-open').addEventListener('click', openData);
  $('#data-info').addEventListener('click', openData);
  $('#export-top').addEventListener('click', exportData);
  $('#export-data').addEventListener('click', exportData);
  $('#import-data').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', () => importData($('#import-file').files[0]));
  $('#delete-task').addEventListener('click', () => {
    const index = data.tasks.findIndex(t => t.id === editingId);
    if (index < 0) return;
    const [removed] = data.tasks.splice(index, 1);
    $('#task-dialog').close();
    commit('已删除待办', () => { data.tasks.splice(index, 0, removed); save(); render(); });
  });
  $('#undo').addEventListener('click', () => { if (undoAction) undoAction(); undoAction = null; $('#toast').hidden = true; });
  $('#toast-close').addEventListener('click', () => { $('#toast').hidden = true; undoAction = null; });
  $('#mobile-menu').addEventListener('click', () => {
    const open = !$('#sidebar').classList.contains('open');
    $('#sidebar').classList.toggle('open', open); $('#sidebar').inert = !open;
    $('#mobile-shade').hidden = !open; $('#mobile-menu').setAttribute('aria-expanded', open);
    if (open) $('#search-launch').focus();
  });
  $('#mobile-shade').addEventListener('click', closeNav);
  matchMedia('(max-width:760px)').addEventListener('change', event => { $('#sidebar').inert = event.matches && !$('#sidebar').classList.contains('open'); });
  closeNav();
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
    if (event.key === 'Escape') { closeNav(); if (!$('#search-bar').hidden && !document.querySelector('dialog[open]')) $('#search-close').click(); }
  });
  $('#time-grid').addEventListener('click', event => {
    if (event.target.closest('button')) return;
    const column = event.target.closest('[data-column]');
    if (!column) return;
    const start = dropTime(event, column);
    openEditor(null, { date: column.dataset.column, start: M.clock(start), end: M.clock(Math.min(M.DAY_END, start + 60)) });
  });
  $('#time-grid').addEventListener('dragstart', event => {
    const block = event.target.closest('[data-edit]');
    if (!block) return;
    draggingId = block.dataset.edit;
    block.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggingId);
  });
  $('#time-grid').addEventListener('dragover', event => {
    const column = event.target.closest('[data-column]');
    if (!column || !draggingId) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'move';
    $$('.drop-marker').forEach(marker => marker.remove());
    column.insertAdjacentHTML('beforeend', `<div class="drop-marker" style="top:calc(var(--hour)*${(dropTime(event, column) - M.DAY_START) / 60})"></div>`);
  });
  $('#time-grid').addEventListener('drop', event => {
    const column = event.target.closest('[data-column]');
    if (!column || !draggingId) return;
    event.preventDefault();
    const task = data.tasks.find(t => t.id === draggingId);
    if (!task) return;
    const length = M.minutes(task.end) - M.minutes(task.start);
    const start = dropTime(event, column);
    const candidate = { ...task, date: column.dataset.column, start: M.clock(start), end: M.clock(start + length) };
    const overlap = M.conflict(data.tasks, candidate);
    if (start + length > M.DAY_END || overlap) { renderCalendar(); notify(overlap ? `与「${overlap.title}」重叠，请换一个时段` : '此时段不够长，请选择更早的时间'); return; }
    const before = { ...task };
    Object.assign(task, candidate);
    selected = candidate.date; month = selected.slice(0, 7) + '-01';
    commit(`已移到 ${candidate.date.slice(5)} ${candidate.start}`, () => { const current = data.tasks.find(t => t.id === before.id); if (current) Object.assign(current, before); save(); render(); });
  });
  document.addEventListener('dragend', () => { draggingId = null; $$('.dragging').forEach(block => block.classList.remove('dragging')); $$('.drop-marker').forEach(marker => marker.remove()); });
  window.addEventListener('storage', event => {
    if (event.key !== KEY || !event.newValue) return;
    try { data = M.parseBackup(event.newValue); storageBlocked = false; originalCorrupt = null; render(); notify('已同步另一个标签页的修改'); } catch { warn('另一标签页写入的记录无效，当前页面内容已保留。'); }
  });
  setInterval(() => { if (M.today() !== selected && selected === lastToday) { selected = M.today(); month = selected.slice(0, 7) + '-01'; render(); } else renderNow(); lastToday = M.today(); }, 60000);
  let lastToday = M.today();
  window.LifeApp = {
    getTasks: () => structuredClone(data.tasks),
    getDate: () => selected,
    selectDay, openEditor, exportData, openData,
    setDone(id, done) {
      const task = data.tasks.find(t => t.id === id);
      if (!task) return false;
      if (task.done !== done) { task.done = done; save(); render(); }
      return true;
    },
  };
  render();
})();
