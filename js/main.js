'use strict';
// 輸入、玩家操作、鏡頭與主迴圈。

const keys = new Set();

function getContext(c) {
  if (c.down > 0) return { label: '倒地中…' };
  if (c.action) return { label: c.action.label + '中' + (c.action.lock ? '（移動會中斷）' : '') };
  const tm = team(c);
  const sts = G.stations.filter(s => near(c, s)).sort((a, b) => dist(a, c) - dist(b, c));
  for (const s of sts) {
    if (s.team !== c.team) {
      if (s.type === 'stove' && flippable(s)) return { label: 'E 翻鍋（按住 1.5 秒，對方會收到警示）', run: () => startFlip(c, s) };
      continue;
    }
    switch (s.type) {
      case 'stove':
        if (s.flipped) return { label: 'E 扶正鍋子', run: () => startFix(c, s) };
        if (s.done && RECIPES[s.cooking].ability) return { label: 'E 食用' + RECIPES[s.cooking].name, run: () => startEat(c, s) };
        if (s.done) return { label: c.gloves ? 'E 取成品' : '成品要戴手套才能拿（到手套架按 E）', run: () => startTakeDish(c, s) };
        if (s.quick) {
          if (s.raw) return { label: 'E 備料收納蔬餅（2 秒）', run: () => startQuickPrep(c, s) };
          if (!s.cooking) return { label: c.hand && c.hand.kind === 'raw' && c.hand.key === 'veg' ? 'E 投入蔬菜' : '就地鍋：拿一份蔬菜來做收納蔬餅', run: () => startQuickDeposit(c, s) };
          return { label: '收納蔬餅烹調中' };
        }
        if (!s.cooking && c.hand && c.hand.kind !== 'raw') return { label: c.hand.kind === 'semi' ? 'E 放鍋' : 'E 放回成品', run: () => startPlace(c, s) };
        if (s.cooking) return { label: RECIPES[s.cooking].name + ' 烹調中' };
        break;
      case 'pass':
        if (c.hand && c.hand.kind === 'dish') return { label: 'E 交餐', run: () => startSubmit(c) };
        break;
      case 'prep':
        if (s.done) return { label: 'E 取半成品', run: () => startTakeSemi(c, s) };
        if (s.recipe) return { label: 'E 繼續備料 ' + RECIPES[s.recipe].name, run: () => startPrep(c, s, s.recipe) };
        if (!c.hand) return {
          label: '按數字選料理開始備料（倉庫 ' + tm.storage.items.map(k => ING[k].ch).join('') + (bagRaw(c) ? '＋背包 ' + c.bag.filter(i => i.kind === 'raw').map(i => ING[i.key].ch).join('') : '') + '）',
          menu: PREP_MENU.map((k, i) => ({ key: String(i + 1), label: RECIPES[k].name + '（' + RECIPES[k].ings.map(x => ING[x].ch).join('＋') + '）', ok: hasAll(prepPool(c), RECIPES[k].ings), run: () => startPrep(c, s, k) })),
        };
        break;
      case 'storage':
        if ((c.hand && c.hand.kind === 'raw') || (!c.hand && bagRaw(c))) return { label: 'E 入庫（' + s.items.length + '/' + CFG.STORAGE_CAP + '）', run: () => startDeposit(c) };
        if (!c.hand && s.items.length) return { label: 'E 取出一份原料', run: () => startTakeOut(c) };
        break;
      case 'tool':
        return { label: '按數字換工具（目前 ' + TOOLS[c.tool] + '）', menu: TOOL_KEYS.map((k, i) => ({ key: String(i + 1), label: TOOLS[k] + '（剋制' + Object.values(ING).filter(g => g.tool === k).map(g => g.name).join('、') + '）', ok: c.tool !== k, run: () => startTool(c, k) })) };
      case 'glove':
        return { label: c.gloves ? 'E 脫下手套' : 'E 戴上手套（拿成品必備）', run: () => startGlove(c, !c.gloves) };
    }
  }
  const it = G.items.filter(i => near(c, i, 44)).sort((a, b) => dist(a, c) - dist(b, c))[0];
  if (it) {
    if (!c.hand) return { label: 'E 拾取' + itemName(it) + (it.kind === 'dish' && !c.gloves ? '（需要手套）' : ''), run: () => startPick(c, it) };
    if (it.kind !== 'dish' && bagFree(c) > 0) return { label: 'E 把' + itemName(it) + '收進背包（1 秒前搖）', run: () => startStoreBag(c, it) };
  }
  const n = G.nodes.filter(n => near(c, n)).sort((a, b) => dist(a, c) - dist(b, c))[0];
  if (n) {
    if (n.hp <= 0) return { label: '採集點重生中 ' + Math.ceil(n.respawn) + ' 秒' };
    return { label: 'E 採集' + ING[n.type].name + (ING[n.type].tool === c.tool ? '' : '（' + TOOLS[c.tool] + '不剋制，較慢）'), run: () => startGather(c, n) };
  }
  return null;
}

function controlPlayer(dt) {
  const c = player();
  if (c.ai || c.down > 0) return;
  let mx = 0, my = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  const m = toWorld(UI.mouse.x, UI.mouse.y);
  if (!(c.action && c.action.label === '打暈前搖')) c.face = Math.atan2(m.y - c.y, m.x - c.x);
  if (!mx && !my) return;
  if (c.action && c.action.lock) cancelAction(c, c.action.label + '被移動中斷');
  if (c.action && c.action.lock) return;
  const l = Math.hypot(mx, my), sp = speedOf(c) * dt;
  moveChar(c, mx / l * sp, my / l * sp);
}

function playerKey(code) {
  const c = player();
  if (c.ai || G.state !== 'play' || G.paused) return;
  let r = null;
  if (code === 'KeyE') { const cx = getContext(c); if (cx && cx.run) r = cx.run(); else if (cx && !cx.menu) r = cx.label; }
  else if (/^Digit[1-5]$/.test(code)) {
    const cx = getContext(c);
    const m = cx && cx.menu && cx.menu.find(x => x.key === code.slice(5));
    if (m) r = m.run();
  } else if (code === 'KeyQ') r = dropHand(c);
  else if (code === 'KeyR') r = startStoreBag(c, 'hand');
  else if (code === 'Space') { const m = toWorld(UI.mouse.x, UI.mouse.y); r = startStun(c, Math.atan2(m.y - c.y, m.x - c.x)); }
  if (typeof r === 'string') say(c, r);
}

function startGame(spectate) {
  G.spectate = spectate;
  newMatch();
  G.state = 'play'; G.paused = false;
  UI.fit = spectate;
  if (!spectate) { cam.x = player().x; cam.y = player().y; }
}

addEventListener('keydown', e => {
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (G.state !== 'play') {
    if (e.code === 'Enter') startGame(false);
    if (e.code === 'KeyV') startGame(true);
    return;
  }
  switch (e.code) {
    case 'Tab': UI.bagOpen = !UI.bagOpen; UI.drag = null; return;
    case 'KeyH': UI.help = !UI.help; return;
    case 'KeyP': G.paused = !G.paused; return;
    case 'KeyM': G.reveal = !G.reveal; return;
    case 'KeyZ': UI.fit = !UI.fit; return;
    case 'KeyV':
      G.spectate = !G.spectate; player().ai = G.spectate; player().name = G.spectate ? '藍1' : '你';
      if (!G.spectate) { endJob(player()); cancelAction(player()); }
      UI.fit = G.spectate; return;
    case 'Equal': case 'NumpadAdd': G.speed = Math.min(8, G.speed * 2); return;
    case 'Minus': case 'NumpadSubtract': G.speed = Math.max(1, G.speed / 2); return;
  }
  playerKey(e.code);
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const inRect = (p, r) => r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
cv.addEventListener('mousemove', e => { UI.mouse.x = e.clientX; UI.mouse.y = e.clientY; });
cv.addEventListener('mousedown', e => {
  const c = player();
  if (!UI.bagOpen || !UI.slotRects) return;
  UI.slotRects.forEach((r, i) => { if (c.bag[i] && inRect(uiMouse(), r)) UI.drag = { item: c.bag[i] }; });
});
cv.addEventListener('mouseup', () => {
  const c = player();
  if (UI.drag) {
    if (c.bag.includes(UI.drag.item) && !inRect(uiMouse(), UI.bagRect)) { dropBag(c, UI.drag.item); toast('已丟棄到腳邊'); }
    UI.drag = null;
  }
});
cv.addEventListener('wheel', e => {
  e.preventDefault();
  UI.fit = false;
  cam.zoom = clamp(cam.zoom * (e.deltaY < 0 ? 1.1 : 0.9), 0.3, 1.6);
}, { passive: false });

function updateCamera(dt) {
  if (UI.fit || G.state === 'title') {
    const z = Math.min(VW / W, VH / H);
    cam.zoom += (z - cam.zoom) * Math.min(1, dt * 6);
    cam.x += (W / 2 - cam.x) * Math.min(1, dt * 6); cam.y += (H / 2 - cam.y) * Math.min(1, dt * 6);
    return;
  }
  if (cam.zoom < 0.55) cam.zoom += (0.8 - cam.zoom) * Math.min(1, dt * 4);
  const c = player();
  cam.x += (c.x - cam.x) * Math.min(1, dt * 6); cam.y += (c.y - cam.y) * Math.min(1, dt * 6);
}

function step(h) {
  controlPlayer(h);
  updateAI(h);
  updateWorld(h);
}

let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (G.state === 'play' && !G.paused && !UI.help) {
    let sim = dt * G.speed;
    while (sim > 1e-6 && G.state === 'play') { const h = Math.min(sim, 1 / 60); step(h); sim -= h; }
  }
  updateCamera(dt);
  render();
  requestAnimationFrame(frame);
}

newMatch();          // 標題畫面背景先建好地圖
window.__game = { G, CFG, startGame, step };
requestAnimationFrame(frame);
