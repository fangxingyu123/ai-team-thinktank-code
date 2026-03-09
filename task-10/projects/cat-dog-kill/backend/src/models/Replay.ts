import mongoose, { Schema, Document } from 'mongoose';
import { ReplayMetadata, ReplayData, AnyReplayEvent, Keyframe } from '../types/replay';

// ==================== MongoDB Schema 定义 ====================

// 位置子文档
const PositionSchema = new Schema({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
}, { _id: false });

// 回放玩家信息子文档
const ReplayPlayerInfoSchema = new Schema({
  playerId: { type: String, required: true },
  userId: { type: String, default: null },
  name: { type: String, required: true },
  avatar: { type: String, default: '' },
  role: { type: String, enum: ['cat', 'dog', 'fox'], required: true },
  team: { type: String, enum: ['cats', 'dogs', 'foxes'], required: true },
  isAlive: { type: Boolean, default: true },
  finalPosition: { type: PositionSchema, required: true },
  tasksCompleted: { type: Number, default: 0 },
  killCount: { type: Number, default: 0 },
}, { _id: false });

// 回放玩家结果子文档
const ReplayPlayerResultSchema = new Schema({
  playerId: { type: String, required: true },
  role: { type: String, enum: ['cat', 'dog', 'fox'], required: true },
  isWinner: { type: Boolean, required: true },
  survived: { type: Boolean, required: true },
  tasksCompleted: { type: Number, default: 0 },
  killCount: { type: Number, default: 0 },
}, { _id: false });

// 关键帧子文档
const KeyframeSchema = new Schema({
  timestamp: { type: Number, required: true },
  frameIndex: { type: Number, required: true },
  playerPositions: { type: Map, of: PositionSchema, default: {} },
  gameState: {
    status: { type: String, required: true },
    alivePlayers: { type: [String], default: [] },
    completedTasks: { type: [String], default: [] },
    activeSabotages: { type: [String], default: [] },
  },
}, { _id: false });

// 回放事件子文档（简化存储）
const ReplayEventSchema = new Schema({
  id: { type: String, required: true },
  type: { 
    type: String, 
    enum: [
      'game_start', 'game_end', 'player_spawn', 'player_move',
      'player_kill', 'player_death', 'task_complete', 'meeting_call',
      'meeting_end', 'vote_cast', 'player_ejected', 'sabotage_start',
      'sabotage_end', 'chat_message', 'role_reveal'
    ],
    required: true 
  },
  timestamp: { type: Number, required: true },
  frameIndex: { type: Number, required: true },
  // 事件特定数据（动态存储）
  data: { type: Schema.Types.Mixed, default: {} },
}, { _id: false });

// 主文档接口
export interface IReplay extends Document {
  // 基本信息
  replayId: string;
  roomId: string;
  gameId: string;
  
  // 地图信息
  mapId: string;
  mapName: string;
  
  // 时间信息
  startTime: Date;
  endTime: Date;
  duration: number; // 秒
  
  // 玩家信息
  players: mongoose.Types.Subdocument[];
  playerCount: number;
  
  // 游戏结果
  winner: 'cats' | 'dogs' | 'foxes';
  endReason: string;
  
  // 统计信息
  totalKills: number;
  totalTasksCompleted: number;
  totalMeetings: number;
  
  // 回放数据
  events: mongoose.Types.Subdocument[];
  keyframes: mongoose.Types.Subdocument[];
  eventCount: number;
  
  // 版本和存储
  version: string;
  recordedAt: Date;
  fileSize: number; // 字节
  
  // 访问控制
  isPublic: boolean;
  allowedUsers: string[]; // 可以查看的用户ID列表
  
  // 访问统计
  viewCount: number;
  lastViewedAt?: Date;
  
  // 软删除
  isDeleted: boolean;
  deletedAt?: Date;
  
  // 时间戳
  createdAt: Date;
  updatedAt: Date;
  
  // 方法
  toMetadata(): ReplayMetadata;
  toReplayData(): ReplayData;
  incrementViewCount(): Promise<void>;
}

// 主 Schema
const ReplaySchema = new Schema<IReplay>(
  {
    replayId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    roomId: {
      type: String,
      required: true,
      index: true,
    },
    gameId: {
      type: String,
      required: true,
      index: true,
    },
    mapId: {
      type: String,
      required: true,
      index: true,
    },
    mapName: {
      type: String,
      required: true,
    },
    startTime: {
      type: Date,
      required: true,
      index: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    duration: {
      type: Number,
      required: true,
      min: 0,
    },
    players: {
      type: [ReplayPlayerInfoSchema],
      required: true,
    },
    playerCount: {
      type: Number,
      required: true,
      min: 1,
    },
    winner: {
      type: String,
      enum: ['cats', 'dogs', 'foxes'],
      required: true,
      index: true,
    },
    endReason: {
      type: String,
      required: true,
    },
    totalKills: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalTasksCompleted: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalMeetings: {
      type: Number,
      default: 0,
      min: 0,
    },
    events: {
      type: [ReplayEventSchema],
      default: [],
    },
    keyframes: {
      type: [KeyframeSchema],
      default: [],
    },
    eventCount: {
      type: Number,
      default: 0,
    },
    version: {
      type: String,
      default: '1.0.0',
    },
    recordedAt: {
      type: Date,
      default: Date.now,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    isPublic: {
      type: Boolean,
      default: true,
      index: true,
    },
    allowedUsers: {
      type: [String],
      default: [],
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    lastViewedAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    // 优化查询性能
    collation: { locale: 'zh', strength: 2 },
  }
);

// 复合索引
ReplaySchema.index({ isDeleted: 1, isPublic: 1, startTime: -1 }); // 列表查询
ReplaySchema.index({ isDeleted: 1, 'players.userId': 1, startTime: -1 }); // 用户回放查询
ReplaySchema.index({ roomId: 1, gameId: 1 }); // 房间游戏查询
ReplaySchema.index({ mapId: 1, winner: 1 }); // 地图统计查询

// TTL 索引：自动删除旧回放（可选，根据业务需求调整）
// ReplaySchema.index({ recordedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); // 30天

// 虚拟字段：格式化时长
ReplaySchema.virtual('durationFormatted').get(function() {
  const minutes = Math.floor(this.duration / 60);
  const seconds = this.duration % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// 实例方法：转换为元数据对象
ReplaySchema.methods.toMetadata = function(): ReplayMetadata {
  return {
    id: this.replayId,
    roomId: this.roomId,
    gameId: this.gameId,
    mapId: this.mapId,
    mapName: this.mapName,
    startTime: this.startTime,
    endTime: this.endTime,
    duration: this.duration,
    players: this.players.map((p: any) => ({
      playerId: p.playerId,
      userId: p.userId,
      name: p.name,
      avatar: p.avatar,
      role: p.role,
      team: p.team,
      isAlive: p.isAlive,
      finalPosition: p.finalPosition,
      tasksCompleted: p.tasksCompleted,
      killCount: p.killCount,
    })),
    playerCount: this.playerCount,
    winner: this.winner,
    endReason: this.endReason,
    totalKills: this.totalKills,
    totalTasksCompleted: this.totalTasksCompleted,
    totalMeetings: this.totalMeetings,
    version: this.version,
    recordedAt: this.recordedAt,
    fileSize: this.fileSize,
  };
};

// 实例方法：转换为完整回放数据
ReplaySchema.methods.toReplayData = function(): ReplayData {
  return {
    metadata: this.toMetadata(),
    events: this.events.map((e: any) => ({
      id: e.id,
      type: e.type,
      timestamp: e.timestamp,
      frameIndex: e.frameIndex,
      ...e.data,
    })) as AnyReplayEvent[],
    keyframes: this.keyframes.map((k: any) => ({
      timestamp: k.timestamp,
      frameIndex: k.frameIndex,
      playerPositions: Object.fromEntries(k.playerPositions || new Map()),
      gameState: k.gameState,
    })),
  };
};

// 实例方法：增加查看次数
ReplaySchema.methods.incrementViewCount = async function(): Promise<void> {
  this.viewCount += 1;
  this.lastViewedAt = new Date();
  await this.save();
};

// 静态方法：根据查询条件获取列表
ReplaySchema.statics.findByQuery = async function(
  query: {
    page?: number;
    limit?: number;
    userId?: string;
    mapId?: string;
    winner?: string;
    startDate?: Date;
    endDate?: Date;
    sortBy?: string;
    sortOrder?: string;
  }
) {
  const {
    page = 1,
    limit = 20,
    userId,
    mapId,
    winner,
    startDate,
    endDate,
    sortBy = 'date',
    sortOrder = 'desc',
  } = query;

  // 构建查询条件
  const filter: any = { isDeleted: false };
  
  if (userId) {
    filter['players.userId'] = userId;
  }
  if (mapId) {
    filter.mapId = mapId;
  }
  if (winner) {
    filter.winner = winner;
  }
  if (startDate || endDate) {
    filter.startTime = {};
    if (startDate) filter.startTime.$gte = startDate;
    if (endDate) filter.startTime.$lte = endDate;
  }

  // 构建排序
  const sortFieldMap: Record<string, string> = {
    date: 'startTime',
    duration: 'duration',
    playerCount: 'playerCount',
  };
  const sortField = sortFieldMap[sortBy] || 'startTime';
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  // 执行查询
  const [replays, total] = await Promise.all([
    this.find(filter)
      .sort({ [sortField]: sortDirection })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    this.countDocuments(filter),
  ]);

  return {
    replays: replays.map((r: any) => ({
      id: r.replayId,
      roomId: r.roomId,
      gameId: r.gameId,
      mapId: r.mapId,
      mapName: r.mapName,
      startTime: r.startTime,
      endTime: r.endTime,
      duration: r.duration,
      players: r.players,
      playerCount: r.playerCount,
      winner: r.winner,
      endReason: r.endReason,
      totalKills: r.totalKills,
      totalTasksCompleted: r.totalTasksCompleted,
      totalMeetings: r.totalMeetings,
      version: r.version,
      recordedAt: r.recordedAt,
      fileSize: r.fileSize,
    })),
    total,
    page,
    limit,
    hasMore: total > page * limit,
  };
};

// 创建模型
export const Replay = mongoose.model<IReplay>('Replay', ReplaySchema);
export default Replay;
