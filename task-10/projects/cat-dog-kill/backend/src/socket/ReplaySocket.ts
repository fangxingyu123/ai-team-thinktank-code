import { Server as SocketServer, Socket } from 'socket.io';
import { replayPlaybackService } from '../services/ReplayPlaybackService';
import { ReplayClientEvents, ReplayServerEvents } from '../types/replay';

/**
 * 回放系统 Socket 处理器
 * 
 * 处理客户端的回放相关请求：
 * - 获取回放列表
 * - 加载回放
 * - 播放控制（播放/暂停/跳转）
 * - 实时事件流推送
 */
export function setupReplaySocket(io: SocketServer): void {
  // 创建回放命名空间
  const replayNamespace = io.of('/replay');

  replayNamespace.on('connection', (socket: Socket) => {
    console.log(`[ReplaySocket] 客户端连接: ${socket.id}`);

    let playbackInterval: NodeJS.Timeout | null = null;
    let currentSessionId: string | null = null;

    // ==================== 回放列表查询 ====================

    socket.on('replay:get-list', async (query) => {
      try {
        const result = await replayPlaybackService.getReplayList({
          page: query.page || 1,
          limit: query.limit || 20,
          userId: query.userId,
          mapId: query.mapId,
          winner: query.winner,
          startDate: query.startDate ? new Date(query.startDate) : undefined,
          endDate: query.endDate ? new Date(query.endDate) : undefined,
          sortBy: query.sortBy || 'date',
          sortOrder: query.sortOrder || 'desc',
        });

        socket.emit('replay:list', result);
      } catch (error) {
        console.error('[ReplaySocket] 获取回放列表失败:', error);
        socket.emit('replay:error', {
          code: 'LIST_ERROR',
          message: '获取回放列表失败',
        });
      }
    });

    // ==================== 回放详情 ====================

    socket.on('replay:get-detail', async (replayId: string) => {
      try {
        const metadata = await replayPlaybackService.getReplayDetail(replayId);
        
        if (!metadata) {
          socket.emit('replay:error', {
            code: 'NOT_FOUND',
            message: '回放不存在或已被删除',
          });
          return;
        }

        socket.emit('replay:detail', metadata);
      } catch (error) {
        console.error('[ReplaySocket] 获取回放详情失败:', error);
        socket.emit('replay:error', {
          code: 'DETAIL_ERROR',
          message: '获取回放详情失败',
        });
      }
    });

    // ==================== 加载回放 ====================

    socket.on('replay:load', async (replayId: string) => {
      try {
        // 清理之前的会话
        if (currentSessionId) {
          cleanupCurrentSession();
        }

        currentSessionId = socket.id;
        const result = await replayPlaybackService.loadReplay(currentSessionId, replayId);

        if (!result.success) {
          socket.emit('replay:error', {
            code: 'LOAD_ERROR',
            message: result.error || '加载回放失败',
          });
          currentSessionId = null;
          return;
        }

        // 发送元数据
        socket.emit('replay:detail', result.metadata);

        // 发送初始播放状态
        const initialState = replayPlaybackService.getPlaybackState(currentSessionId);
        if (initialState) {
          socket.emit('replay:playback-state', initialState);
        }

        console.log(`[ReplaySocket] 加载回放: ${replayId}, 会话: ${currentSessionId}`);
      } catch (error) {
        console.error('[ReplaySocket] 加载回放失败:', error);
        socket.emit('replay:error', {
          code: 'LOAD_ERROR',
          message: '加载回放失败',
        });
        currentSessionId = null;
      }
    });

    // ==================== 播放控制 ====================

    socket.on('replay:play', () => {
      if (!currentSessionId) {
        socket.emit('replay:error', {
          code: 'NO_SESSION',
          message: '请先加载回放',
        });
        return;
      }

      try {
        const state = replayPlaybackService.play(currentSessionId);
        if (state) {
          socket.emit('replay:playback-state', state);
          startPlaybackLoop();
        }
      } catch (error) {
        console.error('[ReplaySocket] 播放失败:', error);
        socket.emit('replay:error', {
          code: 'PLAY_ERROR',
          message: '播放失败',
        });
      }
    });

    socket.on('replay:pause', () => {
      if (!currentSessionId) {
        socket.emit('replay:error', {
          code: 'NO_SESSION',
          message: '请先加载回放',
        });
        return;
      }

      try {
        stopPlaybackLoop();
        const state = replayPlaybackService.pause(currentSessionId);
        if (state) {
          socket.emit('replay:playback-state', state);
        }
      } catch (error) {
        console.error('[ReplaySocket] 暂停失败:', error);
        socket.emit('replay:error', {
          code: 'PAUSE_ERROR',
          message: '暂停失败',
        });
      }
    });

    socket.on('replay:seek', (timestamp: number) => {
      if (!currentSessionId) {
        socket.emit('replay:error', {
          code: 'NO_SESSION',
          message: '请先加载回放',
        });
        return;
      }

      try {
        const result = replayPlaybackService.seek(currentSessionId, timestamp);
        
        if (result.state) {
          socket.emit('replay:playback-state', result.state);
        }

        // 发送关键帧数据（用于快速定位）
        if (result.keyframe) {
          socket.emit('replay:keyframe', result.keyframe);
        }

        // 发送该时间点的事件（用于重建状态）
        if (result.events.length > 0) {
          socket.emit('replay:events-batch', result.events);
        }

        // 发送进度更新
        socket.emit('replay:progress', {
          currentTime: timestamp,
          totalTime: result.state?.totalDuration || 0,
        });
      } catch (error) {
        console.error('[ReplaySocket] 跳转失败:', error);
        socket.emit('replay:error', {
          code: 'SEEK_ERROR',
          message: '跳转失败',
        });
      }
    });

    socket.on('replay:set-speed', (speed: number) => {
      if (!currentSessionId) {
        socket.emit('replay:error', {
          code: 'NO_SESSION',
          message: '请先加载回放',
        });
        return;
      }

      try {
        const state = replayPlaybackService.setPlaybackSpeed(currentSessionId, speed);
        if (state) {
          socket.emit('replay:playback-state', state);
        }
      } catch (error) {
        console.error('[ReplaySocket] 设置速度失败:', error);
        socket.emit('replay:error', {
          code: 'SPEED_ERROR',
          message: '设置播放速度失败',
        });
      }
    });

    socket.on('replay:follow-player', (playerId: string | null) => {
      if (!currentSessionId) {
        socket.emit('replay:error', {
          code: 'NO_SESSION',
          message: '请先加载回放',
        });
        return;
      }

      try {
        const success = replayPlaybackService.setFollowPlayer(currentSessionId, playerId);
        if (success) {
          socket.emit('replay:follow-player-set', { playerId });
        }
      } catch (error) {
        console.error('[ReplaySocket] 设置跟随玩家失败:', error);
      }
    });

    // ==================== 断开连接 ====================

    socket.on('disconnect', () => {
      console.log(`[ReplaySocket] 客户端断开: ${socket.id}`);
      cleanupCurrentSession();
    });

    socket.on('replay:disconnect', () => {
      cleanupCurrentSession();
    });

    // ==================== 辅助函数 ====================

    function cleanupCurrentSession() {
      if (playbackInterval) {
        clearInterval(playbackInterval);
        playbackInterval = null;
      }

      if (currentSessionId) {
        replayPlaybackService.cleanupSession(currentSessionId);
        currentSessionId = null;
      }
    }

    function startPlaybackLoop() {
      if (playbackInterval) {
        clearInterval(playbackInterval);
      }

      // 使用50ms间隔进行平滑播放
      playbackInterval = setInterval(() => {
        if (!currentSessionId) return;

        const result = replayPlaybackService.updateProgress(currentSessionId);
        
        if (!result.state) {
          stopPlaybackLoop();
          return;
        }

        // 发送新事件
        if (result.newEvents.length > 0) {
          // 分批发送避免消息过大
          const batchSize = 20;
          for (let i = 0; i < result.newEvents.length; i += batchSize) {
            const batch = result.newEvents.slice(i, i + batchSize);
            socket.emit('replay:event-batch', batch);
          }
        }

        // 发送播放状态
        socket.emit('replay:playback-state', result.state);

        // 发送进度
        socket.emit('replay:progress', {
          currentTime: result.state.currentTime,
          totalTime: result.state.totalDuration,
        });

        // 检查是否播放结束
        if (!result.state.isPlaying || result.state.currentTime >= result.state.totalDuration) {
          stopPlaybackLoop();
          socket.emit('replay:ended');
        }
      }, 50);
    }

    function stopPlaybackLoop() {
      if (playbackInterval) {
        clearInterval(playbackInterval);
        playbackInterval = null;
      }
    }
  });

  console.log('[ReplaySocket] 回放 Socket 命名空间已设置: /replay');
}

// ==================== REST API 路由 ====================

import { Router } from 'express';

export function createReplayRouter(): Router {
  const router = Router();

  // 获取回放列表
  router.get('/', async (req, res) => {
    try {
      const query = {
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
        userId: req.query.userId as string,
        mapId: req.query.mapId as string,
        winner: req.query.winner as any,
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        sortBy: (req.query.sortBy as string) || 'date',
        sortOrder: (req.query.sortOrder as string) || 'desc',
      };

      const result = await replayPlaybackService.getReplayList(query);
      res.json(result);
    } catch (error) {
      console.error('[ReplayAPI] 获取回放列表失败:', error);
      res.status(500).json({ error: '获取回放列表失败' });
    }
  });

  // 获取回放详情
  router.get('/:replayId', async (req, res) => {
    try {
      const { replayId } = req.params;
      const metadata = await replayPlaybackService.getReplayDetail(replayId);

      if (!metadata) {
        return res.status(404).json({ error: '回放不存在或已被删除' });
      }

      res.json(metadata);
    } catch (error) {
      console.error('[ReplayAPI] 获取回放详情失败:', error);
      res.status(500).json({ error: '获取回放详情失败' });
    }
  });

  // 获取回放完整数据（用于下载或详细分析）
  router.get('/:replayId/data', async (req, res) => {
    try {
      const { replayId } = req.params;
      const data = await replayPlaybackService.getReplayData(replayId);

      if (!data) {
        return res.status(404).json({ error: '回放不存在或已被删除' });
      }

      res.json(data);
    } catch (error) {
      console.error('[ReplayAPI] 获取回放数据失败:', error);
      res.status(500).json({ error: '获取回放数据失败' });
    }
  });

  // 获取用户的回放历史
  router.get('/user/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

      const result = await replayPlaybackService.getUserReplays(userId, page, limit);
      res.json(result);
    } catch (error) {
      console.error('[ReplayAPI] 获取用户回放失败:', error);
      res.status(500).json({ error: '获取用户回放失败' });
    }
  });

  // 获取房间的所有回放
  router.get('/room/:roomId', async (req, res) => {
    try {
      const { roomId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

      const result = await replayPlaybackService.getRoomReplays(roomId, page, limit);
      res.json(result);
    } catch (error) {
      console.error('[ReplayAPI] 获取房间回放失败:', error);
      res.status(500).json({ error: '获取房间回放失败' });
    }
  });

  // 删除回放（软删除）
  router.delete('/:replayId', async (req, res) => {
    try {
      const { replayId } = req.params;
      const success = await replayPlaybackService.deleteReplay(replayId);

      if (!success) {
        return res.status(404).json({ error: '回放不存在' });
      }

      res.json({ success: true, message: '回放已删除' });
    } catch (error) {
      console.error('[ReplayAPI] 删除回放失败:', error);
      res.status(500).json({ error: '删除回放失败' });
    }
  });

  return router;
}
