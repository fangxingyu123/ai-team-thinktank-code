# 🗄️ 猫狗杀 - 数据库设计

## 1. MongoDB 集合

### 1.1 Users (用户集合)

```javascript
{
  _id: ObjectId,
  username: String,           // 用户名（唯一）
  password: String,           // bcrypt 加密密码
  nickname: String,           // 昵称
  avatar: String,             // 头像 URL
  stats: {
    gamesPlayed: Number,      // 游戏场次
    gamesWon: Number,         // 胜利场次
    gamesLost: Number,        // 失败场次
    catWins: Number,          // 猫咪胜利次数
    dogWins: Number,          // 狗狗胜利次数
    foxWins: Number           // 狐狸胜利次数
  },
  lastLoginAt: Date,          // 最后登录时间
  createdAt: Date,            // 创建时间
  updatedAt: Date             // 更新时间
}

// 索引
{
  username: 1  // 唯一索引
}
```

### 1.2 GameRecords (游戏记录)

```javascript
{
  _id: ObjectId,
  roomId: String,             // 房间ID
  startTime: Date,            // 开始时间
  endTime: Date,              // 结束时间
  winner: String,             // 获胜阵营
  players: [
    {
      userId: ObjectId,       // 用户ID
      role: String,           // 角色
      team: String,           // 阵营
      isAlive: Boolean,       // 是否存活
      completedTasks: Number, // 完成任务数
      kills: Number,          // 击杀数
      isWinner: Boolean       // 是否获胜
    }
  ],
  tasksCompleted: Number,     // 总任务完成数
  meetingsCalled: Number,     // 会议召开次数
  duration: Number            // 游戏时长（秒）
}

// 索引
{
  startTime: -1,
  "players.userId": 1
}
```

### 1.3 UserFriends (好友关系)

```javascript
{
  _id: ObjectId,
  userId: ObjectId,           // 用户ID
  friendId: ObjectId,         // 好友ID
  status: String,             // pending | accepted | blocked
  createdAt: Date
}

// 索引
{
  userId: 1,
  friendId: 1
}
```

## 2. Redis 数据结构

### 2.1 房间状态

```
Key: room:{roomId}
Type: Hash
TTL: 3600 (1小时)

Fields:
  - id: 房间ID
  - name: 房间名称
  - hostId: 房主ID
  - maxPlayers: 最大人数
  - status: 状态
  - gameState: 游戏状态(JSON)
  - gameConfig: 游戏配置(JSON)
  - createdAt: 创建时间
  - updatedAt: 更新时间
```

### 2.2 房间玩家列表

```
Key: room:{roomId}:players
Type: Set

Members:
  - playerId1
  - playerId2
  - ...
```

### 2.3 玩家信息

```
Key: player:{playerId}
Type: Hash
TTL: 3600

Fields:
  - id: 玩家ID
  - socketId: Socket ID
  - name: 玩家名称
  - avatar: 头像
  - role: 角色
  - team: 阵营
  - isAlive: 是否存活
  - position: 位置(JSON)
  - roomId: 所在房间ID
  - joinedAt: 加入时间
```

### 2.4 房间列表

```
Key: rooms:waiting
Type: Sorted Set
Score: 创建时间戳

Members:
  - roomId1
  - roomId2
  - ...
```

### 2.5 Socket 映射

```
Key: socket:{socketId}
Type: String
Value: playerId
TTL: 3600
```

### 2.6 在线玩家

```
Key: online:players
Type: Set

Members:
  - playerId1
  - playerId2
  - ...
```

## 3. 数据流

### 3.1 玩家加入房间

```
1. 创建/获取房间信息
   HSET room:{roomId} ...

2. 添加到房间玩家列表
   SADD room:{roomId}:players {playerId}

3. 创建玩家信息
   HSET player:{playerId} ...

4. 映射 Socket
   SET socket:{socketId} {playerId}

5. 添加到在线列表
   SADD online:players {playerId}

6. 添加到等待房间列表
   ZADD rooms:waiting {timestamp} {roomId}
```

### 3.2 玩家离开房间

```
1. 从房间玩家列表移除
   SREM room:{roomId}:players {playerId}

2. 删除玩家信息
   DEL player:{playerId}

3. 删除 Socket 映射
   DEL socket:{socketId}

4. 从在线列表移除
   SREM online:players {playerId}

5. 如果房间为空，删除房间
   IF SCARD room:{roomId}:players == 0:
     DEL room:{roomId}
     DEL room:{roomId}:players
     ZREM rooms:waiting {roomId}
```

### 3.3 游戏状态更新

```
1. 更新房间状态
   HSET room:{roomId} status playing
   HSET room:{roomId} gameState {json}

2. 从等待列表移除
   ZREM rooms:waiting {roomId}

3. 更新玩家角色
   HSET player:{playerId} role cat
   HSET player:{playerId} team cats
```

## 4. 持久化策略

### 4.1 MongoDB
- 用户数据：永久保存
- 游戏记录：保存最近 1000 场，定期归档
- 好友关系：永久保存

### 4.2 Redis
- 房间状态：1小时 TTL，游戏结束后立即清理
- 玩家信息：1小时 TTL，断线后保留
- Socket 映射：1小时 TTL

## 5. 备份策略

### 5.1 MongoDB
```bash
# 每日全量备份
0 2 * * * mongodump --out /backup/$(date +\%Y\%m\%d)

# 保留 7 天
find /backup -type d -mtime +7 -exec rm -rf {} \;
```

### 5.2 Redis
```bash
# 开启 AOF 持久化
appendonly yes
appendfsync everysec

# 每小时 BGSAVE
0 * * * * redis-cli BGSAVE
```

## 6. 性能优化

### 6.1 索引优化
```javascript
// Users 集合
db.users.createIndex({ username: 1 }, { unique: true })
db.users.createIndex({ createdAt: -1 })

// GameRecords 集合
db.gameRecords.createIndex({ startTime: -1 })
db.gameRecords.createIndex({ "players.userId": 1 })
db.gameRecords.createIndex({ winner: 1 })

// UserFriends 集合
db.userFriends.createIndex({ userId: 1, friendId: 1 }, { unique: true })
db.userFriends.createIndex({ userId: 1, status: 1 })
```

### 6.2 查询优化
- 使用投影减少返回字段
- 使用分页避免大数据量查询
- 使用聚合管道进行统计

### 6.3 缓存策略
- 房间列表：Redis 缓存，5秒刷新
- 玩家信息：Redis 缓存，1小时 TTL
- 游戏状态：Redis 实时，不缓存
