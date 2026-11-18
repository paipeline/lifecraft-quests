/* Shared calendar rules. All dates are civil dates in the browser time zone. */
(function (root) {
  'use strict';
  const DAY_START = 9 * 60;
  const DAY_END = 19 * 60;
  const CATEGORIES = ['work', 'life', 'study'];
  const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  function today(now = new Date()) {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  }
  function addDays(day, amount) {
    const date = new Date(day + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  }
  function monday(day) {
    return addDays(day, -((new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7));
  }
  function isDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
  }
  function minutes(time) {
    if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
    return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  }
  function clock(value) {
    return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
  }
  function duration(value) {
    const hours = Math.floor(value / 60), rest = value % 60;
    return hours ? `${hours} 小时${rest ? ` ${rest} 分` : ''}` : `${rest} 分钟`;
  }
  function scheduled(task) { return minutes(task.start) !== null && minutes(task.end) !== null; }
  function intervals(tasks, day) {
    const ordered = tasks.filter(t => t.date === day && scheduled(t))
      .map(t => [Math.max(DAY_START, minutes(t.start)), Math.min(DAY_END, minutes(t.end))])
      .filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [a, b] of ordered) {
      const last = merged[merged.length - 1];
      if (last && a <= last[1]) last[1] = Math.max(last[1], b);
      else merged.push([a, b]);
    }
    return merged;
  }
  function freeSlots(tasks, day) {
    const slots = [];
    let cursor = DAY_START;
    for (const [a, b] of intervals(tasks, day)) {
      if (a > cursor) slots.push([cursor, a]);
      cursor = b;
    }
    if (cursor < DAY_END) slots.push([cursor, DAY_END]);
    return slots;
  }
  function stats(tasks, day) {
    const daily = tasks.filter(t => t.date === day);
    const busy = intervals(tasks, day).reduce((sum, [a, b]) => sum + b - a, 0);
    return { busy, free: DAY_END - DAY_START - busy, total: daily.length, done: daily.filter(t => t.done).length };
  }
  function conflict(tasks, candidate) {
    if (!scheduled(candidate)) return null;
    return tasks.find(t => t.id !== candidate.id && t.date === candidate.date && scheduled(t) && minutes(candidate.start) < minutes(t.end) && minutes(candidate.end) > minutes(t.start)) || null;
  }
  function overdue(task, now = new Date()) {
    if (!task.due || task.done) return false;
    const date = today(now);
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
    return task.due < date || (task.due === date && !!task.dueTime && task.dueTime < time);
  }
  function validateTask(task) {
    if (!task || typeof task.id !== 'string' || !task.id || task.id.length > 160) return '任务标识无效';
    if (typeof task.title !== 'string' || !task.title.trim() || task.title.length > 160) return '请填写 1 至 160 字的待办名称';
    if (!isDate(task.date)) return '请选择有效的计划日期';
    if (!CATEGORIES.includes(task.category)) return '请选择工作、生活或学习';
    if (typeof task.done !== 'boolean' || typeof task.proposed !== 'boolean') return '任务状态无效';
    if (!!task.start !== !!task.end) return '请同时填写开始和结束时间，或同时留空';
    if (task.start && (minutes(task.start) === null || minutes(task.end) === null || minutes(task.end) <= minutes(task.start))) return '结束时间须晚于开始时间，跨日事项请分开安排';
    if (task.due && !isDate(task.due)) return '截止日期无效';
    if (task.dueTime && (!task.due || minutes(task.dueTime) === null)) return '填写截止时间前，请先选择截止日期';
    if (!Number.isInteger(task.estimate) || task.estimate < 5 || task.estimate > 600) return '预计用时须为 5 至 600 分钟';
    if (task.notes != null && (typeof task.notes !== 'string' || task.notes.length > 4000)) return '备注最多 4000 字';
    if (task.source != null && (typeof task.source !== 'string' || task.source.length > 2000)) return '来源链接无效';
    return '';
  }
  function parseBackup(text) {
    const data = JSON.parse(text);
    if (data?.version !== 1 || !Array.isArray(data.tasks) || data.tasks.length > 5000) throw new Error('请选择 Life 日历导出的 v1 JSON 备份');
    const ids = new Set();
    for (const task of data.tasks) {
      const error = validateTask(task);
      if (error) throw new Error(error);
      if (ids.has(task.id)) throw new Error('备份里存在重复的任务标识');
      ids.add(task.id);
    }
    return { version: 1, tasks: data.tasks };
  }
  const api = { DAY_START, DAY_END, CATEGORIES, ZONE, today, addDays, monday, isDate, minutes, clock, duration, scheduled, intervals, freeSlots, stats, conflict, overdue, validateTask, parseBackup };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LifeCalendar = api;
})(typeof window === 'undefined' ? globalThis : window);
