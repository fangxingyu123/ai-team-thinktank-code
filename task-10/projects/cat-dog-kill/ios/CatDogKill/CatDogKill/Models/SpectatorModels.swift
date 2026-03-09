import Foundation

// MARK: - 观战者模型

/// 观战者
struct Spectator: Identifiable, Codable {
    let id: String
    let name: String
    let avatar: String
    let joinedAt: Date
    var isConnected: Bool
    var followingPlayerId: String?
    var freeCameraPosition: Position?
}

/// 观战配置
struct SpectatorConfig: Codable {
    let enabled: Bool
    let maxSpectators: Int
    let delaySeconds: Int
    let revealRoles: Bool
    let allowFreeCamera: Bool
    let allowPlayerSwitch: Bool
}

/// 观战者视角模式
enum SpectatorViewMode: String, Codable, CaseIterable {
    case followPlayer = "follow_player"
    case freeCamera = "free_camera"
    case autoSwitch = "auto_switch"
    
    var displayName: String {
        switch self {
        case .followPlayer:
            return "跟随玩家"
        case .freeCamera:
            return "自由视角"
        case .autoSwitch:
            return "自动切换"
        }
    }
    
    var icon: String {
        switch self {
        case .followPlayer:
            return "person.fill"
        case .freeCamera:
            return "video.fill"
        case .autoSwitch:
            return "arrow.triangle.2.circlepath"
        }
    }
}

/// 观战者状态更新
struct SpectatorStateUpdate: Codable {
    let spectatorCount: Int
    let maxSpectators: Int
    let watchingPlayerId: String?
    let viewMode: SpectatorViewMode
}

// MARK: - 观战游戏状态

/// 观战者看到的游戏状态
struct SpectatorGameState: Codable {
    let status: String
    let players: [SpectatorPlayerView]
    let tasksCompleted: Int
    let totalTasks: Int
    let meetingsCalled: Int
    let currentMeeting: SpectatorMeetingView?
    let winner: Team?
    let endReason: String?
}

/// 观战者看到的玩家信息
struct SpectatorPlayerView: Identifiable, Codable {
    let id: String
    let name: String
    let avatar: String
    let isAlive: Bool
    let position: Position
    let completedTasks: Int
    let totalTasks: Int
    let role: Role?
    let team: Team?
    
    /// 是否显示角色信息
    var hasRoleInfo: Bool {
        role != nil && team != nil
    }
    
    /// 角色显示文本
    var roleDisplay: String {
        guard let role = role else { return "???" }
        switch role {
        case .cat:
            return "🐱 猫咪"
        case .dog:
            return "🐶 狗狗"
        case .fox:
            return "🦊 狐狸"
        }
    }
    
    /// 队伍显示文本
    var teamDisplay: String {
        guard let team = team else { return "???" }
        switch team {
        case .cats:
            return "猫咪阵营"
        case .dogs:
            return "狗狗阵营"
        case .foxes:
            return "狐狸阵营"
        }
    }
}

/// 观战者看到的会议信息
struct SpectatorMeetingView: Codable {
    let id: String
    let type: MeetingType
    let callerName: String
    let isActive: Bool
    let votes: [String: String?]
    let voteCount: [String: Int]
    let timeRemaining: Int
    
    enum MeetingType: String, Codable {
        case emergency = "emergency"
        case body = "body"
    }
}

// MARK: - 观战聊天消息

struct SpectatorChatMessage: Identifiable, Codable {
    let id = UUID()
    let senderName: String
    let content: String
    let timestamp: Date
    
    var timeString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: timestamp)
    }
}

// MARK: - 观战房间信息

struct SpectatorRoomInfo: Codable {
    let roomId: String
    let enabled: Bool
    let canSpectate: Bool
    let spectatorCount: Int
    let maxSpectators: Int
    let delaySeconds: Int
    let revealRoles: Bool
}

// MARK: - 观战相关扩展

extension Position {
    /// 计算到另一个位置的距离
    func distance(to other: Position) -> Double {
        let dx = x - other.x
        let dy = y - other.y
        return sqrt(dx * dx + dy * dy)
    }
    
    /// 线性插值
    func lerp(to target: Position, t: Double) -> Position {
        Position(
            x: x + (target.x - x) * t,
            y: y + (target.y - y) * t
        )
    }
}

// MARK: - 观战工具

/// 观战相机控制器
class SpectatorCameraController: ObservableObject {
    @Published var position: Position = Position(x: 0, y: 0)
    @Published var zoom: Double = 1.0
    @Published var viewMode: SpectatorViewMode = .followPlayer
    @Published var followingPlayerId: String?
    
    private var lastUpdateTime: Date = Date()
    private let smoothFactor: Double = 0.1
    
    /// 更新相机位置（平滑跟随）
    func update(targetPosition: Position) {
        let currentTime = Date()
        let deltaTime = currentTime.timeIntervalSince(lastUpdateTime)
        lastUpdateTime = currentTime
        
        // 平滑插值
        let t = min(1.0, smoothFactor * deltaTime * 60)
        position = position.lerp(to: targetPosition, t: t)
    }
    
    /// 直接设置位置（用于自由视角）
    func setPosition(_ newPosition: Position) {
        position = newPosition
    }
    
    /// 移动相机（自由视角）
    func moveCamera(deltaX: Double, deltaY: Double) {
        position = Position(
            x: position.x + deltaX / zoom,
            y: position.y + deltaY / zoom
        )
    }
    
    /// 缩放
    func zoomIn() {
        zoom = min(2.0, zoom * 1.2)
    }
    
    func zoomOut() {
        zoom = max(0.5, zoom / 1.2)
    }
    
    /// 重置
    func reset() {
        position = Position(x: 0, y: 0)
        zoom = 1.0
        viewMode = .followPlayer
        followingPlayerId = nil
    }
}

/// 观战玩家选择器（用于自动切换模式）
class SpectatorPlayerSelector: ObservableObject {
    @Published var selectedPlayerId: String?
    @Published var isAutoSwitching: Bool = false
    
    private var playerIds: [String] = []
    private var currentIndex: Int = 0
    private var switchTimer: Timer?
    private let switchInterval: TimeInterval = 10.0 // 10秒切换一次
    
    /// 设置可切换的玩家列表
    func setPlayers(_ players: [String]) {
        playerIds = players
        if selectedPlayerId == nil || !playerIds.contains(selectedPlayerId!) {
            selectedPlayerId = playerIds.first
            currentIndex = 0
        }
    }
    
    /// 开始自动切换
    func startAutoSwitch() {
        isAutoSwitching = true
        switchTimer?.invalidate()
        switchTimer = Timer.scheduledTimer(withTimeInterval: switchInterval, repeats: true) { [weak self] _ in
            self?.switchToNextPlayer()
        }
    }
    
    /// 停止自动切换
    func stopAutoSwitch() {
        isAutoSwitching = false
        switchTimer?.invalidate()
        switchTimer = nil
    }
    
    /// 切换到下一个玩家
    func switchToNextPlayer() {
        guard !playerIds.isEmpty else { return }
        currentIndex = (currentIndex + 1) % playerIds.count
        selectedPlayerId = playerIds[currentIndex]
    }
    
    /// 切换到指定玩家
    func switchToPlayer(_ playerId: String) {
        if let index = playerIds.firstIndex(of: playerId) {
            currentIndex = index
            selectedPlayerId = playerId
        }
    }
    
    deinit {
        switchTimer?.invalidate()
    }
}
