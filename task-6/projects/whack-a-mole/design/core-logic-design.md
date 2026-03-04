# 打地鼠游戏 - 核心逻辑设计文档

## 项目信息
- **项目**: 打地鼠小游戏 (Issue #6)
- **阶段**: design
- **负责项**: 第2项 - 游戏核心逻辑
- **日期**: 2026-03-04

---

## 一、需求分析

### 1.1 功能需求
1. **地鼠随机出现/消失** - 控制地鼠在9个洞中随机生成和隐藏
2. **点击判定** - 检测玩家点击是否命中地鼠
3. **命中反馈** - 提供视觉/状态反馈确认击中

### 1.2 技术约束
- 纯前端实现（HTML/CSS/JavaScript）
- 响应式设计，支持移动端触摸
- 代码整洁，有适当注释

---

## 二、数据模型设计

### 2.1 核心数据结构

```typescript
// 地鼠洞状态枚举
enum HoleState {
  EMPTY = 'empty',      // 空洞
  MOLE_UP = 'up',       // 地鼠冒出
  MOLE_HIT = 'hit',     // 被击中
  MOLE_DOWN = 'down'    // 地鼠缩回动画中
}

// 单个地鼠洞的数据模型
interface Hole {
  id: number;              // 洞的唯一标识 (0-8)
  state: HoleState;        // 当前状态
  moleType: MoleType;      // 地鼠类型（为后续扩展预留）
  appearTime: number;      // 地鼠出现的时间戳
  disappearTimer: number | null;  // 自动消失的定时器ID
}

// 地鼠类型（基础版只有一种，预留扩展）
enum MoleType {
  NORMAL = 'normal',      // 普通地鼠
  GOLDEN = 'golden',      // 金色地鼠（高分）- 预留
  BOMB = 'bomb'           // 炸弹（扣分）- 预留
}

// 游戏配置常量
interface GameConfig {
  HOLE_COUNT: number;           // 地鼠洞数量：9
  MIN_APPEAR_TIME: number;      // 最短出现时间：600ms
  MAX_APPEAR_TIME: number;      // 最长出现时间：1200ms
  SPAWN_INTERVAL_MIN: number;   // 最小生成间隔：400ms
  SPAWN_INTERVAL_MAX: number;   // 最大生成间隔：1000ms
  MAX_ACTIVE_MOLES: number;     // 同时活跃地鼠上限：3
}

// 游戏状态管理
interface GameState {
  isPlaying: boolean;           // 游戏是否进行中
  holes: Hole[];                // 9个洞的状态数组
  activeMoleCount: number;      // 当前活跃地鼠数量
  lastSpawnTime: number;        // 上次生成时间
  spawnTimer: number | null;    // 生成定时器ID
}

// 命中结果
interface HitResult {
  success: boolean;             // 是否命中
  holeId: number;               // 命中的洞ID
  moleType: MoleType;           // 地鼠类型
  reactionTime: number;         // 反应时间（出现到击中的毫秒数）
}
```

### 2.2 状态流转图

```
┌─────────┐    spawnMole()     ┌─────────┐
│  EMPTY  │ ─────────────────> │  UP     │
└─────────┘                    └────┬────┘
     ▲                              │
     │ timeout / auto hide          │ click()
     │                              ▼
     │                         ┌─────────┐    hide()    ┌─────────┐
     └──────────────────────── │  HIT    │ ───────────> │  DOWN   │
                               └─────────┘              └────┬────┘
                                                             │
                                                             │ animation end
                                                             ▼
                                                        ┌─────────┐
                                                        │  EMPTY  │
                                                        └─────────┘
```

---

## 三、API 接口设计

### 3.1 核心类/模块结构

```javascript
/**
 * 游戏核心逻辑控制器
 * 职责：管理地鼠生成、消失、点击判定
 */
class WhackAMoleCore {
  // ========== 构造函数 ==========
  constructor(config = {});
  
  // ========== 游戏生命周期 ==========
  
  /**
   * 初始化游戏
   * @returns {void}
   */
  init();
  
  /**
   * 开始游戏
   * @returns {void}
   */
  start();
  
  /**
   * 暂停游戏
   * @returns {void}
   */
  pause();
  
  /**
   * 恢复游戏
   * @returns {void}
   */
  resume();
  
  /**
   * 结束游戏
   * @returns {void}
   */
  stop();
  
  /**
   * 重置游戏状态
   * @returns {void}
   */
  reset();
  
  // ========== 地鼠控制 ==========
  
  /**
   * 生成一只地鼠
   * @private
   * @returns {boolean} 是否成功生成
   */
  _spawnMole();
  
  /**
   * 让指定洞的地鼠消失
   * @param {number} holeId - 洞的ID
   * @private
   * @returns {void}
   */
  _hideMole(holeId);
  
  /**
   * 获取可用的空洞列表
   * @private
   * @returns {number[]} 可用洞的ID数组
   */
  _getAvailableHoles();
  
  /**
   * 计算下次生成间隔（随机）
   * @private
   * @returns {number} 毫秒数
   */
  _calculateSpawnDelay();
  
  /**
   * 计算地鼠显示时长（随机）
   * @private
   * @returns {number} 毫秒数
   */
  _calculateDisplayDuration();
  
  // ========== 交互处理 ==========
  
  /**
   * 处理点击/触摸事件
   * @param {number} holeId - 被点击的洞ID
   * @param {Event} event - 原始事件对象
   * @returns {HitResult|null} 命中结果，未命中返回null
   */
  handleClick(holeId, event);
  
  /**
   * 检查点击坐标是否在有效区域内（用于精确判定）
   * @param {number} holeId - 洞ID
   * @param {number} x - 点击X坐标
   * @param {number} y - 点击Y坐标
   * @private
   * @returns {boolean}
   */
  _isValidHit(holeId, x, y);
  
  // ========== 事件系统 ==========
  
  /**
   * 注册事件监听器
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   * @returns {void}
   */
  on(event, callback);
  
  /**
   * 移除事件监听器
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   * @returns {void}
   */
  off(event, callback);
  
  /**
   * 触发事件
   * @param {string} event - 事件名称
   * @param {*} data - 事件数据
   * @private
   * @returns {void}
   */
  _emit(event, data);
  
  // ========== 状态查询 ==========
  
  /**
   * 获取当前游戏状态
   * @returns {GameState}
   */
  getState();
  
  /**
   * 获取指定洞的状态
   * @param {number} holeId - 洞ID
   * @returns {Hole}
   */
  getHoleState(holeId);
  
  /**
   * 获取当前活跃地鼠数量
   * @returns {number}
   */
  getActiveMoleCount();
}
```

### 3.2 事件定义

```javascript
// 游戏核心事件
const CORE_EVENTS = {
  // 游戏生命周期
  GAME_INIT: 'game:init',           // 游戏初始化完成
  GAME_START: 'game:start',         // 游戏开始
  GAME_PAUSE: 'game:pause',         // 游戏暂停
  GAME_RESUME: 'game:resume',       // 游戏恢复
  GAME_STOP: 'game:stop',           // 游戏结束
  
  // 地鼠相关
  MOLE_SPAWN: 'mole:spawn',         // 地鼠生成 { holeId, moleType }
  MOLE_HIDE: 'mole:hide',           // 地鼠消失 { holeId, reason: 'timeout'|'hit' }
  MOLE_MISS: 'mole:miss',           // 地鼠自然消失未被击中 { holeId }
  
  // 交互相关
  MOLE_HIT: 'mole:hit',             // 成功击中 { holeId, moleType, reactionTime }
  CLICK_MISS: 'click:miss',         // 点击未命中 { holeId, x, y }
};
```

---

## 四、技术方案

### 4.1 架构说明

```
┌─────────────────────────────────────────────────────────────┐
│                      UI Layer (View)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  渲染层   │  │ 动画控制  │  │ 输入处理  │  │ 音效触发  │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │             │             │             │          │
│       └─────────────┴──────┬──────┴─────────────┘          │
│                            │                                │
│                     Event Interface                         │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                   Core Logic (Controller)                   │
│                  ┌─────────────────┐                       │
│                  │  WhackAMoleCore │                       │
│                  │  - 状态管理      │                       │
│                  │  - 生成算法      │                       │
│                  │  - 碰撞检测      │                       │
│                  │  - 事件分发      │                       │
│                  └─────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 关键算法

#### 4.2.1 地鼠生成算法

```javascript
/**
 * 智能生成算法
 * 原则：
 * 1. 只在空洞中生成
 * 2. 控制同时出现的地鼠数量
 * 3. 随机间隔增加不可预测性
 * 4. 避免连续在同一位置生成
 */
_spawnMole() {
  // 1. 检查是否达到上限
  if (this.activeMoleCount >= this.config.MAX_ACTIVE_MOLES) {
    return false;
  }
  
  // 2. 获取可用空洞
  const available = this._getAvailableHoles();
  if (available.length === 0) {
    return false;
  }
  
  // 3. 随机选择洞（可加入权重避免重复）
  const holeId = this._selectWeightedRandom(available);
  
  // 4. 设置地鼠状态
  const duration = this._calculateDisplayDuration();
  this.holes[holeId] = {
    state: HoleState.MOLE_UP,
    moleType: MoleType.NORMAL,
    appearTime: Date.now(),
    disappearTimer: setTimeout(() => {
      this._handleMoleTimeout(holeId);
    }, duration)
  };
  
  this.activeMoleCount++;
  this._emit(CORE_EVENTS.MOLE_SPAWN, { holeId, moleType: MoleType.NORMAL });
  
  // 5. 安排下一次生成
  this._scheduleNextSpawn();
  
  return true;
}
```

#### 4.2.2 点击判定算法

```javascript
/**
 * 点击判定策略
 * 优先级：
 * 1. 游戏必须进行中
 * 2. 该洞必须有地鼠（state === UP）
 * 3. 防止重复点击（快速连点保护）
 */
handleClick(holeId, event) {
  // 前置检查
  if (!this.isPlaying) return null;
  if (holeId < 0 || holeId >= this.config.HOLE_COUNT) return null;
  
  const hole = this.holes[holeId];
  
  // 状态检查
  if (hole.state !== HoleState.MOLE_UP) {
    this._emit(CORE_EVENTS.CLICK_MISS, { holeId, reason: 'no_mole' });
    return null;
  }
  
  // 计算反应时间
  const reactionTime = Date.now() - hole.appearTime;
  
  // 标记为已击中（防止重复计分）
  hole.state = HoleState.MOLE_HIT;
  clearTimeout(hole.disappearTimer);
  
  // 延迟隐藏（给动画留出时间）
  setTimeout(() => this._hideMole(holeId), 200);
  
  this.activeMoleCount--;
  
  const result = {
    success: true,
    holeId,
    moleType: hole.moleType,
    reactionTime
  };
  
  this._emit(CORE_EVENTS.MOLE_HIT, result);
  return result;
}
```

#### 4.2.3 防作弊/连点保护

```javascript
// 每个洞的点击冷却时间（毫秒）
const CLICK_COOLDOWN = 300;

// 在Hole结构中添加
interface Hole {
  // ... 其他字段
  lastHitTime: number;  // 上次被击中的时间
}

// 判定逻辑中添加
if (Date.now() - hole.lastHitTime < CLICK_COOLDOWN) {
  return null;  // 冷却中，忽略点击
}
```

### 4.3 性能优化

| 优化点 | 方案 |
|--------|------|
| 定时器管理 | 使用单一定时器调度，而非多个setTimeout |
| DOM操作 | 通过事件通知UI层，不直接操作DOM |
| 内存泄漏 | 游戏结束时清理所有定时器 |
| 移动端 | touch事件优先，减少300ms延迟 |

---

## 五、代码结构

### 5.1 文件组织

```
src/
├── core/
│   ├── WhackAMoleCore.js      # 核心逻辑类
│   ├── constants.js            # 常量定义（事件名、配置默认值）
│   └── types.js                # JSDoc类型定义（可选）
├── utils/
│   ├── EventEmitter.js         # 简单事件发射器
│   └── helpers.js              # 工具函数
└── index.js                    # 入口文件
```

### 5.2 核心代码示例

```javascript
// src/core/WhackAMoleCore.js

import { CORE_EVENTS, DEFAULT_CONFIG } from './constants.js';
import { EventEmitter } from '../utils/EventEmitter.js';

export class WhackAMoleCore extends EventEmitter {
  constructor(userConfig = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...userConfig };
    this.isPlaying = false;
    this.holes = [];
    this.activeMoleCount = 0;
    this.spawnTimer = null;
    this.lastSpawnTime = 0;
  }
  
  init() {
    // 初始化9个洞
    this.holes = Array(this.config.HOLE_COUNT).fill(null).map((_, id) => ({
      id,
      state: 'empty',
      moleType: null,
      appearTime: 0,
      disappearTimer: null,
      lastHitTime: 0
    }));
    
    this._emit(CORE_EVENTS.GAME_INIT);
  }
  
  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this._scheduleNextSpawn();
    this._emit(CORE_EVENTS.GAME_START);
  }
  
  // ... 其他方法实现
}
```

---

## 六、与UI层对接规范

### 6.1 UI层需要监听的事件

```javascript
const uiCallbacks = {
  [CORE_EVENTS.MOLE_SPAWN]: ({ holeId }) => {
    // 显示地鼠动画
    showMole(holeId);
  },
  
  [CORE_EVENTS.MOLE_HIDE]: ({ holeId, reason }) => {
    // 隐藏地鼠动画
    hideMole(holeId, reason);
  },
  
  [CORE_EVENTS.MOLE_HIT]: ({ holeId, reactionTime }) => {
    // 播放击中效果
    playHitEffect(holeId);
    // 通知计分系统（由第3项负责）
    scoreManager.addScore(reactionTime);
  },
  
  [CORE_EVENTS.CLICK_MISS]: ({ holeId }) => {
    // 播放 miss 效果（可选）
    playMissEffect(holeId);
  }
};
```

### 6.2 UI层需要调用的API

```javascript
// 初始化
core.init();

// 绑定点击事件
document.querySelectorAll('.hole').forEach((holeEl, index) => {
  holeEl.addEventListener('click', (e) => {
    core.handleClick(index, e);
  });
  
  // 移动端触摸优化
  holeEl.addEventListener('touchstart', (e) => {
    e.preventDefault();  // 防止双击缩放
    core.handleClick(index, e);
  });
});

// 游戏控制
core.start();
core.stop();
```

---

## 七、测试要点

### 7.1 单元测试场景

1. **生成逻辑**
   - [ ] 不会在有地鼠的洞生成新地鼠
   - [ ] 不会超过最大同时存在数量
   - [ ] 生成间隔在设定范围内随机

2. **点击判定**
   - [ ] 正确识别命中
   - [ ] 正确识别未命中
   - [ ] 防止重复计分
   - [ ] 游戏未开始时点击无效

3. **状态流转**
   - [ ] empty -> up -> hit -> empty
   - [ ] empty -> up -> timeout -> empty
   - [ ] 游戏停止时清理所有定时器

### 7.2 边界情况

- 快速连续点击同一洞
- 游戏暂停期间地鼠超时
- 同时点击多个洞
- 页面失去焦点时的处理

---

## 八、交付清单

- [x] 数据模型设计（TypeScript风格JSDoc）
- [x] API接口设计（完整类定义）
- [x] 技术方案说明（架构+算法）
- [x] 与UI层对接规范
- [x] 测试要点

---

## 九、后续建议

1. **第3项（计分系统）**可订阅 `MOLE_HIT` 事件获取命中数据
2. **第4项（游戏流程）**可通过 `start()`/`stop()` 控制游戏节奏
3. **第5项（音效动效）**可在对应事件回调中触发

---

*设计完成，等待评审后进入编码阶段*
