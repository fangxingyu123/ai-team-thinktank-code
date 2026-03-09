// ==================== 自定义房间 Socket 处理 ====================
// 文件: backend/src/socket/CustomRoomSocket.ts
// 说明: 处理带密码和自定义规则的房间 Socket 事件

import { Server as SocketServer, Socket } from 'socket.io';
import {
  CustomRoomServerEvents,
  CustomRoomClientEvents,
  CreateCustomRoomRequest,
  JoinRoomWithPasswordRequest,
  CustomGameRules,
  RULE_TEMPLATES,
} from '../types/room-custom';
import { customRoomService } from '../services/CustomRoomService';
import { gameService } from '../services/GameService';
import { Player } from '../types';

// 合并事件类型
type ServerToClientEvents = CustomRoomServerEvents;
type ClientToServerEvents = CustomRoomClientEvents;

export function setupCustomRoomSocket(io: SocketServer) {
  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    console.log(`[CustomRoomSocket] 玩家连接: ${socket.id}`);

    // ==================== 房间创建 ====================

    // 创建带密码/自定义规则的房间
    socket.on('room:create-custom', (data: CreateCustomRoomRequest) => {
      try {
        const { room, host } = customRoomService.createCustomRoom(
          data.name || '匿名玩家',
          socket.id,
          data
        );

        socket.join(room.id);

        // 通知客户端加入成功
        socket.emit('room:joined', {
          roomId: room.id,
          player: sanitizePlayer(host),
          players: [sanitizePlayer(host)],
        });

        // 发送房间设置
        socket.emit('room:settings-updated', {
          gameConfig: room.gameConfig,
          customRules: room.customRules,
          settings: room.settings,
        });

        console.log(`[CustomRoomSocket] 创建房间: ${room.id} (${room.visibility})`);
      } catch (error: any) {
        socket.emit('error', {
          code: 'CREATE_ROOM_FAILED',
          message: error.message || '创建房间失败',
        });
      }
    });

    // ==================== 加入房间 ====================

    // 加入带密码的房间
    socket.on('room:join-with-password', (data: JoinRoomWithPasswordRequest) => {
      try {
        const result = customRoomService.joinRoom(data, socket.id);

        if (!result.success) {
          // 需要密码
          if (result.error === '需要密码') {
            socket.emit('room:password-required', {
              message: '该房间需要密码',
              hint: result.hint,
            });
            return;
          }

          // 密码错误
          if (result.error === '密码错误') {
            socket.emit('room:password-error', {
              message: '密码错误，请重试',
            });
            return;
          }

          // 其他错误
          socket.emit('error', {
            code: 'JOIN_ROOM_FAILED',
            message: result.error || '加入房间失败',
          });
          return;
        }

        const { room, player } = result;
        if (!room || !player) {
          socket.emit('error', {
            code: 'JOIN_ROOM_FAILED',
            message: '加入房间失败',
          });
          return;
        }

        socket.join(room.id);

        // 通知自己加入成功
        const allPlayers = customRoomService.getPlayers(room.id);
        socket.emit('room:joined', {
          roomId: room.id,
          player: sanitizePlayer(player),
          players: allPlayers.map(sanitizePlayer),
        });

        // 发送房间设置
        socket.emit('room:settings-updated', {
          gameConfig: room.gameConfig,
          customRules: room.customRules,
          settings: room.settings,
        });

        // 通知其他玩家
        socket.to(room.id).emit('player:joined', sanitizePlayer(player));
        socket.to(room.id).emit('room:updated', {
          players: allPlayers.map(sanitizePlayer),
          hostId: room.hostId,
        });

        console.log(`[CustomRoomSocket] 玩家加入: ${player.name} -> ${room.id}`);
      } catch (error: any) {
        socket.emit('error', {
          code: 'JOIN_ROOM_FAILED',
          message: error.message || '加入房间失败',
        });
      }
    });

    // ==================== 房间管理 ====================

    // 设置/修改密码
    socket.on('room:set-password', (data) => {
      const playerInfo = customRoomService.getPlayerBySocket(socket.id);
      if (!playerInfo) {
        socket.emit('error', { code: 'NOT_IN_ROOM', message: '不在任何房间中' });
        return;
      }

      const { roomId, player } = playerInfo;
      const room = customRoomService.getRoom(roomId);
      if (!room) return;

      const result = customRoomService.setPassword(
        roomId,
        player.id,
        data.password,
        data.passwordHint,
        data.removePassword
      );

      if (result.success) {
        // 通知所有玩家密码变更
        io.to(roomId).emit('room:settings-updated', {
          gameConfig: room.gameConfig,
          customRules: room.customRules,
          settings: room.settings,
        });

        // 发送系统消息
        io.to(roomId).emit('chat:message', {
          id: Date.now().toString(),
          senderId: 'system',
          senderName: '系统',
          content: data.removePassword ? '房主已移除房间密码' : '房主已设置房间密码',
          type: 'lobby',
          timestamp: new Date(),
        });
      } else {
        socket.emit('error', { code: 'SET_PASSWORD_FAILED', message: result.error });
      }
    });

    // 踢出玩家
    socket.on('room:kick-player', (targetPlayerId: string) => {
      const playerInfo = customRoomService.getPlayerBySocket(socket.id);
      if (!playerInfo) {
        socket.emit('error', { code: 'NOT_IN_ROOM', message: '不在任何房间中' });
        return;
      }

      const { roomId, player } = playerInfo;
      const result = customRoomService.kickPlayer(roomId, player.id, targetPlayerId);

      if (result.success) {
        // 通知被踢玩家
        const targetSocketId = getSocketIdByPlayerId(roomId, targetPlayerId);
        if (targetSocketId) {
          io.to(targetSocketId).emit('error', {
            code: 'KICKED',
            message: '你已被房主移出房间',
          });
          const targetSocket = io.sockets.sockets.get(targetSocketId);
          if (targetSocket) {
            targetSocket.leave(roomId);
          }
        }

        // 通知房间其他玩家
        socket.to(roomId).emit('player:left', { playerId: targetPlayerId });
        const room = customRoomService.getRoom(roomId);
        if (room) {
          io.to(roomId).emit('room:updated', {
            players: customRoomService.getPlayers(roomId).map(sanitizePlayer),
            hostId: room.hostId,
          });
        }

        // 发送系统消息
        io.to(roomId).emit('chat:message', {
          id: Date.now().toString(),
          senderId: 'system',
          senderName: '系统',
          content: '一名玩家被房主移出房间',
          type: 'lobby',
          timestamp: new Date(),
        });
      } else {
        socket.emit('error', { code: 'KICK_FAILED', message: result.error });
      }
    });

    // 转让房主
    socket.on('room:transfer-host', (newHostId: string) => {
      const playerInfo = customRoomService.getPlayerBySocket(socket.id);
      if (!playerInfo) {
        socket.emit('error', { code: 'NOT_IN_ROOM', message: '不在任何房间中' });
        return;
      }

      const { roomId, player } = playerInfo;
      const result = customRoomService.transferHost(roomId, player.id, newHostId);

      if (result.success) {
        const room = customRoomService.getRoom(roomId);
        if (room) {
          io.to(roomId).emit('room:updated', {
            players: customRoomService.getPlayers(roomId).map(sanitizePlayer),
            hostId: room.hostId,
          });
        }

        // 通知新房主
        const newHostSocketId = getSocketIdByPlayerId(roomId, newHostId);
        if (newHostSocketId) {
          io.to(newHostSocketId).emit('chat:message', {
            id: Date.now().toString(),
            senderId: 'system',
            senderName: '系统',
            content: '你已成为新房主',
            type: 'lobby',
            timestamp: new Date(),
          });
        }

        // 发送系统消息
        io.to(roomId).emit('chat:message', {
          id: Date.now().toString(),
          senderId: 'system',
          senderName: '系统',
          content: '房主已转让',
          type: 'lobby',
          timestamp: new Date(),
        });
      } else {
        socket.emit('error', { code: 'TRANSFER_FAILED', message: result.error });
      }
    });

    // ==================== 玩家准备 ====================

    // 设置准备状态
    socket.on('room:ready', (isReady: boolean) => {
      const result = customRoomService.setPlayerReady(socket.id, isReady);

      if (result.success && result.roomId && result.playerId) {
        // 通知房间所有玩家
        io.to(result.roomId).emit('room:player-ready', {
          playerId: result.playerId,
          isReady: result.isReady ?? false,
        });

        // 如果全部准备，发送提示
        if (result.allReady) {
          io.to(result.roomId).emit('chat:message', {
            id: Date.now().toString(),
            senderId: 'system',
            senderName: '系统',
            content: '所有玩家已准备，房主可以开始游戏了！',
            type: 'lobby',
            timestamp: new Date(),
          });
        }
      }
    });

    // ==================== 房间设置更新 ====================

    // 更新房间设置
    socket.on('room:update-settings', (data) => {
      const playerInfo = customRoomService.getPlayerBySocket(socket.id);
      if (!playerInfo) {
        socket.emit('error', { code: 'NOT_IN_ROOM', message: '不在任何房间中' });
        return;
      }

      const { roomId, player } = playerInfo;
      const result = customRoomService.updateRoomSettings(roomId, player.id, data);

      if (result.success && result.room) {
        // 通知所有玩家设置更新
        io.to(roomId).emit('room:settings-updated', {
          gameConfig: result.room.gameConfig,
          customRules: result.room.customRules,
          settings: result.room.settings,
        });

        // 发送系统消息
        io.to(roomId).emit('chat:message', {
          id: Date.now().toString(),
          senderId: 'system',
          senderName: '系统',
          content: '房主更新了房间设置',
          type: 'lobby',
          timestamp: new Date(),
        });
      } else {
        socket.emit('error', { code: 'UPDATE_SETTINGS_FAILED', message: result.error });
      }
    });

    // 应用规则模板
    socket.on('room:apply-template', (templateName: string) => {
      const playerInfo = customRoomService.getPlayerBySocket(socket.id);
      if (!playerInfo) return;

      const { roomId, player } = playerInfo;
      const room = customRoomService.getRoom(roomId);
      if (!room || room.hostId !== player.id) return;

      const template = RULE_TEMPLATES.find(t => t.name === templateName);
      if (!template) {
        socket.emit('error', { code: 'TEMPLATE_NOT_FOUND', message: '规则模板不存在' });
        return;
      }

      const result = customRoomService.updateRoomSettings(roomId, player.id, {
        customRules: template.rules,
      });

      if (result.success && result.room) {
        io.to(roomId).emit('room:settings-updated', {
          gameConfig: result.room.gameConfig,
          customRules: result.room.customRules,
          settings: result.room.settings,
        });

        io.to(roomId).emit('chat:message', {
          id: Date.now().toString(),
          senderId: 'system',
          senderName: '系统',
          content: `房主应用了规则模板：${template.name} - ${template.description}`,
          type: 'lobby',
          timestamp: new Date(),
        });
      }
    });

    // ==================== 游戏控制 ====================

    // 开始游戏（覆盖原有逻辑）
    socket.on('game:start', () => {
      const playerInfo = customRoomService.getPlayerBySocket(socket.id);
      if (!playerInfo) {
        socket.emit('error', { code: 'NOT_IN_ROOM', message: '不在任何房间中' });
        return;
      }

      const { roomId, player } = playerInfo;
      const room = customRoomService.getRoom(roomId);
      if (!room) return;

      // 检查是否是房主
      if (room.hostId !== player.id) {
        socket.emit('error', { code: 'NOT_HOST', message: '只有房主可以开始游戏' });
        return;
      }

      // 开始游戏
      const result = customRoomService.startGame(roomId, player.id);
      if (!result.success) {
        socket.emit('error', { code: 'START_GAME_FAILED', message: result.error });
        return;
      }

      // 分配角色
      const players = customRoomService.getPlayers(roomId);
      assignRolesWithCustomRules(players, room.customRules);

      // 倒计时
      let countdown = 5;
      io.to(roomId).emit('game:starting', { countdown });

      const countdownInterval = setInterval(() => {
        countdown--;
        if (countdown > 0) {
          io.to(roomId).emit('game:starting', { countdown });
        } else {
          clearInterval(countdownInterval);

          // 游戏正式开始
          players.forEach((p) => {
            const playerSocket = io.sockets.sockets.get(p.socketId);
            if (playerSocket) {
              playerSocket.emit('game:started', {
                role: p.role!,
                team: p.team!,
                players: players.map((other) => ({
                  ...sanitizePlayer(other),
                  role: other.id === p.id || other.team === p.team ? other.role : undefined,
                })),
              });
            }
          });
        }
      }, 1000);

      console.log(`[CustomRoomSocket] 游戏开始: ${roomId}`);
    });

    // ==================== 断开连接 ====================

    socket.on('disconnect', () => {
      console.log(`[CustomRoomSocket] 玩家断开: ${socket.id}`);

      const result = customRoomService.leaveRoom(socket.id);
      if (result.roomId && !result.isDisbanded && result.room) {
        // 通知其他玩家
        const { roomId, newHostId } = result;
        const room = customRoomService.getRoom(roomId);

        if (room) {
          socket.to(roomId).emit('player:left', { playerId: '' }); // playerId 已从服务中移除
          io.to(roomId).emit('room:updated', {
            players: customRoomService.getPlayers(roomId).map(sanitizePlayer),
            hostId: room.hostId,
          });

          if (newHostId) {
            io.to(roomId).emit('chat:message', {
              id: Date.now().toString(),
              senderId: 'system',
              senderName: '系统',
              content: '房主离开，已自动转让给新玩家',
              type: 'lobby',
              timestamp: new Date(),
            });
          }
        }
      }
    });
  });

  // ==================== 定时任务 ====================

  // 每5分钟清理一次空闲房间
  setInterval(() => {
    const removedRooms = customRoomService.cleanupIdleRooms(30 * 60 * 1000); // 30分钟
    if (removedRooms.length > 0) {
      console.log(`[CustomRoomSocket] 清理了 ${removedRooms.length} 个空闲房间`);
    }
  }, 5 * 60 * 1000);
}

// ==================== 辅助函数 ====================

// 清理玩家敏感信息
function sanitizePlayer(player: Player & { isReady?: boolean }): any {
  return {
    id: player.id,
    name: player.name,
    avatar: player.avatar,
    isAlive: player.isAlive,
    isConnected: player.isConnected,
    isReady: player.isReady ?? false,
    position: player.position,
    completedTasks: player.completedTasks.length,
    totalTasks: player.tasks.length,
  };
}

// 根据玩家 ID 获取 Socket ID
function getSocketIdByPlayerId(roomId: string, playerId: string): string | undefined {
  const players = customRoomService.getPlayers(roomId);
  const player = players.find(p => p.id === playerId);
  return player?.socketId;
}

// 根据自定义规则分配角色
function assignRolesWithCustomRules(
  players: (Player & { isReady?: boolean })[],
  rules: CustomGameRules
): void {
  const playerCount = players.length;

  // 计算角色数量
  let dogCount: number;
  let foxCount: number;
  let catCount: number;

  // 使用手动设置或自动计算
  if (rules.roleSettings.overrideDogCount && rules.roleSettings.overrideDogCount > 0) {
    dogCount = Math.min(rules.roleSettings.overrideDogCount, Math.floor(playerCount / 2));
  } else {
    dogCount = Math.floor(playerCount / 3);
    if (dogCount === 0 && playerCount >= 4) dogCount = 1;
  }

  if (rules.roleSettings.enableFox && rules.roleSettings.overrideFoxCount && rules.roleSettings.overrideFoxCount > 0) {
    foxCount = Math.min(rules.roleSettings.overrideFoxCount, 1);
  } else if (rules.roleSettings.enableFox) {
    foxCount = playerCount >= 7 ? 1 : 0;
  } else {
    foxCount = 0;
  }

  catCount = playerCount - dogCount - foxCount;

  // 随机打乱
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  let index = 0;

  // 分配狗狗
  for (let i = 0; i < dogCount; i++) {
    const player = shuffled[index++];
    player.role = 'dog';
    player.team = 'dogs';
    player.canKill = true;
  }

  // 分配狐狸
  for (let i = 0; i < foxCount; i++) {
    const player = shuffled[index++];
    player.role = 'fox';
    player.team = 'foxes';
  }

  // 分配猫咪
  for (let i = index; i < shuffled.length; i++) {
    const player = shuffled[i];
    player.role = 'cat';
    player.team = 'cats';
  }

  console.log(`[CustomRoomSocket] 角色分配: ${catCount}猫 ${dogCount}狗 ${foxCount}狐`);
}

export default setupCustomRoomSocket;
