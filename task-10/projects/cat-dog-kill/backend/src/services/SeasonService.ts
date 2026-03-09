import { Season, ISeason, SeasonStatus, ISeasonReward, ISeasonTask, SeasonTaskType, RewardType } from '../models/Season';
import { UserSeason, IUserSeason, IUserTaskProgress } from '../models/UserSeason';
import { User } from '../models/User';
import { cosmeticService } from './CosmeticService';

// ==================== 类型定义 ====================

/**
 * 赛季概览信息
 */
export interface SeasonOverview {
  seasonId: string;
  name: string;
  description: string;
  theme: string;
  status: SeasonStatus;
  startDate: Date;
  endDate: Date;
  daysRemaining: number;
  maxLevel: number;
  xpPerLevel: number;
  premiumPrice: number;
}

/**
 * 用户赛季进度
 */
export interface UserSeasonProgress {
  seasonId: string;
  level: number;
  xp: number;
  totalXp: number;
  xpForNextLevel: number;
  progressPercent: number;
  hasPremium: boolean;
  claimedRewards: number[];
  claimedPremiumRewards: number[];
}

/**
 * 奖励项展示
 */
export interface RewardDisplay {
  level: number;
  freeReward: {
    type: RewardType;
    name: string;
    description: string;
    iconUrl: string;
    amount?: number;
    isClaimed: boolean;
    canClaim: boolean;
  } | null;
  premiumReward: {
    type: RewardType;
    name: string;
    description: string;
    iconUrl: string;
    amount?: number;
    isClaimed: boolean;
    canClaim: boolean;
  } | null;
}

/**
 * 任务进度展示
 */
export interface TaskProgressDisplay {
  taskId: string;
  type: SeasonTaskType;
  name: string;
  description: string;
  iconUrl: string;
  current: number;
  target: number;
  progressPercent: number;
  completed: boolean;
  claimed: boolean;
  xpReward: number;
  refreshInterval: string;
  expiresAt: Date;
}

/**
 * 排行榜条目
 */
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  nickname: string;
  avatar?: string;
  level: number;
  xp: number;
  isPremium: boolean;
}

/**
 * 领取奖励结果
 */
export interface ClaimRewardResult {
  success: boolean;
  error?: string;
  reward?: {
    type: RewardType;
    name: string;
    amount?: number;
    cosmeticId?: string;
  };
  newBalance?: {
    coins: number;
    gems: number;
  };
}

/**
 * 购买通行证结果
 */
export interface PurchasePassResult {
  success: boolean;
  error?: string;
  hasPremium: boolean;
  newGemBalance?: number;
}

/**
 * 游戏结算经验奖励
 */
export interface GameXpReward {
  baseXp: number;
  winBonus: number;
  taskBonus: number;
  killBonus: number;
  survivalBonus: number;
  totalXp: number;
}

// ==================== 服务类 ====================

export class SeasonService {
  private static instance: SeasonService;
  
  // 经验值配置
  private readonly XP_CONFIG = {
    BASE_XP_PER_GAME: 50,           // 基础经验
    WIN_BONUS: 100,                 // 胜利奖励
    TASK_COMPLETION_BONUS: 10,      // 每个任务奖励
    KILL_BONUS: 25,                 // 每次击杀奖励
    SURVIVAL_BONUS: 30,             // 存活奖励
    MAX_XP_PER_GAME: 500,           // 单场游戏上限
  };

  private constructor() {}

  public static getInstance(): SeasonService {
    if (!SeasonService.instance) {
      SeasonService.instance = new SeasonService();
    }
    return SeasonService.instance;
  }

  // ==================== 赛季管理 ====================

  /**
   * 获取当前活跃的赛季
   */
  async getActiveSeason(): Promise<ISeason | null> {
    const now = new Date();
    return Season.findOne({
      status: SeasonStatus.ACTIVE,
      startDate: { $lte: now },
      endDate: { $gte: now },
    }).sort({ startDate: -1 });
  }

  /**
   * 获取赛季信息
   */
  async getSeasonById(seasonId: string): Promise<ISeason | null> {
    return Season.findOne({ id: seasonId });
  }

  /**
   * 获取赛季概览
   */
  async getSeasonOverview(seasonId?: string): Promise<SeasonOverview | null> {
    let season: ISeason | null;
    
    if (seasonId) {
      season = await this.getSeasonById(seasonId);
    } else {
      season = await this.getActiveSeason();
    }

    if (!season) return null;

    const now = new Date();
    const daysRemaining = Math.max(0, Math.ceil(
      (season.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    ));

    return {
      seasonId: season.id,
      name: season.name,
      description: season.description,
      theme: season.theme,
      status: season.status,
      startDate: season.startDate,
      endDate: season.endDate,
      daysRemaining,
      maxLevel: season.maxLevel,
      xpPerLevel: season.xpPerLevel,
      premiumPrice: season.premiumPrice,
    };
  }

  /**
   * 获取或创建用户赛季数据
   */
  async getOrCreateUserSeason(userId: string, seasonId: string): Promise<IUserSeason> {
    let userSeason = await UserSeason.findOne({ userId, seasonId });
    
    if (!userSeason) {
      // 获取赛季信息以初始化任务
      const season = await this.getSeasonById(seasonId);
      
      userSeason = new UserSeason({
        userId,
        seasonId,
        level: 1,
        xp: 0,
        totalXp: 0,
        hasPremium: false,
        claimedRewards: [],
        taskProgress: new Map(),
        lastActiveAt: new Date(),
      });

      // 初始化任务进度
      if (season) {
        await this.initializeTaskProgress(userSeason, season);
      }

      await userSeason.save();
    }

    return userSeason;
  }

  /**
   * 初始化任务进度
   */
  private async initializeTaskProgress(userSeason: IUserSeason, season: ISeason): Promise<void> {
    const now = new Date();
    
    for (const task of season.tasks) {
      let expiresAt: Date;
      
      if (task.refreshInterval === 'daily') {
        expiresAt = new Date(now);
        expiresAt.setDate(expiresAt.getDate() + 1);
        expiresAt.setHours(0, 0, 0, 0);
      } else if (task.refreshInterval === 'weekly') {
        expiresAt = new Date(now);
        expiresAt.setDate(expiresAt.getDate() + (7 - expiresAt.getDay()));
        expiresAt.setHours(0, 0, 0, 0);
      } else {
        // 赛季任务，过期时间为赛季结束
        expiresAt = season.endDate;
      }

      userSeason.taskProgress.set(task.id, {
        taskId: task.id,
        type: task.type,
        current: 0,
        target: task.target,
        completed: false,
        claimed: false,
        expiresAt,
      });
    }
  }

  /**
   * 获取用户赛季进度
   */
  async getUserProgress(userId: string, seasonId?: string): Promise<UserSeasonProgress | null> {
    const season = seasonId 
      ? await this.getSeasonById(seasonId)
      : await this.getActiveSeason();
    
    if (!season) return null;

    const userSeason = await this.getOrCreateUserSeason(userId, season.id);
    const xpForNextLevel = userSeason.getXpForNextLevel();

    return {
      seasonId: season.id,
      level: userSeason.level,
      xp: userSeason.xp,
      totalXp: userSeason.totalXp,
      xpForNextLevel,
      progressPercent: Math.min(100, Math.round((userSeason.xp / xpForNextLevel) * 100)),
      hasPremium: userSeason.hasPremium,
      claimedRewards: userSeason.claimedRewards
        .filter(r => !r.isPremium)
        .map(r => r.level),
      claimedPremiumRewards: userSeason.claimedRewards
        .filter(r => r.isPremium)
        .map(r => r.level),
    };
  }

  // ==================== 奖励相关 ====================

  /**
   * 获取奖励追踪列表
   */
  async getRewardTrack(userId: string, seasonId?: string): Promise<RewardDisplay[]> {
    const season = seasonId 
      ? await this.getSeasonById(seasonId)
      : await this.getActiveSeason();
    
    if (!season) return [];

    const userSeason = await this.getOrCreateUserSeason(userId, season.id);
    const rewards: RewardDisplay[] = [];

    // 按等级分组奖励
    const rewardsByLevel = new Map<number, { free?: ISeasonReward; premium?: ISeasonReward }>();
    
    for (const reward of season.rewards) {
      if (!rewardsByLevel.has(reward.level)) {
        rewardsByLevel.set(reward.level, {});
      }
      const entry = rewardsByLevel.get(reward.level)!;
      if (reward.isPremium) {
        entry.premium = reward;
      } else {
        entry.free = reward;
      }
    }

    // 构建奖励展示列表
    for (let level = 1; level <= season.maxLevel; level++) {
      const levelRewards = rewardsByLevel.get(level);
      if (!levelRewards) continue;

      const display: RewardDisplay = {
        level,
        freeReward: null,
        premiumReward: null,
      };

      if (levelRewards.free) {
        const isClaimed = userSeason.claimedRewards.some(
          r => r.level === level && !r.isPremium
        );
        display.freeReward = {
          type: levelRewards.free.type,
          name: levelRewards.free.name,
          description: levelRewards.free.description,
          iconUrl: levelRewards.free.iconUrl,
          amount: levelRewards.free.amount,
          isClaimed,
          canClaim: userSeason.canClaimReward(level, false),
        };
      }

      if (levelRewards.premium) {
        const isClaimed = userSeason.claimedRewards.some(
          r => r.level === level && r.isPremium
        );
        display.premiumReward = {
          type: levelRewards.premium.type,
          name: levelRewards.premium.name,
          description: levelRewards.premium.description,
          iconUrl: levelRewards.premium.iconUrl,
          amount: levelRewards.premium.amount,
          isClaimed,
          canClaim: userSeason.canClaimReward(level, true),
        };
      }

      rewards.push(display);
    }

    return rewards;
  }

  /**
   * 领取奖励
   */
  async claimReward(
    userId: string,
    level: number,
    isPremium: boolean,
    seasonId?: string
  ): Promise<ClaimRewardResult> {
    const season = seasonId 
      ? await this.getSeasonById(seasonId)
      : await this.getActiveSeason();
    
    if (!season) {
      return { success: false, error: '赛季不存在' };
    }

    const userSeason = await this.getOrCreateUserSeason(userId, season.id);

    // 检查是否可以领取
    if (!userSeason.canClaimReward(level, isPremium)) {
      return { success: false, error: '无法领取该奖励' };
    }

    // 查找奖励
    const reward = season.rewards.find(
      r => r.level === level && r.isPremium === isPremium
    );

    if (!reward) {
      return { success: false, error: '奖励不存在' };
    }

    // 发放奖励
    const user = await User.findById(userId);
    if (!user) {
      return { success: false, error: '用户不存在' };
    }

    try {
      switch (reward.type) {
        case RewardType.COINS:
          if (reward.amount) {
            user.inventory.coins += reward.amount;
          }
          break;
        case RewardType.GEMS:
          if (reward.amount) {
            user.inventory.gems += reward.amount;
          }
          break;
        case RewardType.COSMETIC:
          if (reward.cosmeticId) {
            user.inventory.ownedCosmetics.set(reward.cosmeticId, {
              cosmeticId: reward.cosmeticId,
              acquiredAt: new Date(),
              isEquipped: false,
            });
          }
          break;
        case RewardType.TITLE:
          // 称号系统待实现，这里先记录
          break;
        case RewardType.FRAME:
          // 头像框系统待实现
          break;
        case RewardType.EFFECT:
          // 特效系统待实现
          break;
      }

      // 记录已领取
      userSeason.claimReward(level, isPremium, reward.type);

      await Promise.all([user.save(), userSeason.save()]);

      return {
        success: true,
        reward: {
          type: reward.type,
          name: reward.name,
          amount: reward.amount,
          cosmeticId: reward.cosmeticId,
        },
        newBalance: {
          coins: user.inventory.coins,
          gems: user.inventory.gems,
        },
      };
    } catch (error) {
      console.error('领取奖励失败:', error);
      return { success: false, error: '领取奖励失败，请稍后重试' };
    }
  }

  /**
   * 一键领取所有可领取奖励
   */
  async claimAllRewards(userId: string, seasonId?: string): Promise<{
    success: boolean;
    claimed: ClaimRewardResult[];
    failed: { level: number; isPremium: boolean; error: string }[];
  }> {
    const season = seasonId 
      ? await this.getSeasonById(seasonId)
      : await this.getActiveSeason();
    
    if (!season) {
      return { success: false, claimed: [], failed: [] };
    }

    const userSeason = await this.getOrCreateUserSeason(userId, season.id);
    const claimed: ClaimRewardResult[] = [];
    const failed: { level: number; isPremium: boolean; error: string }[] = [];

    // 遍历所有奖励
    for (const reward of season.rewards) {
      if (userSeason.canClaimReward(reward.level, reward.isPremium)) {
        const result = await this.claimReward(userId, reward.level, reward.isPremium, season.id);
        if (result.success) {
          claimed.push(result);
        } else {
          failed.push({
            level: reward.level,
            isPremium: reward.isPremium,
            error: result.error || '未知错误',
          });
        }
      }
    }

    return { success: true, claimed, failed };
  }

  // ==================== 通行证购买 ====================

  /**
   * 购买高级通行证
   */
  async purchasePremiumPass(userId: string, seasonId?: string): Promise<PurchasePassResult> {
    const season = seasonId 
      ? await this.getSeasonById(seasonId)
      : await this.getActiveSeason();
    
    if (!season) {
      return { success: false, error: '赛季不存在' };
    }

    const userSeason = await this.getOrCreateUserSeason(userId, season.id);

    if (userSeason.hasPremium) {
      return { success: false, error: '已购买高级通行证' };
    }

    const user = await User.findById(userId);
    if (!user) {
      return { success: false, error: '用户不存在' };
    }

    if (user.inventory.gems < season.premiumPrice) {
      return { success: false, error: '宝石不足' };
    }

    // 扣除宝石
    user.inventory.gems -= season.premiumPrice;
    userSeason.hasPremium = true;
    userSeason.premiumPurchasedAt = new Date();

    await Promise.all([user.save(), userSeason.save()]);

    return {
      success: true,
      hasPremium: true,
      newGemBalance: user.inventory.gems,
    };
  }

  // ==================== 任务系统 ====================

  /**
   * 获取任务列表及进度
   */
  async getTaskProgress(userId: string, seasonId?: string): Promise<TaskProgressDisplay[]> {
    const season = seasonId 
      ? await this.getSeasonById(seasonId)
      : await this.getActiveSeason();
    
    if (!season) return [];

    const userSeason = await this.getOrCreateUserSeason(userId, season.id);
    const now = new Date();

    // 检查并刷新任务
    await this.refreshExpiredTasks(userSeason, season);

    const displays: TaskProgressDisplay[] = [];

    for (const task of season.tasks) {
      const progress = userSeason.taskProgress.get(task.id);
      if (!progress) continue;

      displays.push({
        taskId: task.id,
        type: task.type,
        name: task.name,
        description: task.description,
        iconUrl: task.iconUrl,
        current: progress.current,
        target: progress.target,
        progressPercent: Math.min(100, Math.round((progress.current / progress.target) * 100)),
        completed: progress.completed,
        claimed: progress.claimed,
        xpReward: task.xpReward,
        refreshInterval: task.refreshInterval,
        expiresAt: progress.expiresAt,
      });
    }

    return displays;
  }

  /**
   * 刷新过期任务
   */
  private async refreshExpiredTasks(userSeason: IUserSeason, season: ISeason): Promise<void> {
    const now = new Date();
    let needsSave = false;

    for (const task of season.tasks) {
      const progress = userSeason.taskProgress.get(task.id);
      if (!progress) continue;

      if (progress.expiresAt < now) {
        // 任务已过期，重置进度
        let newExpiresAt: Date;
        
        if (task.refreshInterval === 'daily') {
          newExpiresAt = new Date(now);
          newExpiresAt.setDate(newExpiresAt.getDate() + 1);
          newExpiresAt.setHours(0, 0, 0, 0);
        } else if (task.refreshInterval === 'weekly') {
          newExpiresAt = new Date(now);
          newExpiresAt.setDate(newExpiresAt.getDate() + (7 - newExpiresAt.getDay()));
          newExpiresAt.setHours(0, 0, 0, 0);
        } else {
          continue; // 赛季任务不刷新
        }

        progress.current = 0;
        progress.completed = false;
        progress.claimed = false;
        progress.expiresAt = newExpiresAt;
        needsSave = true;
      }
    }

    if (needsSave) {
      await userSeason.save();
    }
  }

  /**
   * 领取任务奖励
   */
  async claimTaskReward(userId: string, taskId: string, seasonId?: string): Promise<{
    success: boolean;
    error?: string;
    xpReward?: number;
    newLevel?: number;
    newXp?: number;
    leveledUp?: boolean;
  }> {
    const season = seasonId 
      ? await this.getSeasonById(seasonId)
      : await this.getActiveSeason();
    
    if (!season) {
      return { success: false, error: '赛季不存在' };
    }

    const userSeason = await this.getOrCreateUserSeason(userId, season.id);
    const progress = userSeason.taskProgress.get(taskId);

    if (!progress) {
      return { success: false, error: '任务不存在' };
    }

    if (!progress.completed) {
      return { success: false, error: '任务未完成' };
    }

    if (progress.claimed) {
      return { success: false, error: '奖励已领取' };
    }

    const task = season.tasks.find(t => t.id === taskId);
    if (!task) {
      return { success: false, error: '任务不存在' };
    }

    // 发放经验
    progress.claimed = true;
    progress.claimedAt = new Date();

    const result = await this.addXpAndCheckLevelUp(userSeason, task.xpReward);

    await userSeason.save();

    return {
      success: true,
      xpReward: task.xpReward,
      ...result,
    };
  }

  // ==================== 经验值与升级 ====================

  /**
   * 添加经验值并检查升级
   */
  private async addXpAndCheckLevelUp(
    userSeason: IUserSeason,
    xpAmount: number
  ): Promise<{ newLevel: number; newXp: number; leveledUp: boolean }> {
    const oldLevel = userSeason.level;
    userSeason.addXp(xpAmount);

    let leveledUp = false;

    // 检查升级
    while (userSeason.xp >= userSeason.getXpForNextLevel()) {
      const xpNeeded = userSeason.getXpForNextLevel();
      userSeason.xp -= xpNeeded;
      userSeason.level += 1;
      leveledUp = true;
    }

    return {
      newLevel: userSeason.level,
      newXp: userSeason.xp,
      leveledUp: leveledUp && userSeason.level > oldLevel,
    };
  }

  /**
   * 处理游戏结算经验
   */
  async processGameEnd(
    userId: string,
    gameData: {
      won: boolean;
      role: string;
      tasksCompleted: number;
      kills: number;
      survived: boolean;
      gameDuration: number;
    }
  ): Promise<GameXpReward & { newLevel: number; newXp: number; leveledUp: boolean }> {
    const season = await this.getActiveSeason();
    if (!season) {
      return {
        baseXp: 0,
        winBonus: 0,
        taskBonus: 0,
        killBonus: 0,
        survivalBonus: 0,
        totalXp: 0,
        newLevel: 1,
        newXp: 0,
        leveledUp: false,
      };
    }

    const userSeason = await this.getOrCreateUserSeason(userId, season.id);

    // 计算经验
    let baseXp = this.XP_CONFIG.BASE_XP_PER_GAME;
    let winBonus = gameData.won ? this.XP_CONFIG.WIN_BONUS : 0;
    let taskBonus = gameData.tasksCompleted * this.XP_CONFIG.TASK_COMPLETION_BONUS;
    let killBonus = gameData.kills * this.XP_CONFIG.KILL_BONUS;
    let survivalBonus = gameData.survived ? this.XP_CONFIG.SURVIVAL_BONUS : 0;

    let totalXp = baseXp + winBonus + taskBonus + killBonus + survivalBonus;
    
    // 应用上限
    totalXp = Math.min(totalXp, this.XP_CONFIG.MAX_XP_PER_GAME);

    // 调整各项比例
    const ratio = totalXp / (baseXp + winBonus + taskBonus + killBonus + survivalBonus);
    baseXp = Math.floor(baseXp * ratio);
    winBonus = Math.floor(winBonus * ratio);
    taskBonus = Math.floor(taskBonus * ratio);
    killBonus = Math.floor(killBonus * ratio);
    survivalBonus = Math.floor(survivalBonus * ratio);

    // 添加经验并检查升级
    const levelResult = await this.addXpAndCheckLevelUp(userSeason, totalXp);

    // 更新任务进度
    await this.updateTaskProgress(userSeason, season, gameData);

    userSeason.lastActiveAt = new Date();
    await userSeason.save();

    return {
      baseXp,
      winBonus,
      taskBonus,
      killBonus,
      survivalBonus,
      totalXp,
      ...levelResult,
    };
  }

  /**
   * 更新任务进度
   */
  private async updateTaskProgress(
    userSeason: IUserSeason,
    season: ISeason,
    gameData: {
      won: boolean;
      tasksCompleted: number;
      kills: number;
      survived: boolean;
    }
  ): Promise<void> {
    const now = new Date();

    for (const task of season.tasks) {
      const progress = userSeason.taskProgress.get(task.id);
      if (!progress || progress.completed || progress.expiresAt < now) continue;

      let increment = 0;

      switch (task.type) {
        case SeasonTaskType.PLAY_GAMES:
          increment = 1;
          break;
        case SeasonTaskType.WIN_GAMES:
          if (gameData.won) increment = 1;
          break;
        case SeasonTaskType.COMPLETE_TASKS:
          increment = gameData.tasksCompleted;
          break;
        case SeasonTaskType.KILL_PLAYERS:
          increment = gameData.kills;
          break;
        case SeasonTaskType.SURVIVE_ROUNDS:
          if (gameData.survived) increment = 1;
          break;
      }

      if (increment > 0) {
        progress.current = Math.min(progress.target, progress.current + increment);
        if (progress.current >= progress.target) {
          progress.completed = true;
          progress.completedAt = new Date();
        }
      }
    }
  }

  // ==================== 排行榜 ====================

  /**
   * 获取排行榜
   */
  async getLeaderboard(
    seasonId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<{ entries: LeaderboardEntry[]; total: number; hasMore: boolean }> {
    const skip = (page - 1) * limit;

    const [userSeasons, total] = await Promise.all([
      UserSeason.find({ seasonId })
        .sort({ level: -1, xp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UserSeason.countDocuments({ seasonId }),
    ]);

    // 获取用户信息
    const userIds = userSeasons.map(us => us.userId);
    const users = await User.find({ _id: { $in: userIds } })
      .select('nickname avatar')
      .lean();
    
    const userMap = new Map(users.map(u => [u._id.toString(), u]));

    const entries: LeaderboardEntry[] = userSeasons.map((us, index) => {
      const user = userMap.get(us.userId);
      return {
        rank: skip + index + 1,
        userId: us.userId,
        nickname: user?.nickname || '未知玩家',
        avatar: user?.avatar,
        level: us.level,
        xp: us.xp,
        isPremium: us.hasPremium,
      };
    });

    return {
      entries,
      total,
      hasMore: skip + entries.length < total,
    };
  }

  /**
   * 获取用户排名
   */
  async getUserRank(userId: string, seasonId?: string): Promise<{
    rank: number;
    totalPlayers: number;
    percentile: number;
  } | null> {
    const season = seasonId 
      ? await this.getSeasonById(seasonId)
      : await this.getActiveSeason();
    
    if (!season) return null;

    const userSeason = await UserSeason.findOne({ userId, seasonId: season.id });
    if (!userSeason) {
      return { rank: 0, totalPlayers: 0, percentile: 0 };
    }

    // 计算排名
    const higherRanked = await UserSeason.countDocuments({
      seasonId: season.id,
      $or: [
        { level: { $gt: userSeason.level } },
        { level: userSeason.level, xp: { $gt: userSeason.xp } },
      ],
    });

    const totalPlayers = await UserSeason.countDocuments({ seasonId: season.id });
    const rank = higherRanked + 1;
    const percentile = totalPlayers > 0 
      ? Math.round(((totalPlayers - rank) / totalPlayers) * 100) 
      : 0;

    return { rank, totalPlayers, percentile };
  }

  // ==================== 赛季初始化 ====================

  /**
   * 初始化默认赛季数据
   */
  async initializeDefaultSeason(): Promise<void> {
    const existingSeason = await Season.findOne({ id: 's1' });
    if (existingSeason) {
      console.log('✅ 赛季数据已存在');
      return;
    }

    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 90); // 90天赛季

    const season = new Season({
      id: 's1',
      name: '第一赛季：萌宠大乱斗',
      description: '加入第一赛季，解锁专属萌宠装扮！',
      theme: 'cute_pets',
      status: SeasonStatus.ACTIVE,
      startDate: now,
      endDate,
      maxLevel: 100,
      xpPerLevel: 1000,
      premiumPrice: 990,
      rewards: this.generateDefaultRewards(),
      tasks: this.generateDefaultTasks(),
    });

    await season.save();
    console.log('✅ 默认赛季数据初始化完成');
  }

  /**
   * 生成默认奖励
   */
  private generateDefaultRewards(): ISeasonReward[] {
    const rewards: ISeasonReward[] = [];

    // 每5级一个奖励
    for (let level = 1; level <= 100; level++) {
      // 免费奖励
      if (level % 5 === 0) {
        if (level % 10 === 0) {
          // 每10级给装扮
          rewards.push({
            level,
            type: RewardType.COSMETIC,
            cosmeticId: `season1_cosmetic_${level}`,
            isPremium: false,
            iconUrl: `/seasons/s1/reward_${level}_free.png`,
            name: `赛季限定装扮 Lv.${level}`,
            description: `第一赛季达到${level}级的专属奖励`,
          });
        } else {
          // 每5级给金币
          rewards.push({
            level,
            type: RewardType.COINS,
            amount: 100 + (level * 10),
            isPremium: false,
            iconUrl: `/seasons/s1/coins.png`,
            name: `${100 + (level * 10)} 金币`,
            description: '游戏内货币',
          });
        }
      }

      // 高级通行证奖励（每级都有）
      if (level % 5 === 0) {
        if (level % 10 === 0) {
          // 稀有装扮
          rewards.push({
            level,
            type: RewardType.COSMETIC,
            cosmeticId: `season1_premium_${level}`,
            isPremium: true,
            iconUrl: `/seasons/s1/reward_${level}_premium.png`,
            name: `高级赛季装扮 Lv.${level}`,
            description: `第一赛季高级通行证${level}级专属奖励`,
          });
        } else if (level % 5 === 0) {
          // 宝石
          rewards.push({
            level,
            type: RewardType.GEMS,
            amount: 10 + Math.floor(level / 10) * 5,
            isPremium: true,
            iconUrl: `/seasons/s1/gems.png`,
            name: `${10 + Math.floor(level / 10) * 5} 宝石`,
            description: '高级货币',
          });
        }
      }
    }

    // 满级特殊奖励
    rewards.push({
      level: 100,
      type: RewardType.TITLE,
      title: '萌宠大师',
      isPremium: false,
      iconUrl: `/seasons/s1/title_master.png`,
      name: '称号：萌宠大师',
      description: '第一赛季达到满级的荣耀称号',
    });

    rewards.push({
      level: 100,
      type: RewardType.COSMETIC,
      cosmeticId: 'season1_legendary_skin',
      isPremium: true,
      iconUrl: `/seasons/s1/legendary_skin.png`,
      name: '传说皮肤：黄金萌宠',
      description: '第一赛季高级通行证满级传说奖励',
    });

    return rewards;
  }

  /**
   * 生成默认任务
   */
  private generateDefaultTasks(): ISeasonTask[] {
    return [
      {
        id: 'daily_play',
        type: SeasonTaskType.PLAY_GAMES,
        name: '每日对战',
        description: '完成3场游戏',
        target: 3,
        xpReward: 100,
        refreshInterval: 'daily',
        iconUrl: '/tasks/daily_play.png',
      },
      {
        id: 'daily_win',
        type: SeasonTaskType.WIN_GAMES,
        name: '每日胜利',
        description: '赢得1场游戏',
        target: 1,
        xpReward: 150,
        refreshInterval: 'daily',
        iconUrl: '/tasks/daily_win.png',
      },
      {
        id: 'weekly_tasks',
        type: SeasonTaskType.COMPLETE_TASKS,
        name: '任务达人',
        description: '完成50个任务',
        target: 50,
        xpReward: 500,
        refreshInterval: 'weekly',
        iconUrl: '/tasks/weekly_tasks.png',
      },
      {
        id: 'weekly_kills',
        type: SeasonTaskType.KILL_PLAYERS,
        name: '猎手',
        description: '击杀10名玩家',
        target: 10,
        xpReward: 400,
        refreshInterval: 'weekly',
        iconUrl: '/tasks/weekly_kills.png',
      },
      {
        id: 'season_games',
        type: SeasonTaskType.PLAY_GAMES,
        name: '赛季老兵',
        description: '完成100场游戏',
        target: 100,
        xpReward: 2000,
        refreshInterval: 'season',
        iconUrl: '/tasks/season_games.png',
      },
      {
        id: 'season_wins',
        type: SeasonTaskType.WIN_GAMES,
        name: '赛季王者',
        description: '赢得50场游戏',
        target: 50,
        xpReward: 3000,
        refreshInterval: 'season',
        iconUrl: '/tasks/season_wins.png',
      },
    ];
  }

  /**
   * 检查并更新赛季状态
   * 应该由定时任务调用
   */
  async checkAndUpdateSeasonStatus(): Promise<void> {
    const now = new Date();

    // 激活即将开始的赛季
    await Season.updateMany(
      {
        status: SeasonStatus.UPCOMING,
        startDate: { $lte: now },
      },
      { status: SeasonStatus.ACTIVE }
    );

    // 结束已到期赛季
    await Season.updateMany(
      {
        status: SeasonStatus.ACTIVE,
        endDate: { $lt: now },
      },
      { status: SeasonStatus.ENDED }
    );

    console.log('✅ 赛季状态检查完成');
  }
}

// 导出单例
export const seasonService = SeasonService.getInstance();
export default seasonService;
