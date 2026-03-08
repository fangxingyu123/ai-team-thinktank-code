import SwiftUI

struct ContentView: View {
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        Group {
            switch appState.currentScreen {
            case .auth:
                AuthView()
            case .lobby:
                LobbyView()
            case .room:
                RoomView()
            case .game:
                GameView()
            case .meeting:
                MeetingView()
            case .result:
                GameResultView()
            }
        }
    }
}

// MARK: - Auth View
struct AuthView: View {
    @EnvironmentObject var appState: AppState
    @State private var playerName = ""
    @State private var isConnecting = false
    
    var body: some View {
        VStack(spacing: 30) {
            Spacer()
            
            // Logo
            VStack(spacing: 16) {
                Text("🐱🐶")
                    .font(.system(size: 80))
                
                Text("猫狗杀")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                
                Text("找出卧底，完成任务")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
            
            // 输入框
            VStack(spacing: 20) {
                TextField("输入你的昵称", text: $playerName)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .font(.title3)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
                    .onSubmit {
                        connectToServer()
                    }
                
                Button(action: connectToServer) {
                    HStack {
                        if isConnecting {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                .padding(.trailing, 8)
                        }
                        
                        Text("开始游戏")
                            .font(.headline)
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(playerName.isEmpty ? Color.gray : Color.blue)
                    .cornerRadius(12)
                }
                .disabled(playerName.isEmpty || isConnecting)
                .padding(.horizontal, 40)
            }
            
            Spacer()
            
            // 连接状态
            HStack {
                Circle()
                    .fill(SocketService.shared.isConnected ? Color.green : Color.red)
                    .frame(width: 8, height: 8)
                
                Text(SocketService.shared.isConnected ? "已连接" : "未连接")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .onAppear {
            SocketService.shared.connect()
        }
    }
    
    private func connectToServer() {
        guard !playerName.isEmpty else { return }
        
        isConnecting = true
        
        // 保存玩家名称
        UserDefaults.standard.set(playerName, forKey: "playerName")
        
        // 进入大厅
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            isConnecting = false
            appState.currentScreen = .lobby
        }
    }
}

// MARK: - Lobby View
struct LobbyView: View {
    @EnvironmentObject var appState: AppState
    @State private var showingCreateRoom = false
    @State private var showingJoinRoom = false
    @State private var roomCode = ""
    
    var body: some View {
        NavigationView {
            VStack(spacing: 24) {
                // 欢迎语
                VStack(spacing: 8) {
                    Text("欢迎, \(UserDefaults.standard.string(forKey: "playerName") ?? "玩家")!")
                        .font(.title2)
                        .fontWeight(.semibold)
                    
                    Text("选择游戏模式")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.top, 20)
                
                // 操作按钮
                VStack(spacing: 16) {
                    Button(action: { showingCreateRoom = true }) {
                        HStack {
                            Image(systemName: "plus.circle.fill")
                            Text("创建房间")
                                .font(.headline)
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .cornerRadius(12)
                    }
                    
                    Button(action: { showingJoinRoom = true }) {
                        HStack {
                            Image(systemName: "person.2.fill")
                            Text("加入房间")
                                .font(.headline)
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.green)
                        .cornerRadius(12)
                    }
                }
                .padding(.horizontal, 40)
                
                Spacer()
                
                // 游戏说明
                VStack(alignment: .leading, spacing: 12) {
                    Text("游戏规则")
                        .font(.headline)
                        .padding(.bottom, 4)
                    
                    HStack {
                        Text("🐱")
                        Text("猫咪：完成任务，找出卧底")
                            .font(.subheadline)
                    }
                    
                    HStack {
                        Text("🐶")
                        Text("狗狗：搞破坏，淘汰猫咪")
                            .font(.subheadline)
                    }
                    
                    HStack {
                        Text("🦊")
                        Text("狐狸：存活到最后")
                            .font(.subheadline)
                    }
                }
                .padding()
                .background(Color(.systemGray6))
                .cornerRadius(12)
                .padding(.horizontal, 20)
                
                Spacer()
            }
            .navigationTitle("猫狗杀")
            .navigationBarTitleDisplayMode(.large)
            .sheet(isPresented: $showingCreateRoom) {
                CreateRoomView()
            }
            .sheet(isPresented: $showingJoinRoom) {
                JoinRoomView()
            }
        }
    }
}

// MARK: - Create Room View
struct CreateRoomView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.presentationMode) var presentationMode
    @State private var roomName = ""
    @State private var maxPlayers = 8
    
    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("房间设置")) {
                    TextField("房间名称", text: $roomName)
                    
                    Stepper("最大人数: \(maxPlayers)", value: $maxPlayers, in: 4...10)
                }
                
                Section {
                    Button(action: createRoom) {
                        Text("创建")
                            .frame(maxWidth: .infinity)
                            .foregroundColor(.blue)
                    }
                }
            }
            .navigationTitle("创建房间")
            .navigationBarItems(trailing: Button("取消") {
                presentationMode.wrappedValue.dismiss()
            })
        }
    }
    
    private func createRoom() {
        let name = roomName.isEmpty ? "\(UserDefaults.standard.string(forKey: "playerName") ?? "玩家")的房间" : roomName
        SocketService.shared.createRoom(name: name, maxPlayers: maxPlayers)
        
        // 监听加入房间成功
        SocketService.shared.onRoomJoined = { room, player, players in
            DispatchQueue.main.async {
                appState.currentRoom = room
                appState.currentScreen = .room
                presentationMode.wrappedValue.dismiss()
            }
        }
    }
}

// MARK: - Join Room View
struct JoinRoomView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.presentationMode) var presentationMode
    @State private var roomCode = ""
    
    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("房间代码")) {
                    TextField("输入6位房间代码", text: $roomCode)
                        .autocapitalization(.allCharacters)
                        .onChange(of: roomCode) { newValue in
                            roomCode = String(newValue.uppercased().prefix(6))
                        }
                }
                
                Section {
                    Button(action: joinRoom) {
                        Text("加入")
                            .frame(maxWidth: .infinity)
                            .foregroundColor(roomCode.count == 6 ? .blue : .gray)
                    }
                    .disabled(roomCode.count != 6)
                }
            }
            .navigationTitle("加入房间")
            .navigationBarItems(trailing: Button("取消") {
                presentationMode.wrappedValue.dismiss()
            })
        }
    }
    
    private func joinRoom() {
        guard roomCode.count == 6 else { return }
        
        let playerName = UserDefaults.standard.string(forKey: "playerName") ?? "玩家"
        SocketService.shared.joinRoom(roomId: roomCode, playerName: playerName)
        
        // 监听加入房间成功
        SocketService.shared.onRoomJoined = { room, player, players in
            DispatchQueue.main.async {
                appState.currentRoom = room
                appState.currentScreen = .room
                presentationMode.wrappedValue.dismiss()
            }
        }
    }
}
