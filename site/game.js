(function () {
  'use strict';
  const A = window.LifeApp, M = window.LifeCalendar, G = window.LifeGameModel;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = name => `<svg aria-hidden="true"><use href="#p-${name}"/></svg>`;
  const KEY = 'lifecraft-public-game-v1';
  const names = { work: '工作与创业', life: '生活与转场', study: '学习与成长' };
  const icons = { work: 'pick', life: 'grass', study: 'book' };
  let state, blocked = false, badRecord = null;
  try { const raw = localStorage.getItem(KEY); state = raw ? G.parse(raw) : G.fresh(); }
  catch { state = G.fresh(); blocked = true; try { badRecord = localStorage.getItem(KEY); } catch {} }
  let selectedId = null, filter = 'today', category = null, screen = 'world', focusSignature = '', statusTimer, rewardTimer, audio;
  let building = false, blockType = 'grass';
  const dateLabel = day => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(new Date(day + 'T12:00Z'));
  function save() {
    if (blocked) { $('#game-save').textContent = '存档异常 · 请备份'; return; }
    try { localStorage.setItem(KEY, JSON.stringify(state)); $('#game-save').textContent = '本地存档 ✓'; }
    catch { $('#game-save').textContent = '未保存 · 请备份'; tell('营地没能保存，请从背包「存档」导出备份。'); }
  }
  function tell(message) {
    clearTimeout(statusTimer); $('#world-status').textContent = message; $('#world-status').classList.add('visible');
    statusTimer = setTimeout(() => $('#world-status').classList.remove('visible'), 5000);
    if (screen !== 'world') { $('#toast-text').textContent = message; $('#toast').hidden = false; $('#undo').hidden = true; }
  }
  function tone(success = true) {
    if (!state.sound) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume();
      (success ? [523.25, 659.25, 783.99] : [392]).forEach((frequency, i) => {
        const oscillator = audio.createOscillator(), gain = audio.createGain();
        oscillator.type = 'square'; oscillator.frequency.value = frequency;
        const at = audio.currentTime + i * .09; gain.gain.setValueAtTime(.025, at); gain.gain.exponentialRampToValueAtTime(.001, at + .12);
        oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(at); oscillator.stop(at + .14);
      });
    } catch { tell('当前浏览器无法播放音效，游戏仍可继续。'); }
  }
  function changeScreen(next) {
    if (building && next !== 'world') setBuilding(false);
    screen = next; document.body.dataset.screen = next;
    $('.skip-link').href = next === 'calendar' ? '#main' : '#game-view';
    $('#game-view').hidden = next === 'calendar'; $('#calendar-view').hidden = next !== 'calendar';
    $$('.game-nav [data-screen]').forEach(button => button.setAttribute('aria-pressed', button.dataset.screen === next));
    render();
  }
  function taskList() {
    const tasks = A.getTasks();
    return tasks.filter(task => (!category || task.category === category) && (filter === 'done' ? task.done : filter === 'today' ? task.date === A.getDate() : true))
      .sort((a, b) => Number(a.done) - Number(b.done) || a.date.localeCompare(b.date) || (a.start || '99').localeCompare(b.start || '99'));
  }
  function quest(task) {
    const claimed = state.claims.some(c => c.id === task.id), active = selectedId === task.id;
    const reward = G.reward(task), due = task.due && !task.done;
    const activeFocus = state.focus?.id === task.id;
    return `<article class="quest-card ${active ? 'active' : ''} ${task.done ? 'completed' : ''}" data-quest-card="${esc(task.id)}"><button class="quest-select" data-quest="${esc(task.id)}" aria-expanded="${active}"><span class="quest-item-icon">${icon(task.done ? 'star' : icons[task.category])}</span><span class="quest-title"><span class="quest-kind">${task.done ? claimed ? '任务已完成' : '奖励待领取' : activeFocus ? state.focus.startedAt ? '正在进行' : '已暂停' : names[task.category]}${filter !== 'today' ? ` · ${task.date.slice(5)}` : ''}</span><strong>${esc(task.title)}</strong><span class="quest-time">${task.start ? `${task.start} 至 ${task.end}` : `约 ${M.duration(task.estimate)} · 待安排`}${task.proposed ? ' · 建议' : ''}</span></span><span class="quest-xp">${claimed ? '✓' : `+${reward.xp}`}<small>${claimed ? '已领取' : 'XP'}</small></span></button>${due ? `<div class="quest-deadline">截止 ${task.due}${task.dueTime ? ` ${task.dueTime}` : ''}</div>` : ''}${active ? `<div class="quest-details"><p>${esc(task.notes || '做完后，回来记录结果，再领取这次冒险的奖励。').slice(0, 300)}</p><div class="quest-reward">${icon('star')} ${reward.xp} 经验<span>＋</span>${icon('grass')} 1 方块</div><div class="quest-actions">${!task.done ? `<button class="pixel-button" data-start="${esc(task.id)}">${activeFocus ? '回到专注' : '接取任务'} <span>→</span></button><button class="complete-button" data-finish="${esc(task.id)}" title="确认现实任务已完成">已完成，领奖</button>` : !claimed ? `<button class="pixel-button" data-finish="${esc(task.id)}">领取奖励</button>` : '<span class="claimed-note">这块世界，已经属于你了。</span>'}<button class="quest-edit" data-quest-edit="${esc(task.id)}" aria-label="编辑任务">编辑</button></div></div>` : ''}</article>`;
  }
  function renderQuests() {
    const tasks = taskList(), all = A.getTasks(), todayTasks = all.filter(t => t.date === A.getDate());
    if (!tasks.some(t => t.id === selectedId)) selectedId = tasks.find(t => !t.done)?.id || tasks[0]?.id || null;
    $('#quest-heading').textContent = screen === 'quests' ? '你的任务日志' : A.getDate() === M.today() ? '今日冒险' : '当日冒险';
    $('#quest-summary').innerHTML = `<span>${dateLabel(A.getDate())}</span><strong>${todayTasks.filter(t => t.done).length} / ${todayTasks.length} 完成</strong>`;
    $$('.quest-tabs button').forEach(button => button.setAttribute('aria-pressed', button.dataset.questFilter === filter));
    $('#quest-category').hidden = !category;
    $('#quest-category').innerHTML = category ? `${esc(names[category])}<button data-action="clear-category" aria-label="清除分类">×</button>` : '';
    $('#quest-content').innerHTML = tasks.map(quest).join('') || `<div class="quest-empty">${icon('flag')}<h3>${filter === 'done' ? '第一份战利品，等你带回来。' : '这片地图，等你来探索。'}</h3><p>${category ? '换个日期，或看看这个任务站的全部任务。' : '添加一件想做的小事，开始今天的冒险。'}</p><button class="pixel-button" data-action="${category ? 'all-quests' : 'new'}">${category ? '查看全部任务' : '添加一个任务'}</button></div>`;
    $('#game-free-time').textContent = `${A.getDate() === M.today() ? '今日' : '当日'}可安排 ${M.duration(M.stats(all, A.getDate()).free)}`;
    for (const cat of M.CATEGORIES) $(`[data-station="${cat}"] small`).textContent = `${names[cat]} · ${all.filter(t => t.category === cat && !t.done).length} 项`;
  }
  function renderFocus() {
    const tasks = A.getTasks(), task = tasks.find(t => t.id === state.focus?.id);
    if (state.focus && (!task || task.done)) { if (task) state.focusTimes[task.id] = G.elapsed(state.focus); state.focus = null; save(); }
    const suggested = tasks.find(t => t.id === selectedId && !t.done) || tasks.find(t => t.date === A.getDate() && !t.done);
    const signature = `${task?.id || ''}:${!!state.focus?.startedAt}:${suggested?.id || ''}`;
    if (signature !== focusSignature) {
      focusSignature = signature;
      $('#focus-hud').innerHTML = state.focus && task ? `<div class="focus-state"><span class="focus-led ${state.focus.startedAt ? 'running' : ''}"></span><span>${state.focus.startedAt ? '正在专注' : '已暂停'} · ${names[task.category]}</span><strong id="focus-elapsed"></strong></div><strong class="focus-task-name">${esc(task.title)}</strong><div class="focus-buttons"><button data-action="pause">${state.focus.startedAt ? '暂停一下' : '继续专注'}</button><button data-finish="${esc(task.id)}">完成并领取 ${icon('star')}</button></div>` : `<span class="focus-idle-title">下一步，迈出一小步。</span><strong class="focus-task-name">${suggested ? esc(suggested.title) : '四处走走，或添加一个新任务。'}</strong>${suggested ? `<button class="pixel-button" data-start="${esc(suggested.id)}">开始这次冒险 ${icon('sword')}</button>` : '<button class="pixel-button" data-action="new">添加一个任务</button>'}`;
    }
    if ($('#focus-elapsed') && state.focus) {
      const seconds = Math.floor(G.elapsed(state.focus) / 1000);
      $('#focus-elapsed').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }
  }
  function render() {
    const progress = G.progress(state);
    $('#player-level').textContent = `LV. ${progress.level}`;
    $('#player-xp-bar').style.width = `${progress.inLevel}%`;
    $('#player-xp-label').textContent = `${progress.inLevel} / 100 XP`;
    $('#block-count').textContent = progress.blocks;
    $('#camp-level').textContent = state.buildings.length ? ['新手营地', '有了新生机', '渐渐像个家', '自己的小世界'][state.buildings.length] : '新手营地';
    $('#camp-buildings').textContent = `${state.buildings.length} / 3 座建筑`;
    const nextBuilding = G.BUILDINGS.find(b => !state.buildings.includes(b.id));
    $('#camp-next').textContent = nextBuilding ? `${nextBuilding.name} · ${Math.max(0, nextBuilding.cost - progress.blocks) ? `还差 ${Math.max(0, nextBuilding.cost - progress.blocks)} 方块` : '可以建造了'}` : '营地建好了，继续自由搭建吧。';
    $('#quest-goal').textContent = nextBuilding ? `下一个目标：${nextBuilding.name} · ${Math.max(0, nextBuilding.cost - progress.blocks) ? `还差 ${Math.max(0, nextBuilding.cost - progress.blocks)} 个方块` : '现在可以建造'}` : '建筑已解锁，继续亲手搭建自己的营地。';
    $('#build-balance').textContent = `${progress.blocks} 个方块`;
    $('#game-date').textContent = dateLabel(A.getDate());
    $('#sound-toggle').textContent = `音效：${state.sound ? '开' : '关'}`;
    $('#sound-toggle').setAttribute('aria-pressed', state.sound);
    if (blocked) $('#game-save').textContent = '存档异常 · 请备份';
    renderQuests(); renderFocus(); window.LifeWorld?.syncBuildings(state.buildings); window.LifeWorld?.syncPlaced(state.placements);
  }
  function start(id) {
    const task = A.getTasks().find(t => t.id === id);
    if (!task || task.done) { tell('这件事已经完成了，挑一个新任务吧。'); return; }
    if (state.focus && state.focus.id !== id) state.focusTimes[state.focus.id] = G.elapsed(state.focus);
    if (state.focus?.id !== id) state.focus = { id, elapsed: state.focusTimes[id] || 0, startedAt: Date.now() };
    else if (!state.focus.startedAt) state.focus.startedAt = Date.now();
    selectedId = id; category = null; filter = task.date === A.getDate() ? 'today' : 'all';
    save(); changeScreen('world'); window.LifeWorld?.goStation(task.category); tone(false); tell('任务已接取。现在去完成现实里的这件事，回来领取奖励。');
  }
  function finish(id) {
    const task = A.getTasks().find(t => t.id === id); if (!task) return;
    if (state.claims.some(c => c.id === id)) { tell('这项奖励已经领过，继续探索新的任务吧。'); return; }
    const before = G.progress(state).level;
    if (state.focus?.id === id) state.focusTimes[id] = G.elapsed(state.focus);
    A.setDone(id, true); task.done = true;
    const reward = G.claim(state, task); if (!reward.ok) { tell(reward.reason); return; }
    save(); render(); window.LifeWorld?.celebrate(); tone();
    $('#reward-text').textContent = `＋${reward.xp} XP　＋1 方块${G.progress(state).level > before ? `　升级至 LV. ${G.progress(state).level}` : ''}`;
    $('#reward-overlay > strong').textContent = G.progress(state).level > before ? '等级提升' : '任务完成';
    $('#reward-overlay').hidden = false;
    clearTimeout(rewardTimer); rewardTimer = setTimeout(() => { $('#reward-overlay').hidden = true; }, 4800);
  }
  function openDialog(title, html) {
    $('#game-dialog-title').textContent = title; $('#game-dialog-content').innerHTML = html;
    if (!$('#game-dialog').open) $('#game-dialog').showModal();
  }
  function openBuild() {
    const progress = G.progress(state);
    openDialog('一块一块，建成自己的世界', `<p class="build-intro">完成一个任务，获得一个方块。<strong>你的背包：${progress.blocks} 方块</strong></p><div class="free-build-intro">${icon('pick')}<div><h3>亲手搭一点东西</h3><p>草、木、石三种方块。每放一块消耗 1 方块，回收会返还。可以叠三层。</p></div><button class="pixel-button" data-action="free-build">自由搭建 →</button></div><div class="build-list">${G.BUILDINGS.map((building, i) => { const owned = state.buildings.includes(building.id), needed = building.cost - progress.blocks; return `<article class="build-option"><span class="building-preview ${building.id}">${icon(['grass', 'book', 'star'][i])}</span><div><h3>${building.name}</h3><p>${building.description}</p><span>${owned ? '已在营地建造' : `${building.cost} 个方块${needed > 0 ? ` · 还差 ${needed} 个` : ' · 可以建造'}`}</span></div><button class="pixel-button" data-build="${building.id}" ${owned || needed > 0 ? 'disabled' : ''}>${owned ? '已建造' : '建造'}</button></article>`; }).join('')}</div><p class="game-small-note">建筑会出现在 3D 营地里。休息和逾期都不会扣经验。</p>`);
  }
  function setBuilding(active) {
    building = active;
    if (active && state.focus?.startedAt) { state.focus.elapsed = G.elapsed(state.focus); state.focus.startedAt = null; save(); }
    document.body.classList.toggle('is-building', active); $('#build-hud').hidden = !active;
    window.LifeWorld?.setBuildMode(active, blockType);
    if (active) { $('#game-dialog').close(); changeScreen('world'); $('#world-canvas').focus({ preventScroll: true }); }
    renderFocus();
  }
  function placeBlock(x, z, type) {
    if (window.LifeWorld && !window.LifeWorld.canPlace(x, z)) { tell('换一块空地，给角色和原来的建筑留点空间。'); return; }
    const result = G.place(state, x, z, type);
    if (result.ok) { save(); render(); tone(false); } else tell(result.reason);
  }
  function removeBlock(x, z) {
    const result = G.remove(state, x, z);
    if (result.ok) { save(); render(); tone(false); } else tell(result.reason);
  }
  function openJournal() {
    openDialog('你走过的每一步', `<p class="journal-intro">${state.claims.length ? `已完成 ${state.claims.length} 次冒险，累计 ${G.progress(state).xp} XP。` : '还没有领取过奖励。完成一件小事，就有第一段冒险。'}</p><div class="journal-entries">${state.claims.slice().reverse().map(item => `<article>${icon(icons[item.category])}<div><strong>${esc(item.title)}</strong><span>${dateLabel(M.today(new Date(item.at)))} · ${names[item.category]}</span></div><b>＋${item.xp} XP</b></article>`).join('')}</div>`);
  }
  function help() {
    openDialog('怎么玩这个 Life 世界', `<div class="game-instructions"><p><b>1. 接取任务。</b> 从日志选一件现实里想推进的事，开始专注计时。点击地面或用 WASD／方向键探索营地；任务站可以筛选分类。</p><p><b>2. 完成，再领奖。</b> 做完现实任务后点「已完成，领奖」。获得 20 至 50 XP 和 1 个方块。同一任务只奖励一次，重新勾选也不能重复领取。</p><p><b>3. 建造自己的营地。</b> 背包「建造」能解锁麦田、书屋与灯塔，也能进入自由搭建，用草、木、石逐块搭建。点击放置，右键或「回收上一块」返还材料，最多叠三层。搭建时会暂停专注。每 100 XP 升一级。</p><p><b>时间仍然留给你。</b> 时间地图保留原来的安排、截止与空闲计算。红色是截止，蓝色是时间，绿色是完成。初始排期仍是建议。</p><p>这里没有掉血、扣经验或连续打卡惩罚。休息一下，营地还在等你。进度保存在当前浏览器；从「存档」导出任务与游戏进度。</p></div>`);
  }
  function action(name) {
    if (name === 'new') A.openEditor();
    if (name === 'quests') changeScreen('quests');
    if (name === 'focus') { const id = state.focus?.id || selectedId; if (id) start(id); else tell('先从日志里选一个任务。'); }
    if (name === 'build') openBuild();
    if (name === 'free-build') setBuilding(true);
    if (name === 'exit-build') setBuilding(false);
    if (name === 'undo-block') { const block = state.placements.at(-1); if (block) removeBlock(block.x, block.z); else tell('还没放过方块，先选一块空地试试。'); }
    if (name === 'journal') openJournal();
    if (name === 'help') help();
    if (name === 'backup') A.openData();
    if (name === 'all-quests') { filter = 'all'; renderQuests(); }
    if (name === 'clear-category') { category = null; renderQuests(); }
    if (name === 'pause' && state.focus) {
      if (state.focus.startedAt) { state.focus.elapsed = G.elapsed(state.focus); state.focus.startedAt = null; }
      else state.focus.startedAt = Date.now();
      save(); renderFocus();
    }
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.screen) changeScreen(button.dataset.screen);
    if (button.dataset.action) action(button.dataset.action);
    if (button.dataset.questFilter) { filter = button.dataset.questFilter; renderQuests(); }
    if (button.dataset.quest) { selectedId = button.dataset.quest; renderQuests(); focusSignature = ''; renderFocus(); }
    if (button.dataset.questEdit) A.openEditor(button.dataset.questEdit);
    if (button.dataset.start) start(button.dataset.start);
    if (button.dataset.finish) finish(button.dataset.finish);
    if (button.dataset.station) { category = button.dataset.station; filter = 'all'; window.LifeWorld?.goStation(category); renderQuests(); tone(false); }
    if (button.dataset.build) {
      const result = G.build(state, button.dataset.build);
      if (result.ok) { save(); render(); openBuild(); window.LifeWorld?.celebrate(); tone(); tell(`${result.name}已建好，回营地看看。`); }
      else tell(result.reason);
    }
    if (button.dataset.blockType) {
      blockType = button.dataset.blockType;
      $$('[data-block-type]').forEach(b => b.setAttribute('aria-pressed', b.dataset.blockType === blockType));
      window.LifeWorld?.setBuildMode(building, blockType);
    }
  });
  $('#sound-toggle').addEventListener('click', () => { state.sound = !state.sound; save(); render(); if (state.sound) tone(false); });
  $('#game-dialog-close').addEventListener('click', () => $('#game-dialog').close());
  $('#reward-dismiss').addEventListener('click', () => { $('#reward-overlay').hidden = true; $('#focus-hud button')?.focus({ preventScroll: true }); });
  $('#game-date-prev').addEventListener('click', () => A.selectDay(M.addDays(A.getDate(), -1)));
  $('#game-date-next').addEventListener('click', () => A.selectDay(M.addDays(A.getDate(), 1)));
  $('#game-today').addEventListener('click', () => A.selectDay(M.today()));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { $('#reward-overlay').hidden = true; if (building) setBuilding(false); }
    if (event.metaKey || event.ctrlKey || event.altKey || event.target.closest('input,textarea,select') || document.querySelector('dialog[open]')) return;
    if (/^[1-6]$/.test(event.key)) { event.preventDefault(); $$('.hotbar button')[Number(event.key) - 1]?.click(); }
  });
  window.addEventListener('life:change', render);
  window.addEventListener('life:world-ready', () => window.LifeWorld.syncBuildings(state.buildings));
  window.addEventListener('storage', event => {
    if (event.key !== KEY || !event.newValue) return;
    try { state = G.parse(event.newValue); blocked = false; badRecord = null; render(); }
    catch { tell('另一个标签页的营地存档无效，当前进度已保留。'); }
  });
  window.LifeGame = {
    getState: () => ({ ...structuredClone(state), ...(badRecord ? { originalRecord: badRecord } : {}) }),
    placeBlock, removeBlock,
    setState(value) { state = G.parse(value); blocked = false; badRecord = null; save(); render(); },
  };
  setTimeout(() => {
    if (!window.LifeWorld) {
      $('#world-fallback').hidden = false;
      $('.world-loading')?.remove();
    }
  }, 10000);
  window.addEventListener('life:world-ready', () => { $('#world-fallback').hidden = true; });
  document.body.dataset.screen = 'world'; render(); setInterval(renderFocus, 1000);
})();
