# 打地鼠游戏 - 界面设计文档

## 项目信息
- **项目**: 打地鼠小游戏 (Issue #6)
- **设计项**: 第1项 - 游戏界面设计
- **日期**: 2026-03-04

---

## 1. 数据模型设计

### 1.1 游戏状态模型 (GameState)
```typescript
interface GameState {
  // 游戏进行状态
  status: 'idle' | 'playing' | 'paused' | 'ended';
  
  // 分数相关
  score: number;
  combo: number;           // 当前连击数
  maxCombo: number;        // 最大连击数
  
  // 时间相关
  timeRemaining: number;   // 剩余时间（秒）
  totalTime: number;       // 总游戏时间（默认30秒）
  
  // 地鼠状态数组 (3x3 = 9个洞)
  holes: HoleState[];
}
```

### 1.2 地鼠洞状态模型 (HoleState)
```typescript
interface HoleState {
  id: number;              // 洞的唯一标识 (0-8)
  status: 'empty' | 'mole-up' | 'mole-down' | 'hit';
  moleType: 'normal' | 'golden' | null;  // 地鼠类型（普通/金色加分）
  appearTime: number;      // 出现时间戳
  duration: number;        // 停留时长(ms)
}
```

### 1.3 配置常量
```typescript
const GAME_CONFIG = {
  GRID_SIZE: 3,            // 3x3网格
  HOLE_COUNT: 9,           // 总洞数
  MOLE_STAY_MIN: 600,      // 地鼠最短停留时间(ms)
  MOLE_STAY_MAX: 1200,     // 地鼠最长停留时间(ms)
  ANIMATION_DURATION: 200, // 动画过渡时间(ms)
};
```

---

## 2. 界面结构设计

### 2.1 HTML结构
```html
<div class="game-container">
  <!-- 头部信息区 -->
  <header class="game-header">
    <div class="score-board">
      <span class="label">得分</span>
      <span class="value" id="score">0</span>
    </div>
    <div class="combo-display" id="combo"></div>
    <div class="timer">
      <span class="label">时间</span>
      <span class="value" id="time">30</span>
    </div>
  </header>

  <!-- 游戏主区域 -->
  <main class="game-board">
    <div class="holes-grid">
      <!-- 9个地鼠洞，通过JS动态生成 -->
      <div class="hole" data-id="0">
        <div class="hole-inner">
          <div class="dirt-mask"></div>
          <div class="mole">
            <div class="mole-body"></div>
            <div class="mole-face"></div>
          </div>
        </div>
      </div>
      <!-- ... 重复8次 -->
    </div>
  </main>

  <!-- 覆盖层：开始/结束界面 -->
  <div class="overlay" id="overlay">
    <div class="modal">
      <h1 id="modal-title">打地鼠</h1>
      <p id="modal-desc">点击出现的地鼠，获得分数！</p>
      <button id="start-btn" class="btn-primary">开始游戏</button>
    </div>
  </div>
</div>

<!-- 锤子光标元素（跟随鼠标） -->
<div class="hammer-cursor" id="hammer">
  <div class="hammer-handle"></div>
  <div class="hammer-head"></div>
</div>
```

### 2.2 组件层级
```
game-container
├── game-header (固定顶部)
│   ├── score-board
│   ├── combo-display
│   └── timer
├── game-board (居中游戏区)
│   └── holes-grid (3x3网格)
│       └── hole x9
│           ├── hole-inner
│           ├── dirt-mask (泥土遮罩)
│           └── mole (地鼠)
│               ├── mole-body
│               └── mole-face
└── overlay (模态覆盖层)
    └── modal
        ├── title
        ├── desc
        └── start-btn
hammer-cursor (独立于容器，跟随鼠标)
```

---

## 3. CSS样式设计

### 3.1 响应式布局方案
```css
/* 基础容器 */
.game-container {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* 3x3网格布局 */
.holes-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: clamp(10px, 3vw, 20px);
  aspect-ratio: 1;
  max-width: 500px;
  margin: 0 auto;
}

/* 移动端适配 */
@media (max-width: 480px) {
  .game-container {
    padding: 10px;
  }
  
  .holes-grid {
    gap: 8px;
  }
}

/* 平板适配 */
@media (min-width: 768px) {
  .holes-grid {
    max-width: 600px;
  }
}
```

### 3.2 地鼠洞样式
```css
.hole {
  position: relative;
  background: linear-gradient(180deg, #5d4037 0%, #3e2723 100%);
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 
    inset 0 10px 20px rgba(0,0,0,0.5),
    0 4px 8px rgba(0,0,0,0.3);
}

.hole-inner {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 100%;
}

/* 泥土遮罩层 - 用于遮挡地鼠下半部分 */
.dirt-mask {
  position: absolute;
  bottom: 0;
  left: -10%;
  right: -10%;
  height: 35%;
  background: radial-gradient(ellipse at center, #5d4037 0%, #3e2723 70%);
  z-index: 2;
  border-radius: 50% 50% 0 0;
}
```

### 3.3 地鼠动画样式
```css
.mole {
  position: absolute;
  bottom: -100%; /* 初始隐藏在洞下 */
  left: 50%;
  transform: translateX(-50%);
  width: 70%;
  height: 80%;
  transition: bottom 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  z-index: 1;
}

/* 地鼠冒出状态 */
.mole.up {
  bottom: 15%; /* 冒出高度 */
}

/* 被击中状态 */
.mole.hit {
  animation: mole-hit 0.3s ease-out forwards;
}

@keyframes mole-hit {
  0% { transform: translateX(-50%) scale(1); }
  50% { transform: translateX(-50%) scale(0.9) rotate(-10deg); }
  100% { transform: translateX(-50%) scale(0); opacity: 0; }
}

/* 地鼠身体 */
.mole-body {
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, #8d6e63 0%, #6d4c41 100%);
  border-radius: 50% 50% 40% 40%;
  position: relative;
}

/* 地鼠脸部 */
.mole-face {
  position: absolute;
  top: 25%;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  height: 40%;
}

/* 眼睛 */
.mole-face::before,
.mole-face::after {
  content: '';
  position: absolute;
  top: 0;
  width: 12px;
  height: 12px;
  background: #333;
  border-radius: 50%;
}

.mole-face::before { left: 5px; }
.mole-face::after { right: 5px; }
```

### 3.4 锤子光标样式
```css
/* 隐藏默认光标 */
.game-board {
  cursor: none;
}

/* 锤子元素 */
.hammer-cursor {
  position: fixed;
  pointer-events: none; /* 不阻挡点击 */
  z-index: 9999;
  width: 60px;
  height: 60px;
  transform-origin: bottom right;
  transition: transform 0.05s ease-out;
}

.hammer-head {
  position: absolute;
  top: 0;
  right: 0;
  width: 35px;
  height: 25px;
  background: linear-gradient(135deg, #90a4ae 0%, #607d8b 100%);
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

.hammer-handle {
  position: absolute;
  top: 20px;
  right: 15px;
  width: 8px;
  height: 40px;
  background: linear-gradient(90deg, #8d6e63 0%, #5d4037 100%);
  border-radius: 4px;
  transform: rotate(-30deg);
}

/* 敲击动画 */
.hammer-cursor.slamming {
  animation: hammer-slam 0.15s ease-in-out;
}

@keyframes hammer-slam {
  0% { transform: rotate(0deg); }
  50% { transform: rotate(-45deg); }
  100% { transform: rotate(0deg); }
}

/* 移动端：使用触摸反馈替代自定义光标 */
@media (pointer: coarse) {
  .game-board {
    cursor: default;
  }
  
  .hammer-cursor {
    display: none;
  }
  
  /* 触摸时的视觉反馈 */
  .hole:active::after {
    content: '🔨';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 24px;
    animation: touch-feedback 0.2s ease-out;
  }
}
```

---

## 4. JavaScript交互逻辑

### 4.1 锤子光标控制
```javascript
class HammerCursor {
  constructor() {
    this.element = document.getElementById('hammer');
    this.isSlamming = false;
    this.init();
  }

  init() {
    // 桌面端：跟随鼠标
    if (window.matchMedia('(pointer: fine)').matches) {
      document.addEventListener('mousemove', (e) => {
        this.move(e.clientX, e.clientY);
      });

      // 点击时播放敲击动画
      document.addEventListener('mousedown', () => this.slam());
      document.addEventListener('mouseup', () => this.reset());
    }
  }

  move(x, y) {
    // 偏移使锤子头部对准鼠标位置
    const offsetX = 30;
    const offsetY = 50;
    this.element.style.left = `${x - offsetX}px`;
    this.element.style.top = `${y - offsetY}px`;
  }

  slam() {
    if (this.isSlamming) return;
    this.isSlamming = true;
    this.element.classList.add('slamming');
  }

  reset() {
    this.element.classList.remove('slamming');
    this.isSlamming = false;
  }
}
```

### 4.2 地鼠渲染管理
```javascript
class MoleRenderer {
  constructor(containerSelector) {
    this.container = document.querySelector(containerSelector);
    this.holes = [];
    this.initHoles();
  }

  // 初始化9个地鼠洞
  initHoles() {
    for (let i = 0; i < 9; i++) {
      const hole = this.createHoleElement(i);
      this.container.appendChild(hole);
      this.holes.push({
        id: i,
        element: hole,
        moleElement: hole.querySelector('.mole')
      });
    }
  }

  createHoleElement(id) {
    const hole = document.createElement('div');
    hole.className = 'hole';
    hole.dataset.id = id;
    hole.innerHTML = `
      <div class="hole-inner">
        <div class="dirt-mask"></div>
        <div class="mole">
          <div class="mole-body"></div>
          <div class="mole-face"></div>
        </div>
      </div>
    `;
    return hole;
  }

  // 显示地鼠
  showMole(holeId, type = 'normal') {
    const hole = this.holes[holeId];
    if (!hole) return;

    const mole = hole.moleElement;
    mole.classList.remove('hit');
    mole.classList.add('up');
    
    if (type === 'golden') {
      mole.classList.add('golden');
    }
  }

  // 隐藏地鼠
  hideMole(holeId) {
    const hole = this.holes[holeId];
    if (!hole) return;

    hole.moleElement.classList.remove('up', 'golden');
  }

  // 击中反馈
  hitMole(holeId) {
    const hole = this.holes[holeId];
    if (!hole) return;

    const mole = hole.moleElement;
    mole.classList.remove('up');
    mole.classList.add('hit');

    // 动画结束后重置
    setTimeout(() => {
      mole.classList.remove('hit');
    }, 300);
  }
}
```

### 4.3 触摸事件处理（移动端）
```javascript
class TouchHandler {
  constructor(gameBoard) {
    this.board = gameBoard;
    this.touchFeedback = null;
    this.init();
  }

  init() {
    // 阻止默认触摸行为（防止双击缩放）
    this.board.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.handleTouch(e.touches[0]);
    }, { passive: false });

    // 防止页面滚动
    this.board.addEventListener('touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });
  }

  handleTouch(touch) {
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    const hole = element?.closest('.hole');
    
    if (hole) {
      this.showTouchFeedback(touch.clientX, touch.clientY);
      // 触发游戏逻辑中的点击处理
      this.onHoleTapped?.(parseInt(hole.dataset.id));
    }
  }

  showTouchFeedback(x, y) {
    // 创建触摸点视觉反馈
    const feedback = document.createElement('div');
    feedback.className = 'touch-feedback';
    feedback.style.cssText = `
      position: fixed;
      left: ${x - 20}px;
      top: ${y - 20}px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255,255,255,0.8) 0%, transparent 70%);
      pointer-events: none;
      z-index: 9999;
      animation: touch-ripple 0.3s ease-out forwards;
    `;
    document.body.appendChild(feedback);
    
    setTimeout(() => feedback.remove(), 300);
  }
}
```

---

## 5. 技术方案总结

### 5.1 核心技术选型
| 技术 | 用途 | 说明 |
|------|------|------|
| CSS Grid | 3x3网格布局 | 响应式、简洁的网格实现 |
| CSS Transitions | 地鼠动画 | GPU加速，性能优秀 |
| CSS Animations | 击中反馈、锤子敲击 | 关键帧动画 |
| Pointer Events API | 输入检测 | 区分鼠标/触摸设备 |
| requestAnimationFrame | 动画同步 | 确保流畅的视觉更新 |

### 5.2 性能优化策略
1. **GPU加速**：使用 `transform` 和 `opacity` 属性进行动画
2. **事件委托**：在网格容器上统一处理点击事件
3. **CSS containment**：对地鼠洞使用 `contain: layout paint`
4. **被动事件监听器**：滚动相关事件使用 `{ passive: true }`

### 5.3 响应式断点
| 断点 | 宽度范围 | 调整内容 |
|------|----------|----------|
| 移动端 | < 480px | 缩小间距、简化特效 |
| 平板 | 480px - 768px | 标准布局 |
| 桌面 | > 768px | 完整特效、自定义光标 |

### 5.4 浏览器兼容性
- **目标浏览器**：Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **特性检测**：使用 `CSS.supports()` 检测高级特性
- **降级方案**：旧浏览器显示简化版地鼠（无复杂动画）

---

## 6. 交付物清单

### 6.1 文件结构
```
projects/whack-a-mole/
├── design-01-interface.md      # 本设计文档
├── src/
│   ├── index.html              # 主HTML文件
│   ├── css/
│   │   ├── main.css            # 主样式
│   │   ├── animations.css      # 动画关键帧
│   │   └── responsive.css      # 响应式适配
│   └── js/
│       ├── renderer.js         # 渲染管理
│       ├── hammer-cursor.js    # 锤子光标
│       └── touch-handler.js    # 触摸处理
```

### 6.2 待编码实现的功能点
- [ ] HTML结构搭建
- [ ] CSS样式编写（含响应式）
- [ ] 地鼠冒出/缩回动画
- [ ] 锤子光标跟随逻辑
- [ ] 移动端触摸适配
- [ ] 击中视觉反馈

---

## 7. 接口预留

### 7.1 与核心逻辑的对接点
```javascript
// 游戏核心逻辑需要调用的接口：

// 1. 显示地鼠
renderer.showMole(holeId, moleType);

// 2. 隐藏地鼠  
renderer.hideMole(holeId);

// 3. 播放击中动画
renderer.hitMole(holeId);

// 4. 更新分数显示
ui.updateScore(score);

// 5. 更新连击显示
ui.updateCombo(combo);

// 6. 更新时间显示
ui.updateTime(seconds);
```

### 7.2 事件回调
```javascript
// 界面层向核心逻辑上报的事件：

// 点击/触摸地鼠洞
onHoleClicked(holeId, timestamp);

// 开始按钮点击
onGameStart();

// 重新开始按钮点击
onGameRestart();
```

---

**设计完成时间**: 2026-03-04
**下一阶段**: 编码实现 (等待智囊团分配)
