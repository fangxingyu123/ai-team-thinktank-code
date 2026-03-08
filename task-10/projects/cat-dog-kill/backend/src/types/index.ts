// ==================== 核心类型定义 ====================

export type Role = 'cat' | 'dog' | 'fox';
export type Team = 'cats' | 'dogs' | 'foxes';
export type RoomStatus = 'waiting' | 'playing' | 'ended';
export type GameStatus = 'lobby' | 'role_assignment' | 'playing' | 'meeting' | 'ended';
export type TaskType = 'wiring' | 'download' | 'scan' | 'trash' | 'card';

// ==================== 位置 ====================
export interface Position {
  x: number;
  y: number;
}

// ==================== 玩家 ====================
export interface Player {
  id: string;
  socketId: string;
  name: string;
  avatar: string;
  role?: Role;
  team?: Team;
  isAlive: boolean;
  isConnected: boolean;
  position: Position;
  tasks: Task[];
  completedTasks: string[];
  canKill: boolean;
  killCooldown: number;
  lastKillTime?: Date;
  joinedAt: Date;
}

// ==================== 房间 ====================
export interface Room {
  id: string;
  name: string;
  hostId: string;
  players: Map<string, Player>; // playerId -> Player
  maxPlayers: number;
  status: RoomStatus;
  gameState?: GameState;
  gameConfig: GameConfig;
  createdAt: Date;
  updatedAt: Date;
}

// ==================== 游戏配置 ====================
export interface GameConfig {
  catCount: number;
  dogCount: number;
  foxCount: number;
  killCooldown: number; // 秒
  meetingCooldown: number; // 秒
  discussionTime: number; // 秒
  votingTime: number; // 秒
  taskCount: number;
  emergencyMeetings: number;
}

// ==================== 游戏状态 ====================
export interface GameState {
  status: GameStatus;
  startTime?: Date;
  endTime?: Date;
  currentMeeting?: Meeting;
  meetingsCalled: number;
  tasksCompleted: number;
  totalTasks: number;
  winner?: Team;
  endReason?: string;
}

// ==================== 任务 ====================
export interface Task {
  id: string;
  type: TaskType;
  name: string;
  position: Position;
  isCompleted: boolean;
  assignedTo?: string;
  duration: number; // 秒
}

// ==================== 破坏 ====================
export interface Sabotage {
  id: string;
  type: string;
  name: string;
  position: Position;
  isActive: boolean;
  duration: number;
  startedBy: string;
  startedAt: Date;
}

// ==================== 会议 ====================
export interface Meeting {
  id: string;
  type: 'emergency' | 'body';
  callerId: string;
  bodyId?: string;
  votes: Map<string, string | null>; // voterId -> targetId (null = skip)
  isActive: boolean;
  startTime: Date;
  endTime?: Date;
  result?: MeetingResult;
}

export interface MeetingResult {
  ejectedId: string | null;
  wasImpostor: boolean;
  voteCount: Map<string, number>;
}

// ==================== 聊天 ====================
export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  type: 'lobby' | 'game' | 'ghost' | 'meeting';
  timestamp: Date;
}

// ==================== 地图 ====================
export interface GameMap {
  id: string;
  name: string;
  width: number;
  height: number;
  spawnPoints: Position[];
  taskLocations: TaskLocation[];
  ventLocations: VentLocation[];
  collisionAreas: CollisionArea[];
}

export interface TaskLocation {
  id: string;
  type: TaskType;
  position: Position;
}

export interface VentLocation {
  id: string;
  position: Position;
  connectedVents: string[];
}

export interface CollisionArea {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ==================== Socket 事件 ====================

// 服务器 -> 客户端
export interface ServerEvents {
  'room:joined': (data: { roomId: string; player: Player; players: Player[] }) => void;
  'room:left': (data: { playerId: string }) => void;
  'room:updated': (data: { players: Player[]; hostId: string }) => void;
  'game:starting': (data: { countdown: number }) => void;
  'game:started': (data: { role: Role; team: Team; players: Player[] }) => void;
  'game:state': (state: GameState) => void;
  'game:ended': (data: { winner: Team; reason: string }) => void;
  'player:joined': (player: Player) => void;
  'player:left': (data: { playerId: string }) => void;
  'player:moved': (data: { playerId: string; position: Position }) => void;
  'player:killed': (data: { victimId: string; killerId?: string }) => void;
  'player:task-completed': (data: { playerId: string; taskId: string }) => void;
  'task:assigned': (tasks: Task[]) => void;
  'sabotage:started': (sabotage: Sabotage) => void;
  'sabotage:ended': (data: { sabotageId: string }) => void;
  'meeting:called': (data: { meeting: Meeting; callerName: string }) => void;
  'meeting:vote-cast': (data: { voterId: string; hasVoted: boolean }) => void;
  'meeting:result': (result: MeetingResult) => void;
  'meeting:ended': () => void;
  'chat:message': (message: ChatMessage) => void;
  'error': (error: { code: string; message: string }) => void;
}

// 客户端 -> 服务器
export interface ClientEvents {
  'room:create': (data: { name: string; maxPlayers?: number; config?: Partial<GameConfig> }) => void;
  'room:join': (data: { roomId: string; playerName: string }) => void;
  'room:leave': () => void;
  'room:update-config': (config: Partial<GameConfig>) => void;
  'game:start': () => void;
  'player:move': (position: Position) => void;
  'player:interact': (data: { targetType: string; targetId: string }) => void;
  'player:complete-task': (taskId: string) => void;
  'player:report-body': (bodyId: string) => void;
  'player:call-meeting': () => void;
  'player:kill': (targetId: string) => void;
  'player:use-vent': (ventId: string) => void;
  'player:sabotage': (sabotageId: string) => void;
  'player:fix-sabotage': (sabotageId: string) => void;
  'meeting:vote': (targetId: string | null) => void;
  'chat:send': (data: { content: string; type: ChatMessage['type'] }) => void;
}

// ==================== API 类型 ====================

export interface CreateUserRequest {
  username: string;
  password: string;
  nickname?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    username: string;
    nickname: string;
    avatar?: string;
    stats: UserStats;
  };
}

export interface UserStats {
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  winRate: number;
  catWins: number;
  dogWins: number;
  foxWins: number;
}

export interface RoomListResponse {
  rooms: Array<{
    id: string;
    name: string;
    hostName: string;
    playerCount: number;
    maxPlayers: number;
    status: RoomStatus;
  }>;
}
