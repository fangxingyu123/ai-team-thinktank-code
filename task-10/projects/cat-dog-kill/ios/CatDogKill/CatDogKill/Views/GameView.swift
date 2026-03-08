import SwiftUI

struct GameView: View {
    @EnvironmentObject var appState: AppState
    @State private var playerPosition = Position(x: 10, y: 10)
    @State private var otherPlayers: [String: Position] = [:]
    @State private var showingRoleCard = true
    @State private var showingTaskList = false
    @State private var showingChat = false
    @State private var killCooldown: Double = 0
    @State private var canReport = false
    @State private var nearbyDeadBody: String?
    
    // 摇杆状态
    @State private var joystickPosition: CGSize = .zero
    @State private var isDragging = false
    
    var body: some View {
        ZStack {
            // 游戏地图
            GameMapView(
                playerPosition: $playerPosition,
                otherPlayers: $otherPlayers,
                myRole: appState.gameState?.myRole
            )
            
            // UI 层
            VStack {
                // 顶部状态栏
                topBar
                
                Spacer()
                
                // 底部控制区
                bottomControls
            }
        }
        .sheet(isPresented: $showingRoleCard) {
            RoleRevealView(role: appState.gameState?.myRole ?? .cat)
        }
        .sheet(isPresented: $showingTaskList) {
            TaskListView()
        }
        .sheet(isPresented: $showingChat) {
            ChatView()
        }
        .onAppear {
            setupGameHandlers()
            startPositionUpdates()
        }
    }
    
    // MARK: - 顶部状态栏
    private var topBar: some View {
        HStack(spacing: 16) {
            // 角色标识
            HStack(spacing: 8) {
                Text(appState.gameState?.myRole?.emoji ?? "❓")
                    .font(.title2)
                
                VStack(alignment: .leading, spacing: 2) {
                    Text(appState.gameState?.myRole?.displayName ?? "未知")
                        .font(.caption)
                        .fontWeight(.semibold)
                    
                    if let role = appState.gameState?.myRole {
                        Text(role == .dog ? "坏人阵营" : (role == .fox ? "中立阵营" : "好人阵营"))
                            .font(.caption2)
                            .foregroundColor(role == .dog ? .red : (role == .fox ? .orange : .blue))
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(.systemBackground).opacity(0.9))
            .cornerRadius(20)
            
            Spacer()
            
            // 任务进度（仅猫咪）
            if appState.gameState?.myRole == .cat {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                    
                    Text("\(appState.gameState?.players.filter { $0.role == .cat }.reduce(0) { $0 + $1.completedTasks } ?? 0)/\(appState.gameState?.players.filter { $0.role == .cat }.reduce(0) { $0 + $1.totalTasks } ?? 0)")
                        .font(.caption)
                        .fontWeight(.semibold)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color(.systemBackground).opacity(0.9))
                .cornerRadius(20)
            }
            
            // 设置按钮
            Button(action: { showingChat = true }) {
                Image(systemName: "message.fill")
                    .font(.title3)
                    .foregroundColor(.primary)
                    .frame(width: 44, height: 44)
                    .background(Color(.systemBackground).opacity(0.9))
                    .clipShape(Circle())
            }
        }
        .padding(.horizontal)
        .padding(.top, 8)
    }
    
    // MARK: - 底部控制区
    private var bottomControls: some View {
        HStack(spacing: 20) {
            // 左侧：摇杆
            JoystickView(position: $joystickPosition, isDragging: $isDragging)
                .frame(width: 120, height: 120)
                .onChange(of: joystickPosition) { _ in
                    updatePlayerMovement()
                }
            
            Spacer()
            
            // 右侧：操作按钮
            VStack(spacing: 12) {
                // 使用按钮
                Button(action: interact) {
                    Image(systemName: "hand.tap.fill")
                        .font(.title2)
                        .foregroundColor(.white)
                        .frame(width: 60, height: 60)
                        .background(Color.blue)
                        .clipShape(Circle())
                }
                
                // 任务列表按钮（仅猫咪）
                if appState.gameState?.myRole == .cat {
                    Button(action: { showingTaskList = true }) {
                        Image(systemName: "list.bullet.clipboard.fill")
                            .font(.title2)
                            .foregroundColor(.white)
                            .frame(width: 60, height: 60)
                            .background(Color.green)
                            .clipShape(Circle())
                    }
                }
                
                // 击杀按钮（仅狗狗）
                if appState.gameState?.myRole == .dog {
                    Button(action: killNearbyPlayer) {
                        ZStack {
                            Circle()
                                .fill(killCooldown > 0 ? Color.gray : Color.red)
                                .frame(width: 70, height: 70)
                            
                            if killCooldown > 0 {
                                Text("\(Int(killCooldown))")
                                    .font(.title3)
                                    .fontWeight(.bold)
                                    .foregroundColor(.white)
                            } else {
                                Image(systemName: "xmark")
                                    .font(.title2)
                                    .foregroundColor(.white)
                            }
                        }
                    }
                    .disabled(killCooldown > 0)
                }
                
                // 报告按钮
                if canReport {
                    Button(action: reportBody) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.title2)
                            .foregroundColor(.white)
                            .frame(width: 60, height: 60)
                            .background(Color.orange)
                            .clipShape(Circle())
                            .overlay(
                                Circle()
                                    .stroke(Color.white, lineWidth: 2)
                            )
                    }
                }
                
                // 紧急会议按钮
                Button(action: callEmergencyMeeting) {
                    Image(systemName: "megaphone.fill")
                        .font(.title2)
                        .foregroundColor(.white)
                        .frame(width: 60, height: 60)
                        .background(Color.purple)
                        .clipShape(Circle())
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 30)
    }
    
    // MARK: - 游戏逻辑
    private func setupGameHandlers() {
        SocketService.shared.onPlayerMoved = { playerId, position in
            DispatchQueue.main.async {
                otherPlayers[playerId] = position
            }
        }
        
        SocketService.shared.onPlayerKilled = { victimId, killerId in
            DispatchQueue.main.async {
                // 检查是否是附近的尸体
                checkNearbyBodies()
            }
        }
    }
    
    private func startPositionUpdates() {
        // 每 50ms 发送一次位置更新
        Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
            if isDragging {
                SocketService.shared.movePlayer(to: playerPosition)
            }
        }
        
        // 击杀冷却倒计时
        Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            if killCooldown > 0 {
                killCooldown -= 1
            }
        }
        
        // 检查附近尸体
        Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in
            checkNearbyBodies()
        }
    }
    
    private func updatePlayerMovement() {
        guard isDragging else { return }
        
        let maxDistance: CGFloat = 40
        let speed: CGFloat = 0.1
        
        let dx = joystickPosition.width / maxDistance
        let dy = joystickPosition.height / maxDistance
        
        playerPosition.x += Double(dx * speed)
        playerPosition.y += Double(dy * speed)
        
        // 边界检查
        playerPosition.x = max(0, min(20, playerPosition.x))
        playerPosition.y = max(0, min(15, playerPosition.y))
    }
    
    private func interact() {
        // 与附近的任务/物体交互
    }
    
    private func killNearbyPlayer() {
        guard killCooldown <= 0 else { return }
        
        // 找到最近的存活猫咪
        let myId = SocketService.shared.myPlayerId
        let nearbyCats = appState.gameState?.players.filter { player in
            guard player.id != myId,
                  player.role == .cat,
                  player.isAlive else { return false }
            
            let distance = sqrt(pow(player.position.x - playerPosition.x, 2) +
                               pow(player.position.y - playerPosition.y, 2))
            return distance < 2 // 击杀距离
        }
        
        if let target = nearbyCats?.first {
            SocketService.shared.killPlayer(targetId: target.id)
            killCooldown = 30 // 30秒冷却
        }
    }
    
    private func reportBody() {
        if let bodyId = nearbyDeadBody {
            SocketService.shared.reportBody(bodyId: bodyId)
        }
    }
    
    private func callEmergencyMeeting() {
        SocketService.shared.callMeeting()
    }
    
    private func checkNearbyBodies() {
        // 检查附近是否有尸体
        let deadPlayers = appState.gameState?.players.filter { !$0.isAlive }
        nearbyDeadBody = deadPlayers?.first { player in
            let distance = sqrt(pow(player.position.x - playerPosition.x, 2) +
                               pow(player.position.y - playerPosition.y, 2))
            return distance < 1.5
        }?.id
        
        canReport = nearbyDeadBody != nil
    }
}

// MARK: - 游戏地图视图
struct GameMapView: View {
    @Binding var playerPosition: Position
    @Binding var otherPlayers: [String: Position]
    var myRole: Role?
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // 地图背景
                Color(.systemGray6)
                    .ignoresSafeArea()
                
                // 网格
                GridView()
                
                // 任务点
                TaskPointsView()
                
                // 其他玩家
                ForEach(Array(otherPlayers.keys), id: \.self) { playerId in
                    if let position = otherPlayers[playerId] {
                        OtherPlayerView(playerId: playerId, position: position)
                    }
                }
                
                // 自己
                PlayerAvatar(role: myRole ?? .cat, isLocal: true)
                    .position(
                        x: CGFloat(playerPosition.x) * (geometry.size.width / 20),
                        y: CGFloat(playerPosition.y) * (geometry.size.height / 15)
                    )
            }
        }
    }
}

// MARK: - 网格视图
struct GridView: View {
    var body: some View {
        GeometryReader { geometry in
            let cellWidth = geometry.size.width / 20
            let cellHeight = geometry.size.height / 15
            
            ZStack {
                // 垂直线
                ForEach(0..<21) { i in
                    Path { path in
                        let x = CGFloat(i) * cellWidth
                        path.move(to: CGPoint(x: x, y: 0))
                        path.addLine(to: CGPoint(x: x, y: geometry.size.height))
                    }
                    .stroke(Color.gray.opacity(0.2), lineWidth: 0.5)
                }
                
                // 水平线
                ForEach(0..<16) { i in
                    Path { path in
                        let y = CGFloat(i) * cellHeight
                        path.move(to: CGPoint(x: 0, y: y))
                        path.addLine(to: CGPoint(x: geometry.size.width, y: y))
                    }
                    .stroke(Color.gray.opacity(0.2), lineWidth: 0.5)
                }
            }
        }
    }
}

// MARK: - 任务点视图
struct TaskPointsView: View {
    var body: some View {
        GeometryReader { geometry in
            let cellWidth = geometry.size.width / 20
            let cellHeight = geometry.size.height / 15
            
            // 示例任务点
            ForEach(0..<5) { i in
                Circle()
                    .fill(Color.yellow.opacity(0.6))
                    .frame(width: 20, height: 20)
                    .position(
                        x: CGFloat(3 + i * 4) * cellWidth,
                        y: CGFloat(2 + i * 2) * cellHeight
                    )
                    .overlay(
                        Image(systemName: "exclamationmark.circle.fill")
                            .foregroundColor(.orange)
                            .font(.caption)
                    )
            }
        }
    }
}

// MARK: - 其他玩家视图
struct OtherPlayerView: View {
    let playerId: String
    let position: Position
    
    var body: some View {
        GeometryReader { geometry in
            let cellWidth = geometry.size.width / 20
            let cellHeight = geometry.size.height / 15
            
            PlayerAvatar(role: .cat, isLocal: false)
                .position(
                    x: CGFloat(position.x) * cellWidth,
                    y: CGFloat(position.y) * cellHeight
                )
        }
    }
}

// MARK: - 玩家头像
struct PlayerAvatar: View {
    let role: Role
    let isLocal: Bool
    
    var body: some View {
        ZStack {
            Circle()
                .fill(isLocal ? Color.blue.opacity(0.3) : Color.clear)
                .frame(width: 40, height: 40)
            
            Text(role.emoji)
                .font(.system(size: 30))
        }
    }
}

// MARK: - 摇杆视图
struct JoystickView: View {
    @Binding var position: CGSize
    @Binding var isDragging: Bool
    
    var body: some View {
        GeometryReader { geometry in
            let size = min(geometry.size.width, geometry.size.height)
            let maxDistance = size / 3
            
            ZStack {
                // 底座
                Circle()
                    .fill(Color.black.opacity(0.2))
                    .frame(width: size, height: size)
                
                // 摇杆
                Circle()
                    .fill(Color.white)
                    .frame(width: size / 2, height: size / 2)
                    .offset(position)
                    .shadow(radius: 4)
            }
            .gesture(
                DragGesture()
                    .onChanged { value in
                        isDragging = true
                        let translation = value.translation
                        let distance = sqrt(translation.width * translation.width +
                                          translation.height * translation.height)
                        
                        if distance <= maxDistance {
                            position = CGSize(width: translation.width,
                                            height: translation.height)
                        } else {
                            let ratio = maxDistance / distance
                            position = CGSize(width: translation.width * ratio,
                                            height: translation.height * ratio)
                        }
                    }
                    .onEnded { _ in
                        isDragging = false
                        withAnimation(.spring()) {
                            position = .zero
                        }
                    }
            )
        }
    }
}
