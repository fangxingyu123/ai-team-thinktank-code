import { v4 as uuidv4 } from 'uuid';
import { Room, Player, GameConfig, Role, Team, Position, Task, TaskType } from '../types';
import { config } from '../config';

export class RoomService {
  private rooms: Map<string, Room> = new Map();

  // 创建房间
  createRoom(
    hostName: string,
    hostSocketId: string,
    roomName?: string,
    maxPlayers?: number,
    gameConfig?: Partial<GameConfig>
  ): Room {
    const roomId = this.generateRoomCode();
    const playerId = uuidv4();

    const host: Player = {
      id: playerId,
      socketId: hostSocketId,
      name: hostName,
      avatar: this.generateAvatar(),
      isAlive: true,
      isConnected: true,
      position: { x: 0, y: 0 },
      tasks: [],
      completedTasks: [],
      canKill: false,
      killCooldown: 0,
      joinedAt: new Date(),
    };

    const room: Room = {
      id: roomId,
      name: roomName || `${hostName}的房间`,
      hostId: playerId,
      players: new Map([[playerId, host]]),
      maxPlayers: maxPlayers || config.game.defaultMaxPlayers,
      status: 'waiting',
      gameConfig: {
        catCount: 0,
        dogCount: 0,
        foxCount: 0,
        killCooldown: config.game.defaultKillCooldown,
        meetingCooldown: config.game.defaultMeetingCooldown,
        discussionTime: config.game.defaultDiscussionTime,
        votingTime: config.game.defaultVotingTime,
        taskCount: config.game.defaultTaskCount,
        emergencyMeetings: config.game.defaultEmergencyMeetings,
        ...gameConfig,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.rooms.set(roomId, room);
    return room;
  }

  // 加入房间
  joinRoom(
    roomId: string,
    playerName: string,
    socketId: string
  ): { room: Room; player: Player } | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (room.status !== 'waiting') return null;
    if (room.players.size >= room.maxPlayers) return null;

    const playerId = uuidv4();
    const player: Player = {
      id: playerId,
      socketId,
      name: playerName,
      avatar: this.generateAvatar(),
      isAlive: true,
      isConnected: true,
      position: { x: 0, y: 0 },
      tasks: [],
      completedTasks: [],
      canKill: false,
      killCooldown: 0,
      joinedAt: new Date(),
    };

    room.players.set(playerId, player);
    room.updatedAt = new Date();

    return { room, player };
  }

  // 离开房间
  leaveRoom(roomId: string, playerId: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.players.delete(playerId);

    // 如果房主离开，转让房主
    if (room.hostId === playerId && room.players.size > 0) {
      const newHost = room.players.values().next().value;
      room.hostId = newHost.id;
    }

    // 如果房间空了，删除房间
    if (room.players.size === 0) {
      this.rooms.delete(roomId);
      return null;
    }

    room.updatedAt = new Date();
    return room;
  }

  // 获取房间
  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  // 获取所有房间列表
  getRoomList(): Array<{
    id: string;
    name: string;
    hostName: string;
    playerCount: number;
    maxPlayers: number;
    status: string;
  }> {
    return Array.from(this.rooms.values())
      .filter((room) => room.status === 'waiting')
      .map((room) => {
        const host = room.players.get(room.hostId);
        return {
          id: room.id,
          name: room.name,
          hostName: host?.name || 'Unknown',
          playerCount: room.players.size,
          maxPlayers: room.maxPlayers,
          status: room.status,
        };
      });
  }

  // 更新游戏配置
  updateGameConfig(
    roomId: string,
    hostId: string,
    newConfig: Partial<GameConfig>
  ): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (room.hostId !== hostId) return null;

    room.gameConfig = { ...room.gameConfig, ...newConfig };
    room.updatedAt = new Date();
    return room;
  }

  // 分配角色
  assignRoles(room: Room): void {
    const players = Array.from(room.players.values());
    const playerCount = players.length;

    // 根据人数计算角色数量
    let dogCount = Math.floor(playerCount / 3);
    let foxCount = playerCount >= 7 ? 1 : 0;
    let catCount = playerCount - dogCount - foxCount;

    // 确保至少有1个狗狗
    if (dogCount === 0 && playerCount >= 4) {
      dogCount = 1;
      catCount--;
    }

    // 随机打乱玩家顺序
    const shuffled = [...players].sort(() => Math.random() - 0.5);

    // 分配角色
    let index = 0;

    // 分配狗狗
    for (let i = 0; i < dogCount; i++) {
      const player = shuffled[index++];
      player.role = 'dog';
      player.team = 'dogs';
      player.canKill = true;
      player.killCooldown = room.gameConfig.killCooldown;
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

    // 分配任务
    this.assignTasks(room);
  }

  // 分配任务
  private assignTasks(room: Room): void {
    const cats = Array.from(room.players.values()).filter((p) => p.role === 'cat');
    const taskTypes: TaskType[] = ['wiring', 'download', 'scan', 'trash', 'card'];

    cats.forEach((cat) => {
      const tasks: Task[] = [];
      for (let i = 0; i < room.gameConfig.taskCount; i++) {
        tasks.push({
          id: uuidv4(),
          type: taskTypes[Math.floor(Math.random() * taskTypes.length)],
          name: this.getTaskName(taskTypes[i % taskTypes.length]),
          position: this.getRandomPosition(),
          isCompleted: false,
          assignedTo: cat.id,
          duration: Math.floor(Math.random() * 5) + 3, // 3-8秒
        });
      }
      cat.tasks = tasks;
    });
  }

  // 生成房间代码 (6位字母数字)
  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // 如果已存在，重新生成
    if (this.rooms.has(code)) {
      return this.generateRoomCode();
    }
    return code;
  }

  // 生成随机头像
  private generateAvatar(): string {
    const avatars = ['🐱', '🐶', '🦊', '🐭', '🐹', '🐰', '🐻', '🐼', '🐨', '🐯'];
    return avatars[Math.floor(Math.random() * avatars.length)];
  }

  // 获取任务名称
  private getTaskName(type: TaskType): string {
    const names: Record<TaskType, string[]> = {
      wiring: ['修理电线', '连接电路', '检查线路'],
      download: ['下载数据', '传输文件', '同步数据'],
      scan: ['身份扫描', '体检', '安全检查'],
      trash: ['清理垃圾', '倒垃圾', '回收处理'],
      card: ['刷卡', '验证身份', '门禁检查'],
    };
    const taskNames = names[type];
    return taskNames[Math.floor(Math.random() * taskNames.length)];
  }

  // 获取随机位置
  private getRandomPosition(): Position {
    return {
      x: Math.floor(Math.random() * 20),
      y: Math.floor(Math.random() * 15),
    };
  }
}

export const roomService = new RoomService();
export default roomService;
