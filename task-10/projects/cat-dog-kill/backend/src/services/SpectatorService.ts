import { v4 as uuidv4 } from 'uuid';
import {
  Spectator,
  SpectatorConfig,
  SpectatorRoomState,
  GameHistoryEvent,
  SpectatorGameState,
  SpectatorPlayerView,
  SpectatorMeetingView,
  SpectatorViewMode,
  GameHistoryEventType,
} from '../types/spectator';
import { Room, Player, GameState, Meeting, MeetingResult, Position } from '../types';

/**
 * 观战服务 - 管理观战者、延迟广播、视角控制
 */
export class SpectatorService {
  // 房间ID -> 观战状态
  private spectatorRooms: Map<string, SpectatorRoomState> = new Map();
  // 默认观战配置
  private defaultConfig: SpectatorConfig = {
    enabled: true,
    maxSpectators: 10,
    delaySeconds: 5, // 5秒延迟防止作弊
    revealRoles: true, // 观战者可以看到所有角色
    allowFreeCamera: true,
    allowPlayerSwitch: true,
  };

  // ==================== 房间管理 ====================

  /**
   * 初始化房间的观战功能
   */
  initRoom(roomId: string, config?: Partial<SpectatorConfig>): void {
    if (!this.spectatorRooms.has(roomId)) {
      this.spectatorRooms.set(roomId, {
        spectators: new Map(),
        config: { ...this.defaultConfig, ...config },
        gameHistory: [],
      });
    }
  }

  /**
   * 清理房间的观战数据
   */
  cleanupRoom(roomId: string): void {
    this.spectatorRooms.delete(roomId);
  }

  /**
   * 获取房间的观战配置
   */
  getConfig(roomId: string): SpectatorConfig | null {
    const state = this.spectatorRooms.get(roomId);
    return state?.config || null;
  }

  /**
   * 更新观战配置
   */
  updateConfig(roomId: string, config: Partial<SpectatorConfig>): boolean {
    const state = this.spectatorRooms.get(roomId);
    if (!state) return false;

    state.config = { ...state.config, ...config };
    return true;
  }

  // ==================== 观战者管理 ====================

  /**
   * 添加观战者
   */
  addSpectator(
    roomId: string,
    socketId: string,
    playerName: string
  ): { spectator: Spectator; error?: string } {
    // 确保房间已初始化
    this.initRoom(roomId);

    const state = this.spectatorRooms.get(roomId)!;

    // 检查是否允许观战
    if (!state.config.enabled) {
      return { spectator: null as any, error: '该房间不允许观战' };
    }

    // 检查观战人数
    if (state.spectators.size >= state.config.maxSpectators) {
      return { spectator: null as any, error: '观战人数已满' };
    }

    // 检查是否已经在观战
    for (const [_, spec] of state.spectators) {
      if (spec.socketId === socketId) {
        return { spectator: spec };
      }
    }

    const spectator: Spectator = {
      id: uuidv4(),
      socketId,
      name: playerName,
      avatar: this.generateAvatar(),
      joinedAt: new Date(),
      isConnected: true,
    };

    state.spectators.set(spectator.id, spectator);

    return { spectator };
  }

  /**
   * 移除观战者
   */
  removeSpectator(roomId: string, spectatorId: string): boolean {
    const state = this.spectatorRooms.get(roomId);
    if (!state) return false;

    return state.spectators.delete(spectatorId);
  }

  /**
   * 通过socketId移除观战者
   */
  removeSpectatorBySocketId(roomId: string, socketId: string): string | null {
    const state = this.spectatorRooms.get(roomId);
    if (!state) return null;

    for (const [id, spec] of state.spectators) {
      if (spec.socketId === socketId) {
        state.spectators.delete(id);
        return id;
      }
    }
    return null;
  }

  /**
   * 获取观战者
   */
  getSpectator(roomId: string, spectatorId: string): Spectator | undefined {
    const state = this.spectatorRooms.get(roomId);
    return state?.spectators.get(spectatorId);
  }

  /**
   * 获取所有观战者
   */
  getAllSpectators(roomId: string): Spectator[] {
    const state = this.spectatorRooms.get(roomId);
    if (!state) return [];
    return Array.from(state.spectators.values());
  }

  /**
   * 获取观战者数量
   */
  getSpectatorCount(roomId: string): number {
    const state = this.spectatorRooms.get(roomId);
    return state?.spectators.size || 0;
  }

  /**
   * 设置观战者跟随的玩家
   */
  setFollowingPlayer(roomId: string, spectatorId: string, playerId: string): boolean {
    const spectator = this.getSpectator(roomId, spectatorId);
    if (!spectator) return false;

    spectator.followingPlayerId = playerId;
    return true;
  }

  /**
   * 设置自由视角位置
   */
  setFreeCameraPosition(
    roomId: string,
    spectatorId: string,
    position: Position
  ): boolean {
    const spectator = this.getSpectator(roomId, spectatorId);
    if (!spectator) return false;

    spectator.freeCameraPosition = position;
    return true;
  }

  // ==================== 游戏历史记录（延迟机制）====================

  /**
   * 记录游戏事件
   */
  recordGameEvent(
    roomId: string,
    type: GameHistoryEventType,
    data: any
  ): void {
    const state = this.spectatorRooms.get(roomId);
    if (!state) return;

    const event: GameHistoryEvent = {
      id: uuidv4(),
      type,
      timestamp: new Date(),
      data,
    };

    state.gameHistory.push(event);

    // 清理旧的历史记录（保留最近5分钟）
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    state.gameHistory = state.gameHistory.filter((e) => e.timestamp > fiveMinutesAgo);
  }

  /**
   * 获取延迟后的游戏事件
   */
  getDelayedEvents(roomId: string): GameHistoryEvent[] {
    const state = this.spectatorRooms.get(roomId);
    if (!state) return [];

    const delayMs = state.config.delaySeconds * 1000;
    const cutoffTime = new Date(Date.now() - delayMs);

    return state.gameHistory.filter((e) => e.timestamp <= cutoffTime);
  }

  /**
   * 清除历史记录
   */
  clearHistory(roomId: string): void {
    const state = this.spectatorRooms.get(roomId);
    if (state) {
      state.gameHistory = [];
    }
  }

  // ==================== 游戏状态转换 ====================

  /**
   * 将游戏状态转换为观战者视角
   */
  convertToSpectatorView(
    room: Room,
    revealRoles: boolean = true
  ): SpectatorGameState {
    const gameState = room.gameState;
    if (!gameState) {
      return {
        status: 'waiting',
        players: [],
        tasksCompleted: 0,
        totalTasks: 0,
        meetingsCalled: 0,
      };
    }

    const players: SpectatorPlayerView[] = Array.from(room.players.values()).map(
      (player) => this.convertPlayerToSpectatorView(player, revealRoles)
    );

    const spectatorState: SpectatorGameState = {
      status: gameState.status,
      players,
      tasksCompleted: gameState.tasksCompleted,
      totalTasks: gameState.totalTasks,
      meetingsCalled: gameState.meetingsCalled,
    };

    // 添加会议信息
    if (gameState.currentMeeting) {
      spectatorState.currentMeeting = this.convertMeetingToSpectatorView(
        gameState.currentMeeting,
        room
      );
    }

    // 添加结束信息
    if (gameState.winner) {
      spectatorState.winner = gameState.winner;
      spectatorState.endReason = gameState.endReason;
    }

    return spectatorState;
  }

  /**
   * 转换玩家信息为观战视角
   */
  private convertPlayerToSpectatorView(
    player: Player,
    revealRoles: boolean
  ): SpectatorPlayerView {
    const view: SpectatorPlayerView = {
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      isAlive: player.isAlive,
      position: player.position,
      completedTasks: player.completedTasks.length,
      totalTasks: player.tasks.length,
    };

    if (revealRoles) {
      view.role = player.role;
      view.team = player.team;
    }

    return view;
  }

  /**
   * 转换会议信息为观战视角
   */
  private convertMeetingToSpectatorView(
    meeting: Meeting,
    room: Room
  ): SpectatorMeetingView {
    const voteCount = new Map<string, number>();
    meeting.votes.forEach((targetId) => {
      if (targetId) {
        voteCount.set(targetId, (voteCount.get(targetId) || 0) + 1);
      }
    });

    // 计算剩余时间
    const config = room.gameConfig;
    const elapsed = Date.now() - meeting.startTime.getTime();
    const totalTime = (config.discussionTime + config.votingTime) * 1000;
    const timeRemaining = Math.max(0, Math.ceil((totalTime - elapsed) / 1000));

    const caller = room.players.get(meeting.callerId);

    return {
      id: meeting.id,
      type: meeting.type,
      callerName: caller?.name || 'Unknown',
      isActive: meeting.isActive,
      votes: meeting.votes,
      voteCount,
      timeRemaining,
    };
  }

  // ==================== 工具方法 ====================

  /**
   * 生成随机头像
   */
  private generateAvatar(): string {
    const avatars = ['👁️', '👀', '🎥', '📹', '📺', '🎬', '🎮', '🕹️', '👤', '🎭'];
    return avatars[Math.floor(Math.random() * avatars.length)];
  }

  /**
   * 获取观战者统计信息
   */
  getStats(roomId: string): {
    count: number;
    max: number;
    enabled: boolean;
    delaySeconds: number;
  } {
    const state = this.spectatorRooms.get(roomId);
    if (!state) {
      return { count: 0, max: 0, enabled: false, delaySeconds: 0 };
    }

    return {
      count: state.spectators.size,
      max: state.config.maxSpectators,
      enabled: state.config.enabled,
      delaySeconds: state.config.delaySeconds,
    };
  }
}

export const spectatorService = new SpectatorService();
export default spectatorService;
