// ==================== 自定义房间类型定义 ====================
// 文件: backend/src/types/room-custom.ts
// 说明: 扩展房间功能，支持密码保护和自定义游戏规则

import { GameConfig } from './index';

// ==================== 房间可见性 ====================
export type RoomVisibility = 'public' | 'private';

// ==================== 自定义游戏规则 ====================
export interface CustomGameRules {
  // 角色相关
  roleSettings: {
    // 是否启用特定角色
    enableFox: boolean;           // 是否启用狐狸
    enableDetective: boolean;     // 是否启用侦探猫（可查看玩家身份）
    enableGuard: boolean;         // 是否启用守护猫（可保护其他玩家）
    // 角色数量覆盖（0表示自动计算）
    overrideDogCount?: number;    // 手动设置狗狗数量
    overrideFoxCount?: number;    // 手动设置狐狸数量
  };

  // 游戏机制
  mechanics: {
    // 移动速度倍率
    playerSpeed: number;          // 0.5 - 2.0，默认 1.0
    // 视野范围倍率
    visionRange: number;          // 0.5 - 2.0，默认 1.0
    // 是否允许幽灵做任务
    ghostCanDoTasks: boolean;     // 默认 false
    // 是否显示玩家名字
    showPlayerNames: boolean;     // 默认 true
    // 击杀确认
    confirmKills: boolean;        // 击杀后是否显示确认动画
  };

  // 任务相关
  taskSettings: {
    // 任务数量
    shortTasks: number;           // 短任务数量 (1-5)
    longTasks: number;            // 长任务数量 (1-3)
    // 共同任务（所有人都要做）
    commonTasks: number;          // 共同任务数量 (0-2)
    // 任务难度
    taskDifficulty: 'easy' | 'normal' | 'hard';
  };

  // 投票相关
  votingSettings: {
    // 投票模式
    votingMode: 'anonymous' | 'visible';  // 匿名/公开投票
    // 平票处理
    tieBreaker: 'skip' | 'random' | 'all'; // 跳过/随机/全部出局
    // 是否允许跳过
    allowSkip: boolean;           // 默认 true
  };

  // 紧急会议
  emergencySettings: {
    // 每人紧急会议次数
    meetingsPerPlayer: number;    // 1-9，默认 1
    // 紧急会议冷却
    meetingCooldown: number;      // 秒，默认 15
    // 紧急会议按钮位置
    buttonPosition: 'cafeteria' | 'random' | 'all'; // 食堂/随机/所有房间
  };
}

// ==================== 扩展的房间类型 ====================
export interface CustomRoom {
  // 基础房间信息
  id: string;
  name: string;
  hostId: string;
  
  // 密码保护
  visibility: RoomVisibility;
  password?: string;            // 加密存储的密码哈希（可选）
  passwordHint?: string;        // 密码提示（可选）
  
  // 玩家管理
  maxPlayers: number;
  minPlayers: number;           // 最小开始人数（默认4）
  
  // 房间状态
  status: 'waiting' | 'playing' | 'ended';
  
  // 游戏配置
  gameConfig: GameConfig;
  customRules: CustomGameRules;
  
  // 房间设置
  settings: {
    allowSpectators: boolean;   // 是否允许观战
    allowFriendJoin: boolean;   // 是否允许好友直接加入
    autoStart: boolean;         // 人满自动开始
    autoStartDelay: number;     // 自动开始倒计时（秒）
  };
  
  // 元数据
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;         // 最后活动时间（用于清理空闲房间）
}

// ==================== API 请求/响应类型 ====================

// 创建自定义房间请求
export interface CreateCustomRoomRequest {
  name: string;
  visibility?: RoomVisibility;
  password?: string;            // 明文密码，服务器端哈希
  passwordHint?: string;
  maxPlayers?: number;
  minPlayers?: number;
  gameConfig?: Partial<GameConfig>;
  customRules?: Partial<CustomGameRules>;
  settings?: Partial<CustomRoom['settings']>;
}

// 加入房间请求（带密码）
export interface JoinRoomWithPasswordRequest {
  roomId: string;
  playerName: string;
  password?: string;            // 如果是私密房间需要提供
}

// 房间列表项（公开房间）
export interface PublicRoomInfo {
  id: string;
  name: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  hasPassword: boolean;         // 是否有密码（显示锁图标）
  status: 'waiting' | 'playing' | 'ended';
  gameMode: string;             // 游戏模式描述
  tags: string[];               // 房间标签（如 ['新手友好', '高手局']）
}

// 房间详情（加入后可见）
export interface RoomDetails {
  id: string;
  name: string;
  hostId: string;
  hostName: string;
  visibility: RoomVisibility;
  passwordHint?: string;        // 仅私密房间显示提示
  players: PlayerInfo[];
  maxPlayers: number;
  minPlayers: number;
  status: 'waiting' | 'playing' | 'ended';
  gameConfig: GameConfig;
  customRules: CustomGameRules;
  settings: CustomRoom['settings'];
  isHost: boolean;              // 当前用户是否是房主
}

export interface PlayerInfo {
  id: string;
  name: string;
  avatar: string;
  isHost: boolean;
  isReady: boolean;
  isConnected: boolean;
  joinedAt: Date;
}

// ==================== Socket 事件扩展 ====================

// 服务器 -> 客户端 新增事件
export interface CustomRoomServerEvents {
  // 房间设置更新
  'room:settings-updated': (data: {
    gameConfig: GameConfig;
    customRules: CustomGameRules;
    settings: CustomRoom['settings'];
  }) => void;
  
  // 玩家准备状态变更
  'room:player-ready': (data: { playerId: string; isReady: boolean }) => void;
  
  // 密码错误
  'room:password-required': (data: { message: string; hint?: string }) => void;
  
  // 密码验证失败
  'room:password-error': (data: { message: string }) => void;
  
  // 房间标签更新
  'room:tags-updated': (data: { tags: string[] }) => void;
}

// 客户端 -> 服务器 新增事件
export interface CustomRoomClientEvents {
  // 创建带密码的房间
  'room:create-custom': (data: CreateCustomRoomRequest) => void;
  
  // 加入带密码的房间
  'room:join-with-password': (data: JoinRoomWithPasswordRequest) => void;
  
  // 更新房间设置（仅房主）
  'room:update-settings': (data: {
    gameConfig?: Partial<GameConfig>;
    customRules?: Partial<CustomGameRules>;
    settings?: Partial<CustomRoom['settings']>;
  }) => void;
  
  // 设置/修改密码
  'room:set-password': (data: {
    password?: string;
    passwordHint?: string;
    removePassword?: boolean;
  }) => void;
  
  // 玩家准备/取消准备
  'room:ready': (isReady: boolean) => void;
  
  // 设置房间标签
  'room:set-tags': (tags: string[]) => void;
  
  // 踢出玩家（仅房主）
  'room:kick-player': (playerId: string) => void;
  
  // 转让房主（仅房主）
  'room:transfer-host': (playerId: string) => void;
}

// ==================== 默认配置 ====================

export const DEFAULT_CUSTOM_RULES: CustomGameRules = {
  roleSettings: {
    enableFox: true,
    enableDetective: false,
    enableGuard: false,
    overrideDogCount: 0,
    overrideFoxCount: 0,
  },
  mechanics: {
    playerSpeed: 1.0,
    visionRange: 1.0,
    ghostCanDoTasks: false,
    showPlayerNames: true,
    confirmKills: true,
  },
  taskSettings: {
    shortTasks: 3,
    longTasks: 1,
    commonTasks: 1,
    taskDifficulty: 'normal',
  },
  votingSettings: {
    votingMode: 'anonymous',
    tieBreaker: 'skip',
    allowSkip: true,
  },
  emergencySettings: {
    meetingsPerPlayer: 1,
    meetingCooldown: 15,
    buttonPosition: 'cafeteria',
  },
};

export const DEFAULT_ROOM_SETTINGS: CustomRoom['settings'] = {
  allowSpectators: false,
  allowFriendJoin: true,
  autoStart: false,
  autoStartDelay: 5,
};

// ==================== 预设规则模板 ====================

export const RULE_TEMPLATES: { name: string; description: string; rules: Partial<CustomGameRules> }[] = [
  {
    name: '经典模式',
    description: '标准游戏规则，平衡体验',
    rules: {},
  },
  {
    name: '快速模式',
    description: '快节奏游戏，击杀冷却短',
    rules: {
      mechanics: {
        playerSpeed: 1.3,
        visionRange: 1.2,
        ghostCanDoTasks: true,
        showPlayerNames: true,
        confirmKills: false,
      },
      taskSettings: {
        shortTasks: 2,
        longTasks: 0,
        commonTasks: 1,
        taskDifficulty: 'easy',
      },
      emergencySettings: {
        meetingsPerPlayer: 2,
        meetingCooldown: 10,
        buttonPosition: 'all',
      },
    },
  },
  {
    name: '隐藏身份',
    description: '不显示玩家名字，更难辨认',
    rules: {
      mechanics: {
        playerSpeed: 1.0,
        visionRange: 0.8,
        ghostCanDoTasks: false,
        showPlayerNames: false,
        confirmKills: true,
      },
    },
  },
  {
    name: '任务狂魔',
    description: '大量任务，猫咪的胜利之路',
    rules: {
      taskSettings: {
        shortTasks: 5,
        longTasks: 3,
        commonTasks: 2,
        taskDifficulty: 'hard',
      },
    },
  },
];

// ==================== 验证工具 ====================

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < 4) {
    return { valid: false, error: '密码至少需要4位' };
  }
  if (password.length > 20) {
    return { valid: false, error: '密码不能超过20位' };
  }
  return { valid: true };
}

export function hashPassword(password: string): string {
  // 简单哈希（生产环境应使用 bcrypt 等）
  // 这里使用 Base64 编码作为演示
  return Buffer.from(password).toString('base64');
}

export function verifyPassword(password: string, hashed: string): boolean {
  return hashPassword(password) === hashed;
}

export function sanitizeRoomForPublic(room: CustomRoom): PublicRoomInfo {
  const hostName = 'Unknown'; // 实际应从玩家数据获取
  return {
    id: room.id,
    name: room.name,
    hostName,
    playerCount: 0, // 实际应计算
    maxPlayers: room.maxPlayers,
    hasPassword: room.visibility === 'private' && !!room.password,
    status: room.status,
    gameMode: getGameModeDescription(room.customRules),
    tags: [], // 实际应从房间数据获取
  };
}

function getGameModeDescription(rules: CustomGameRules): string {
  if (rules.mechanics.playerSpeed > 1.1) return '快速模式';
  if (rules.taskSettings.shortTasks > 3) return '任务狂魔';
  if (!rules.mechanics.showPlayerNames) return '隐藏身份';
  return '经典模式';
}
