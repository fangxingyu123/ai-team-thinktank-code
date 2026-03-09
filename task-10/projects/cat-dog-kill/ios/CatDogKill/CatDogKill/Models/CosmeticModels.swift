// ==================== 皮肤/装扮系统数据模型 ====================
// 文件: CatDogKill/Models/CosmeticModels.swift
// 说明: 定义装扮相关的数据结构和枚举

import Foundation

// MARK: - 装扮品类

enum CosmeticCategory: String, Codable, CaseIterable {
    case skin = "skin"           // 皮肤（角色外观）
    case hat = "hat"             // 帽子
    case pet = "pet"             // 宠物
    case animation = "animation" // 动画/动作
    case trail = "trail"         // 拖尾特效
    case killEffect = "kill_effect" // 击杀特效
    
    var displayName: String {
        switch self {
        case .skin: return "皮肤"
        case .hat: return "帽子"
        case .pet: return "宠物"
        case .animation: return "动作"
        case .trail: return "拖尾"
        case .killEffect: return "击杀特效"
        }
    }
    
    var icon: String {
        switch self {
        case .skin: return "person.fill"
        case .hat: return "hat.widebrim.fill"
        case .pet: return "pawprint.fill"
        case .animation: return "figure.walk"
        case .trail: return "wind"
        case .killEffect: return "sparkles"
        }
    }
}

// MARK: - 稀有度

enum Rarity: String, Codable, CaseIterable {
    case common = "common"       // 普通（白色）
    case uncommon = "uncommon"   // 罕见（绿色）
    case rare = "rare"           // 稀有（蓝色）
    case epic = "epic"           // 史诗（紫色）
    case legendary = "legendary" // 传说（橙色）
    case mythic = "mythic"       // 神话（红色）
    case limited = "limited"     // 限定（金色）
    
    var displayName: String {
        switch self {
        case .common: return "普通"
        case .uncommon: return "罕见"
        case .rare: return "稀有"
        case .epic: return "史诗"
        case .legendary: return "传说"
        case .mythic: return "神话"
        case .limited: return "限定"
        }
    }
    
    var color: String {
        switch self {
        case .common: return "#9E9E9E"      // 灰色
        case .uncommon: return "#4CAF50"    // 绿色
        case .rare: return "#2196F3"        // 蓝色
        case .epic: return "#9C27B0"        // 紫色
        case .legendary: return "#FF9800"   // 橙色
        case .mythic: return "#F44336"      // 红色
        case .limited: return "#FFD700"     // 金色
        }
    }
    
    var sortOrder: Int {
        switch self {
        case .common: return 0
        case .uncommon: return 1
        case .rare: return 2
        case .epic: return 3
        case .legendary: return 4
        case .mythic: return 5
        case .limited: return 6
        }
    }
}

// MARK: - 适用角色

enum ApplicableRole: String, Codable, CaseIterable {
    case all = "all"
    case cat = "cat"
    case dog = "dog"
    case fox = "fox"
    case crewmate = "crewmate"
    case impostor = "impostor"
    
    var displayName: String {
        switch self {
        case .all: return "全部"
        case .cat: return "猫咪"
        case .dog: return "狗狗"
        case .fox: return "狐狸"
        case .crewmate: return "好人阵营"
        case .impostor: return "坏人阵营"
        }
    }
}

// MARK: - 获取方式

enum UnlockMethod: String, Codable, CaseIterable {
    case coins = "coins"
    case gems = "gems"
    case achievement = "achievement"
    case seasonPass = "season_pass"
    case event = "event"
    case `default` = "default"
    
    var displayName: String {
        switch self {
        case .coins: return "金币"
        case .gems: return "宝石"
        case .achievement: return "成就"
        case .seasonPass: return "赛季通行证"
        case .event: return "活动"
        case .default: return "默认"
        }
    }
}

// MARK: - 装扮物品

struct Cosmetic: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let description: String
    let category: CosmeticCategory
    let rarity: Rarity
    let applicableRoles: [ApplicableRole]
    let iconUrl: String
    let previewUrl: String
    let unlockMethod: UnlockMethod
    let price: Int?
    let currency: CurrencyType?
    let isOwned: Bool
    let isLimited: Bool
    let limitedEndTime: Date?
    
    enum CurrencyType: String, Codable {
        case coins = "coins"
        case gems = "gems"
    }
    
    var isEquipable: Bool {
        return isOwned
    }
    
    var priceDisplay: String {
        guard let price = price, let currency = currency else { return "不可购买" }
        return "\(price) \(currency == .coins ? "🪙" : "💎")"
    }
}

// MARK: - 用户拥有的装扮

struct UserCosmetic: Codable, Identifiable {
    let cosmeticId: String
    let name: String
    let category: CosmeticCategory
    let rarity: Rarity
    let iconUrl: String
    let isEquipped: Bool
    let acquiredAt: Date
    
    var id: String { cosmeticId }
}

// MARK: - 商店商品（包含未拥有的）

struct ShopItem: Codable, Identifiable {
    let id: String
    let name: String
    let description: String
    let category: CosmeticCategory
    let rarity: Rarity
    let iconUrl: String
    let previewUrl: String
    let unlockMethod: UnlockMethod
    let price: Int?
    let currency: Cosmetic.CurrencyType?
    let isOwned: Bool
    let isLimited: Bool
    let limitedEndTime: Date?
    let applicableRoles: [ApplicableRole]
}

// MARK: - 货币余额

struct CurrencyBalance: Codable {
    var coins: Int
    var gems: Int
}

// MARK: - 装备信息

struct EquippedCosmetics: Codable {
    var skins: [String: String?]  // role -> cosmeticId
    var hats: [String: String?]
    var pets: [String: String?]
    var animations: [String: String?]
    var trails: [String: String?]
    var killEffects: [String: String?]
    
    static let empty = EquippedCosmetics(
        skins: [:],
        hats: [:],
        pets: [:],
        animations: [:],
        trails: [:],
        killEffects: [:]
    )
}

// MARK: - 玩家装扮信息（游戏中使用）

struct PlayerCosmeticInfo: Codable {
    let playerId: String
    let role: String
    let cosmetics: PlayerCosmetics
}

struct PlayerCosmetics: Codable {
    let skin: Cosmetic?
    let hat: Cosmetic?
    let pet: Cosmetic?
    let animation: Cosmetic?
    let trail: Cosmetic?
    let killEffect: Cosmetic?
}

// MARK: - Socket 事件数据

struct CosmeticPurchaseSuccessData: Codable {
    let cosmeticId: String
    let cosmeticName: String
    let newBalance: CurrencyBalance
}

struct CosmeticEquippedUpdateData: Codable {
    let category: String
    let role: String
    let cosmeticId: String?
    let cosmeticName: String?
}

struct CosmeticAcquiredData: Codable {
    let cosmeticId: String
    let cosmeticName: String
    let category: CosmeticCategory
    let rarity: Rarity
    let source: AcquisitionSource
    
    enum AcquisitionSource: String, Codable {
        case purchase = "purchase"
        case achievement = "achievement"
        case event = "event"
        case seasonPass = "season_pass"
        case reward = "reward"
    }
}

struct BalanceUpdateData: Codable {
    let coins: Int
    let gems: Int
    let change: BalanceChange
    
    struct BalanceChange: Codable {
        let type: String  // "coins" or "gems"
        let amount: Int
        let reason: String
    }
}

// MARK: - 筛选条件

struct CosmeticFilter {
    var category: CosmeticCategory?
    var rarity: Rarity?
    var role: ApplicableRole?
    var unlockMethod: UnlockMethod?
    var searchQuery: String?
    var showOwnedOnly: Bool = false
    var showUnownedOnly: Bool = false
}

// MARK: - 装扮配置（用于游戏内渲染）

struct CosmeticRenderConfig: Codable {
    let cosmeticId: String
    let assetUrl: String
    let category: CosmeticCategory
    let offset: Position?
    let scale: Double?
    let rotation: Double?
}

struct Position: Codable {
    let x: Double
    let y: Double
}
