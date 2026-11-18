const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../site/game-model.js');
const task = (id, done = true) => ({ id, title: '现实里的小任务', estimate: 60, category: 'work', done });
test('只奖励完成任务，同一任务恢复再完成也不重复奖励', () => {
  const state = G.fresh();
  assert.equal(G.claim(state, task('a', false)).ok, false);
  assert.equal(G.claim(state, task('a')).ok, true);
  assert.equal(G.claim(state, task('a')).ok, false);
  assert.deepEqual(G.progress(state), { xp: 30, level: 1, inLevel: 30, blocks: 1 });
});
test('建造扣除方块，重复建造与余额不足不改变状态', () => {
  const state = G.fresh();
  assert.equal(G.build(state, 'garden').ok, false);
  ['a', 'b', 'c'].forEach(id => G.claim(state, task(id)));
  assert.equal(G.build(state, 'garden').ok, true);
  assert.equal(G.progress(state).blocks, 0);
  assert.equal(G.build(state, 'garden').ok, false);
  assert.equal(state.buildings.length, 1);
});
test('经验升级跨阈值，奖励上限和每次一个方块固定', () => {
  const state = G.fresh();
  for (let i = 0; i < 4; i++) G.claim(state, task(String(i)));
  assert.equal(G.progress(state).level, 2);
  assert.equal(G.progress(state).inLevel, 20);
  assert.deepEqual(G.reward({ estimate: 600 }), { xp: 50, blocks: 1 });
});
test('专注暂停不增长，恢复和刷新使用实际时刻计算', () => {
  assert.equal(G.elapsed({ elapsed: 3000, startedAt: null }, 10000), 3000);
  assert.equal(G.elapsed({ elapsed: 3000, startedAt: 8000 }, 10000), 5000);
  assert.equal(G.elapsed({ elapsed: 3000, startedAt: 11000 }, 10000), 3000);
  const state = G.fresh(); state.focus = { id: 'a', elapsed: 3000, startedAt: 8000 };
  assert.equal(G.elapsed(G.parse(JSON.stringify(state)).focus, 10000), 5000);
});
test('错误游戏存档被拒绝，旧任务备份不需要游戏字段', () => {
  assert.deepEqual(G.parse(JSON.stringify(G.fresh())), G.fresh());
  for (const state of [{ ...G.fresh(), buildings: ['garden'] }, { ...G.fresh(), claims: [{ id: 'a', title: 'x', category: 'work', xp: 9000, blocks: 1, at: 0 }] }, { ...G.fresh(), focusTimes: { a: -5 } }, { ...G.fresh(), focus: { id: 'a', elapsed: 0, startedAt: 'bad' } }]) assert.throws(() => G.parse(state));
  const M = require('../site/calendar-model.js');
  assert.deepEqual(M.parseBackup('{"version":1,"tasks":[]}'), { version: 1, tasks: [] });
});
test('逐块搭建扣材料，叠高限制与回收返还保持余额一致', () => {
  const state = G.fresh();
  assert.equal(G.place(state, 2, 3, 'wood').ok, false);
  for (let i = 0; i < 4; i++) G.claim(state, task('block-' + i));
  for (let i = 0; i < 3; i++) assert.equal(G.place(state, 2, 3, 'wood').ok, true);
  assert.equal(G.place(state, 2, 3, 'wood').ok, false);
  assert.equal(G.progress(state).blocks, 1);
  assert.equal(G.remove(state, 2, 3).ok, true);
  assert.equal(G.progress(state).blocks, 2);
  assert.deepEqual(state.placements.map(b => b.y), [0, 1]);
  assert.equal(G.remove(state, 8, 8).ok, false);
  assert.equal(G.place(state, 8, 8, 'grass').ok, false);
  assert.equal(G.place(state, 2, 4, 'unknown').ok, false);
  assert.deepEqual(G.parse(JSON.stringify(state)), state);
});
test('旧存档补空方块列表，非法或悬空方块拒绝恢复', () => {
  const state = G.fresh(); delete state.placements;
  assert.deepEqual(G.parse(state).placements, []);
  G.claim(state, task('block'));
  for (const placements of [[{ x: 2, z: 3, y: 1, type: 'wood' }], [{ x: 99, z: 3, y: 0, type: 'wood' }], [{ x: 2, z: 3, y: 0, type: 'glass' }]]) assert.throws(() => G.parse({ ...state, placements }));
});
