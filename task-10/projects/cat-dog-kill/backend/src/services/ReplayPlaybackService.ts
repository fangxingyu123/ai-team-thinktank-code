import { Replay, IReplay } from '../models/Replay';
import {
  ReplayMetadata,
  ReplayData,
  AnyReplayEvent,
  Keyframe,
  ReplayListQuery,
  ReplayListResponse,
  ReplayPlaybackState,
  ReplayPlayerSettings,
} from '../types/replay';

/**
 * 回放播放服务
 * 
 * 管理回放的加载、播放控制和状态同步
 * 支持功能：
 * - 回放列表查询
 * - 回放数据加载
 * - 播放控制（播放/暂停/跳转）
 * - 事件流推送
 * - 关键帧快速定位
 */
export class ReplayPlaybackService {
  // 活跃的播放器会话
  private activePlayers: Map<string, ReplayPlayerSession> = new Map();
  
  // 配置
  private readonly config = {
    defaultPlaybackSpeed: 1,
    supportedSpeeds: [0.5, 1, 2, 4],
    eventBatchSize: 50,           // 每批发送的事件数
    preloadAheadTime: 5000,       // 预加载时间（毫秒）
  };

  /**
   * 获取回放列表
   */
  async getReplayList(query: ReplayListQuery): Promise<ReplayListResponse> {
    return await (Replay as any).findByQuery(query);
  }

  /**
   * 获取回放详情
   */
  async getReplayDetail(replayId: string): Promise<ReplayMetadata | null> {
    const replay = await Replay.findOne({ 
      replayId, 
      isDeleted: false 
    }).lean();
    
    if (!replay) return null;
    
    return this.transformToMetadata(replay);
  }

  /**
   * 获取回放完整数据
   */
  async getReplayData(replayId: string): Promise<ReplayData | null> {
    const replay = await Replay.findOne({ 
      replayId, 
      isDeleted: false 
    });
    
    if (!replay) return null;
    
    // 增加查看次数
    await replay.incrementViewCount();
    
    return replay.toReplayData();
  }

  /**
   * 加载回放（创建播放器会话）
   */
  async loadReplay(sessionId: string, replayId: string): Promise<{ success: boolean; error?: string; metadata?: ReplayMetadata }> {
    // 检查是否已存在会话
    if (this.activePlayers.has(sessionId)) {
      this.cleanupSession(sessionId);
    }

    // 获取回放数据
    const replay = await Replay.findOne({ 
      replayId, 
      isDeleted: false 
    });
    
    if (!replay) {
      return { success: false, error: '回放不存在或已被删除' };
    }

    // 创建播放器会话
    const session: ReplayPlayerSession = {
      sessionId,
      replayId,
      replay,
      currentTime: 0,
      totalDuration: replay.duration * 1000, // 转换为毫秒
      isPlaying: false,
      playbackSpeed: this.config.defaultPlaybackSpeed,
      currentFrame: 0,
      totalFrames: replay.eventCount,
      settings: {
        showRoles: false,  // 默认不剧透
        showChat: true,
        showFogOfWar: false,
        playbackSpeed: this.config.defaultPlaybackSpeed,
      },
      lastUpdateTime: Date.now(),
      eventQueue: [],
      loadedEvents: replay.events.map((e: any) => ({
        id: e.id,
        type: e.type,
        timestamp: e.timestamp,
        frameIndex: e.frameIndex,
        ...e.data,
      })),
      keyframes: replay.keyframes.map((k: any) => ({
        timestamp: k.timestamp,
        frameIndex: k.frameIndex,
        playerPositions: Object.fromEntries(k.playerPositions || new Map()),
        gameState: k.gameState,
      })),
    };

    this.activePlayers.set(sessionId, session);

    // 返回元数据（不包含完整事件数据）
    return {
      success: true,
      metadata: replay.toMetadata(),
    };
  }

  /**
   * 开始播放
   */
  play(sessionId: string): ReplayPlaybackState | null {
    const session = this.activePlayers.get(sessionId);
    if (!session) return null;

    session.isPlaying = true;
    session.lastUpdateTime = Date.now();

    return this.getPlaybackState(session);
  }

  /**
   * 暂停播放
   */
  pause(sessionId: string): ReplayPlaybackState | null {
    const session = this.activePlayers.get(sessionId);
    if (!session) return null;

    session.isPlaying = false;

    return this.getPlaybackState(session);
  }

  /**
   * 跳转到指定时间
   */
  seek(sessionId: string, timestamp: number): { state: ReplayPlaybackState | null; events: AnyReplayEvent[]; keyframe: Keyframe | null } {
    const session = this.activePlayers.get(sessionId);
    if (!session) {
      return { state: null, events: [], keyframe: null };
    }

    // 限制时间范围
    timestamp = Math.max(0, Math.min(timestamp, session.totalDuration));
    session.currentTime = timestamp;

    // 找到对应的关键帧
    const keyframe = this.findNearestKeyframe(session, timestamp);
    
    // 收集从关键帧到当前时间的所有事件
    const events = this.collectEventsInRange(session, keyframe?.timestamp ?? 0, timestamp);

    // 更新当前帧索引
    const lastEvent = events[events.length - 1];
    if (lastEvent) {
      session.currentFrame = lastEvent.frameIndex;
    }

    return {
      state: this.getPlaybackState(session),
      events,
      keyframe,
    };
  }

  /**
   * 设置播放速度
   */
  setPlaybackSpeed(sessionId: string, speed: number): ReplayPlaybackState | null {
    const session = this.activePlayers.get(sessionId);
    if (!session) return null;

    // 验证速度是否支持
    if (!this.config.supportedSpeeds.includes(speed)) {
      speed = this.config.defaultPlaybackSpeed;
    }

    session.playbackSpeed = speed;
    session.settings.playbackSpeed = speed;

    return this.getPlaybackState(session);
  }

  /**
   * 设置跟随玩家
   */
  setFollowPlayer(sessionId: string, playerId: string | null): boolean {
    const session = this.activePlayers.get(sessionId);
    if (!session) return false;

    session.settings.followPlayerId = playerId;
    return true;
  }

  /**
   * 更新播放器设置
   */
  updateSettings(sessionId: string, settings: Partial<ReplayPlayerSettings>): boolean {
    const session = this.activePlayers.get(sessionId);
    if (!session) return false;

    Object.assign(session.settings, settings);
    return true;
  }

  /**
   * 获取播放状态
   */
  getPlaybackState(sessionId: string): ReplayPlaybackState | null {
    const session = this.activePlayers.get(sessionId);
    if (!session) return null;

    return this.getPlaybackState(session);
  }

  /**
   * 更新播放进度（由定时器调用）
   */
  updateProgress(sessionId: string): { state: ReplayPlaybackState | null; newEvents: AnyReplayEvent[] } {
    const session = this.activePlayers.get(sessionId);
    if (!session || !session.isPlaying) {
      return { state: null, newEvents: [] };
    }

    const now = Date.now();
    const deltaTime = now - session.lastUpdateTime;
    session.lastUpdateTime = now;

    // 根据播放速度计算实际推进的时间
    const progressDelta = deltaTime * session.playbackSpeed;
    const previousTime = session.currentTime;
    session.currentTime += progressDelta;

    // 检查是否播放到结尾
    if (session.currentTime >= session.totalDuration) {
      session.currentTime = session.totalDuration;
      session.isPlaying = false;
    }

    // 收集新触发的事件
    const newEvents = this.collectEventsInRange(session, previousTime, session.currentTime);

    // 更新当前帧
    if (newEvents.length > 0) {
      session.currentFrame = newEvents[newEvents.length - 1].frameIndex;
    }

    return {
      state: this.getPlaybackState(session),
      newEvents,
    };
  }

  /**
   * 获取下一批事件（用于流式传输）
   */
  getNextEventBatch(sessionId: string, count: number = this.config.eventBatchSize): AnyReplayEvent[] {
    const session = this.activePlayers.get(sessionId);
    if (!session) return [];

    const startIndex = session.currentFrame;
    const endIndex = Math.min(startIndex + count, session.loadedEvents.length);
    
    return session.loadedEvents.slice(startIndex, endIndex);
  }

  /**
   * 获取特定时间点的游戏状态快照
   */
  getSnapshotAtTime(sessionId: string, timestamp: number): { keyframe: Keyframe | null; events: AnyReplayEvent[] } {
    const session = this.activePlayers.get(sessionId);
    if (!session) {
      return { keyframe: null, events: [] };
    }

    const keyframe = this.findNearestKeyframe(session, timestamp);
    const events = this.collectEventsInRange(session, keyframe?.timestamp ?? 0, timestamp);

    return { keyframe, events };
  }

  /**
   * 清理播放器会话
   */
  cleanupSession(sessionId: string): void {
    const session = this.activePlayers.get(sessionId);
    if (session) {
      session.isPlaying = false;
      session.eventQueue = [];
      this.activePlayers.delete(sessionId);
      console.log(`[ReplayPlayback] 清理播放器会话: ${sessionId}`);
    }
  }

  /**
   * 获取活跃会话数量
   */
  getActiveSessionCount(): number {
    return this.activePlayers.size;
  }

  /**
   * 删除回放（软删除）
   */
  async deleteReplay(replayId: string): Promise<boolean> {
    const result = await Replay.updateOne(
      { replayId },
      { isDeleted: true, deletedAt: new Date() }
    );
    return result.modifiedCount > 0;
  }

  /**
   * 获取用户的回放历史
   */
  async getUserReplays(userId: string, page: number = 1, limit: number = 20): Promise<ReplayListResponse> {
    return await this.getReplayList({
      userId,
      page,
      limit,
      sortBy: 'date',
      sortOrder: 'desc',
    });
  }

  /**
   * 获取房间的所有回放
   */
  async getRoomReplays(roomId: string, page: number = 1, limit: number = 20): Promise<ReplayListResponse> {
    const replays = await Replay.find({ roomId, isDeleted: false })
      .sort({ startTime: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Replay.countDocuments({ roomId, isDeleted: false });

    return {
      replays: replays.map((r: any) => this.transformToMetadata(r)),
      total,
      page,
      limit,
      hasMore: total > page * limit,
    };
  }

  // ==================== 私有方法 ====================

  /**
   * 获取播放状态对象
   */
  private getPlaybackState(session: ReplayPlayerSession): ReplayPlaybackState {
    return {
      isPlaying: session.isPlaying,
      currentTime: session.currentTime,
      totalDuration: session.totalDuration,
      playbackSpeed: session.playbackSpeed,
      currentFrame: session.currentFrame,
      totalFrames: session.totalFrames,
    };
  }

  /**
   * 查找最近的关键帧
   */
  private findNearestKeyframe(session: ReplayPlayerSession, timestamp: number): Keyframe | null {
    let nearest: Keyframe | null = null;
    let minDiff = Infinity;

    for (const keyframe of session.keyframes) {
      const diff = timestamp - keyframe.timestamp;
      if (diff >= 0 && diff < minDiff) {
        minDiff = diff;
        nearest = keyframe;
      }
    }

    return nearest;
  }

  /**
   * 收集时间范围内的事件
   */
  private collectEventsInRange(session: ReplayPlayerSession, startTime: number, endTime: number): AnyReplayEvent[] {
    return session.loadedEvents.filter(
      (event) => event.timestamp > startTime && event.timestamp <= endTime
    );
  }

  /**
   * 转换数据库记录为元数据
   */
  private transformToMetadata(replay: any): ReplayMetadata {
    return {
      id: replay.replayId,
      roomId: replay.roomId,
      gameId: replay.gameId,
      mapId: replay.mapId,
      mapName: replay.mapName,
      startTime: replay.startTime,
      endTime: replay.endTime,
      duration: replay.duration,
      players: replay.players,
      playerCount: replay.playerCount,
      winner: replay.winner,
      endReason: replay.endReason,
      totalKills: replay.totalKills,
      totalTasksCompleted: replay.totalTasksCompleted,
      totalMeetings: replay.totalMeetings,
      version: replay.version,
      recordedAt: replay.recordedAt,
      fileSize: replay.fileSize,
    };
  }
}

// ==================== 播放器会话接口 ====================

interface ReplayPlayerSession {
  sessionId: string;
  replayId: string;
  replay: IReplay;
  currentTime: number;
  totalDuration: number;
  isPlaying: boolean;
  playbackSpeed: number;
  currentFrame: number;
  totalFrames: number;
  settings: ReplayPlayerSettings;
  lastUpdateTime: number;
  eventQueue: AnyReplayEvent[];
  loadedEvents: AnyReplayEvent[];
  keyframes: Keyframe[];
}

// 导出单例
export const replayPlaybackService = new ReplayPlaybackService();
export default replayPlaybackService;
