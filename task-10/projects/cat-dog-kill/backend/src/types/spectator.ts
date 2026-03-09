// ==================== 观战模式类型定义 ====================

import { Player, Position, GameState, Role, Team } from './index';

/**
 * 观战者类型
 */
export interface Spectator {
  id: string;
  socketId: string;
  name: string;
  avatar: string;
  joinedAt: Date;
  isConnected: boolean;
  /** 当前跟随观看的玩家ID */
  followingPlayerId?: string;
  /** 自由视角位置 */
  freeCameraPosition?: Position;
}

/**
 * 观战模式设置
 */
export interface SpectatorConfig {
  /** 是否允许观战 */
  enabled: boolean;
  /** 最大观战人数 */
  maxSpectators: number;
  /** 观战延迟（秒）- 防止作弊 */
  delaySeconds: number;
  /** 是否显示角色信息 */
  revealRoles: boolean;
  /** 是否允许自由视角 */
  allowFreeCamera: boolean;
  /** 是否允许切换跟随玩家 */
  allowPlayerSwitch: boolean;
}

/**
 * 观战房间状态扩展
 */
export interface SpectatorRoomState {
  /** 观战者列表 */
  spectators: Map<string, Spectator>;
  /** 观战配置 */
  config: SpectatorConfig;
  /** 游戏历史记录（用于延迟播放） */
  gameHistory: GameHistoryEvent[];
}

/**
 * 游戏历史事件 - 用于观战延迟
 */
export interface GameHistoryEvent {
  id: string;
  type: GameHistoryEventType;
  timestamp: Date;
  data: any;
}

export type GameHistoryEventType =
  | 'player_moved'
  | 'player_killed'
  | 'task_completed'
  | 'sabotage_started'
  | 'sabotage_ended'
  | 'meeting_called'
  | 'vote_cast'
  | 'meeting_ended'
  | 'chat_message'
  | 'game_state_update';

/**
 * 观战者视角模式
 */
export enum SpectatorViewMode {
  /** 跟随特定玩家 */
  FOLLOW_PLAYER = 'follow_player',
  /** 自由视角 */
  FREE_CAMERA = 'free_camera',
  /** 自动切换 */
  AUTO_SWITCH = 'auto_switch',
}

/**
 * 观战者状态更新
 */
export interface SpectatorStateUpdate {
  /** 当前观战人数 */
  spectatorCount: number;
  /** 最大观战人数 */
  maxSpectators: number;
  /** 正在观战的玩家 */
  watchingPlayerId?: string;
  /** 当前视角模式 */
  viewMode: SpectatorViewMode;
}

/**
 * 观战者看到的游戏状态（脱敏版本）
 */
export interface SpectatorGameState {
  status: string;
  players: SpectatorPlayerView[];
  tasksCompleted: number;
  totalTasks: number;
  meetingsCalled: number;
  currentMeeting?: SpectatorMeetingView;
  winner?: Team;
  endReason?: string;
}

/**
 * 观战者看到的玩家信息
 */
export interface SpectatorPlayerView {
  id: string;
  name: string;
  avatar: string;
  isAlive: boolean;
  position: Position;
  completedTasks: number;
  totalTasks: number;
  /** 仅当revealRoles为true时显示 */
  role?: Role;
  team?: Team;
}

/**
 * 观战者看到的会议信息
 */
export interface SpectatorMeetingView {
  id: string;
  type: 'emergency' | 'body';
  callerName: string;
  isActive: boolean;
  votes: Map<string, string | null>;
  voteCount: Map<string, number>;
  timeRemaining: number;
}

// ==================== Socket 事件扩展 ====================

/**
 * 服务器 -> 观战客户端 事件
 */
export interface SpectatorServerEvents {
  /** 成功加入观战 */
  'spectator:joined': (data: {
    roomId: string;
    spectator: Spectator;
    players: SpectatorPlayerView[];
    gameState: SpectatorGameState;
    config: SpectatorConfig;
  }) => void;
  /** 观战状态更新 */
  'spectator:state': (state: SpectatorStateUpdate) => void;
  /** 游戏状态同步（延迟版本） */
  'spectator:game-state': (state: SpectatorGameState) => void;
  /** 玩家移动（延迟版本） */
  'spectator:player-moved': (data: { playerId: string; position: Position }) => void;
  /** 玩家死亡 */
  'spectator:player-killed': (data: { victimId: string; killerId?: string }) => void;
  /** 任务完成 */
  'spectator:task-completed': (data: { playerId: string; taskId: string }) => void;
  /** 会议召开 */
  'spectator:meeting-called': (data: { meeting: SpectatorMeetingView; callerName: string }) => void;
  /** 投票更新 */
  'spectator:vote-updated': (data: { voterId: string; targetId: string | null }) => void;
  /** 会议结果 */
  'spectator:meeting-result': (result: { ejectedId: string | null; wasImpostor: boolean }) => void;
  /** 会议结束 */
  'spectator:meeting-ended': () => void;
  /** 游戏结束 */
  'spectator:game-ended': (data: { winner: Team; reason: string }) => void;
  /** 新观战者加入 */
  'spectator:new': (data: { spectator: Spectator; count: number }) => void;
  /** 观战者离开 */
  'spectator:left': (data: { spectatorId: string; count: number }) => void;
  /** 聊天消息 */
  'spectator:chat': (message: { senderName: string; content: string; timestamp: Date }) => void;
  /** 错误 */
  'spectator:error': (error: { code: string; message: string }) => void;
}

/**
 * 观战客户端 -> 服务器 事件
 */
export interface SpectatorClientEvents {
  /** 请求观战 */
  'spectator:join': (data: { roomId: string; playerName: string }) => void;
  /** 离开观战 */
  'spectator:leave': () => void;
  /** 切换跟随玩家 */
  'spectator:follow-player': (playerId: string) => void;
  /** 切换到自由视角 */
  'spectator:free-camera': (position: Position) => void;
  /** 发送观战聊天消息 */
  'spectator:send-chat': (content: string) => void;
  /** 请求视角模式切换 */
  'spectator:set-view-mode': (mode: SpectatorViewMode) => void;
}
