# 打地鼠游戏 - 第4项：游戏流程设计文档

## 概述
本设计文档详细描述打地鼠游戏的完整流程控制，包括开始界面、30秒倒计时、结束结算和重新开始功能。

---

## 一、数据模型设计

### 1.1 游戏状态枚举 (GameState)

```javascript
/**
 * 游戏状态枚举
 * @readonly
 * @enum {string}
 */
const GameState = {
  /** 初始/待机状态 - 显示开始界面 */
  IDLE: 'idle',
  /** 准备中 - 倒计时3秒后开始 */
  READY: 'ready',
  /** 游戏中 - 地鼠出现，可点击 */
  PLAYING: 'playing',
  /** 暂停 - 可选功能 */
  PAUSED: 'paused',
  /** 游戏结束 - 显示结算界面 */
  GAME_OVER: 'gameOver'
};
```

### 1.2 游戏配置常量 (GameConfig)

```javascript
/**
 * 游戏配置常量
 * @readonly
 */
const GameConfig = {
  /** 游戏总时长（秒） */
  GAME_DURATION: 30,
  /** 准备倒计时（秒） */
  READY_COUNTDOWN: 3,
  /** 连击判定时间窗口（毫秒） */
  COMBO_WINDOW: 2000,
  /** 基础得分 */
  BASE_SCORE: 10,
  /** 连击奖励倍数 */
  COMBO_MULTIPLIER: 1.5,
  /** 最大连击数 */
  MAX_COMBO_DISPLAY: 50
};
```

### 1.3 游戏状态对象 (GameStateManager)

```javascript
/**
 * 游戏状态管理器数据结构
 */
class GameStateManager {
  constructor() {
    // 当前状态
    this.currentState = GameState.IDLE;
    
    // 计时相关
    this.timeRemaining = GameConfig.GAME_DURATION;  // 剩余时间（秒）
    this.readyCountdown = GameConfig.READY_COUNTDOWN;  // 准备倒计时
    this.gameStartTime = null;  // 游戏开始时间戳
    this.gameEndTime = null;    // 游戏结束时间戳
    
    // 分数相关（与第3项计分系统对接）
    this.score = 0;           // 当前分数
    this.combo = 0;           // 当前连击数
    this.maxCombo = 0;        // 本次游戏最高连击
    this.hits = 0;            // 命中次数
    this.misses = 0;          // 失误次数（可选统计）
    
    // 历史记录
    this.sessionHistory = []; // 本次会话的游戏记录
    this.bestScore = this.loadBestScore(); // 从localStorage读取
    
    // 定时器引用（用于清理）
    this.timers = {
      gameLoop: null,      // 游戏主循环
      countdown: null,     // 倒计时定时器
      readyTimer: null,    // 准备倒计时
      moleSpawn: null      // 地鼠生成器
    };
  }
  
  /**
   * 从localStorage加载最高分
   * @returns {number}
   */
  loadBestScore() {
    const saved = localStorage.getItem('whackAMole_bestScore');
    return saved ? parseInt(saved, 10) : 0;
  }
  
  /**
   * 保存最高分到localStorage
   */
  saveBestScore() {
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      localStorage.setItem('whackAMole_bestScore', this.score.toString());
    }
  }
  
  /**
   * 重置游戏状态（新游戏开始时调用）
   */
  reset() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hits = 0;
    this.misses = 0;
    this.timeRemaining = GameConfig.GAME_DURATION;
    this.readyCountdown = GameConfig.READY_COUNTDOWN;
    this.gameStartTime = null;
    this.gameEndTime = null;
  }
  
  /**
   * 获取游戏结果统计
   * @returns {GameResult}
   */
  getGameResult() {
    const duration = this.gameEndTime && this.gameStartTime 
      ? (this.gameEndTime - this.gameStartTime) / 1000 
      : GameConfig.GAME_DURATION;
    
    return {
      score: this.score,
      maxCombo: this.maxCombo,
      hits: this.hits,
      accuracy: this.hits > 0 ? Math.round((this.hits / (this.hits + this.misses)) * 100) : 0,
      duration: duration,
      isNewRecord: this.score >= this.bestScore,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * @typedef {Object} GameResult
 * @property {number} score - 最终得分
 * @property {number} maxCombo - 最高连击数
 * @property {number} hits - 命中次数
 * @property {number} accuracy - 命中率(%)
 * @property {number} duration - 实际游戏时长(秒)
 * @property {boolean} isNewRecord - 是否创造新纪录
 * @property {string} timestamp - ISO格式时间戳
 */
```

---

## 二、API 接口设计

### 2.1 游戏流程控制器 (GameFlowController)

```javascript
/**
 * 游戏流程控制器
 * 负责管理游戏生命周期：开始 → 准备 → 进行 → 结束
 */
class GameFlowController {
  /**
   * @param {GameStateManager} stateManager - 状态管理器实例
   * @param {UIManager} uiManager - UI管理器实例（由第1项提供）
   * @param {GameLogic} gameLogic - 游戏逻辑实例（由第2项提供）
   */
  constructor(stateManager, uiManager, gameLogic) {
    this.state = stateManager;
    this.ui = uiManager;
    this.logic = gameLogic;
    
    // 绑定事件处理器
    this.bindEvents();
  }
  
  // ==================== 核心流程控制 API ====================
  
  /**
   * 初始化游戏 - 进入待机状态
   * 在页面加载完成后调用一次
   */
  init() {
    this.transitionTo(GameState.IDLE);
  }
  
  /**
   * 开始游戏流程
   * 从待机/结束状态进入准备状态
   */
  startGame() {
    if (this.state.currentState === GameState.PLAYING) return;
    
    this.state.reset();
    this.transitionTo(GameState.READY);
    this.startReadyCountdown();
  }
  
  /**
   * 暂停游戏（可选功能）
   */
  pauseGame() {
    if (this.state.currentState !== GameState.PLAYING) return;
    this.transitionTo(GameState.PAUSED);
    this.clearAllTimers();
  }
  
  /**
   * 恢复游戏（可选功能）
   */
  resumeGame() {
    if (this.state.currentState !== GameState.PAUSED) return;
    this.transitionTo(GameState.PLAYING);
    this.startGameLoop();
  }
  
  /**
   * 结束游戏
   * 强制结束当前游戏并显示结算
   */
  endGame() {
    if (this.state.currentState === GameState.IDLE || 
        this.state.currentState === GameState.GAME_OVER) return;
    
    this.state.gameEndTime = Date.now();
    this.state.saveBestScore();
    this.clearAllTimers();
    this.transitionTo(GameState.GAME_OVER);
    this.showGameOverScreen();
  }
  
  /**
   * 重新开始
   * 从结束状态快速开始新游戏
   */
  restartGame() {
    this.startGame();
  }
  
  /**
   * 返回主菜单
   * 从结束状态回到待机状态
   */
  backToMenu() {
    this.transitionTo(GameState.IDLE);
  }
  
  // ==================== 内部方法 ====================
  
  /**
   * 状态转换
   * @private
   * @param {GameState} newState - 目标状态
   */
  transitionTo(newState) {
    const oldState = this.state.currentState;
    this.state.currentState = newState;
    
    // 触发状态变更事件
    this.emit('stateChange', { from: oldState, to: newState });
    
    // 更新UI显示
    this.updateUIForState(newState);
  }
  
  /**
   * 开始准备倒计时（3-2-1-GO!）
   * @private
   */
  startReadyCountdown() {
    let count = this.state.readyCountdown;
    
    this.state.timers.readyTimer = setInterval(() => {
      this.emit('readyCountdown', { count });
      
      if (count <= 0) {
        clearInterval(this.state.timers.readyTimer);
        this.startPlaying();
      } else {
        count--;
      }
    }, 1000);
    
    // 立即触发第一次显示
    this.emit('readyCountdown', { count });
  }
  
  /**
   * 正式开始游戏
   * @private
   */
  startPlaying() {
    this.state.gameStartTime = Date.now();
    this.transitionTo(GameState.PLAYING);
    this.startGameLoop();
    this.startMoleSpawner();
  }
  
  /**
   * 启动游戏主循环（倒计时）
   * @private
   */
  startGameLoop() {
    this.state.timers.countdown = setInterval(() => {
      this.state.timeRemaining--;
      this.emit('timeUpdate', { 
        remaining: this.state.timeRemaining,
        total: GameConfig.GAME_DURATION 
      });
      
      if (this.state.timeRemaining <= 0) {
        this.endGame();
      }
    }, 1000);
  }
  
  /**
   * 启动地鼠生成器
   * @private
   */
  startMoleSpawner() {
    // 调用第2项提供的地鼠生成逻辑
    this.logic.startSpawning();
  }
  
  /**
   * 清理所有定时器
   * @private
   */
  clearAllTimers() {
    Object.values(this.state.timers).forEach(timer => {
      if (timer) {
        clearInterval(timer);
        clearTimeout(timer);
      }
    });
    
    this.state.timers = {
      gameLoop: null,
      countdown: null,
      readyTimer: null,
      moleSpawn: null
    };
  }
  
  /**
   * 根据状态更新UI
   * @private
   * @param {GameState} state - 当前状态
   */
  updateUIForState(state) {
    switch (state) {
      case GameState.IDLE:
        this.ui.showStartScreen();
        break;
      case GameState.READY:
        this.ui.showReadyScreen();
        break;
      case GameState.PLAYING:
        this.ui.showGameScreen();
        break;
      case GameState.PAUSED:
        this.ui.showPauseScreen();
        break;
      case GameState.GAME_OVER:
        this.ui.showGameOverScreen(this.state.getGameResult());
        break;
    }
  }
  
  /**
   * 显示游戏结束界面
   * @private
   */
  showGameOverScreen() {
    const result = this.state.getGameResult();
    this.ui.showGameOverScreen(result);
    
    // 添加到历史记录
    this.state.sessionHistory.push(result);
  }
  
  // ==================== 事件系统 ====================
  
  /**
   * 绑定DOM事件
   * @private
   */
  bindEvents() {
    // 开始按钮
    this.ui.on('startClick', () => this.startGame());
    
    // 重新开始按钮
    this.ui.on('restartClick', () => this.restartGame());
    
    // 返回菜单按钮
    this.ui.on('menuClick', () => this.backToMenu());
    
    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
      switch(e.key) {
        case ' ':  // 空格键开始/重新开始
          e.preventDefault();
          if (this.state.currentState === GameState.IDLE) {
            this.startGame();
          } else if (this.state.currentState === GameState.GAME_OVER) {
            this.restartGame();
          }
          break;
        case 'Escape':  // ESC返回菜单
          if (this.state.currentState === GameState.GAME_OVER) {
            this.backToMenu();
          }
          break;
      }
    });
  }
  
  /**
   * 简单的事件发射器
   * @private
   */
  emit(eventName, data) {
    // 触发UI更新回调
    if (this.ui[eventName]) {
      this.ui[eventName](data);
    }
    
    // 触发自定义事件（供其他模块监听）
    window.dispatchEvent(new CustomEvent(`game:${eventName}`, { detail: data }));
  }
}
```

### 2.2 UI 管理器接口 (UIManager)

```javascript
/**
 * UI管理器 - 负责各界面的显示/隐藏
 * 与第1项的界面设计对接
 */
class UIManager {
  constructor() {
    // DOM元素引用
    this.elements = {
      startScreen: document.getElementById('start-screen'),
      readyScreen: document.getElementById('ready-screen'),
      gameScreen: document.getElementById('game-screen'),
      pauseScreen: document.getElementById('pause-screen'),
      gameOverScreen: document.getElementById('game-over-screen'),
      
      // HUD元素
      scoreDisplay: document.getElementById('score-display'),
      timeDisplay: document.getElementById('time-display'),
      comboDisplay: document.getElementById('combo-display'),
      progressBar: document.getElementById('progress-bar')
    };
    
    // 事件回调存储
    this.callbacks = {};
  }
  
  // ==================== 屏幕切换 ====================
  
  /**
   * 显示开始界面
   */
  showStartScreen() {
    this.hideAllScreens();
    this.elements.startScreen.classList.add('active');
    this.renderStartScreen();
  }
  
  /**
   * 显示准备界面（3-2-1倒计时）
   */
  showReadyScreen() {
    this.hideAllScreens();
    this.elements.readyScreen.classList.add('active');
  }
  
  /**
   * 显示游戏主界面
   */
  showGameScreen() {
    this.hideAllScreens();
    this.elements.gameScreen.classList.add('active');
  }
  
  /**
   * 显示暂停界面
   */
  showPauseScreen() {
    this.elements.pauseScreen.classList.add('active');
  }
  
  /**
   * 显示游戏结束界面
   * @param {GameResult} result - 游戏结果
   */
  showGameOverScreen(result) {
    this.hideAllScreens();
    this.elements.gameOverScreen.classList.add('active');
    this.renderGameOverScreen(result);
  }
  
  /**
   * 隐藏所有屏幕
   * @private
   */
  hideAllScreens() {
    ['startScreen', 'readyScreen', 'gameScreen', 'pauseScreen', 'gameOverScreen']
      .forEach(id => this.elements[id].classList.remove('active'));
  }
  
  // ==================== HUD更新 ====================
  
  /**
   * 更新分数显示
   * @param {number} score - 当前分数
   */
  updateScore(score) {
    this.elements.scoreDisplay.textContent = score.toString().padStart(5, '0');
  }
  
  /**
   * 更新时间显示
   * @param {number} remaining - 剩余秒数
   * @param {number} total - 总秒数
   */
  updateTime(remaining, total) {
    this.elements.timeDisplay.textContent = remaining.toString();
    
    // 更新进度条
    const percentage = (remaining / total) * 100;
    this.elements.progressBar.style.width = `${percentage}%`;
    
    // 时间少于5秒时添加警告样式
    if (remaining <= 5) {
      this.elements.timeDisplay.classList.add('warning');
    } else {
      this.elements.timeDisplay.classList.remove('warning');
    }
  }
  
  /**
   * 更新连击显示
   * @param {number} combo - 当前连击数
   */
  updateCombo(combo) {
    this.elements.comboDisplay.textContent = combo > 1 ? `${combo}x` : '';
    
    if (combo > 1) {
      this.elements.comboDisplay.classList.add('show');
      // 动画效果
      this.animateCombo();
    } else {
      this.elements.comboDisplay.classList.remove('show');
    }
  }
  
  /**
   * 更新准备倒计时显示
   * @param {Object} data - { count: number }
   */
  readyCountdown({ count }) {
    const readyText = document.getElementById('ready-text');
    if (count > 0) {
      readyText.textContent = count.toString();
      this.animateReadyNumber();
    } else {
      readyText.textContent = 'GO!';
      this.animateGo();
    }
  }
  
  /**
   * 更新时间显示（由timeUpdate事件触发）
   * @param {Object} data - { remaining, total }
   */
  timeUpdate({ remaining, total }) {
    this.updateTime(remaining, total);
  }
  
  // ==================== 渲染方法 ====================
  
  /**
   * 渲染开始界面内容
   * @private
   */
  renderStartScreen() {
    const bestScore = localStorage.getItem('whackAMole_bestScore') || 0;
    document.getElementById('best-score').textContent = `最高分: ${bestScore}`;
  }
  
  /**
   * 渲染游戏结束界面
   * @private
   * @param {GameResult} result
   */
  renderGameOverScreen(result) {
    document.getElementById('final-score').textContent = result.score;
    document.getElementById('final-max-combo').textContent = result.maxCombo;
    document.getElementById('final-hits').textContent = result.hits;
    document.getElementById('final-accuracy').textContent = `${result.accuracy}%`;
    
    const recordBadge = document.getElementById('new-record-badge');
    if (result.isNewRecord) {
      recordBadge.classList.add('show');
    } else {
      recordBadge.classList.remove('show');
    }
  }
  
  // ==================== 动画效果 ====================
  
  /**
   * 准备数字动画
   * @private
   */
  animateReadyNumber() {
    const text = document.getElementById('ready-text');
    text.classList.remove('pop-in');
    void text.offsetWidth; // 强制重排
    text.classList.add('pop-in');
  }
  
  /**
   * GO! 动画
   * @private
   */
  animateGo() {
    const text = document.getElementById('ready-text');
    text.classList.add('go-pulse');
    setTimeout(() => text.classList.remove('go-pulse'), 500);
  }
  
  /**
   * 连击动画
   * @private
   */
  animateCombo() {
    const combo = this.elements.comboDisplay;
    combo.classList.remove('combo-bounce');
    void combo.offsetWidth;
    combo.classList.add('combo-bounce');
  }
  
  // ==================== 事件绑定 ====================
  
  /**
   * 注册事件回调
   * @param {string} event - 事件名
   * @param {Function} callback - 回调函数
   */
  on(event, callback) {
    this.callbacks[event] = callback;
    
    // 绑定到对应的DOM元素
    switch(event) {
      case 'startClick':
        document.getElementById('btn-start').addEventListener('click', callback);
        break;
      case 'restartClick':
        document.getElementById('btn-restart').addEventListener('click', callback);
        break;
      case 'menuClick':
        document.getElementById('btn-menu').addEventListener('click', callback);
        break;
    }
  }
}
```

---

## 三、技术方案

### 3.1 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      游戏流程架构                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐      ┌──────────────────┐            │
│  │   GameState      │◄────►│  GameFlowController │          │
│  │   (状态数据)      │      │   (流程控制器)       │          │
│  └──────────────────┘      └────────┬─────────┘            │
│           ▲                         │                       │
│           │                         ▼                       │
│           │                ┌──────────────────┐            │
│           │                │    UIManager     │            │
│           │                │   (界面管理)      │            │
│           │                └────────┬─────────┘            │
│           │                         │                       │
│           ▼                         ▼                       │
│  ┌──────────────────────────────────────────┐              │
│  │              DOM / CSS                    │              │
│  │  ┌────────┐ ┌────────┐ ┌──────────────┐  │              │
│  │  │开始界面 │ │游戏界面 │ │  结束界面     │  │              │
│  │  └────────┘ └────────┘ └──────────────┘  │              │
│  └──────────────────────────────────────────┘              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 状态机流转图

```
                    ┌─────────┐
         ┌─────────►│  IDLE   │◄────────┐
         │          │ (待机)  │         │
         │          └────┬────┘         │
         │               │ startGame()  │ backToMenu()
         │               ▼              │
         │          ┌─────────┐         │
         │          │  READY  │         │
         │          │ (准备)  │         │
         │          └────┬────┘         │
         │               │ 3秒倒计时     │
         │               ▼              │
    restart()      ┌─────────┐          │
         │         │ PLAYING │          │
         │         │ (游戏中) │          │
         │         └────┬────┘          │
         │              │               │
         │              │ 时间到/endGame()│
         │              ▼               │
         │         ┌─────────┐          │
         └─────────┤GAME_OVER│──────────┘
                   │ (结束)  │
                   └─────────┘
```

### 3.3 文件结构

```
js/
├── core/
│   ├── GameState.js          # 状态枚举和配置常量
│   ├── GameStateManager.js   # 状态管理器类
│   └── GameFlowController.js # 流程控制器类
├── ui/
│   └── UIManager.js          # UI管理器（与第1项配合）
└── main.js                   # 入口文件，初始化游戏
```

### 3.4 关键实现细节

#### 3.4.1 单例模式确保状态一致性

```javascript
// main.js
let gameInstance = null;

function initGame() {
  const stateManager = new GameStateManager();
  const uiManager = new UIManager();
  const gameLogic = new GameLogic(); // 来自第2项
  
  gameInstance = new GameFlowController(
    stateManager, 
    uiManager, 
    gameLogic
  );
  
  gameInstance.init();
}

document.addEventListener('DOMContentLoaded', initGame);
```

#### 3.4.2 定时器管理策略

```javascript
/**
 * 使用 WeakMap 避免内存泄漏
 * 或使用集中式定时器管理
 */
class TimerManager {
  constructor() {
    this.timers = new Set();
  }
  
  setInterval(fn, delay) {
    const id = setInterval(fn, delay);
    this.timers.add(id);
    return id;
  }
  
  setTimeout(fn, delay) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, delay);
    this.timers.add(id);
    return id;
  }
  
  clearAll() {
    this.timers.forEach(id => {
      clearInterval(id);
      clearTimeout(id);
    });
    this.timers.clear();
  }
}
```

#### 3.4.3 防止重复点击（防抖）

```javascript
/**
 * 按钮点击防抖
 */
function debounce(fn, delay = 300) {
  let timeoutId;
  return function(...args) {
    if (timeoutId) return;
    fn.apply(this, args);
    timeoutId = setTimeout(() => {
      timeoutId = null;
    }, delay);
  };
}

// 使用
button.addEventListener('click', debounce(() => {
  gameController.startGame();
}, 500));
```

---

## 四、与其他模块的对接

### 4.1 与第1项（界面设计）对接

| 需求 | 对接方式 |
|------|---------|
| 3x3网格 | UIManager通过ID获取DOM元素，GameFlowController控制显示/隐藏 |
| 锤子光标 | 在游戏状态PLAYING时启用，其他状态禁用 |
| 响应式布局 | UIManager监听resize事件，调整游戏区域大小 |

### 4.2 与第2项（核心逻辑）对接

```javascript
// GameFlowController 调用 GameLogic 的接口
interface GameLogic {
  // 开始生成地鼠
  startSpawning(): void;
  
  // 停止生成地鼠
  stopSpawning(): void;
  
  // 处理点击事件
  handleHit(holeIndex: number): HitResult;
  
  // 重置所有地鼠
  resetHoles(): void;
}
```

### 4.3 与第3项（计分系统）对接

```javascript
// GameStateManager 包含计分相关字段
// GameFlowController 监听计分事件

// 在 GameFlowController 构造函数中
constructor(stateManager, uiManager, gameLogic) {
  // ...
  
  // 监听计分系统事件
  window.addEventListener('game:scoreUpdate', (e) => {
    this.state.score = e.detail.score;
    this.state.combo = e.detail.combo;
    this.state.maxCombo = Math.max(this.state.maxCombo, e.detail.combo);
    this.state.hits = e.detail.hits;
  });
}
```

### 4.4 与第5项（音效动效）对接

```javascript
// 状态变更时触发音效
emit(eventName, data) {
  // 触发自定义事件
  window.dispatchEvent(new CustomEvent(`game:${eventName}`, { detail: data }));
  
  // 第5项的音效管理器会监听这些事件
  // game:stateChange -> 播放对应音效
  // game:readyCountdown -> 播放倒计时音效
  // game:timeUpdate -> 最后5秒播放紧张音效
}
```

---

## 五、HTML结构要求

```html
<!-- 游戏容器 -->
<div id="game-container">
  
  <!-- 1. 开始界面 -->
  <div id="start-screen" class="screen">
    <h1>🔨 打地鼠</h1>
    <p class="subtitle">30秒内击中尽可能多的地鼠！</p>
    <div id="best-score">最高分: 0</div>
    <button id="btn-start" class="btn-primary">开始游戏</button>
    <p class="hint">按空格键快速开始</p>
  </div>
  
  <!-- 2. 准备界面 -->
  <div id="ready-screen" class="screen">
    <div id="ready-text">3</div>
    <p>准备好你的锤子！</p>
  </div>
  
  <!-- 3. 游戏界面 -->
  <div id="game-screen" class="screen">
    <!-- HUD -->
    <div id="hud">
      <div id="score-display">00000</div>
      <div id="time-display">30</div>
      <div id="combo-display"></div>
    </div>
    <!-- 进度条 -->
    <div id="progress-container">
      <div id="progress-bar"></div>
    </div>
    <!-- 游戏区域（由第1项实现） -->
    <div id="game-grid">
      <!-- 9个地鼠洞 -->
    </div>
  </div>
  
  <!-- 4. 暂停界面（可选） -->
  <div id="pause-screen" class="screen overlay">
    <h2>游戏暂停</h2>
    <button id="btn-resume">继续</button>
  </div>
  
  <!-- 5. 游戏结束界面 -->
  <div id="game-over-screen" class="screen">
    <h2>游戏结束！</h2>
    <div id="result-panel">
      <div class="result-item">
        <span class="label">最终得分</span>
        <span id="final-score" class="value">0</span>
      </div>
      <div class="result-item">
        <span class="label">最高连击</span>
        <span id="final-max-combo" class="value">0</span>
      </div>
      <div class="result-item">
        <span class="label">命中次数</span>
        <span id="final-hits" class="value">0</span>
      </div>
      <div class="result-item">
        <span class="label">命中率</span>
        <span id="final-accuracy" class="value">0%</span>
      </div>
    </div>
    <div id="new-record-badge" class="badge">🏆 新纪录！</div>
    <div class="button-group">
      <button id="btn-restart" class="btn-primary">再玩一次</button>
      <button id="btn-menu" class="btn-secondary">返回菜单</button>
    </div>
    <p class="hint">空格键再玩一次，ESC返回菜单</p>
  </div>
  
</div>
```

---

## 六、CSS状态类

```css
/* 屏幕显示控制 */
.screen {
  display: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.screen.active {
  display: flex;
  opacity: 1;
}

/* 倒计时文字动画 */
#ready-text {
  font-size: 8rem;
  font-weight: bold;
  color: #ff6b6b;
}

#ready-text.pop-in {
  animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

#ready-text.go-pulse {
  animation: goPulse 0.5s ease-out;
}

@keyframes popIn {
  0% { transform: scale(0); opacity: 0; }
  80% { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes goPulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.5); color: #51cf66; }
  100% { transform: scale(1); }
}

/* 时间警告 */
#time-display.warning {
  color: #ff6b6b;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

/* 连击显示 */
#combo-display {
  font-size: 2rem;
  color: #ffd43b;
  opacity: 0;
  transition: opacity 0.2s;
}

#combo-display.show {
  opacity: 1;
}

#combo-display.combo-bounce {
  animation: comboBounce 0.3s ease-out;
}

@keyframes comboBounce {
  0% { transform: scale(1); }
  50% { transform: scale(1.5); }
  100% { transform: scale(1); }
}

/* 进度条 */
#progress-container {
  width: 100%;
  height: 8px;
  background: rgba(0,0,0,0.1);
  border-radius: 4px;
  overflow: hidden;
}

#progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #51cf66, #ffd43b, #ff6b6b);
  background-size: 100% 100%;
  transition: width 1s linear;
}

/* 新纪录徽章 */
#new-record-badge {
  display: none;
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, #ffd43b, #ffa94d);
  color: #fff;
  border-radius: 20px;
  font-weight: bold;
  animation: badgeGlow 2s ease-in-out infinite;
}

#new-record-badge.show {
  display: block;
}

@keyframes badgeGlow {
  0%, 100% { box-shadow: 0 0 10px rgba(255, 212, 59, 0.5); }
  50% { box-shadow: 0 0 20px rgba(255, 212, 59, 0.8); }
}
```

---

## 七、测试要点

### 7.1 功能测试

| 测试项 | 预期结果 |
|-------|---------|
| 点击开始按钮 | 进入准备界面，显示3秒倒计时 |
| 倒计时结束后 | 自动进入游戏界面，计时器开始 |
| 30秒倒计时 | 每秒更新，进度条同步减少 |
| 时间到0 | 自动结束游戏，显示结算界面 |
| 点击重新开始 | 重置所有状态，重新开始游戏 |
| 点击返回菜单 | 回到开始界面，保留最高分 |
| 空格键快捷操作 | 在开始/结束界面可快速开始 |

### 7.2 边界测试

| 测试项 | 预期结果 |
|-------|---------|
| 快速多次点击开始 | 只响应第一次，防抖生效 |
| 游戏进行中刷新页面 | 游戏状态重置，最高分保留 |
| 浏览器标签页切换 | 游戏继续运行（或可选暂停） |
| 低性能设备 | 倒计时仍然准确，不依赖帧率 |

### 7.3 兼容性测试

- Chrome/Firefox/Safari 最新版本
- iOS Safari / Android Chrome
- 触摸设备手势操作

---

## 八、交付物清单

### 8.1 代码文件

1. `js/core/GameState.js` - 状态枚举和配置
2. `js/core/GameStateManager.js` - 状态管理器
3. `js/core/GameFlowController.js` - 流程控制器
4. `js/ui/UIManager.js` - UI管理器

### 8.2 文档

1. `design/game-flow-design.md` - 本设计文档

### 8.3 对接说明

- 与第1项：确认DOM元素ID命名
- 与第2项：确认GameLogic接口
- 与第3项：确认计分事件名称
- 与第5项：确认音效触发事件

---

*设计完成时间: 2026-03-04*
*设计者: kimi-worker*
