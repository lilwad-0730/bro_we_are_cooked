'use strict';
// 繪圖：地面 → 視野內的動態物件 → 淡黑色視野遮罩 → 固定建築與區塊（永遠可見）→ 介面。

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const fogC = document.createElement('canvas');
const fctx = fogC.getContext('2d');
let VW = 0, VH = 0;
const cam = { x: W / 2, y: H / 2, zoom: 0.8 };
const UI = { bagRect: null, slotRects: null, drag: null, mouse: { x: 0, y: 0 } };

function resize() { VW = cv.width = innerWidth; VH = cv.height = innerHeight; fogC.width = VW; fogC.height = VH; }
addEventListener('resize', resize);
resize();

const font = (px, bold) => (bold ? 'bold ' : '') + px + 'px ' + FONT;
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function text(c, s, x, y, o = {}) {
  c.font = font(o.size || 14, o.bold); c.textAlign = o.align || 'left'; c.textBaseline = o.base || 'middle';
  if (o.stroke) { c.lineWidth = 3; c.strokeStyle = o.stroke; c.strokeText(s, x, y); }
  c.fillStyle = o.color || '#fff'; c.fillText(s, x, y);
}
const toScreen = (x, y) => ({ x: (x - cam.x) * cam.zoom + VW / 2, y: (y - cam.y) * cam.zoom + VH / 2 });
const toWorld = (x, y) => ({ x: (x - VW / 2) / cam.zoom + cam.x, y: (y - VH / 2) / cam.zoom + cam.y });
const seen = p => G.reveal || canSee(0, p);

// ---------------------------------------------------------------- 圖示
function drawItemIcon(c, kind, key, x, y, s = 13) {
  if (kind === 'raw') {
    c.beginPath(); c.arc(x, y, s, 0, Math.PI * 2); c.fillStyle = ING[key].color; c.fill();
    c.lineWidth = 2; c.strokeStyle = '#1b1b1b'; c.stroke();
    text(c, ING[key].ch, x, y + 1, { size: s * 1.05, bold: true, align: 'center', color: '#111' });
  } else if (kind === 'semi') {
    rr(c, x - s, y - s, s * 2, s * 2, 5); c.fillStyle = '#f0c75e'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#5a4210'; c.stroke();
    text(c, RECIPES[key].short, x, y + 1, { size: s * 1.05, bold: true, align: 'center', color: '#3a2a00' });
  } else {
    c.beginPath(); c.arc(x, y, s + 2, 0, Math.PI * 2); c.fillStyle = '#fafafa'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#d48a2c'; c.stroke();
    text(c, RECIPES[key].short, x, y + 1, { size: s * 1.05, bold: true, align: 'center', color: '#a8540c' });
  }
}

function bar(c, x, y, w, frac, color, h = 5) {
  c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(x - w / 2, y, w, h);
  c.fillStyle = color; c.fillRect(x - w / 2, y, w * clamp(frac, 0, 1), h);
}

// ---------------------------------------------------------------- 世界
function drawGround() {
  ctx.fillStyle = '#34402f'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#4f4b3a'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const lanes = [
    [[580, 750], [W - 580, 750]],
    [[580, 590], [440, 300], [440, 100], [1320, 100]], [[W - 580, 590], [W - 440, 300], [W - 440, 100], [W - 1320, 100]],
    [[580, 910], [440, 1200], [440, 1400], [1320, 1400]], [[W - 580, 910], [W - 440, 1200], [W - 440, 1400], [W - 1320, 1400]],
    [[700, 460], [1220, 470], [1350, 640]], [[700, 1130], [1220, 1030], [1350, 860]],
    [[W - 700, 460], [W - 1220, 470], [1350, 640]], [[W - 700, 1130], [W - 1220, 1030], [1350, 860]],
  ];
  ctx.lineWidth = 90;
  for (const l of lanes) { ctx.beginPath(); l.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(1350, 750, 210, 0, Math.PI * 2); ctx.fillStyle = '#58523f'; ctx.fill();
  for (const tm of G.teams) {
    const f = tm.floor;
    ctx.fillStyle = tm.id === 0 ? '#3e4552' : '#4d3d3d'; ctx.fillRect(f.x, f.y, f.w, f.h);
    ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.lineWidth = 1;
    for (let x = f.x; x < f.x + f.w; x += 40) { ctx.beginPath(); ctx.moveTo(x, f.y); ctx.lineTo(x, f.y + f.h); ctx.stroke(); }
    for (let y = f.y; y < f.y + f.h; y += 40) { ctx.beginPath(); ctx.moveTo(f.x, y); ctx.lineTo(f.x + f.w, y); ctx.stroke(); }
  }
}

function drawChar(c) {
  const tm = G.teams[c.team];
  ctx.save(); ctx.translate(c.x, c.y);
  if (c.immune > 0) { ctx.beginPath(); ctx.arc(0, 0, CFG.R + 7, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); }
  ctx.beginPath(); ctx.arc(0, 0, CFG.R, 0, Math.PI * 2);
  ctx.fillStyle = c.down > 0 ? '#777' : tm.color; ctx.fill();
  ctx.lineWidth = c === player() && !c.ai ? 4 : 2; ctx.strokeStyle = c === player() && !c.ai ? '#fff' : tm.dark; ctx.stroke();
  if (c.down <= 0) {
    ctx.rotate(c.face);
    ctx.beginPath(); ctx.moveTo(CFG.R + 7, 0); ctx.lineTo(CFG.R - 1, -6); ctx.lineTo(CFG.R - 1, 6); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.rotate(-c.face);
  } else text(ctx, '暈', 0, 1, { size: 24, bold: true, align: 'center', color: '#ffe066' });
  if (c.gloves) { ctx.beginPath(); ctx.arc(0, 0, CFG.R + 3, 0, Math.PI * 2); ctx.strokeStyle = '#ff9f43'; ctx.lineWidth = 3; ctx.stroke(); }
  c.bag.forEach((it, i) => drawItemIcon(ctx, it.kind, it.key, -CFG.R - 4 + i * 18, CFG.R - 4, 10));
  if (c.hand) drawItemIcon(ctx, c.hand.kind, c.hand.key, 0, -CFG.R - 18, 14);
  text(ctx, c.name + ' ' + TOOLS[c.tool].slice(-1) + (c.stunOK ? ' ' + '●'.repeat(c.charges) + '○'.repeat(CFG.CHARGES - c.charges) : ''), 0, CFG.R + 20,
    { size: 22, bold: true, align: 'center', color: '#fff', stroke: 'rgba(0,0,0,.8)' });
  if (c.action && c.action.dur < 90) bar(ctx, 0, -CFG.R - 42, 56, c.action.t / c.action.dur, '#ffd25e', 8);
  if (c.down > 0) bar(ctx, 0, -CFG.R - 42, 56, 1 - c.down / CFG.STUN_DOWN, '#bbb', 8);
  ctx.restore();
}

function drawFx() {
  for (const f of G.fx) {
    if (f.type === 'swing') {
      const c = f.c; if (!seen(c)) continue;
      ctx.beginPath(); ctx.moveTo(c.x, c.y);
      ctx.arc(c.x, c.y, CFG.STUN_RANGE + CFG.R, c.face - CFG.STUN_ARC / 2, c.face + CFG.STUN_ARC / 2); ctx.closePath();
      ctx.fillStyle = `rgba(255,210,94,${0.15 + 0.35 * f.t / f.dur})`; ctx.fill();
    } else if (f.type === 'hit') {
      if (!seen(f)) continue;
      ctx.beginPath(); ctx.arc(f.x, f.y, 14 + 30 * f.t, 0, Math.PI * 2); ctx.strokeStyle = `rgba(255,255,255,${1 - f.t / f.dur})`; ctx.lineWidth = 2; ctx.stroke();
    }
  }
}

function drawFog() {
  if (G.reveal) return;
  const z = cam.zoom;
  fctx.setTransform(1, 0, 0, 1, 0, 0);
  fctx.globalCompositeOperation = 'source-over';
  fctx.clearRect(0, 0, VW, VH);
  fctx.fillStyle = 'rgba(0,0,0,0.6)'; fctx.fillRect(0, 0, VW, VH);
  fctx.globalCompositeOperation = 'destination-out';
  fctx.setTransform(z, 0, 0, z, VW / 2 - cam.x * z, VH / 2 - cam.y * z);
  G.visPolys = [];
  for (const c of G.chars) {
    if (c.team !== 0) continue;
    const poly = visPoly(c.x, c.y, CFG.VISION);
    G.visPolys.push(poly);
    const g = fctx.createRadialGradient(c.x, c.y, CFG.VISION * 0.72, c.x, c.y, CFG.VISION);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    fctx.fillStyle = g;
    fctx.beginPath(); poly.forEach((p, i) => (i ? fctx.lineTo(p.x, p.y) : fctx.moveTo(p.x, p.y))); fctx.closePath(); fctx.fill();
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(fogC, 0, 0); ctx.restore();
}

const STATION_LOOK = {
  storage: { w: 92, h: 44, label: '倉庫', fill: '#6b5440' },
  prep: { w: 74, h: 44, label: '備料台', fill: '#6e6a5e' },
  stove: { w: 64, h: 52, label: '爐台', fill: '#3c3c42' },
  pass: { w: 52, h: 76, label: '出餐口', fill: '#7b6a2e' },
  tool: { w: 54, h: 66, label: '工具架', fill: '#4d5a3e' },
  glove: { w: 54, h: 66, label: '手套架', fill: '#7a4f2a' },
};

function drawStaticLayer() {
  for (const r of G.waters) {
    ctx.fillStyle = '#25506e'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 2;
    for (let x = r.x + 20; x < r.x + r.w; x += 60) { ctx.beginPath(); ctx.moveTo(x, r.y + r.h / 2); ctx.lineTo(x + 24, r.y + r.h / 2 - 4); ctx.stroke(); }
  }
  for (const r of G.walls) {
    ctx.fillStyle = '#6f727c'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#8a8e99'; ctx.fillRect(r.x, r.y, r.w, Math.min(8, r.h));
    ctx.strokeStyle = '#2a2c31'; ctx.lineWidth = 2; ctx.strokeRect(r.x, r.y, r.w, r.h);
  }
  for (const s of G.stations) {
    const tm = G.teams[s.team];
    const L = s.quick ? { w: 60, h: 52, label: '就地鍋', fill: '#3c3c42' } : STATION_LOOK[s.type];
    rr(ctx, s.x - L.w / 2, s.y - L.h / 2, L.w, L.h, 6); ctx.fillStyle = L.fill; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = tm.color; ctx.stroke();
    if (s.type === 'stove') { ctx.beginPath(); ctx.arc(s.x, s.y + 2, 15, 0, Math.PI * 2); ctx.strokeStyle = '#222'; ctx.lineWidth = 4; ctx.stroke(); }
    text(ctx, L.label, s.x, s.y - L.h / 2 - 15, { size: 24, bold: true, align: 'center', color: '#f3f3f3', stroke: 'rgba(0,0,0,.8)' });
  }
  for (const n of G.nodes) {
    ctx.beginPath(); ctx.arc(n.x, n.y, 24, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,20,20,.55)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = ING[n.type].color; ctx.stroke();
  }
}

function drawDynamicStations() {
  for (const s of G.stations) {
    const mine = s.team === 0;
    if (!mine && !seen(s)) { if (s.type !== 'pass' && s.type !== 'tool' && s.type !== 'glove') text(ctx, '?', s.x, s.y, { size: 32, bold: true, align: 'center', color: 'rgba(255,255,255,.5)' }); continue; }
    if (s.type === 'storage') s.items.forEach((k, i) => drawItemIcon(ctx, 'raw', k, s.x - 30 + i * 30, s.y + 2, 14));
    if (s.type === 'prep' && s.recipe) {
      drawItemIcon(ctx, 'semi', s.recipe, s.x, s.y + 2, 14);
      if (!s.done) bar(ctx, s.x, s.y + 18, 60, s.progress / (RECIPES[s.recipe].ings.length * CFG.PREP_PER_ING), '#f0c75e');
      else text(ctx, '完成', s.x, s.y + 32, { size: 22, bold: true, align: 'center', color: '#9f9', stroke: '#000' });
    }
    if (s.type === 'stove') {
      if (s.quick && s.raw) { drawItemIcon(ctx, 'raw', 'veg', s.x, s.y + 2, 14); bar(ctx, s.x, s.y + 18, 50, s.prepP / (CFG.PREP_PER_ING), '#f0c75e'); }
      if (s.cooking) {
        const r = RECIPES[s.cooking];
        drawItemIcon(ctx, s.done ? 'dish' : 'semi', s.cooking, s.x, s.y + 2, 14);
        if (!s.done) bar(ctx, s.x, s.y + 18, 54, s.progress / r.cook, s.flipped ? '#ff5d5d' : '#6fdc6f');
        if (s.flipped) text(ctx, '翻倒！', s.x, s.y - 62, { size: 28, bold: true, align: 'center', color: '#ff6b6b', stroke: '#000' });
        if (s.beingFlipped !== null && s.beingFlipped !== undefined) text(ctx, '正在被翻', s.x, s.y - 62, { size: 26, bold: true, align: 'center', color: '#ffb36b', stroke: '#000' });
        if (s.done) text(ctx, r.ability ? '可食用' : '可取餐', s.x, s.y + 38, { size: 22, bold: true, align: 'center', color: '#9f9', stroke: '#000' });
      }
    }
  }
  for (const n of G.nodes) {
    if (!seen(n)) { text(ctx, ING[n.type].ch, n.x, n.y + 1, { size: 28, align: 'center', color: 'rgba(255,255,255,.45)' }); continue; }
    if (n.hp > 0) {
      text(ctx, ING[n.type].ch, n.x, n.y + 1, { size: 30, bold: true, align: 'center', color: '#fff', stroke: 'rgba(0,0,0,.6)' });
      for (let i = 0; i < CFG.NODE_HP; i++) { ctx.beginPath(); ctx.arc(n.x - 14 + i * 14, n.y + 32, 5, 0, Math.PI * 2); ctx.fillStyle = i < n.hp ? ING[n.type].color : '#333'; ctx.fill(); }
    } else text(ctx, Math.ceil(n.respawn) + '', n.x, n.y + 1, { size: 26, bold: true, align: 'center', color: '#aaa' });
  }
}

function drawWorld() {
  const z = cam.zoom;
  ctx.setTransform(z, 0, 0, z, VW / 2 - cam.x * z, VH / 2 - cam.y * z);
  drawGround();
  for (const it of G.items) {
    if (!seen(it)) continue;
    if (it.life < 5 && Math.floor(it.life * 4) % 2) continue;
    drawItemIcon(ctx, it.kind, it.key, it.x, it.y, 14);
  }
  drawFx();
  for (const c of G.chars) if (c.team === 0 || seen(c)) drawChar(c);
  drawFog();
  ctx.setTransform(z, 0, 0, z, VW / 2 - cam.x * z, VH / 2 - cam.y * z);
  drawStaticLayer();
  drawDynamicStations();
  for (const p of G.pings) {
    if (p.team !== 0) continue;
    ctx.beginPath(); ctx.arc(p.x, p.y, 30 + 60 * (p.t % 1), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,90,90,${1 - (p.t % 1)})`; ctx.lineWidth = 4; ctx.stroke();
  }
  for (const f of G.fx) if (f.type === 'text' && seen(f)) text(ctx, f.text, f.x, f.y - 20 - f.t * 30, { size: 36, bold: true, align: 'center', color: f.color, stroke: '#000' });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ---------------------------------------------------------------- 介面
// 介面整層放大 UI_SCALE 倍繪製（字、框、間距等比例放大）。以下座標都是放大前的「介面單位」：
// 畫面寬 UW = VW / UI_SCALE、高 UH = VH / UI_SCALE。小地圖例外，維持實際像素大小。
const UI_SCALE = 2;
let UW = 0, UH = 0;
const MINI_W = 300;                                   // 小地圖寬（實際像素）
const miniBox = () => ({ w: (MINI_W + 24) / UI_SCALE, h: (MINI_W * H / W + 24) / UI_SCALE });

function panel(x, y, w, h, alpha = 0.72) { rr(ctx, x, y, w, h, 6); ctx.fillStyle = `rgba(16,18,24,${alpha})`; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; ctx.stroke(); }

function drawTopBar() {
  const remain = Math.max(0, CFG.MATCH - G.time);
  const mm = Math.floor(remain / 60), ss = Math.floor(remain % 60);
  const w = 260, x = UW / 2 - w / 2;
  panel(x, 6, w, 50);
  text(ctx, G.teams[0].score + '', x + 52, 30, { size: 26, bold: true, align: 'center', color: G.teams[0].color });
  text(ctx, G.teams[1].score + '', x + w - 52, 30, { size: 26, bold: true, align: 'center', color: G.teams[1].color });
  text(ctx, mm + ':' + String(ss).padStart(2, '0'), x + w / 2, 26, { size: 24, bold: true, align: 'center', color: remain <= CFG.RUSH ? '#ffb347' : '#fff' });
  text(ctx, G.rush ? '尖峰 ×1.5' : '第 ' + G.round + ' 輪', x + w / 2, 46, { size: 11, align: 'center', color: G.rush ? '#ffb347' : '#bbb' });
  text(ctx, '我方', x + 8, 13, { size: 11, color: '#aaa', base: 'top' });
  text(ctx, '敵方', x + w - 8, 13, { size: 11, align: 'right', color: '#aaa', base: 'top' });
  const st = [G.paused ? '暫停' : '', G.speed !== 1 ? '×' + G.speed : '', G.spectate ? '觀戰' : '', G.reveal ? '全圖' : ''].filter(Boolean).join(' ');
  text(ctx, (st ? st + '　' : '') + 'H 說明', UW - 8, 16, { size: 13, align: 'right', color: st ? '#ffd27a' : '#999' });
}

// 訂單：左側直排三張卡片
function drawOrders() {
  const x = 6, y = 6, cw = 160, ch = 60, gap = 4;
  const preview = G.nextOrders ? 34 : 0;
  panel(x, y, cw + 8, 24 + 3 * (ch + gap) + preview);
  text(ctx, '共用訂單（先交先得）', x + 8, y + 13, { size: 13, bold: true, color: '#ddd' });
  const mineA = activeRecipes(0), theirA = activeRecipes(1);
  G.orders.forEach((o, i) => {
    const cx = x + 4, cy = y + 24 + i * (ch + gap);
    rr(ctx, cx, cy, cw, ch, 5);
    ctx.fillStyle = o.doneBy < 0 ? 'rgba(255,255,255,.08)' : (o.doneBy === 0 ? 'rgba(76,155,255,.28)' : 'rgba(255,93,93,.28)'); ctx.fill();
    text(ctx, RECIPES[o.key].name, cx + 6, cy + 12, { size: 15, bold: true });
    text(ctx, o.score + '', cx + cw - 6, cy + 12, { size: 14, bold: true, align: 'right', color: '#ffd27a' });
    RECIPES[o.key].ings.forEach((k, j) => drawItemIcon(ctx, 'raw', k, cx + 14 + j * 24, cy + 32, 10));
    if (o.doneBy >= 0) text(ctx, (o.doneBy === 0 ? '我方' : '敵方') + '完成', cx + cw - 6, cy + 32, { size: 13, bold: true, align: 'right', color: G.teams[o.doneBy].color });
    else {
      if (mineA.has(o.key)) text(ctx, '我方製作中', cx + 6, cy + 51, { size: 11, color: G.teams[0].color });
      if (theirA.has(o.key)) text(ctx, '敵方製作中', cx + cw - 6, cy + 51, { size: 11, align: 'right', color: G.teams[1].color });
    }
  });
  if (G.nextOrders) {
    const py = y + 24 + 3 * (ch + gap);
    text(ctx, '下一輪預告：', x + 8, py + 8, { size: 12, color: '#bbb' });
    text(ctx, G.nextOrders.map(o => RECIPES[o.key].name).join('、'), x + 8, py + 24, { size: 12, color: '#ddd' });
  }
}

// 事件紀錄：右上，計分列下方
function drawLog() {
  const w = Math.min(260, UW / 2 - 140), x = UW - w - 6, y = 62;
  const n = Math.min(UH < 400 ? 4 : 7, G.logs.length);
  if (!n || w < 120) return;
  panel(x, y, w, 8 + n * 18, 0.6);
  for (let i = 0; i < n; i++) {
    const l = G.logs[i];
    const col = l.team < 0 ? '#ddd' : G.teams[l.team].color;
    const t = Math.max(0, CFG.MATCH - l.t), stamp = Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
    text(ctx, stamp, x + 6, y + 13 + i * 18, { size: 11, color: '#888' });
    ctx.save(); ctx.beginPath(); ctx.rect(x + 38, y + 4 + i * 18, w - 42, 18); ctx.clip();
    text(ctx, l.text, x + 40, y + 13 + i * 18, { size: 12, color: col });
    ctx.restore();
  }
}

// 小地圖：維持實際像素大小，左下角
function drawMinimap() {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  const w = MINI_W, h = w * H / W, x = 12, y = VH - h - 12, k = w / W;
  panel(x - 4, y - 4, w + 8, h + 8, 0.8);
  ctx.translate(x, y); ctx.scale(k, k);
  ctx.fillStyle = '#34402f'; ctx.fillRect(0, 0, W, H);
  for (const tm of G.teams) { ctx.fillStyle = tm.id === 0 ? '#3e4552' : '#4d3d3d'; const f = tm.floor; ctx.fillRect(f.x, f.y, f.w, f.h); }
  if (!G.reveal) {
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, H);
    for (const poly of G.visPolys || []) { ctx.beginPath(); poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fillStyle = 'rgba(120,140,110,.55)'; ctx.fill(); }
  }
  ctx.fillStyle = '#25506e'; for (const r of G.waters) ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = '#8a8e99'; for (const r of G.walls) ctx.fillRect(r.x, r.y, r.w, r.h);
  for (const n of G.nodes) { ctx.beginPath(); ctx.arc(n.x, n.y, 22, 0, Math.PI * 2); ctx.fillStyle = ING[n.type].color; ctx.fill(); }
  for (const c of G.chars) {
    if (c.team !== 0 && !seen(c)) continue;
    ctx.beginPath(); ctx.arc(c.x, c.y, c === player() && !c.ai ? 44 : 34, 0, Math.PI * 2);
    ctx.fillStyle = G.teams[c.team].color; ctx.fill();
    if (c === player() && !c.ai) { ctx.lineWidth = 12; ctx.strokeStyle = '#fff'; ctx.stroke(); }
  }
  for (const p of G.pings) if (p.team === 0) { ctx.beginPath(); ctx.arc(p.x, p.y, 80 + 120 * (p.t % 1), 0, Math.PI * 2); ctx.lineWidth = 18; ctx.strokeStyle = '#ff5a5a'; ctx.stroke(); }
  if (!G.spectate) {
    const tl = toWorld(0, 0), br = toWorld(VW, VH);
    ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  }
  ctx.restore();
}

function slot(x, y, s, it, label) {
  rr(ctx, x, y, s, s, 5); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.stroke();
  if (it) drawItemIcon(ctx, it.kind, it.key, x + s / 2, y + s / 2, s * 0.3);
  text(ctx, label, x + s / 2, y + s + 9, { size: 11, align: 'center', color: '#aaa' });
}

// 介面座標下的滑鼠位置
const uiMouse = () => ({ x: UI.mouse.x / UI_SCALE, y: UI.mouse.y / UI_SCALE });

function drawPlayerPanel() {
  const c = player();
  const left = miniBox().w + 4;                      // 避開左下角小地圖
  if (G.spectate) {
    const w = Math.min(UW - left - 6, 420), x = Math.max(UW / 2 - w / 2, left);
    panel(x, UH - 34, w, 28);
    text(ctx, '觀戰中：V 切回操作　Z 全圖／跟隨　＋／－ 速度', x + w / 2, UH - 20, { size: 13, align: 'center', color: '#ddd' });
    return;
  }
  const w = Math.min(UW - left - 6, 430), h = 74, x = Math.max(UW / 2 - w / 2, left), y = UH - h - 6;
  panel(x, y, w, h);
  slot(x + 8, y + 8, 40, c.hand, '手上');
  for (let i = 0; i < CFG.BAG_SLOTS; i++) {
    const it = c.bag[i];
    slot(x + 54 + i * 44, y + 8, 40, it && !(UI.drag && UI.drag.item === it) ? it : null, '背包' + (i + 1));
    if (!c.hasBag) text(ctx, '鎖', x + 74 + i * 44, y + 28, { size: 16, align: 'center', color: '#777' });
  }
  const tx = x + 54 + CFG.BAG_SLOTS * 44 + 6;
  const lines = [
    TOOLS[c.tool] + (c.gloves ? '｜戴手套' : '') + '｜速度 ' + Math.round(speedOf(c) / CFG.SPEED * 100) + '%',
    '打暈 ' + (c.stunOK ? c.charges + ' 次' + (c.stunCd > 0 ? '（冷卻 ' + Math.ceil(c.stunCd) + '）' : '') : '未解鎖'),
    '翻鍋 ' + (c.flipCd > 0 ? '冷卻 ' + Math.ceil(c.flipCd) + ' 秒' : '可用'),
  ];
  lines.forEach((l, i) => text(ctx, l, tx, y + 15 + i * 21, { size: 13, color: '#e6e6e6' }));

  const cx = getContext(c);
  if (cx) {
    const items = cx.menu ? [cx.label, ...cx.menu.map(m => m.key + ' ' + m.label + (m.ok ? '' : '（缺料）'))] : [cx.label];
    ctx.font = font(14);
    const tw = Math.min(UW - 12, Math.max(...items.map(s => ctx.measureText(s).width)) + 20);
    const hx = clamp(UW / 2, tw / 2 + 6, UW - tw / 2 - 6);
    const hy = y - 6 - items.length * 20 - 6;
    panel(hx - tw / 2, hy, tw, items.length * 20 + 6, 0.85);
    items.forEach((s, i) => text(ctx, s, hx, hy + 13 + i * 20, { size: 14, align: 'center', color: i === 0 ? '#ffe9a8' : (cx.menu[i - 1].ok ? '#fff' : '#888') }));
  }

  UI.bagRect = null;
  if (UI.bagOpen) {
    // 放在右下、玩家面板上方，不蓋住畫面中央的角色
    const bw = 200, bh = 104, bx = UW - bw - 6, by = Math.max(62, y - bh - 8);
    UI.bagRect = { x: bx, y: by, w: bw, h: bh };
    panel(bx, by, bw, bh, 0.92);
    text(ctx, '背包（Tab 關閉）', bx + 8, by + 12, { size: 13, bold: true });
    if (!c.hasBag) {
      text(ctx, '未解鎖：在就地鍋做收納蔬餅', bx + bw / 2, by + 46, { size: 12, align: 'center', color: '#aaa' });
      text(ctx, '（蔬菜 1 份）並食用，解鎖兩格', bx + bw / 2, by + 64, { size: 12, align: 'center', color: '#aaa' });
    } else {
      UI.slotRects = [];
      for (let i = 0; i < CFG.BAG_SLOTS; i++) {
        const r = { x: bx + bw / 2 - 28 * CFG.BAG_SLOTS + i * 56 + 4, y: by + 24, w: 48, h: 48 };
        UI.slotRects.push(r);
        const it = c.bag[i];
        slot(r.x, r.y, 48, it && !(UI.drag && UI.drag.item === it) ? it : null, '第 ' + (i + 1) + ' 格');
      }
      text(ctx, '拖到框外丟棄；兩格滿時移速 75%', bx + bw / 2, by + bh - 8, { size: 11, align: 'center', color: '#999' });
    }
  }
  if (UI.drag && c.bag.includes(UI.drag.item)) { const m = uiMouse(); drawItemIcon(ctx, UI.drag.item.kind, UI.drag.item.key, m.x, m.y, 14); }
}

function drawToasts(dt) {
  G.toasts.forEach(t => (t.t += dt));
  G.toasts = G.toasts.filter(t => t.t < 2.2);
  G.toasts.forEach((t, i) => text(ctx, t.text, UW / 2, 72 + i * 24, { size: 17, bold: true, align: 'center', color: t.color, stroke: 'rgba(0,0,0,.85)' }));
}

const HELP = [
  'WASD 移動　滑鼠 瞄準　空白鍵 打暈',
  'E 互動：採集、拾取、入庫、備料、放鍋',
  '　　　　取餐、交餐、翻敵鍋、扶正自家鍋',
  '1～5 在備料台選料理、在工具架選工具',
  'Q 放下手上物品　R 收進背包（1 秒前搖）',
  'Tab 開關背包，拖到框外丟棄',
  'V 觀戰　Z 全圖／跟隨　滾輪 縮放',
  '＋／－ 速度　P 暫停　M 全圖顯示（除錯）',
];

// 依可用高度把一組文字垂直置中
function block(lines) {
  const total = lines.reduce((a, l) => a + l.gap, 0);
  let y = Math.max(8, UH / 2 - total / 2);
  for (const l of lines) { text(ctx, l.t, UW / 2, y + l.gap / 2, { size: l.size, bold: l.bold, align: 'center', color: l.color || '#eee' }); y += l.gap; }
}

function drawOverlay() {
  if (G.state === 'title' || G.state === 'end' || UI.help) { ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(0, 0, UW, UH); }
  if (G.state === 'title') {
    const m = G.measure;
    block([
      { t: '烹飪搜打撤　2D DEMO', size: 34, bold: true, gap: 46 },
      { t: '你操作藍隊的「你」，隊友與敵方都是 NPC。', size: 15, color: '#ccc', gap: 22 },
      { t: '六分鐘內規劃訂單，防範對方翻鍋與打暈。', size: 15, color: '#ccc', gap: 28 },
      ...HELP.map(t => ({ t, size: 15, gap: 21 })),
      { t: 'Enter 開始操作　｜　V 觀戰', size: 18, bold: true, color: '#ffd27a', gap: 34 },
      { t: '倉庫到採集點：' + Object.entries(m).map(([k, v]) => k + ' ' + v + ' 秒').join('　'), size: 12, color: '#888', gap: 16 },
    ]);
  } else if (G.state === 'end') {
    const [a, b] = G.teams;
    const msg = G.winner === -1 ? '平手' : (G.winner === 0 ? '我方勝利！' : '敵方勝利');
    block([
      { t: msg, size: 40, bold: true, color: G.winner === 0 ? a.color : (G.winner === 1 ? b.color : '#fff'), gap: 48 },
      { t: '我方 ' + a.score + '　：　' + b.score + ' 敵方', size: 26, bold: true, gap: 36 },
      { t: '共 ' + G.round + ' 輪' + (a.score === b.score && a.score > 0 ? '（同分：較早完成最後一次得分者勝）' : ''), size: 15, color: '#ccc', gap: 30 },
      { t: 'Enter 再玩一局　｜　V 觀戰一局', size: 18, bold: true, color: '#ffd27a', gap: 26 },
    ]);
  } else if (UI.help) {
    block([{ t: '操作說明（H 關閉）', size: 24, bold: true, gap: 38 }, ...HELP.map(t => ({ t, size: 15, gap: 23 }))]);
  }
}

let lastRender = performance.now();
function render() {
  const now = performance.now(), dt = (now - lastRender) / 1000; lastRender = now;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#111318'; ctx.fillRect(0, 0, VW, VH);
  drawWorld();
  UW = VW / UI_SCALE; UH = VH / UI_SCALE;
  ctx.setTransform(UI_SCALE, 0, 0, UI_SCALE, 0, 0);
  if (G.state !== 'title') { drawOrders(); drawTopBar(); drawLog(); drawMinimap(); drawPlayerPanel(); drawToasts(dt); }
  drawOverlay();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
