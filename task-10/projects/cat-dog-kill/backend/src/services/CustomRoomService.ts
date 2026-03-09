// ==================== 自定义房间服务 ====================
// 文件: backend/src/services/CustomRoomService.ts
// 说明: 处理带密码和自定义规则的房间管理

import { v4 as uuidv4 } from 'uuid';
import {
  CustomRoom,
  CustomGameRules,
  CreateCustomRoomRequest,
  JoinRoomWithPasswordRequest,
  PublicRoomInfo,
  RoomDetails,
  PlayerInfo,
  DEFAULT_CUSTOM_RULES,
  DEFAULT_ROOM_SETTINGS,
  validatePassword,
  hashPassword,
  verifyPassword,
  RoomVisibility,
} from '../types/room-custom';
import { Player, GameConfig } from '../types';
import { config } from '../config';

// 玩家信息（包含 socket 映射）
interface RoomPlayer extends Player {
  isReady: boolean;
}

export class CustomRoomService {
  private rooms: Map<string, CustomRoom> = new Map();
  private roomPlayers: Map<string, Map<string, RoomPlayer>> = new Map(); // roomId -> (playerId -> Player)
  private playerSocketMap: Map<string, { roomId: string; playerId: string }> = new Map(); // socketId -> {roomId, playerId}

  // ==================== 房间创建 ====================

  /**
   * 创建自定义房间
   * @param hostName 房主名称
   * @param hostSocketId 房主 Socket ID
   * @param request 创建请求
   * @returns 创建的房间信息
   */
  createCustomRoom(
    hostName: string,
    hostSocketId: string,
    request: CreateCustomRoomRequest
  ): { room: CustomRoom; host: RoomPlayer } {
    // 验证密码（如果提供了）
    if (request.visibility === 'private' && request.password) {
      const validation = validatePassword(request.password);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
    }

    const roomId = this.generateRoomCode();
    const playerId = uuidv4();

    // 创建房主
    const host: RoomPlayer = {
      id: playerId,
      socketId: hostSocketId,
      name: hostName,
      avatar: this.generateAvatar(),
      isAlive: true,
      isConnected: true,
      isReady: true, // 房主默认准备
      position: { x: 0, y: 0 },
      tasks: [],
      completedTasks: [],
      canKill: false,
      killCooldown: 0,
      joinedAt: new Date(),
    };

    // 合并自定义规则
    const customRules: CustomGameRules = {
      ...DEFAULT_CUSTOM_RULES,
      ...request.customRules,
      roleSettings: {
        ...DEFAULT_CUSTOM_RULES.roleSettings,
        ...request.customRules?.roleSettings,
      },
      mechanics: {
        ...DEFAULT_CUSTOM_RULES.mechanics,
        ...request.customRules?.mechanics,
      },
      taskSettings: {
        ...DEFAULT_CUSTOM_RULES.taskSettings,
        ...request.customRules?.taskSettings,
      },
      votingSettings: {
        ...DEFAULT_CUSTOM_RULES.votingSettings,
        ...request.customRules?.votingSettings,
      },
      emergencySettings: {
        ...DEFAULT_CUSTOM_RULES.emergencySettings,
        ...request.customRules?.emergencySettings,
      },
    };

    // 合并房间设置
    const settings = {
      ...DEFAULT_ROOM_SETTINGS,
      ...request.settings,
    };

    // 创建房间
    const room: CustomRoom = {
      id: roomId,
      name: request.name || `${hostName}的房间`,
      hostId: playerId,
      visibility: request.visibility || 'public',
      password: request.visibility === 'private' && request.password
        ? hashPassword(request.password)
        : undefined,
      passwordHint: request.passwordHint,
      maxPlayers: request.maxPlayers || config.game.defaultMaxPlayers,
      minPlayers: request.minPlayers || 4,
      status: 'waiting',
      gameConfig: {
        catCount: 0,
        dogCount: 0,
        foxCount: 0,
        killCooldown: config.game.defaultKillCooldown,
        meetingCooldown: customRules.emergencySettings.meetingCooldown,
        discussionTime: config.game.defaultDiscussionTime,
        votingTime: config.game.defaultVotingTime,
        taskCount: customRules.taskSettings.shortTasks + customRules.taskSettings.longTasks,
        emergencyMeetings: customRules.emergencySettings.meetingsPerPlayer,
        ...request.gameConfig,
      },
      customRules,
      settings,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastActivityAt: new Date(),
    };

    // 保存房间和玩家
    this.rooms.set(roomId, room);
    this.roomPlayers.set(roomId, new Map([[playerId, host]]));
    this.playerSocketMap.set(hostSocketId, { roomId, playerId });

    console.log(`[CustomRoom] 创建房间: ${roomId} by ${hostName}, 可见性: ${room.visibility}`);

    return { room, host };
  }

  // ==================== 加入房间 ====================

  /**
   * 加入房间（带密码验证）
   * @param request 加入请求
   * @param socketId 玩家 Socket ID
   * @returns 加入结果
   */
  joinRoom(
    request: JoinRoomWithPasswordRequest,
    socketId: string
  ): { success: boolean; room?: CustomRoom; player?: RoomPlayer; error?: string; hint?: string } {
    const room = this.rooms.get(request.roomId);

    if (!room) {
      return { success: false, error: '房间不存在' };
    }

    if (room.status !== 'waiting') {
      return { success: false, error: '房间正在游戏中，无法加入' };
    }

    const players = this.roomPlayers.get(request.roomId);
    if (!players) {
      return { success: false, error: '房间数据错误' };
    }

    if (players.size >= room.maxPlayers) {
      return { success: false, error: '房间已满' };
    }

    // 验证密码
    if (room.visibility === 'private' && room.password) {
      if (!request.password) {
        return { 
          success: false, 
          error: '需要密码', 
          hint: room.passwordHint 
        };
      }

      if (!verifyPassword(request.password, room.password)) {
        return { success: false, error: '密码错误' };
      }
    }

    // 创建新玩家
    const playerId = uuidv4();
    const player: RoomPlayer = {
      id: playerId,
      socketId,
      name: request.playerName,
      avatar: this.generateAvatar(),
      isAlive: true,
      isConnected: true,
      isReady: false,
      position: { x: 0, y: 0 },
      tasks: [],
      completedTasks: [],
      canKill: false,
      killCooldown: 0,
      joinedAt: new Date(),
    };

    // 保存玩家
    players.set(playerId, player);
    this.playerSocketMap.set(socketId, { roomId: request.roomId, playerId });

    // 更新房间时间
    room.updatedAt = new Date();
    room.lastActivityAt = new Date();

    console.log(`[CustomRoom] 玩家加入: ${request.playerName} -> ${request.roomId}`);

    return { success: true, room, player };
  }

  /**
   * 快速加入公开房间
   * @param playerName 玩家名称
   * @param socketId Socket ID
   * @returns 加入结果
   */
  quickJoin(playerName: string, socketId: string): { 
    success: boolean; 
    room?: CustomRoom; 
    player?: RoomPlayer; 
    error?: string 
  } {
    // 查找可用的公开房间
    const availableRooms = Array.from(this.rooms.values())
      .filter(r => 
        r.visibility === 'public' && 
        r.status === 'waiting' && 
        (this.roomPlayers.get(r.id)?.size || 0) < r.maxPlayers
      )
      .sort((a, b) => (this.roomPlayers.get(b.id)?.size || 0) - (this.roomPlayers.get(a.id)?.size || 0)); // 优先人数多的

    if (availableRooms.length === 0) {
      return { success: false, error: '暂无可用房间，请创建新房间' };
    }

    // 加入第一个可用房间
    const targetRoom = availableRooms[0];
    return this.joinRoom(
      { roomId: targetRoom.id, playerName },
      socketId
    );
  }

  // ==================== 离开房间 ====================

  /**
   * 玩家离开房间
   * @param socketId 玩家 Socket ID
   * @returns 更新后的房间（如果房间还在）
   */
  leaveRoom(socketId: string): { roomId: string; room?: CustomRoom; newHostId?: string; isDisbanded: boolean } {
    const mapping = this.playerSocketMap.get(socketId);
    if (!mapping) {
      return { roomId: '', isDisbanded: false };
    }

    const { roomId, playerId } = mapping;
    const room = this.rooms.get(roomId);
    const players = this.roomPlayers.get(roomId);

    if (!room || !players) {
      this.playerSocketMap.delete(socketId);
      return { roomId, isDisbanded: false };
    }

    // 移除玩家
    players.delete(playerId);
    this.playerSocketMap.delete(socketId);

    let newHostId: string | undefined;
    let isDisbanded = false;

    // 如果房间空了，删除房间
    if (players.size === 0) {
      this.rooms.delete(roomId);
      this.roomPlayers.delete(roomId);
      isDisbanded = true;
      console.log(`[CustomRoom] 房间解散: ${roomId}`);
    } else {
      // 如果房主离开，转让房主给最早加入的玩家
      if (room.hostId === playerId) {
        const sortedPlayers = Array.from(players.values()).sort(
          (a, b) => a.joinedAt.getTime() - b.joinedAt.getTime()
        );
        newHostId = sortedPlayers[0].id;
        room.hostId = newHostId;
        sortedPlayers[0].isReady = true; // 新房主自动准备
      }

      room.updatedAt = new Date();
      console.log(`[CustomRoom] 玩家离开: ${roomId}, 剩余: ${players.size}`);
    }

    return { roomId, room: isDisbanded ? undefined : room, newHostId, isDisbanded };
  }

  // ==================== 房间管理 ====================

  /**
   * 踢出玩家（仅房主）
   * @param roomId 房间 ID
   * @param hostId 房主 ID
   * @param targetPlayerId 目标玩家 ID
   * @returns 是否成功
   */
  kickPlayer(roomId: string, hostId: string, targetPlayerId: string): { success: boolean; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: '房间不存在' };
    }

    if (room.hostId !== hostId) {
      return { success: false, error: '只有房主可以踢人' };
    }

    if (hostId === targetPlayerId) {
      return { success: false, error: '不能踢出自己' };
    }

    const players = this.roomPlayers.get(roomId);
    if (!players || !players.has(targetPlayerId)) {
      return { success: false, error: '玩家不在房间中' };
    }

    // 获取被踢玩家的 socketId
    const targetPlayer = players.get(targetPlayerId)!;
    
    // 移除玩家
    players.delete(targetPlayerId);
    this.playerSocketMap.delete(targetPlayer.socketId);

    room.updatedAt = new Date();

    console.log(`[CustomRoom] 玩家被踢: ${targetPlayerId} from ${roomId}`);

    return { success: true };
  }

  /**
   * 转让房主
   * @param roomId 房间 ID
   * @param hostId 当前房主 ID
   * @param newHostId 新房主 ID
   * @returns 是否成功
   */
  transferHost(roomId: string, hostId: string, newHostId: string): { success: boolean; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: '房间不存在' };
    }

    if (room.hostId !== hostId) {
      return { success: false, error: '只有房主可以转让' };
    }

    const players = this.roomPlayers.get(roomId);
    if (!players || !players.has(newHostId)) {
      return { success: false, error: '目标玩家不在房间中' };
    }

    // 旧房主取消准备状态
    const oldHost = players.get(hostId);
    if (oldHost) {
      oldHost.isReady = false;
    }

    // 新房主设置准备状态
    const newHost = players.get(newHostId);
    if (newHost) {
      newHost.isReady = true;
    }

    room.hostId = newHostId;
    room.updatedAt = new Date();

    console.log(`[CustomRoom] 房主转让: ${roomId} ${hostId} -> ${newHostId}`);

    return { success: true };
  }

  /**
   * 设置/修改密码
   * @param roomId 房间 ID
   * @param hostId 房主 ID
   * @param password 新密码（undefined 表示移除密码）
   * @param passwordHint 密码提示
   * @returns 是否成功
   */
  setPassword(
    roomId: string, 
    hostId: string, 
    password?: string, 
    passwordHint?: string,
    removePassword?: boolean
  ): { success: boolean; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: '房间不存在' };
    }

    if (room.hostId !== hostId) {
      return { success: false, error: '只有房主可以设置密码' };
    }

    if (removePassword) {
      room.visibility = 'public';
      room.password = undefined;
      room.passwordHint = undefined;
    } else if (password) {
      const validation = validatePassword(password);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      room.visibility = 'private';
      room.password = hashPassword(password);
      room.passwordHint = passwordHint;
    }

    room.updatedAt = new Date();

    console.log(`[CustomRoom] 密码更新: ${roomId}, 可见性: ${room.visibility}`);

    return { success: true };
  }

  // ==================== 玩家状态 ====================

  /**
   * 设置玩家准备状态
   * @param socketId 玩家 Socket ID
   * @param isReady 是否准备
   * @returns 更新后的玩家和房间
   */
  setPlayerReady(socketId: string, isReady: boolean): { 
    success: boolean; 
    roomId?: string; 
    playerId?: string; 
    isReady?: boolean;
    allReady?: boolean;
    error?: string 
  } {
    const mapping = this.playerSocketMap.get(socketId);
    if (!mapping) {
      return { success: false, error: '玩家不在任何房间中' };
    }

    const { roomId, playerId } = mapping;
    const players = this.roomPlayers.get(roomId);
    if (!players) {
      return { success: false, error: '房间不存在' };
    }

    const player = players.get(playerId);
    if (!player) {
      return { success: false, error: '玩家不存在' };
    }

    player.isReady = isReady;

    // 检查是否全部准备
    const allPlayers = Array.from(players.values());
    const allReady = allPlayers.every(p => p.isReady) && allPlayers.length >= 4;

    return { 
      success: true, 
      roomId, 
      playerId, 
      isReady,
      allReady
    };
  }

  /**
   * 获取所有玩家
   * @param roomId 房间 ID
   */
  getPlayers(roomId: string): RoomPlayer[] {
    const players = this.roomPlayers.get(roomId);
    return players ? Array.from(players.values()) : [];
  }

  /**
   * 获取单个玩家
   * @param roomId 房间 ID
   * @param playerId 玩家 ID
   */
  getPlayer(roomId: string, playerId: string): RoomPlayer | undefined {
    const players = this.roomPlayers.get(roomId);
    return players?.get(playerId);
  }

  /**
   * 通过 Socket ID 获取玩家
   * @param socketId Socket ID
   */
  getPlayerBySocket(socketId: string): { roomId: string; player: RoomPlayer } | null {
    const mapping = this.playerSocketMap.get(socketId);
    if (!mapping) return null;

    const player = this.getPlayer(mapping.roomId, mapping.playerId);
    if (!player) return null;

    return { roomId: mapping.roomId, player };
  }

  // ==================== 房间设置更新 ====================

  /**
   * 更新房间设置（仅房主）
   * @param roomId 房间 ID
   * @param hostId 房主 ID
   * @param updates 更新内容
   * @returns 更新后的房间
   */
  updateRoomSettings(
    roomId: string,
    hostId: string,
    updates: {
      gameConfig?: Partial<GameConfig>;
      customRules?: Partial<CustomGameRules>;
      settings?: Partial<CustomRoom['settings']>;
    }
  ): { success: boolean; room?: CustomRoom; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: '房间不存在' };
    }

    if (room.hostId !== hostId) {
      return { success: false, error: '只有房主可以修改设置' };
    }

    if (room.status !== 'waiting') {
      return { success: false, error: '游戏进行中无法修改设置' };
    }

    // 更新游戏配置
    if (updates.gameConfig) {
      room.gameConfig = { ...room.gameConfig, ...updates.gameConfig };
    }

    // 更新自定义规则
    if (updates.customRules) {
      room.customRules = {
        ...room.customRules,
        ...updates.customRules,
        roleSettings: { ...room.customRules.roleSettings, ...updates.customRules.roleSettings },
        mechanics: { ...room.customRules.mechanics, ...updates.customRules.mechanics },
        taskSettings: { ...room.customRules.taskSettings, ...updates.customRules.taskSettings },
        votingSettings: { ...room.customRules.votingSettings, ...updates.customRules.votingSettings },
        emergencySettings: { ...room.customRules.emergencySettings, ...updates.customRules.emergencySettings },
      };
    }

    // 更新房间设置
    if (updates.settings) {
      room.settings = { ...room.settings, ...updates.settings };
    }

    room.updatedAt = new Date();

    console.log(`[CustomRoom] 设置更新: ${roomId}`);

    return { success: true, room };
  }

  // ==================== 房间列表 ====================

  /**
   * 获取公开房间列表
   */
  getPublicRoomList(): PublicRoomInfo[] {
    return Array.from(this.rooms.values())
      .filter((room) => room.visibility === 'public' && room.status === 'waiting')
      .map((room) => {
        const players = this.roomPlayers.get(room.id);
        const host = players?.get(room.hostId);
        return {
          id: room.id,
          name: room.name,
          hostName: host?.name || 'Unknown',
          playerCount: players?.size || 0,
          maxPlayers: room.maxPlayers,
          hasPassword: false,
          status: room.status,
          gameMode: this.getGameModeDescription(room.customRules),
          tags: [], // TODO: 实现标签系统
        };
      })
      .sort((a, b) => b.playerCount - a.playerCount); // 人数多的在前
  }

  /**
   * 获取房间详情
   * @param roomId 房间 ID
   * @param playerId 请求者玩家 ID
   */
  getRoomDetails(roomId: string, playerId: string): RoomDetails | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const players = this.roomPlayers.get(roomId);
    if (!players) return null;

    const host = players.get(room.hostId);

    return {
      id: room.id,
      name: room.name,
      hostId: room.hostId,
      hostName: host?.name || 'Unknown',
      visibility: room.visibility,
      passwordHint: room.passwordHint,
      players: Array.from(players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isHost: p.id === room.hostId,
        isReady: p.isReady,
        isConnected: p.isConnected,
        joinedAt: p.joinedAt,
      })),
      maxPlayers: room.maxPlayers,
      minPlayers: room.minPlayers,
      status: room.status,
      gameConfig: room.gameConfig,
      customRules: room.customRules,
      settings: room.settings,
      isHost: playerId === room.hostId,
    };
  }

  /**
   * 获取房间（内部使用）
   * @param roomId 房间 ID
   */
  getRoom(roomId: string): CustomRoom | undefined {
    return this.rooms.get(roomId);
  }

  // ==================== 游戏状态管理 ====================

  /**
   * 开始游戏
   * @param roomId 房间 ID
   * @param hostId 房主 ID
   */
  startGame(roomId: string, hostId: string): { success: boolean; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: '房间不存在' };
    }

    if (room.hostId !== hostId) {
      return { success: false, error: '只有房主可以开始游戏' };
    }

    const players = this.roomPlayers.get(roomId);
    if (!players) {
      return { success: false, error: '房间数据错误' };
    }

    if (players.size < room.minPlayers) {
      return { success: false, error: `人数不足，至少需要 ${room.minPlayers} 人` };
    }

    // 检查是否全部准备
    const allReady = Array.from(players.values()).every(p => p.isReady);
    if (!allReady) {
      return { success: false, error: '还有玩家未准备' };
    }

    room.status = 'playing';
    room.updatedAt = new Date();

    console.log(`[CustomRoom] 游戏开始: ${roomId}`);

    return { success: true };
  }

  /**
   * 结束游戏
   * @param roomId 房间 ID
   */
  endGame(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.status = 'ended';
    room.updatedAt = new Date();

    // 重置玩家准备状态
    const players = this.roomPlayers.get(roomId);
    if (players) {
      players.forEach(p => {
        p.isReady = false;
        p.isAlive = true;
      });
    }

    console.log(`[CustomRoom] 游戏结束: ${roomId}`);
  }

  // ==================== 工具方法 ====================

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (this.rooms.has(code)) {
      return this.generateRoomCode();
    }
    return code;
  }

  private generateAvatar(): string {
    const avatars = ['🐱', '🐶', '🦊', '🐭', '🐹', '🐰', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐙'];
    return avatars[Math.floor(Math.random() * avatars.length)];
  }

  private getGameModeDescription(rules: CustomGameRules): string {
    if (rules.mechanics.playerSpeed > 1.1) return '快速模式';
    if (rules.taskSettings.shortTasks > 3) return '任务狂魔';
    if (!rules.mechanics.showPlayerNames) return '隐藏身份';
    return '经典模式';
  }

  // ==================== 清理 ====================

  /**
   * 清理空闲房间（可定时调用）
   * @param maxIdleTimeMs 最大空闲时间（毫秒）
   */
  cleanupIdleRooms(maxIdleTimeMs: number = 30 * 60 * 1000): string[] {
    const now = Date.now();
    const removedRooms: string[] = [];

    this.rooms.forEach((room, roomId) => {
      if (now - room.lastActivityAt.getTime() > maxIdleTimeMs) {
        // 清理房间
        const players = this.roomPlayers.get(roomId);
        if (players) {
          players.forEach((player) => {
            this.playerSocketMap.delete(player.socketId);
          });
          this.roomPlayers.delete(roomId);
        }
        this.rooms.delete(roomId);
        removedRooms.push(roomId);
        console.log(`[CustomRoom] 清理空闲房间: ${roomId}`);
      }
    });

    return removedRooms;
  }
}

// 单例导出
export const customRoomService = new CustomRoomService();
export default customRoomService;
