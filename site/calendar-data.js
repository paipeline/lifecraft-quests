/* Fictional examples for the public demo. No personal tasks or source links. */
(function () {
  const M = window.LifeCalendar, today = M.today();
  window.LIFE_CALENDAR_SEED = [
    { id: 'demo-project', title: '写完小项目的第一版', start: '09:00', end: '10:00', category: 'work', estimate: 60, notes: '演示任务：挑一个自己想做的小点子，做出能打开、能点的第一版。先把最小的部分做完。' },
    { id: 'demo-read', title: '读一章想读的书', start: '10:30', end: '11:00', category: 'study', estimate: 30, notes: '演示任务：读完一章，记下一个想法。回来给自己的营地添一块材料。' },
    { id: 'demo-walk', title: '出去散步二十分钟', category: 'life', estimate: 20, notes: '演示任务：放下屏幕，出去走一圈。回来再继续今天的冒险。' },
    { id: 'demo-desk', title: '整理一下书桌', start: '14:00', end: '14:30', category: 'life', estimate: 30, notes: '演示任务：收好桌面的杂物，腾出一块舒服的工作空间。' },
    { id: 'demo-skill', title: '练习一个新技能', start: '16:00', end: '16:45', category: 'study', estimate: 45, notes: '演示任务：选一个想学的技能，完成一次小练习，不用一次学完。' },
    { id: 'demo-first-step', title: '给自己的营地起个名字', category: 'life', estimate: 5, done: true, notes: '演示完成项：你已经有了一块自己的天地。可以领取这一步的奖励。' },
    { id: 'demo-weekend', title: '完成周末的小作品', category: 'work', estimate: 60, due: M.addDays(today, 2), notes: '演示截止：把一个小作品做完。日期是相对今天生成的通用示例，可以自由修改。' },
    { id: 'demo-friend', title: '给朋友写一张小卡片', date: M.addDays(today, 1), category: 'life', estimate: 30, notes: '演示任务：写几句最近想和朋友说的话。' },
  ].map(task => ({ date: today, done: false, proposed: true, start: '', end: '', due: '', dueTime: '', notes: '', source: '', ...task }));
})();
