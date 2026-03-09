import mongoose, { Schema, Document } from 'mongoose';
import { SeasonTaskType } from './Season';

// ==================== 接口定义 ====================

/**
 * 用户任务进度
 */
export interface IUserTaskProgress {
  taskId: string;                   // 任务ID
  type: SeasonTaskType;             // 任务类型
  current: number;                  // 当前进度
  target: number;                   // 目标数量
  completed: boolean;               // 是否完成
  completedAt?: Date;               // 完成时间
  claimed: boolean;                 // 是否已领取奖励
  claimedAt?: Date;                 // 领取时间
  expiresAt: Date;                  // 过期时间（日/周任务）
}

/**
 * 已领取的奖励记录
 */
export interface IClaimedReward {
  level: number;                    // 等级
  isPremium: boolean;               // 是否为高级奖励
  claimedAt: Date;                  // 领取时间
  rewardType: string;               // 奖励类型
}

/**
 * 用户赛季数据文档接口
 */
export interface IUserSeason extends Document {
  userId: string;                   // 用户ID
  seasonId: string;                 // 赛季ID
  level: number;                    // 当前等级
  xp: number;                       // 当前经验值
  totalXp: number;                  // 本赛季总经验
  hasPremium: boolean;              // 是否购买高级通行证
  premiumPurchasedAt?: Date;        // 购买时间
  claimedRewards: IClaimedReward[]; // 已领取的奖励
  taskProgress: Map<string, IUserTaskProgress>; // 任务进度（taskId -> progress）
  lastActiveAt: Date;               // 最后活跃时间
  createdAt: Date;
  updatedAt: Date;
  
  // 方法
  addXp(amount: number): void;     // 添加经验
  getXpForNextLevel(): number;     // 获取升级所需经验
  canClaimReward(level: number, isPremium: boolean): boolean; // 检查是否可以领取奖励
  claimReward(level: number, isPremium: boolean): boolean; // 领取奖励
}

// ==================== Schema 定义 ====================

/**
 * 用户任务进度 Schema
 */
const UserTaskProgressSchema: Schema = new Schema({
  taskId: { type: String, required: true },
  type: { 
    type: String, 
    enum: Object.values(SeasonTaskType),
    required: true 
  },
  current: { type: Number, default: 0 },
  target: { type: Number, required: true },
  completed: { type: Boolean, default: false },
  completedAt: { type: Date, default: null },
  claimed: { type: Boolean, default: false },
  claimedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
}, { _id: false });

/**
 * 已领取奖励记录 Schema
 */
const ClaimedRewardSchema: Schema = new Schema({
  level: { type: Number, required: true },
  isPremium: { type: Boolean, required: true },
  claimedAt: { type: Date, required: true },
  rewardType: { type: String, required: true },
}, { _id: false });

/**
 * 用户赛季数据 Schema
 */
const UserSeasonSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    seasonId: {
      type: String,
      required: true,
      index: true,
    },
    level: {
      type: Number,
      default: 1,
      min: 1,
    },
    xp: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalXp: {
      type: Number,
      default: 0,
      min: 0,
    },
    hasPremium: {
      type: Boolean,
      default: false,
    },
    premiumPurchasedAt: {
      type: Date,
      default: null,
    },
    claimedRewards: {
      type: [ClaimedRewardSchema],
      default: [],
    },
    taskProgress: {
      type: Map,
      of: UserTaskProgressSchema,
      default: new Map(),
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// ==================== 索引 ====================

// 复合索引：每个用户每个赛季只有一条记录
UserSeasonSchema.index({ userId: 1, seasonId: 1 }, { unique: true });

// 排行榜索引：按等级和经验排序
UserSeasonSchema.index({ seasonId: 1, level: -1, xp: -1 });

// ==================== 方法 ====================

/**
 * 添加经验值
 */
UserSeasonSchema.methods.addXp = function(amount: number): void {
  this.xp += amount;
  this.totalXp += amount;
  
  // 检查升级（这里假设每级需要固定经验，实际可能根据等级递增）
  // 升级逻辑由 SeasonService 处理，这里只记录经验
};

/**
 * 获取升级所需经验
 * 基础公式：每级需要 1000 * level 经验
 */
UserSeasonSchema.methods.getXpForNextLevel = function(): number {
  return 1000 * this.level;
};

/**
 * 检查是否可以领取奖励
 */
UserSeasonSchema.methods.canClaimReward = function(level: number, isPremium: boolean): boolean {
  // 检查等级是否达到
  if (this.level < level) {
    return false;
  }
  
  // 检查是否为高级奖励且已购买通行证
  if (isPremium && !this.hasPremium) {
    return false;
  }
  
  // 检查是否已领取
  const alreadyClaimed = this.claimedRewards.some(
    (r: IClaimedReward) => r.level === level && r.isPremium === isPremium
  );
  
  return !alreadyClaimed;
};

/**
 * 领取奖励
 */
UserSeasonSchema.methods.claimReward = function(level: number, isPremium: boolean, rewardType: string): boolean {
  if (!this.canClaimReward(level, isPremium)) {
    return false;
  }
  
  this.claimedRewards.push({
    level,
    isPremium,
    claimedAt: new Date(),
    rewardType,
  });
  
  return true;
};

// ==================== 模型导出 ====================

export const UserSeason = mongoose.model<IUserSeason>('UserSeason', UserSeasonSchema);
export default UserSeason;
