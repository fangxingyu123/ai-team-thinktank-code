import { Server as SocketServer, Socket } from 'socket.io';
import { ServerEvents, ClientEvents, Player, Room } from '../types';
import { roomService } from '../services/RoomService';
import { gameService } from '../services/GameService';
import { spectatorService } from '../services/SpectatorService';
import {
  broadcastToSpectators,
  broadcastToSpectatorsImmediate,
  initSpectatorRoom,
  cleanupSpectatorRoom,
} from './SpectatorSocket';
import { config } from '../config';

// 存储 socket 到玩家/房间的映射
const socketRoomMap = new Map<string, { roomId: string; playerId: string }>();

export function setupGameSocket(io: SocketServer) {
  io.on('connection', (socket: Socket<ClientEvents, ServerEvents>) => {
    console.log(`玩家连接: ${socket.id}`);

    // ==================== 房间管理 ====================

    // 创建房间
    socket.on('room:create', (data) => {
      try {
        const room = roomService.createRoom(
          data.name || '匿名玩家',
          socket.id,
          data.name,
          data.maxPlayers,
          data.config
        );

        const host = Array.from(room.players.values())[0];
        socketRoomMap.set(socket.id, { roomId: room.id, playerId: host.id });
        socket.join(room.id);

        socket.emit('room:joined', {
          roomId: room.id,
          player: sanitizePlayer(host),
          players: Array.from(room.players.values()).map(sanitizePlayer),
        });

        console.log(`房间创建: ${room.id} by ${host.name}`);
      } catch (error) {
        socket.emit('error', { code: 'CREATE_ROOM_FAILED', message: '创建房间失败' });
      }
    });

    // 加入房间
    socket.on('room:join', (data) => {
      try {
        const result = roomService.joinRoom(data.roomId, data.playerName, socket.id);

        if (!result) {
          socket.emit('error', { code: 'JOIN_ROOM_FAILED', message: '加入房间失败，房间不存在或已满' });
          return;
        }

        const { room, player } = result;
        socketRoomMap.set(socket.id, { roomId: room.id, playerId: player.id });
        socket.join(room.id);

        // 通知自己
        socket.emit('room:joined', {
          roomId: room.id,
          player: sanitizePlayer(player),
          players: Array.from(room.players.values()).map(sanitizePlayer),
        });

        // 通知其他玩家
        socket.to(room.id).emit('player:joined', sanitizePlayer(player));
        socket.to(room.id).emit('room:updated', {
          players: Array.from(room.players.values()).map(sanitizePlayer),
          hostId: room.hostId,
        });

        console.log(`玩家加入: ${player.name} -> ${room.id}`);
      } catch (error) {
        socket.emit('error', { code: 'JOIN_ROOM_FAILED', message: '加入房间失败' });
      }
    });

    // 离开房间
    socket.on('room:leave', () => {
      handlePlayerLeave(socket, io);
    });

    // 更新游戏配置
    socket.on('room:update-config', (newConfig) => {
      const mapping = socketRoomMap.get(socket.id);
      if (!mapping) return;

      const room = roomService.getRoom(mapping.roomId);
      if (!room) return;

      const updatedRoom = roomService.updateGameConfig(room.id, mapping.playerId, newConfig);
      if (updatedRoom) {
        io.to(room.id).emit('room:updated', {
          players: Array.from(room.players.values()).map(sanitizePlayer),
          hostId: room.hostId,
        });
      }
    });

    // ==================== 游戏控制 ====================

    // 开始游戏
    socket.on('game:start', () => {
      const mapping = socketRoomMap.get(socket.id);
      if (!mapping) return;

      const room = roomService.getRoom(mapping.roomId);
      if (!room) return;

      // 只有房主可以开始游戏
      if (room.hostId !== mapping.playerId) {
        socket.emit('error', { code: 'NOT_HOST', message: '只有房主可以开始游戏' });
        return;
      }

      // 分配角色
      roomService.assignRoles(room);

      // 初始化观战房间
      initSpectatorRoom(io, room.id, {
        maxSpectators: 10,
        delaySeconds: 5,
      });

      // 开始游戏
      const success = gameService.startGame(room);
      if (!success) {
        socket.emit('error', { code: 'START_GAME_FAILED', message: '开始游戏失败，人数不足' });
        return;
      }

      // 倒计时
      let countdown = 5;
      const countdownInterval = setInterval(() => {
        io.to(room.id).emit('game:starting', { countdown });
        countdown--;

        if (countdown < 0) {
          clearInterval(countdownInterval);
          gameService.enterPlayingPhase(room);

          // 通知每个玩家他们的角色
          room.players.forEach((player) => {
            const playerSocket = io.sockets.sockets.get(player.socketId);
            if (playerSocket) {
              playerSocket.emit('game:started', {
                role: player.role!,
                team: player.team!,
                players: Array.from(room.players.values()).map((p) => ({
                  ...sanitizePlayer(p),
                  role: p.id === player.id || p.team === player.team ? p.role : undefined,
                })),
              });
            }
          });

          io.to(room.id).emit('game:state', room.gameState!);
        }
      }, 1000);

      console.log(`游戏开始: ${room.id}`);
    });

    // ==================== 游戏操作 ====================

    // 玩家移动
    socket.on('player:move', (position) => {
      const mapping = socketRoomMap.get(socket.id);
      if (!mapping) return;

      const room = roomService.getRoom(mapping.roomId);
      if (!room) return;

      const success = gameService.movePlayer(room, mapping.playerId, position);
      if (success) {
        socket.to(room.id).emit('player:moved', {
          playerId: mapping.playerId,
          position,
        });

        // 广播给观战者（带延迟）
        broadcastToSpectators(io, room.id, 'spectator:player-moved', {
          playerId: mapping.playerId,
          position,
        });
      }
    });

    // 击杀
    socket.on('player:kill', (targetId) => {
      const mapping = socketRoomMap.get(socket.id);
      if (!mapping) return;

      const room = roomService.getRoom(mapping.roomId);
      if (!room) return;

      const result = gameService.killPlayer(room, mapping.playerId, targetId);
      if (result.success) {
        io.to(room.id).emit('player:killed', {
          victimId: targetId,
          killerId: mapping.playerId,
        });

        // 广播给观战者（带延迟）
        broadcastToSpectators(io, room.id, 'spectator:player-killed', {
          victimId: targetId,
          killerId: mapping.playerId,
        });

        // 检查游戏是否结束
        if (room.gameState?.status === 'ended') {
          io.to(room.id).emit('game:ended', {
            winner: room.gameState.winner!,
            reason: room.gameState.endReason!,
          });

          // 立即通知观战者游戏结束
          broadcastToSpectatorsImmediate(io, room.id, 'spectator:game-ended', {
            winner: room.gameState.winner!,
            reason: room.gameState.endReason!,
          });

          // 清理观战房间
          cleanupSpectatorRoom(io, room.id);
        }
      } else {
        socket.emit('error', { code: 'KILL_FAILED', message: result.error || '击杀失败' });
      }
    });

    // 完成任务
    socket.on('player:complete-task', (taskId) => {
      const mapping = socketRoomMap.get(socket.id);
      if (!mapping) return;

      const room = roomService.getRoom(mapping.roomId);
      if (!room) return;

      const success = gameService.completeTask(room, mapping.playerId, taskId);
      if (success) {
        io.to(room.id).emit('player:task-completed', {
          playerId: mapping.playerId,
          taskId,
        });

        // 广播给观战者（带延迟）
        broadcastToSpectators(io, room.id, 'spectator:task-completed', {
          playerId: mapping.playerId,
          taskId,
        });

        // 检查游戏是否结束
        if (room.gameState?.status === 'ended') {
          io.to(room.id).emit('game:ended', {
            winner: room.gameState.winner!,
            reason: room.gameState.endReason!,
          });

          // 立即通知观战者游戏结束
          broadcastToSpectatorsImmediate(io, room.id, 'spectator:game-ended', {
            winner: room.gameState.winner!,
            reason: room.gameState.endReason!,
          });

          // 清理观战房间
          cleanupSpectatorRoom(io, room.id);
        }
      }
    });

    // 召开会议
    socket.on('player:call-meeting', () => {
      const mapping = socketRoomMap.get(socket.id);
      if (!mapping) return;

      const room = roomService.getRoom(mapping.roomId);
      if (!room) return;

      const result = gameService.callMeeting(room, mapping.playerId);
      if (result.success && result.meeting) {
        const caller = room.players.get(mapping.playerId);
        io.to(room.id).emit('meeting:called', {
          meeting: result.meeting,
          callerName: caller?.name || 'Unknown',
        });

        // 广播给观战者（带延迟）
        const config = spectatorService.getConfig(room.id);
        if (config) {
          const spectatorMeeting = {
            id: result.meeting.id,
            type: result.meeting.type,
            callerName: caller?.name || 'Unknown',
            isActive: result.meeting.isActive,
            votes: result.meeting.votes,
            voteCount: new Map(),
            timeRemaining: room.gameConfig.discussionTime + room.gameConfig.votingTime,
          };
          broadcastToSpectators(io, room.id, 'spectator:meeting-called', {
            meeting: spectatorMeeting,
            callerName: caller?.name || 'Unknown',
          });
        }
      } else {
        socket.emit('error', { code: 'MEETING_FAILED', message: result.error || '无法召开会议' });
      }
    });

    // 报告尸体
    socket.on('player:report-body', (bodyId) => {
      const mapping = socketRoomMap.get(socket.id);
      if (!mapping) return;

      const room = roomService.getRoom(mapping.roomId);
      if (!room) return;

      const result = gameService.callMeeting(room, mapping.playerId, bodyId);
      if (result.success && result.meeting) {
        const caller = room.players.get(mapping.playerId);
        io.to(room.id).emit('meeting:called', {
          meeting: result.meeting,
          callerName: caller?.name || 'Unknown',
        });
      }
    });

    // 投票
    socket.on('meeting:vote', (targetId) => {
      const mapping = socketRoomMap.get(socket.id);
      if (!mapping) return;

      const room = roomService.getRoom(mapping.roomId);
      if (!room) return;

      const success = gameService.castVote(room, mapping.playerId, targetId);
      if (success) {
        io.to(room.id).emit('meeting:vote-cast', {
          voterId: mapping.playerId,
          hasVoted: true,
        });
      }
    });

    // 聊天消息
    socket.on('chat:send', (data) => {
      const mapping = socketRoomMap.get(socket.id);
      if (!mapping) return;

      const room = roomService.getRoom(mapping.roomId);
      if (!room) return;

      const player = room.players.get(mapping.playerId);
      if (!player) return;

      // 游戏进行中只有幽灵可以互相聊天
      if (room.gameState?.status === 'playing' && data.type === 'ghost') {
        if (player.isAlive) return;
      }

      const message = {
        id: Date.now().toString(),
        senderId: mapping.playerId,
        senderName: player.name,
        content: data.content,
        type: data.type,
        timestamp: new Date(),
      };

      if (data.type === 'ghost') {
        // 只发送给死亡玩家
        room.players.forEach((p) => {
          if (!p.isAlive) {
            io.to(p.socketId).emit('chat:message', message);
          }
        });
      } else {
        io.to(room.id).emit('chat:message', message);
      }
    });

    // ==================== 断开连接 ====================

    socket.on('disconnect', () => {
      console.log(`玩家断开: ${socket.id}`);
      handlePlayerLeave(socket, io);
    });
  });

  // 游戏循环：更新击杀冷却等
  setInterval(() => {
    roomService.getRoomList().forEach((roomInfo) => {
      const room = roomService.getRoom(roomInfo.id);
      if (room && room.gameState?.status === 'playing') {
        gameService.updateKillCooldowns(room, 1);
      }
    });
  }, 1000);
}

// 处理玩家离开
function handlePlayerLeave(socket: Socket, io: SocketServer) {
  const mapping = socketRoomMap.get(socket.id);
  if (!mapping) return;

  const { roomId, playerId } = mapping;
  const room = roomService.getRoom(roomId);

  if (room) {
    const updatedRoom = roomService.leaveRoom(roomId, playerId);

    if (updatedRoom) {
      socket.to(roomId).emit('player:left', { playerId });
      socket.to(roomId).emit('room:updated', {
        players: Array.from(updatedRoom.players.values()).map(sanitizePlayer),
        hostId: updatedRoom.hostId,
      });
    }
  }

  socketRoomMap.delete(socket.id);
  socket.leave(roomId);
}

// 清理玩家敏感信息
function sanitizePlayer(player: Player): any {
  return {
    id: player.id,
    name: player.name,
    avatar: player.avatar,
    isAlive: player.isAlive,
    isConnected: player.isConnected,
    position: player.position,
    completedTasks: player.completedTasks.length,
    totalTasks: player.tasks.length,
    // 不发送 role, team, socketId 等敏感信息
  };
}

export default setupGameSocket;
