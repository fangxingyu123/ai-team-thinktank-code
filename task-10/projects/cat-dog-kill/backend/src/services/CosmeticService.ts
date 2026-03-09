// ==================== 皮肤/装扮系统服务层 ====================
// 文件: backend/src/services/CosmeticService.ts
// 说明: 处理皮肤/装扮相关的业务逻辑

import { Cosmetic, ICosmetic, CosmeticCategory, Rarity, UnlockMethod, ApplicableRole } from '../models/Cosmetic';
import { User, IUser } from '../models/User';

// ==================== 类型定义 ====================

/**
 * 商店筛选条件
 */
export interface ShopFilter {
  category?: CosmeticCategory;
  rarity?: Rarity;
  role?: ApplicableRole;
  unlockMethod?: UnlockMethod;
  searchQuery?: string;
  isLimited?: boolean;
}

/**
 * 购买结果
 */
export interface PurchaseResult {
  success: boolean;
  cosmetic?: ICosmetic;
  error?: string;
  newBalance?: {
    coins: number;
    gems: number;
  };
}

/**
 * 装备结果
 */
export interface EquipResult {
  success: boolean;
  error?: string;
  equippedCosmetics?: { [slot: string]: string | null };
}

/**
 * 用户装扮展示信息
 */
export interface UserCosmeticDisplay {
  cosmeticId: string;
  name: string;
  category: CosmeticCategory;
  rarity: Rarity;
  iconUrl: string;
  isEquipped: boolean;
  acquiredAt: Date;
}

/**
 * 商店商品展示信息
 */
export interface ShopItemDisplay {
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
  isLimited: boolean;
  limitedEndTime?: Date;
  applicableRoles: ApplicableRole[];
}

// ==================== 服务类 ====================

export class CosmeticService {
  private static instance: CosmeticService;

  private constructor() {}

  public static getInstance(): CosmeticService {
    if (!CosmeticService.instance) {
      CosmeticService.instance = new CosmeticService();
    }
    return CosmeticService.instance;
  }

  // ==================== 商店相关 ====================

  /**
   * 获取商店商品列表
   * @param userId 用户ID（用于检查是否已拥有）
   * @param filter 筛选条件
   * @param page 页码
   * @param limit 每页数量
   */
  async getShopItems(
    userId: string,
    filter: ShopFilter = {},
    page: number = 1,
    limit: number = 20
  ): Promise<{ items: ShopItemDisplay[]; total: number; hasMore: boolean }> {
    try {
      // 构建查询条件
      const query: any = {};
      
      if (filter.category) {
        query.category = filter.category;
      }
      if (filter.rarity) {
        query.rarity = filter.rarity;
      }
      if (filter.unlockMethod) {
        query.unlockMethod = filter.unlockMethod;
      }
      if (filter.isLimited !== undefined) {
        query.isLimited = filter.isLimited;
      }
      if (filter.role) {
        query.applicableRoles = { $in: [filter.role, ApplicableRole.ALL] };
      }
      if (filter.searchQuery) {
        query.$or = [
          { name: { $regex: filter.searchQuery, $options: 'i' } },
          { description: { $regex: filter.searchQuery, $options: 'i' } },
        ];
      }

      // 获取用户拥有的装扮
      const user = await User.findById(userId).select('inventory.ownedCosmetics');
      const ownedCosmeticIds = new Set(
        user?.inventory?.ownedCosmetics?.keys() || []
      );

      // 查询商品
      const skip = (page - 1) * limit;
      const [cosmetics, total] = await Promise.all([
        Cosmetic.find(query)
          .sort({ rarity: 1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Cosmetic.countDocuments(query),
      ]);

      // 转换为展示格式
      const items: ShopItemDisplay[] = cosmetics.map((cosmetic) => ({
        id: cosmetic.id,
        name: cosmetic.name,
        description: cosmetic.description,
        category: cosmetic.category,
        rarity: cosmetic.rarity,
        iconUrl: cosmetic.iconUrl,
        previewUrl: cosmetic.previewUrl,
        unlockMethod: cosmetic.unlockMethod,
        price: cosmetic.price || null,
        currency: this.getCurrencyByUnlockMethod(cosmetic.unlockMethod),
        isOwned: ownedCosmeticIds.has(cosmetic.id),
        isLimited: cosmetic.isLimited,
        limitedEndTime: cosmetic.limitedEndTime,
        applicableRoles: cosmetic.applicableRoles,
      }));

      return {
        items,
        total,
        hasMore: skip + items.length < total,
      };
    } catch (error) {
      console.error('获取商店商品失败:', error);
      throw new Error('获取商店商品失败');
    }
  }

  /**
   * 获取单个商品详情
   */
  async getCosmeticDetail(
    cosmeticId: string,
    userId: string
  ): Promise<ShopItemDisplay | null> {
    try {
      const [cosmetic, user] = await Promise.all([
        Cosmetic.findOne({ id: cosmeticId }).lean(),
        User.findById(userId).select('inventory.ownedCosmetics'),
      ]);

      if (!cosmetic) return null;

      const ownedCosmeticIds = new Set(
        user?.inventory?.ownedCosmetics?.keys() || []
      );

      return {
        id: cosmetic.id,
        name: cosmetic.name,
        description: cosmetic.description,
        category: cosmetic.category,
        rarity: cosmetic.rarity,
        iconUrl: cosmetic.iconUrl,
        previewUrl: cosmetic.previewUrl,
        unlockMethod: cosmetic.unlockMethod,
        price: cosmetic.price || null,
        currency: this.getCurrencyByUnlockMethod(cosmetic.unlockMethod),
        isOwned: ownedCosmeticIds.has(cosmetic.id),
        isLimited: cosmetic.isLimited,
        limitedEndTime: cosmetic.limitedEndTime,
        applicableRoles: cosmetic.applicableRoles,
      };
    } catch (error) {
      console.error('获取商品详情失败:', error);
      throw new Error('获取商品详情失败');
    }
  }

  // ==================== 购买相关 ====================

  /**
   * 购买装扮
   * @param userId 用户ID
   * @param cosmeticId 装扮ID
   */
  async purchaseCosmetic(userId: string, cosmeticId: string): Promise<PurchaseResult> {
    try {
      // 获取装扮信息
      const cosmetic = await Cosmetic.findOne({ id: cosmeticId });
      if (!cosmetic) {
        return { success: false, error: '商品不存在' };
      }

      // 检查是否限时商品已过期
      if (cosmetic.isLimited && cosmetic.limitedEndTime && cosmetic.limitedEndTime < new Date()) {
        return { success: false, error: '该限时商品已下架' };
      }

      // 获取用户信息
      const user = await User.findById(userId);
      if (!user) {
        return { success: false, error: '用户不存在' };
      }

      // 检查是否已拥有
      if (user.inventory?.ownedCosmetics?.has(cosmeticId)) {
        return { success: false, error: '您已拥有该商品' };
      }

      // 检查获取方式
      if (cosmetic.unlockMethod === UnlockMethod.DEFAULT) {
        return { success: false, error: '默认商品无需购买' };
      }

      if (cosmetic.unlockMethod === UnlockMethod.ACHIEVEMENT) {
        return { success: false, error: '该商品需要通过成就解锁' };
      }

      if (cosmetic.unlockMethod === UnlockMethod.EVENT) {
        return { success: false, error: '该商品需要通过活动获取' };
      }

      // 检查货币余额
      const price = cosmetic.price || 0;
      if (cosmetic.unlockMethod === UnlockMethod.COINS) {
        if ((user.inventory?.coins || 0) < price) {
          return { success: false, error: '金币不足' };
        }
        user.inventory = user.inventory || { coins: 0, gems: 0, ownedCosmetics: new Map() };
        user.inventory.coins -= price;
      } else if (cosmetic.unlockMethod === UnlockMethod.GEMS) {
        if ((user.inventory?.gems || 0) < price) {
          return { success: false, error: '宝石不足' };
        }
        user.inventory = user.inventory || { coins: 0, gems: 0, ownedCosmetics: new Map() };
        user.inventory.gems -= price;
      }

      // 添加到库存
      user.inventory.ownedCosmetics = user.inventory.ownedCosmetics || new Map();
      user.inventory.ownedCosmetics.set(cosmeticId, {
        cosmeticId,
        acquiredAt: new Date(),
        isEquipped: false,
      });

      await user.save();

      return {
        success: true,
        cosmetic,
        newBalance: {
          coins: user.inventory.coins,
          gems: user.inventory.gems,
        },
      };
    } catch (error) {
      console.error('购买装扮失败:', error);
      return { success: false, error: '购买失败，请稍后重试' };
    }
  }

  // ==================== 装备相关 ====================

  /**
   * 装备/卸下装扮
   * @param userId 用户ID
   * @param cosmeticId 装扮ID
   * @param role 角色（用于角色特定装备）
   */
  async equipCosmetic(
    userId: string,
    cosmeticId: string | null,
    role: string = 'all'
  ): Promise<EquipResult> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return { success: false, error: '用户不存在' };
      }

      // 初始化库存结构
      user.inventory = user.inventory || {
        coins: 0,
        gems: 0,
        ownedCosmetics: new Map(),
        equippedSkins: {},
        equippedHats: {},
        equippedPets: {},
        equippedAnimations: {},
        equippedTrails: {},
        equippedKillEffects: {},
      };

      // 如果cosmeticId为null，表示卸下当前装备
      if (!cosmeticId) {
        // 需要知道卸下哪个品类的装备
        return { success: false, error: '请指定要卸下的装扮品类' };
      }

      // 检查是否拥有该装扮
      if (!user.inventory.ownedCosmetics?.has(cosmeticId)) {
        return { success: false, error: '您未拥有该装扮' };
      }

      // 获取装扮信息
      const cosmetic = await Cosmetic.findOne({ id: cosmeticId });
      if (!cosmetic) {
        return { success: false, error: '装扮不存在' };
      }

      // 检查角色适用性
      if (!this.isRoleApplicable(cosmetic.applicableRoles, role)) {
        return { success: false, error: '该装扮不适用于此角色' };
      }

      // 获取装备槽位
      const equipSlot = this.getEquipSlotByCategory(cosmetic.category);

      // 更新装备状态
      const equippedMap = this.getEquippedMapByCategory(user.inventory, cosmetic.category);
      
      // 卸下之前的装备
      const previousEquippedId = equippedMap[role];
      if (previousEquippedId) {
        const previousCosmetic = user.inventory.ownedCosmetics.get(previousEquippedId);
        if (previousCosmetic) {
          previousCosmetic.isEquipped = false;
        }
      }

      // 装备新装扮
      equippedMap[role] = cosmeticId;
      const userCosmetic = user.inventory.ownedCosmetics.get(cosmeticId);
      if (userCosmetic) {
        userCosmetic.isEquipped = true;
        userCosmetic.equipSlot = role;
      }

      await user.save();

      return {
        success: true,
        equippedCosmetics: equippedMap,
      };
    } catch (error) {
      console.error('装备装扮失败:', error);
      return { success: false, error: '装备失败，请稍后重试' };
    }
  }

  /**
   * 卸下装扮
   */
  async unequipCosmetic(
    userId: string,
    category: CosmeticCategory,
    role: string = 'all'
  ): Promise<EquipResult> {
    try {
      const user = await User.findById(userId);
      if (!user || !user.inventory) {
        return { success: false, error: '用户不存在' };
      }

      const equippedMap = this.getEquippedMapByCategory(user.inventory, category);
      const equippedId = equippedMap[role];

      if (equippedId) {
        // 更新装备状态
        const userCosmetic = user.inventory.ownedCosmetics?.get(equippedId);
        if (userCosmetic) {
          userCosmetic.isEquipped = false;
          userCosmetic.equipSlot = undefined;
        }

        // 清空装备槽
        equippedMap[role] = null;
        await user.save();
      }

      return {
        success: true,
        equippedCosmetics: equippedMap,
      };
    } catch (error) {
      console.error('卸下装扮失败:', error);
      return { success: false, error: '卸下失败，请稍后重试' };
    }
  }

  /**
   * 获取用户当前装备
   */
  async getEquippedCosmetics(userId: string): Promise<{ [category: string]: { [role: string]: string | null } }> {
    try {
      const user = await User.findById(userId).select('inventory');
      if (!user || !user.inventory) {
        return {};
      }

      return {
        skins: user.inventory.equippedSkins || {},
        hats: user.inventory.equippedHats || {},
        pets: user.inventory.equippedPets || {},
        animations: user.inventory.equippedAnimations || {},
        trails: user.inventory.equippedTrails || {},
        killEffects: user.inventory.equippedKillEffects || {},
      };
    } catch (error) {
      console.error('获取装备信息失败:', error);
      return {};
    }
  }

  // ==================== 库存相关 ====================

  /**
   * 获取用户库存
   */
  async getUserInventory(
    userId: string,
    category?: CosmeticCategory
  ): Promise<{ cosmetics: UserCosmeticDisplay[]; balance: { coins: number; gems: number } }> {
    try {
      const user = await User.findById(userId).select('inventory');
      if (!user || !user.inventory) {
        return { cosmetics: [], balance: { coins: 0, gems: 0 } };
      }

      const ownedCosmetics = user.inventory.ownedCosmetics || new Map();
      const cosmeticIds = Array.from(ownedCosmetics.keys());

      // 如果指定了品类，先获取所有装扮信息再筛选
      const cosmetics = await Cosmetic.find({
        id: { $in: cosmeticIds },
        ...(category && { category }),
      }).lean();

      const cosmeticMap = new Map(cosmetics.map(c => [c.id, c]));

      const displayCosmetics: UserCosmeticDisplay[] = cosmeticIds
        .map(id => {
          const cosmetic = cosmeticMap.get(id);
          const userCosmetic = ownedCosmetics.get(id);
          if (!cosmetic || !userCosmetic) return null;

          return {
            cosmeticId: id,
            name: cosmetic.name,
            category: cosmetic.category,
            rarity: cosmetic.rarity,
            iconUrl: cosmetic.iconUrl,
            isEquipped: userCosmetic.isEquipped,
            acquiredAt: userCosmetic.acquiredAt,
          };
        })
        .filter((c): c is UserCosmeticDisplay => c !== null);

      return {
        cosmetics: displayCosmetics,
        balance: {
          coins: user.inventory.coins || 0,
          gems: user.inventory.gems || 0,
        },
      };
    } catch (error) {
      console.error('获取用户库存失败:', error);
      return { cosmetics: [], balance: { coins: 0, gems: 0 } };
    }
  }

  /**
   * 获取用户货币余额
   */
  async getUserBalance(userId: string): Promise<{ coins: number; gems: number }> {
    try {
      const user = await User.findById(userId).select('inventory.coins inventory.gems');
      return {
        coins: user?.inventory?.coins || 0,
        gems: user?.inventory?.gems || 0,
      };
    } catch (error) {
      console.error('获取用户余额失败:', error);
      return { coins: 0, gems: 0 };
    }
  }

  /**
   * 增加货币（用于奖励、充值等）
   */
  async addCurrency(
    userId: string,
    type: 'coins' | 'gems',
    amount: number
  ): Promise<boolean> {
    try {
      const updateField = type === 'coins' ? 'inventory.coins' : 'inventory.gems';
      await User.findByIdAndUpdate(userId, {
        $inc: { [updateField]: amount },
      });
      return true;
    } catch (error) {
      console.error('增加货币失败:', error);
      return false;
    }
  }

  // ==================== 游戏内使用 ====================

  /**
   * 获取玩家在游戏中的装扮
   * @param userId 用户ID
   * @param role 当前游戏角色
   */
  async getPlayerCosmeticsForGame(
    userId: string,
    role: string
  ): Promise<{ [category: string]: ICosmetic | null }> {
    try {
      const equipped = await this.getEquippedCosmetics(userId);
      const result: { [category: string]: ICosmetic | null } = {};

      // 获取各品类的装备ID（优先使用角色特定装备，否则使用通用装备）
      const categories = ['skins', 'hats', 'pets', 'animations', 'trails', 'killEffects'];
      const cosmeticIds: string[] = [];

      for (const category of categories) {
        const equippedMap = equipped[category] || {};
        const cosmeticId = equippedMap[role] || equippedMap['all'] || null;
        if (cosmeticId) {
          cosmeticIds.push(cosmeticId);
        }
      }

      // 批量查询装扮信息
      const cosmetics = await Cosmetic.find({ id: { $in: cosmeticIds } }).lean();
      const cosmeticMap = new Map(cosmetics.map(c => [c.id, c]));

      // 构建结果
      for (const category of categories) {
        const equippedMap = equipped[category] || {};
        const cosmeticId = equippedMap[role] || equippedMap['all'] || null;
        result[category] = cosmeticId ? (cosmeticMap.get(cosmeticId) || null) : null;
      }

      return result;
    } catch (error) {
      console.error('获取游戏装扮失败:', error);
      return {};
    }
  }

  // ==================== 初始化数据 ====================

  /**
   * 初始化默认装扮数据
   */
  async initializeDefaultCosmetics(): Promise<void> {
    try {
      const defaultCosmetics: Partial<ICosmetic>[] = [
        // 基础皮肤
        {
          id: 'skin_cat_default',
          name: '橘猫',
          description: '最经典的橘色猫咪',
          category: CosmeticCategory.SKIN,
          rarity: Rarity.COMMON,
          applicableRoles: [ApplicableRole.CAT],
          iconUrl: '/cosmetics/skin_cat_default_icon.png',
          previewUrl: '/cosmetics/skin_cat_default_preview.png',
          assetUrl: '/cosmetics/skin_cat_default.asset',
          unlockMethod: UnlockMethod.DEFAULT,
          isLimited: false,
        },
        {
          id: 'skin_dog_default',
          name: '柴犬',
          description: '忠诚的柴犬伙伴',
          category: CosmeticCategory.SKIN,
          rarity: Rarity.COMMON,
          applicableRoles: [ApplicableRole.DOG],
          iconUrl: '/cosmetics/skin_dog_default_icon.png',
          previewUrl: '/cosmetics/skin_dog_default_preview.png',
          assetUrl: '/cosmetics/skin_dog_default.asset',
          unlockMethod: UnlockMethod.DEFAULT,
          isLimited: false,
        },
        {
          id: 'skin_fox_default',
          name: '赤狐',
          description: '狡猾的赤色狐狸',
          category: CosmeticCategory.SKIN,
          rarity: Rarity.COMMON,
          applicableRoles: [ApplicableRole.FOX],
          iconUrl: '/cosmetics/skin_fox_default_icon.png',
          previewUrl: '/cosmetics/skin_fox_default_preview.png',
          assetUrl: '/cosmetics/skin_fox_default.asset',
          unlockMethod: UnlockMethod.DEFAULT,
          isLimited: false,
        },
        // 帽子
        {
          id: 'hat_none',
          name: '无帽子',
          description: '不戴帽子',
          category: CosmeticCategory.HAT,
          rarity: Rarity.COMMON,
          applicableRoles: [ApplicableRole.ALL],
          iconUrl: '/cosmetics/hat_none_icon.png',
          previewUrl: '/cosmetics/hat_none_preview.png',
          assetUrl: '/cosmetics/hat_none.asset',
          unlockMethod: UnlockMethod.DEFAULT,
          isLimited: false,
        },
        {
          id: 'hat_cowboy',
          name: '牛仔帽',
          description: '西部牛仔风格',
          category: CosmeticCategory.HAT,
          rarity: Rarity.UNCOMMON,
          applicableRoles: [ApplicableRole.ALL],
          iconUrl: '/cosmetics/hat_cowboy_icon.png',
          previewUrl: '/cosmetics/hat_cowboy_preview.png',
          assetUrl: '/cosmetics/hat_cowboy.asset',
          unlockMethod: UnlockMethod.COINS,
          price: 500,
          isLimited: false,
        },
        {
          id: 'hat_crown',
          name: '皇冠',
          description: '王者之冠',
          category: CosmeticCategory.HAT,
          rarity: Rarity.LEGENDARY,
          applicableRoles: [ApplicableRole.ALL],
          iconUrl: '/cosmetics/hat_crown_icon.png',
          previewUrl: '/cosmetics/hat_crown_preview.png',
          assetUrl: '/cosmetics/hat_crown.asset',
          unlockMethod: UnlockMethod.GEMS,
          price: 100,
          isLimited: false,
        },
        // 宠物
        {
          id: 'pet_none',
          name: '无宠物',
          description: '不带宠物',
          category: CosmeticCategory.PET,
          rarity: Rarity.COMMON,
          applicableRoles: [ApplicableRole.ALL],
          iconUrl: '/cosmetics/pet_none_icon.png',
          previewUrl: '/cosmetics/pet_none_preview.png',
          assetUrl: '/cosmetics/pet_none.asset',
          unlockMethod: UnlockMethod.DEFAULT,
          isLimited: false,
        },
        {
          id: 'pet_duck',
          name: '小黄鸭',
          description: '可爱的小鸭子',
          category: CosmeticCategory.PET,
          rarity: Rarity.RARE,
          applicableRoles: [ApplicableRole.ALL],
          iconUrl: '/cosmetics/pet_duck_icon.png',
          previewUrl: '/cosmetics/pet_duck_preview.png',
          assetUrl: '/cosmetics/pet_duck.asset',
          unlockMethod: UnlockMethod.COINS,
          price: 1000,
          isLimited: false,
        },
        // 动画
        {
          id: 'anim_default',
          name: '默认动作',
          description: '标准移动动作',
          category: CosmeticCategory.ANIMATION,
          rarity: Rarity.COMMON,
          applicableRoles: [ApplicableRole.ALL],
          iconUrl: '/cosmetics/anim_default_icon.png',
          previewUrl: '/cosmetics/anim_default_preview.png',
          assetUrl: '/cosmetics/anim_default.asset',
          unlockMethod: UnlockMethod.DEFAULT,
          isLimited: false,
        },
        // 拖尾
        {
          id: 'trail_none',
          name: '无拖尾',
          description: '不显示拖尾',
          category: CosmeticCategory.TRAIL,
          rarity: Rarity.COMMON,
          applicableRoles: [ApplicableRole.ALL],
          iconUrl: '/cosmetics/trail_none_icon.png',
          previewUrl: '/cosmetics/trail_none_preview.png',
          assetUrl: '/cosmetics/trail_none.asset',
          unlockMethod: UnlockMethod.DEFAULT,
          isLimited: false,
        },
        {
          id: 'trail_rainbow',
          name: '彩虹拖尾',
          description: '七彩光芒拖尾',
          category: CosmeticCategory.TRAIL,
          rarity: Rarity.EPIC,
          applicableRoles: [ApplicableRole.ALL],
          iconUrl: '/cosmetics/trail_rainbow_icon.png',
          previewUrl: '/cosmetics/trail_rainbow_preview.png',
          assetUrl: '/cosmetics/trail_rainbow.asset',
          unlockMethod: UnlockMethod.GEMS,
          price: 200,
          isLimited: false,
        },
        // 击杀特效
        {
          id: 'kill_default',
          name: '默认特效',
          description: '标准击杀特效',
          category: CosmeticCategory.KILL_EFFECT,
          rarity: Rarity.COMMON,
          applicableRoles: [ApplicableRole.IMPOSTOR],
          iconUrl: '/cosmetics/kill_default_icon.png',
          previewUrl: '/cosmetics/kill_default_preview.png',
          assetUrl: '/cosmetics/kill_default.asset',
          unlockMethod: UnlockMethod.DEFAULT,
          isLimited: false,
        },
      ];

      for (const cosmetic of defaultCosmetics) {
        await Cosmetic.findOneAndUpdate(
          { id: cosmetic.id },
          cosmetic,
          { upsert: true, new: true }
        );
      }

      console.log('✅ 默认装扮数据初始化完成');
    } catch (error) {
      console.error('初始化默认装扮失败:', error);
    }
  }

  // ==================== 辅助方法 ====================

  private getCurrencyByUnlockMethod(method: UnlockMethod): 'coins' | 'gems' | null {
    switch (method) {
      case UnlockMethod.COINS:
        return 'coins';
      case UnlockMethod.GEMS:
        return 'gems';
      default:
        return null;
    }
  }

  private getEquipSlotByCategory(category: CosmeticCategory): string {
    switch (category) {
      case CosmeticCategory.SKIN:
        return 'skin';
      case CosmeticCategory.HAT:
        return 'hat';
      case CosmeticCategory.PET:
        return 'pet';
      case CosmeticCategory.ANIMATION:
        return 'animation';
      case CosmeticCategory.TRAIL:
        return 'trail';
      case CosmeticCategory.KILL_EFFECT:
        return 'killEffect';
      default:
        return 'unknown';
    }
  }

  private getEquippedMapByCategory(
    inventory: any,
    category: CosmeticCategory
  ): { [role: string]: string | null } {
    switch (category) {
      case CosmeticCategory.SKIN:
        inventory.equippedSkins = inventory.equippedSkins || {};
        return inventory.equippedSkins;
      case CosmeticCategory.HAT:
        inventory.equippedHats = inventory.equippedHats || {};
        return inventory.equippedHats;
      case CosmeticCategory.PET:
        inventory.equippedPets = inventory.equippedPets || {};
        return inventory.equippedPets;
      case CosmeticCategory.ANIMATION:
        inventory.equippedAnimations = inventory.equippedAnimations || {};
        return inventory.equippedAnimations;
      case CosmeticCategory.TRAIL:
        inventory.equippedTrails = inventory.equippedTrails || {};
        return inventory.equippedTrails;
      case CosmeticCategory.KILL_EFFECT:
        inventory.equippedKillEffects = inventory.equippedKillEffects || {};
        return inventory.equippedKillEffects;
      default:
        return {};
    }
  }

  private isRoleApplicable(applicableRoles: ApplicableRole[], role: string): boolean {
    if (applicableRoles.includes(ApplicableRole.ALL)) return true;
    return applicableRoles.includes(role as ApplicableRole);
  }
}

// 导出单例
export const cosmeticService = CosmeticService.getInstance();
export default cosmeticService;
