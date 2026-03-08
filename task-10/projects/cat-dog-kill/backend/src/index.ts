import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import Redis from 'ioredis';

import { config } from './config';
import { setupGameSocket } from './socket/GameSocket';
import { roomService } from './services/RoomService';

// 创建 Express 应用
const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: {
    origin: config.server.corsOrigin,
    methods: ['GET', 'POST'],
  },
});

// 中间件
app.use(helmet());
app.use(cors({ origin: config.server.corsOrigin }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// 房间列表 API
app.get('/api/rooms', (req, res) => {
  const rooms = roomService.getRoomList();
  res.json({ rooms });
});

// 数据库连接
async function connectDatabases() {
  try {
    // 连接 MongoDB
    await mongoose.connect(config.mongodb.uri);
    console.log('✅ MongoDB 连接成功');

    // 连接 Redis (可选)
    const redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      retryStrategy: (times) => {
        if (times > 3) {
          console.log('⚠️ Redis 连接失败，继续运行...');
          return null;
        }
        return Math.min(times * 50, 2000);
      },
    });

    redis.on('connect', () => {
      console.log('✅ Redis 连接成功');
    });

    redis.on('error', (err) => {
      console.log('⚠️ Redis 错误:', err.message);
    });

  } catch (error) {
    console.error('❌ 数据库连接失败:', error);
    process.exit(1);
  }
}

// 启动服务器
async function startServer() {
  await connectDatabases();

  // 设置 Socket.IO
  setupGameSocket(io);

  // 启动 HTTP 服务器
  httpServer.listen(config.server.port, () => {
    console.log(`
🐱🐶 猫狗杀服务器已启动！

📍 服务器地址: http://localhost:${config.server.port}
🔌 Socket.IO: ws://localhost:${config.server.port}

环境: ${config.server.env}
    `);
  });
}

// 错误处理
process.on('unhandledRejection', (error) => {
  console.error('未处理的 Promise 拒绝:', error);
});

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  process.exit(1);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('正在关闭服务器...');
  httpServer.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

// 启动
startServer();
