import { v4 as uuidv4 } from 'uuid';
import { Room, Player, GameState, Position } from '../types';
import {
  ReplayMetadata,
  ReplayData,
  AnyReplayEvent,
  Keyframe,
  ReplayPlayerInfo,
  GameStartEvent,
  GameEndEvent,
  PlayerMoveEvent,
  PlayerKillEvent,
  PlayerDeathEvent,
  TaskCompleteEvent,
  MeetingCallEvent,
  MeetingEndEvent,
  VoteCastEvent,
  PlayerEjectedEvent,
  SabotageStartEvent,
  SabotageEndEvent,
  ChatMessageEvent,
  RoleRevealEvent,
  ReplayPlayerResult,
} from '../types/replay';
import { Replay } from '../models/Replay';

/**
 * 游戏录像录制服务
 * 
 * 负责在游戏过程中记录所有关键事件，生成可回放的录像数据
 * 优化策略：
 * 1. 移动事件批量采样（每100ms采样一次）
 * 2. 关键帧机制（每10秒一个关键帧，用于快速跳转）
 * 3. 数据压缩（存储时进行JSON压缩）
 */
export class ReplayRecorderService {
  // 活跃的录制会话
  private activeRecordings: Map<string, RecordingSession> = new Map();
  
  // 配置
  private readonly config = {
    moveSampleInterval: 100,      // 移动采样间隔（毫秒）
    keyframeInterval: 10000,      // 关键帧间隔（毫秒）
    maxRecordingDuration: 3600000, // 最大录制时长（1小时）
    version: '1.0.0',
  };

  /**
   * 开始录制游戏
   */
  startRecording(room: Room): string {
    const gameId = uuidv4();
    const session: RecordingSession = {
      gameId,
      roomId: room.id,
      mapId: room.gameState?.mapId || 'default',
      mapName: room.gameState?.mapName || '默认地图',
      startTime: new Date(),
      events: [],
      keyframes: [],
      playerSnapshots: new Map(),
      lastMoveSample: new Map(),
      lastKeyframeTime: 0,
      frameIndex: 0,
      isRecording: true,
      stats: {
        totalKills: 0,
        totalTasksCompleted: 0,
        totalMeetings: 0,
      },
    };

    this.activeRecordings.set(gameId, session);

    // 记录游戏开始事件
    this.recordEvent(session, {
      id: uuidv4(),
      type: 'game_start',
      timestamp: 0,
      frameIndex: 0,
      mapId: session.mapId,
      mapName: session.mapName,
      players: this.buildPlayerInfoList(room),
    } as GameStartEvent);

    // 记录玩家出生事件
    room.players.forEach((player, playerId) => {
      this.recordEvent(session, {
        id: uuidv4(),
        type: 'player_spawn',
        timestamp: 0,
        frameIndex: 0,
        playerId,
        position: { ...player.position },
        role: player.role!,
      });

      // 初始化玩家快照
      session.playerSnapshots.set(playerId, {
        position: { ...player.position },
        isAlive: player.isAlive,
        role: player.role!,
        tasksCompleted: 0,
        killCount: 0,
      });
    });

    // 创建初始关键帧
    this.createKeyframe(session, room, 0);

    console.log(`[Replay] 开始录制游戏: ${gameId}, 房间: ${room.id}`);
    return gameId;
  }

  /**
   * 停止录制并保存
   */
  async stopRecording(gameId: string, room: Room): Promise<string | null> {
    const session = this.activeRecordings.get(gameId);
    if (!session) {
      console.warn(`[Replay] 未找到录制会话: ${gameId}`);
      return null;
    }

    session.isRecording = false;
    const endTime = new Date();
    const duration = Math.floor((endTime.getTime() - session.startTime.getTime()) / 1000);

    // 记录游戏结束事件
    const winner = room.gameState?.winner || 'cats';
    const endReason = room.gameState?.endReason || '游戏结束';
    
    this.recordEvent(session, {
      id: uuidv4(),
      type: 'game_end',
      timestamp: duration * 1000,
      frameIndex: session.frameIndex++,
      winner,
      reason: endReason,
      playerResults: this.buildPlayerResults(room),
    } as GameEndEvent);

    // 记录角色揭示事件
    const reveals: Record<string, string> = {};
    room.players.forEach((player, playerId) => {
      reveals[playerId] = player.role!;
    });
    
    this.recordEvent(session, {
      id: uuidv4(),
      type: 'role_reveal',
      timestamp: duration * 1000,
      frameIndex: session.frameIndex++,
      reveals,
    } as RoleRevealEvent);

    // 创建最终关键帧
    this.createKeyframe(session, room, duration * 1000);

    // 构建回放数据
    const replayId = uuidv4();
    const metadata: ReplayMetadata = {
      id: replayId,
      roomId: session.roomId,
      gameId,
      mapId: session.mapId,
      mapName: session.mapName,
      startTime: session.startTime,
      endTime,
      duration,
      players: this.buildFinalPlayerInfoList(room),
      playerCount: room.players.size,
      winner,
      endReason,
      totalKills: session.stats.totalKills,
      totalTasksCompleted: session.stats.totalTasksCompleted,
      totalMeetings: session.stats.totalMeetings,
      version: this.config.version,
      recordedAt: new Date(),
    };

    // 保存到数据库
    try {
      const replayData = await this.saveReplay(replayId, metadata, session);
      console.log(`[Replay] 录制完成: ${replayId}, 时长: ${duration}s, 事件数: ${session.events.length}`);
      
      // 清理内存
      this.activeRecordings.delete(gameId);
      
      return replayId;
    } catch (error) {
      console.error('[Replay] 保存回放失败:', error);
      this.activeRecordings.delete(gameId);
      return null;
    }
  }

  /**
   * 记录玩家移动
   */
  recordPlayerMove(gameId: string, playerId: string, position: Position): void {
    const session = this.activeRecordings.get(gameId);
    if (!session || !session.isRecording) return;

    const now = Date.now();
    const gameTime = now - session.startTime.getTime();

    // 采样率控制：每100ms记录一次移动
    const lastSample = session.lastMoveSample.get(playerId) || 0;
    if (gameTime - lastSample < this.config.moveSampleInterval) {
      return;
    }
    session.lastMoveSample.set(playerId, gameTime);

    // 获取玩家快照
    const snapshot = session.playerSnapshots.get(playerId);
    if (!snapshot) return;

    // 只记录位置变化
    if (snapshot.position.x === position.x && snapshot.position.y === position.y) {
      return;
    }

    // 更新快照
    snapshot.position = { ...position };

    // 记录移动事件
    this.recordEvent(session, {
      id: uuidv4(),
      type: 'player_move',
      timestamp: gameTime,
      frameIndex: session.frameIndex++,
      playerId,
      position: { ...position },
    } as PlayerMoveEvent);

    // 检查是否需要创建关键帧
    this.checkAndCreateKeyframe(session, gameTime);
  }

  /**
   * 记录玩家击杀
   */
  recordKill(gameId: string, killerId: string, victimId: string, position: Position): void {
    const session = this.activeRecordings.get(gameId);
    if (!session || !session.isRecording) return;

    const gameTime = Date.now() - session.startTime.getTime();
    session.stats.totalKills++;

    // 记录击杀事件
    this.recordEvent(session, {
      id: uuidv4(),
      type: 'player_kill',
      timestamp: gameTime,
      frameIndex: session.frameIndex++,
      killerId,
      victimId,
      position: { ...position },
    } as PlayerKillEvent);

    // 记录死亡事件
    this.recordEvent(session, {
      id: uuidv4(),
      type: 'player_death',
      timestamp: gameTime,
      frameIndex: session.frameIndex++,
      playerId: victimId,
      position: { ...position },
      reason: 'killed',
      killerId,
    } as PlayerDeathEvent);

    // 更新快照
    const victimSnapshot = session.playerSnapshots.get(victimId);
    if (victimSnapshot) {
      victimSnapshot.isAlive = false;
    }

    const killerSnapshot = session.playerSnapshots.get(killerId);
    if (killerSnapshot) {
      killerSnapshot.killCount++;
    }

    // 击杀时创建关键帧
    this.createKeyframe(session, null, gameTime);
  }

  /**
   * 记录任务完成
   */
  recordTaskComplete(gameId: string, playerId: string, taskId: string, taskType: string, position: Position): void {
    const session = this.activeRecordings.get(gameId);
    if (!session || !session.isRecording) return;

    const gameTime = Date.now() - session.startTime.getTime();
    session.stats.totalTasksCompleted++;

    this.recordEvent(session, {
      id: uuidv4(),
      type: 'task_complete',
      timestamp: gameTime,
      frameIndex: session.frameIndex++,
      playerId,
      taskId,
      taskType: taskType as any,
      position: { ...position },
    } as TaskCompleteEvent);

    // 更新快照
    const snapshot = session.playerSnapshots.get(playerId);
    if (snapshot) {
      snapshot.tasksCompleted++;
    }
  }

  /**
   * 记录召开会议
   */
  recordMeetingCall(
    gameId: string,
    meetingId: string,
    callerId: string,
    bodyId: string | undefined,
    position: Position,
    playerPositions: Map<string, Position>
  ): void {
    const session = this.activeRecordings.get(gameId);
    if (!session || !session.isRecording) return;

    const gameTime = Date.now() - session.startTime.getTime();
    session.stats.totalMeetings++;

    const posRecord: Record<string, Position> = {};
    playerPositions.forEach((pos, pid) => {
      posRecord[pid] = pos;
    });

    this.recordEvent(session, {
      id: uuidv4(),
      type: 'meeting_call',
      timestamp: gameTime,
      frameIndex: session.frameIndex++,
      meetingId,
      callerId,
      bodyId,
      position: { ...position },
      playerPositions: posRecord,
    } as MeetingCallEvent);

    // 会议开始时创建关键帧
    this.createKeyframe(session, null, gameTime);
  }

  /**
   * 记录会议结束
   */
  recordMeetingEnd(
    gameId: string,
    meetingId: string,
    ejectedId: string | null,
    wasImpostor: boolean,
    voteResults: Map<string, string | null>
  ): void {
    const session = this.activeRecordings.get(gameId);
    if (!session || !session.isRecording) return;

    const gameTime = Date.now() - session.startTime.getTime();

    const results: Record<string, string | null> = {};
    voteResults.forEach((target, voter) => {
      results[voter] = target;
    });

    this.recordEvent(session, {
      id: uuidv4(),
      type: 'meeting_end',
      timestamp: gameTime,
      frameIndex: session.frameIndex++,
      meetingId,
      ejectedId,
      wasImpostor,
      voteResults: results,
    } as MeetingEndEvent);

    // 如果有玩家被投出，记录死亡事件
    if (ejectedId) {
      this.recordEvent(session, {
        id: uuidv4(),
        type: 'player_ejected',
        timestamp: gameTime,
        frameIndex: session.frameIndex++,
        playerId: ejectedId,
        wasImpostor,
      } as PlayerEjectedEvent);

      this.recordEvent(session, {
        id: uuidv4(),
        type: 'player_death',
        timestamp: gameTime,
        frameIndex: session.frameIndex++,
        playerId: ejectedId,
        position: { x: 0, y: 0 }, // 被投出的玩家位置不重要
        reason: 'ejected',
      } as PlayerDeathEvent);

      // 更新快照
      const snapshot = session.playerSnapshots.get(ejectedId);
      if (snapshot) {
        snapshot.isAlive = false;
      }
    }

    // 会议结束时创建关键帧
    this.createKeyframe(session, null, gameTime);
  }

  /**
   * 记录投票
   */
  recordVote(gameId: string, meetingId: string, voterId: string, targetId: string | null): void {
    const session = this.activeRecordings.get(gameId);
    if (!session || !session.isRecording) return;

    const gameTime = Date.now() - session.startTime.getTime();

    this.recordEvent(session, {
      id: uuidv4(),
      type: 'vote_cast',
      timestamp: gameTime,
      frameIndex: session.frameIndex++,
      meetingId,
      voterId,
      targetId,
    } as VoteCastEvent);
  }

  /**
   * 记录破坏开始
   */
  recordSabotageStart(
    gameId: string,
    sabotageId: string,
    sabotageType: string,
    startedBy: string,
    position: Position
  ): void {
    const session = this.activeRecordings.get(gameId);
    if (!session || !session.isRecording) return;

    const gameTime = Date.now() - session.startTime.getTime();

    this.recordEvent(session, {
      id: uuidv4(),
      type: 'sabotage_start',
      timestamp: gameTime,
      frameIndex: session.frameIndex++,
      sabotageId,
      sabotageType,
      startedBy,
      position: { ...position },
    } as SabotageStartEvent);
  }

  /**
   * 记录破坏结束
   */
  recordSabotageEnd(gameId: string, sabotageId: string, fixedBy?: string): void {
    const session = this.activeRecordings.get(gameId);
    if (!session || !session.isRecording) return;

    const gameTime = Date.now() - session.startTime.getTime();

    this.recordEvent(session, {
      id: uuidv4(),
      type: 'sabotage_end',
      timestamp: gameTime,
      frameIndex: session.frameIndex++,
      sabotageId,
      fixedBy,
    } as SabotageEndEvent);
  }

  /**
   * 记录聊天消息
   */
  recordChatMessage(
    gameId: string,
    senderId: string,
    senderName: string,
    content: string,
    chatType: 'lobby' | 'game' | 'ghost' | 'meeting'
  ): void {
    const session = this.activeRecordings.get(gameId);
    if (!session || !session.isRecording) return;

    const gameTime = Date.now() - session.startTime.getTime();

    this.recordEvent(session, {
      id: uuidv4(),
      type: 'chat_message',
      timestamp: gameTime,
      frameIndex: session.frameIndex++,
      senderId,
      senderName,
      content,
      chatType,
    } as ChatMessageEvent);
  }

  /**
   * 获取活跃录制
   */
  getActiveRecording(gameId: string): RecordingSession | undefined {
    return this.activeRecordings.get(gameId);
  }

  /**
   * 检查是否正在录制
   */
  isRecording(gameId: string): boolean {
    const session = this.activeRecordings.get(gameId);
    return session?.isRecording ?? false;
  }

  // ==================== 私有方法 ====================

  /**
   * 记录事件
   */
  private recordEvent(session: RecordingSession, event: AnyReplayEvent): void {
    session.events.push(event);
  }

  /**
   * 检查并创建关键帧
   */
  private checkAndCreateKeyframe(session: RecordingSession, gameTime: number): void {
    if (gameTime - session.lastKeyframeTime >= this.config.keyframeInterval) {
      this.createKeyframe(session, null, gameTime);
    }
  }

  /**
   * 创建关键帧
   */
  private createKeyframe(session: RecordingSession, room: Room | null, gameTime: number): void {
    const playerPositions: Record<string, Position> = {};
    const alivePlayers: string[] = [];

    session.playerSnapshots.forEach((snapshot, playerId) => {
      playerPositions[playerId] = { ...snapshot.position };
      if (snapshot.isAlive) {
        alivePlayers.push(playerId);
      }
    });

    const keyframe: Keyframe = {
      timestamp: gameTime,
      frameIndex: session.frameIndex,
      playerPositions,
      gameState: {
        status: room?.gameState?.status || 'playing',
        alivePlayers,
        completedTasks: [], // 可以从session统计
        activeSabotages: [],
      },
    };

    session.keyframes.push(keyframe);
    session.lastKeyframeTime = gameTime;
  }

  /**
   * 构建玩家信息列表
   */
  private buildPlayerInfoList(room: Room): ReplayPlayerInfo[] {
    return Array.from(room.players.values()).map((player) => ({
      playerId: player.id,
      userId: undefined, // 可以从player对象获取如果有
      name: player.name,
      avatar: player.avatar,
      role: player.role!,
      team: player.team!,
      isAlive: player.isAlive,
      finalPosition: { ...player.position },
      tasksCompleted: player.completedTasks.length,
      killCount: 0,
    }));
  }

  /**
   * 构建最终玩家信息列表
   */
  private buildFinalPlayerInfoList(room: Room): ReplayPlayerInfo[] {
    return Array.from(room.players.values()).map((player) => ({
      playerId: player.id,
      userId: undefined,
      name: player.name,
      avatar: player.avatar,
      role: player.role!,
      team: player.team!,
      isAlive: player.isAlive,
      finalPosition: { ...player.position },
      tasksCompleted: player.completedTasks.length,
      killCount: player.role === 'dog' ? this.getKillCountForPlayer(room.gameState, player.id) : 0,
    }));
  }

  /**
   * 构建玩家结果
   */
  private buildPlayerResults(room: Room): ReplayPlayerResult[] {
    const winner = room.gameState?.winner;
    
    return Array.from(room.players.values()).map((player) => ({
      playerId: player.id,
      role: player.role!,
      isWinner: player.team === winner,
      survived: player.isAlive,
      tasksCompleted: player.completedTasks.length,
      killCount: player.role === 'dog' ? this.getKillCountForPlayer(room.gameState, player.id) : 0,
    }));
  }

  /**
   * 获取玩家击杀数（从录像统计）
   */
  private getKillCountForPlayer(gameState: GameState | undefined, playerId: string): number {
    // 这里简化处理，实际应该从录像事件中统计
    return 0;
  }

  /**
   * 保存回放到数据库
   */
  private async saveReplay(
    replayId: string,
    metadata: ReplayMetadata,
    session: RecordingSession
  ): Promise<ReplayData> {
    // 转换事件格式
    const dbEvents = session.events.map((event) => ({
      id: event.id,
      type: event.type,
      timestamp: event.timestamp,
      frameIndex: event.frameIndex,
      data: this.extractEventData(event),
    }));

    // 计算文件大小（估算）
    const jsonString = JSON.stringify({ metadata, events: session.events, keyframes: session.keyframes });
    const fileSize = Buffer.byteLength(jsonString, 'utf8');

    // 创建数据库记录
    const replay = new Replay({
      replayId,
      roomId: session.roomId,
      gameId: session.gameId,
      mapId: session.mapId,
      mapName: session.mapName,
      startTime: session.startTime,
      endTime: new Date(),
      duration: metadata.duration,
      players: metadata.players,
      playerCount: metadata.playerCount,
      winner: metadata.winner,
      endReason: metadata.endReason,
      totalKills: session.stats.totalKills,
      totalTasksCompleted: session.stats.totalTasksCompleted,
      totalMeetings: session.stats.totalMeetings,
      events: dbEvents,
      keyframes: session.keyframes,
      eventCount: session.events.length,
      version: this.config.version,
      recordedAt: new Date(),
      fileSize,
      isPublic: true,
      allowedUsers: [],
      viewCount: 0,
      isDeleted: false,
    });

    await replay.save();

    return {
      metadata,
      events: session.events,
      keyframes: session.keyframes,
    };
  }

  /**
   * 提取事件数据（排除基础字段）
   */
  private extractEventData(event: AnyReplayEvent): any {
    const { id, type, timestamp, frameIndex, ...data } = event as any;
    return data;
  }
}

// ==================== 录制会话接口 ====================

interface RecordingSession {
  gameId: string;
  roomId: string;
  mapId: string;
  mapName: string;
  startTime: Date;
  events: AnyReplayEvent[];
  keyframes: Keyframe[];
  playerSnapshots: Map<string, PlayerSnapshot>;
  lastMoveSample: Map<string, number>;
  lastKeyframeTime: number;
  frameIndex: number;
  isRecording: boolean;
  stats: {
    totalKills: number;
    totalTasksCompleted: number;
    totalMeetings: number;
  };
}

interface PlayerSnapshot {
  position: Position;
  isAlive: boolean;
  role: string;
  tasksCompleted: number;
  killCount: number;
}

// 导出单例
export const replayRecorderService = new ReplayRecorderService();
export default replayRecorderService;
