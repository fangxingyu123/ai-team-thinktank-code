# 🐱🐶 猫狗杀 - 多人联机社交推理游戏

一款类似"鹅鸭杀"的多人联机社交推理游戏，玩家扮演猫咪或狗狗，在地图中完成任务或搞破坏。

## 📋 项目概述

- **玩家人数**: 4-10 人联机
- **游戏平台**: iOS (SwiftUI)
- **后端服务**: Node.js + TypeScript + Socket.IO
- **数据库**: MongoDB + Redis

## 🎮 核心玩法

### 角色分配
- 🐱 **猫咪 (好人)**: 完成任务，找出卧底
- 🐶 **狗狗 (坏人)**: 搞破坏，淘汰猫咪
- 🦊 **狐狸 (中立)**: 特殊胜利条件

### 胜利条件
- **猫咪**: 完成所有任务或找出所有卧底
- **狗狗**: 淘汰足够多的猫咪
- **狐狸**: 存活到最后

## 🛠️ 技术栈

### 前端 (iOS)
- Swift 5.9+
- SwiftUI
- Socket.IO Client
- Combine

### 后端
- Node.js + TypeScript
- Express + Socket.IO
- MongoDB (用户数据)
- Redis (房间状态缓存)

### 基础设施
- Docker + Docker Compose
- 阿里云/腾讯云

## 📦 项目结构

```
cat-dog-kill/
├── backend/          # Node.js 后端服务
├── ios/              # Swift iOS App
├── docs/             # 文档
└── assets/           # 游戏素材
```

## 🚀 快速开始

### 后端启动
```bash
cd backend
docker-compose up -d  # 启动 MongoDB 和 Redis
npm install
npm run dev
```

### iOS 启动
```bash
cd ios/CatDogKill
open CatDogKill.xcodeproj
# 在 Xcode 中运行
```

## 📅 开发进度

### ✅ 第一阶段 - MVP (已完成)
- [x] 用户注册/登录
- [x] 创建/加入房间
- [x] 4 人基础对战
- [x] 猫咪/狗狗基础角色
- [x] 简单地图（1 张）
- [x] 基础任务系统
- [x] 紧急会议 + 投票
- [x] 游戏结算

### ⏳ 第二阶段
- [ ] 更多角色（狐狸、侦探等）
- [ ] 更多地图（3-5 张）
- [ ] 语音聊天
- [ ] 好友系统
- [ ] 排行榜
- [ ] 成就系统

## 📝 文档

- [架构设计](./docs/architecture.md)
- [API 文档](./docs/api.md)
- [Socket 事件](./docs/socket-events.md)
- [数据库设计](./docs/database.md)

## ⚠️ 注意事项

1. **合规性**: 游戏内容健康，无暴力血腥
2. **版号**: 国内上线需要游戏版号（可先海外测试）
3. **服务器成本**: 预估初期 ¥500-1000/月

## 📄 许可证

MIT License
