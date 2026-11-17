'use strict';
// NPC：每隊一個規劃器，把工作分給閒置的隊員。工作是一串步驟（走到某處、做某個動作、等待）。
// 步驟可以是函式：執行到那一步時才決定細節（哪個採集點、哪口爐台），可以回傳步驟陣列展開。

// ---------------------------------------------------------------- 工作執行
function endJob(c, failed) {
  const j = c.job;
  if (!j) return;
  for (const o of j.res) if (o.res === c.id) o.res = null;
  c.job = null; c.path = null;
}

function followPath(c, tx, ty, dt) {
  if (!c.path || Math.hypot(c.pathGoal.x - tx, c.pathGoal.y - ty) > 24 || c.repath <= 0) {
    c.path = findPath(c.x, c.y, tx, ty, c.team) || [{ x: c.x, y: c.y }, { x: tx, y: ty }];
    c.path.shift();
    c.pathGoal = { x: tx, y: ty }; c.repath = 3;
  }
  c.repath -= dt;
  let wp = c.path[0];
  while (wp && Math.hypot(wp.x - c.x, wp.y - c.y) < 6) { c.path.shift(); wp = c.path[0]; }
  if (!wp) wp = { x: tx, y: ty };
  const d = Math.hypot(wp.x - c.x, wp.y - c.y);
  if (d < 1) return;
  const k = Math.min(1, speedOf(c) * dt / d);
  c.face = Math.atan2(wp.y - c.y, wp.x - c.x);
  moveChar(c, (wp.x - c.x) * k, (wp.y - c.y) * k);
  c.stuckAcc = (c.stuckAcc || 0) + dt;
  if (c.stuckAcc > 1) {
    if (Math.hypot(c.x - (c.stuckX || 0), c.y - (c.stuckY || 0)) < 8) c.path = null;
    c.stuckAcc = 0; c.stuckX = c.x; c.stuckY = c.y;
  }
}

function runJob(c, dt) {
  const j = c.job;
  if (!j || c.down > 0) return;
  for (let guard = 0; guard < 8; guard++) {
    if (j.i >= j.steps.length) { endJob(c); return; }
    let s = j.steps[j.i];
    if (typeof s === 'function') {
      s = s(c, j);
      if (s === null || s === undefined) { j.i++; continue; }
      if (s === 'fail') { endJob(c, true); return; }
      if (Array.isArray(s)) { j.steps.splice(j.i, 1, ...s); continue; }
      j.steps[j.i] = s;
    }
    if (s.t === 'goto') {
      const tg = s.target || s;
      if (dist(c, tg) <= (tg.tight ? 10 : (s.r || 30))) { c.path = null; j.i++; continue; }
      if (c.action && c.action.lock) return;
      followPath(c, tg.x, tg.y, dt);
      return;
    }
    if (s.t === 'act') {
      if (!s.a) {
        if (c.action) return;
        const r = s.start(c);
        if (r !== true) { endJob(c, true); return; }
        s.a = c.action;
        if (!s.a) { j.i++; continue; }
      }
      if (s.a.cancelled) { endJob(c, true); return; }
      if (s.a.ok) { j.i++; continue; }
      return;
    }
    if (s.t === 'wait') {
      s.el = (s.el || 0) + dt;
      if (s.until(c)) { j.i++; continue; }
      if (s.el > (s.timeout || 30)) endJob(c, true);
      return;
    }
    if (s.t === 'stun') {   // 追擊並出手
      const e = s.target;
      s.el = (s.el || 0) + dt;
      if (s.started) { if (!c.action) j.i++; else return; continue; }
      if (e.down > 0 || s.el > 7 || !canSee(c.team, e) || stunReady(c) !== true || nearOwnKitchen(e, 20)) { endJob(c, true); return; }
      if (dist(c, e) < CFG.STUN_RANGE * 0.8) {
        const r = startStun(c, Math.atan2(e.y - c.y, e.x - c.x));
        if (r !== true) { endJob(c, true); return; }
        s.started = true; return;
      }
      c.repath = Math.min(c.repath, 0.4);
      followPath(c, e.x, e.y, dt);
      return;
    }
  }
}

const job = (type, steps, extra = {}) => ({ type, steps, i: 0, res: [], ...extra });
const go = (target, r = 34) => ({ t: 'goto', target, r });
const doAct = start => ({ t: 'act', start });
const wait = (until, timeout) => ({ t: 'wait', until, timeout });
const reserve = (j, c, o) => { o.res = c.id; j.res.push(o); };

const toolSteps = () => () => null;   // 已移除工具：雙方攻擊力相同

// 牆上的火爐分內外側：己方從廚房裡面走過去，敵方從牆外走過去
// 角色是否在自己廚房裡或離廚房 m 像素內（對手不能進入那裡）
function nearOwnKitchen(e, m) {
  const z = G.teams[e.team].zone;
  return e.x > z.x - m && e.x < z.x + z.w + m && e.y > z.y - m && e.y < z.y + z.h + m;
}
// tight：火爐的站位點要走到幾乎正好的位置，否則會停在互動距離外
const acc = (c, s) => (s.wall ? { x: s.x + s.out * (s.team === c.team ? -42 : 42), y: s.y, tight: true } : s);

// ---------------------------------------------------------------- 工作種類
function pickNode(c, k) {
  let best = null, bs = 1e9;
  for (const n of G.nodes) {
    // 只避開隊友鎖定的怪物；對手鎖定的照樣可以去搶最後一擊
    if (n.type !== k || (n.res !== null && n.res !== c.id && G.chars[n.res].team === c.team)) continue;
    const s = dist(c, n) * 1.25 + (n.hp > 0 ? 0 : n.respawn * CFG.SPEED);
    if (s < bs) { bs = s; best = n; }
  }
  return best;
}

function gatherJob(c, ings) {
  const steps = [];
  ings.forEach((k, i) => {
    if (i === 0) steps.push(toolSteps(ING[k].tool));
    steps.push((c, j) => {
      const n = pickNode(c, k);
      if (!n) return 'fail';
      reserve(j, c, n);
      return [
        go(n, 40),
        wait(() => n.hp > 0, 14),
        doAct(c => startGather(c, n)),
        c => (c.hand && c.hand.key === k ? null : 'fail'),
        () => { j.pending.splice(j.pending.indexOf(k), 1); n.res = null; return null; },
      ];
    });
    if (i < ings.length - 1) steps.push(doAct(c => startStoreBag(c, 'hand')));
  });
  steps.push(...depositSteps());
  return job('gather', steps, { pending: ings.slice(), interruptible: true });
}

const storageRoom = c => team(c).storage.items.length < CFG.STORAGE_CAP;

// 手上的原料：倉庫有位置就入庫；滿了先收進背包，背包也滿才在倉庫旁等
function depositHandStep(c) {
  if (!c.hand || c.hand.kind !== 'raw') return null;
  if (storageRoom(c)) return [doAct(c => startDeposit(c))];
  // 倉庫滿：背包有空格就收進背包（備料台可以直接用背包原料，不會晚到）；沒有空格才在倉庫旁等
  if (bagFree(c) > 0) return [doAct(c => startStoreBag(c, 'hand'))];
  return [wait(storageRoom, 12), doAct(c => startDeposit(c))];
}

// 背包裡的原料：倉庫有位置就一份一份入庫，滿了就先留在背包
function depositBagStep(c) {
  return bagRaw(c) && storageRoom(c) ? [doAct(c => startDeposit(c)), depositBagStep] : null;
}

function depositSteps() {
  return [c => go(team(c).storage, 40), depositHandStep, depositBagStep];
}

function placeSemiSteps() {
  const step = (c, j) => {
    const s = team(c).stoves.find(s => stoveEmpty(s) && (s.res === null || s.res === c.id));
    if (!s) return [wait(c => team(c).stoves.some(s => stoveEmpty(s) && s.res === null), 30), step];
    reserve(j, c, s);
    return [go(acc(c, s), 38), doAct(c => startPlace(c, s))];
  };
  return [step];
}

function cookJob(c, p, rk) {
  return job('cook', [
    c => (c.hand ? 'fail' : null),
    go(p, 38),
    doAct(c => startPrep(c, p, rk)),
    doAct(c => startTakeSemi(c, p)),
    ...placeSemiSteps(),
  ], { recipe: rk, res: [] });
}

function serveJob(c, s) {
  return job('serve', [
    go(acc(c, s), 38),
    doAct(c => startTakeDish(c, s)),
    c => go(team(c).pass, 38),
    doAct(c => startSubmit(c)),
    c => (c.hand ? 'fail' : null),
  ], { interruptible: false });
}

function eatJob(c, s) {
  return job('eat', [go(acc(c, s), 38), doAct(c => startEat(c, s))]);
}

function cakeJob(c) {
  const tm = team(c), q = tm.quick;
  const n = G.nodes.find(n => n.home && n.side === c.team);
  return job('cake', [
    toolSteps('knife'),
    go(n, 40), wait(() => n.hp > 0, 14),
    doAct(c => startGather(c, n)),
    c => (c.hand && c.hand.key === n.type ? null : 'fail'),
    go(acc(c, q), 38), doAct(c => startQuickDeposit(c, q)), doAct(c => startQuickPrep(c, q)),
    wait(() => q.done, 15), doAct(c => startEat(c, q)),
  ], { recipe: 'cake' });
}

// 突襲：先埋伏在對方廚房牆外、兩口火爐中間，等火爐開始烹調再去關火
// 草叢埋伏點：草叢中心（草叢不擋路，中心一定走得到）
const bushCenter = b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
function nearestBush(p, maxD) {
  let best = null, bd = maxD;
  for (const b of G.bushes || []) { const q = bushCenter(b), d = dist(p, q); if (d < bd) { bd = d; best = q; } }
  return best;
}

function raidJob(c) {
  const et = G.teams[1 - c.team];
  // 優先躲在對方廚房附近的草叢裡等，沒有就貼在牆外
  const wall = P(1 - c.team, 740, 600);
  const lurk = nearestBush(wall, 420) || wall;
  const target = () => et.stoves.concat([et.quick]).find(s => flippable(s) && RECIPES[s.cooking].cook - s.progress > dist(c, s) / CFG.SPEED + 1.5);
  return job('raid', [
    c => (c.hand ? 'fail' : null),
    go(lurk, 40),
    wait(() => !!target(), 12),
    (c, j) => { const s = target(); return s ? [go(acc(c, s), 40), doAct(c => startFlip(c, s))] : 'fail'; },
  ], { interruptible: true });
}
function fixJob(c, s) {
  return job('fix', [go(acc(c, s), 40), doAct(c => startFix(c, s))]);
}
function defendJob(c, s) {
  return job('defend', [go(acc(c, s), 24), wait(() => !s.beingFlipped, 3)], { interruptible: false });
}
function guardJob(c) {
  // 有打暈次數的人閒下來時，躲進怪物附近的草叢埋伏搬貨或打怪的對手；沒有草叢就站在怪物旁
  if (c.stunOK && c.charges > 0 && !c.hand && Math.random() < 0.3 + team(c).aggr) {
    const spots = (G.bushes || []).map(bushCenter).filter(q => G.nodes.some(n => dist(n, q) < 320));
    if (spots.length) {
      const q = spots[Math.floor(Math.random() * spots.length)];
      return job('ambush', [go(q, 20), wait(() => false, 6)], { interruptible: true, idleJob: true });
    }
    const ns = G.nodes.filter(n => n.side === c.team), n = ns[Math.floor(Math.random() * ns.length)];
    return job('guard', [go(n, 70), wait(() => false, 4)], { interruptible: true, idleJob: true });
  }
  // 回家看鍋：每人守一口火爐，站在鍋旁就能打斷關火
  const s = team(c).stoves[c.idx % 2];
  return job('guard', [go(acc(c, s), 24), wait(() => false, 2.5)], { interruptible: true, idleJob: true });
}
function lootJob(c, it) {
  return job('loot', [go(it, 30), doAct(c => startPick(c, it))], { interruptible: false });
}
function clearStoveJob(c, s) {
  return job('clear', [go(acc(c, s), 38), doAct(c => startTakeDish(c, s)), doAct(c => dropHand(c))]);
}

// 手上或背包有東西時，先處理掉
function cleanupJob(c) {
  const tm = team(c), h = c.hand;
  if (h && h.kind === 'dish') {
    if (openOrders(c.team).includes(h.key)) return job('submit', [go(tm.pass, 38), doAct(c => startSubmit(c))]);
    const s = tm.stoves.find(s => stoveEmpty(s) && s.res === null);
    if (s) return job('store', [go(acc(c, s), 38), doAct(c => startPlace(c, s))]);
    return null;
  }
  if (h && h.kind === 'semi') {
    // 兩口爐都被沒人要的成品占住：先把半成品放腳邊，清掉舊成品，再撿回來放鍋（避免卡死）
    const stale = !tm.stoves.some(stoveEmpty) && tm.stoves.find(s => s.done && !RECIPES[s.cooking].ability
      && !openOrders(c.team).includes(s.cooking) && (s.res === null || s.res === c.id));
    if (stale) {
      const semi = h;
      const j = job('swap', [
        doAct(c => dropHand(c)), go(acc(c, stale), 38), doAct(c => startTakeDish(c, stale)), doAct(c => dropHand(c)),
        go(semi, 30), doAct(c => startPick(c, semi)), go(acc(c, stale), 38), doAct(c => startPlace(c, stale)),
      ]);
      reserve(j, c, stale);
      return j;
    }
    return job('place', placeSemiSteps());
  }
  if (h && h.kind === 'raw') {
    if (tm.storage.items.length < CFG.STORAGE_CAP) return job('deposit', depositSteps());
    if (bagFree(c) > 0) return job('stash', [doAct(c => startStoreBag(c, 'hand'))]);
    return job('drop', [go(P(c.team, 760, 600), 30), doAct(c => dropHand(c))]);
  }
  if (bagRaw(c) && tm.storage.items.length < CFG.STORAGE_CAP) return job('deposit', depositSteps());
  const bagSemi = c.bag.find(i => i.kind === 'semi');
  if (bagSemi) return job('unbag', [doAct(c => dropBag(c, bagSemi))]);
  return null;
}

// ---------------------------------------------------------------- 規劃
function teamSnapshot(t) {
  const tm = G.teams[t];
  const transit = [];
  for (const c of G.chars) {
    if (c.team !== t) continue;
    for (const it of carried(c)) if (it.kind === 'raw') transit.push(it.key);
    if (c.job && c.job.pending) transit.push(...c.job.pending);
  }
  const active = activeRecipes(t);
  for (const c of G.chars) if (c.team === t && c.job && c.job.recipe) active.add(c.job.recipe);
  return { tm, storage: tm.storage.items.slice(), transit, active };
}

function wantSoup(t, S) {
  const mem = G.chars.filter(c => c.team === t);
  const remain = CFG.MATCH - G.time;
  return G.time > 40 && remain > 70 && S.tm.aggr > 0.25 && !S.active.has('soup')
    && !mem.some(c => c.stunOK && c.charges > 0)
    && !G.teams[t].stoves.some(s => s.cooking === 'soup');
}

function targets(t, S) {
  // 自己隊伍這一輪還沒交的訂單；雙方進度分開，不必考慮對手在做什麼
  const pool = S.storage.concat(S.transit);
  const list = teamOrders(t).filter(o => !o.done && !S.active.has(o.key)).map(o => {
    const p = pool.slice();
    let est = RECIPES[o.key].ings.length * CFG.PREP_PER_ING + 6;
    for (const k of RECIPES[o.key].ings) { const i = p.indexOf(k); if (i >= 0) p.splice(i, 1); else est += S.tm.travel[k] * 2 + 3; }
    return { key: o.key, val: o.score / est };
  }).sort((a, b) => b.val - a.val).map(x => x.key);
  if (wantSoup(t, S)) list.unshift('soup');
  return list;
}

function needs(S, tlist) {
  // 倉庫上限只算已入庫的原料；隊員可以先把原料拿在手上或背包裡排隊（文件：手上與背包不算已卸貨）
  const cap = CFG.STORAGE_CAP + CFG.AI_QUEUE - S.storage.length - S.transit.length;
  if (cap <= 0) return [];
  const avail = S.storage.concat(S.transit), need = [];
  for (const rk of tlist.slice(0, 2)) for (const k of RECIPES[rk].ings) {
    const i = avail.indexOf(k);
    if (i >= 0) avail.splice(i, 1); else need.push(k);
  }
  return need.slice(0, cap);
}

function planFor(c) {
  const t = c.team, S = teamSnapshot(t), tm = S.tm;
  const free = o => o.res === null || o.res === c.id;
  const open = k => openOrders(t).includes(k);

  const cl = cleanupJob(c);
  if (cl) return cl;

  for (const s of tm.stoves.concat([tm.quick])) if (s.flipped && free(s)) { const j = fixJob(c, s); reserve(j, c, s); return j; }

  const fighter = G.chars.find(o => o.team === t && o.idx === tm.fighter);
  const mayEatSoup = c === fighter || !fighter.ai || fighter.down > 0;
  for (const s of tm.stoves) if (mayEatSoup && s.done && s.cooking === 'soup' && canEat(c, 'soup') === true && free(s)) { const j = eatJob(c, s); reserve(j, c, s); return j; }
  if (tm.quick.done && canEat(c, 'cake') === true && free(tm.quick)) { const j = eatJob(c, tm.quick); reserve(j, c, tm.quick); return j; }

  for (const s of tm.stoves) if (s.done && !RECIPES[s.cooking].ability && open(s.cooking) && free(s)) { const j = serveJob(c, s); reserve(j, c, s); return j; }

  for (const p of tm.preps) {
    if (!free(p) || p.user !== undefined && p.user !== null) continue;
    if (p.done) { const j = job('semi', [go(p, 38), doAct(c => startTakeSemi(c, p)), ...placeSemiSteps()]); reserve(j, c, p); return j; }
    if (p.recipe) { const j = cookJob(c, p, p.recipe); reserve(j, c, p); return j; }
  }

  // 兩口爐都被沒人要的成品卡住時，清掉放最久的一份
  const semiWaiting = tm.preps.some(p => p.done || p.recipe) || G.chars.some(o => o.team === t && o.hand && o.hand.kind === 'semi');
  if (semiWaiting && !tm.stoves.some(stoveEmpty)) {
    const stale = tm.stoves.filter(s => s.done && !RECIPES[s.cooking].ability && !open(s.cooking) && G.time - s.doneAt > CFG.STUCK_DISH && free(s));
    if (stale.length) { const j = clearStoveJob(c, stale[0]); reserve(j, c, stale[0]); return j; }
  }

  // 撿回掉在自家廚房附近的原料或半成品
  if (!c.hand) {
    const f = tm.floor;
    const room = tm.storage.items.length < CFG.STORAGE_CAP;
    const lost = G.items.find(i => i.team === t && (i.kind === 'semi' || (i.kind === 'raw' && room)) && i.res === null && i.x > f.x - 60 && i.x < f.x + f.w + 60 && i.y > f.y && i.y < f.y + f.h);
    if (lost) { const j = lootJob(c, lost); reserve(j, c, lost); return j; }
  }

  const tl = targets(t, S);
  const prep = tm.preps.find(p => !p.recipe && !p.done && free(p));
  if (prep && tm.stoves.some(s => stoveEmpty(s) || s.done)) {
    const pool = prepPool(c);   // 倉庫＋自己背包
    let rk = tl.find(k => hasAll(pool, RECIPES[k].ings));
    if (!rk && S.storage.length >= CFG.STORAGE_CAP) rk = ORDER_KEYS.find(k => !S.active.has(k) && hasAll(pool, RECIPES[k].ings));
    if (rk) { const j = cookJob(c, prep, rk); reserve(j, c, prep); return j; }
    if (S.storage.length >= CFG.STORAGE_CAP && !c.hand) return job('trash', [go(tm.storage, 40), doAct(c => startTakeOut(c)), c => go(P(t, 760, 600), 30), doAct(c => dropHand(c))]);
  }

  const remain = CFG.MATCH - G.time;
  // 實測：開局吃蔬餅會輸掉第一輪搶單；交出第一單後才吃，背包才划算
  if (!c.hasBag && tm.wantBag[c.idx] && tm.score > 0 && remain > 100 && stoveEmpty(tm.quick) && free(tm.quick) && !G.chars.some(o => o.job && o.job.type === 'cake' && o.team === t)) {
    const j = cakeJob(c); reserve(j, c, tm.quick); return j;
  }

  if (G.time > tm.nextFlipCheck && c.flipCd <= 0 && !c.hand && remain > 20) {
    tm.nextFlipCheck = G.time + 6;
    // 只有對方已經在備料（很快會下鍋）或鍋正在煮時才出發，避免空等
    const et = G.teams[1 - t];
    const soon = et.preps.some(p => p.recipe) || et.stoves.some(flippable);
    if (soon && Math.random() < tm.aggr * 1.5 && !G.chars.some(o => o.team === t && o.job && o.job.type === 'raid')) return raidJob(c);
  }

  const nd = needs(S, tl);
  if (nd.length) {
    let ings = [nd[0]];
    // 背包有幾格空位，就最多多拿幾份，但只限順路：另一個「現在有料」的採集點離第一個點夠近。
    // 同一個點採完要等重生，不算順路；跑遠路多拿會讓菜晚完成、搶不到單。
    const n1 = pickNode(c, nd[0]);
    const used = [n1];
    for (let k = 1; k < nd.length && ings.length <= bagFree(c) && n1; k++) {
      const nk = G.nodes.filter(n => n.type === nd[k] && n.hp > 0 && n.res === null && !used.includes(n))
        .sort((a, b) => dist(a, n1) - dist(b, n1))[0];
      if (nk && dist(n1, nk) <= CFG.BAG_PAIR_DIST) { ings.push(nd[k]); used.push(nk); }
    }
    return gatherJob(c, ings);
  }

  return guardJob(c);
}

// 每 0.2 秒：反應式判斷（防守、打暈、撿掉落物），可打斷可中斷的工作
function reactFor(c) {
  if (c.down > 0) return;
  const tm = team(c);
  const interruptible = !c.job || c.job.interruptible && !(c.job.type === 'gather' && c.hand) && !(c.action && c.action.label === '關火');

  // 看到自家火爐正在被關火 → 最近的人回防
  for (const s of tm.stoves.concat([tm.quick])) {
    if (s.beingFlipped === null || s.beingFlipped === undefined || !canSee(c.team, G.chars[s.beingFlipped])) continue;   // 不再有通知，看到才知道
    if (interruptible && !c.hand && dist(c, s) < 450 && !G.chars.some(o => o.team === c.team && o.job && o.job.type === 'defend')) {
      endJob(c); c.job = defendJob(c, s); return;
    }
  }

  // 打暈：優先打正在翻自家鍋的人，其次搬半成品或成品的人，再其次背原料的人
  if (interruptible && stunReady(c) === true) {
    let best = null, bv = 0;
    for (const e of G.chars) {
      if (e.team === c.team || e.down > 0 || e.immune > 0) continue;
      if (nearOwnKitchen(e, 90)) continue;   // 對手在自己廚房裡或門口，進不去也追不到
      const d = dist(c, e);
      if (d > 320 || !canSee(c.team, e)) continue;
      let v = 0;
      if (e.action && e.action.label === '關火') v = 5;
      else if (c.job && c.job.type === 'raid' && e.job && e.job.type === 'defend') v = 3;
      // 搶最後一擊：對手正在攻擊食材怪物時打暈他，他就搶不到這份食材
      else if (e.action && e.action.label === '攻擊') v = 3;
      else if (carried(e).some(it => it.kind !== 'raw')) v = 4;
      else if (carried(e).length) v = 1 + tm.aggr;
      v -= d / 400;
      if (v > bv) { bv = v; best = e; }
    }
    if (best && bv > 0.4) { endJob(c); cancelAction(c); c.job = job('attack', [{ t: 'stun', target: best }], { interruptible: false }); return; }
  }

  // 剛打暈對手：撿走對方掉的原料或半成品
  if (!c.hand && c.lastHit && G.time - c.lastHit < 3 && (!c.job || c.job.type !== 'loot')) {
    const it = G.items.filter(i => i.team === c.team && i.kind !== 'dish' && dist(i, c) < 160 && i.res === null).sort((a, b) => dist(a, c) - dist(b, c))[0];
    if (it) { endJob(c); const j = lootJob(c, it); reserve(j, c, it); c.job = j; c.lastHit = 0; }
  }
}

function updateAI(dt) {
  G.aiClock = (G.aiClock || 0) + dt;
  const think = G.aiClock >= 0.2;
  if (think) G.aiClock = 0;
  // 每幀隨機決定處理順序，避免固定讓某一隊先搶到採集點或出餐
  const order = Math.random() < 0.5 ? G.chars : G.chars.slice().reverse();
  for (const c of order) {
    if (!c.ai || c.down > 0) continue;
    if (think) {
      reactFor(c);
      if (!c.job || c.job.idleJob && c.job.i >= 1 && c.job.steps[c.job.i] && c.job.steps[c.job.i].t === 'wait') {
        const prev = c.job;
        const j = planFor(c);
        if (!prev || !j.idleJob) { endJob(c); c.job = j; }   // 閒置等待中只被真正的工作取代
      }
    }
    runJob(c, dt);
  }
}
