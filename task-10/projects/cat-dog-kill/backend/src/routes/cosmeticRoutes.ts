// ==================== 皮肤/装扮系统 API 路由 ====================
// 文件: backend/src/routes/cosmeticRoutes.ts
// 说明: RESTful API 接口，处理装扮相关的 HTTP 请求

import { Router, Request, Response } from 'express';
import { cosmeticService, CosmeticCategory, Rarity, UnlockMethod, ApplicableRole } from '../services/CosmeticService';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ==================== 商店相关接口 ====================

/**
 * GET /api/cosmetics/shop
 * 获取商店商品列表
 * Query参数:
 *   - category: 品类筛选 (skin/hat/pet/animation/trail/kill_effect)
 *   - rarity: 稀有度筛选 (common/uncommon/rare/epic/legendary/mythic/limited)
 *   - role: 角色筛选 (all/cat/dog/fox/crewmate/impostor)
 *   - unlockMethod: 获取方式筛选 (coins/gems/achievement/season_pass/event/default)
 *   - search: 搜索关键词
 *   - page: 页码 (默认1)
 *   - limit: 每页数量 (默认20)
 */
router.get('/shop', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: '未登录' });
    }

    const filter = {
      category: req.query.category as CosmeticCategory,
      rarity: req.query.rarity as Rarity,
      role: req.query.role as ApplicableRole,
      unlockMethod: req.query.unlockMethod as UnlockMethod,
      searchQuery: req.query.search as string,
      isLimited: req.query.isLimited === 'true' ? true : 
                 req.query.isLimited === 'false' ? false : undefined,
    };

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    const result = await cosmeticService.getShopItems(userId, filter, page, limit);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('获取商店商品失败:', error);
    res.status(500).json({ success: false, error: '获取商店商品失败' });
  }
});

/**
 * GET /api/cosmetics/shop/:cosmeticId
 * 获取单个商品详情
 */
router.get('/shop/:cosmeticId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { cosmeticId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, error: '未登录' });
    }

    const cosmetic = await cosmeticService.getCosmeticDetail(cosmeticId, userId);

    if (!cosmetic) {
      return res.status(404).json({ success: false, error: '商品不存在' });
    }

    res.json({
      success: true,
      data: cosmetic,
    });
  } catch (error) {
    console.error('获取商品详情失败:', error);
    res.status(500).json({ success: false, error: '获取商品详情失败' });
  }
});

// ==================== 购买相关接口 ====================

/**
 * POST /api/cosmetics/purchase
 * 购买装扮
 * Body: { cosmeticId: string }
 */
router.post('/purchase', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { cosmeticId } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, error: '未登录' });
    }

    if (!cosmeticId) {
      return res.status(400).json({ success: false, error: '缺少商品ID' });
    }

    const result = await cosmeticService.purchaseCosmetic(userId, cosmeticId);

    if (result.success) {
      res.json({
        success: true,
        data: {
          cosmetic: result.cosmetic,
          newBalance: result.newBalance,
        },
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('购买装扮失败:', error);
    res.status(500).json({ success: false, error: '购买失败' });
  }
});

// ==================== 装备相关接口 ====================

/**
 * GET /api/cosmetics/equipped
 * 获取当前装备
 */
router.get('/equipped', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: '未登录' });
    }

    const equipped = await cosmeticService.getEquippedCosmetics(userId);

    res.json({
      success: true,
      data: equipped,
    });
  } catch (error) {
    console.error('获取装备信息失败:', error);
    res.status(500).json({ success: false, error: '获取装备信息失败' });
  }
});

/**
 * POST /api/cosmetics/equip
 * 装备/卸下装扮
 * Body: { cosmeticId: string | null, role?: string }
 */
router.post('/equip', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { cosmeticId, role = 'all' } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, error: '未登录' });
    }

    // 如果cosmeticId为null或空字符串，表示卸下
    if (cosmeticId === null || cosmeticId === '') {
      return res.status(400).json({ 
        success: false, 
        error: '请使用 DELETE /api/cosmetics/unequip 来卸下装扮' 
      });
    }

    const result = await cosmeticService.equipCosmetic(userId, cosmeticId, role);

    if (result.success) {
      res.json({
        success: true,
        data: {
          equippedCosmetics: result.equippedCosmetics,
        },
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('装备装扮失败:', error);
    res.status(500).json({ success: false, error: '装备失败' });
  }
});

/**
 * DELETE /api/cosmetics/unequip
 * 卸下装扮
 * Body: { category: string, role?: string }
 */
router.delete('/unequip', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { category, role = 'all' } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, error: '未登录' });
    }

    if (!category) {
      return res.status(400).json({ success: false, error: '缺少品类参数' });
    }

    const result = await cosmeticService.unequipCosmetic(
      userId,
      category as CosmeticCategory,
      role
    );

    if (result.success) {
      res.json({
        success: true,
        data: {
          equippedCosmetics: result.equippedCosmetics,
        },
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('卸下装扮失败:', error);
    res.status(500).json({ success: false, error: '卸下失败' });
  }
});

// ==================== 库存相关接口 ====================

/**
 * GET /api/cosmetics/inventory
 * 获取用户库存
 * Query参数:
 *   - category: 按品类筛选
 */
router.get('/inventory', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const category = req.query.category as CosmeticCategory;

    if (!userId) {
      return res.status(401).json({ success: false, error: '未登录' });
    }

    const inventory = await cosmeticService.getUserInventory(userId, category);

    res.json({
      success: true,
      data: inventory,
    });
  } catch (error) {
    console.error('获取库存失败:', error);
    res.status(500).json({ success: false, error: '获取库存失败' });
  }
});

/**
 * GET /api/cosmetics/balance
 * 获取用户货币余额
 */
router.get('/balance', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: '未登录' });
    }

    const balance = await cosmeticService.getUserBalance(userId);

    res.json({
      success: true,
      data: balance,
    });
  } catch (error) {
    console.error('获取余额失败:', error);
    res.status(500).json({ success: false, error: '获取余额失败' });
  }
});

// ==================== 管理接口（需要管理员权限） ====================

/**
 * POST /api/cosmetics/admin/add-currency
 * 给用户增加货币（测试/补偿用）
 * Body: { userId: string, type: 'coins' | 'gems', amount: number }
 */
router.post('/admin/add-currency', authMiddleware, async (req: Request, res: Response) => {
  try {
    // TODO: 添加管理员权限检查
    const { userId, type, amount } = req.body;

    if (!userId || !type || !amount) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }

    if (type !== 'coins' && type !== 'gems') {
      return res.status(400).json({ success: false, error: '无效的货币类型' });
    }

    const success = await cosmeticService.addCurrency(userId, type, amount);

    if (success) {
      res.json({ success: true, message: '货币添加成功' });
    } else {
      res.status(500).json({ success: false, error: '货币添加失败' });
    }
  } catch (error) {
    console.error('添加货币失败:', error);
    res.status(500).json({ success: false, error: '添加失败' });
  }
});

/**
 * POST /api/cosmetics/admin/initialize
 * 初始化默认装扮数据
 */
router.post('/admin/initialize', authMiddleware, async (req: Request, res: Response) => {
  try {
    // TODO: 添加管理员权限检查
    await cosmeticService.initializeDefaultCosmetics();
    res.json({ success: true, message: '默认装扮数据初始化完成' });
  } catch (error) {
    console.error('初始化失败:', error);
    res.status(500).json({ success: false, error: '初始化失败' });
  }
});

export default router;
