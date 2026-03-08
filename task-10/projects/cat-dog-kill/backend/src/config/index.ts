import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  // 服务器配置
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    env: process.env.NODE_ENV || 'development',
    corsOrigin: process.env.CORS_ORIGIN || '*',
  },

  // 数据库配置
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/catdogkill',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },

  // Redis 配置
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },

  // JWT 配置
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // 游戏配置默认值
  game: {
    defaultMaxPlayers: 10,
    minPlayers: 4,
    defaultKillCooldown: 30, // 秒
    defaultMeetingCooldown: 15, // 秒
    defaultDiscussionTime: 45, // 秒
    defaultVotingTime: 120, // 秒
    defaultTaskCount: 5,
    defaultEmergencyMeetings: 1,
    moveSpeed: 5,
    killDistance: 2,
    interactDistance: 1.5,
  },

  // 日志配置
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.NODE_ENV === 'production' ? 'json' : 'simple',
  },
};

export default config;
