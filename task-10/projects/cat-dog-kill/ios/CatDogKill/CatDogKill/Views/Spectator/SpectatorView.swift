import SwiftUI

/// 观战模式主视图
struct SpectatorView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var cameraController = SpectatorCameraController()
    @StateObject private var playerSelector = SpectatorPlayerSelector()
    @StateObject private var viewModel = SpectatorViewModel()
    
    @State private var showingPlayerList = false
    @State private var showingChat = false
    @State private var showingExitConfirmation = false
    @State private var chatInput = ""
    @State private var isMinimapExpanded = false
    
    var body: some View {
        ZStack {
            // 游戏地图层
            gameMapLayer
            
            // UI层
            VStack(spacing: 0) {
                // 顶部信息栏
                topBar
                
                Spacer()
                
                // 底部控制栏
                bottomBar
            }
            
            // 聊天面板
            if showingChat {
                chatPanel
            }
            
            // 玩家列表面板
            if showingPlayerList {
                playerListPanel
            }
            
            // 退出确认弹窗
            if showingExitConfirmation {
                exitConfirmationDialog
            }
            
            // 延迟提示
            delayIndicator
        }
        .onAppear {
            setupViewModel()
        }
        .onDisappear {
            viewModel.cleanup()
        }
    }
    
    // MARK: - 游戏地图层
    private var gameMapLayer: some View {
        GeometryReader { geometry in
            ZStack {
                // 地图背景
                GameMapView(
                    cameraPosition: cameraController.position,
                    zoom: cameraController.zoom,
                    viewSize: geometry.size
                )
                
                // 玩家层
                if let gameState = viewModel.gameState {
                    ForEach(gameState.players) { player in
                        SpectatorPlayerMarker(
                            player: player,
                            isFollowing: viewModel.followingPlayerId == player.id,
                            cameraPosition: cameraController.position,
                            zoom: cameraController.zoom,
                            viewSize: geometry.size
                        )
                    }
                }
            }
            .gesture(
                DragGesture()
                    .onChanged { value in
                        if viewModel.viewMode == .freeCamera {
                            cameraController.moveCamera(
                                deltaX: -value.translation.width,
                                deltaY: -value.translation.height
                            )
                        }
                    }
            )
            .simultaneousGesture(
                MagnificationGesture()
                    .onChanged { scale in
                        cameraController.zoom = min(2.0, max(0.5, scale))
                    }
            )
        }
    }
    
    // MARK: - 顶部信息栏
    private var topBar: some View {
        HStack(spacing: 12) {
            // 观战标识
            HStack(spacing: 6) {
                Image(systemName: "eye.fill")
                    .foregroundColor(.purple)
                Text("观战模式")
                    .font(.subheadline)
                    .fontWeight(.semibold)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Color.purple.opacity(0.2))
            .cornerRadius(8)
            
            // 房间信息
            VStack(alignment: .leading, spacing: 2) {
                Text("房间: \(viewModel.roomId)")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                HStack(spacing: 4) {
                    Image(systemName: "person.2.fill")
                        .font(.caption2)
                    Text("\(viewModel.spectatorCount)/\(viewModel.maxSpectators)")
                        .font(.caption)
                }
                .foregroundColor(.secondary)
            }
            
            Spacer()
            
            // 视角模式
            Picker("视角", selection: $viewModel.viewMode) {
                ForEach(SpectatorViewMode.allCases, id: \.self) { mode in
                    Label(mode.displayName, systemImage: mode.icon)
                        .tag(mode)
                }
            }
            .pickerStyle(.menu)
            .frame(width: 120)
            
            // 退出按钮
            Button(action: { showingExitConfirmation = true }) {
                Image(systemName: "xmark.circle.fill")
                    .font(.title2)
                    .foregroundColor(.red)
            }
        }
        .padding()
        .background(.ultraThinMaterial)
    }
    
    // MARK: - 底部控制栏
    private var bottomBar: some View {
        HStack(spacing: 16) {
            // 玩家列表按钮
            Button(action: { showingPlayerList.toggle() }) {
                VStack(spacing: 4) {
                    Image(systemName: "person.3.fill")
                        .font(.title3)
                    Text("玩家")
                        .font(.caption)
                }
                .foregroundColor(showingPlayerList ? .blue : .primary)
            }
            
            Spacer()
            
            // 视角控制
            if viewModel.viewMode == .followPlayer {
                // 切换玩家按钮
                Button(action: { viewModel.switchToNextPlayer() }) {
                    VStack(spacing: 4) {
                        Image(systemName: "arrow.right.circle.fill")
                            .font(.title3)
                        Text("切换")
                            .font(.caption)
                    }
                }
            } else if viewModel.viewMode == .freeCamera {
                // 重置视角按钮
                Button(action: { cameraController.reset() }) {
                    VStack(spacing: 4) {
                        Image(systemName: "arrow.counterclockwise.circle.fill")
                            .font(.title3)
                        Text("重置")
                            .font(.caption)
                    }
                }
            }
            
            Spacer()
            
            // 聊天按钮
            Button(action: { showingChat.toggle() }) {
                VStack(spacing: 4) {
                    Image(systemName: "bubble.left.fill")
                        .font(.title3)
                    Text("聊天")
                        .font(.caption)
                }
                .foregroundColor(showingChat ? .blue : .primary)
            }
        }
        .padding()
        .background(.ultraThinMaterial)
    }
    
    // MARK: - 聊天面板
    private var chatPanel: some View {
        VStack(spacing: 0) {
            // 聊天头部
            HStack {
                Text("观战聊天")
                    .font(.headline)
                
                Spacer()
                
                Button(action: { showingChat = false }) {
                    Image(systemName: "xmark")
                }
            }
            .padding()
            .background(Color(.systemGray6))
            
            // 消息列表
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 8) {
                    ForEach(viewModel.chatMessages) { message in
                        SpectatorChatBubble(message: message)
                    }
                }
                .padding()
            }
            .frame(maxHeight: 250)
            
            // 输入框
            HStack(spacing: 8) {
                TextField("发送消息...", text: $chatInput)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                
                Button(action: sendChatMessage) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                }
                .disabled(chatInput.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding()
            .background(Color(.systemGray6))
        }
        .frame(width: 300)
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(radius: 10)
        .position(x: UIScreen.main.bounds.width - 160, y: UIScreen.main.bounds.height / 2)
    }
    
    // MARK: - 玩家列表面板
    private var playerListPanel: some View {
        VStack(spacing: 0) {
            // 头部
            HStack {
                Text("玩家列表")
                    .font(.headline)
                
                Spacer()
                
                Button(action: { showingPlayerList = false }) {
                    Image(systemName: "xmark")
                }
            }
            .padding()
            .background(Color(.systemGray6))
            
            // 玩家列表
            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(viewModel.gameState?.players ?? []) { player in
                        SpectatorPlayerRow(
                            player: player,
                            isFollowing: viewModel.followingPlayerId == player.id,
                            onTap: {
                                viewModel.followPlayer(player.id)
                                showingPlayerList = false
                            }
                        )
                    }
                }
                .padding()
            }
        }
        .frame(width: 280)
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(radius: 10)
        .position(x: 150, y: UIScreen.main.bounds.height / 2)
    }
    
    // MARK: - 退出确认弹窗
    private var exitConfirmationDialog: some View {
        ZStack {
            Color.black.opacity(0.5)
                .ignoresSafeArea()
                .onTapGesture { showingExitConfirmation = false }
            
            VStack(spacing: 20) {
                Text("退出观战")
                    .font(.title2)
                    .fontWeight(.bold)
                
                Text("确定要退出观战模式吗？")
                    .font(.body)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                
                HStack(spacing: 16) {
                    Button(action: { showingExitConfirmation = false }) {
                        Text("取消")
                            .font(.headline)
                            .foregroundColor(.primary)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color(.systemGray5))
                            .cornerRadius(10)
                    }
                    
                    Button(action: exitSpectating) {
                        Text("退出")
                            .font(.headline)
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.red)
                            .cornerRadius(10)
                    }
                }
            }
            .padding(24)
            .background(Color(.systemBackground))
            .cornerRadius(16)
            .shadow(radius: 20)
            .padding(40)
        }
    }
    
    // MARK: - 延迟提示
    private var delayIndicator: some View {
        VStack {
            Spacer()
            
            HStack(spacing: 6) {
                Image(systemName: "clock.fill")
                    .font(.caption)
                Text("延迟 \(viewModel.delaySeconds)s")
                    .font(.caption)
            }
            .foregroundColor(.secondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(.ultraThinMaterial)
            .cornerRadius(8)
            .padding(.bottom, 100)
        }
    }
    
    // MARK: - 方法
    
    private func setupViewModel() {
        viewModel.setup(
            cameraController: cameraController,
            playerSelector: playerSelector
        )
    }
    
    private func sendChatMessage() {
        viewModel.sendChatMessage(chatInput)
        chatInput = ""
    }
    
    private func exitSpectating() {
        viewModel.exitSpectating()
        appState.currentScreen = .lobby
    }
}

// MARK: - 观战视图模型

@MainActor
class SpectatorViewModel: ObservableObject {
    @Published var gameState: SpectatorGameState?
    @Published var viewMode: SpectatorViewMode = .followPlayer
    @Published var followingPlayerId: String?
    @Published var chatMessages: [SpectatorChatMessage] = []
    @Published var spectatorCount: Int = 0
    @Published var maxSpectators: Int = 10
    @Published var delaySeconds: Int = 5
    @Published var roomId: String = ""
    
    private var cameraController: SpectatorCameraController?
    private var playerSelector: SpectatorPlayerSelector?
    private var cancellables = Set<AnyCancellable>()
    
    func setup(
        cameraController: SpectatorCameraController,
        playerSelector: SpectatorPlayerSelector
    ) {
        self.cameraController = cameraController
        self.playerSelector = playerSelector
        
        // 绑定服务数据
        let service = SpectatorSocketService.shared
        
        service.$gameState
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                self?.gameState = state
            }
            .store(in: &cancellables)
        
        service.$viewMode
            .receive(on: DispatchQueue.main)
            .sink { [weak self] mode in
                self?.viewMode = mode
            }
            .store(in: &cancellables)
        
        service.$followingPlayerId
            .receive(on: DispatchQueue.main)
            .sink { [weak self] id in
                self?.followingPlayerId = id
            }
            .store(in: &cancellables)
        
        service.$chatMessages
            .receive(on: DispatchQueue.main)
            .sink { [weak self] messages in
                self?.chatMessages = messages
            }
            .store(in: &cancellables)
        
        service.$spectatorCount
            .receive(on: DispatchQueue.main)
            .sink { [weak self] count in
                self?.spectatorCount = count
            }
            .store(in: &cancellables)
        
        service.$maxSpectators
            .receive(on: DispatchQueue.main)
            .sink { [weak self] max in
                self?.maxSpectators = max
            }
            .store(in: &cancellables)
        
        service.$delaySeconds
            .receive(on: DispatchQueue.main)
            .sink { [weak self] delay in
                self?.delaySeconds = delay
            }
            .store(in: &cancellables)
        
        service.$currentRoomId
            .receive(on: DispatchQueue.main)
            .sink { [weak self] id in
                self?.roomId = id ?? ""
            }
            .store(in: &cancellables)
        
        // 开始相机更新循环
        startCameraUpdateLoop()
    }
    
    func cleanup() {
        cancellables.removeAll()
    }
    
    func followPlayer(_ playerId: String) {
        SpectatorSocketService.shared.followPlayer(playerId)
    }
    
    func switchToNextPlayer() {
        guard let players = gameState?.players else { return }
        let alivePlayers = players.filter { $0.isAlive }
        guard !alivePlayers.isEmpty else { return }
        
        let currentIndex = alivePlayers.firstIndex { $0.id == followingPlayerId } ?? -1
        let nextIndex = (currentIndex + 1) % alivePlayers.count
        let nextPlayer = alivePlayers[nextIndex]
        
        followPlayer(nextPlayer.id)
    }
    
    func sendChatMessage(_ content: String) {
        SpectatorSocketService.shared.sendChatMessage(content)
    }
    
    func exitSpectating() {
        SpectatorSocketService.shared.leaveSpectating()
    }
    
    private func startCameraUpdateLoop() {
        Timer.publish(every: 1.0 / 60.0, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                self?.updateCamera()
            }
            .store(in: &cancellables)
    }
    
    private func updateCamera() {
        guard viewMode == .followPlayer,
              let playerId = followingPlayerId,
              let player = gameState?.players.first(where: { $0.id == playerId }) else {
            return
        }
        
        cameraController?.update(targetPosition: player.position)
    }
}

// MARK: - 预览

struct SpectatorView_Previews: PreviewProvider {
    static var previews: some View {
        SpectatorView()
            .environmentObject(AppState())
    }
}
