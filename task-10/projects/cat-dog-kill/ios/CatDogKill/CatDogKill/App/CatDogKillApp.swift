import SwiftUI

@main
struct CatDogKillApp: App {
    @StateObject private var appState = AppState()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
        }
    }
}

// MARK: - App State
class AppState: ObservableObject {
    @Published var currentScreen: Screen = .auth
    @Published var currentUser: User?
    @Published var currentRoom: Room?
    @Published var gameState: GameState?
    
    let socketService = SocketService.shared
    
    enum Screen {
        case auth
        case lobby
        case room
        case game
        case meeting
        case result
    }
    
    init() {
        setupSocketHandlers()
    }
    
    private func setupSocketHandlers() {
        // 监听游戏开始
        socketService.onGameStarted = { [weak self] role, team, players in
            DispatchQueue.main.async {
                self?.gameState = GameState(
                    status: .playing,
                    myRole: role,
                    myTeam: team,
                    players: players
                )
                self?.currentScreen = .game
            }
        }
        
        // 监听游戏结束
        socketService.onGameEnded = { [weak self] winner, reason in
            DispatchQueue.main.async {
                self?.gameState?.winner = winner
                self?.gameState?.endReason = reason
                self?.currentScreen = .result
            }
        }
        
        // 监听会议召开
        socketService.onMeetingCalled = { [weak self] meeting, callerName in
            DispatchQueue.main.async {
                self?.gameState?.currentMeeting = meeting
                self?.currentScreen = .meeting
            }
        }
        
        // 监听会议结束
        socketService.onMeetingEnded = { [weak self] in
            DispatchQueue.main.async {
                self?.currentScreen = .game
            }
        }
    }
}

// MARK: - Models
struct User: Identifiable, Codable {
    let id: String
    let username: String
    let nickname: String
    let avatar: String?
}

struct Room: Identifiable, Codable {
    let id: String
    let name: String
    let hostId: String
    var players: [Player]
    let maxPlayers: Int
    let status: String
}

struct Player: Identifiable, Codable, Equatable {
    let id: String
    let name: String
    let avatar: String
    var isAlive: Bool
    var isConnected: Bool
    var position: Position
    var completedTasks: Int
    var totalTasks: Int
    var role: Role?
    var team: Team?
}

struct Position: Codable, Equatable {
    var x: Double
    var y: Double
}

enum Role: String, Codable {
    case cat = "cat"
    case dog = "dog"
    case fox = "fox"
    
    var displayName: String {
        switch self {
        case .cat: return "猫咪"
        case .dog: return "狗狗"
        case .fox: return "狐狸"
        }
    }
    
    var emoji: String {
        switch self {
        case .cat: return "🐱"
        case .dog: return "🐶"
        case .fox: return "🦊"
        }
    }
    
    var description: String {
        switch self {
        case .cat:
            return "你是猫咪阵营。完成任务或找出所有狗狗来获胜！"
        case .dog:
            return "你是狗狗阵营。悄悄淘汰猫咪，制造混乱来获胜！"
        case .fox:
            return "你是狐狸。保持低调，存活到最后来获胜！"
        }
    }
}

enum Team: String, Codable {
    case cats = "cats"
    case dogs = "dogs"
    case foxes = "foxes"
}

struct GameState {
    var status: GameStatus
    var myRole: Role
    var myTeam: Team
    var players: [Player]
    var tasks: [Task] = []
    var currentMeeting: Meeting?
    var winner: Team?
    var endReason: String?
    var messages: [ChatMessage] = []
}

enum GameStatus: String {
    case lobby = "lobby"
    case roleAssignment = "role_assignment"
    case playing = "playing"
    case meeting = "meeting"
    case ended = "ended"
}

struct Task: Identifiable, Codable {
    let id: String
    let type: String
    let name: String
    let position: Position
    var isCompleted: Bool
}

struct Meeting: Identifiable, Codable {
    let id: String
    let type: String
    let callerId: String
    let bodyId: String?
    var votes: [String: String?] = [:]
    var isActive: Bool
    let startTime: Date
}

struct ChatMessage: Identifiable, Codable {
    let id: String
    let senderId: String
    let senderName: String
    let content: String
    let type: String
    let timestamp: Date
}

struct MeetingResult: Codable {
    let ejectedId: String?
    let wasImpostor: Bool
    let voteCount: [String: Int]
}
