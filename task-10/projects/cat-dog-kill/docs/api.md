# 📡 猫狗杀 - API 文档

## 1. REST API

### 1.1 房间列表

```http
GET /api/rooms
```

**响应:**
```json
{
  "rooms": [
    {
      "id": "ABC123",
      "name": "玩家的房间",
      "hostName": "玩家1",
      "playerCount": 3,
      "maxPlayers": 10,
      "status": "waiting"
    }
  ]
}
```

### 1.2 健康检查

```http
GET /health
```

**响应:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600
}
```

## 2. Socket.IO 事件

### 2.1 房间管理

#### 创建房间
**发送:**
```json
{
  "event": "room:create",
  "data": {
    "name": "我的房间",
    "maxPlayers": 8,
    "config": {
      "killCooldown": 30,
      "taskCount": 5
    }
  }
}
```

**接收:**
```json
{
  "event": "room:joined",
  "data": {
    "roomId": "ABC123",
    "player": {
      "id": "p1",
      "name": "玩家1",
      "avatar": "🐱"
    },
    "players": [
      {
        "id": "p1",
        "name": "玩家1",
        "avatar": "🐱",
        "isAlive": true,
        "isConnected": true
      }
    ]
  }
}
```

#### 加入房间
**发送:**
```json
{
  "event": "room:join",
  "data": {
    "roomId": "ABC123",
    "playerName": "玩家2"
  }
}
```

**接收:** (同 room:joined)

#### 离开房间
**发送:**
```json
{
  "event": "room:leave"
}
```

**广播:**
```json
{
  "event": "player:left",
  "data": {
    "playerId": "p2"
  }
}
```

### 2.2 游戏控制

#### 开始游戏
**发送:**
```json
{
  "event": "game:start"
}
```

**接收 - 倒计时:**
```json
{
  "event": "game:starting",
  "data": {
    "countdown": 5
  }
}
```

**接收 - 游戏开始:**
```json
{
  "event": "game:started",
  "data": {
    "role": "cat",
    "team": "cats",
    "players": [
      {
        "id": "p1",
        "name": "玩家1",
        "avatar": "🐱",
        "role": "cat"
      },
      {
        "id": "p2",
        "name": "玩家2",
        "avatar": "🐶"
        // 不显示角色（如果不是同阵营）
      }
    ]
  }
}
```

### 2.3 游戏操作

#### 玩家移动
**发送:**
```json
{
  "event": "player:move",
  "data": {
    "x": 10.5,
    "y": 8.3
  }
}
```

**广播:**
```json
{
  "event": "player:moved",
  "data": {
    "playerId": "p1",
    "position": {
      "x": 10.5,
      "y": 8.3
    }
  }
}
```

#### 击杀玩家
**发送:**
```json
{
  "event": "player:kill",
  "data": "p2"
}
```

**广播:**
```json
{
  "event": "player:killed",
  "data": {
    "victimId": "p2",
    "killerId": "p1"
  }
}
```

#### 完成任务
**发送:**
```json
{
  "event": "player:complete-task",
  "data": "task123"
}
```

**广播:**
```json
{
  "event": "player:task-completed",
  "data": {
    "playerId": "p1",
    "taskId": "task123"
  }
}
```

### 2.4 会议系统

#### 召开紧急会议
**发送:**
```json
{
  "event": "player:call-meeting"
}
```

#### 报告尸体
**发送:**
```json
{
  "event": "player:report-body",
  "data": "p2"
}
```

**广播:**
```json
{
  "event": "meeting:called",
  "data": {
    "meeting": {
      "id": "m1",
      "type": "emergency",
      "callerId": "p1",
      "bodyId": null,
      "isActive": true,
      "startTime": "2024-01-01T00:00:00.000Z"
    },
    "callerName": "玩家1"
  }
}
```

#### 投票
**发送:**
```json
{
  "event": "meeting:vote",
  "data": "p2"
}
```

**广播:**
```json
{
  "event": "meeting:vote-cast",
  "data": {
    "voterId": "p1",
    "hasVoted": true
  }
}
```

#### 投票结果
**广播:**
```json
{
  "event": "meeting:result",
  "data": {
    "ejectedId": "p2",
    "wasImpostor": true,
    "voteCount": {
      "p2": 3,
      "skip": 1
    }
  }
}
```

**广播:**
```json
{
  "event": "meeting:ended"
}
```

### 2.5 聊天

#### 发送消息
**发送:**
```json
{
  "event": "chat:send",
  "data": {
    "content": "Hello!",
    "type": "game"
  }
}
```

**广播:**
```json
{
  "event": "chat:message",
  "data": {
    "id": "msg1",
    "senderId": "p1",
    "senderName": "玩家1",
    "content": "Hello!",
    "type": "game",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### 2.6 游戏结束

**广播:**
```json
{
  "event": "game:ended",
  "data": {
    "winner": "cats",
    "reason": "所有任务完成"
  }
}
```

### 2.7 错误处理

```json
{
  "event": "error",
  "data": {
    "code": "KILL_FAILED",
    "message": "击杀冷却中"
  }
}
```

## 3. 错误码

| 错误码 | 说明 |
|--------|------|
| `CREATE_ROOM_FAILED` | 创建房间失败 |
| `JOIN_ROOM_FAILED` | 加入房间失败 |
| `NOT_HOST` | 不是房主 |
| `START_GAME_FAILED` | 开始游戏失败 |
| `KILL_FAILED` | 击杀失败 |
| `MEETING_FAILED` | 召开会议失败 |
| `VOTE_FAILED` | 投票失败 |

## 4. 数据类型

### 4.1 Role (角色)
- `cat` - 猫咪（好人）
- `dog` - 狗狗（坏人）
- `fox` - 狐狸（中立）

### 4.2 Team (阵营)
- `cats` - 猫咪阵营
- `dogs` - 狗狗阵营
- `foxes` - 狐狸阵营

### 4.3 GameStatus (游戏状态)
- `lobby` - 大厅
- `role_assignment` - 角色分配
- `playing` - 游戏进行中
- `meeting` - 会议中
- `ended` - 游戏结束

### 4.4 MeetingType (会议类型)
- `emergency` - 紧急会议
- `body` - 尸体报告

### 4.5 ChatType (聊天类型)
- `lobby` - 大厅聊天
- `game` - 游戏内聊天
- `ghost` - 幽灵聊天（死亡玩家）
- `meeting` - 会议聊天
