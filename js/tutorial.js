'use strict';
// 教學關卡：一步一步帶玩家完成一道菜、學會背包、防守與打暈。
// 每一步有標題、說明、目標（地圖上會發亮並有箭頭指引）與完成條件；info 步驟按 Enter 繼續。

const tutC = () => player();
const tutTeam = () => G.teams[0];
const homeVeg = () => G.nodes.find(n => n.home && n.side === 0);
const myMush = () => G.nodes.filter(n => n.type === 'mush' && n.side === 0).sort((a, b) => dist(a, tutC()) - dist(b, tutC()))[0];
const emptyStove = () => tutTeam().stoves.find(stoveEmpty);
const groundItem = (pred) => G.items.filter(pred).sort((a, b) => dist(a, tutC()) - dist(b, tutC()))[0];
const enemyA = () => G.chars[2];
const enemyB = () => G.chars[3];

function freeSpotNear(p, r) {
  for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]]) {
    const q = { x: p.x + dx, y: p.y + dy };
    if (!blockedAt(q.x, q.y) && lineOfSight(p, q)) return q;
  }
  return { x: p.x, y: p.y };
}

const TUT_STEPS = [
  { title: '歡迎來到教學', info: true,
    text: '跟著提示完成一道菜，並學會背包、防守與打暈。地圖上發亮的圈就是目標；目標在畫面外時，邊緣會有箭頭指引。Esc 可以隨時離開。' },

  // ---- 基本料理流程
  { title: '移動', text: '用 WASD 移動，走到廚房門外發亮的蔬菜點。',
    target: homeVeg, done: () => dist(tutC(), homeVeg()) < 60,
    setup: () => { homeVeg().hp = CFG.NODE_HP; } },
  { title: '採集', text: '站在採集點旁按 E，角色會一直敲到掉出一份蔬菜。菜刀剋制蔬菜，敲得比較快。',
    target: homeVeg,
    done: () => (tutC().hand && tutC().hand.key === 'veg') || G.items.some(i => i.key === 'veg' && dist(i, homeVeg()) < 70) },
  { title: '拾取', text: '走到地上的蔬菜旁按 E 撿起來。雙手一次只能拿一件東西。',
    target: () => groundItem(i => i.key === 'veg'), done: () => tutC().hand && tutC().hand.key === 'veg' },
  { title: '入庫', text: '回到廚房，在倉庫旁按 E 把蔬菜放進倉庫。倉庫最多放三份原料。',
    target: () => tutTeam().storage, done: () => tutTeam().storage.items.includes('veg') },
  { title: '再拿一種原料', text: '左上角的「雙蔬煎盤」還需要菇類。到中路的菇類點採集、撿起，帶回倉庫入庫。',
    target: () => {
      const c = tutC();
      if (c.hand && c.hand.key === 'mush') return tutTeam().storage;
      return groundItem(i => i.key === 'mush') || myMush();
    },
    done: () => hasAll(tutTeam().storage.items, ['veg', 'mush']) },
  { title: '備料', text: '到備料台，按數字 1 選「雙蔬煎盤」。備料要站著別動 4 秒；移動會中斷，但進度會保留。',
    target: () => tutTeam().preps.find(p => p.recipe === 'vm') || tutTeam().preps[0],
    done: () => tutTeam().preps.some(p => p.recipe === 'vm' && p.done) || activeRecipes(0).has('vm') && !tutTeam().preps.some(p => p.recipe === 'vm') },
  { title: '放鍋', text: '按 E 拿起半成品，搬到爐台再按 E 放進鍋裡。之後會自動烹調，你可以先去做別的事。',
    target: () => (tutC().hand && tutC().hand.kind === 'semi' ? emptyStove() : tutTeam().preps.find(p => p.recipe === 'vm')),
    done: () => tutTeam().stoves.some(s => s.cooking === 'vm') },
  { title: '隔熱手套', text: '成品很燙，要戴手套才能拿。趁烹調的時候，到手套架按 E 戴上手套。',
    target: () => tutTeam().gloveRack, done: () => tutC().gloves },
  { title: '取成品', text: '等爐台顯示「可取餐」，按 E 把成品拿起來。戴著手套、雙手要空著。',
    target: () => tutTeam().stoves.find(s => s.cooking === 'vm'), done: () => tutC().hand && tutC().hand.kind === 'dish' },
  { title: '交餐', text: '把成品搬到出餐口按 E 交餐。訂單是兩隊共用的，先交先得。',
    target: () => tutTeam().pass, done: () => G.orders.some(o => o.key === 'vm' && o.doneBy === 0) },
  { title: '完成第一道菜！', info: true,
    text: '左上角是三張共用訂單，對手也在搶同樣的單。卡片上的「敵方製作中」代表對手正在做；選對手沒在做、你又來得及完成的那張，才不會白做。' },

  // ---- 背包
  { title: '收納蔬餅：解鎖背包',
    text: '先到手套架按 E 脫下手套（戴手套不能採集）。到門外蔬菜點採一份蔬菜，投入旁邊的就地鍋，按 E 備料；煮好後按 E 吃掉，背包會解鎖兩格。',
    setup: () => { homeVeg().hp = CFG.NODE_HP; },
    target: () => {
      const c = tutC(), q = tutTeam().quick;
      if (c.gloves) return tutTeam().gloveRack;
      if (q.raw || q.cooking || (c.hand && c.hand.key === 'veg')) return q;
      return groundItem(i => i.key === 'veg') || homeVeg();
    },
    done: () => tutC().hasBag },
  { title: '收進背包', text: '撿起地上的硬殼後按 R 收進背包。收納要站著不動 1 秒。背包裡的東西不占雙手，所以還能採集和打暈。',
    setup: () => { const p = freeSpotNear(tutC(), 50); const it = spawnItem('raw', 'shell', p.x, p.y); it.life = 9999; G.tutorial.shell = it; },
    target: () => (G.items.includes(G.tutorial.shell) ? G.tutorial.shell : null),
    done: () => tutC().bag.some(i => i.key === 'shell') },
  { title: 'Tab 背包', text: '按 Tab 打開背包，用滑鼠把硬殼拖到框外放開，就會丟到腳邊。丟掉後再按 E 撿起、按 R 收回背包。',
    setup: () => { G.tutorial.dragged = false; },
    target: () => (G.items.includes(G.tutorial.shell) ? G.tutorial.shell : null),
    done: () => G.tutorial.dragged && tutC().bag.some(i => i.key === 'shell') },
  { title: '用背包裡的原料備料', text: '備料台可以直接使用你背包裡的原料，不必先入庫。到備料台按 5 做「力量燉湯」（需要硬殼）。',
    target: () => tutTeam().preps.find(p => !p.recipe) || tutTeam().preps[0],
    done: () => tutTeam().preps.some(p => p.recipe === 'soup') || activeRecipes(0).has('soup') || tutC().stunOK },
  { title: '吃力量燉湯', text: '把燉湯的半成品放到爐台，煮好後在鍋邊按 E 吃掉，就能打暈 3 次。',
    target: () => {
      const c = tutC(), tm = tutTeam();
      if (c.hand && c.hand.kind === 'semi') return emptyStove();
      return tm.stoves.find(s => s.cooking === 'soup') || tm.preps.find(p => p.recipe === 'soup');
    },
    done: () => tutC().stunOK },

  // ---- 防守與打暈
  { title: '防守：對手來翻鍋',
    text: '紅隊翻倒了你的鍋！翻倒時烹調會停止並倒退 5 秒，要有人回去按 E 扶正。正式對戰時，警示一響就回防：守方站在鍋邊，就能打斷對手翻鍋。',
    setup: () => {
      const tm = tutTeam(), s = emptyStove() || tm.stoves[0];
      Object.assign(s, { cooking: 'fm', progress: 3, done: false, flipped: false, flippedOnce: false });
      const e = enemyA(), spot = { x: s.x + 46, y: s.y - 10 };
      e.x = spot.x; e.y = spot.y; e.hand = null; e.bag = []; e.flipCd = 0; e.down = 0;
      G.tutorial.flipStove = s;
      if (startFlip(e, s) !== true) { s.flipped = true; s.flippedOnce = true; s.progress = 0; log(1, '紅1 翻倒了我方的香菇魚湯'); toast('警示：我方的鍋被翻倒了！', '#ff8a8a'); }
    },
    target: () => G.tutorial.flipStove,
    done: () => { const s = G.tutorial.flipStove; return s.flippedOnce && !s.flipped && !enemyA().action; } },
  { title: '打暈搬貨的對手',
    text: '手上要空著（Q 放下）、不能戴手套。用滑鼠對準紅隊的人，按空白鍵打暈。前搖 0.8 秒，打中後對方會倒地並掉落身上的東西。',
    setup: () => {
      const a = enemyA(); const home = G.teams[1].spawn[0]; a.x = home.x; a.y = home.y; cancelAction(a);
      const e = enemyB(), p = freeSpotNear(tutC(), 130);
      e.x = p.x; e.y = p.y; e.down = 0; e.immune = 0; e.hand = { id: ++G.itemSeq, kind: 'semi', key: 'sv', life: 9999 }; e.bag = [];
      G.tutorial.patrol = { x: p.x, y: p.y, t: 0 };
    },
    target: () => enemyB(), done: () => enemyB().down > 0 },
  { title: '撿走掉落物', text: '對手掉了一份蒜香烤貝的半成品。按 E 撿起來，它可以直接放進你自己的爐台。',
    target: () => groundItem(i => i.kind === 'semi'), done: () => tutC().hand && tutC().hand.kind === 'semi' },
  { title: '翻鍋與搶單', info: true,
    text: '你也可以到對手廚房，在正在烹調的鍋旁按 E 按住 1.5 秒翻鍋，但對手會收到警示。從家裡走過去常常來不及，可以先在對方門口埋伏，等鍋開始煮再進去。' },
  { title: '教學完成！', info: true, final: true,
    text: 'Enter 開始正式對局，T 再玩一次教學，Esc 回標題。正式對局是 6 分鐘，比的是誰交出的訂單分數多。' },
];

function startTutorial() {
  G.spectate = false;
  newMatch();
  G.state = 'play'; G.paused = false; UI.fit = false; UI.bagOpen = false; UI.help = false;
  for (const c of G.chars) c.ai = false;
  G.chars[0].name = '你';
  G.orders = [{ id: 901, key: 'vm', score: 110, doneBy: -1 }, { id: 902, key: 'fm', score: 150, doneBy: -1 }, { id: 903, key: 'st', score: 200, doneBy: -1 }];
  G.nextOrders = null; G.round = 1; G.logs = [];
  G.tutorial = { i: 0, wait: 0, dragged: false };
  tutorialEnter();
  cam.x = player().x; cam.y = player().y;
}

function tutorialEnter() {
  const st = TUT_STEPS[G.tutorial.i];
  G.tutorial.wait = 0;
  if (st.setup) st.setup();
}

function tutorialNext() {
  if (G.tutorial.i >= TUT_STEPS.length - 1) return;
  G.tutorial.i++;
  tutorialEnter();
}

function tutorialKey(code) {
  const st = TUT_STEPS[G.tutorial.i];
  if (code === 'Escape') { G.tutorial = null; newMatch(); G.state = 'title'; return true; }
  if (st.final && code === 'Enter') { G.tutorial = null; startGame(false); return true; }
  if (st.final && code === 'KeyT') { startTutorial(); return true; }
  if (st.info && code === 'Enter') { tutorialNext(); return true; }
  return false;
}

function tutorialUpdate(dt) {
  const T = G.tutorial;
  const st = TUT_STEPS[T.i];
  // 打暈步驟：對手在原地來回走動；打暈次數用完就補滿，避免卡關
  if (T.patrol && enemyB().down <= 0 && st.title === '打暈搬貨的對手') {
    T.patrol.t += dt;
    const e = enemyB(), tx = T.patrol.x + Math.sin(T.patrol.t * 0.9) * 50;
    moveChar(e, clamp(tx - e.x, -60 * dt, 60 * dt), 0);
    const c = tutC();
    if (c.stunOK && c.charges === 0 && !c.action) { c.charges = CFG.CHARGES; c.stunCd = 0; toast('教學中自動補滿打暈次數'); }
  }
  if (st.info || !st.done) return;
  if (st.done()) {
    T.wait += dt;
    if (T.wait === dt) toast('完成！', '#9f9');
    if (T.wait > 0.7) tutorialNext();
  }
}

// ---------------------------------------------------------------- 繪圖
function tutorialTarget() {
  const st = TUT_STEPS[G.tutorial.i];
  return st.target ? st.target() : null;
}

function tutorialWorld() {
  const tg = tutorialTarget();
  if (!tg) return;
  const t = performance.now() / 1000;
  for (let k = 0; k < 2; k++) {
    const ph = (t * 0.9 + k * 0.5) % 1;
    ctx.beginPath(); ctx.arc(tg.x, tg.y, 34 + ph * 40, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,214,90,${1 - ph})`; ctx.lineWidth = 5; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(tg.x, tg.y, 34, 0, Math.PI * 2); ctx.strokeStyle = '#ffd65a'; ctx.lineWidth = 4; ctx.stroke();
}

function wrapText(s, maxW, size) {
  ensureFont(s);
  ctx.font = font(size);
  const out = [];
  let line = '';
  for (const ch of s) {
    if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch;
  }
  if (line) out.push(line);
  return out;
}

function tutorialHUD() {
  const T = G.tutorial, st = TUT_STEPS[T.i];
  // 說明面板：放在事件紀錄的位置（教學中不顯示事件紀錄）
  const w = Math.max(200, L.logW), x = UW - w - 6, y = L.logY;
  const body = wrapText(st.text, w - 20, 13);
  const foot = st.info ? (st.final ? '' : 'Enter 繼續') : (st.done && st.done() ? '完成！' : '');
  const h = 34 + body.length * 19 + (foot ? 22 : 6);
  panel(x, y, w, h, 0.9);
  ctx.strokeStyle = 'rgba(255,214,90,.7)'; ctx.lineWidth = 1.5; rr(ctx, x, y, w, h, 6); ctx.stroke();
  text(ctx, '教學 ' + (T.i + 1) + '／' + TUT_STEPS.length, x + w - 10, y + 15, { size: 11, align: 'right', color: '#bbb' });
  text(ctx, st.title, x + 10, y + 16, { size: 16, bold: true, color: '#ffd65a' });
  body.forEach((l, i) => text(ctx, l, x + 10, y + 42 + i * 19, { size: 13, color: '#eee' }));
  if (foot) text(ctx, foot, x + w - 10, y + h - 12, { size: 13, bold: true, align: 'right', color: st.info ? '#ffd27a' : '#9f9' });

  // 目標在畫面外時，在畫面邊緣畫箭頭
  const tg = tutorialTarget();
  if (!tg) return;
  const sp = toScreen(tg.x, tg.y), m = 40;
  if (sp.x > m && sp.x < VW - m && sp.y > m && sp.y < VH - m) return;
  const cx = VW / 2, cy = VH / 2, ang = Math.atan2(sp.y - cy, sp.x - cx);
  const k = Math.min((VW / 2 - m) / Math.abs(Math.cos(ang) || 1e-6), (VH / 2 - m) / Math.abs(Math.sin(ang) || 1e-6));
  const ax = (cx + Math.cos(ang) * k) / UI_SCALE, ay = (cy + Math.sin(ang) * k) / UI_SCALE;
  ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-3, 0); ctx.lineTo(-8, 10); ctx.closePath();
  ctx.fillStyle = '#ffd65a'; ctx.strokeStyle = '#3a1e0a'; ctx.lineWidth = 2; ctx.fill(); ctx.stroke();
  ctx.restore();
}
