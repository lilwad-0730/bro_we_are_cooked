'use strict';
// 所有可調數值。數值出處見 ../DEMO_修改紀錄.md：
// 「文件」= 依《遊戲設計文件 v0.6》；「自行修改」= DEMO 製作時新增或調整。
const CFG = {
  MATCH: 360,            // 文件：對局六分鐘
  SPEED: 170,            // 自行修改：像素/秒，用來把地圖距離換算成文件的秒數
  BAG_SLOW: 0.75,        // 文件：滿包速度 75%（兩格都滿才減速）
  BAG_SLOTS: 2,          // 使用者指定：背包改成兩格（文件 v0.6 為一格）
  HAND_SPEED: 1.0,       // 文件：手搬速度待測，先不減速
  R: 14,                 // 角色半徑（像素）

  MONSTER_HP: 4,         // 食材怪物血量（使用者指定有血條；數值自行修改）
  DMG: 1,                // 雙方攻擊力相同（使用者指定），每一擊扣 1
  GATHER_INT: 0.8, NODE_RESPAWN: 12, // 文件：攻擊間隔、怪物重生
  PICK: 0.5,             // 文件 v0.6 試算：用手拾取
  DEPOSIT: 1,            // 文件：原料入庫
  BAG_PREP: 1,           // 文件：收納前搖
  PREP_PER_ING: 2,       // 文件：每份原料備料兩秒
  TAKE: 1, PLACE: 1, SUBMIT: 1, EAT: 1, // 文件
  TOOL: 1,               // 文件 v0.6：換工具一秒（已移除手套【使用者指定】）
  STORAGE_CAP: 3,        // 文件：廚房三份原料
  GROUND_LIFE: 20,       // 文件：地面物品二十秒

  STUN_WINDUP: 0.8, STUN_CD: 12, STUN_DOWN: 3, STUN_IMMUNE: 2, CHARGES: 3, // 文件
  STUN_RANGE: 110,       // 自行修改：文件未定範圍；85 實測命中率 21–36%，調到 110 約 43%
  STUN_ARC: Math.PI * 2 / 3, // 自行修改：扇形 120 度
  FLIP_CHANNEL: 1.5, FLIP_SETBACK: 0, FLIP_CD: 4, FIX: 1, // 關火：按住 1.5 秒；只停火、不倒退進度（自行修改），己方開火 1 秒
  GUARD_RANGE: 70,       // 自行修改：守方在鍋旁多近可打斷翻鍋

  RUSH: 60, RUSH_MULT: 1.5, // 文件 v0.6：尖峰時段
  VISION: 430,           // 自行修改：受限視野半徑
  INTERACT: 56,          // 自行修改：互動距離
  STUCK_DISH: 25,        // 自行修改：AI 清掉卡住爐台的未接單成品
  BAG_PAIR_DIST: 0,      // 自行修改：NPC 不用背包一趟多拿（實測任何一趟多拿都讓菜晚完成）；背包只用來在倉庫滿時暫存、直接備料
  AI_QUEUE: 2,           // 自行修改：NPC 可在手上／背包先拿著幾份原料等倉庫空位
};

const ING = {
  veg:   { name: '蔬菜', ch: '菜', color: '#5cb85c', tool: 'knife' },
  mush:  { name: '菇類', ch: '菇', color: '#c08a5a', tool: 'knife' },
  fish:  { name: '魚類', ch: '魚', color: '#4a90d9', tool: 'fork' },
  shell: { name: '硬殼', ch: '殼', color: '#a7b0ba', tool: 'mallet' },
};
const TOOLS = { knife: '菜刀', fork: '長叉', mallet: '木槌' };
const TOOL_KEYS = ['knife', 'fork', 'mallet'];

// 卡分採 v0.6 依耗時重訂的數字。
const RECIPES = {
  vm:   { name: '雙蔬煎盤', short: '煎', ings: ['veg', 'mush'], cook: 8,  score: 110 },
  fm:   { name: '香菇魚湯', short: '湯', ings: ['fish', 'mush'], cook: 10, score: 150 },
  sv:   { name: '蒜香烤貝', short: '貝', ings: ['shell', 'veg'], cook: 12, score: 120 },
  st:   { name: '海陸燉鍋', short: '燉', ings: ['veg', 'fish', 'shell'], cook: 14, score: 200 },
  soup: { name: '力量燉湯', short: '力', ings: ['shell'], cook: 10, ability: true },
  cake: { name: '收納蔬餅', short: '餅', ings: ['veg'], cook: 6, ability: true, quick: true },
};
const ORDER_KEYS = ['vm', 'fm', 'sv', 'st'];
const PREP_MENU = ['vm', 'fm', 'sv', 'st', 'soup'];

const TEAM_CFG = [
  // 自行修改：雙方 NPC 用同一套開局：1 號在隊伍交出第一單後吃收納蔬餅（實測最划算，見修改紀錄 v0.4），2 號負責吃力量燉湯並打暈
  { name: '我方', color: '#4c9bff', dark: '#1d4f8f', wantBag: [true, false], aggr: 0.5, fighter: 1 },
  { name: '敵方', color: '#ff5d5d', dark: '#8f2626', wantBag: [true, false], aggr: 0.5, fighter: 1 },
];

const W = 3000, H = 1200;
// 英文與數字用 Fredoka（圓潤），中文用粉圓 Huninn；字型還沒載入或離線時退回系統字型
const FONT = '"Fredoka","Huninn","Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif';
