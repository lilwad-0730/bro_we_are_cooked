'use strict';
// 教學關卡：一步一步帶玩家完成一道菜、學會背包、防守與打暈。
// 每一步有標題、說明、目標（地圖上會發亮並有箭頭指引）與完成條件；info 步驟按 Enter 繼續。

const tutC = () => player();
const tutTeam = () => G.teams[0];
const homeVeg = () => G.teams[0].homeVeg;
const myMush = () => G.nodes.filter(n => n.type === 'mush' && n.hp > 0).sort((a, b) => dist(a, tutC()) - dist(b, tutC()))[0];
const emptyStove = () => tutTeam().stoves.find(stoveEmpty);
const tutBoard = () => tutTeam().preps.find(p => p.items.length && !p.recipe) || tutTeam().preps.find(p => !p.recipe && !p.done) || tutTeam().preps[0];
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
  { title: '移動', text: '用 WASD 移動，走到廚房外發亮的蔬菜怪物旁。食材怪物分布在整張地圖上，雙方都可以搶。',
    target: homeVeg, done: () => dist(tutC(), homeVeg()) < 60,
    setup: () => { homeVeg().hp = CFG.MONSTER_HP; } },
  { title: '攻擊食材怪物', text: '靠近怪物、雙手空著按 E 攻擊，會一直打到牠的血條歸零；攻擊時可以在怪物周圍的黃色虛線圈內移動，走出圈外才會中斷。雙方攻擊力相同，打出最後一擊的人直接把食材拿在手上。雙手一次只能拿一件東西。',
    target: homeVeg,
    done: () => tutC().hand && tutC().hand.key === 'veg' },
  { title: '放上砧板', text: '回到廚房，走到桌子上的砧板旁按 E，把蔬菜放上砧板。一道料理的原料都要放在同一塊砧板上才能備料；桌子中間的兩個桌面可以暫放原料（每個兩份）。',
    target: () => tutBoard(), done: () => tutTeam().preps.some(p => p.items.includes('veg')) },
  { title: '再拿一種原料', text: '左上角的「雙蔬煎盤」還需要菇類。到野區攻擊菇類怪物，打倒後菇類會直接到你手上，放到同一塊砧板上。',
    target: () => {
      const c = tutC();
      if (c.hand && c.hand.key === 'mush') return tutBoard();
      return groundItem(i => i.key === 'mush') || myMush();
    },
    done: () => tutTeam().preps.some(p => hasAll(p.items, ['veg', 'mush']) || p.recipe === 'vm') },
  { title: '備料', text: '砧板上的菜＋菇剛好組成「雙蔬煎盤」，砧板下方會顯示料理名稱。雙手空著在砧板按 E 開始備料。備料要 4 秒，期間可以在砧板周圍的黃色虛線圈內移動；走出圈外會中斷，但進度會保留。',
    target: () => tutTeam().preps.find(p => p.recipe === 'vm' || hasAll(p.items, ['veg', 'mush'])) || tutBoard(),
    done: () => tutTeam().preps.some(p => p.recipe === 'vm' && p.done) || activeRecipes(0).has('vm') && !tutTeam().preps.some(p => p.recipe === 'vm') },
  { title: '放鍋', text: '按 E 拿起半成品，搬到廚房牆上的火爐按 E 放鍋，之後會自動烹調。廚房只有這兩口火爐，鍋子從牆外碰得到，烹調時要留意對手來關火。',
    target: () => (tutC().hand && tutC().hand.kind === 'semi' ? emptyStove() : tutTeam().preps.find(p => p.recipe === 'vm')),
    done: () => tutTeam().stoves.some(s => s.cooking === 'vm') },
  { title: '取成品', text: '等爐台顯示「可取餐」，雙手空著按 E 把成品拿起來。',
    target: () => tutTeam().stoves.find(s => s.cooking === 'vm'), done: () => tutC().hand && tutC().hand.kind === 'dish' },
  { title: '交餐', text: '把成品搬到出餐口按 E 交餐。',
    target: () => tutTeam().pass, done: () => tutTeam().done.includes('vm') },
  { title: '完成第一道菜！', info: true,
    text: '左上角是我方這一輪的三道菜，順序不拘，三道都交完才換下一輪；整輪完成時，越快完成拿到的速度獎勵越多（訂單板右上角會顯示現在完成可拿多少）。雙方訂單內容相同，但出餐進度分開，不會被搶單；比的是時間內誰交出的分數多。下方可以看到敵方進度。' },

  // ---- 背包
  { title: '收納蔬餅：解鎖背包',
    text: '打倒蔬菜怪物拿一份蔬菜，投入廚房裡的就地鍋，按 E 備料；煮好後按 E 吃掉，背包會解鎖兩格。',
    setup: () => { homeVeg().hp = CFG.MONSTER_HP; },
    target: () => {
      const c = tutC(), q = tutTeam().quick;
      if (q.raw || q.cooking || (c.hand && c.hand.key === 'veg')) return q;
      return groundItem(i => i.key === 'veg') || homeVeg();
    },
    done: () => tutC().hasBag },
  { title: '收進背包', text: '撿起地上的硬殼後按 R 收進背包。收納要站著不動 1 秒。背包裡的東西不占雙手，所以還能採集和打暈。',
    setup: () => { const p = freeSpotNear(tutC(), 50); const it = spawnItem('raw', 'shell', p.x, p.y, 0); it.life = 9999; G.tutorial.shell = it; },
    target: () => (G.items.includes(G.tutorial.shell) ? G.tutorial.shell : null),
    done: () => tutC().bag.some(i => i.key === 'shell') },
  { title: 'Tab 背包', text: '按 Tab 打開背包，用滑鼠把硬殼拖到框外放開，就會丟到腳邊。丟掉後再按 E 撿起、按 R 收回背包。',
    setup: () => { G.tutorial.dragged = false; },
    target: () => (G.items.includes(G.tutorial.shell) ? G.tutorial.shell : null),
    done: () => G.tutorial.dragged && tutC().bag.some(i => i.key === 'shell') },
  { title: '用背包裡的原料備料', text: '「力量燉湯」只要一份硬殼。到空的砧板旁，雙手空著按 E，會把背包裡的硬殼放上砧板；砧板顯示「→力量燉湯」後，再按 E 開始備料。',
    target: () => tutTeam().preps.find(p => p.items.includes('shell')) || tutTeam().preps.find(p => !p.recipe && !p.done && !p.items.length) || tutTeam().preps[0],
    done: () => tutTeam().preps.some(p => p.recipe === 'soup') || activeRecipes(0).has('soup') || tutC().stunOK },
  { title: '吃力量燉湯', text: '把燉湯的半成品放到爐台，煮好後在鍋邊按 E 吃掉，就能打暈 3 次。',
    target: () => {
      const c = tutC(), tm = tutTeam();
      if (c.hand && c.hand.kind === 'semi') return emptyStove();
      return tm.stoves.find(s => s.cooking === 'soup') || tm.preps.find(p => p.recipe === 'soup');
    },
    done: () => tutC().stunOK },

  // ---- 防守與打暈
  { title: '防守：火爐被關火',
    text: '廚房的門只有自己隊伍能進出，但牆上的火爐從外面碰得到。紅隊在牆外把火爐的火關掉了！關火不會有任何通知，要自己留意火爐是否熄火。熄火時烹調會暫停，回到火爐旁按 E 重新開火。守方站在火爐旁，就能打斷對手關火。',
    setup: () => {
      const tm = tutTeam(), s = tm.stoves.find(x => x.wall);
      Object.assign(s, { cooking: 'fm', progress: 3, done: false, flipped: false, flippedOnce: false });
      const e = enemyA(), spot = acc(e, s);
      e.x = spot.x; e.y = spot.y; e.hand = null; e.bag = []; e.flipCd = 0; e.down = 0;
      G.tutorial.flipStove = s;
      if (startFlip(e, s) !== true) { s.flipped = true; s.flippedOnce = true; s.progress = 0; }
    },
    target: () => G.tutorial.flipStove,
    done: () => { const s = G.tutorial.flipStove; return s.flippedOnce && !s.flipped && !enemyA().action; } },
  { title: '打暈搬貨的對手',
    text: '紅隊的人在廚房外搬貨。走出廚房，手上要空著（Q 放下），用滑鼠對準紅隊的人按空白鍵打暈。前搖 0.8 秒，打中後對方倒地 3 秒。',
    setup: () => {
      const a = enemyA(); const home = G.teams[1].spawn[0]; a.x = home.x; a.y = home.y; cancelAction(a);
      const e = enemyB(), p = P(0, 760, 860);
      e.x = p.x; e.y = p.y; e.down = 0; e.immune = 0; e.hand = { id: ++G.itemSeq, kind: 'semi', key: 'sv', team: 1, life: 9999 }; e.bag = [];
      G.tutorial.patrol = { x: p.x, y: p.y, t: 0 };
    },
    target: () => enemyB(), done: () => enemyB().down > 0 },
  { title: '對手的東西不能拿', info: true,
    text: '對手掉了一份半成品，但你不能撿：對方的食材、半成品和成品都偷不走。打暈只能拖慢對手，他要倒地 3 秒，再回頭把東西撿回來。' },
  { title: '關火', info: true,
    text: '你也可以到對手廚房外，在火爐正在烹調時按 E 按住 1.5 秒關火，對方不會收到通知。廚房是半開放的，雙方火爐的狀態都看得到：火爐上方顯示「可關火」、小地圖上綠色的方塊，就是正在烹調、可以去關的火爐。雙方廚房都只有牆上的兩口火爐，所以每道菜都要防範被關火：派人守在鍋旁，或趁對手不在時去關他的火。' },
  { title: '草叢', info: true,
    text: '野區有草叢。走進草叢後，對手就看不到你（除非他也走到你旁邊）；同樣地，對手也可能躲在草叢裡偷襲或偷偷關火。' },
  { title: '教學完成！', info: true, final: true,
    text: 'Enter 開始正式對局，T 再玩一次教學，Esc 回標題。正式對局是 6 分鐘，比的是誰交出的訂單分數多。' },
];

function startTutorial() {
  G.spectate = false;
  newMatch(7);   // 教學固定用同一張野區
  G.state = 'play'; G.paused = false; UI.fit = false; UI.bagOpen = false; UI.help = false;
  for (const c of G.chars) c.ai = false;
  G.chars[0].name = '你';
  G.roundDefs = [['vm', 'fm', 'st']];
  for (const tm of G.teams) { tm.round = 0; tm.done = []; tm.roundAt = 0; }
  G.logs = [];
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

// 教學說明面板：最後才畫，蓋在觸控按鈕、搖桿等所有東西上面（手機上提示文字才不會被擋住）
function tutorialPanel() {
  if (!G.tutorial || G.state !== 'play' || G.paused || UI.help) return;
  const T = G.tutorial, st = TUT_STEPS[T.i];
  // 換到新的一步時自動展開
  if (T.shownI !== T.i) { T.shownI = T.i; T.folded = false; }
  // 說明面板：放在事件紀錄的位置（教學中不顯示事件紀錄）
  const w = Math.max(200, L.logW), x = UW - w - 6, y = L.logY;
  // 收起時只留標題列：手機上面板會蓋到右側的觸控按鈕，點一下面板可收起／展開
  if (T.folded) {
    UI.tutRect = { x, y, w, h: 26 };
    panel(x, y, w, 26, 0.9);
    ctx.strokeStyle = 'rgba(255,214,90,.7)'; ctx.lineWidth = 1.5; rr(ctx, x, y, w, 26, 6); ctx.stroke();
    text(ctx, st.title, x + 10, y + 13, { size: 14, bold: true, color: '#ffd65a' });
    text(ctx, '▼ 點一下展開', x + w - 10, y + 13, { size: 11, align: 'right', color: '#bbb' });
    return;
  }
  const body = wrapText(keyText(st.text), w - 20, 13);
  const foot = keyText(st.info ? (st.final ? '' : 'Enter 繼續') : (st.done && st.done() ? '完成！' : ''));
  const h = 34 + body.length * 19 + (foot ? 22 : 6) + (touchUI() ? 14 : 0);
  UI.tutRect = { x, y, w, h };
  panel(x, y, w, h, 0.9);
  ctx.strokeStyle = 'rgba(255,214,90,.7)'; ctx.lineWidth = 1.5; rr(ctx, x, y, w, h, 6); ctx.stroke();
  text(ctx, '教學 ' + (T.i + 1) + '／' + TUT_STEPS.length, x + w - 10, y + 15, { size: 11, align: 'right', color: '#bbb' });
  text(ctx, st.title, x + 10, y + 16, { size: 16, bold: true, color: '#ffd65a' });
  body.forEach((l, i) => text(ctx, l, x + 10, y + 42 + i * 19, { size: 13, color: '#eee' }));
  if (foot) text(ctx, foot, x + w - 10, y + h - 12 - (touchUI() ? 14 : 0), { size: 13, bold: true, align: 'right', color: st.info ? '#ffd27a' : '#9f9' });
  if (touchUI()) text(ctx, '▲ 點一下收起', x + 10, y + h - 10, { size: 11, color: '#999' });
}

// 點教學面板：收起／展開（手機上讓被蓋住的按鈕可以用）
function tapTutorialPanel(u) {
  const r = UI.tutRect;
  if (!G.tutorial || !r || G.paused || UI.help || !inRect(u, r)) return false;
  G.tutorial.folded = !G.tutorial.folded;
  return true;
}

// 目標在畫面外時的邊緣箭頭（畫在面板下面）
function tutorialHUD() {
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
