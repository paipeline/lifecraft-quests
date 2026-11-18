import * as THREE from './assets/vendor/three.module.js';

const host = document.querySelector('#world-canvas');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
try {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c6e2e5');
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor('#c6e2e5');
  host.replaceChildren(renderer.domElement);
  const camera = new THREE.OrthographicCamera(-15, 15, 9, -9, .1, 120);
  let angle = Math.PI / 4, zoom = 1, readyToDraw = false;
  function redraw() { if (readyToDraw) { renderer.render(scene, camera); positionLabels(); } }
  function updateCamera() {
    camera.position.set(Math.sin(angle) * 28, 25, Math.cos(angle) * 28);
    camera.lookAt(0, .3, 0); camera.zoom = zoom; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true); redraw();
  }
  scene.add(new THREE.HemisphereLight('#fff8e7', '#709573', 2.2));
  const sun = new THREE.DirectionalLight('#fff1cf', 2.1);
  sun.position.set(-8, 20, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 60 });
  sun.shadow.bias = -.001; sun.shadow.normalBias = .025;
  scene.add(sun);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Map();
  function material(color) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshLambertMaterial({ color }));
    return materials.get(color);
  }
  function cube(x, y, z, w, h, d, color, parent = scene) {
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.position.set(x, y + h / 2, z); mesh.scale.set(w, h, d);
    mesh.castShadow = h > .2; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function noise(x, z) { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); }
  function texture(colors, seed = 0, grass = false) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d');
    for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
      ctx.fillStyle = colors[Math.floor(noise(x + seed, y) * colors.length)];
      ctx.fillRect(x, y, 1, 1);
      if (grass && y < 3 + Math.floor(noise(x, 3) * 2)) { ctx.fillStyle = ['#6f9b46', '#79a94d', '#85ae56'][x % 3]; ctx.fillRect(x, y, 1, 1); }
    }
    const map = new THREE.CanvasTexture(canvas); map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestFilter; map.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshLambertMaterial({ map });
  }
  const dirt = texture(['#96704b', '#a27b53', '#8a6443', '#ad835b'], 2, true);
  const grass = texture(['#7ca54d', '#84ad55', '#8ab45b', '#79a24a']);
  const road = texture(['#c0ac78', '#cbb783', '#c6b17a', '#b9a474'], 7);
  const tiles = [], paths = [];
  const inIsland = (x, z) => (x / 10) ** 2 + (z / 8.2) ** 2 < 1 && !(x > 6 && z > 3);
  for (let x = -10; x <= 10; x++) for (let z = -8; z <= 8; z++) {
    if (!inIsland(x, z)) continue;
    const path = (Math.abs(x) <= 1 && z > -5 && z < 6) || (Math.abs(z + 1) < 1 && x >= -5 && x <= 5) || (z === 4 && x >= -5 && x <= 1);
    (path ? paths : tiles).push({ x, z });
  }
  const grounds = [];
  function ground(list, top) {
    const mesh = new THREE.InstancedMesh(geometry, [dirt, dirt, top, dirt, dirt, dirt], list.length);
    const dummy = new THREE.Object3D();
    list.forEach(({ x, z }, index) => {
      dummy.position.set(x, -1.55, z); dummy.scale.set(1, 3.1, 1); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, new THREE.Color().setScalar(.93 + noise(x, z) * .12));
    });
    mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); grounds.push(mesh);
  }
  ground(tiles, grass); ground(paths, road);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshLambertMaterial({ color: '#74b9bf' }));
  ocean.rotation.x = -Math.PI / 2; ocean.position.y = -1.8; ocean.receiveShadow = true; scene.add(ocean);
  for (let i = 0; i < 24; i++) {
    const x = -17 + noise(i, 1) * 35, z = -15 + noise(i, 2) * 32;
    if (!inIsland(Math.round(x), Math.round(z))) cube(x, -1.78, z, .5 + noise(i, 4), .025, .12, '#9bced0');
  }
  // Distant block islands make this a place, rather than an isolated UI tile.
  for (const [x, z, size] of [[-19, -11, 3], [15, -19, 3.5], [23, 3, 2]]) {
    cube(x, -2.4, z, size, 1.4, size * .8, '#9a9e79');
    cube(x, -1, z, size, .2, size * .8, '#8faf77');
    cube(x, -.8, z, .5, 1.5, .5, '#9c8c6e'); cube(x, .7, z, 2, 1.4, 2, '#87a786');
  }
  const obstacles = [];
  function obstacle(x, z, w, d) { obstacles.push({ x, z, w: w / 2 + .28, d: d / 2 + .28 }); }
  function tree(x, z, size = 1) {
    cube(x, 0, z, .48, 2.8 * size, .48, '#79573a');
    cube(x, 2 * size, z, 2.5 * size, 1.3 * size, 2.4 * size, '#4f8045');
    cube(x - .4, 3 * size, z, 1.8 * size, 1.1 * size, 1.8 * size, '#66954d');
    cube(x + .6, 2.5 * size, z + .5, 1.2 * size, .9 * size, 1.5 * size, '#5c8944');
    obstacle(x, z, .5, .5);
  }
  [[-7, -3, 1], [-6, -5, 1.15], [-4, -6, .9], [6, -5, 1], [8, -2, .9], [-8, 1, 1], [3, -6, .8], [-7, 4, .85]].forEach(args => tree(...args));
  // Workshop: posts, planks, anvil and a stepped, tiled roof.
  const work = new THREE.Group(); scene.add(work); work.position.set(-4.5, 0, -1.8);
  cube(0, 0, 0, 3.4, .2, 2.8, '#a17c49', work);
  for (const x of [-1.3, 1.3]) for (const z of [-1, 1]) cube(x, .2, z, .22, 2.7, .22, '#6f4c2d', work);
  for (let step = 0; step < 3; step++) cube(0, 2.7 + step * .3, 0, 3.8 - step * .65, .32, 3.2, step % 2 ? '#86603a' : '#996d3d', work);
  cube(-.4, .2, .15, 1.4, .9, .8, '#9d6b39', work);
  cube(-.4, 1.1, .15, 1.6, .18, 1, '#c39755', work);
  cube(.8, .2, -.5, .7, 1.2, .7, '#7c8680', work); cube(.8, .7, -.12, .4, .4, .05, '#ecac51', work);
  obstacle(-4.5, -1.8, 3.4, 2.8);
  // A little home, with a red block roof, shutters and a flower box.
  const house = new THREE.Group(); scene.add(house); house.position.set(4.3, 0, -1.5);
  cube(0, 0, 0, 2.8, 2, 2.5, '#e2d7ac', house);
  for (const x of [-1.3, 1.3]) cube(x, 0, 0, .2, 2.1, 2.6, '#8d6a45', house);
  cube(-.55, .5, 1.26, .75, .8, .06, '#83afac', house); cube(.65, 0, 1.27, .7, 1.5, .08, '#957247', house);
  cube(-.55, .4, 1.38, 1, .2, .4, '#8a6841', house);
  for (const x of [-.8, -.5, -.2]) { cube(x, .6, 1.38, .08, .22, .08, '#5d9048', house); cube(x, .8, 1.38, .2, .15, .16, '#e5a088', house); }
  for (let step = 0; step < 4; step++) cube(0, 2 + step * .3, 0, 3.4 - step * .65, .32, 3.1, ['#af6650', '#bc745a'][step % 2], house);
  cube(.7, 2.4, -.5, .4, 1.2, .5, '#948576', house); obstacle(4.3, -1.5, 2.8, 2.5);
  // Knowledge tree and a tiny open bookshelf.
  tree(.1, -5.2, 1.25);
  cube(.1, 0, -3.8, 2.3, .25, .8, '#8a7049');
  cube(.1, .25, -4, 1.8, 1, .38, '#a78b58');
  for (let i = 0; i < 7; i++) cube(-.6 + i * .22, .4, -3.77, .16, .6 + noise(i, 5) * .2, .22, ['#8a83a6', '#ab7b66', '#779c81', '#d5b76b'][i % 4]);
  // Campfire is the spawn and focus point.
  cube(0, .04, 2.4, 1.1, .16, .75, '#757e72');
  cube(0, .2, 2.4, .85, .15, .3, '#785338');
  const flame = cube(0, .3, 2.4, .36, .55, .36, '#efb052');
  cube(.1, .3, 2.4, .18, .3, .2, '#f5d176');
  // Chest and a small pier at the water edge.
  cube(4.5, 0, 3.6, 1.1, .7, .8, '#a67d3f'); cube(4.5, .7, 3.6, 1.15, .2, .85, '#bb914b'); cube(4.5, .45, 4.02, .16, .3, .05, '#e5cd80');
  for (let i = 0; i < 5; i++) cube(6 + i * .6, -.1, 3, .55, .18, 1.3, i % 2 ? '#ad8b56' : '#bd9a61');
  for (const [x, z] of [[-4, 5], [3, 4], [-2, -6], [7, -1], [-6, 2], [2, 6]]) {
    for (let i = 0; i < 3; i++) { const dx = noise(i + x, z) * .6; cube(x + dx, 0, z + i * .22, .07, .25, .07, '#5b8843'); cube(x + dx, .25, z + i * .22, .18, .14, .18, i % 2 ? '#f1d796' : '#d98b79'); }
  }
  for (const [x, z, h] of [[-7, -5, .7], [7, -4, 1], [8, -3, .6], [-5, 6, .5]]) cube(x, 0, z, 1, h, .8, '#939c89');

  const upgrades = new Map();
  function buildGarden() {
    const group = new THREE.Group(); scene.add(group);
    cube(-4.4, .03, 3.8, 3.4, .18, 2.7, '#7c623e', group);
    for (let x = 0; x < 6; x++) for (let z = 0; z < 4; z++) { cube(-5.7 + x * .5, .2, 2.8 + z * .55, .08, .45, .08, '#bdab56', group); cube(-5.7 + x * .5, .6, 2.8 + z * .55, .2, .18, .18, '#d8c272', group); }
    return group;
  }
  function buildLibrary() {
    const group = new THREE.Group(); scene.add(group);
    cube(3, 0, -5, 2, 1.8, 1.5, '#c4b893', group);
    for (let i = 0; i < 3; i++) cube(3, 1.8 + i * .25, -5, 2.5 - i * .6, .25, 2, '#64857b', group);
    cube(3, .4, -4.24, 1.3, .9, .08, '#748e91', group); return group;
  }
  function buildBeacon() {
    const group = new THREE.Group(); scene.add(group);
    for (let i = 0; i < 5; i++) cube(-2, i * .7, -6.8, 1.3 - i * .1, .7, 1.3 - i * .1, i % 2 ? '#bdc2ad' : '#a5ad9e', group);
    cube(-2, 3.5, -6.8, 1, .8, 1, '#e4c56f', group); cube(-2, 4.3, -6.8, 1.5, .25, 1.5, '#637e66', group); return group;
  }
  const builders = { garden: buildGarden, library: buildLibrary, beacon: buildBeacon };
  function syncBuildings(ids = []) {
    for (const [id, group] of upgrades) if (!ids.includes(id)) { scene.remove(group); upgrades.delete(id); }
    for (const id of ids) if (!upgrades.has(id) && builders[id]) upgrades.set(id, builders[id]());
    redraw();
  }

  const player = new THREE.Group(); scene.add(player); player.position.set(.8, 0, 3.7);
  cube(0, .77, 0, .48, .67, .28, '#4f8b7a', player);
  const head = cube(0, 1.44, 0, .43, .43, .43, '#d1a27e', player);
  cube(0, 1.8, -.02, .45, .13, .45, '#5c493b', player);
  cube(0, 1.65, -.19, .45, .25, .08, '#5c493b', player);
  cube(-.1, 1.64, .22, .055, .055, .025, '#3d4746', player); cube(.1, 1.64, .22, .055, .055, .025, '#3d4746', player);
  const limbs = [];
  for (const x of [-.14, .14]) { const leg = new THREE.Group(); leg.position.set(x, .78, 0); cube(0, -.7, 0, .2, .7, .23, '#536983', leg); cube(0, -.78, .04, .21, .12, .3, '#494d49', leg); player.add(leg); limbs.push(leg); }
  for (const x of [-.35, .35]) { const arm = new THREE.Group(); arm.position.set(x, 1.36, 0); cube(0, -.55, 0, .18, .5, .23, '#d1a27e', arm); cube(0, -.2, 0, .2, .2, .26, '#4f8b7a', arm); player.add(arm); limbs.push(arm); }

  const placedGroup = new THREE.Group(); scene.add(placedGroup);
  const placedMeshes = new Map(); let placed = [], buildMode = false, buildType = 'grass', hoverCell = null;
  const blockMaterials = { grass: [dirt, dirt, grass, dirt, dirt, dirt], wood: texture(['#ae8553', '#987241', '#ba935f']), stone: texture(['#a3aaa2', '#8c958d', '#b4b9ac']) };
  const ghost = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#d6e9a7', transparent: true, opacity: .48, depthWrite: false }));
  ghost.scale.set(1.03, 1.03, 1.03); ghost.visible = false; scene.add(ghost);
  function syncPlaced(blocks = []) {
    placed = blocks;
    const keys = new Set(blocks.map(b => `${b.x},${b.z},${b.y}`));
    for (const [key, mesh] of placedMeshes) if (!keys.has(key)) { placedGroup.remove(mesh); placedMeshes.delete(key); }
    for (const block of blocks) {
      const key = `${block.x},${block.z},${block.y}`;
      if (placedMeshes.has(key)) { placedMeshes.get(key).material = blockMaterials[block.type]; continue; }
      const mesh = new THREE.Mesh(geometry, blockMaterials[block.type]); mesh.position.set(block.x, block.y + .5, block.z);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.cell = { x: block.x, z: block.z };
      placedGroup.add(mesh); placedMeshes.set(key, mesh);
    }
    ghost.visible = false; redraw();
  }
  function clearGround(x, z) { return inIsland(Math.round(x), Math.round(z)) && !obstacles.some(o => Math.abs(x - o.x) < o.w && Math.abs(z - o.z) < o.d); }
  function walkable(x, z) { return clearGround(x, z) && !placed.some(b => Math.abs(x - b.x) < .8 && Math.abs(z - b.z) < .8); }
  function canPlace(x, z) { return clearGround(x, z) && Math.hypot(player.position.x - x, player.position.z - z) > .95; }
  let route = [];
  function walkTo(x, z) {
    x = Math.round(x); z = Math.round(z);
    if (!walkable(x, z)) return;
    const start = [Math.round(player.position.x), Math.round(player.position.z)];
    const key = (a, b) => `${a},${b}`;
    const queue = [start], parents = new Map([[key(...start), null]]);
    for (let i = 0; i < queue.length && i < 600; i++) {
      const [a, b] = queue[i]; if (a === x && b === z) break;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = key(a + dx, b + dz);
        if (!parents.has(next) && walkable(a + dx, b + dz)) { parents.set(next, key(a, b)); queue.push([a + dx, b + dz]); }
      }
    }
    let next = key(x, z), path = [];
    if (!parents.has(next)) return;
    while (next !== null) { path.push(next.split(',').map(Number)); next = parents.get(next); }
    route = path.reverse().slice(1);
  }
  const stationPositions = { work: [-4.5, 4.6, -1.8], life: [4.3, 4.5, -1.5], study: [.1, 5.4, -5.2] };
  function goStation(category) {
    const p = stationPositions[category]; if (p) walkTo(p[0], p[2] + 2.4);
  }
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  function hitCell(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects([...grounds, ...placedGroup.children])[0];
    return hit ? hit.object.userData.cell || { x: Math.round(hit.point.x), z: Math.round(hit.point.z) } : null;
  }
  let downPoint = null;
  renderer.domElement.addEventListener('pointerdown', event => { downPoint = [event.clientX, event.clientY]; host.focus({ preventScroll: true }); });
  renderer.domElement.addEventListener('pointerup', event => {
    if (!downPoint || Math.hypot(event.clientX - downPoint[0], event.clientY - downPoint[1]) > 12) return;
    const cell = hitCell(event);
    if (cell && buildMode) {
      if (event.button === 2) window.LifeGame.removeBlock(cell.x, cell.z);
      else window.LifeGame.placeBlock(cell.x, cell.z, buildType);
    } else if (cell) walkTo(cell.x, cell.z);
    downPoint = null;
  });
  renderer.domElement.addEventListener('contextmenu', event => { if (buildMode) event.preventDefault(); });
  renderer.domElement.addEventListener('pointermove', event => {
    if (!buildMode) return;
    hoverCell = hitCell(event);
    if (!hoverCell) { ghost.visible = false; return; }
    const height = placed.filter(b => b.x === hoverCell.x && b.z === hoverCell.z).length;
    ghost.position.set(hoverCell.x, height + .5, hoverCell.z); ghost.visible = true;
    ghost.material.color.set(canPlace(hoverCell.x, hoverCell.z) && height < 3 ? '#d6e9a7' : '#e5a28c');
    if (document.hidden || reduced) redraw();
  });
  renderer.domElement.addEventListener('pointerleave', () => { ghost.visible = false; downPoint = null; redraw(); });
  renderer.domElement.addEventListener('pointercancel', () => { downPoint = null; });
  const keys = new Set();
  host.addEventListener('keydown', event => { if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); keys.add(event.key); route = []; } });
  window.addEventListener('keyup', event => keys.delete(event.key));
  window.addEventListener('blur', () => keys.clear()); host.addEventListener('blur', () => keys.clear());
  document.querySelector('#world-rotate').addEventListener('click', () => { angle += Math.PI / 2; updateCamera(); positionLabels(); });
  document.querySelector('#world-zoom-in').addEventListener('click', () => { zoom = Math.min(1.7, zoom + .15); updateCamera(); positionLabels(); });
  document.querySelector('#world-zoom-out').addEventListener('click', () => { zoom = Math.max(.65, zoom - .15); updateCamera(); positionLabels(); });
  const particles = [];
  function celebrate() {
    if (reduced) return;
    for (let i = 0; i < 16; i++) {
      const mesh = cube(player.position.x, 1, player.position.z, .12, .12, .12, ['#e8c961', '#91b968', '#f5e6aa'][i % 3]);
      particles.push({ mesh, life: 1.4, vx: (noise(i, 1) - .5) * 4, vy: 1 + noise(i, 2) * 3, vz: (noise(i, 3) - .5) * 4 });
    }
  }
  window.LifeWorld = { goStation, celebrate, syncBuildings, syncPlaced, canPlace,
    setBuildMode(active, type = 'grass') { buildMode = active; buildType = type; route = []; keys.clear(); ghost.visible = false; redraw(); },
    getPosition: () => ({ x: player.position.x, z: player.position.z }),
  };
  syncBuildings(window.LifeGame?.getState().buildings);
  syncPlaced(window.LifeGame?.getState().placements);
  window.dispatchEvent(new Event('life:world-ready'));
  const labels = Object.entries(stationPositions).map(([id, coordinates]) => ({ element: document.querySelector(`[data-station="${id}"]`), vector: new THREE.Vector3(...coordinates) }));
  function resize() {
    const { width, height } = host.getBoundingClientRect(); if (!width || !height) return;
    renderer.setSize(width, height); const aspect = width / height;
    const half = aspect < 1 ? 12 : 9.2;
    camera.left = -half * aspect; camera.right = half * aspect; camera.top = half; camera.bottom = -half; updateCamera(); if (readyToDraw) positionLabels();
  }
  new ResizeObserver(resize).observe(host); resize();
  readyToDraw = true; redraw();
  function positionLabels() {
    for (const label of labels) {
      const p = label.vector.clone().project(camera);
      label.element.style.left = `${(p.x + 1) * 50}%`;
      label.element.style.top = `${(1 - p.y) * 50}%`;
      label.element.style.transform = 'translate(-50%,-100%)';
      label.element.style.visibility = Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.2 ? 'hidden' : 'visible';
    }
  }
  positionLabels();
  let last = performance.now(), lastDraw = 0, phase = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (now - lastDraw < 32) return;
    lastDraw = now;
    const dt = Math.min((now - last) / 1000, .05); last = now;
    if (document.hidden || document.querySelector('#game-view').hidden) return;
    let dx = 0, dz = 0;
    if (keys.size) {
      const forward = new THREE.Vector3(); camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
      const vertical = (keys.has('w') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('s') || keys.has('ArrowDown') ? 1 : 0);
      const horizontal = (keys.has('d') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('a') || keys.has('ArrowLeft') ? 1 : 0);
      dx = forward.x * vertical + right.x * horizontal; dz = forward.z * vertical + right.z * horizontal;
    } else if (route.length) {
      dx = route[0][0] - player.position.x; dz = route[0][1] - player.position.z;
      if (Math.hypot(dx, dz) < .12) { route.shift(); dx = dz = 0; }
    }
    const length = Math.hypot(dx, dz);
    if (length > .01) {
      const step = Math.min(length, dt * 2.6), x = player.position.x + dx / length * step, z = player.position.z + dz / length * step;
      if (walkable(x, z)) { player.position.x = x; player.position.z = z; }
      else route = [];
      player.rotation.y = Math.atan2(dx, dz); phase += dt * 10;
      limbs.forEach((limb, i) => { limb.rotation.x = reduced ? 0 : Math.sin(phase) * .5 * (i % 2 ? -1 : 1); });
    } else limbs.forEach(limb => { limb.rotation.x *= .8; });
    if (!reduced) { flame.scale.y = .48 + Math.sin(now * .004) * .1; head.position.y = 1.655 + Math.sin(now * .0018) * .008; }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life -= dt; p.vy -= dt * 4; p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
      if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); }
    }
    positionLabels();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
} catch (error) {
  console.error('营地渲染失败', error);
  document.querySelector('#world-fallback').hidden = false;
  document.querySelector('.world-loading')?.remove();
}
