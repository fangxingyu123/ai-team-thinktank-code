import mongoose, { Schema, Document } from 'mongoose';

// ==================== 赛季相关枚举 ====================

/**
 * 赛季状态
 */
export enum SeasonStatus {
  UPCOMING = 'upcoming',    // 即将开始
  ACTIVE = 'active',        // 进行中
  ENDED = 'ended',          // 已结束
}

/**
 * 奖励类型
 */
export enum RewardType {
  COINS = 'coins',          // 金币
  GEMS = 'gems',            // 宝石
  COSMETIC = 'cosmetic',    // 装扮
  TITLE = 'title',          // 称号
  FRAME = 'frame',          // 头像框
  EFFECT = 'effect',        // 特效
}

/**
 * 赛季任务类型
 */
export enum SeasonTaskType {
  PLAY_GAMES = 'play_games',           // 进行游戏
  WIN_GAMES = 'win_games',             // 赢得游戏
  COMPLETE_TASKS = 'complete_tasks',   // 完成任务
  KILL_PLAYERS = 'kill_players',       // 击杀玩家
  CALL_MEETINGS = 'call_meetings',     // 发起会议
  VOTE_CORRECTLY = 'vote_correctly',   // 正确投票
  SURVIVE_ROUNDS = 'survive_rounds',   // 存活回合
}

// ==================== 接口定义 ====================

/**
 * 赛季奖励项
 */
export interface ISeasonReward {
  level: number;                    // 等级要求
  type: RewardType;                 // 奖励类型
  amount?: number;                  // 数量（货币类）
  cosmeticId?: string;              // 装扮ID
  title?: string;                   // 称号文本
  frameUrl?: string;                // 头像框URL
  effectId?: string;                // 特效ID
  isPremium: boolean;               // 是否为高级通行证奖励
  iconUrl: string;                  // 奖励图标
  name: string;                     // 奖励名称
  description: string;              // 奖励描述
}

/**
 * 赛季任务
 */
export interface ISeasonTask {
  id: string;                       // 任务ID
  type: SeasonTaskType;             // 任务类型
  name: string;                     // 任务名称
  description: string;              // 任务描述
  target: number;                   // 目标数量
  xpReward: number;                 // 经验奖励
  refreshInterval: 'daily' | 'weekly' | 'season'; // 刷新周期
  iconUrl: string;                  // 任务图标
}

/**
 * 赛季文档接口
 */
export interface ISeason extends Document {
  id: string;                       // 赛季ID（如 "s1", "s2"）
  name: string;                     // 赛季名称
  description: string;              // 赛季描述
  theme: string;                    // 赛季主题
  status: SeasonStatus;             // 赛季状态
  startDate: Date;                  // 开始时间
  endDate: Date;                    // 结束时间
  maxLevel: number;                 // 最大等级
  xpPerLevel: number;               // 每级所需经验
  rewards: ISeasonReward[];         // 奖励列表
  tasks: ISeasonTask[];             // 任务列表
  premiumPrice: number;             // 高级通行证价格（宝石）
  createdAt: Date;
  updatedAt: Date;
}

// ==================== Schema 定义 ====================

/**
 * 赛季奖励项 Schema
 */
const SeasonRewardSchema: Schema = new Schema({
  level: { type: Number, required: true },
  type: { 
    type: String, 
    enum: Object.values(RewardType),
    required: true 
  },
  amount: { type: Number, default: null },
  cosmeticId: { type: String, default: null },
  title: { type: String, default: null },
  frameUrl: { type: String, default: null },
  effectId: { type: String, default: null },
  isPremium: { type: Boolean, default: false },
  iconUrl: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
}, { _id: false });

/**
 * 赛季任务 Schema
 */
const SeasonTaskSchema: Schema = new Schema({
  id: { type: String, required: true },
  type: { 
    type: String, 
    enum: Object.values(SeasonTaskType),
    required: true 
  },
  name: { type: String, required: true },
  description: { type: String, required: true },
  target: { type: Number, required: true },
  xpReward: { type: Number, required: true },
  refreshInterval: { 
    type: String, 
    enum: ['daily', 'weekly', 'season'],
    required: true 
  },
  iconUrl: { type: String, required: true },
}, { _id: false });

/**
 * 赛季 Schema
 */
const SeasonSchema: Schema = new Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    theme: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(SeasonStatus),
      default: SeasonStatus.UPCOMING,
      index: true,
    },
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    endDate: {
      type: Date,
      required: true,
      index: true,
    },
    maxLevel: {
      type: Number,
      default: 100,
    },
    xpPerLevel: {
      type: Number,
      default: 1000,
    },
    rewards: {
      type: [SeasonRewardSchema],
      default: [],
    },
    tasks: {
      type: [SeasonTaskSchema],
      default: [],
    },
    premiumPrice: {
      type: Number,
      default: 990, // 默认990宝石
    },
  },
  {
    timestamps: true,
  }
);

// ==================== 索引 ====================

// 复合索引：查找进行中的赛季
SeasonSchema.index({ status: 1, startDate: -1 });

// ==================== 模型导出 ====================

export const Season = mongoose.model<ISeason>('Season', SeasonSchema);
export default Season;
