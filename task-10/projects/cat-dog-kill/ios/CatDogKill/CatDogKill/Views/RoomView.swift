import SwiftUI

struct RoomView: View {
    @EnvironmentObject var appState: AppState
    @State private var players: [Player] = []
    @State private var isHost = false
    @State private var showingRoleInfo = false
    @State private var countdown = 0
    
    var body: some View {
        VStack(spacing: 0) {
            // 房间信息头部
            roomHeader
            
            Divider()
            
            // 玩家列表
            playerList
            
            Divider()
            
            // 底部操作区
            bottomActions
        }
        .navigationTitle("房间")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showingRoleInfo) {
            RoleInfoView()
        }
        .onAppear {
            setupSocketHandlers()
        }
    }
    
    // MARK: - 房间头部
    private var roomHeader: some View {
        VStack(spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("房间代码")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    HStack {
                        Text(appState.currentRoom?.id ?? "------")
                            .font(.title2)
                            .fontWeight(.bold)
                            .fontDesign(.monospaced)
                        
                        Button(action: copyRoomCode) {
                            Image(systemName: "doc.on.doc")
                                .foregroundColor(.blue)
                        }
                    }
                }
                
                Spacer()
                
                VStack(alignment: .trailing, spacing: 4) {
                    Text("人数")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    Text("\(players.count)/\(appState.currentRoom?.maxPlayers ?? 10)")
                        .font(.title3)
                        .fontWeight(.semibold)
                }
            }
            
            if countdown > 0 {
                Text("游戏即将开始... \(countdown)")
                    .font(.headline)
                    .foregroundColor(.orange)
                    .padding(.vertical, 8)
                    .padding(.horizontal, 16)
                    .background(Color.orange.opacity(0.1))
                    .cornerRadius(8)
            }
        }
        .padding()
        .background(Color(.systemBackground))
    }
    
    // MARK: - 玩家列表
    private var playerList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(players) { player in
                    PlayerRow(player: player, isHost: player.id == appState.currentRoom?.hostId)
                }
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
    }
    
    // MARK: - 底部操作
    private var bottomActions: some View {
        VStack(spacing: 16) {
            if isHost {
                Button(action: startGame) {
                    Text("开始游戏")
                        .font(.headline)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(canStartGame ? Color.green : Color.gray)
                        .cornerRadius(12)
                }
                .disabled(!canStartGame)
            } else {
                Text("等待房主开始游戏...")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            
            Button(action: leaveRoom) {
                Text("离开房间")
                    .font(.subheadline)
                    .foregroundColor(.red)
            }
        }
        .padding()
        .background(Color(.systemBackground))
    }
    
    // MARK: - 计算属性
    private var canStartGame: Bool {
        players.count >= 4 && isHost
    }
    
    // MARK: - 方法
    private func setupSocketHandlers() {
        // 更新玩家列表
        SocketService.shared.onRoomJoined = { room, player, allPlayers in
            DispatchQueue.main.async {
                appState.currentRoom = room
                players = allPlayers
                isHost = player.id == room.hostId
            }
        }
        
        SocketService.shared.onPlayerJoined = { player in
            DispatchQueue.main.async {
                if !players.contains(where: { $0.id == player.id }) {
                    players.append(player)
                }
            }
        }
        
        SocketService.shared.onPlayerLeft = { playerId in
            DispatchQueue.main.async {
                players.removeAll { $0.id == playerId }
            }
        }
        
        SocketService.shared.onGameStarting = { count in
            DispatchQueue.main.async {
                countdown = count
            }
        }
        
        SocketService.shared.onGameStarted = { role, team, gamePlayers in
            DispatchQueue.main.async {
                appState.gameState = GameState(
                    status: .playing,
                    myRole: role,
                    myTeam: team,
                    players: gamePlayers
                )
                appState.currentScreen = .game
            }
        }
    }
    
    private func copyRoomCode() {
        UIPasteboard.general.string = appState.currentRoom?.id
        // 可以添加提示
    }
    
    private func startGame() {
        SocketService.shared.startGame()
    }
    
    private func leaveRoom() {
        SocketService.shared.leaveRoom()
        appState.currentRoom = nil
        appState.currentScreen = .lobby
    }
}

// MARK: - 玩家行
struct PlayerRow: View {
    let player: Player
    let isHost: Bool
    
    var body: some View {
        HStack(spacing: 12) {
            // 头像
            Text(player.avatar)
                .font(.system(size: 40))
                .frame(width: 50, height: 50)
                .background(Color(.systemGray5))
                .clipShape(Circle())
            
            // 信息
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(player.name)
                        .font(.headline)
                    
                    if isHost {
                        Text("房主")
                            .font(.caption)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                            .background(Color.blue)
                            .foregroundColor(.white)
                            .cornerRadius(4)
                    }
                }
                
                HStack(spacing: 4) {
                    Circle()
                        .fill(player.isConnected ? Color.green : Color.red)
                        .frame(width: 6, height: 6)
                    
                    Text(player.isConnected ? "在线" : "离线")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            
            Spacer()
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
    }
}

// MARK: - 角色信息视图
struct RoleInfoView: View {
    @Environment(\.presentationMode) var presentationMode
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    // 猫咪
                    RoleCard(
                        emoji: "🐱",
                        name: "猫咪",
                        description: "好人阵营",
                        details: "完成任务或找出所有狗狗来获胜！",
                        color: .blue
                    )
                    
                    // 狗狗
                    RoleCard(
                        emoji: "🐶",
                        name: "狗狗",
                        description: "坏人阵营",
                        details: "悄悄淘汰猫咪，制造混乱来获胜！可以使用通风管道快速移动。",
                        color: .red
                    )
                    
                    // 狐狸
                    RoleCard(
                        emoji: "🦊",
                        name: "狐狸",
                        description: "中立阵营",
                        details: "保持低调，存活到最后来获胜！",
                        color: .orange
                    )
                }
                .padding()
            }
            .navigationTitle("角色说明")
            .navigationBarItems(trailing: Button("完成") {
                presentationMode.wrappedValue.dismiss()
            })
        }
    }
}

struct RoleCard: View {
    let emoji: String
    let name: String
    let description: String
    let details: String
    let color: Color
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 16) {
                Text(emoji)
                    .font(.system(size: 50))
                
                VStack(alignment: .leading, spacing: 4) {
                    Text(name)
                        .font(.title2)
                        .fontWeight(.bold)
                    
                    Text(description)
                        .font(.subheadline)
                        .foregroundColor(color)
                        .fontWeight(.semibold)
                }
                
                Spacer()
            }
            
            Text(details)
                .font(.body)
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding()
        .background(color.opacity(0.1))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(color.opacity(0.3), lineWidth: 1)
        )
    }
}
