'use strict';
// 輸入、玩家操作、鏡頭與主迴圈。

const keys = new Set();

// 數字選單：拿回砧板／桌面上的某一種原料、或放上背包裡的某一種原料
const rawMenu = (c, s, from) => [...new Set(s.items)].map((k, i) => ({ key: String(from + i), label: '拿回' + ING[k].name, ok: !c.hand, run: () => startTakeOut(c, s, k) }));
const bagMenu = (c, s, from) => c.bag.filter(x => x.kind === 'raw').map((x, i) => ({ key: String(from + i), label: '放上背包裡的' + ING[x.key].name, ok: true, run: () => startDeposit(c, s, x.key) }));

function getContext(c) {
  if (c.down > 0) return { label: '倒地中…' };
  if (c.action) return { label: c.action.label + '中' + (c.action.lock ? '（移動會中斷）' : c.action.range ? '（可在範圍內移動）' : '') };
  const tm = team(c);
  const sts = G.stations.filter(s => near(c, s)).sort((a, b) => dist(a, c) - dist(b, c));
  for (const s of sts) {
    if (s.team !== c.team) {
      if (s.type === 'stove' && flippable(s)) return { label: 'E 關火（按住 1.5 秒）', btn: '關火', run: () => startFlip(c, s) };
      continue;
    }
    switch (s.type) {
      case 'stove':
        if (s.flipped) return { label: 'E 重新開火', btn: '開火', run: () => startFix(c, s) };
        if (s.done && RECIPES[s.cooking].ability) return { label: 'E 食用' + RECIPES[s.cooking].name, btn: '食用', run: () => startEat(c, s) };
        if (s.done) return { label: 'E 取成品', btn: '取成品', run: () => startTakeDish(c, s) };
        if (s.quick) {
          if (s.raw) return { label: 'E 備料收納蔬餅（2 秒）', btn: '備料', run: () => startQuickPrep(c, s) };
          if (!s.cooking) return { label: c.hand && c.hand.kind === 'raw' && c.hand.key === 'veg' ? 'E 投入蔬菜' : '就地鍋：拿一份蔬菜來做收納蔬餅', btn: '投入', run: () => startQuickDeposit(c, s) };
          return { label: '收納蔬餅烹調中' };
        }
        if (!s.cooking && c.hand && c.hand.kind !== 'raw') return { label: c.hand.kind === 'semi' ? 'E 放鍋' : 'E 放回成品', btn: c.hand.kind === 'semi' ? '放鍋' : '放回', run: () => startPlace(c, s) };
        if (s.cooking) return { label: RECIPES[s.cooking].name + ' 烹調中' };
        break;
      case 'pass':
        if (c.hand && c.hand.kind === 'dish') return { label: 'E 交餐', btn: '交餐', run: () => startSubmit(c) };
        break;
      case 'prep': {
        // 砧板：原料要放在同一個砧板上，剛好組成一道料理才能備料（使用者指定）
        if (s.done) return { label: 'E 取半成品', btn: '取半成品', run: () => startTakeSemi(c, s) };
        if (s.recipe) return { label: 'E 繼續備料 ' + RECIPES[s.recipe].name, btn: '備料', run: () => startPrep(c, s) };
        const on = s.items.map(k => ING[k].ch).join('＋') || '空';
        if (c.hand && c.hand.kind === 'raw') return { label: 'E 放上砧板（砧板：' + on + '）', btn: '放上', run: () => startDeposit(c, s) };
        const rk = recipeOn(s), back = rawMenu(c, s, 2);
        if (!c.hand && rk) return { label: 'E 開始備料：' + RECIPES[rk].name + '（' + on + '）', btn: '備料', run: () => startPrep(c, s), menu: [{ key: '1', label: '開始備料 ' + RECIPES[rk].name, ok: true, run: () => startPrep(c, s) }, ...back] };
        if (!c.hand && bagRaw(c) && s.items.length < CFG.BOARD_CAP) return { label: 'E 從背包放上砧板（砧板：' + on + '）', btn: '放上', run: () => startDeposit(c, s), menu: bagMenu(c, s, 1).concat(back.map((m, i) => ({ ...m, key: String(i + 1 + c.bag.filter(x => x.kind === 'raw').length) }))) };
        if (!c.hand && s.items.length) return { label: 'E 拿回原料（砧板：' + on + '，組不成料理）', btn: '拿回', run: () => startTakeOut(c, s) };
        return { label: '砧板：放上一道料理需要的原料（例：菜＋菇＝雙蔬煎盤）' };
      }
      case 'table': {
        const on = s.items.map(k => ING[k].ch).join('＋') || '空';
        if (c.hand && c.hand.kind === 'raw') return { label: 'E 放上桌面（' + s.items.length + '/' + CFG.TABLE_CAP + '）', btn: '放上', run: () => startDeposit(c, s) };
        if (!c.hand && bagRaw(c) && s.items.length < CFG.TABLE_CAP) return { label: 'E 從背包放上桌面（' + s.items.length + '/' + CFG.TABLE_CAP + '）', btn: '放上', run: () => startDeposit(c, s) };
        if (!c.hand && s.items.length) return { label: 'E 拿起原料（桌面：' + on + '）', btn: '拿起', run: () => startTakeOut(c, s), menu: rawMenu(c, s, 1) };
        if (s.items.length) return { label: '桌面：' + on };
        break;
      }
      case 'tool':
        return { label: '按數字換工具（目前 ' + TOOLS[c.tool] + '）', menu: TOOL_KEYS.map((k, i) => ({ key: String(i + 1), label: TOOLS[k] + '（剋制' + Object.values(ING).filter(g => g.tool === k).map(g => g.name).join('、') + '）', ok: c.tool !== k, run: () => startTool(c, k) })) };
    }
  }
  const it = G.items.filter(i => near(c, i, 44) && (i.team === undefined || i.team === c.team)).sort((a, b) => dist(a, c) - dist(b, c))[0];
  if (it) {
    if (!c.hand) return { label: 'E 拾取' + itemName(it), btn: '拾取', run: () => startPick(c, it) };
    if (it.kind !== 'dish' && bagFree(c) > 0) return { label: 'E 把' + itemName(it) + '收進背包（1 秒前搖）', btn: '收進背包', run: () => startStoreBag(c, it) };
  }
  const n = G.nodes.filter(n => near(c, n, CFG.WORK_RANGE)).sort((a, b) => dist(a, c) - dist(b, c))[0];
  if (n) {
    if (n.hp <= 0) return { label: '食材怪物重生中 ' + Math.ceil(n.respawn) + ' 秒' };
    return { label: 'E 攻擊' + ING[n.type].name + '怪物（血量 ' + n.hp + '/' + CFG.MONSTER_HP + '，最後一擊拿到食材）', btn: '攻擊', run: () => startGather(c, n) };
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
  // 觸控搖桿：方向＝手指相對錨點的方向；拖得越遠越快，超過半徑就是全速
  let mag = 1;
  const j = UI.joy;
  if (j) {
    const dx = j.x - j.ax, dy = j.y - j.ay, d = Math.hypot(dx, dy);
    if (d > JOY_DEAD) { mx = dx / d; my = dy / d; mag = Math.min(1, d / JOY_R); }
  }
  const winding = c.action && c.action.label === '打暈前搖';
  if (!UI.touchMode && !winding) { const m = toWorld(UI.mouse.x, UI.mouse.y); c.face = Math.atan2(m.y - c.y, m.x - c.x); }
  if (!mx && !my) return;
  if (UI.touchMode && !winding) c.face = Math.atan2(my, mx);   // 觸控時面向移動方向
  if (c.action && c.action.lock) cancelAction(c, c.action.label + '被移動中斷');
  if (c.action && c.action.lock) return;
  const l = Math.hypot(mx, my), sp = speedOf(c) * dt * mag;
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
  else if (code === 'Space') { const m = toWorld(UI.mouse.x, UI.mouse.y); r = startStun(c, UI.touchMode ? touchAim(c) : Math.atan2(m.y - c.y, m.x - c.x)); }
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
    if (e.code === 'KeyT') startTutorial();
    if (e.code === 'Enter') startGame(false);
    if (e.code === 'KeyV') startGame(true);
    return;
  }
  if (G.tutorial && tutorialKey(e.code)) return;
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
cv.addEventListener('mousemove', e => { UI.mouse.x = e.clientX; UI.mouse.y = e.clientY; UI.touchMode = false; });

// ---------------------------------------------------------------- 觸控操作
// 左半邊：手指按下的位置就是錨點，往不同方向拖就移動；放開手指取消錨點，下次按下再重新放置。
// 右下角：最大的「互動」按鈕（顯示當下的互動名稱，代替 E），旁邊是打暈、放下、收包、背包；右上角：暫停。
// 選單項目可以直接點。點螢幕右半邊本身不觸發動作。
const JOY_R = 60, JOY_DEAD = 8;   // 搖桿半徑與中心死區（實際像素）
const BTN_R = 30;                 // 按鈕半徑（實際像素，配合手指大小，不隨介面縮放）
UI.joy = null;

// 觸控裝置（或剛用過觸控）才顯示手機按鈕
const touchUI = () => UI.touchMode || (window.matchMedia && matchMedia('(pointer: coarse)').matches);

// 互動按鈕要顯示的名稱與動作：靠近物件或設施時顯示對應的互動名稱
function interactButton(c) {
  const st = G.tutorial && TUT_STEPS[G.tutorial.i];
  if (st && st.info) return { label: st.final ? '開始' : '繼續', on: true, run: () => tutorialKey('Enter') };
  if (c.down > 0) return { label: '倒地', on: false };
  if (c.action) return { label: c.action.label.slice(0, 4), on: false };
  const cx = getContext(c);
  if (cx && cx.run) return { label: cx.btn || '互動', on: true, run: () => playerKey('KeyE') };
  if (cx && cx.menu && !cx.run) return { label: '點選單', on: false };
  return { label: '互動', on: false };
}

function touchButtons() {
  if (G.state !== 'play' || G.spectate || G.paused || !touchUI()) return [];
  const c = player();
  const ib = interactButton(c);
  return [
    { ...ib, primary: true, x: VW - 66, y: VH - 66, r: BTN_R + 12, run: ib.run || (() => {}) },
    { label: '打暈', x: VW - 162, y: VH - 46, r: BTN_R, on: stunReady(c) === true, run: () => playerKey('Space') },
    { label: '放下', x: VW - 150, y: VH - 128, r: BTN_R - 2, on: !!c.hand, run: () => playerKey('KeyQ') },
    { label: '收包', x: VW - 92, y: VH - 160, r: BTN_R - 2, on: bagFree(c) > 0 && !!c.hand && c.hand.kind !== 'dish', run: () => playerKey('KeyR') },
    { label: '背包', x: VW - 30, y: VH - 160, r: BTN_R - 2, on: true, active: UI.bagOpen, run: () => { UI.bagOpen = !UI.bagOpen; UI.drag = null; } },
    { label: '暫停', x: VW - 30, y: 28, r: 22, on: true, small: true, run: () => { G.paused = true; UI.joy = null; } },
  ];
}
const buttonAt = p => touchButtons().find(b => Math.hypot(p.x - b.x, p.y - b.y) <= b.r + 6);

// 觸控打暈：自動瞄準附近看得到的敵人；沒有就朝面向方向
function touchAim(c) {
  let best = null, bd = CFG.STUN_RANGE + CFG.R + 60;
  for (const e of G.chars) {
    if (e.team === c.team || e.down > 0) continue;
    const d = dist(c, e);
    if (d < bd && canSee(c.team, e)) { bd = d; best = e; }
  }
  return best ? Math.atan2(best.y - c.y, best.x - c.x) : c.face;
}

// 暫停畫面的按鈕（介面座標）
function tapPause(u) {
  if (inRect(u, UI.resumeBtn)) { G.paused = false; return true; }
  if (inRect(u, UI.quitBtn)) { G.paused = false; G.tutorial = null; newMatch(); G.state = 'title'; return true; }
  return false;
}

// 點選單項目（選料理、選工具）
function tapMenuItem(u) {
  // 只有當下真的有選單時才算點選單（選單位置是上一幀畫的，避免用到過期的位置）
  const cx = G.state === 'play' && getContext(player());
  if (!cx || !cx.menu) return false;
  const m = UI.menuRects && UI.menuRects.find(r => inRect(u, r));
  if (!m) return false;
  playerKey('Digit' + m.key);
  return true;
}

// 背包拖曳：按在背包格上開始，放開時在框外就丟棄
function startBagDrag(u, touchId) {
  const c = player();
  if (!UI.bagOpen || !UI.slotRects) return false;
  const i = UI.slotRects.findIndex((r, k) => c.bag[k] && inRect(u, r));
  if (i < 0) return false;
  UI.drag = { item: c.bag[i], touchId };
  return true;
}
function finishBagDrag() {
  const c = player();
  if (!UI.drag) return;
  if (c.bag.includes(UI.drag.item) && !inRect(uiMouse(), UI.bagRect)) { dropBag(c, UI.drag.item); toast('已丟棄到腳邊'); if (G.tutorial) G.tutorial.dragged = true; }
  UI.drag = null;
}

function onTouchStart(e) {
  e.preventDefault();
  UI.touchMode = true;
  for (const t of e.changedTouches) {
    const p = { x: t.clientX, y: t.clientY }, u = { x: p.x / UI_SCALE, y: p.y / UI_SCALE };
    if (tapMenu(u)) return;
    if (G.paused) { tapPause(u); return; }
    if (tapTutorialPanel(u)) continue;   // 教學面板蓋在按鈕上面，點面板優先
    const b = buttonAt(p);
    if (b) { b.run(); continue; }
    UI.mouse.x = p.x; UI.mouse.y = p.y;
    if (startBagDrag(u, t.identifier)) continue;
    if (tapMenuItem(u)) continue;
    if (p.x < VW / 2 && !UI.joy) UI.joy = { id: t.identifier, ax: p.x, ay: p.y, x: p.x, y: p.y };
  }
}
function onTouchMove(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (UI.joy && t.identifier === UI.joy.id) { UI.joy.x = t.clientX; UI.joy.y = t.clientY; }
    if (UI.drag && t.identifier === UI.drag.touchId) { UI.mouse.x = t.clientX; UI.mouse.y = t.clientY; }
  }
}
function onTouchEnd(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (UI.joy && t.identifier === UI.joy.id) UI.joy = null;
    if (UI.drag && t.identifier === UI.drag.touchId) { UI.mouse.x = t.clientX; UI.mouse.y = t.clientY; finishBagDrag(); }
  }
}
cv.addEventListener('touchstart', onTouchStart, { passive: false });
cv.addEventListener('touchmove', onTouchMove, { passive: false });
cv.addEventListener('touchend', onTouchEnd, { passive: false });
cv.addEventListener('touchcancel', onTouchEnd, { passive: false });
// 標題與結算畫面：點擊螢幕任何地方開始遊戲；點「教學關卡」按鈕進入教學
function tapMenu(p) {
  if (G.state === 'play') return false;
  if (inRect(p, UI.tutBtn)) startTutorial(); else startGame(false);
  return true;
}

cv.addEventListener('mousedown', e => {
  UI.mouse.x = e.clientX; UI.mouse.y = e.clientY;
  const u = uiMouse();
  if (tapMenu(u)) return;
  if (G.paused) { tapPause(u); return; }
  if (tapTutorialPanel(u)) return;
  if (startBagDrag(u)) return;
  tapMenuItem(u);
});
cv.addEventListener('mouseup', () => finishBagDrag());
cv.addEventListener('wheel', e => {
  e.preventDefault();
  UI.fit = false;
  cam.zoom = clamp(cam.zoom * (e.deltaY < 0 ? 1.1 : 0.9), 0.3 * screenFactor(), 1.6);
}, { passive: false });

function updateCamera(dt) {
  if (UI.fit || G.state === 'title') {
    const z = Math.min(VW / W, VH / H);
    cam.zoom += (z - cam.zoom) * Math.min(1, dt * 6);
    cam.x += (W / 2 - cam.x) * Math.min(1, dt * 6); cam.y += (H / 2 - cam.y) * Math.min(1, dt * 6);
    return;
  }
  const base = 0.8 * screenFactor();
  if (UI.zoomFor !== base) { UI.zoomFor = base; cam.zoom = base; }   // 螢幕大小改變時重設成該螢幕的預設縮放
  if (cam.zoom < base * 0.7) cam.zoom += (base - cam.zoom) * Math.min(1, dt * 4);
  const c = player();
  cam.x += (c.x - cam.x) * Math.min(1, dt * 6); cam.y += (c.y - cam.y) * Math.min(1, dt * 6);
}

function step(h) {
  if (G.tutorial) tutorialUpdate(h);
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
