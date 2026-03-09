import Foundation
import SocketIO
import Combine

/// 观战模式Socket服务
class SpectatorSocketService: ObservableObject {
    static let shared = SpectatorSocketService()
    
    private var manager: SocketManager!
    private var socket: SocketIOClient!
    
    // MARK: - Published Properties
    
    @Published var isConnected = false
    @Published var isSpectating = false
    @Published var currentRoomId: String?
    @Published var spectatorInfo: Spectator?
    @Published var gameState: SpectatorGameState?
    @Published var config: SpectatorConfig?
    @Published var viewMode: SpectatorViewMode = .followPlayer
    @Published var followingPlayerId: String?
    @Published var spectatorCount: Int = 0
    @Published var maxSpectators: Int = 10
    @Published var chatMessages: [SpectatorChatMessage] = []
    @Published var errorMessage: String?
    @Published var delaySeconds: Int = 5
    
    // MARK: - Callbacks
    
    var onJoined: ((String, Spectator, SpectatorGameState, SpectatorConfig) -> Void)?
    var onGameStateUpdate: ((SpectatorGameState) -> Void)?
    var onPlayerMoved: ((String, Position) -> Void)?
    var onPlayerKilled: ((String, String?) -> Void)?
    var onTaskCompleted: ((String, String) -> Void)?
    var onMeetingCalled: ((SpectatorMeetingView, String) -> Void)?
    var onVoteUpdated: ((String, String?) -> Void)?
    var onMeetingResult: ((String?, Bool) -> Void)?
    var onMeetingEnded: (() -> Void)?
    var onGameEnded: ((Team, String) -> Void)?
    var onNewSpectator: ((Spectator, Int) -> Void)?
    var onSpectatorLeft: ((String, Int) -> Void)?
    var onChatMessage: ((SpectatorChatMessage) -> Void)?
    var onError: ((String, String) -> Void)?
    
    // MARK: - Private Properties
    
    private var cancellables = Set<AnyCancellable>()
    private var reconnectAttempts = 0
    private let maxReconnectAttempts = 5
    
    // MARK: - Initialization
    
    private init() {
        setupSocket()
    }
    
    // MARK: - Socket Setup
    
    private func setupSocket() {
        let config: SocketIOClientConfiguration = [
            .log(true),
            .compress,
            .connectParams(["EIO": "4"]),
            .forceWebsockets(true),
            .reconnects(true),
            .reconnectAttempts(5),
            .reconnectWait(3)
        ]
        
        manager = SocketManager(
            socketURL: URL(string: "http://localhost:3000")!,
            config: config
        )
        socket = manager.defaultSocket
        
        setupEventHandlers()
    }
    
    private func setupEventHandlers() {
        // 连接状态
        socket.on(clientEvent: .connect) { [weak self] _, _ in
            DispatchQueue.main.async {
                self?.isConnected = true
                self?.reconnectAttempts = 0
                print("✅ 观战Socket已连接")
            }
        }
        
        socket.on(clientEvent: .disconnect) { [weak self] _, _ in
            DispatchQueue.main.async {
                self?.isConnected = false
                self?.isSpectating = false
                print("❌ 观战Socket已断开")
            }
        }
        
        socket.on(clientEvent: .error) { [weak self] data, _ in
            DispatchQueue.main.async {
                if let error = data.first as? String {
                    self?.errorMessage = error
                    print("⚠️ 观战Socket错误: \(error)")
                }
            }
        }
        
        // MARK: 观战事件
        
        // 成功加入观战
        socket.on("spectator:joined") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let roomId = dict["roomId"] as? String,
                  let spectatorData = dict["spectator"] as? [String: Any],
                  let gameStateData = dict["gameState"] as? [String: Any],
                  let configData = dict["config"] as? [String: Any] else {
                print("❌ 解析spectator:joined失败")
                return
            }
            
            do {
                let jsonData = try JSONSerialization.data(withJSONObject: spectatorData)
                let spectator = try JSONDecoder().decode(Spectator.self, from: jsonData)
                
                let stateJsonData = try JSONSerialization.data(withJSONObject: gameStateData)
                let gameState = try JSONDecoder().decode(SpectatorGameState.self, from: stateJsonData)
                
                let configJsonData = try JSONSerialization.data(withJSONObject: configData)
                let config = try JSONDecoder().decode(SpectatorConfig.self, from: configJsonData)
                
                DispatchQueue.main.async {
                    self?.isSpectating = true
                    self?.currentRoomId = roomId
                    self?.spectatorInfo = spectator
                    self?.gameState = gameState
                    self?.config = config
                    self?.delaySeconds = config.delaySeconds
                    self?.maxSpectators = config.maxSpectators
                    self?.spectatorCount = 1
                    
                    // 默认跟随第一个存活的玩家
                    if let firstPlayer = gameState.players.first(where: { $0.isAlive }) {
                        self?.followingPlayerId = firstPlayer.id
                        self?.viewMode = .followPlayer
                    }
                    
                    self?.onJoined?(roomId, spectator, gameState, config)
                    print("✅ 成功加入观战: \(roomId)")
                }
            } catch {
                print("❌ 解析观战数据失败: \(error)")
            }
        }
        
        // 观战状态更新
        socket.on("spectator:state") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let count = dict["spectatorCount"] as? Int,
                  let max = dict["maxSpectators"] as? Int,
                  let viewModeString = dict["viewMode"] as? String,
                  let viewMode = SpectatorViewMode(rawValue: viewModeString) else { return }
            
            DispatchQueue.main.async {
                self?.spectatorCount = count
                self?.maxSpectators = max
                self?.viewMode = viewMode
                self?.followingPlayerId = dict["watchingPlayerId"] as? String
            }
        }
        
        // 游戏状态同步
        socket.on("spectator:game-state") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any] else { return }
            
            do {
                let jsonData = try JSONSerialization.data(withJSONObject: dict)
                let state = try JSONDecoder().decode(SpectatorGameState.self, from: jsonData)
                
                DispatchQueue.main.async {
                    self?.gameState = state
                    self?.onGameStateUpdate?(state)
                }
            } catch {
                print("❌ 解析游戏状态失败: \(error)")
            }
        }
        
        // 玩家移动
        socket.on("spectator:player-moved") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let playerId = dict["playerId"] as? String,
                  let positionData = dict["position"] as? [String: Double],
                  let x = positionData["x"],
                  let y = positionData["y"] else { return }
            
            let position = Position(x: x, y: y)
            
            DispatchQueue.main.async {
                // 更新本地游戏状态中的玩家位置
                if let index = self?.gameState?.players.firstIndex(where: { $0.id == playerId }) {
                    // 由于struct是不可变的，我们需要重新创建
                    var updatedPlayers = self?.gameState?.players ?? []
                    let player = updatedPlayers[index]
                    updatedPlayers[index] = SpectatorPlayerView(
                        id: player.id,
                        name: player.name,
                        avatar: player.avatar,
                        isAlive: player.isAlive,
                        position: position,
                        completedTasks: player.completedTasks,
                        totalTasks: player.totalTasks,
                        role: player.role,
                        team: player.team
                    )
                    
                    if var state = self?.gameState {
                        state = SpectatorGameState(
                            status: state.status,
                            players: updatedPlayers,
                            tasksCompleted: state.tasksCompleted,
                            totalTasks: state.totalTasks,
                            meetingsCalled: state.meetingsCalled,
                            currentMeeting: state.currentMeeting,
                            winner: state.winner,
                            endReason: state.endReason
                        )
                        self?.gameState = state
                    }
                }
                
                self?.onPlayerMoved?(playerId, position)
            }
        }
        
        // 玩家死亡
        socket.on("spectator:player-killed") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let victimId = dict["victimId"] as? String else { return }
            
            let killerId = dict["killerId"] as? String
            
            DispatchQueue.main.async {
                // 更新本地状态
                if let index = self?.gameState?.players.firstIndex(where: { $0.id == victimId }) {
                    var updatedPlayers = self?.gameState?.players ?? []
                    let player = updatedPlayers[index]
                    updatedPlayers[index] = SpectatorPlayerView(
                        id: player.id,
                        name: player.name,
                        avatar: player.avatar,
                        isAlive: false,
                        position: player.position,
                        completedTasks: player.completedTasks,
                        totalTasks: player.totalTasks,
                        role: player.role,
                        team: player.team
                    )
                    
                    if var state = self?.gameState {
                        state = SpectatorGameState(
                            status: state.status,
                            players: updatedPlayers,
                            tasksCompleted: state.tasksCompleted,
                            totalTasks: state.totalTasks,
                            meetingsCalled: state.meetingsCalled,
                            currentMeeting: state.currentMeeting,
                            winner: state.winner,
                            endReason: state.endReason
                        )
                        self?.gameState = state
                    }
                }
                
                self?.onPlayerKilled?(victimId, killerId)
            }
        }
        
        // 任务完成
        socket.on("spectator:task-completed") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let playerId = dict["playerId"] as? String,
                  let taskId = dict["taskId"] as? String else { return }
            
            DispatchQueue.main.async {
                self?.onTaskCompleted?(playerId, taskId)
            }
        }
        
        // 会议召开
        socket.on("spectator:meeting-called") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let meetingData = dict["meeting"] as? [String: Any],
                  let callerName = dict["callerName"] as? String else { return }
            
            do {
                let jsonData = try JSONSerialization.data(withJSONObject: meetingData)
                let meeting = try JSONDecoder().decode(SpectatorMeetingView.self, from: jsonData)
                
                DispatchQueue.main.async {
                    if var state = self?.gameState {
                        state = SpectatorGameState(
                            status: "meeting",
                            players: state.players,
                            tasksCompleted: state.tasksCompleted,
                            totalTasks: state.totalTasks,
                            meetingsCalled: state.meetingsCalled + 1,
                            currentMeeting: meeting,
                            winner: state.winner,
                            endReason: state.endReason
                        )
                        self?.gameState = state
                    }
                    
                    self?.onMeetingCalled?(meeting, callerName)
                }
            } catch {
                print("❌ 解析会议数据失败: \(error)")
            }
        }
        
        // 投票更新
        socket.on("spectator:vote-updated") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let voterId = dict["voterId"] as? String else { return }
            
            let targetId = dict["targetId"] as? String
            
            DispatchQueue.main.async {
                self?.onVoteUpdated?(voterId, targetId)
            }
        }
        
        // 会议结果
        socket.on("spectator:meeting-result") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any] else { return }
            
            let ejectedId = dict["ejectedId"] as? String
            let wasImpostor = dict["wasImpostor"] as? Bool ?? false
            
            DispatchQueue.main.async {
                // 更新被投出玩家的状态
                if let ejectedId = ejectedId,
                   let index = self?.gameState?.players.firstIndex(where: { $0.id == ejectedId }) {
                    var updatedPlayers = self?.gameState?.players ?? []
                    let player = updatedPlayers[index]
                    updatedPlayers[index] = SpectatorPlayerView(
                        id: player.id,
                        name: player.name,
                        avatar: player.avatar,
                        isAlive: false,
                        position: player.position,
                        completedTasks: player.completedTasks,
                        totalTasks: player.totalTasks,
                        role: player.role,
                        team: player.team
                    )
                    
                    if var state = self?.gameState {
                        state = SpectatorGameState(
                            status: state.status,
                            players: updatedPlayers,
                            tasksCompleted: state.tasksCompleted,
                            totalTasks: state.totalTasks,
                            meetingsCalled: state.meetingsCalled,
                            currentMeeting: nil,
                            winner: state.winner,
                            endReason: state.endReason
                        )
                        self?.gameState = state
                    }
                }
                
                self?.onMeetingResult?(ejectedId, wasImpostor)
            }
        }
        
        // 会议结束
        socket.on("spectator:meeting-ended") { [weak self] _, _ in
            DispatchQueue.main.async {
                if var state = self?.gameState {
                    state = SpectatorGameState(
                        status: "playing",
                        players: state.players,
                        tasksCompleted: state.tasksCompleted,
                        totalTasks: state.totalTasks,
                        meetingsCalled: state.meetingsCalled,
                        currentMeeting: nil,
                        winner: state.winner,
                        endReason: state.endReason
                    )
                    self?.gameState = state
                }
                
                self?.onMeetingEnded?()
            }
        }
        
        // 游戏结束
        socket.on("spectator:game-ended") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let winnerString = dict["winner"] as? String,
                  let reason = dict["reason"] as? String,
                  let winner = Team(rawValue: winnerString) else { return }
            
            DispatchQueue.main.async {
                if var state = self?.gameState {
                    state = SpectatorGameState(
                        status: "ended",
                        players: state.players,
                        tasksCompleted: state.tasksCompleted,
                        totalTasks: state.totalTasks,
                        meetingsCalled: state.meetingsCalled,
                        currentMeeting: nil,
                        winner: winner,
                        endReason: reason
                    )
                    self?.gameState = state
                }
                
                self?.isSpectating = false
                self?.onGameEnded?(winner, reason)
            }
        }
        
        // 新观战者加入
        socket.on("spectator:new") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let count = dict["count"] as? Int,
                  let spectatorData = dict["spectator"] as? [String: Any] else { return }
            
            do {
                let jsonData = try JSONSerialization.data(withJSONObject: spectatorData)
                let spectator = try JSONDecoder().decode(Spectator.self, from: jsonData)
                
                DispatchQueue.main.async {
                    self?.spectatorCount = count
                    self?.onNewSpectator?(spectator, count)
                }
            } catch {
                print("❌ 解析新观战者数据失败: \(error)")
            }
        }
        
        // 观战者离开
        socket.on("spectator:left") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let spectatorId = dict["spectatorId"] as? String,
                  let count = dict["count"] as? Int else { return }
            
            DispatchQueue.main.async {
                self?.spectatorCount = count
                self?.onSpectatorLeft?(spectatorId, count)
            }
        }
        
        // 观战聊天
        socket.on("spectator:chat") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let senderName = dict["senderName"] as? String,
                  let content = dict["content"] as? String else { return }
            
            let timestamp = (dict["timestamp"] as? String).flatMap { string -> Date? in
                let formatter = ISO8601DateFormatter()
                return formatter.date(from: string)
            } ?? Date()
            
            let message = SpectatorChatMessage(
                senderName: senderName,
                content: content,
                timestamp: timestamp
            )
            
            DispatchQueue.main.async {
                self?.chatMessages.append(message)
                self?.onChatMessage?(message)
            }
        }
        
        // 错误
        socket.on("spectator:error") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let code = dict["code"] as? String,
                  let message = dict["message"] as? String else { return }
            
            DispatchQueue.main.async {
                self?.errorMessage = message
                self?.onError?(code, message)
            }
        }
    }
    
    // MARK: - Connection
    
    func connect() {
        socket.connect()
    }
    
    func disconnect() {
        leaveSpectating()
        socket.disconnect()
    }
    
    // MARK: - Spectator Actions
    
    /// 加入观战
    func joinSpectating(roomId: String, playerName: String) {
        let data: [String: Any] = [
            "roomId": roomId,
            "playerName": playerName
        ]
        socket.emit("spectator:join", data)
    }
    
    /// 离开观战
    func leaveSpectating() {
        socket.emit("spectator:leave")
        
        DispatchQueue.main.async {
            self.isSpectating = false
            self.currentRoomId = nil
            self.spectatorInfo = nil
            self.gameState = nil
            self.chatMessages = []
            self.followingPlayerId = nil
        }
    }
    
    /// 切换跟随玩家
    func followPlayer(_ playerId: String) {
        guard isSpectating else { return }
        socket.emit("spectator:follow-player", playerId)
        
        DispatchQueue.main.async {
            self.followingPlayerId = playerId
            self.viewMode = .followPlayer
        }
    }
    
    /// 切换到自由视角
    func setFreeCamera(position: Position) {
        guard isSpectating else { return }
        
        let data: [String: Double] = [
            "x": position.x,
            "y": position.y
        ]
        socket.emit("spectator:free-camera", data)
        
        DispatchQueue.main.async {
            self.viewMode = .freeCamera
            self.followingPlayerId = nil
        }
    }
    
    /// 发送聊天消息
    func sendChatMessage(_ content: String) {
        guard isSpectating else { return }
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        
        socket.emit("spectator:send-chat", trimmed)
    }
    
    /// 切换视角模式
    func setViewMode(_ mode: SpectatorViewMode) {
        guard isSpectating else { return }
        socket.emit("spectator:set-view-mode", mode.rawValue)
        
        DispatchQueue.main.async {
            self.viewMode = mode
        }
    }
    
    // MARK: - API
    
    /// 获取房间观战信息
    func fetchSpectatorInfo(roomId: String) async -> SpectatorRoomInfo? {
        guard let url = URL(string: "http://localhost:3000/api/rooms/\(roomId)/spectator") else {
            return nil
        }
        
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let info = try JSONDecoder().decode(SpectatorRoomInfo.self, from: data)
            return info
        } catch {
            print("❌ 获取观战信息失败: \(error)")
            return nil
        }
    }
    
    // MARK: - Helpers
    
    /// 获取当前跟随玩家的位置
    func getFollowingPlayerPosition() -> Position? {
        guard let playerId = followingPlayerId else { return nil }
        return gameState?.players.first(where: { $0.id == playerId })?.position
    }
    
    /// 获取存活玩家列表
    func getAlivePlayers() -> [SpectatorPlayerView] {
        return gameState?.players.filter { $0.isAlive } ?? []
    }
    
    /// 清除错误信息
    func clearError() {
        errorMessage = nil
    }
}
