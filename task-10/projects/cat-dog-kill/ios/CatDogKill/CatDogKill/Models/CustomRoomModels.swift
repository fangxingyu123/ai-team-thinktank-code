// ==================== 自定义房间数据模型 ====================
// 文件: CatDogKill/Models/CustomRoomModels.swift
// 说明: 定义自定义房间相关的数据结构和枚举

import Foundation

// MARK: - 房间可见性
enum RoomVisibility: String, Codable, CaseIterable {
    case public_room = "public"      // 公开房间
    case private_room = "private"    // 私密房间（需要密码）
    
    var displayName: String {
        switch self {
        case .public_room:
            return "公开"
        case .private_room:
            return "私密"
        }
    }
    
    var icon: String {
        switch self {
        case .public_room:
            return "globe"
        case .private_room:
            return "lock.fill"
        }
    }
}

// MARK: - 自定义游戏规则
struct CustomGameRules: Codable, Equatable {
    var roleSettings: RoleSettings
    var mechanics: GameMechanics
    var taskSettings: TaskSettings
    var votingSettings: VotingSettings
    var emergencySettings: EmergencySettings
    
    static let `default` = CustomGameRules(
        roleSettings: RoleSettings(),
        mechanics: GameMechanics(),
        taskSettings: TaskSettings(),
        votingSettings: VotingSettings(),
        emergencySettings: EmergencySettings()
    )
}

// MARK: - 角色设置
struct RoleSettings: Codable, Equatable {
    var enableFox: Bool = true           // 启用狐狸
    var enableDetective: Bool = false    // 启用侦探猫
    var enableGuard: Bool = false        // 启用守护猫
    var overrideDogCount: Int = 0        // 手动狗狗数量（0=自动）
    var overrideFoxCount: Int = 0        // 手动狐狸数量（0=自动）
    
    var availableRoles: [String] {
        var roles = ["猫咪", "狗狗"]
        if enableFox { roles.append("狐狸") }
        if enableDetective { roles.append("侦探猫") }
        if enableGuard { roles.append("守护猫") }
        return roles
    }
}

// MARK: - 游戏机制
struct GameMechanics: Codable, Equatable {
    var playerSpeed: Double = 1.0        // 移动速度倍率 (0.5-2.0)
    var visionRange: Double = 1.0        // 视野范围倍率 (0.5-2.0)
    var ghostCanDoTasks: Bool = false    // 幽灵可做任务
    var showPlayerNames: Bool = true     // 显示玩家名字
    var confirmKills: Bool = true        // 击杀确认动画
}

// MARK: - 任务设置
struct TaskSettings: Codable, Equatable {
    var shortTasks: Int = 3              // 短任务数量 (1-5)
    var longTasks: Int = 1               // 长任务数量 (1-3)
    var commonTasks: Int = 1             // 共同任务数量 (0-2)
    var taskDifficulty: TaskDifficulty = .normal
    
    var totalTasks: Int {
        return shortTasks + longTasks + commonTasks
    }
}

enum TaskDifficulty: String, Codable, CaseIterable {
    case easy = "easy"
    case normal = "normal"
    case hard = "hard"
    
    var displayName: String {
        switch self {
        case .easy: return "简单"
        case .normal: return "普通"
        case .hard: return "困难"
        }
    }
}

// MARK: - 投票设置
struct VotingSettings: Codable, Equatable {
    var votingMode: VotingMode = .anonymous    // 投票模式
    var tieBreaker: TieBreaker = .skip         // 平票处理
    var allowSkip: Bool = true                 // 允许跳过
}

enum VotingMode: String, Codable, CaseIterable {
    case anonymous = "anonymous"    // 匿名投票
    case visible = "visible"        // 公开投票
    
    var displayName: String {
        switch self {
        case .anonymous: return "匿名投票"
        case .visible: return "公开投票"
        }
    }
}

enum TieBreaker: String, Codable, CaseIterable {
    case skip = "skip"      // 跳过
    case random = "random"  // 随机出局
    case all = "all"        // 全部出局
    
    var displayName: String {
        switch self {
        case .skip: return "无人出局"
        case .random: return "随机出局"
        case .all: return "全部出局"
        }
    }
}

// MARK: - 紧急会议设置
struct EmergencySettings: Codable, Equatable {
    var meetingsPerPlayer: Int = 1       // 每人紧急会议次数 (1-9)
    var meetingCooldown: Int = 15        // 紧急会议冷却（秒）
    var buttonPosition: ButtonPosition = .cafeteria
}

enum ButtonPosition: String, Codable, CaseIterable {
    case cafeteria = "cafeteria"    // 食堂
    case random = "random"          // 随机位置
    case all = "all"                // 所有房间
    
    var displayName: String {
        switch self {
        case .cafeteria: return "食堂"
        case .random: return "随机位置"
        case .all: return "所有房间"
        }
    }
}

// MARK: - 房间设置
struct RoomSettings: Codable, Equatable {
    var allowSpectators: Bool = false    // 允许观战
    var allowFriendJoin: Bool = true     // 允许好友直接加入
    var autoStart: Bool = false          // 人满自动开始
    var autoStartDelay: Int = 5          // 自动开始倒计时（秒）
}

// MARK: - 规则模板
struct RuleTemplate: Identifiable {
    let id = UUID()
    let name: String
    let description: String
    let rules: CustomGameRules
    let icon: String
    let color: String
}

extension RuleTemplate {
    static let templates: [RuleTemplate] = [
        RuleTemplate(
            name: "经典模式",
            description: "标准游戏规则，平衡体验",
            rules: .default,
            icon: "dice.fill",
            color: "#007AFF"
        ),
        RuleTemplate(
            name: "快速模式",
            description: "快节奏游戏，击杀冷却短",
            rules: CustomGameRules(
                roleSettings: RoleSettings(enableFox: true, enableDetective: false, enableGuard: false),
                mechanics: GameMechanics(playerSpeed: 1.3, visionRange: 1.2, ghostCanDoTasks: true, showPlayerNames: true, confirmKills: false),
                taskSettings: TaskSettings(shortTasks: 2, longTasks: 0, commonTasks: 1, taskDifficulty: .easy),
                votingSettings: VotingSettings(),
                emergencySettings: EmergencySettings(meetingsPerPlayer: 2, meetingCooldown: 10, buttonPosition: .all)
            ),
            icon: "bolt.fill",
            color: "#FF9500"
        ),
        RuleTemplate(
            name: "隐藏身份",
            description: "不显示玩家名字，更难辨认",
            rules: CustomGameRules(
                roleSettings: RoleSettings(),
                mechanics: GameMechanics(playerSpeed: 1.0, visionRange: 0.8, ghostCanDoTasks: false, showPlayerNames: false, confirmKills: true),
                taskSettings: TaskSettings(),
                votingSettings: VotingSettings(),
                emergencySettings: EmergencySettings()
            ),
            icon: "eye.slash.fill",
            color: "#5856D6"
        ),
        RuleTemplate(
            name: "任务狂魔",
            description: "大量任务，猫咪的胜利之路",
            rules: CustomGameRules(
                roleSettings: RoleSettings(),
                mechanics: GameMechanics(),
                taskSettings: TaskSettings(shortTasks: 5, longTasks: 3, commonTasks: 2, taskDifficulty: .hard),
                votingSettings: VotingSettings(),
                emergencySettings: EmergencySettings()
            ),
            icon: "list.bullet.clipboard.fill",
            color: "#34C759"
        ),
        RuleTemplate(
            name: "新手友好",
            description: "简单任务，更多提示",
            rules: CustomGameRules(
                roleSettings: RoleSettings(enableFox: false),
                mechanics: GameMechanics(playerSpeed: 0.9, visionRange: 1.2, ghostCanDoTasks: true, showPlayerNames: true, confirmKills: true),
                taskSettings: TaskSettings(shortTasks: 2, longTasks: 1, commonTasks: 1, taskDifficulty: .easy),
                votingSettings: VotingSettings(votingMode: .visible, allowSkip: true),
                emergencySettings: EmergencySettings(meetingsPerPlayer: 3, meetingCooldown: 10, buttonPosition: .all)
            ),
            icon: "hand.thumbsup.fill",
            color: "#30B0C7"
        ),
        RuleTemplate(
            name: "高手局",
            description: "高难度挑战，考验技术",
            rules: CustomGameRules(
                roleSettings: RoleSettings(enableFox: true, enableDetective: true, enableGuard: true),
                mechanics: GameMechanics(playerSpeed: 1.2, visionRange: 0.7, ghostCanDoTasks: false, showPlayerNames: false, confirmKills: false),
                taskSettings: TaskSettings(shortTasks: 4, longTasks: 2, commonTasks: 2, taskDifficulty: .hard),
                votingSettings: VotingSettings(votingMode: .anonymous, tieBreaker: .random, allowSkip: false),
                emergencySettings: EmergencySettings(meetingsPerPlayer: 1, meetingCooldown: 20, buttonPosition: .cafeteria)
            ),
            icon: "crown.fill",
            color: "#AF52DE"
        )
    ]
}

// MARK: - 房间信息
struct CustomRoomInfo: Codable, Identifiable {
    let id: String
    let name: String
    let hostId: String
    let visibility: RoomVisibility
    let hasPassword: Bool
    let passwordHint: String?
    let maxPlayers: Int
    let minPlayers: Int
    let status: String
    let gameConfig: GameConfig
    let customRules: CustomGameRules
    let settings: RoomSettings
    let createdAt: Date
    let updatedAt: Date
}

// MARK: - 公开房间列表项
struct PublicRoomItem: Codable, Identifiable {
    let id: String
    let name: String
    let hostName: String
    let playerCount: Int
    let maxPlayers: Int
    let hasPassword: Bool
    let status: String
    let gameMode: String
    let tags: [String]
    
    var isFull: Bool {
        return playerCount >= maxPlayers
    }
    
    var statusDisplay: String {
        switch status {
        case "waiting":
            return isFull ? "已满" : "等待中"
        case "playing":
            return "游戏中"
        default:
            return "未知"
        }
    }
}

// MARK: - 创建房间请求
struct CreateCustomRoomRequest: Codable {
    let name: String
    let visibility: RoomVisibility
    let password: String?
    let passwordHint: String?
    let maxPlayers: Int
    let minPlayers: Int
    let gameConfig: GameConfig
    let customRules: CustomGameRules
    let settings: RoomSettings
}

// MARK: - 加入房间请求
struct JoinRoomWithPasswordRequest: Codable {
    let roomId: String
    let playerName: String
    let password: String?
}

// MARK: - 游戏配置（与后端对应）
struct GameConfig: Codable, Equatable {
    var catCount: Int = 0
    var dogCount: Int = 0
    var foxCount: Int = 0
    var killCooldown: Int = 25        // 击杀冷却（秒）
    var meetingCooldown: Int = 15     // 会议冷却（秒）
    var discussionTime: Int = 45      // 讨论时间（秒）
    var votingTime: Int = 120         // 投票时间（秒）
    var taskCount: Int = 5            // 任务数量
    var emergencyMeetings: Int = 1    // 紧急会议次数
}

// MARK: - 扩展 Player 模型
extension Player {
    var isReady: Bool {
        get { return (self as? ExtendedPlayer)?.isReadyValue ?? false }
    }
}

// 用于接收服务器数据的扩展玩家模型
struct ExtendedPlayer: Codable {
    let id: String
    let name: String
    let avatar: String
    let isAlive: Bool
    let isConnected: Bool
    let isReadyValue: Bool
    let position: Position
    let completedTasks: Int
    let totalTasks: Int
}

struct Position: Codable {
    let x: Double
    let y: Double
}
