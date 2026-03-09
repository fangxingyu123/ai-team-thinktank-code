import { Server as SocketServer, Socket } from 'socket.io';
import { SpectatorClientEvents, SpectatorServerEvents, SpectatorViewMode } from '../types/spectator';
import { ClientEvents, ServerEvents, Position } from '../types';
import { spectatorService } from '../services/SpectatorService';
import { roomService } from '../services/RoomService';

// 存储观战者的socket映射
interface SpectatorMapping {
  roomId: string;
  spectatorId: string;
}

const spectatorSocketMap = new Map<string, SpectatorMapping>();

/**
 * 设置观战模式的Socket处理
 */
export function setupSpectatorSocket(io: SocketServer) {
  io.on('connection', (socket: Socket<ClientEvents & SpectatorClientEvents, ServerEvents & SpectatorServerEvents>) => {
    console.log(`观战系统: 新连接 ${socket.id}`);

    // ==================== 观战者加入 ====================
    socket.on('spectator:join', (data) => {
      try {
        const { roomId, playerName } = data;

        // 检查房间是否存在
        const room = roomService.getRoom(roomId);
        if (!room) {
          socket.emit('spectator:error', {
            code: 'ROOM_NOT_FOUND',
            message: '房间不存在',
          });
          return;
        }

        // 检查房间状态 - 只允许观战正在进行的游戏
        if (room.status !== 'playing') {
          socket.emit('spectator:error', {
            code: 'ROOM_NOT_PLAYING',
            message: '只能观战正在进行的游戏',
          });
          return;
        }

        // 添加观战者
        const result = spectatorService.addSpectator(roomId, socket.id, playerName);

        if (result.error || !result.spectator) {
          socket.emit('spectator:error', {
            code: 'JOIN_FAILED',
            message: result.error || '加入观战失败',
          });
          return;
        }

        const spectator = result.spectator;

        // 存储映射关系
        spectatorSocketMap.set(socket.id, { roomId, spectatorId: spectator.id });

        // 加入房间
        socket.join(`spectator:${roomId}`);

        // 获取观战配置
        const config = spectatorService.getConfig(roomId)!;

        // 发送初始游戏状态
        const gameState = spectatorService.convertToSpectatorView(room, config.revealRoles);

        socket.emit('spectator:joined', {
          roomId,
          spectator,
          players: gameState.players,
          gameState,
          config,
        });

        // 通知其他观战者
        socket.to(`spectator:${roomId}`).emit('spectator:new', {
          spectator,
          count: spectatorService.getSpectatorCount(roomId),
        });

        // 通知房间内的玩家有观战者加入
        io.to(roomId).emit('room:spectator-count', {
          count: spectatorService.getSpectatorCount(roomId),
        });

        console.log(`观战者加入: ${spectator.name} -> ${roomId}`);
      } catch (error) {
        console.error('观战加入错误:', error);
        socket.emit('spectator:error', {
          code: 'INTERNAL_ERROR',
          message: '内部错误，请重试',
        });
      }
    });

    // ==================== 观战者离开 ====================
    socket.on('spectator:leave', () => {
      handleSpectatorLeave(socket, io);
    });

    // ==================== 切换跟随玩家 ====================
    socket.on('spectator:follow-player', (playerId) => {
      const mapping = spectatorSocketMap.get(socket.id);
      if (!mapping) {
        socket.emit('spectator:error', {
          code: 'NOT_SPECTATOR',
          message: '您不是观战者',
        });
        return;
      }

      const { roomId, spectatorId } = mapping;
      const room = roomService.getRoom(roomId);

      if (!room) return;

      // 检查玩家是否存在
      if (!room.players.has(playerId)) {
        socket.emit('spectator:error', {
          code: 'PLAYER_NOT_FOUND',
          message: '玩家不存在',
        });
        return;
      }

      // 设置跟随
      const success = spectatorService.setFollowingPlayer(roomId, spectatorId, playerId);
      if (success) {
        socket.emit('spectator:state', {
          spectatorCount: spectatorService.getSpectatorCount(roomId),
          maxSpectators: spectatorService.getConfig(roomId)?.maxSpectators || 10,
          watchingPlayerId: playerId,
          viewMode: SpectatorViewMode.FOLLOW_PLAYER,
        });
      }
    });

    // ==================== 自由视角 ====================
    socket.on('spectator:free-camera', (position) => {
      const mapping = spectatorSocketMap.get(socket.id);
      if (!mapping) return;

      const { roomId, spectatorId } = mapping;
      const config = spectatorService.getConfig(roomId);

      // 检查是否允许自由视角
      if (!config?.allowFreeCamera) {
        socket.emit('spectator:error', {
          code: 'FREE_CAMERA_DISABLED',
          message: '该房间不允许自由视角',
        });
        return;
      }

      spectatorService.setFreeCameraPosition(roomId, spectatorId, position);

      socket.emit('spectator:state', {
        spectatorCount: spectatorService.getSpectatorCount(roomId),
        maxSpectators: config.maxSpectators,
        viewMode: SpectatorViewMode.FREE_CAMERA,
      });
    });

    // ==================== 发送观战聊天 ====================
    socket.on('spectator:send-chat', (content) => {
      const mapping = spectatorSocketMap.get(socket.id);
      if (!mapping) return;

      const { roomId, spectatorId } = mapping;
      const spectator = spectatorService.getSpectator(roomId, spectatorId);

      if (!spectator) return;

      // 只发送给其他观战者
      io.to(`spectator:${roomId}`).emit('spectator:chat', {
        senderName: spectator.name,
        content: content.slice(0, 200), // 限制长度
        timestamp: new Date(),
      });
    });

    // ==================== 切换视角模式 ====================
    socket.on('spectator:set-view-mode', (mode) => {
      const mapping = spectatorSocketMap.get(socket.id);
      if (!mapping) return;

      const { roomId } = mapping;
      const config = spectatorService.getConfig(roomId);

      if (!config) return;

      // 检查权限
      if (mode === SpectatorViewMode.FREE_CAMERA && !config.allowFreeCamera) {
        socket.emit('spectator:error', {
          code: 'FREE_CAMERA_DISABLED',
          message: '该房间不允许自由视角',
        });
        return;
      }

      if (mode === SpectatorViewMode.AUTO_SWITCH && !config.allowPlayerSwitch) {
        socket.emit('spectator:error', {
          code: 'AUTO_SWITCH_DISABLED',
          message: '该房间不允许自动切换',
        });
        return;
      }

      socket.emit('spectator:state', {
        spectatorCount: spectatorService.getSpectatorCount(roomId),
        maxSpectators: config.maxSpectators,
        viewMode: mode,
      });
    });

    // ==================== 断开连接 ====================
    socket.on('disconnect', () => {
      console.log(`观战系统: 断开连接 ${socket.id}`);
      handleSpectatorLeave(socket, io);
    });
  });
}

/**
 * 处理观战者离开
 */
function handleSpectatorLeave(
  socket: Socket,
  io: SocketServer
) {
  const mapping = spectatorSocketMap.get(socket.id);
  if (!mapping) return;

  const { roomId, spectatorId } = mapping;

  // 移除观战者
  spectatorService.removeSpectator(roomId, spectatorId);
  spectatorSocketMap.delete(socket.id);

  // 离开房间
  socket.leave(`spectator:${roomId}`);

  // 通知其他观战者
  const count = spectatorService.getSpectatorCount(roomId);
  io.to(`spectator:${roomId}`).emit('spectator:left', {
    spectatorId,
    count,
  });

  // 通知房间内的玩家
  io.to(roomId).emit('room:spectator-count', { count });

  console.log(`观战者离开: ${spectatorId} from ${roomId}`);

  // 如果没有观战者了，清理房间数据
  if (count === 0) {
    spectatorService.clearHistory(roomId);
  }
}

/**
 * 广播游戏事件给观战者（带延迟）
 * 由GameSocket调用
 */
export function broadcastToSpectators(
  io: SocketServer,
  roomId: string,
  event: string,
  data: any,
  recordHistory: boolean = true
) {
  const config = spectatorService.getConfig(roomId);
  if (!config || !config.enabled) return;

  // 记录到历史
  if (recordHistory) {
    const eventType = mapEventToHistoryType(event);
    if (eventType) {
      spectatorService.recordGameEvent(roomId, eventType, data);
    }
  }

  // 延迟广播
  setTimeout(() => {
    io.to(`spectator:${roomId}`).emit(event as any, data);
  }, config.delaySeconds * 1000);
}

/**
 * 立即广播给观战者（不延迟）- 用于游戏结束等重要事件
 */
export function broadcastToSpectatorsImmediate(
  io: SocketServer,
  roomId: string,
  event: string,
  data: any
) {
  const config = spectatorService.getConfig(roomId);
  if (!config || !config.enabled) return;

  io.to(`spectator:${roomId}`).emit(event as any, data);
}

/**
 * 将Socket事件映射到历史事件类型
 */
function mapEventToHistoryType(event: string): any {
  const mapping: Record<string, any> = {
    'player:moved': 'player_moved',
    'player:killed': 'player_killed',
    'player:task-completed': 'task_completed',
    'sabotage:started': 'sabotage_started',
    'sabotage:ended': 'sabotage_ended',
    'meeting:called': 'meeting_called',
    'meeting:vote-cast': 'vote_cast',
    'meeting:ended': 'meeting_ended',
    'chat:message': 'chat_message',
    'game:state': 'game_state_update',
  };

  return mapping[event];
}

/**
 * 初始化房间的观战功能
 * 在游戏开始时调用
 */
export function initSpectatorRoom(
  io: SocketServer,
  roomId: string,
  config?: { maxSpectators?: number; delaySeconds?: number }
) {
  spectatorService.initRoom(roomId, config);

  // 通知房间观战功能已启用
  const stats = spectatorService.getStats(roomId);
  io.to(roomId).emit('room:spectator-enabled', {
    enabled: true,
    maxSpectators: stats.max,
    delaySeconds: stats.delaySeconds,
  });
}

/**
 * 清理房间的观战数据
 * 在游戏结束时调用
 */
export function cleanupSpectatorRoom(io: SocketServer, roomId: string) {
  // 通知所有观战者游戏结束
  broadcastToSpectatorsImmediate(io, roomId, 'spectator:game-ended', {
    message: '游戏已结束',
  });

  // 清理数据
  spectatorService.cleanupRoom(roomId);
}

export default setupSpectatorSocket;
