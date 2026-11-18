process.env.TZ = 'UTC';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const M = require('../site/calendar-model.js');
const date = '2030-05-08';
const task = (id, start, end, extra = {}) => ({ id, title: '测试事项', date, category: 'work', start, end, due: '', dueTime: '', estimate: 60, proposed: false, done: false, ...extra });

test('空闲按重叠时段并集扣除，已完成仍占用原安排', () => {
  const tasks = [task('a', '09:00', '11:00'), task('b', '10:00', '12:00', { done: true }), task('c', '14:00', '15:00')];
  assert.deepEqual(M.freeSlots(tasks, date), [[720, 840], [900, 1140]]);
  assert.deepEqual(M.stats(tasks, date), { busy: 240, free: 360, total: 3, done: 1 });
});
test('工作范围外的安排仅扣除相交部分；无时段完成记录不占时间', () => {
  const tasks = [task('early', '07:00', '09:30'), task('late', '18:00', '22:00'), task('done', '', '', { done: true })];
  assert.deepEqual(M.freeSlots(tasks, date), [[570, 1080]]);
  assert.equal(M.stats(tasks, date).busy, 90);
  assert.equal(M.stats(tasks, date).done, 1);
  assert.deepEqual(M.freeSlots([], date), [[540, 1140]]);
  assert.deepEqual(M.freeSlots([task('full', '00:00', '23:59')], date), []);
});
test('相邻时段不冲突，跨日不冲突，自身编辑不冲突', () => {
  const tasks = [task('a', '09:00', '10:00')];
  assert.equal(M.conflict(tasks, task('b', '10:00', '11:00')), null);
  assert.equal(M.conflict(tasks, task('b', '09:30', '10:30')).id, 'a');
  assert.equal(M.conflict(tasks, task('a', '09:30', '10:30')), null);
  assert.equal(M.conflict(tasks, task('b', '09:00', '10:00', { date: '2030-05-09' })), null);
});
test('浏览器时区的自然日期与跨年日历运算', () => {
  assert.equal(M.today(new Date('2030-05-08T00:30:00Z')), date);
  assert.equal(M.today(new Date('2026-07-01T22:30:00Z')), '2026-07-01');
  assert.equal(M.monday('2027-01-01'), '2026-12-28');
  assert.equal(M.addDays('2026-03-29', 1), '2026-03-30');
  assert.equal(M.isDate('2026-02-30'), false);
});
test('到期与逾期按浏览器时区判断，完成项不再逾期', () => {
  const due = task('a', '', '', { due: date, dueTime: '10:00' });
  assert.equal(M.overdue(due, new Date('2030-05-08T09:59:00Z')), false);
  assert.equal(M.overdue(due, new Date('2030-05-08T10:01:00Z')), true);
  assert.equal(M.overdue({ ...due, dueTime: '' }, new Date('2030-05-08T20:00:00Z')), false);
  assert.equal(M.overdue({ ...due, done: true }, new Date('2030-05-09T12:00:00Z')), false);
});
test('错误备份不能进入状态：重复标识、错误日期、时段和状态', () => {
  const a = task('a', '09:00', '10:00');
  assert.equal(M.parseBackup(JSON.stringify({ version: 1, tasks: [a] })).tasks.length, 1);
  for (const tasks of [[a, a], [{ ...a, date: '2026-02-30' }], [{ ...a, end: '08:00' }], [{ ...a, start: '', end: '10:00' }], [{ ...a, done: 'yes' }], [{ ...a, dueTime: '10:00' }]]) {
    assert.throws(() => M.parseBackup(JSON.stringify({ version: 1, tasks })));
  }
  assert.throws(() => M.parseBackup('{broken'));
});
test('公开种子全部为通用示例，来源为空且日期相对当天生成', () => {
  const sandbox = { window: { LifeCalendar: M } };
  vm.runInNewContext(fs.readFileSync(__dirname + '/../site/calendar-data.js', 'utf8'), sandbox);
  const seed = sandbox.window.LIFE_CALENDAR_SEED;
  assert.equal(M.parseBackup(JSON.stringify({ version: 1, tasks: seed })).tasks.length, 8);
  assert.equal(seed.filter(t => t.done).length, 1);
  assert.ok(seed.every(t => t.id.startsWith('demo-') && t.source === ''));
  assert.equal(seed.find(t => t.due).due, M.addDays(M.today(), 2));
});
