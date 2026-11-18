(function (root) {
  'use strict';
  const BUILDINGS = [
    { id: 'garden', name: '小麦农场', cost: 3, description: '让营地长出第一片金色麦田。' },
    { id: 'library', name: '林间书屋', cost: 6, description: '在学习站旁建一间自己的小书屋。' },
    { id: 'beacon', name: '冒险灯塔', cost: 10, description: '让营地的光，照向下一块地图。' },
  ];
  const BLOCK_TYPES = [{ id: 'grass', name: '草方块' }, { id: 'wood', name: '木方块' }, { id: 'stone', name: '石方块' }];
  const fresh = () => ({ version: 1, claims: [], buildings: [], placements: [], focus: null, focusTimes: {}, sound: false });
  const validTile = (x, z) => Number.isInteger(x) && Number.isInteger(z) && (x / 10) ** 2 + (z / 8.2) ** 2 < 1 && !(x > 6 && z > 3);
  function reward(task) { return { xp: Math.min(50, 10 + Math.ceil(task.estimate / 30) * 10), blocks: 1 }; }
  function progress(state) {
    const xp = state.claims.reduce((sum, item) => sum + item.xp, 0);
    const spent = state.buildings.reduce((sum, id) => sum + BUILDINGS.find(b => b.id === id).cost, 0);
    return { xp, level: 1 + Math.floor(xp / 100), inLevel: xp % 100, blocks: state.claims.reduce((sum, item) => sum + item.blocks, 0) - spent - (state.placements || []).length };
  }
  function claim(state, task, now = Date.now()) {
    if (!task.done) return { ok: false, reason: '先完成现实中的这件事，再回来领取奖励。' };
    if (state.claims.some(item => item.id === task.id)) return { ok: false, reason: '这项任务的奖励已经领取过了。' };
    const result = reward(task);
    state.claims.push({ id: task.id, title: task.title, category: task.category, ...result, at: now });
    if (state.focus?.id === task.id) state.focus = null;
    return { ok: true, ...result };
  }
  function build(state, id) {
    const building = BUILDINGS.find(b => b.id === id);
    if (!building) return { ok: false, reason: '未找到这个建筑。' };
    if (state.buildings.includes(id)) return { ok: false, reason: '这座建筑已经在营地里了。' };
    if (progress(state).blocks < building.cost) return { ok: false, reason: `还需要 ${building.cost - progress(state).blocks} 个方块，完成任务就能获得。` };
    state.buildings.push(id);
    return { ok: true, name: building.name };
  }
  function elapsed(focus, now = Date.now()) {
    return focus ? focus.elapsed + (focus.startedAt ? Math.max(0, now - focus.startedAt) : 0) : 0;
  }
  function place(state, x, z, type) {
    if (!validTile(x, z) || !BLOCK_TYPES.some(b => b.id === type)) return { ok: false, reason: '选一块营地里的空地。' };
    const height = (state.placements || []).filter(b => b.x === x && b.z === z).length;
    if (height >= 3) return { ok: false, reason: '这里已到三层上限，换一块空地继续搭吧。' };
    if ((state.placements || []).length >= 128) return { ok: false, reason: '已放满 128 块，可以先回收一些再搭。' };
    if (progress(state).blocks < 1) return { ok: false, reason: '先完成一个任务，领取第一块建造材料。' };
    state.placements ||= [];
    state.placements.push({ x, z, y: height, type });
    return { ok: true, height: height + 1 };
  }
  function remove(state, x, z) {
    const top = (state.placements || []).filter(b => b.x === x && b.z === z).sort((a, b) => b.y - a.y)[0];
    if (!top) return { ok: false, reason: '这里只能回收自己放置的方块。' };
    state.placements.splice(state.placements.indexOf(top), 1);
    return { ok: true };
  }
  function parse(value) {
    const state = typeof value === 'string' ? JSON.parse(value) : value;
    if (!state || state.version !== 1 || !Array.isArray(state.claims) || !Array.isArray(state.buildings) || state.claims.length > 5000) throw new Error('营地存档格式无效');
    const ids = new Set();
    for (const item of state.claims) {
      if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.title !== 'string' || item.title.length > 160 || !['work', 'life', 'study'].includes(item.category) || !Number.isInteger(item.xp) || item.xp < 0 || item.xp > 50 || item.blocks !== 1 || !Number.isFinite(item.at) || item.at < 0) throw new Error('营地奖励记录无效');
      ids.add(item.id);
    }
    const placements = state.placements || [];
    if (!Array.isArray(placements) || placements.length > 128) throw new Error('方块存档无效');
    const cells = new Set();
    for (const block of placements) {
      if (!block || !validTile(block.x, block.z) || !Number.isInteger(block.y) || block.y < 0 || block.y > 2 || !BLOCK_TYPES.some(b => b.id === block.type) || cells.has(`${block.x},${block.z},${block.y}`)) throw new Error('方块位置或材质无效');
      cells.add(`${block.x},${block.z},${block.y}`);
    }
    if (placements.some(b => b.y > 0 && !cells.has(`${b.x},${b.z},${b.y - 1}`))) throw new Error('方块不能悬空');
    if (new Set(state.buildings).size !== state.buildings.length || state.buildings.some(id => !BUILDINGS.some(b => b.id === id)) || progress(state).blocks < 0) throw new Error('营地建筑记录无效');
    if (state.focus !== null && (!state.focus || typeof state.focus.id !== 'string' || !Number.isFinite(state.focus.elapsed) || state.focus.elapsed < 0 || !(state.focus.startedAt === null || (Number.isFinite(state.focus.startedAt) && state.focus.startedAt >= 0)))) throw new Error('专注记录无效');
    const focusTimes = state.focusTimes || {};
    if (typeof focusTimes !== 'object' || Array.isArray(focusTimes) || Object.values(focusTimes).some(value => !Number.isFinite(value) || value < 0)) throw new Error('专注累计记录无效');
    return { version: 1, claims: state.claims, buildings: state.buildings, placements, focus: state.focus, focusTimes, sound: !!state.sound };
  }
  const api = { BUILDINGS, BLOCK_TYPES, validTile, fresh, reward, progress, claim, build, place, remove, elapsed, parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LifeGameModel = api;
})(typeof window === 'undefined' ? globalThis : window);
