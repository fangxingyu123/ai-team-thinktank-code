// ==================== 创建自定义房间视图 ====================
// 文件: CatDogKill/Views/CustomRoom/CreateCustomRoomView.swift
// 说明: 创建带密码和自定义规则的房间界面

import SwiftUI

struct CreateCustomRoomView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.presentationMode) var presentationMode
    
    // MARK: - 状态
    @State private var roomName = ""
    @State private var visibility: RoomVisibility = .public_room
    @State private var password = ""
    @State private var passwordHint = ""
    @State private var maxPlayers = 10
    @State private var selectedTemplate: RuleTemplate? = nil
    @State private var customRules = CustomGameRules.default
    
    @State private var showPasswordField = false
    @State private var showRuleEditor = false
    @State private var isCreating = false
    @State private var errorMessage: String?
    @State private var showError = false
    
    // MARK: - 常量
    let playerCountOptions = [4, 6, 8, 10]
    
    var body: some View {
        NavigationView {
            Form {
                // MARK: - 基础设置
                Section(header: Text("房间信息")) {
                    TextField("房间名称", text: $roomName)
                        .textContentType(.nickname)
                    
                    Picker("房间类型", selection: $visibility) {
                        ForEach(RoomVisibility.allCases, id: \.self) { type in
                            HStack {
                                Image(systemName: type.icon)
                                Text(type.displayName)
                            }
                            .tag(type)
                        }
                    }
                    
                    if visibility == .private_room {
                        SecureField("设置密码（4-20位）", text: $password)
                            .textContentType(.password)
                        
                        TextField("密码提示（可选）", text: $passwordHint)
                            .font(.caption)
                    }
                    
                    Picker("最大人数", selection: $maxPlayers) {
                        ForEach(playerCountOptions, id: \.self) { count in
                            Text("\(count)人").tag(count)
                        }
                    }
                }
                
                // MARK: - 规则模板
                Section(header: Text("游戏规则模板")) {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            ForEach(RuleTemplate.templates) { template in
                                TemplateCard(
                                    template: template,
                                    isSelected: selectedTemplate?.id == template.id
                                )
                                .onTapGesture {
                                    withAnimation(.spring()) {
                                        selectedTemplate = template
                                        customRules = template.rules
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 4)
                    }
                    .frame(height: 100)
                }
                
                // MARK: - 当前规则预览
                Section(header: 
                    HStack {
                        Text("当前规则")
                        Spacer()
                        Button(action: { showRuleEditor = true }) {
                            Text("编辑")
                                .font(.caption)
                                .foregroundColor(.blue)
                        }
                    }
                ) {
                    RuleSummaryView(rules: customRules)
                }
                
                // MARK: - 创建按钮
                Section {
                    Button(action: createRoom) {
                        HStack {
                            Spacer()
                            if isCreating {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            } else {
                                Text("创建房间")
                                    .fontWeight(.semibold)
                            }
                            Spacer()
                        }
                    }
                    .disabled(!canCreate || isCreating)
                    .foregroundColor(.white)
                    .listRowBackground(canCreate && !isCreating ? Color.blue : Color.gray)
                }
            }
            .navigationTitle("创建房间")
            .navigationBarItems(
                leading: Button("取消") {
                    presentationMode.wrappedValue.dismiss()
                }
            )
            .alert(isPresented: $showError) {
                Alert(
                    title: Text("创建失败"),
                    message: Text(errorMessage ?? "未知错误"),
                    dismissButton: .default(Text("确定"))
                )
            }
            .sheet(isPresented: $showRuleEditor) {
                RuleEditorView(rules: $customRules)
            }
        }
    }
    
    // MARK: - 计算属性
    private var canCreate: Bool {
        guard !roomName.isEmpty else { return false }
        if visibility == .private_room {
            guard password.count >= 4 && password.count <= 20 else { return false }
        }
        return true
    }
    
    // MARK: - 方法
    private func createRoom() {
        isCreating = true
        
        let request = CreateCustomRoomRequest(
            name: roomName,
            visibility: visibility,
            password: visibility == .private_room ? password : nil,
            passwordHint: visibility == .private_room ? passwordHint : nil,
            maxPlayers: maxPlayers,
            minPlayers: 4,
            gameConfig: GameConfig(),
            customRules: customRules,
            settings: RoomSettings()
        )
        
        SocketService.shared.createCustomRoom(request: request) { result in
            DispatchQueue.main.async {
                isCreating = false
                
                switch result {
                case .success(let room):
                    appState.currentRoom = room
                    presentationMode.wrappedValue.dismiss()
                    appState.currentScreen = .room
                    
                case .failure(let error):
                    errorMessage = error.localizedDescription
                    showError = true
                }
            }
        }
    }
}

// MARK: - 规则模板卡片
struct TemplateCard: View {
    let template: RuleTemplate
    let isSelected: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: template.icon)
                    .font(.title2)
                    .foregroundColor(Color(hex: template.color))
                
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                }
            }
            
            Text(template.name)
                .font(.subheadline)
                .fontWeight(.semibold)
                .lineLimit(1)
            
            Text(template.description)
                .font(.caption)
                .foregroundColor(.secondary)
                .lineLimit(2)
        }
        .frame(width: 140, height: 80)
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemBackground))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(isSelected ? Color(hex: template.color) : Color.clear, lineWidth: 2)
                )
                .shadow(color: Color.black.opacity(0.1), radius: 4, x: 0, y: 2)
        )
    }
}

// MARK: - 规则摘要视图
struct RuleSummaryView: View {
    let rules: CustomGameRules
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // 角色设置
            HStack {
                Label("角色", systemImage: "person.3.fill")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                Spacer()
                Text(rules.roleSettings.availableRoles.joined(separator: ", "))
                    .font(.caption)
            }
            
            Divider()
            
            // 移动速度
            HStack {
                Label("移动速度", systemImage: "figure.walk")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                Spacer()
                Text(String(format: "%.1fx", rules.mechanics.playerSpeed))
                    .font(.caption)
            }
            
            // 视野范围
            HStack {
                Label("视野范围", systemImage: "eye.fill")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                Spacer()
                Text(String(format: "%.1fx", rules.mechanics.visionRange))
                    .font(.caption)
            }
            
            // 任务数量
            HStack {
                Label("任务总数", systemImage: "list.bullet")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                Spacer()
                Text("\(rules.taskSettings.totalTasks)个 (\(rules.taskSettings.taskDifficulty.displayName))")
                    .font(.caption)
            }
            
            // 投票模式
            HStack {
                Label("投票模式", systemImage: "hand.raised.fill")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                Spacer()
                Text(rules.votingSettings.votingMode.displayName)
                    .font(.caption)
            }
            
            // 特殊设置标签
            FlowLayout(spacing: 8) {
                if rules.mechanics.ghostCanDoTasks {
                    TagView(text: "幽灵可做任务", color: .purple)
                }
                if !rules.mechanics.showPlayerNames {
                    TagView(text: "隐藏名字", color: .orange)
                }
                if !rules.mechanics.confirmKills {
                    TagView(text: "快速击杀", color: .red)
                }
            }
        }
    }
}

// MARK: - 标签视图
struct TagView: View {
    let text: String
    let color: Color
    
    var body: some View {
        Text(text)
            .font(.caption2)
            .fontWeight(.medium)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.15))
            .foregroundColor(color)
            .cornerRadius(4)
    }
}

// MARK: - 流式布局
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = FlowResult(in: proposal.width ?? 0, subviews: subviews, spacing: spacing)
        return result.size
    }
    
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = FlowResult(in: bounds.width, subviews: subviews, spacing: spacing)
        for (index, subview) in subviews.enumerated() {
            subview.place(at: CGPoint(x: bounds.minX + result.positions[index].x,
                                      y: bounds.minY + result.positions[index].y),
                         proposal: .unspecified)
        }
    }
    
    struct FlowResult {
        var size: CGSize = .zero
        var positions: [CGPoint] = []
        
        init(in maxWidth: CGFloat, subviews: Subviews, spacing: CGFloat) {
            var x: CGFloat = 0
            var y: CGFloat = 0
            var rowHeight: CGFloat = 0
            
            for subview in subviews {
                let size = subview.sizeThatFits(.unspecified)
                
                if x + size.width > maxWidth && x > 0 {
                    x = 0
                    y += rowHeight + spacing
                    rowHeight = 0
                }
                
                positions.append(CGPoint(x: x, y: y))
                rowHeight = max(rowHeight, size.height)
                x += size.width + spacing
            }
            
            self.size = CGSize(width: maxWidth, height: y + rowHeight)
        }
    }
}

// MARK: - 颜色扩展
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }

        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue:  Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - 预览
struct CreateCustomRoomView_Previews: PreviewProvider {
    static var previews: some View {
        CreateCustomRoomView()
            .environmentObject(AppState())
    }
}
