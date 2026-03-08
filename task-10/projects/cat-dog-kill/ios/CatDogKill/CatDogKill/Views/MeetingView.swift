import SwiftUI

struct MeetingView: View {
    @EnvironmentObject var appState: AppState
    @State private var timeRemaining = 120
    @State private var hasVoted = false
    @State private var selectedPlayerId: String?
    @State private var voteResults: [String: Int] = [:]
    @State private var showingResult = false
    @State private var ejectedPlayer: Player?
    @State private var wasImpostor = false
    
    let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    
    var body: some View {
        VStack(spacing: 0) {
            // 顶部信息栏
            meetingHeader
            
            Divider()
            
            // 主要内容区
            if showingResult {
                voteResultView
            } else {
                meetingContent
            }
        }
        .onAppear {
            setupMeetingHandlers()
        }
        .onReceive(timer) { _ in
            if timeRemaining > 0 && !showingResult {
                timeRemaining -= 1
            }
        }
    }
    
    // MARK: - 会议头部
    private var meetingHeader: some View {
        VStack(spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("紧急会议")
                        .font(.headline)
                    
                    if let callerName = appState.gameState?.currentMeeting?.callerId {
                        Text("由 \(callerName) 发起")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                
                Spacer()
                
                // 倒计时
                HStack(spacing: 4) {
                    Image(systemName: "clock")
                        .foregroundColor(timeRemaining < 30 ? .red : .primary)
                    
                    Text(formatTime(timeRemaining))
                        .font(.title3)
                        .fontWeight(.bold)
                        .foregroundColor(timeRemaining < 30 ? .red : .primary)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color(.systemGray6))
                .cornerRadius(8)
            }
            
            // 进度条
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Rectangle()
                        .fill(Color.gray.opacity(0.3))
                        .frame(height: 4)
                    
                    Rectangle()
                        .fill(timeRemaining < 30 ? Color.red : Color.blue)
                        .frame(width: geometry.size.width * CGFloat(timeRemaining) / 120, height: 4)
                }
            }
            .frame(height: 4)
        }
        .padding()
        .background(Color(.systemBackground))
    }
    
    // MARK: - 会议内容
    private var meetingContent: some View {
        VStack(spacing: 0) {
            // 聊天区域
            chatArea
            
            Divider()
            
            // 投票区域
            votingArea
        }
    }
    
    // MARK: - 聊天区域
    private var chatArea: some View {
        ScrollView {
            LazyVStack(spacing: 8) {
                ForEach(appState.gameState?.messages ?? []) { message in
                    ChatBubble(message: message, isMe: message.senderId == SocketService.shared.myPlayerId)
                }
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
    }
    
    // MARK: - 投票区域
    private var votingArea: some View {
        VStack(spacing: 12) {
            Text(hasVoted ? "等待其他玩家投票..." : "选择要淘汰的玩家")
                .font(.headline)
                .foregroundColor(hasVoted ? .secondary : .primary)
            
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 16) {
                    // 跳过投票
                    VoteCard(
                        player: nil,
                        isSelected: selectedPlayerId == nil && hasVoted,
                        hasVoted: hasVoted,
                        action: { castVote(targetId: nil) }
                    )
                    
                    // 玩家投票卡
                    ForEach(appState.gameState?.players.filter { $0.isAlive } ?? []) { player in
                        VoteCard(
                            player: player,
                            isSelected: selectedPlayerId == player.id,
                            hasVoted: hasVoted,
                            action: { castVote(targetId: player.id) }
                        )
                    }
                }
                .padding(.horizontal)
            }
            .frame(height: 140)
            .disabled(hasVoted)
            .opacity(hasVoted ? 0.6 : 1)
        }
        .padding()
        .background(Color(.systemBackground))
    }
    
    // MARK: - 投票结果视图
    private var voteResultView: some View {
        VStack(spacing: 24) {
            Spacer()
            
            if let player = ejectedPlayer {
                // 有玩家被驱逐
                VStack(spacing: 16) {
                    Text(player.name)
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    
                    Text("被驱逐")
                        .font(.title2)
                        .foregroundColor(.red)
                    
                    Text(player.avatar)
                        .font(.system(size: 100))
                    
                    if wasImpostor {
                        HStack {
                            Image(systemName: "checkmark.shield.fill")
                                .foregroundColor(.green)
                            Text("是 \(player.role?.displayName ?? "卧底")！")
                                .font(.headline)
                                .foregroundColor(.green)
                        }
                    } else {
                        HStack {
                            Image(systemName: "xmark.shield.fill")
                                .foregroundColor(.red)
                            Text("不是卧底...")
                                .font(.headline)
                                .foregroundColor(.red)
                        }
                    }
                }
            } else {
                // 平票，无人被驱逐
                VStack(spacing: 16) {
                    Image(systemName: "person.3.fill")
                        .font(.system(size: 80))
                        .foregroundColor(.orange)
                    
                    Text("平票")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    
                    Text("无人被驱逐")
                        .font(.title2)
                        .foregroundColor(.secondary)
                }
            }
            
            Spacer()
            
            // 投票统计
            VStack(alignment: .leading, spacing: 8) {
                Text("投票结果")
                    .font(.headline)
                    .padding(.bottom, 4)
                
                ForEach(Array(voteResults.keys.sorted()), id: \.self) { playerId in
                    HStack {
                        if let player = appState.gameState?.players.first(where: { $0.id == playerId }) {
                            Text(player.name)
                                .font(.subheadline)
                        } else if playerId == "skip" {
                            Text("跳过")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                        
                        Spacer()
                        
                        Text("\(voteResults[playerId] ?? 0) 票")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                    }
                }
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
            .padding(.horizontal)
            
            Spacer()
        }
        .padding()
    }
    
    // MARK: - 方法
    private func setupMeetingHandlers() {
        SocketService.shared.onVoteCast = { voterId, hasVoted in
            // 更新投票状态
        }
        
        SocketService.shared.onMeetingResult = { result in
            DispatchQueue.main.async {
                voteResults = result.voteCount
                wasImpostor = result.wasImpostor
                
                if let ejectedId = result.ejectedId {
                    ejectedPlayer = appState.gameState?.players.first { $0.id == ejectedId }
                }
                
                showingResult = true
                
                // 3秒后返回游戏
                DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                    appState.currentScreen = .game
                }
            }
        }
    }
    
    private func castVote(targetId: String?) {
        guard !hasVoted else { return }
        
        selectedPlayerId = targetId
        hasVoted = true
        
        SocketService.shared.castVote(targetId: targetId)
    }
    
    private func formatTime(_ seconds: Int) -> String {
        let minutes = seconds / 60
        let remainingSeconds = seconds % 60
        return String(format: "%d:%02d", minutes, remainingSeconds)
    }
}

// MARK: - 聊天气泡
struct ChatBubble: View {
    let message: ChatMessage
    let isMe: Bool
    
    var body: some View {
        HStack {
            if isMe {
                Spacer()
            }
            
            VStack(alignment: isMe ? .trailing : .leading, spacing: 4) {
                if !isMe {
                    Text(message.senderName)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                
                Text(message.content)
                    .font(.body)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(isMe ? Color.blue : Color(.systemGray5))
                    .foregroundColor(isMe ? .white : .primary)
                    .cornerRadius(16)
            }
            
            if !isMe {
                Spacer()
            }
        }
    }
}

// MARK: - 投票卡片
struct VoteCard: View {
    let player: Player?
    let isSelected: Bool
    let hasVoted: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                if let player = player {
                    // 玩家卡片
                    Text(player.avatar)
                        .font(.system(size: 40))
                    
                    Text(player.name)
                        .font(.caption)
                        .fontWeight(.semibold)
                        .lineLimit(1)
                } else {
                    // 跳过卡片
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 40))
                        .foregroundColor(.gray)
                    
                    Text("跳过")
                        .font(.caption)
                        .fontWeight(.semibold)
                }
            }
            .frame(width: 80, height: 110)
            .background(isSelected ? Color.blue.opacity(0.2) : Color(.systemBackground))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? Color.blue : Color.gray.opacity(0.3), lineWidth: isSelected ? 2 : 1)
            )
            .cornerRadius(12)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - 角色揭示视图
struct RoleRevealView: View {
    let role: Role
    @Environment(\.presentationMode) var presentationMode
    @State private var showDetails = false
    
    var body: some View {
        ZStack {
            // 背景色根据阵营
            backgroundColor
                .ignoresSafeArea()
            
            VStack(spacing: 30) {
                Spacer()
                
                // 角色表情
                Text(role.emoji)
                    .font(.system(size: 150))
                    .scaleEffect(showDetails ? 1 : 0.5)
                    .opacity(showDetails ? 1 : 0)
                
                // 角色名称
                Text("你是 \(role.displayName)")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                    .opacity(showDetails ? 1 : 0)
                
                // 阵营
                Text(role == .dog ? "坏人阵营" : (role == .fox ? "中立阵营" : "好人阵营"))
                    .font(.title2)
                    .foregroundColor(.white.opacity(0.8))
                    .opacity(showDetails ? 1 : 0)
                
                // 说明
                Text(role.description)
                    .font(.body)
                    .multilineTextAlignment(.center)
                    .foregroundColor(.white.opacity(0.9))
                    .padding(.horizontal, 40)
                    .opacity(showDetails ? 1 : 0)
                
                Spacer()
                
                // 确认按钮
                Button(action: {
                    presentationMode.wrappedValue.dismiss()
                }) {
                    Text("我知道了")
                        .font(.headline)
                        .foregroundColor(backgroundColor)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.white)
                        .cornerRadius(12)
                }
                .padding(.horizontal, 40)
                .padding(.bottom, 40)
                .opacity(showDetails ? 1 : 0)
            }
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.5).delay(0.3)) {
                showDetails = true
            }
        }
    }
    
    private var backgroundColor: Color {
        switch role {
        case .cat:
            return .blue
        case .dog:
            return .red
        case .fox:
            return .orange
        }
    }
}

// MARK: - 任务列表视图
struct TaskListView: View {
    @Environment(\.presentationMode) var presentationMode
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        NavigationView {
            List {
                ForEach(appState.gameState?.tasks ?? []) { task in
                    TaskRow(task: task)
                }
            }
            .navigationTitle("任务列表")
            .navigationBarItems(trailing: Button("关闭") {
                presentationMode.wrappedValue.dismiss()
            })
        }
    }
}

struct TaskRow: View {
    let task: Task
    
    var body: some View {
        HStack {
            Image(systemName: task.isCompleted ? "checkmark.circle.fill" : "circle")
                .foregroundColor(task.isCompleted ? .green : .gray)
                .font(.title2)
            
            VStack(alignment: .leading, spacing: 4) {
                Text(task.name)
                    .font(.headline)
                    .strikethrough(task.isCompleted)
                
                Text(taskPosition)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
            
            if task.isCompleted {
                Text("已完成")
                    .font(.caption)
                    .foregroundColor(.green)
            }
        }
        .padding(.vertical, 4)
    }
    
    private var taskPosition: String {
        "位置: (\(Int(task.position.x)), \(Int(task.position.y)))"
    }
}

// MARK: - 聊天视图
struct ChatView: View {
    @Environment(\.presentationMode) var presentationMode
    @EnvironmentObject var appState: AppState
    @State private var messageText = ""
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // 消息列表
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(appState.gameState?.messages ?? []) { message in
                            ChatBubble(message: message, isMe: message.senderId == SocketService.shared.myPlayerId)
                        }
                    }
                    .padding()
                }
                
                Divider()
                
                // 输入框
                HStack(spacing: 12) {
                    TextField("输入消息...", text: $messageText)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                    
                    Button(action: sendMessage) {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title2)
                            .foregroundColor(.blue)
                    }
                    .disabled(messageText.isEmpty)
                }
                .padding()
            }
            .navigationTitle("聊天")
            .navigationBarItems(trailing: Button("关闭") {
                presentationMode.wrappedValue.dismiss()
            })
        }
    }
    
    private func sendMessage() {
        guard !messageText.isEmpty else { return }
        
        let isGhost = !(appState.gameState?.players.first { $0.id == SocketService.shared.myPlayerId }?.isAlive ?? true)
        let type = isGhost ? "ghost" : "game"
        
        SocketService.shared.sendMessage(content: messageText, type: type)
        messageText = ""
    }
}

// MARK: - 游戏结果视图
struct GameResultView: View {
    @EnvironmentObject var appState: AppState
    @State private var showConfetti = false
    
    var body: some View {
        ZStack {
            // 背景
            resultBackground
                .ignoresSafeArea()
            
            VStack(spacing: 24) {
                Spacer()
                
                // 结果标题
                if let winner = appState.gameState?.winner {
                    let isWinner = appState.gameState?.myTeam == winner
                    
                    VStack(spacing: 16) {
                        Text(isWinner ? "🎉 胜利！" : "😔 失败")
                            .font(.system(size: 60))
                        
                        Text(isWinner ? "你的阵营获胜！" : "你的阵营失败了...")
                            .font(.largeTitle)
                            .fontWeight(.bold)
                            .foregroundColor(.white)
                        
                        Text(appState.gameState?.endReason ?? "")
                            .font(.title3)
                            .foregroundColor(.white.opacity(0.8))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                }
                
                Spacer()
                
                // 玩家结果列表
                VStack(alignment: .leading, spacing: 8) {
                    Text("玩家结果")
                        .font(.headline)
                        .foregroundColor(.white)
                        .padding(.bottom, 4)
                    
                    ForEach(appState.gameState?.players ?? []) { player in
                        HStack {
                            Text(player.avatar)
                                .font(.title3)
                            
                            Text(player.name)
                                .font(.subheadline)
                                .foregroundColor(.white)
                            
                            Spacer()
                            
                            if let role = player.role {
                                Text(role.displayName)
                                    .font(.caption)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 2)
                                    .background(role == .dog ? Color.red.opacity(0.5) : (role == .fox ? Color.orange.opacity(0.5) : Color.blue.opacity(0.5)))
                                    .foregroundColor(.white)
                                    .cornerRadius(4)
                            }
                            
                            Image(systemName: player.isAlive ? "checkmark.circle.fill" : "xmark.circle.fill")
                                .foregroundColor(player.isAlive ? .green : .red)
                        }
                        .padding(.vertical, 4)
                    }
                }
                .padding()
                .background(Color.black.opacity(0.3))
                .cornerRadius(12)
                .padding(.horizontal)
                
                Spacer()
                
                // 返回按钮
                Button(action: returnToLobby) {
                    Text("返回大厅")
                        .font(.headline)
                        .foregroundColor(.primary)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.white)
                        .cornerRadius(12)
                }
                .padding(.horizontal, 40)
                .padding(.bottom, 40)
            }
        }
    }
    
    private var resultBackground: some View {
        if let winner = appState.gameState?.winner {
            let isWinner = appState.gameState?.myTeam == winner
            return isWinner ? Color.green : Color.red
        }
        return Color.gray
    }
    
    private func returnToLobby() {
        SocketService.shared.leaveRoom()
        appState.currentRoom = nil
        appState.gameState = nil
        appState.currentScreen = .lobby
    }
}
