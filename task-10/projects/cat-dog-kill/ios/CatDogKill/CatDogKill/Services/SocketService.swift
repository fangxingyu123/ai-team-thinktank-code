import Foundation
import SocketIO

class SocketService: ObservableObject {
    static let shared = SocketService()
    
    private var manager: SocketManager!
    private var socket: SocketIOClient!
    
    @Published var isConnected = false
    @Published var currentRoom: Room?
    @Published var players: [Player] = []
    @Published var messages: [ChatMessage] = []
    @Published var myPlayerId: String?
    @Published var myRole: Role?
    @Published var myTeam: Team?
    @Published var gameStatus: GameStatus = .lobby
    @Published var errorMessage: String?
    
    // Callbacks
    var onRoomJoined: ((Room, Player, [Player]) -> Void)?
    var onPlayerJoined: ((Player) -> Void)?
    var onPlayerLeft: ((String) -> Void)?
    var onGameStarting: ((Int) -> Void)?
    var onGameStarted: ((Role, Team, [Player]) -> Void)?
    var onPlayerMoved: ((String, Position) -> Void)?
    var onPlayerKilled: ((String, String?) -> Void)?
    var onTaskCompleted: ((String, String) -> Void)?
    var onMeetingCalled: ((Meeting, String) -> Void)?
    var onVoteCast: ((String, Bool) -> Void)?
    var onMeetingResult: ((MeetingResult) -> Void)?
    var onMeetingEnded: (() -> Void)?
    var onGameEnded: ((Team, String) -> Void)?
    var onChatMessage: ((ChatMessage) -> Void)?
    var onError: ((String, String) -> Void)?
    
    private init() {
        setupSocket()
    }
    
    private func setupSocket() {
        // 配置 SocketManager
        let config: SocketIOClientConfiguration = [
            .log(true),
            .compress,
            .connectParams(["EIO": "4"]),
            .forceWebsockets(true),
            .reconnects(true),
            .reconnectAttempts(-1),
            .reconnectWait(3)
        ]
        
        // 使用本地服务器地址，生产环境需要替换
        manager = SocketManager(socketURL: URL(string: "http://localhost:3000")!, config: config)
        socket = manager.defaultSocket
        
        setupEventHandlers()
    }
    
    private func setupEventHandlers() {
        // 连接状态
        socket.on(clientEvent: .connect) { [weak self] data, ack in
            DispatchQueue.main.async {
                self?.isConnected = true
                print("✅ Socket 已连接")
            }
        }
        
        socket.on(clientEvent: .disconnect) { [weak self] data, ack in
            DispatchQueue.main.async {
                self?.isConnected = false
                print("❌ Socket 已断开")
            }
        }
        
        socket.on(clientEvent: .error) { [weak self] data, ack in
            DispatchQueue.main.main.async {
                if let error = data.first as? String {
                    self?.errorMessage = error
                    print("⚠️ Socket 错误: \(error)")
                }
            }
        }
        
        // 房间事件
        socket.on("room:joined") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let roomData = dict["roomId"] as? String,
                  let playerData = dict["player"] as? [String: Any],
                  let playersData = dict["players"] as? [[String: Any]] else { return }
            
            DispatchQueue.main.async {
                // 解析数据并更新状态
                self?.myPlayerId = playerData["id"] as? String
                // TODO: 解析完整的 Room 和 Player 对象
                print("✅ 加入房间: \(roomData)")
            }
        }
        
        socket.on("player:joined") { [weak self] data, ack in
            guard let playerData = data.first as? [String: Any] else { return }
            // TODO: 解析 Player 对象
        }
        
        socket.on("player:left") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let playerId = dict["playerId"] as? String else { return }
            
            DispatchQueue.main.async {
                self?.onPlayerLeft?(playerId)
                self?.players.removeAll { $0.id == playerId }
            }
        }
        
        socket.on("room:updated") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let playersData = dict["players"] as? [[String: Any]] else { return }
            
            DispatchQueue.main.async {
                // TODO: 更新玩家列表
            }
        }
        
        // 游戏事件
        socket.on("game:starting") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let countdown = dict["countdown"] as? Int else { return }
            
            DispatchQueue.main.async {
                self?.onGameStarting?(countdown)
            }
        }
        
        socket.on("game:started") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let roleString = dict["role"] as? String,
                  let teamString = dict["team"] as? String,
                  let playersData = dict["players"] as? [[String: Any]] else { return }
            
            DispatchQueue.main.async {
                self?.myRole = Role(rawValue: roleString)
                self?.myTeam = Team(rawValue: teamString)
                self?.gameStatus = .playing
                
                if let role = self?.myRole, let team = self?.myTeam {
                    // TODO: 解析玩家列表
                    self?.onGameStarted?(role, team, [])
                }
            }
        }
        
        socket.on("game:state") { [weak self] data, ack in
            guard let stateData = data.first as? [String: Any] else { return }
            // TODO: 更新游戏状态
        }
        
        socket.on("player:moved") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let playerId = dict["playerId"] as? String,
                  let positionData = dict["position"] as? [String: Double],
                  let x = positionData["x"],
                  let y = positionData["y"] else { return }
            
            DispatchQueue.main.async {
                self?.onPlayerMoved?(playerId, Position(x: x, y: y))
            }
        }
        
        socket.on("player:killed") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let victimId = dict["victimId"] as? String,
                  let killerId = dict["killerId"] as? String? else { return }
            
            DispatchQueue.main.async {
                self?.onPlayerKilled?(victimId, killerId)
                if let index = self?.players.firstIndex(where: { $0.id == victimId }) {
                    self?.players[index].isAlive = false
                }
            }
        }
        
        socket.on("player:task-completed") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let playerId = dict["playerId"] as? String,
                  let taskId = dict["taskId"] as? String else { return }
            
            DispatchQueue.main.async {
                self?.onTaskCompleted?(playerId, taskId)
            }
        }
        
        socket.on("task:assigned") { [weak self] data, ack in
            guard let tasksData = data.first as? [[String: Any]] else { return }
            // TODO: 解析任务列表
        }
        
        // 会议事件
        socket.on("meeting:called") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let meetingData = dict["meeting"] as? [String: Any],
                  let callerName = dict["callerName"] as? String else { return }
            
            DispatchQueue.main.async {
                self?.gameStatus = .meeting
                // TODO: 解析 Meeting 对象
                // self?.onMeetingCalled?(meeting, callerName)
            }
        }
        
        socket.on("meeting:vote-cast") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let voterId = dict["voterId"] as? String,
                  let hasVoted = dict["hasVoted"] as? Bool else { return }
            
            DispatchQueue.main.async {
                self?.onVoteCast?(voterId, hasVoted)
            }
        }
        
        socket.on("meeting:result") { [weak self] data, ack in
            guard let resultData = data.first as? [String: Any] else { return }
            // TODO: 解析 MeetingResult
        }
        
        socket.on("meeting:ended") { [weak self] data, ack in
            DispatchQueue.main.async {
                self?.gameStatus = .playing
                self?.onMeetingEnded?()
            }
        }
        
        socket.on("game:ended") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let winnerString = dict["winner"] as? String,
                  let reason = dict["reason"] as? String else { return }
            
            DispatchQueue.main.async {
                self?.gameStatus = .ended
                if let winner = Team(rawValue: winnerString) {
                    self?.onGameEnded?(winner, reason)
                }
            }
        }
        
        // 聊天事件
        socket.on("chat:message") { [weak self] data, ack in
            guard let messageData = data.first as? [String: Any] else { return }
            // TODO: 解析 ChatMessage
        }
        
        // 错误事件
        socket.on("error") { [weak self] data, ack in
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
        socket.disconnect()
    }
    
    // MARK: - Room Actions
    
    func createRoom(name: String, maxPlayers: Int = 10) {
        let data: [String: Any] = [
            "name": name,
            "maxPlayers": maxPlayers
        ]
        socket.emit("room:create", data)
    }
    
    func joinRoom(roomId: String, playerName: String) {
        let data: [String: Any] = [
            "roomId": roomId,
            "playerName": playerName
        ]
        socket.emit("room:join", data)
    }
    
    func leaveRoom() {
        socket.emit("room:leave")
        currentRoom = nil
        players = []
        myPlayerId = nil
    }
    
    func startGame() {
        socket.emit("game:start")
    }
    
    // MARK: - Game Actions
    
    func movePlayer(to position: Position) {
        let data: [String: Double] = [
            "x": position.x,
            "y": position.y
        ]
        socket.emit("player:move", data)
    }
    
    func killPlayer(targetId: String) {
        socket.emit("player:kill", targetId)
    }
    
    func completeTask(taskId: String) {
        socket.emit("player:complete-task", taskId)
    }
    
    func callMeeting() {
        socket.emit("player:call-meeting")
    }
    
    func reportBody(bodyId: String) {
        socket.emit("player:report-body", bodyId)
    }
    
    func castVote(targetId: String?) {
        socket.emit("meeting:vote", targetId ?? NSNull())
    }
    
    func sendMessage(content: String, type: String) {
        let data: [String: String] = [
            "content": content,
            "type": type
        ]
        socket.emit("chat:send", data)
    }
}
