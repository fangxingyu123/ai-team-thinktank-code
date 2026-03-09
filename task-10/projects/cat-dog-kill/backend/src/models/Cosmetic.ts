// ==================== 皮肤/装扮系统数据模型 ====================
// 文件: backend/src/models/Cosmetic.ts
// 说明: 定义皮肤、装扮物品的数据结构和数据库模型

import mongoose, { Schema, Document } from 'mongoose';

// ==================== 枚举类型 ====================

/**
 * 装扮品类
 */
export enum CosmeticCategory {
  SKIN = 'skin',           // 皮肤（角色外观）
  HAT = 'hat',             // 帽子
  PET = 'pet',             // 宠物
  ANIMATION = 'animation', // 动画/动作
  TRAIL = 'trail',         // 拖尾特效
  KILL_EFFECT = 'kill_effect', // 击杀特效
}

/**
 * 稀有度等级
 */
export enum Rarity {
  COMMON = 'common',       // 普通（白色）
  UNCOMMON = 'uncommon',   // 罕见（绿色）
  RARE = 'rare',           // 稀有（蓝色）
  EPIC = 'epic',           // 史诗（紫色）
  LEGENDARY = 'legendary', // 传说（橙色）
  MYTHIC = 'mythic',       // 神话（红色）
  LIMITED = 'limited',     // 限定（金色）
}

/**
 * 适用角色
 */
export enum ApplicableRole {
  ALL = 'all',             // 所有角色
  CAT = 'cat',             // 仅猫咪
  DOG = 'dog',             // 仅狗狗
  FOX = 'fox',             // 仅狐狸
  CREWMATE = 'crewmate',   // 仅好人阵营
  IMPOSTOR = 'impostor',   // 仅坏人阵营
}

/**
 * 获取方式
 */
export enum UnlockMethod {
  COINS = 'coins',         // 金币购买
  GEMS = 'gems',           // 宝石购买
  ACHIEVEMENT = 'achievement', // 成就解锁
  SEASON_PASS = 'season_pass', // 赛季通行证
  EVENT = 'event',         // 活动获取
  DEFAULT = 'default',     // 默认拥有
}

// ==================== 接口定义 ====================

/**
 * 装扮物品基础信息
 */
export interface ICosmeticBase {
  id: string;                    // 唯一标识
  name: string;                  // 名称
  description: string;           // 描述
  category: CosmeticCategory;    // 品类
  rarity: Rarity;                // 稀有度
  applicableRoles: ApplicableRole[]; // 适用角色
  iconUrl: string;               // 图标URL
  previewUrl: string;            // 预览图URL
  assetUrl: string;              // 资源文件URL
  unlockMethod: UnlockMethod;    // 获取方式
  price?: number;                // 价格（金币/宝石）
  achievementId?: string;        // 关联成就ID
  seasonId?: string;             // 关联赛季ID
  eventId?: string;              // 关联活动ID
  isLimited: boolean;            // 是否限时
  limitedEndTime?: Date;         // 限时结束时间
  createdAt: Date;               // 创建时间
  updatedAt: Date;               // 更新时间
}

/**
 * 用户拥有的装扮
 */
export interface IUserCosmetic {
  cosmeticId: string;            // 装扮ID
  acquiredAt: Date;              // 获得时间
  isEquipped: boolean;           // 是否已装备
  equipSlot?: string;            // 装备槽位
}

/**
 * 用户装扮库存（嵌入User文档）
 */
export interface IUserInventory {
  coins: number;                 // 金币
  gems: number;                  // 宝石
  ownedCosmetics: Map<string, IUserCosmetic>; // cosmeticId -> UserCosmetic
  equippedSkins: {               // 当前装备的皮肤
    [role: string]: string | null; // role -> cosmeticId
  };
  equippedHats: {                // 当前装备的帽子
    [role: string]: string | null;
  };
  equippedPets: {                // 当前装备的宠物
    [role: string]: string | null;
  };
  equippedAnimations: {          // 当前装备的动画
    [role: string]: string | null;
  };
  equippedTrails: {              // 当前装备的拖尾
    [role: string]: string | null;
  };
  equippedKillEffects: {         // 当前装备的击杀特效
    [role: string]: string | null;
  };
}

// ==================== MongoDB Schema ====================

/**
 * 装扮物品Schema
 */
const CosmeticSchema: Schema = new Schema(
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
      trim: true,
      maxlength: 50,
    },
    description: {
      type: String,
      required: true,
      maxlength: 200,
    },
    category: {
      type: String,
      enum: Object.values(CosmeticCategory),
      required: true,
      index: true,
    },
    rarity: {
      type: String,
      enum: Object.values(Rarity),
      required: true,
      index: true,
    },
    applicableRoles: {
      type: [String],
      enum: Object.values(ApplicableRole),
      default: [ApplicableRole.ALL],
    },
    iconUrl: {
      type: String,
      required: true,
    },
    previewUrl: {
      type: String,
      required: true,
    },
    assetUrl: {
      type: String,
      required: true,
    },
    unlockMethod: {
      type: String,
      enum: Object.values(UnlockMethod),
      required: true,
    },
    price: {
      type: Number,
      min: 0,
      default: null,
    },
    achievementId: {
      type: String,
      default: null,
      index: true,
    },
    seasonId: {
      type: String,
      default: null,
      index: true,
    },
    eventId: {
      type: String,
      default: null,
      index: true,
    },
    isLimited: {
      type: Boolean,
      default: false,
    },
    limitedEndTime: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * 用户装扮子Schema（嵌入User文档）
 */
const UserCosmeticSchema: Schema = new Schema({
  cosmeticId: {
    type: String,
    required: true,
  },
  acquiredAt: {
    type: Date,
    default: Date.now,
  },
  isEquipped: {
    type: Boolean,
    default: false,
  },
  equipSlot: {
    type: String,
    default: null,
  },
}, { _id: false });

// ==================== Model导出 ====================

export interface ICosmetic extends Document, ICosmeticBase {}

export const Cosmetic = mongoose.model<ICosmetic>('Cosmetic', CosmeticSchema);

// 导出子Schema供User模型使用
export { UserCosmeticSchema };

export default Cosmetic;
