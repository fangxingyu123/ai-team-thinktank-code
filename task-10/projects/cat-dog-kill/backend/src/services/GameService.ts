import { Room, Player, GameState, GameStatus, Meeting, MeetingResult, Position, Sabotage, ChatMessage } from '../types';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';
import { replayRecorderService } from './ReplayRecorderService';

export class GameService {
  // 开始游戏
  startGame(room: Room): boolean {
    if (room.players.size < config.game.minPlayers) {
      return false;
    }
    if (room.status === 'playing') {
      return false;
    }

    room.status = 'playing';
    room.gameState = {
      status: 'role_assignment',
      meetingsCalled: 0,
      tasksCompleted: 0,
      totalTasks: 0,
    };

    // 计算总任务数
    room.players.forEach((player) => {
      room.gameState!.totalTasks += player.tasks.length;
    });

    // 开始录制回放
    const gameId = replayRecorderService.startRecording(room);
    room.gameState!.gameId = gameId;

    return true;
  }

  // 进入游戏阶段
  enterPlayingPhase(room: Room): void {
    if (room.gameState) {
      room.gameState.status = 'playing';
      room.gameState.startTime = new Date();
    }
  }

  // 处理玩家移动
  movePlayer(room: Room, playerId: string, position: Position): boolean {
    const player = room.players.get(playerId);
    if (!player || !player.isAlive) return false;
    if (room.gameState?.status !== 'playing') return false;

    player.position = position;
    
    // 录制移动事件
    if (room.gameState?.gameId) {
      replayRecorderService.recordPlayerMove(room.gameState.gameId, playerId, position);
    }
    
    return true;
  }

  // 处理玩家击杀
  killPlayer(room: Room, killerId: string, victimId: string): { success: boolean; error?: string } {
    const killer = room.players.get(killerId);
    const victim = room.players.get(victimId);

    if (!killer || !victim) {
      return { success: false, error: '玩家不存在' };
    }

    if (!killer.isAlive || !victim.isAlive) {
      return { success: false, error: '玩家已死亡' };
    }

    if (killer.role !== 'dog') {
      return { success: false, error: '只有狗狗可以击杀' };
    }

    if (killer.killCooldown > 0) {
      return { success: false, error: '击杀冷却中' };
    }

    // 检查距离
    const distance = this.calculateDistance(killer.position, victim.position);
    if (distance > config.game.killDistance) {
      return { success: false, error: '距离太远' };
    }

    // 执行击杀
    victim.isAlive = false;
    killer.lastKillTime = new Date();
    killer.killCooldown = room.gameConfig.killCooldown;

    // 录制击杀事件
    if (room.gameState?.gameId) {
      replayRecorderService.recordKill(
        room.gameState.gameId,
        killerId,
        victimId,
        victim.position
      );
    }

    // 检查游戏结束条件
    this.checkGameEnd(room);

    return { success: true };
  }

  // 完成任务
  completeTask(room: Room, playerId: string, taskId: string): boolean {
    const player = room.players.get(playerId);
    if (!player || !player.isAlive) return false;
    if (player.role !== 'cat') return false;

    const task = player.tasks.find((t) => t.id === taskId);
    if (!task || task.isCompleted) return false;

    task.isCompleted = true;
    player.completedTasks.push(taskId);
    room.gameState!.tasksCompleted++;

    // 录制任务完成事件
    if (room.gameState?.gameId) {
      replayRecorderService.recordTaskComplete(
        room.gameState.gameId,
        playerId,
        taskId,
        task.type,
        task.position
      );
    }

    // 检查猫咪胜利条件
    if (room.gameState!.tasksCompleted >= room.gameState!.totalTasks) {
      this.endGame(room, 'cats', '所有任务完成');
    }

    return true;
  }

  // 召开紧急会议
  callMeeting(room: Room, callerId: string, bodyId?: string): { success: boolean; meeting?: Meeting; error?: string } {
    const caller = room.players.get(callerId);
    if (!caller || !caller.isAlive) {
      return { success: false, error: '无法召开会议' };
    }

    if (room.gameState?.status !== 'playing') {
      return { success: false, error: '当前无法召开会议' };
    }

    // 检查紧急会议次数
    if (!bodyId && room.gameState.meetingsCalled >= room.gameConfig.emergencyMeetings) {
      return { success: false, error: '紧急会议次数已用完' };
    }

    const meeting: Meeting = {
      id: uuidv4(),
      type: bodyId ? 'body' : 'emergency',
      callerId,
      bodyId,
      votes: new Map(),
      isActive: true,
      startTime: new Date(),
    };

    room.gameState.currentMeeting = meeting;
    room.gameState.status = 'meeting';
    room.gameState.meetingsCalled++;

    // 录制会议事件
    if (room.gameState?.gameId) {
      const playerPositions = new Map<string, Position>();
      room.players.forEach((p, pid) => {
        playerPositions.set(pid, { ...p.position });
      });
      
      replayRecorderService.recordMeetingCall(
        room.gameState.gameId,
        meeting.id,
        callerId,
        bodyId,
        caller.position,
        playerPositions
      );
    }

    // 设置投票超时
    setTimeout(() => {
      this.endMeeting(room);
    }, (room.gameConfig.discussionTime + room.gameConfig.votingTime) * 1000);

    return { success: true, meeting };
  }

  // 投票
  castVote(room: Room, voterId: string, targetId: string | null): boolean {
    const meeting = room.gameState?.currentMeeting;
    if (!meeting || !meeting.isActive) return false;

    const voter = room.players.get(voterId);
    if (!voter || !voter.isAlive) return false;

    meeting.votes.set(voterId, targetId);
    
    // 录制投票事件
    if (room.gameState?.gameId) {
      replayRecorderService.recordVote(
        room.gameState.gameId,
        meeting.id,
        voterId,
        targetId
      );
    }
    
    return true;
  }

  // 结束会议
  endMeeting(room: Room): MeetingResult {
    const meeting = room.gameState!.currentMeeting!;
    meeting.isActive = false;
    meeting.endTime = new Date();

    // 统计票数
    const voteCount = new Map<string, number>();
    let skipCount = 0;

    meeting.votes.forEach((targetId) => {
      if (targetId === null) {
        skipCount++;
      } else {
        voteCount.set(targetId, (voteCount.get(targetId) || 0) + 1);
      }
    });

    // 找出最高票
    let maxVotes = 0;
    let ejectedId: string | null = null;
    let tie = false;

    voteCount.forEach((count, playerId) => {
      if (count > maxVotes) {
        maxVotes = count;
        ejectedId = playerId;
        tie = false;
      } else if (count === maxVotes) {
        tie = true;
      }
    });

    // 平票或跳过票最多，则不淘汰
    if (tie || skipCount >= maxVotes) {
      ejectedId = null;
    }

    // 执行淘汰
    let wasImpostor = false;
    if (ejectedId) {
      const ejected = room.players.get(ejectedId);
      if (ejected) {
        ejected.isAlive = false;
        wasImpostor = ejected.role === 'dog';
      }
    }

    const result: MeetingResult = {
      ejectedId,
      wasImpostor,
      voteCount,
    };

    meeting.result = result;

    // 录制会议结束事件
    if (room.gameState?.gameId) {
      replayRecorderService.recordMeetingEnd(
        room.gameState.gameId,
        meeting.id,
        result.ejectedId,
        result.wasImpostor,
        meeting.votes
      );
    }

    // 恢复游戏状态
    room.gameState!.status = 'playing';
    room.gameState!.currentMeeting = undefined;

    // 检查游戏结束
    this.checkGameEnd(room);

    return result;
  }

  // 检查游戏结束条件
  checkGameEnd(room: Room): void {
    const alivePlayers = Array.from(room.players.values()).filter((p) => p.isAlive);
    const aliveCats = alivePlayers.filter((p) => p.role === 'cat');
    const aliveDogs = alivePlayers.filter((p) => p.role === 'dog');
    const aliveFoxes = alivePlayers.filter((p) => p.role === 'fox');

    // 狗狗胜利：猫咪数量 <= 狗狗数量
    if (aliveCats.length <= aliveDogs.length) {
      this.endGame(room, 'dogs', '猫咪被消灭殆尽');
      return;
    }

    // 猫咪胜利：所有狗狗被淘汰
    if (aliveDogs.length === 0) {
      this.endGame(room, 'cats', '所有狗狗被淘汰');
      return;
    }

    // 狐狸胜利：只剩下狐狸
    if (alivePlayers.length === aliveFoxes.length && aliveFoxes.length > 0) {
      this.endGame(room, 'foxes', '狐狸存活到最后');
      return;
    }
  }

  // 结束游戏
  async endGame(room: Room, winner: 'cats' | 'dogs' | 'foxes', reason: string): Promise<void> {
    if (room.gameState) {
      room.gameState.status = 'ended';
      room.gameState.winner = winner;
      room.gameState.endReason = reason;
      room.gameState.endTime = new Date();
    }
    room.status = 'ended';
    
    // 停止录制并保存回放
    if (room.gameState?.gameId) {
      const replayId = await replayRecorderService.stopRecording(room.gameState.gameId, room);
      if (replayId) {
        console.log(`[GameService] 游戏结束，回放已保存: ${replayId}`);
      }
    }
  }

  // 更新击杀冷却
  updateKillCooldowns(room: Room, deltaTime: number): void {
    room.players.forEach((player) => {
      if (player.role === 'dog' && player.killCooldown > 0) {
        player.killCooldown = Math.max(0, player.killCooldown - deltaTime);
      }
    });
  }

  // 计算距离
  private calculateDistance(pos1: Position, pos2: Position): number {
    return Math.sqrt(Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2));
  }

  // 获取游戏状态摘要
  getGameState(room: Room): GameState | null {
    return room.gameState || null;
  }

  // 获取存活玩家
  getAlivePlayers(room: Room): Player[] {
    return Array.from(room.players.values()).filter((p) => p.isAlive);
  }

  // 获取死亡玩家
  getDeadPlayers(room: Room): Player[] {
    return Array.from(room.players.values()).filter((p) => !p.isAlive);
  }
}

export const gameService = new GameService();
export default gameService;
