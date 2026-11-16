'use strict';
// 規則：物品、角色動作、訂單、打暈與翻鍋。玩家與 NPC 共用同一套 start* 函式。

const team = c => G.teams[c.team];
const player = () => G.chars[0];

function log(teamId, text) {
  G.logs.unshift({ t: G.time, team: teamId, text });
  if (G.logs.length > 40) G.logs.pop();
}
function toast(text, color = '#fff') { G.toasts.push({ text, color, t: 0 }); if (G.toasts.length > 3) G.toasts.shift(); }
function floatText(x, y, text, color) { G.fx.push({ type: 'text', x, y, text, color, t: 0, dur: 1.4 }); }
const say = (c, msg) => { if (c === player() && !c.ai && typeof msg === 'string') toast(msg, '#ffd27a'); };

// ---------------------------------------------------------------- 角色
function makeChar(id, t, idx, name) {
  const sp = G.teams[t].spawn[idx];
  return {
    id, team: t, idx, name, x: sp.x, y: sp.y, face: t === 0 ? 0 : Math.PI,
    hand: null, bag: [], hasBag: false, tool: idx === 0 ? 'knife' : 'mallet', gloves: false,
    stunOK: false, charges: 0, stunCd: 0, flipCd: 0, down: 0, immune: 0,
    action: null, ai: true, job: null, path: null, pathGoal: null, repath: 0,
  };
}

function speedOf(c) {
  let s = CFG.SPEED;
  if (bagFull(c)) s *= CFG.BAG_SLOW;   // 滿包才減速
  if (c.hand) s *= CFG.HAND_SPEED;
  if (c.action && c.action.slow) s *= 0.5;
  return s;
}

// ---------------------------------------------------------------- 物品
function spawnItem(kind, key, x, y) {
  const it = { id: ++G.itemSeq, kind, key, x, y, life: CFG.GROUND_LIFE, res: null };
  for (let k = 0; k < 6; k++) { if (!blockedAt(it.x, it.y)) break; it.x += (Math.random() - 0.5) * 30; it.y += (Math.random() - 0.5) * 30; }
  G.items.push(it); return it;
}
function placeOnGround(it, x, y) {
  it.x = x + (Math.random() - 0.5) * 24; it.y = y + (Math.random() - 0.5) * 24; it.res = null;
  if (blockedAt(it.x, it.y)) { it.x = x; it.y = y; }
  G.items.push(it);
}
const removeItem = it => { const i = G.items.indexOf(it); if (i >= 0) G.items.splice(i, 1); };
const itemName = it => (it.kind === 'raw' ? ING[it.key].name : (it.kind === 'semi' ? RECIPES[it.key].name + '（半成品）' : RECIPES[it.key].name));

// ---------------------------------------------------------------- 動作框架
function act(c, label, dur, onDone, o = {}) {
  c.action = { label, dur, t: 0, onDone, check: o.check, tick: o.tick, slow: !!o.slow, lock: o.lock !== false, onCancel: o.onCancel, ok: false, cancelled: false };
  return true;
}
function cancelAction(c, why) {
  const a = c.action;
  if (!a) return;
  c.action = null; a.cancelled = true;
  if (a.onCancel) a.onCancel();
  if (why) say(c, why);
}
function updateAction(c, dt) {
  const a = c.action;
  if (!a) return;
  if (a.check && !a.check()) { cancelAction(c, a.label + '中斷'); return; }
  a.t += dt;
  const fin = a.tick ? a.tick(dt) : a.t >= a.dur;
  if (fin && c.action === a) { c.action = null; a.ok = true; a.onDone && a.onDone(); }
}
const near = (c, o, r = CFG.INTERACT) => dist(c, o) <= r;
const busy = c => c.down > 0 || c.action;

// ---------------------------------------------------------------- 互動（回傳 true 或失敗原因）
function startGather(c, n) {
  if (busy(c)) return '動作中';
  if (c.hand) return '手上有東西，先放下';
  if (c.gloves) return '戴著手套不能用工具採集';
  if (!near(c, n)) return '離採集點太遠';
  if (n.hp <= 0) return '採集點重生中';
  const a = { acc: 0 };
  return act(c, '採集', 99, null, {
    check: () => near(c, n, CFG.INTERACT + 8) && !c.hand && (n.hp > 0 || a.done),
    tick: dt => {
      a.acc += dt;
      if (a.acc < CFG.GATHER_INT) return false;
      a.acc -= CFG.GATHER_INT;
      n.hp -= ING[n.type].tool === c.tool ? CFG.DMG_STRONG : CFG.DMG_WEAK;
      G.fx.push({ type: 'hit', x: n.x, y: n.y, t: 0, dur: 0.25 });
      if (n.hp > 0) return false;
      n.hp = 0; n.respawn = CFG.NODE_RESPAWN; a.done = true;
      const ang = Math.atan2(c.y - n.y, c.x - n.x);
      c.lastGathered = spawnItem('raw', n.type, n.x + Math.cos(ang) * 22, n.y + Math.sin(ang) * 22);
      return true;
    },
  });
}

function startPick(c, it) {
  if (busy(c)) return '動作中';
  if (!it || !G.items.includes(it)) return '東西已經不見了';
  if (c.hand) return '雙手只能拿一件';
  if (!near(c, it, 44)) return '太遠';
  if (it.kind === 'dish' && !c.gloves) return '成品要戴手套才能拿';
  return act(c, '拾取', CFG.PICK, () => { removeItem(it); c.hand = it; }, {
    check: () => G.items.includes(it) && !c.hand && near(c, it, 50),
  });
}

// 背包是最多 CFG.BAG_SLOTS 件的清單
const bagFull = c => c.bag.length >= CFG.BAG_SLOTS;
const bagFree = c => (c.hasBag ? CFG.BAG_SLOTS - c.bag.length : 0);
const bagRaw = c => c.bag.find(i => i.kind === 'raw');
const carried = c => (c.hand ? [c.hand] : []).concat(c.bag);
// 備料時可用的原料：自家倉庫＋自己背包裡的原料
const prepPool = c => team(c).storage.items.concat(c.bag.filter(i => i.kind === 'raw').map(i => i.key));

function startStoreBag(c, it) {
  if (busy(c)) return '動作中';
  if (!c.hasBag) return '尚未解鎖背包（吃收納蔬餅）';
  if (bagFull(c)) return '背包兩格都滿了';
  const fromHand = it === 'hand';
  const obj = fromHand ? c.hand : it;
  if (!obj) return '沒有可收的東西';
  if (obj.kind === 'dish') return '成品不能放進背包';
  if (!fromHand && !G.items.includes(obj)) return '東西已經不見了';
  return act(c, '收納前搖', CFG.BAG_PREP, () => {
    if (fromHand) c.hand = null; else removeItem(obj);
    c.bag.push(obj);
  }, { check: () => (fromHand ? c.hand === obj : G.items.includes(obj) && near(c, obj, 50)) && !bagFull(c) });
}

function dropHand(c) {
  if (!c.hand || c.down > 0) return '手上沒有東西';
  if (c.action) cancelAction(c);
  placeOnGround(c.hand, c.x, c.y); c.hand = null; return true;
}
function dropBag(c, it) {
  if (!c.bag.length || c.down > 0) return '背包是空的';
  const i = it ? c.bag.indexOf(it) : c.bag.length - 1;
  if (i < 0) return '背包裡沒有這件';
  placeOnGround(c.bag.splice(i, 1)[0], c.x, c.y); return true;
}

function startDeposit(c) {
  const s = team(c).storage;
  if (busy(c)) return '動作中';
  if (!near(c, s)) return '離倉庫太遠';
  const fromHand = c.hand && c.hand.kind === 'raw';
  const fromBag = !fromHand && bagRaw(c);
  if (!fromHand && !fromBag) return '沒有原料可以入庫';
  if (s.items.length >= CFG.STORAGE_CAP) return '倉庫已滿（最多三份原料）';
  const it = fromHand ? c.hand : fromBag;
  return act(c, '入庫', CFG.DEPOSIT, () => {
    if (fromHand) c.hand = null; else c.bag.splice(c.bag.indexOf(it), 1);
    s.items.push(it.key);
  }, { check: () => s.items.length < CFG.STORAGE_CAP && (fromHand ? c.hand === it : c.bag.includes(it)) });
}

function startTakeOut(c) {
  const s = team(c).storage;
  if (busy(c)) return '動作中';
  if (c.hand) return '雙手只能拿一件';
  if (!s.items.length) return '倉庫是空的';
  return act(c, '取出原料', CFG.TAKE, () => { const k = s.items.pop(); if (k) c.hand = { id: ++G.itemSeq, kind: 'raw', key: k, life: CFG.GROUND_LIFE }; });
}

const hasAll = (pool, ings) => { const p = pool.slice(); for (const k of ings) { const i = p.indexOf(k); if (i < 0) return false; p.splice(i, 1); } return true; };

function activeRecipes(t) {
  const tm = G.teams[t], set = new Set();
  for (const p of tm.preps) if (p.recipe) set.add(p.recipe);
  for (const s of tm.stoves) if (s.cooking) set.add(s.cooking);
  for (const c of G.chars) if (c.team === t) for (const it of carried(c)) if (it.kind !== 'raw') set.add(it.key);
  return set;
}

function startPrep(c, p, rk) {
  if (busy(c)) return '動作中';
  if (p.team !== c.team) return '不能用對方的備料台';
  if (!near(c, p)) return '離備料台太遠';
  if (c.hand) return '雙手要空著才能備料';
  if (p.done) return '先把半成品拿走';
  const r = RECIPES[rk];
  if (!p.recipe) {
    if (r.quick) return '收納蔬餅要在就地鍋做';
    if (!r.ability && activeRecipes(c.team).has(rk)) return '同隊不能同時做同一道菜';
    const s = team(c).storage;
    if (!hasAll(prepPool(c), r.ings)) return '原料不足（倉庫＋自己背包）：需要 ' + r.ings.map(k => ING[k].name).join('＋');
    // 使用者指定：備料台可以直接用備料者自己背包裡的原料；先扣背包，倉庫留給隊友
    for (const k of r.ings) {
      const bi = c.bag.findIndex(i => i.kind === 'raw' && i.key === k);
      if (bi >= 0) c.bag.splice(bi, 1); else s.items.splice(s.items.indexOf(k), 1);
    }
    p.recipe = rk; p.progress = 0;
  } else if (p.recipe !== rk) return '這張備料台正在做' + RECIPES[p.recipe].name;
  const need = RECIPES[p.recipe].ings.length * CFG.PREP_PER_ING;
  p.user = c.id;
  return act(c, '備料', need, () => { p.done = true; p.user = null; }, {
    check: () => near(c, p, CFG.INTERACT + 8) && !c.hand,
    tick: dt => { p.progress += dt; return p.progress >= need; },
    onCancel: () => { p.user = null; },
  });
}

function startTakeSemi(c, p) {
  if (busy(c)) return '動作中';
  if (!p.done) return '還沒備好料';
  if (c.hand) return '雙手只能拿一件';
  if (!near(c, p)) return '太遠';
  return act(c, '取半成品', CFG.TAKE, () => {
    c.hand = { id: ++G.itemSeq, kind: 'semi', key: p.recipe, life: CFG.GROUND_LIFE };
    p.recipe = null; p.done = false; p.progress = 0;
  }, { check: () => p.done && !c.hand });
}

const stoveEmpty = s => !s.cooking && !(s.quick && s.raw);

function startPlace(c, s) {
  if (busy(c)) return '動作中';
  if (s.team !== c.team) return '不能用對方的爐台';
  if (s.quick) return '就地鍋只能做收納蔬餅';
  if (!near(c, s)) return '太遠';
  if (!stoveEmpty(s)) return '爐台正在使用';
  const it = c.hand;
  if (!it || (it.kind !== 'semi' && it.kind !== 'dish')) return '手上要拿半成品';
  if (it.kind === 'dish' && !c.gloves) return '要戴手套';
  return act(c, it.kind === 'semi' ? '放鍋' : '放回成品', CFG.PLACE, () => {
    c.hand = null;
    Object.assign(s, { cooking: it.key, progress: it.kind === 'dish' ? RECIPES[it.key].cook : 0, done: it.kind === 'dish', doneAt: G.time, flipped: false, flippedOnce: false });
  }, { check: () => c.hand === it && stoveEmpty(s) });
}

function startTakeDish(c, s) {
  if (busy(c)) return '動作中';
  if (!s.done || RECIPES[s.cooking].ability) return '沒有可拿的成品';
  if (c.hand) return '雙手只能拿一件';
  if (!c.gloves) return '成品要戴手套才能拿（到手套架）';
  if (!near(c, s)) return '太遠';
  return act(c, '取成品', CFG.TAKE, () => {
    c.hand = { id: ++G.itemSeq, kind: 'dish', key: s.cooking, life: CFG.GROUND_LIFE };
    Object.assign(s, { cooking: null, progress: 0, done: false, flipped: false, flippedOnce: false });
  }, { check: () => s.done && !c.hand && c.gloves });
}

function canEat(c, rk) {
  if (rk === 'cake') return c.hasBag ? '背包已解鎖，重吃不能擴格' : true;
  if (rk === 'soup') return c.stunOK && c.charges > 0 ? '打暈次數用完才能再吃' : true;
  return '這道菜不能吃';
}
function startEat(c, s) {
  if (busy(c)) return '動作中';
  if (s.team !== c.team) return '只能在自家廚房食用';
  if (!s.done) return '還沒煮好';
  const ok = canEat(c, s.cooking);
  if (ok !== true) return ok;
  if (!near(c, s)) return '太遠';
  return act(c, '食用', CFG.EAT, () => {
    const rk = s.cooking;
    Object.assign(s, { cooking: null, progress: 0, done: false, flipped: false, flippedOnce: false });
    if (rk === 'cake') { c.hasBag = true; log(c.team, c.name + ' 吃了收納蔬餅，背包解鎖'); }
    else { c.stunOK = true; c.charges = CFG.CHARGES; log(c.team, c.name + ' 吃了力量燉湯，打暈 3 次'); }
    floatText(c.x, c.y - 30, rk === 'cake' ? '背包 +1' : '打暈 ×3', '#ffe08a');
  }, { check: () => s.done && canEat(c, s.cooking) === true });
}

function startQuickDeposit(c, s) {
  if (busy(c)) return '動作中';
  if (!s.quick || s.team !== c.team) return '不是自家就地鍋';
  if (!stoveEmpty(s)) return '就地鍋正在使用';
  if (!c.hand || c.hand.key !== 'veg' || c.hand.kind !== 'raw') return '要拿一份蔬菜';
  return act(c, '投入蔬菜', CFG.DEPOSIT, () => { c.hand = null; s.raw = true; s.prepP = 0; }, { check: () => c.hand && c.hand.key === 'veg' && stoveEmpty(s) });
}
function startQuickPrep(c, s) {
  if (busy(c)) return '動作中';
  if (!s.raw) return '鍋裡沒有蔬菜';
  if (c.hand) return '雙手要空著';
  const need = RECIPES.cake.ings.length * CFG.PREP_PER_ING;
  return act(c, '備料', need, () => { s.raw = false; Object.assign(s, { cooking: 'cake', progress: 0, done: false, flipped: false, flippedOnce: false }); }, {
    check: () => s.raw && near(c, s, CFG.INTERACT + 8) && !c.hand,
    tick: dt => { s.prepP += dt; return s.prepP >= need; },
  });
}

function startSubmit(c) {
  const ps = team(c).pass;
  if (busy(c)) return '動作中';
  if (!c.hand || c.hand.kind !== 'dish') return '手上要拿成品';
  if (!near(c, ps)) return '離出餐口太遠';
  const it = c.hand;
  return act(c, '交餐', CFG.SUBMIT, () => {
    const o = G.orders.find(o => o.doneBy < 0 && o.key === it.key);   // 完成時才確認訂單仍開啟
    if (!o && G.lastDone && G.lastDone.key === it.key && G.lastDone.at === G.time && G.lastDone.team !== c.team) {
      // 文件 v0.5：完全同時交付時用逐次輪替的隊伍優先權；這次由對方得分，下次換我方優先
      G.tieTeam = c.team;
      log(-1, '兩隊同時交出' + RECIPES[it.key].name + '，依輪替優先權由' + G.teams[G.lastDone.team].name + '得分；下次同時交付換' + G.teams[c.team].name + '優先');
    }
    if (!o) { say(c, '沒有開啟中的「' + RECIPES[it.key].name + '」訂單，料理保留'); log(c.team, c.name + ' 交餐失敗：' + RECIPES[it.key].name + ' 沒有對應訂單'); return; }
    c.hand = null; completeOrder(o, c);
  }, { check: () => c.hand === it });
}

function startTool(c, tool) {
  if (busy(c)) return '動作中';
  if (!near(c, team(c).toolRack)) return '離工具架太遠';
  if (c.tool === tool) return '已經拿著' + TOOLS[tool];
  return act(c, '換工具', CFG.TOOL, () => { c.tool = tool; });
}
function startGlove(c, on) {
  if (busy(c)) return '動作中';
  if (!near(c, team(c).gloveRack)) return '離手套架太遠';
  if (c.hand) return '雙手要空著才能換手套';
  if (c.gloves === on) return true;
  return act(c, on ? '戴手套' : '脫手套', CFG.GLOVE, () => { c.gloves = on; });
}

// ---------------------------------------------------------------- 翻鍋
const guardNear = s => G.chars.find(o => o.team === s.team && o.down <= 0 && dist(o, s) < CFG.GUARD_RANGE);
const flippable = s => s.cooking && !s.done && !s.flipped && !s.flippedOnce;

function startFlip(c, s) {
  if (busy(c)) return '動作中';
  if (s.team === c.team) return '不能翻自己的鍋';
  if (!flippable(s)) return s.flippedOnce ? '這份料理已經被翻過一次' : '這口鍋沒有正在烹調';
  if (c.hand) return '雙手要空著才能翻鍋';
  if (c.flipCd > 0) return '翻鍋冷卻中';
  if (!near(c, s)) return '太遠';
  if (guardNear(s)) return '守方就在鍋旁，無法翻鍋';
  s.beingFlipped = c.id;
  G.pings.push({ x: s.x, y: s.y, team: s.team, t: 0, dur: 3 });
  log(s.team, '警示：' + c.name + ' 正在翻' + G.teams[s.team].name + '的鍋！');
  if (s.team === 0) toast('警示：我方的鍋正在被翻！', '#ff8a8a');
  return act(c, '翻鍋', CFG.FLIP_CHANNEL, () => {
    s.flipped = true; s.flippedOnce = true; s.beingFlipped = null;
    s.progress = Math.max(0, s.progress - CFG.FLIP_SETBACK);
    c.flipCd = CFG.FLIP_CD;
    log(c.team, c.name + ' 翻倒了' + G.teams[s.team].name + '的' + RECIPES[s.cooking].name);
    floatText(s.x, s.y - 30, '翻倒！', '#ff7070');
  }, {
    check: () => {
      if (!near(c, s, CFG.INTERACT + 10) || !flippable(s)) return false;
      if (guardNear(s)) { log(s.team, '守方趕到，打斷了翻鍋'); return false; }
      return true;
    },
    onCancel: () => { s.beingFlipped = null; c.flipCd = CFG.FLIP_CD; },
  });
}
function startFix(c, s) {
  if (busy(c)) return '動作中';
  if (s.team !== c.team || !s.flipped) return '鍋子沒有翻倒';
  if (!near(c, s)) return '太遠';
  return act(c, '扶正', CFG.FIX, () => { s.flipped = false; log(c.team, c.name + ' 扶正了鍋子'); }, { check: () => s.flipped });
}

// ---------------------------------------------------------------- 打暈
function stunReady(c) {
  if (!c.stunOK) return '尚未解鎖打暈（吃力量燉湯）';
  if (c.charges <= 0) return '打暈次數為 0，要再吃力量燉湯';
  if (c.stunCd > 0) return '打暈冷卻中';
  if (c.hand) return '手上有東西，先放下（Q）';
  if (c.gloves) return '戴著手套不能用工具';
  if (busy(c)) return '動作中';
  return true;
}
function startStun(c, ang) {
  const ok = stunReady(c);
  if (ok !== true) return ok;
  c.charges--; c.stunCd = CFG.STUN_CD; c.face = ang;   // 發動即扣次並進入冷卻
  G.fx.push({ type: 'swing', c, t: 0, dur: CFG.STUN_WINDUP });
  return act(c, '打暈前搖', CFG.STUN_WINDUP, () => {
    let best = null, bd = 1e9;
    for (const e of G.chars) {
      if (e.team === c.team || e.down > 0 || e.immune > 0) continue;
      const d = dist(c, e);
      if (d > CFG.STUN_RANGE + CFG.R) continue;
      let da = Math.abs(Math.atan2(e.y - c.y, e.x - c.x) - c.face);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da > CFG.STUN_ARC / 2 || !lineOfSight(c, e)) continue;
      if (d < bd) { bd = d; best = e; }
    }
    if (best) { knockDown(best, c); c.lastHit = G.time; }
    else floatText(c.x, c.y - 30, '落空', '#bbb');
  }, { lock: false, slow: true });
}
function knockDown(e, by) {
  e.down = CFG.STUN_DOWN;
  cancelAction(e);
  if (typeof endJob === 'function') endJob(e, true);
  const dropped = [];
  for (const it of carried(e)) { placeOnGround(it, e.x, e.y); dropped.push(it); }
  e.hand = null; e.bag = [];
  log(by.team, by.name + ' 打暈了 ' + e.name + (dropped.length ? '，掉落 ' + dropped.map(itemName).join('、') : ''));
  floatText(e.x, e.y - 34, '打暈！', '#ffd25e');
  if (e === player() && !e.ai) toast('你被打暈了！', '#ff8a8a');
}

// ---------------------------------------------------------------- 訂單
function makeRound() {
  const mult = G.rush ? CFG.RUSH_MULT : 1;
  return shuffle(ORDER_KEYS).slice(0, 3).map(k => ({ id: ++G.orderSeq, key: k, score: Math.round(RECIPES[k].score * mult), doneBy: -1 }));
}
function newRound() {
  G.round++;
  G.orders = G.nextOrders || makeRound();
  G.nextOrders = null;
  log(-1, '第 ' + G.round + ' 輪訂單公開：' + G.orders.map(o => RECIPES[o.key].name).join('、'));
}
function completeOrder(o, c) {
  o.doneBy = c.team;
  G.lastDone = { key: o.key, at: G.time, team: c.team };
  const tm = team(c);
  tm.score += o.score; tm.lastScoreAt = G.time;
  log(c.team, c.name + ' 交出 ' + RECIPES[o.key].name + '，+' + o.score);
  floatText(c.x, c.y - 30, '+' + o.score, tm.color);
  const open = G.orders.filter(x => x.doneBy < 0).length;
  if (open === 1 && !G.nextOrders) G.nextOrders = makeRound();   // 剩一張時預告下一輪
  if (open === 0) newRound();
}

// ---------------------------------------------------------------- 每幀更新
function updateWorld(dt) {
  G.time += dt;
  if (!G.rush && !G.tutorial && G.time >= CFG.MATCH - CFG.RUSH) { G.rush = true; log(-1, '尖峰時段：之後公開的訂單分數 ×1.5'); toast('尖峰時段開始！新訂單分數 ×1.5', '#ffd27a'); }
  for (const s of G.stations) {
    if (s.type !== 'stove' || !s.cooking || s.done || s.flipped) continue;
    s.progress += dt;
    if (s.progress >= RECIPES[s.cooking].cook) { s.done = true; s.doneAt = G.time; s.progress = RECIPES[s.cooking].cook; }
  }
  for (const n of G.nodes) if (n.hp <= 0) { n.respawn -= dt; if (n.respawn <= 0) n.hp = CFG.NODE_HP; }
  for (let i = G.items.length - 1; i >= 0; i--) {
    const it = G.items[i];
    it.life -= dt;
    if (it.life <= 0) { G.items.splice(i, 1); }
  }
  // 同一幀內先處理擁有輪替優先權的隊伍（文件 v0.5：同時交付不能固定讓 A 隊獲利）
  const ordered = G.chars.filter(c => c.team === G.tieTeam).concat(G.chars.filter(c => c.team !== G.tieTeam));
  for (const c of ordered) {
    c.stunCd = Math.max(0, c.stunCd - dt);
    c.flipCd = Math.max(0, c.flipCd - dt);
    if (c.down > 0) { c.down -= dt; if (c.down <= 0) { c.down = 0; c.immune = CFG.STUN_IMMUNE; } continue; }
    c.immune = Math.max(0, c.immune - dt);
    updateAction(c, dt);
  }
  for (const f of G.fx) f.t += dt;
  G.fx = G.fx.filter(f => f.t < f.dur);
  for (const p of G.pings) p.t += dt;
  G.pings = G.pings.filter(p => p.t < p.dur);
  if (G.time >= CFG.MATCH && !G.tutorial) endMatch();   // 教學不限時
}

function endMatch() {
  G.state = 'end';
  const [a, b] = G.teams;
  if (a.score !== b.score) G.winner = a.score > b.score ? 0 : 1;
  else if (a.score === 0 || a.lastScoreAt === b.lastScoreAt) G.winner = -1;
  else G.winner = a.lastScoreAt < b.lastScoreAt ? 0 : 1;   // 同分：最後一次有效得分較早者勝
}

function newMatch() {
  buildMap();
  G.items = []; G.logs = []; G.fx = []; G.pings = []; G.toasts = [];
  G.tutorial = null;
  G.time = 0; G.rush = false; G.tieTeam = Math.random() < 0.5 ? 0 : 1; G.lastDone = null; G.round = 0; G.orderSeq = 0; G.nextOrders = null; G.winner = undefined;
  G.chars = [makeChar(0, 0, 0, '你'), makeChar(1, 0, 1, '藍2'), makeChar(2, 1, 0, '紅1'), makeChar(3, 1, 1, '紅2')];
  G.chars[0].ai = G.spectate;
  if (G.spectate) G.chars[0].name = '藍1';
  measureRoutes();
  newRound();
}

function measureRoutes() {
  for (const tm of G.teams) {
    for (const k of Object.keys(ING)) {
      let best = 1e9;
      for (const n of G.nodes) {
        if (n.type !== k) continue;
        const p = findPath(tm.storage.x, tm.storage.y, n.x, n.y);
        if (p) best = Math.min(best, pathLength(p));
      }
      tm.travel[k] = best / CFG.SPEED;
    }
  }
  G.measure = Object.fromEntries(Object.keys(ING).map(k => [ING[k].name, +G.teams[0].travel[k].toFixed(1)]));
}
