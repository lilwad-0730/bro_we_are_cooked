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

function buildMap() {
  G.walls = []; G.stations = []; G.nodes = []; G.items = []; G.teams = [];
  G.waters = [rect(0, 0, W, 60), rect(0, H - 60, W, 60)];
  const sideWalls = [
    rect(40, 400, 540, 24), rect(40, 1076, 540, 24), rect(40, 400, 24, 700),       // 廚房上、下、左牆（上牆有外壁鍋）
    rect(556, 400, 24, 60), rect(556, 700, 24, 100), rect(556, 1040, 24, 60),       // 右側半開放：只有幾段短牆
    rect(820, 250, 240, 170), rect(820, 1080, 240, 170),                            // 岩石
    rect(480, 140, 860, 26), rect(480, H - 166, 860, 26),                           // 水邊懸崖：魚類點只能從西側窄道進入
  ];
  for (const r of sideWalls) { G.walls.push(r); G.walls.push(mirrorRect(r)); }
  G.walls.push(rect(1230, 330, 240, 90), rect(1230, 1080, 240, 90));                // 中央石柱
  G.solids = G.walls.concat(G.waters);

  const cookState = () => ({ cooking: null, progress: 0, done: false, doneAt: 0, flipped: false, flippedOnce: false, beingFlipped: null });
  for (let t = 0; t < 2; t++) {
    const st = (type, x, y, extra = {}) => {
      const p = P(t, x, y);
      const s = { id: G.stations.length, team: t, type, x: p.x, y: p.y, res: null, ...extra };
      G.stations.push(s); return s;
    };
    const tm = { id: t, ...TEAM_CFG[t], score: 0, lastScoreAt: Infinity, nextFlipCheck: 20, travel: {} };
    // 廚房只有兩口外壁鍋（使用者指定）：都在上牆，從廚房內使用，也會被廚房外的敵人關火，沒有安全的內爐。
    // 動線依鍋子位置排列：右側開口進來先到倉庫，旁邊是備料台，上牆是鍋子，出餐口與手套架都靠近鍋子。
    tm.stoves = [st('stove', 300, 412, { ...cookState(), wall: true }), st('stove', 430, 412, { ...cookState(), wall: true })];
    tm.quick = st('stove', 170, 412, { ...cookState(), quick: true, wall: true, raw: false, prepP: 0 });
    tm.storage = st('storage', 470, 640, { items: [] });
    tm.preps = [st('prep', 300, 560, { recipe: null, progress: 0, done: false }), st('prep', 300, 680, { recipe: null, progress: 0, done: false })];
    tm.pass = st('pass', 510, 520);
    tm.gloveRack = st('glove', 130, 560);
    tm.guard = P(t, 365, 465);   // 守家：站在兩口外壁鍋中間，離鍋 70 像素內可打斷關火
    tm.spawn = [P(t, 180, 640), P(t, 180, 740)];
    tm.floor = t === 0 ? rect(64, 424, 492, 652) : mirrorRect(rect(64, 424, 492, 652));
    // 敵方不可進入的範圍：整個廚房（含牆與右側開口）
    tm.zone = t === 0 ? rect(40, 400, 544, 700) : mirrorRect(rect(40, 400, 544, 700));
    G.teams.push(tm);

    // 食材怪物：雙方共用，不分哪一邊；位置左右對稱只是為了公平
    const node = (type, x, y, extra = {}) => {
      const p = P(t, x, y);
      G.nodes.push({ id: G.nodes.length, type, x: p.x, y: p.y, hp: CFG.MONSTER_HP, respawn: 0, res: null, side: t, lastHit: -1, ...extra });
    };
    node('veg', 740, 460, { home: true }); node('veg', 760, 1130);
    node('mush', 1220, 470); node('mush', 1220, 1030);
    node('fish', 1300, 100); node('fish', 1300, 1400);
  }
  for (const y of [640, 750, 860]) G.nodes.push({ id: G.nodes.length, type: 'shell', x: 1350, y, hp: CFG.MONSTER_HP, respawn: 0, res: null, side: -1, lastHit: -1 });
  buildGrid();
  buildSegs();
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
