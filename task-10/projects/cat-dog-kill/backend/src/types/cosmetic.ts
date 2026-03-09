// ==================== 皮肤/装扮系统类型定义 ====================
// 文件: backend/src/types/cosmetic.ts
// 说明: Socket 事件类型定义

import { CosmeticCategory, Rarity, UnlockMethod, ApplicableRole } from '../models/Cosmetic';

// ==================== Socket 事件 ====================

/**
 * 服务器 -> 客户端事件
 */
export interface CosmeticServerEvents {
  // 商店更新
  'cosmetic:shop-updated': (data: {
    newItems: string[];  // 新上架的商品ID
    limitedEnding: string[];  // 即将下架的限时商品
  }) => void;

  // 购买成功
  'cosmetic:purchase-success': (data: {
    cosmeticId: string;
    cosmeticName: string;
    newBalance: {
      coins: number;
      gems: number;
    };
  }) => void;

  // 装备更新
  'cosmetic:equipped-updated': (data: {
    category: string;
    role: string;
    cosmeticId: string | null;
    cosmeticName: string | null;
  }) => void;

  // 货币更新
  'cosmetic:balance-updated': (data: {
    coins: number;
    gems: number;
    change: {
      type: 'coins' | 'gems';
      amount: number;
      reason: string;
    };
  }) => void;

  // 获得新装扮（通过成就、活动等）
  'cosmetic:acquired': (data: {
    cosmeticId: string;
    cosmeticName: string;
    category: CosmeticCategory;
    rarity: Rarity;
    source: 'purchase' | 'achievement' | 'event' | 'season_pass' | 'reward';
  }) => void;
}

/**
 * 客户端 -> 服务器事件
 */
export interface CosmeticClientEvents {
  // 请求商店数据
  'cosmetic:get-shop': (data: {
    category?: CosmeticCategory;
    rarity?: Rarity;
    page?: number;
    limit?: number;
  }) => void;

  // 购买装扮
  'cosmetic:purchase': (data: {
    cosmeticId: string;
  }) => void;

  // 装备装扮
  'cosmetic:equip': (data: {
    cosmeticId: string;
    role?: string;
  }) => void;

  // 卸下装扮
  'cosmetic:unequip': (data: {
    category: CosmeticCategory;
    role?: string;
  }) => void;

  // 获取当前装备
  'cosmetic:get-equipped': () => void;

  // 获取库存
  'cosmetic:get-inventory': (data: {
    category?: CosmeticCategory;
  }) => void;

  // 预览装扮（游戏中实时预览）
  'cosmetic:preview': (data: {
    cosmeticId: string;
  }) => void;
}

// ==================== API 响应类型 ====================

/**
 * 装扮展示信息
 */
export interface CosmeticDisplay {
  id: string;
  name: string;
  description: string;
  category: CosmeticCategory;
  rarity: Rarity;
  iconUrl: string;
  previewUrl: string;
  unlockMethod: UnlockMethod;
  price: number | null;
  currency: 'coins' | 'gems' | null;
  isOwned: boolean;
  isEquipped: boolean;
  isLimited: boolean;
  limitedEndTime?: Date;
  applicableRoles: ApplicableRole[];
}

/**
 * 玩家装扮信息（游戏中使用）
 */
export interface PlayerCosmeticInfo {
  playerId: string;
  role: string;
  cosmetics: {
    skin?: CosmeticDisplay;
    hat?: CosmeticDisplay;
    pet?: CosmeticDisplay;
    animation?: CosmeticDisplay;
    trail?: CosmeticDisplay;
    killEffect?: CosmeticDisplay;
  };
}

/**
 * 装扮变化事件（用于游戏内同步）
 */
export interface CosmeticChangeEvent {
  playerId: string;
  category: string;
  cosmeticId: string | null;
  cosmeticData?: CosmeticDisplay;
}
