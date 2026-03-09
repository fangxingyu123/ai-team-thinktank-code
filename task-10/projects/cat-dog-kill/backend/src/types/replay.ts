// ==================== 回放系统类型定义 ====================

import { Position, Role, Team, TaskType } from './index';

// 回放元数据
export interface ReplayMetadata {
  id: string;                    // 回放唯一ID
  roomId: string;                // 房间ID
  gameId: string;                // 游戏ID（同一房间可能有多个游戏）
  mapId: string;                 // 地图ID
  mapName: string;               // 地图名称
  
  // 时间信息
  startTime: Date;               // 游戏开始时间
  endTime: Date;                 // 游戏结束时间
  duration: number;              // 游戏时长（秒）
  
  // 玩家信息
  players: ReplayPlayerInfo[];   // 参与玩家列表
  playerCount: number;           // 玩家总数
  
  // 游戏结果
  winner: Team;                  // 获胜方
  endReason: string;             // 结束原因
  
  // 统计信息
  totalKills: number;            // 总击杀数
  totalTasksCompleted: number;   // 完成任务数
  totalMeetings: number;         // 会议次数
  
  // 录制信息
  version: string;               // 回放格式版本
  recordedAt: Date;              // 录制时间
  fileSize?: number;             // 文件大小（字节）
}

// 回放中的玩家信息
export interface ReplayPlayerInfo {
  playerId: string;              // 玩家ID
  userId?: string;               // 用户ID（登录用户）
  name: string;                  // 玩家名称
  avatar: string;                // 头像
  role: Role;                    // 角色
  team: Team;                    // 阵营
  isAlive: boolean;              // 最终存活状态
  finalPosition: Position;       // 最终位置
  tasksCompleted: number;        // 完成任务数
  killCount: number;             // 击杀数（仅狗狗）
}

// 回放事件类型
export type ReplayEventType = 
  | 'game_start'           // 游戏开始
  | 'game_end'             // 游戏结束
  | 'player_spawn'         // 玩家出生
  | 'player_move'          // 玩家移动
  | 'player_kill'          // 玩家击杀
  | 'player_death'         // 玩家死亡
  | 'task_complete'        // 完成任务
  | 'meeting_call'         // 召开会议
  | 'meeting_end'          // 会议结束
  | 'vote_cast'            // 投票
  | 'player_ejected'       // 玩家被投出
  | 'sabotage_start'       // 破坏开始
  | 'sabotage_end'         // 破坏结束
  | 'chat_message'         // 聊天消息
  | 'role_reveal';         // 角色揭示（游戏结束时）

// 回放事件基础接口
export interface ReplayEvent {
  id: string;                    // 事件ID
  type: ReplayEventType;         // 事件类型
  timestamp: number;             // 时间戳（相对于游戏开始，毫秒）
  frameIndex: number;            // 帧序号
}

// 游戏开始事件
export interface GameStartEvent extends ReplayEvent {
  type: 'game_start';
  mapId: string;
  mapName: string;
  players: ReplayPlayerInfo[];
}

// 游戏结束事件
export interface GameEndEvent extends ReplayEvent {
  type: 'game_end';
  winner: Team;
  reason: string;
  playerResults: ReplayPlayerResult[];
}

// 玩家出生事件
export interface PlayerSpawnEvent extends ReplayEvent {
  type: 'player_spawn';
  playerId: string;
  position: Position;
  role: Role;
}

// 玩家移动事件（批量优化）
export interface PlayerMoveEvent extends ReplayEvent {
  type: 'player_move';
  playerId: string;
  position: Position;
  velocity?: Position;           // 速度向量（用于平滑插值）
}

// 玩家击杀事件
export interface PlayerKillEvent extends ReplayEvent {
  type: 'player_kill';
  killerId: string;
  victimId: string;
  position: Position;
}

// 玩家死亡事件
export interface PlayerDeathEvent extends ReplayEvent {
  type: 'player_death';
  playerId: string;
  position: Position;
  reason: 'killed' | 'ejected';
  killerId?: string;
}

// 任务完成事件
export interface TaskCompleteEvent extends ReplayEvent {
  type: 'task_complete';
  playerId: string;
  taskId: string;
  taskType: TaskType;
  position: Position;
}

// 召开会议事件
export interface MeetingCallEvent extends ReplayEvent {
  type: 'meeting_call';
  meetingId: string;
  callerId: string;
  bodyId?: string;               // 如果是报告尸体
  position: Position;
  playerPositions: Record<string, Position>; // 所有玩家位置快照
}

// 会议结束事件
export interface MeetingEndEvent extends ReplayEvent {
  type: 'meeting_end';
  meetingId: string;
  ejectedId: string | null;
  wasImpostor: boolean;
  voteResults: Record<string, string | null>; // voterId -> targetId
}

// 投票事件
export interface VoteCastEvent extends ReplayEvent {
  type: 'vote_cast';
  meetingId: string;
  voterId: string;
  targetId: string | null;
}

// 玩家被投出事件
export interface PlayerEjectedEvent extends ReplayEvent {
  type: 'player_ejected';
  playerId: string;
  wasImpostor: boolean;
}

// 破坏开始事件
export interface SabotageStartEvent extends ReplayEvent {
  type: 'sabotage_start';
  sabotageId: string;
  sabotageType: string;
  startedBy: string;
  position: Position;
}

// 破坏结束事件
export interface SabotageEndEvent extends ReplayEvent {
  type: 'sabotage_end';
  sabotageId: string;
  fixedBy?: string;
}

// 聊天消息事件
export interface ChatMessageEvent extends ReplayEvent {
  type: 'chat_message';
  senderId: string;
  senderName: string;
  content: string;
  chatType: 'lobby' | 'game' | 'ghost' | 'meeting';
}

// 角色揭示事件（游戏结束）
export interface RoleRevealEvent extends ReplayEvent {
  type: 'role_reveal';
  reveals: Record<string, Role>; // playerId -> role
}

// 联合类型：所有回放事件
export type AnyReplayEvent =
  | GameStartEvent
  | GameEndEvent
  | PlayerSpawnEvent
  | PlayerMoveEvent
  | PlayerKillEvent
  | PlayerDeathEvent
  | TaskCompleteEvent
  | MeetingCallEvent
  | MeetingEndEvent
  | VoteCastEvent
  | PlayerEjectedEvent
  | SabotageStartEvent
  | SabotageEndEvent
  | ChatMessageEvent
  | RoleRevealEvent;

// 回放数据包（用于传输和存储）
export interface ReplayData {
  metadata: ReplayMetadata;
  events: AnyReplayEvent[];
  keyframes: Keyframe[];         // 关键帧（用于快速跳转）
}

// 关键帧（用于快速定位）
export interface Keyframe {
  timestamp: number;             // 时间戳
  frameIndex: number;            // 帧序号
  playerPositions: Record<string, Position>; // 所有玩家位置
  gameState: KeyframeGameState;  // 游戏状态快照
}

// 关键帧游戏状态
export interface KeyframeGameState {
  status: string;
  alivePlayers: string[];        // 存活的玩家ID列表
  completedTasks: string[];      // 已完成的任务ID
  activeSabotages: string[];     // 活跃的破坏ID
}

// 回放玩家结果
export interface ReplayPlayerResult {
  playerId: string;
  role: Role;
  isWinner: boolean;
  survived: boolean;
  tasksCompleted: number;
  killCount: number;
}

// 回放列表查询参数
export interface ReplayListQuery {
  page?: number;
  limit?: number;
  userId?: string;               // 按用户筛选
  mapId?: string;                // 按地图筛选
  winner?: Team;                 // 按获胜方筛选
  startDate?: Date;              // 开始日期
  endDate?: Date;                // 结束日期
  sortBy?: 'date' | 'duration' | 'playerCount';
  sortOrder?: 'asc' | 'desc';
}

// 回放列表响应
export interface ReplayListResponse {
  replays: ReplayMetadata[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// 回放播放状态
export interface ReplayPlaybackState {
  isPlaying: boolean;
  currentTime: number;           // 当前播放时间（毫秒）
  totalDuration: number;         // 总时长（毫秒）
  playbackSpeed: number;         // 播放速度（0.5x, 1x, 2x, 4x）
  currentFrame: number;          // 当前帧
  totalFrames: number;           // 总帧数
}

// 回放播放器设置
export interface ReplayPlayerSettings {
  showRoles: boolean;            // 是否显示角色（剧透模式）
  showChat: boolean;             // 是否显示聊天
  showFogOfWar: boolean;         // 是否显示战争迷雾（仅显示存活玩家视野）
  followPlayerId?: string;       // 跟随特定玩家
  playbackSpeed: number;
}

// 回放存储选项
export interface ReplayStorageOptions {
  maxReplayAge: number;          // 最大保存时间（天）
  maxReplaySize: number;         // 最大单个回放大小（MB）
  maxTotalSize: number;          // 最大总存储（GB）
  compressionEnabled: boolean;   // 是否启用压缩
}

// Socket 事件
export interface ReplayServerEvents {
  'replay:list': (data: ReplayListResponse) => void;
  'replay:detail': (data: ReplayMetadata) => void;
  'replay:data': (data: ReplayData) => void;
  'replay:playback-state': (state: ReplayPlaybackState) => void;
  'replay:event': (event: AnyReplayEvent) => void;
  'replay:progress': (data: { currentTime: number; totalTime: number }) => void;
  'replay:error': (error: { code: string; message: string }) => void;
}

export interface ReplayClientEvents {
  'replay:get-list': (query: ReplayListQuery) => void;
  'replay:get-detail': (replayId: string) => void;
  'replay:load': (replayId: string) => void;
  'replay:play': () => void;
  'replay:pause': () => void;
  'replay:seek': (timestamp: number) => void;
  'replay:set-speed': (speed: number) => void;
  'replay:follow-player': (playerId: string | null) => void;
  'replay:disconnect': () => void;
}
