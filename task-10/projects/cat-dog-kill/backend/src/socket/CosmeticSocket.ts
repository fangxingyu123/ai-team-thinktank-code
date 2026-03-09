// ==================== 皮肤/装扮系统 Socket 处理器 ====================
// 文件: backend/src/socket/CosmeticSocket.ts
// 说明: 处理装扮相关的实时通信事件

import { Socket, Server } from 'socket.io';
import { cosmeticService } from '../services/CosmeticService';
import { CosmeticCategory } from '../models/Cosmetic';

// ==================== 类型定义 ====================

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

// ==================== Socket 处理器 ====================

export class CosmeticSocketHandler {
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  /**
   * 初始化Socket事件监听
   */
  public initialize(): void {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      // 装扮相关事件
      socket.on('cosmetic:get-shop', (data) => this.handleGetShop(socket, data));
      socket.on('cosmetic:purchase', (data) => this.handlePurchase(socket, data));
      socket.on('cosmetic:equip', (data) => this.handleEquip(socket, data));
      socket.on('cosmetic:unequip', (data) => this.handleUnequip(socket, data));
      socket.on('cosmetic:get-equipped', () => this.handleGetEquipped(socket));
      socket.on('cosmetic:get-inventory', (data) => this.handleGetInventory(socket, data));
      socket.on('cosmetic:preview', (data) => this.handlePreview(socket, data));
    });
  }

  // ==================== 事件处理器 ====================

  /**
   * 获取商店商品
   */
  private async handleGetShop(
    socket: AuthenticatedSocket,
    data: { category?: CosmeticCategory; rarity?: string; page?: number; limit?: number }
  ): Promise<void> {
    try {
      const userId = socket.userId;
      if (!userId) {
        socket.emit('cosmetic:error', { code: 'UNAUTHORIZED', message: '未登录' });
        return;
      }

      const filter = {
        category: data.category,
        rarity: data.rarity as any,
      };

      const page = data.page || 1;
      const limit = Math.min(data.limit || 20, 50);

      const result = await cosmeticService.getShopItems(userId, filter, page, limit);

      socket.emit('cosmetic:shop-data', {
        success: true,
        items: result.items,
        total: result.total,
        hasMore: result.hasMore,
        page,
      });
    } catch (error) {
      console.error('获取商店数据失败:', error);
      socket.emit('cosmetic:error', { code: 'FETCH_FAILED', message: '获取商店数据失败' });
    }
  }

  /**
   * 购买装扮
   */
  private async handlePurchase(
    socket: AuthenticatedSocket,
    data: { cosmeticId: string }
  ): Promise<void> {
    try {
      const userId = socket.userId;
      if (!userId) {
        socket.emit('cosmetic:error', { code: 'UNAUTHORIZED', message: '未登录' });
        return;
      }

      const { cosmeticId } = data;
      if (!cosmeticId) {
        socket.emit('cosmetic:error', { code: 'INVALID_PARAMS', message: '缺少商品ID' });
        return;
      }

      const result = await cosmeticService.purchaseCosmetic(userId, cosmeticId);

      if (result.success && result.cosmetic) {
        // 发送购买成功事件
        socket.emit('cosmetic:purchase-success', {
          cosmeticId: result.cosmetic.id,
          cosmeticName: result.cosmetic.name,
          newBalance: result.newBalance,
        });

        // 发送获得新装扮事件
        socket.emit('cosmetic:acquired', {
          cosmeticId: result.cosmetic.id,
          cosmeticName: result.cosmetic.name,
          category: result.cosmetic.category,
          rarity: result.cosmetic.rarity,
          source: 'purchase',
        });

        // 广播给同房间的其他玩家（可选）
        // socket.to(`user:${userId}`).emit('cosmetic:friend-purchase', {...});
      } else {
        socket.emit('cosmetic:purchase-failed', {
          cosmeticId,
          reason: result.error || '购买失败',
        });
      }
    } catch (error) {
      console.error('购买装扮失败:', error);
      socket.emit('cosmetic:error', { code: 'PURCHASE_FAILED', message: '购买失败' });
    }
  }

  /**
   * 装备装扮
   */
  private async handleEquip(
    socket: AuthenticatedSocket,
    data: { cosmeticId: string; role?: string }
  ): Promise<void> {
    try {
      const userId = socket.userId;
      if (!userId) {
        socket.emit('cosmetic:error', { code: 'UNAUTHORIZED', message: '未登录' });
        return;
      }

      const { cosmeticId, role = 'all' } = data;

      const result = await cosmeticService.equipCosmetic(userId, cosmeticId, role);

      if (result.success) {
        // 获取装扮信息用于通知
        const cosmetic = await cosmeticService.getCosmeticDetail(cosmeticId, userId);

        socket.emit('cosmetic:equipped-updated', {
          category: cosmetic?.category,
          role,
          cosmeticId,
          cosmeticName: cosmetic?.name || null,
        });

        // 如果用户在游戏中，通知游戏房间
        this.notifyCosmeticChange(socket, cosmetic?.category || 'unknown', cosmeticId);
      } else {
        socket.emit('cosmetic:equip-failed', {
          cosmeticId,
          reason: result.error || '装备失败',
        });
      }
    } catch (error) {
      console.error('装备装扮失败:', error);
      socket.emit('cosmetic:error', { code: 'EQUIP_FAILED', message: '装备失败' });
    }
  }

  /**
   * 卸下装扮
   */
  private async handleUnequip(
    socket: AuthenticatedSocket,
    data: { category: CosmeticCategory; role?: string }
  ): Promise<void> {
    try {
      const userId = socket.userId;
      if (!userId) {
        socket.emit('cosmetic:error', { code: 'UNAUTHORIZED', message: '未登录' });
        return;
      }

      const { category, role = 'all' } = data;

      const result = await cosmeticService.unequipCosmetic(userId, category, role);

      if (result.success) {
        socket.emit('cosmetic:equipped-updated', {
          category,
          role,
          cosmeticId: null,
          cosmeticName: null,
        });

        // 如果用户在游戏中，通知游戏房间
        this.notifyCosmeticChange(socket, category, null);
      } else {
        socket.emit('cosmetic:unequip-failed', {
          category,
          reason: result.error || '卸下失败',
        });
      }
    } catch (error) {
      console.error('卸下装扮失败:', error);
      socket.emit('cosmetic:error', { code: 'UNEQUIP_FAILED', message: '卸下失败' });
    }
  }

  /**
   * 获取当前装备
   */
  private async handleGetEquipped(socket: AuthenticatedSocket): Promise<void> {
    try {
      const userId = socket.userId;
      if (!userId) {
        socket.emit('cosmetic:error', { code: 'UNAUTHORIZED', message: '未登录' });
        return;
      }

      const equipped = await cosmeticService.getEquippedCosmetics(userId);

      socket.emit('cosmetic:equipped-data', {
        success: true,
        equipped,
      });
    } catch (error) {
      console.error('获取装备数据失败:', error);
      socket.emit('cosmetic:error', { code: 'FETCH_FAILED', message: '获取装备数据失败' });
    }
  }

  /**
   * 获取库存
   */
  private async handleGetInventory(
    socket: AuthenticatedSocket,
    data: { category?: CosmeticCategory }
  ): Promise<void> {
    try {
      const userId = socket.userId;
      if (!userId) {
        socket.emit('cosmetic:error', { code: 'UNAUTHORIZED', message: '未登录' });
        return;
      }

      const inventory = await cosmeticService.getUserInventory(userId, data.category);

      socket.emit('cosmetic:inventory-data', {
        success: true,
        cosmetics: inventory.cosmetics,
        balance: inventory.balance,
      });
    } catch (error) {
      console.error('获取库存失败:', error);
      socket.emit('cosmetic:error', { code: 'FETCH_FAILED', message: '获取库存失败' });
    }
  }

  /**
   * 预览装扮（游戏中实时预览）
   */
  private async handlePreview(
    socket: AuthenticatedSocket,
    data: { cosmeticId: string }
  ): Promise<void> {
    try {
      const userId = socket.userId;
      if (!userId) {
        socket.emit('cosmetic:error', { code: 'UNAUTHORIZED', message: '未登录' });
        return;
      }

      const { cosmeticId } = data;

      // 检查是否拥有该装扮
      const inventory = await cosmeticService.getUserInventory(userId);
      const ownedIds = inventory.cosmetics.map(c => c.cosmeticId);

      if (!ownedIds.includes(cosmeticId)) {
        socket.emit('cosmetic:preview-failed', {
          cosmeticId,
          reason: '未拥有该装扮',
        });
        return;
      }

      // 获取装扮详情
      const cosmetic = await cosmeticService.getCosmeticDetail(cosmeticId, userId);

      if (!cosmetic) {
        socket.emit('cosmetic:preview-failed', {
          cosmeticId,
          reason: '装扮不存在',
        });
        return;
      }

      // 发送预览数据
      socket.emit('cosmetic:preview-data', {
        success: true,
        cosmetic: {
          id: cosmetic.id,
          name: cosmetic.name,
          category: cosmetic.category,
          rarity: cosmetic.rarity,
          iconUrl: cosmetic.iconUrl,
          previewUrl: cosmetic.previewUrl,
          assetUrl: cosmetic.assetUrl,
        },
      });

      // 如果用户在房间中，广播预览给房间内其他玩家
      const rooms = Array.from(socket.rooms);
      const gameRoom = rooms.find(r => r.startsWith('room:'));
      if (gameRoom) {
        socket.to(gameRoom).emit('cosmetic:player-preview', {
          playerId: userId,
          playerName: socket.username,
          cosmeticId,
          cosmeticName: cosmetic.name,
          category: cosmetic.category,
        });
      }
    } catch (error) {
      console.error('预览装扮失败:', error);
      socket.emit('cosmetic:error', { code: 'PREVIEW_FAILED', message: '预览失败' });
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 通知游戏房间装扮变化
   */
  private notifyCosmeticChange(
    socket: AuthenticatedSocket,
    category: string,
    cosmeticId: string | null
  ): void {
    const rooms = Array.from(socket.rooms);
    const gameRoom = rooms.find(r => r.startsWith('room:'));

    if (gameRoom && socket.userId) {
      socket.to(gameRoom).emit('cosmetic:player-changed', {
        playerId: socket.userId,
        playerName: socket.username,
        category,
        cosmeticId,
      });
    }
  }

  /**
   * 广播商店更新（限时商品上架/下架）
   */
  public broadcastShopUpdate(newItems: string[], limitedEnding: string[]): void {
    this.io.emit('cosmetic:shop-updated', {
      newItems,
      limitedEnding,
    });
  }

  /**
   * 给用户发放装扮奖励
   */
  public async grantCosmeticReward(
    userId: string,
    cosmeticId: string,
    source: 'achievement' | 'event' | 'season_pass' | 'reward'
  ): Promise<void> {
    try {
      // 这里应该调用服务层方法将装扮添加到用户库存
      // 简化处理，实际应该调用专门的奖励发放方法

      const cosmetic = await cosmeticService.getCosmeticDetail(cosmeticId, userId);

      if (cosmetic) {
        // 发送给用户的所有socket连接
        const userSockets = await this.io.in(`user:${userId}`).fetchSockets();
        userSockets.forEach((s: any) => {
          s.emit('cosmetic:acquired', {
            cosmeticId,
            cosmeticName: cosmetic.name,
            category: cosmetic.category,
            rarity: cosmetic.rarity,
            source,
          });
        });
      }
    } catch (error) {
      console.error('发放装扮奖励失败:', error);
    }
  }

  /**
   * 更新用户货币余额
   */
  public async updateUserBalance(
    userId: string,
    coins: number,
    gems: number,
    change: { type: 'coins' | 'gems'; amount: number; reason: string }
  ): Promise<void> {
    const userSockets = await this.io.in(`user:${userId}`).fetchSockets();
    userSockets.forEach((s: any) => {
      s.emit('cosmetic:balance-updated', {
        coins,
        gems,
        change,
      });
    });
  }

  /**
   * 获取玩家在游戏中的装扮信息
   */
  public async getPlayerCosmeticsForGame(
    userId: string,
    role: string
  ): Promise<any> {
    return await cosmeticService.getPlayerCosmeticsForGame(userId, role);
  }
}

// 导出单例创建函数
export function createCosmeticSocketHandler(io: Server): CosmeticSocketHandler {
  return new CosmeticSocketHandler(io);
}

export default CosmeticSocketHandler;
