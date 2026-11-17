'use strict';
// 地圖、路徑搜尋與視線幾何。

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------------------------------------------------------------- 遊戲狀態
const G = {
  walls: [], waters: [], solids: [], stations: [], nodes: [], items: [], chars: [], teams: [],
  orders: [], nextOrders: null, round: 0, orderSeq: 0, itemSeq: 0,
  time: 0, rush: false, logs: [], fx: [], pings: [], toasts: [],
  state: 'title', paused: false, speed: 1, spectate: false, reveal: false, measure: {},
};

const rect = (x, y, w, h) => ({ x, y, w, h });
const mirrorRect = r => ({ x: W - r.x - r.w, y: r.y, w: r.w, h: r.h });
const P = (t, x, y) => (t === 0 ? { x, y } : { x: W - x, y });

// 地圖依使用者草圖【使用者指定】：跑道形場地，左右兩端是雙方廚房，中間是隨機種子產生的野區。
// 場地：上下直線邊界，左右兩端半圓（圓心 ARENA.cx / W-ARENA.cx，半徑 ARENA.r）
const ARENA = { top: 60, bot: H - 60, cx: 600, r: (H - 120) / 2 };
const WALL_X = 648;                       // 廚房牆（藍隊；紅隊左右對稱）
const DOORS = [[120, 220], [980, 1080]];   // 牆上兩扇門（y 範圍），只有自己隊伍能出入
const STOVE_Y = [480, 720];               // 兩口火爐嵌在牆上
const WILD = rect(800, 120, W - 1600, H - 240);   // 野區範圍（虛線框）

function stadiumPath(c, inset = 0) {
  const r = ARENA.r - inset, cy = (ARENA.top + ARENA.bot) / 2;
  c.beginPath();
  c.arc(ARENA.cx, cy, r, Math.PI / 2, Math.PI * 1.5);
  c.arc(W - ARENA.cx, cy, r, -Math.PI / 2, Math.PI / 2);
  c.closePath();
}

// 可重現的亂數：同一個種子產生同一張野區
function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function pickSeed() {
  const q = new URLSearchParams(location.search).get('seed');
  return q && /^\d+$/.test(q) ? +q : 1 + Math.floor(Math.random() * 99999);
}

function buildMap(seed) {
  G.seed = seed === undefined ? pickSeed() : seed;
  const rng = mulberry32(G.seed);
  for (let attempt = 0; attempt < 30; attempt++) if (tryBuild(rng)) return;
  tryBuild(mulberry32(1));
}

function tryBuild(rng) {
  G.walls = []; G.stations = []; G.nodes = []; G.items = []; G.teams = []; G.waters = [];
  // 場地邊界：上下兩條、兩端半圓用細條近似（只擋移動，不畫、不擋視線）
  const cy = (ARENA.top + ARENA.bot) / 2;
  G.bounds = [rect(0, 0, W, ARENA.top), rect(0, ARENA.bot, W, H - ARENA.bot)];
  for (let y = ARENA.top; y < ARENA.bot; y += 20) {
    const m = Math.max(Math.abs(y - cy), Math.abs(y + 20 - cy)) - (y < cy && y + 20 > cy ? 99999 : 0);
    const mm = Math.max(0, m), e = ARENA.cx - Math.sqrt(Math.max(0, ARENA.r * ARENA.r - mm * mm));
    if (e > 0) { const r = rect(0, y, e, 20); G.bounds.push(r, mirrorRect(r)); }
  }
  // 廚房牆：從上邊界到下邊界，留兩扇門
  let y0 = ARENA.top;
  const wallParts = [];
  for (const [a, b] of DOORS) { wallParts.push(rect(WALL_X, y0, 24, a - y0)); y0 = b; }
  wallParts.push(rect(WALL_X, y0, 24, ARENA.bot - y0));
  for (const r of wallParts) G.walls.push(r, mirrorRect(r));

  // 野區：隨機岩石＋食材怪物，左右對稱（公平），中線上放硬殼怪
  const half = rect(WILD.x + 20, WILD.y, W / 2 - WILD.x - 80, WILD.h);
  const rocks = [], spots = [];
  const R = (a, b) => a + rng() * (b - a);
  const overlap = (r, x, y, m) => x > r.x - m && x < r.x + r.w + m && y > r.y - m && y < r.y + r.h + m;
  for (let k = 0, tries = 0; k < 5 && tries < 200; tries++) {
    const w = R(80, 220), h = R(60, 200), r = rect(R(half.x + 60, half.x + half.w - w), R(half.y, half.y + half.h - h), w, h);
    if (rocks.some(o => r.x < o.x + o.w + 90 && r.x + r.w + 90 > o.x && r.y < o.y + o.h + 90 && r.y + r.h + 90 > o.y)) continue;
    rocks.push(r); k++;
  }
  const freeSpot = (x0, x1, minGap) => {
    for (let tries = 0; tries < 300; tries++) {
      const x = R(x0, x1), y = R(half.y + 40, half.y + half.h - 40);
      if (rocks.some(r => overlap(r, x, y, 60))) continue;
      if (spots.some(s => Math.hypot(s.x - x, s.y - y) < minGap)) continue;
      return { x, y };
    }
    return null;
  };
  const left = [];
  for (const [type, home] of [['veg', true], ['veg'], ['mush'], ['mush'], ['fish'], ['fish']]) {
    const s = home ? freeSpot(half.x, half.x + 160, 150) : freeSpot(half.x + 120, half.x + half.w, 170);
    if (!s) return false;
    spots.push(s); left.push({ type, home, ...s });
  }
  const shells = [];
  for (let k = 0; k < 3; k++) {
    let s = null;
    for (let tries = 0; tries < 200 && !s; tries++) {
      const y = R(WILD.y + 60, WILD.y + WILD.h - 60);
      if (!shells.some(o => Math.abs(o.y - y) < 160)) s = { x: W / 2, y };
    }
    if (!s) return false;
    shells.push(s);
  }
  for (const r of rocks) G.walls.push(r, mirrorRect(r));
  if (rng() < 0.6) {   // 中線偶爾有一塊大石頭
    const h = R(80, 160), y = R(WILD.y + 40, WILD.y + WILD.h - 40 - h);
    if (!shells.some(s => s.y > y - 70 && s.y < y + h + 70)) G.walls.push(rect(W / 2 - 50, y, 100, h));
  }
  G.solids = G.walls.concat(G.bounds);

  const cookState = () => ({ cooking: null, progress: 0, done: false, doneAt: 0, flipped: false, flippedOnce: false, beingFlipped: null });
  for (let t = 0; t < 2; t++) {
    const st = (type, x, y, extra = {}) => {
      const p = P(t, x, y);
      const s = { id: G.stations.length, team: t, type, x: p.x, y: p.y, res: null, ...extra };
      G.stations.push(s); return s;
    };
    const tm = { id: t, ...TEAM_CFG[t], score: 0, lastScoreAt: Infinity, nextFlipCheck: 20, travel: {} };
    // 兩口火爐嵌在廚房牆上（使用者指定）：己方從廚房內使用，敵方只能在牆外關火。out＝朝廚房外的方向
    const out = t === 0 ? 1 : -1;
    tm.stoves = STOVE_Y.map(y => st('stove', WALL_X + 12, y, { ...cookState(), wall: true, out }));
    // 就地鍋只做收納蔬餅，放在廚房內，敵人碰不到【自行修改】
    tm.quick = st('stove', 440, 880, { ...cookState(), quick: true, raw: false, prepP: 0 });
    // 桌子：中間是倉庫，上下是備料台
    tm.desk = t === 0 ? rect(255, 430, 90, 340) : mirrorRect(rect(255, 430, 90, 340));
    tm.preps = [st('prep', 300, 480, { recipe: null, progress: 0, done: false }), st('prep', 300, 720, { recipe: null, progress: 0, done: false })];
    tm.storage = st('storage', 300, 600, { items: [] });
    tm.pass = st('pass', 110, 600);
    tm.gloveRack = st('glove', 440, 320);
    tm.spawn = [P(t, 480, 560), P(t, 480, 640)];
    tm.floor = t === 0 ? rect(0, ARENA.top, WALL_X, ARENA.bot - ARENA.top) : mirrorRect(rect(0, ARENA.top, WALL_X, ARENA.bot - ARENA.top));
    // 敵方不可進入的範圍：整個廚房（含牆與門）
    tm.zone = t === 0 ? rect(0, 0, WALL_X + 24, H) : mirrorRect(rect(0, 0, WALL_X + 24, H));
    tm.doors = DOORS.map(([a, b]) => ({ ...P(t, WALL_X + 12, (a + b) / 2), h: b - a }));
    G.teams.push(tm);
    for (const n of left) {
      const p = P(t, n.x, n.y);
      G.nodes.push({ id: G.nodes.length, type: n.type, x: p.x, y: p.y, hp: CFG.MONSTER_HP, respawn: 0, res: null, side: t, lastHit: -1, home: !!n.home });
    }
  }
  for (const s of shells) G.nodes.push({ id: G.nodes.length, type: 'shell', x: s.x, y: s.y, hp: CFG.MONSTER_HP, respawn: 0, res: null, side: -1, lastHit: -1 });
  buildGrid();
  // 確認雙方都走得到每一隻怪物
  for (const tm of G.teams) {
    const [ax, ay] = cellOf(tm.spawn[0].x, tm.spawn[0].y);
    for (const n of G.nodes) {
      const [bx, by] = freeCellNear(...cellOf(n.x, n.y), teamGrids[tm.id]);
      if (!astar(ax, ay, bx, by, teamGrids[tm.id])) return false;
    }
  }
  buildSegs();
  return true;
}

// ---------------------------------------------------------------- 路徑格
const CELL = 20, GW = Math.ceil(W / CELL), GH = Math.ceil(H / CELL);
let grid = new Uint8Array(GW * GH);          // 共用：只有牆與水
let teamGrids = [grid, grid];                // 每隊：再加上對方的廚房（不能進入）

function makeGrid(extra) {
  const g = new Uint8Array(GW * GH);
  const pad = CFG.R + 3;
  const rects = G.solids.concat(extra);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const x = gx * CELL + CELL / 2, y = gy * CELL + CELL / 2;
    let b = x < pad || y < pad || x > W - pad || y > H - pad;
    if (!b) for (const r of rects) {
      if (x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad) { b = true; break; }
    }
    g[gy * GW + gx] = b ? 1 : 0;
  }
  return g;
}
function buildGrid() {
  grid = makeGrid([]);
  teamGrids = [makeGrid([G.teams[1].zone]), makeGrid([G.teams[0].zone])];
}

const cellOf = (x, y) => [clamp(Math.floor(x / CELL), 0, GW - 1), clamp(Math.floor(y / CELL), 0, GH - 1)];
const blockedAt = (x, y, g = grid) => { const [cx, cy] = cellOf(x, y); return g[cy * GW + cx] === 1; };

function freeCellNear(cx, cy, grid) {
  if (!grid[cy * GW + cx]) return [cx, cy];
  for (let r = 1; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = cx + dx, y = cy + dy;
    if (x >= 0 && y >= 0 && x < GW && y < GH && !grid[y * GW + x]) return [x, y];
  }
  return [cx, cy];
}

function astar(ax, ay, bx, by, grid) {
  const N = GW * GH, start = ay * GW + ax, goal = by * GW + bx;
  const g = new Float32Array(N).fill(1e9), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const hI = [], hF = [];
  const h = i => { const x = i % GW, y = (i / GW) | 0, dx = Math.abs(x - bx), dy = Math.abs(y - by); return dx + dy - 0.5858 * Math.min(dx, dy); };
  const swap = (a, b) => { [hI[a], hI[b]] = [hI[b], hI[a]]; [hF[a], hF[b]] = [hF[b], hF[a]]; };
  const push = (i, f) => { hI.push(i); hF.push(f); let k = hI.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (hF[p] <= hF[k]) break; swap(p, k); k = p; } };
  const pop = () => {
    const top = hI[0], li = hI.pop(), lf = hF.pop();
    if (hI.length) {
      hI[0] = li; hF[0] = lf; let k = 0;
      for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < hI.length && hF[l] < hF[m]) m = l; if (r < hI.length && hF[r] < hF[m]) m = r; if (m === k) break; swap(m, k); k = m; }
    }
    return top;
  };
  const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
  g[start] = 0; push(start, h(start));
  while (hI.length) {
    const cur = pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % GW, cy = (cur / GW) | 0;
    for (const [dx, dy, cost] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const ni = ny * GW + nx;
      if (grid[ni] || closed[ni]) continue;
      if (dx && dy && (grid[cy * GW + nx] || grid[ny * GW + cx])) continue;
      const ng = g[cur] + cost;
      if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; push(ni, ng + h(ni)); }
    }
  }
  if (goal !== start && came[goal] < 0) return null;
  const cells = [];
  for (let i = goal; i !== -1; i = came[i]) { cells.push(i); if (i === start) break; }
  return cells.reverse();
}

function lineWalkable(a, b, g = grid) {
  const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(d / 8);
  for (let i = 1; i <= n; i++) {
    const t = i / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
    if (Math.hypot(x - a.x, y - a.y) < 16) continue;
    if (blockedAt(x, y, g)) return false;
  }
  return true;
}

// team：用該隊的路徑格（不會規劃穿過對方廚房）
function findPath(sx, sy, tx, ty, team) {
  const g = team === undefined ? grid : teamGrids[team];
  const [ax, ay] = freeCellNear(...cellOf(sx, sy), g);
  const [bx, by] = freeCellNear(...cellOf(tx, ty), g);
  const cells = astar(ax, ay, bx, by, g);
  if (!cells) return null;
  const pts = [{ x: sx, y: sy }];
  for (const i of cells) pts.push({ x: (i % GW) * CELL + CELL / 2, y: ((i / GW) | 0) * CELL + CELL / 2 });
  if (!blockedAt(tx, ty, g)) pts.push({ x: tx, y: ty });
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !lineWalkable(pts[i], pts[j], g)) j--;
    out.push(pts[j]); i = j;
  }
  return out;
}

const pathLength = p => { let s = 0; for (let i = 1; i < p.length; i++) s += dist(p[i - 1], p[i]); return s; };

function moveChar(c, dx, dy) {
  c.x += dx; c.y += dy;
  const blocks = c.team === undefined ? G.solids : G.solids.concat([G.teams[1 - c.team].zone]);   // 不能進入對方廚房
  for (let k = 0; k < 2; k++) for (const r of blocks) {
    const nx = clamp(c.x, r.x, r.x + r.w), ny = clamp(c.y, r.y, r.y + r.h);
    const ddx = c.x - nx, ddy = c.y - ny, d2 = ddx * ddx + ddy * ddy;
    if (d2 >= CFG.R * CFG.R) continue;
    if (d2 > 1e-6) { const d = Math.sqrt(d2); c.x = nx + ddx / d * CFG.R; c.y = ny + ddy / d * CFG.R; }
    else {
      const l = c.x - r.x, rr = r.x + r.w - c.x, t = c.y - r.y, b = r.y + r.h - c.y, m = Math.min(l, rr, t, b);
      if (m === l) c.x = r.x - CFG.R; else if (m === rr) c.x = r.x + r.w + CFG.R; else if (m === t) c.y = r.y - CFG.R; else c.y = r.y + r.h + CFG.R;
    }
  }
  c.x = clamp(c.x, CFG.R, W - CFG.R); c.y = clamp(c.y, CFG.R, H - CFG.R);
}

// ---------------------------------------------------------------- 視線（只有建築會擋視線，水面不擋）
let wallSegs = [];
function buildSegs() {
  wallSegs = [];
  for (const r of G.walls) {
    const a = [r.x, r.y], b = [r.x + r.w, r.y], c = [r.x + r.w, r.y + r.h], d = [r.x, r.y + r.h];
    wallSegs.push([a, b], [b, c], [c, d], [d, a]);
  }
}

function rayCast(ox, oy, ang, maxd) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  let best = maxd;
  for (const [p, q] of wallSegs) {
    const sx = q[0] - p[0], sy = q[1] - p[1], den = dx * sy - dy * sx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((p[0] - ox) * sy - (p[1] - oy) * sx) / den;
    const u = ((p[0] - ox) * dy - (p[1] - oy) * dx) / den;
    if (t > 0 && t < best && u >= 0 && u <= 1) best = t;
  }
  return best;
}

function visPoly(ox, oy, rad) {
  const angs = [];
  for (let i = 0; i < 120; i++) angs.push(i / 120 * Math.PI * 2);
  for (const [p] of wallSegs) {
    if (Math.hypot(p[0] - ox, p[1] - oy) > rad * 1.3) continue;
    const a = Math.atan2(p[1] - oy, p[0] - ox);
    angs.push(a - 0.0008, a, a + 0.0008);
  }
  angs.sort((a, b) => a - b);
  return angs.map(a => { const d = rayCast(ox, oy, a, rad); return { x: ox + Math.cos(a) * d, y: oy + Math.sin(a) * d }; });
}

function segHitsRect(x1, y1, x2, y2, r) {
  // Liang-Barsky 線段裁切
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy], q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 <= t1;
}

function lineOfSight(a, b) {
  for (const r of G.walls) if (segHitsRect(a.x, a.y, b.x, b.y, r)) return false;
  return true;
}

function canSee(team, p) {
  for (const c of G.chars) if (c.team === team && dist(c, p) < CFG.VISION && lineOfSight(c, p)) return true;
  return false;
}
