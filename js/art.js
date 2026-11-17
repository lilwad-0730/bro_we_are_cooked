'use strict';
// 美術：食材、半成品、料理、食材怪物、設施、岩石與牆的向量繪圖（使用者指定：一眼認得出是什麼）。
// 每個圖示都在以 (x, y) 為中心、半徑約 s 的範圍內繪製；內部用 20 單位當半徑，再縮放到 s。

function unit(c, x, y, s, fn) {
  c.save(); c.translate(x, y); c.scale(s / 20, s / 20); fn(c); c.restore();
}
function ell(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }
function fillStroke(c, fill, stroke, lw = 2) { c.fillStyle = fill; c.fill(); if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); } }
function rrect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// ---------------------------------------------------------------- 食材
const ING_ART = {
  // 蔬菜：青江菜（三片葉子＋白色菜梗）
  veg(c) {
    rrect(c, -6, 4, 12, 15, 4); fillStroke(c, '#eaf5d6', '#4d7a2c');
    for (const [x, r] of [[-8, -0.45], [8, 0.45], [0, 0]]) {
      ell(c, x, -5, 8, 14, r); fillStroke(c, '#3fae49', '#1d5e24');
      c.beginPath(); c.moveTo(x - Math.sin(r) * 11, -5 + Math.cos(r) * 10); c.lineTo(x + Math.sin(r) * 11, -5 - Math.cos(r) * 11);
      c.lineWidth = 1.6; c.strokeStyle = '#bdeb9a'; c.stroke();
    }
  },
  // 菇類：咖啡色傘蓋＋白點＋米色菇柄
  mush(c) {
    rrect(c, -6, -1, 12, 18, 5); fillStroke(c, '#f4e7cf', '#6b4a2a');
    c.beginPath(); c.moveTo(-19, 2); c.bezierCurveTo(-19, -22, 19, -22, 19, 2); c.closePath(); fillStroke(c, '#b4693a', '#4a2710');
    for (const [x, y, r] of [[-8, -8, 3], [4, -11, 2.5], [10, -3, 2.2], [-1, -2, 2]]) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = '#fbe9d0'; c.fill(); }
  },
  // 魚類：側面的藍色魚（尾巴、魚鰭、眼睛、鰓）
  fish(c) {
    c.beginPath(); c.moveTo(11, 0); c.lineTo(20, -10); c.lineTo(20, 10); c.closePath(); fillStroke(c, '#3b78c2', '#173c66');
    c.beginPath(); c.moveTo(-4, -8); c.lineTo(4, -15); c.lineTo(7, -7); c.closePath(); fillStroke(c, '#3b78c2', '#173c66', 1.5);
    ell(c, -3, 0, 16, 10); fillStroke(c, '#4f9be6', '#173c66');
    ell(c, -3, 4, 12, 4); c.fillStyle = 'rgba(255,255,255,.35)'; c.fill();
    c.beginPath(); c.arc(-4, 0, 7, -1.1, 1.1); c.lineWidth = 1.5; c.strokeStyle = '#173c66'; c.stroke();
    c.beginPath(); c.arc(-11, -2, 3, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.beginPath(); c.arc(-11.5, -2, 1.6, 0, Math.PI * 2); c.fillStyle = '#111'; c.fill();
  },
  // 硬殼：扇貝（扇形＋放射狀紋路＋殼耳）
  shell(c) {
    rrect(c, -7, 10, 14, 7, 2); fillStroke(c, '#e2b79c', '#7a4a33', 1.5);
    c.beginPath(); c.moveTo(0, 13);
    for (let i = 0; i <= 6; i++) { const a = Math.PI * (1.08 + i * 0.14); c.lineTo(Math.cos(a) * 19, -2 + Math.sin(a) * 19); }
    c.closePath(); fillStroke(c, '#f2cdb4', '#7a4a33');
    for (let i = 1; i < 6; i++) { const a = Math.PI * (1.08 + i * 0.14); c.beginPath(); c.moveTo(0, 12); c.lineTo(Math.cos(a) * 17, -2 + Math.sin(a) * 17); c.lineWidth = 1.6; c.strokeStyle = '#c98f70'; c.stroke(); }
  },
};
function drawIngredient(c, key, x, y, s) { unit(c, x, y, s, ING_ART[key]); }

// ---------------------------------------------------------------- 半成品：砧板上切好的原料
function drawSemi(c, key, x, y, s) {
  unit(c, x, y, s, c => {
    rrect(c, -19, -13, 38, 26, 6); fillStroke(c, '#d6a868', '#6b4a22');
    c.beginPath(); c.arc(14, -7, 2.5, 0, Math.PI * 2); c.fillStyle = '#6b4a22'; c.fill();
    const ings = RECIPES[key].ings, n = ings.length;
    ings.forEach((k, i) => { const px = n === 1 ? 0 : -10 + i * (20 / (n - 1)); unit(c, px, 2, 8.5, ING_ART[k]); });
  });
}

// ---------------------------------------------------------------- 料理
function steam(c) {
  c.lineWidth = 1.8; c.strokeStyle = 'rgba(255,255,255,.75)';
  for (const x of [-6, 0, 6]) { c.beginPath(); c.moveTo(x, -16); c.bezierCurveTo(x - 4, -20, x + 4, -22, x, -27); c.stroke(); }
}
function bowl(c, broth) {
  c.beginPath(); c.arc(0, 2, 18, 0, Math.PI * 2); fillStroke(c, '#f7f3ea', '#7d6b55');
  c.beginPath(); c.arc(0, 2, 13.5, 0, Math.PI * 2); c.fillStyle = broth; c.fill();
}
const DISH_ART = {
  // 雙蔬煎盤：平底鍋裡的青菜與菇片
  vm(c) {
    rrect(c, 12, -2, 12, 5, 2); fillStroke(c, '#3a2a1c', '#111', 1.2);
    c.beginPath(); c.arc(-3, 1, 16, 0, Math.PI * 2); fillStroke(c, '#2b2d31', '#111');
    c.beginPath(); c.arc(-3, 1, 12, 0, Math.PI * 2); c.fillStyle = '#3d4046'; c.fill();
    for (const [x, y, r] of [[-9, -3, 0.6], [1, 5, -0.4], [-4, 7, 1.2]]) { ell(c, x, y, 5, 2.6, r); c.fillStyle = '#4fbf55'; c.fill(); }
    for (const [x, y] of [[2, -4], [-8, 5], [-2, -6]]) { c.beginPath(); c.arc(x, y, 3, Math.PI, 0); c.fillStyle = '#b97a45'; c.fill(); }
  },
  // 香菇魚湯：白碗、奶白湯、魚片、菇片
  fm(c) {
    bowl(c, '#efd7a6');
    ell(c, -4, 0, 6, 3.5, -0.3); c.fillStyle = '#fbe3dc'; c.fill();
    for (const [x, y] of [[5, -2], [2, 7]]) { c.beginPath(); c.arc(x, y, 3.2, Math.PI, 0); c.fillStyle = '#a86a3c'; c.fill(); }
    for (const [x, y] of [[-6, 7], [7, 4], [-1, -5]]) { c.beginPath(); c.arc(x, y, 1.3, 0, Math.PI * 2); c.fillStyle = '#3fae49'; c.fill(); }
    steam(c);
  },
  // 蒜香烤貝：盤子上兩個扇貝＋蒜末
  sv(c) {
    ell(c, 0, 3, 19, 15); fillStroke(c, '#f7f3ea', '#7d6b55');
    unit(c, -7, 2, 9, ING_ART.shell); unit(c, 7, 4, 9, ING_ART.shell);
    for (const [x, y] of [[-7, 4], [7, 6], [0, -3], [-3, 9]]) { c.beginPath(); c.arc(x, y, 1.4, 0, Math.PI * 2); c.fillStyle = '#fff3a8'; c.fill(); }
    steam(c);
  },
  // 海陸燉鍋：側面的砂鍋（兩側把手、湯裡有魚與菜）
  st(c) {
    for (const x of [-20, 20]) { ell(c, x, 2, 4, 3); fillStroke(c, '#7a3a1a', '#3d1a08', 1.2); }
    c.beginPath(); c.moveTo(-17, -2); c.lineTo(17, -2); c.quadraticCurveTo(17, 17, 0, 17); c.quadraticCurveTo(-17, 17, -17, -2); c.closePath();
    fillStroke(c, '#b5562a', '#4a1e08');
    ell(c, 0, -2, 17, 5); fillStroke(c, '#d98a3d', '#4a1e08', 1.5);
    ell(c, -5, -2, 4, 1.8); c.fillStyle = '#fbe3dc'; c.fill();
    ell(c, 5, -3, 3.5, 1.6); c.fillStyle = '#4fbf55'; c.fill();
    steam(c);
  },
  // 力量燉湯：紅色辣湯＋閃電
  soup(c) {
    bowl(c, '#d9452b');
    c.beginPath(); c.moveTo(2, -9); c.lineTo(-5, 3); c.lineTo(0, 3); c.lineTo(-2, 12); c.lineTo(6, -1); c.lineTo(1, -1); c.closePath();
    fillStroke(c, '#ffe066', '#7a4a00', 1.2);
    steam(c);
  },
  // 收納蔬餅：金黃色的煎餅＋青菜碎
  cake(c) {
    ell(c, 0, 3, 19, 15); fillStroke(c, '#f7f3ea', '#7d6b55');
    c.beginPath(); c.arc(0, 2, 12, 0, Math.PI * 2); fillStroke(c, '#e5b75a', '#9a6a1c', 1.5);
    for (const [x, y] of [[-5, -2], [4, 4], [3, -5], [-3, 6], [6, 0]]) { ell(c, x, y, 2.2, 1.2, x); c.fillStyle = '#3f9e45'; c.fill(); }
  },
};
function drawDish(c, key, x, y, s) { unit(c, x, y, s, DISH_ART[key]); }

// ---------------------------------------------------------------- 食材怪物：食材本體＋眼睛、眉毛、小腳
const MON_EYES = { veg: [[-5, -3], [5, -3]], mush: [[-6, -8], [6, -8]], fish: [[-11, -2]], shell: [[-5, -4], [5, -4]] };
function drawMonster(c, n, x, y, s) {
  unit(c, x, y, s, c => {
    for (const fx of [-7, 7]) { ell(c, fx, 19, 4.5, 2.6); c.fillStyle = '#2a2a2a'; c.fill(); }
    ING_ART[n.type](c);
    for (const [ex, ey] of MON_EYES[n.type]) {
      c.beginPath(); c.arc(ex, ey, 3.6, 0, Math.PI * 2); fillStroke(c, '#fff', '#111', 1.2);
      c.beginPath(); c.arc(ex + 0.6, ey + 0.6, 1.8, 0, Math.PI * 2); c.fillStyle = '#111'; c.fill();
      c.beginPath(); c.moveTo(ex - 4, ey - 6 + (ex < 0 ? -1.5 : 1.5)); c.lineTo(ex + 4, ey - 6 + (ex < 0 ? 1.5 : -1.5)); c.lineWidth = 1.8; c.strokeStyle = '#111'; c.stroke();
    }
  });
}

// ---------------------------------------------------------------- 設施
// 火爐：不鏽鋼爐台、爐口、旋鈕；cooking 時畫鍋子，lit 時畫火焰
function drawStoveArt(c, x, y, w, h, tc, o = {}) {
  c.save(); c.translate(x, y);
  const g = c.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, '#7b828c'); g.addColorStop(1, '#41464d');
  rrect(c, -w / 2, -h / 2, w, h, 6); c.fillStyle = g; c.fill(); c.lineWidth = 3; c.strokeStyle = tc; c.stroke();
  for (const kx of [-w / 2 + 8, w / 2 - 8]) { c.beginPath(); c.arc(kx, h / 2 - 7, 3.5, 0, Math.PI * 2); fillStroke(c, '#1e1f22', '#c9ccd1', 1.2); }
  c.beginPath(); c.arc(0, -1, 16, 0, Math.PI * 2); fillStroke(c, '#202226', '#9aa0a8', 2);
  c.lineWidth = 2; c.strokeStyle = '#555b63';
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; c.beginPath(); c.moveTo(Math.cos(a) * 5, -1 + Math.sin(a) * 5); c.lineTo(Math.cos(a) * 16, -1 + Math.sin(a) * 16); c.stroke(); }
  if (o.lit) {
    const t = performance.now() / 120;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, f = 4 + Math.sin(t + i * 1.7) * 1.5;
      c.beginPath(); c.moveTo(Math.cos(a - 0.2) * 13, -1 + Math.sin(a - 0.2) * 13); c.lineTo(Math.cos(a) * (13 + f + 3), -1 + Math.sin(a) * (13 + f + 3)); c.lineTo(Math.cos(a + 0.2) * 13, -1 + Math.sin(a + 0.2) * 13);
      c.fillStyle = i % 2 ? '#ffb02e' : '#4fa3ff'; c.fill();
    }
  }
  if (o.pot) { c.beginPath(); c.arc(0, -1, 13, 0, Math.PI * 2); fillStroke(c, '#5d6168', '#26282c', 2); for (const hx of [-15, 15]) { rrect(c, hx - 3, -3, 6, 4, 1.5); fillStroke(c, '#26282c'); } }
  c.restore();
}
// 就地鍋：小炒鍋（長柄）
function drawWokArt(c, x, y, w, h, tc) {
  c.save(); c.translate(x, y);
  rrect(c, -w / 2, -h / 2, w, h, 6); c.fillStyle = '#3c3f45'; c.fill(); c.lineWidth = 3; c.strokeStyle = tc; c.stroke();
  rrect(c, 8, -3, 20, 5, 2); fillStroke(c, '#5a3a22', '#1c120a', 1.2);
  c.beginPath(); c.arc(-4, 0, 16, 0, Math.PI * 2); fillStroke(c, '#26282c', '#0c0d0f');
  c.beginPath(); c.arc(-4, 0, 11, 0, Math.PI * 2); c.fillStyle = '#3a3d43'; c.fill();
  c.restore();
}
// 倉庫：木箱
function drawCrateArt(c, x, y, w, h, tc) {
  c.save(); c.translate(x, y);
  rrect(c, -w / 2, -h / 2, w, h, 4); fillStroke(c, '#9b6a3c', tc, 3);
  c.lineWidth = 1.5; c.strokeStyle = '#5e3d1d';
  for (let i = 1; i < 4; i++) { const yy = -h / 2 + i * h / 4; c.beginPath(); c.moveTo(-w / 2 + 3, yy); c.lineTo(w / 2 - 3, yy); c.stroke(); }
  c.lineWidth = 3; c.strokeStyle = '#6e4723';
  c.beginPath(); c.moveTo(-w / 2 + 4, -h / 2 + 4); c.lineTo(w / 2 - 4, h / 2 - 4); c.stroke();
  for (const [px, py] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { c.beginPath(); c.arc(px * (w / 2 - 5), py * (h / 2 - 5), 1.8, 0, Math.PI * 2); c.fillStyle = '#2a1a0c'; c.fill(); }
  c.restore();
}
// 備料台：砧板＋菜刀
function drawPrepArt(c, x, y, w, h, tc) {
  c.save(); c.translate(x, y);
  rrect(c, -w / 2, -h / 2, w, h, 6); fillStroke(c, '#e2b878', tc, 3);
  rrect(c, -w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 4); c.lineWidth = 1.2; c.strokeStyle = 'rgba(110,70,30,.45)'; c.stroke();
  c.save(); c.translate(w / 2 - 14, -h / 2 + 12); c.rotate(0.7);
  rrect(c, -3, -16, 12, 18, 2); fillStroke(c, '#dfe3e8', '#59606a', 1.2);
  rrect(c, -1, 2, 7, 12, 2); fillStroke(c, '#2b2b2b');
  c.restore(); c.restore();
}
// 出餐口：不鏽鋼檯面＋服務鈴＋點單
function drawPassArt(c, x, y, w, h, tc) {
  c.save(); c.translate(x, y);
  const g = c.createLinearGradient(-w / 2, 0, w / 2, 0); g.addColorStop(0, '#c9cdd3'); g.addColorStop(1, '#8e949c');
  rrect(c, -w / 2, -h / 2, w, h, 6); c.fillStyle = g; c.fill(); c.lineWidth = 3; c.strokeStyle = tc; c.stroke();
  rrect(c, -w / 2 + 6, -h / 2 + 6, 16, 20, 1); fillStroke(c, '#fffbe8', '#9a9070', 1);
  c.lineWidth = 1; c.strokeStyle = '#b0a585'; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-w / 2 + 9, -h / 2 + 11 + i * 5); c.lineTo(-w / 2 + 19, -h / 2 + 11 + i * 5); c.stroke(); }
  ell(c, 0, 18, 12, 4); fillStroke(c, '#8a6a1c', '#3d2e08', 1.2);
  c.beginPath(); c.arc(0, 16, 10, Math.PI, 0); c.closePath(); fillStroke(c, '#f2c94c', '#7a5a10', 1.5);
  c.beginPath(); c.arc(0, 5, 2.5, 0, Math.PI * 2); fillStroke(c, '#f2c94c', '#7a5a10', 1);
  c.restore();
}
// 桌子：木頭紋路
function drawDeskArt(c, d, tc) {
  rrect(c, d.x, d.y, d.w, d.h, 8); fillStroke(c, '#7a5534', tc, 4);
  c.save(); rrect(c, d.x, d.y, d.w, d.h, 8); c.clip();
  c.lineWidth = 1.5; c.strokeStyle = 'rgba(40,22,8,.35)';
  for (let x = d.x + 10; x < d.x + d.w; x += 13) { c.beginPath(); c.moveTo(x, d.y); for (let y = d.y; y <= d.y + d.h; y += 20) c.lineTo(x + Math.sin(y / 23 + x) * 2.5, y); c.stroke(); }
  c.restore();
}

// ---------------------------------------------------------------- 岩石與牆
function drawRock(c, r) {
  const k = Math.min(r.w, r.h) * 0.42;
  rrect(c, r.x + 4, r.y + 8, r.w, r.h, k); c.fillStyle = 'rgba(0,0,0,.3)'; c.fill();
  const g = c.createLinearGradient(r.x, r.y, r.x + r.w * 0.6, r.y + r.h);
  g.addColorStop(0, '#9da1a8'); g.addColorStop(1, '#5d6168');
  rrect(c, r.x, r.y, r.w, r.h, k); c.fillStyle = g; c.fill(); c.lineWidth = 3; c.strokeStyle = '#33363b'; c.stroke();
  ell(c, r.x + r.w * 0.32, r.y + r.h * 0.28, r.w * 0.16, r.h * 0.1, -0.4); c.fillStyle = 'rgba(255,255,255,.18)'; c.fill();
  c.lineWidth = 2; c.strokeStyle = 'rgba(30,32,36,.55)';
  c.beginPath(); c.moveTo(r.x + r.w * 0.55, r.y + r.h * 0.2); c.lineTo(r.x + r.w * 0.48, r.y + r.h * 0.45); c.lineTo(r.x + r.w * 0.62, r.y + r.h * 0.62); c.stroke();
  c.beginPath(); c.moveTo(r.x + r.w * 0.2, r.y + r.h * 0.7); c.lineTo(r.x + r.w * 0.33, r.y + r.h * 0.78); c.stroke();
}
function drawBrickWall(c, r) {
  c.fillStyle = '#8d5a44'; c.fillRect(r.x, r.y, r.w, r.h);
  c.save(); c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
  c.lineWidth = 1.5; c.strokeStyle = 'rgba(40,20,10,.55)';
  const bh = 12;
  for (let y = r.y, row = 0; y < r.y + r.h; y += bh, row++) {
    c.beginPath(); c.moveTo(r.x, y); c.lineTo(r.x + r.w, y); c.stroke();
    const off = row % 2 ? r.w / 2 : 0;
    c.beginPath(); c.moveTo(r.x + off, y); c.lineTo(r.x + off, y + bh); c.stroke();
  }
  c.restore();
  c.lineWidth = 2; c.strokeStyle = '#3a2418'; c.strokeRect(r.x, r.y, r.w, r.h);
}
