# 🏗️ 猫狗杀 - 系统架构设计

## 1. 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         客户端 (iOS)                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   SwiftUI   │  │ Socket.IO   │  │      Game Logic         │  │
│  │    界面层    │◄─┤   Client    │◄─┤    (角色/任务/投票)      │  │
│  └─────────────┘  └──────┬──────┘  └─────────────────────────┘  │
└──────────────────────────┼──────────────────────────────────────┘
                           │ WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      服务端 (Node.js)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Express   │  │ Socket.IO   │  │    Game Services        │  │
│  │   REST API  │◄─┤   Server    │◄─┤  (Room/Game/Meeting)    │  │
│  └─────────────┘  └──────┬──────┘  └─────────────────────────┘  │
│                          │                                      │
│  ┌───────────────────────┼───────────────────────────────────┐  │
│  │                       ▼                                   │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │   MongoDB   │  │    Redis    │  │   Game State    │   │  │
│  │  │  (用户数据)  │  │  (房间状态)  │  │    Manager      │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 2. 技术栈

### 2.1 前端
| 技术 | 版本 | 用途 |
|------|------|------|
| Swift | 5.9+ | 开发语言 |
| SwiftUI | iOS 15+ | UI 框架 |
| Socket.IO Client | 16.x | 实时通信 |
| Combine | - | 响应式编程 |

### 2.2 后端
| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | 18+ | 运行环境 |
| TypeScript | 5.x | 开发语言 |
| Express | 4.x | Web 框架 |
| Socket.IO | 4.x | 实时通信 |
| MongoDB | 7.x | 持久化存储 |
| Redis | 7.x | 缓存/状态 |
| Docker | - | 容器化部署 |

## 3. 核心模块

### 3.1 房间管理 (RoomService)

```typescript
class RoomService {
  // 创建房间
  createRoom(hostName, hostSocketId, options): Room
  
  // 加入房间
  joinRoom(roomId, playerName, socketId): { room, player }
  
  // 离开房间
  leaveRoom(roomId, playerId): Room | null
  
  // 分配角色
  assignRoles(room): void
  
  // 获取房间列表
  getRoomList(): Room[]
}
```

### 3.2 游戏逻辑 (GameService)

```typescript
class GameService {
  // 开始游戏
  startGame(room): boolean
  
  // 玩家移动
  movePlayer(room, playerId, position): boolean
  
  // 击杀玩家
  killPlayer(room, killerId, victimId): Result
  
  // 完成任务
  completeTask(room, playerId, taskId): boolean
  
  // 召开会议
  callMeeting(room, callerId, bodyId?): Result
  
  // 投票
  castVote(room, voterId, targetId): boolean
  
  // 检查游戏结束
  checkGameEnd(room): void
}
```

### 3.3 实时通信 (Socket)

```typescript
// 服务器事件
interface ServerEvents {
  'room:joined': (data) => void
  'game:started': (data) => void
  'player:moved': (data) => void
  'player:killed': (data) => void
  'meeting:called': (data) => void
  'meeting:result': (result) => void
  'game:ended': (data) => void
}

// 客户端事件
interface ClientEvents {
  'room:create': (data) => void
  'room:join': (data) => void
  'player:move': (position) => void
  'player:kill': (targetId) => void
  'meeting:vote': (targetId) => void
}
```

## 4. 数据流

### 4.1 游戏流程

```
1. 创建/加入房间
   Client ──► Server: room:create / room:join
   Server ──► Client: room:joined

2. 开始游戏
   Host ──► Server: game:start
   Server ──► All: game:starting (countdown)
   Server ──► All: game:started (role assignment)

3. 游戏进行
   Client ──► Server: player:move (50ms interval)
   Server ──► Others: player:moved
   
   Dog ──► Server: player:kill
   Server ──► All: player:killed
   
   Cat ──► Server: player:complete-task
   Server ──► All: player:task-completed

4. 召开会议
   Client ──► Server: player:call-meeting / player:report-body
   Server ──► All: meeting:called
   
   Client ──► Server: meeting:vote
   Server ──► All: meeting:vote-cast
   
   Server ──► All: meeting:result
   Server ──► All: meeting:ended

5. 游戏结束
   Server ──► All: game:ended (winner, reason)
```

## 5. 状态管理

### 5.1 房间状态
```typescript
interface Room {
  id: string           // 房间代码
  name: string         // 房间名称
  hostId: string       // 房主ID
  players: Map<string, Player>
  maxPlayers: number
  status: 'waiting' | 'playing' | 'ended'
  gameState?: GameState
  gameConfig: GameConfig
}
```

### 5.2 玩家状态
```typescript
interface Player {
  id: string
  socketId: string
  name: string
  avatar: string
  role?: 'cat' | 'dog' | 'fox'
  team?: 'cats' | 'dogs' | 'foxes'
  isAlive: boolean
  isConnected: boolean
  position: { x: number, y: number }
  tasks: Task[]
  completedTasks: string[]
  canKill: boolean
  killCooldown: number
}
```

### 5.3 游戏状态
```typescript
interface GameState {
  status: 'lobby' | 'role_assignment' | 'playing' | 'meeting' | 'ended'
  startTime?: Date
  endTime?: Date
  currentMeeting?: Meeting
  meetingsCalled: number
  tasksCompleted: number
  totalTasks: number
  winner?: Team
  endReason?: string
}
```

## 6. 部署架构

```
┌─────────────────────────────────────────────────────────┐
│                      负载均衡 (Nginx)                    │
└─────────────────────────┬───────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│  Game Server  │ │  Game Server  │ │  Game Server  │
│    Node 1     │ │    Node 2     │ │    Node 3     │
└───────┬───────┘ └───────┬───────┘ └───────┬───────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│   MongoDB     │ │    Redis      │ │   Redis       │
│   Primary     │ │   (Cache)     │ │  (Pub/Sub)    │
└───────────────┘ └───────────────┘ └───────────────┘
```

## 7. 安全设计

### 7.1 通信安全
- WebSocket 使用 WSS (WebSocket Secure)
- 敏感操作需要验证玩家身份
- 服务器端验证所有游戏逻辑

### 7.2 游戏安全
- 服务器权威：所有游戏状态由服务器维护
- 移动验证：限制移动速度和范围
- 击杀验证：检查距离、冷却时间、角色权限
- 反作弊：检测异常行为（瞬移、过快完成任务等）

### 7.3 数据安全
- 密码使用 bcrypt 加密
- JWT Token 身份验证
- 敏感信息不发送到客户端

## 8. 性能优化

### 8.1 网络优化
- 位置更新 50ms 间隔（20fps）
- 使用二进制协议减少数据量
- 只发送变化的数据

### 8.2 服务器优化
- Redis 缓存房间状态
- 游戏循环使用固定时间步长
- 使用对象池减少 GC 压力

### 8.3 客户端优化
- 客户端预测 + 服务器校正
- 插值平滑其他玩家移动
- 使用 SpriteKit 渲染游戏画面（可选）
