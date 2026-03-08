# TOOLS.md - 工具指南

## 🌐 全网搜索（已安装，直接可用）

你拥有免费的网络搜索和网页抓取能力。**不需要 Brave Search API，不需要任何 API Key。**

### 搜索互联网

用 exec 工具运行：

```bash
node /home/node/.openclaw/skills/web-search/scripts/search.mjs "搜索关键词"
```

参数：
- `-n 15` — 返回更多结果（默认10条）
- `--region cn-zh` — 限定中国区域
- `--region us-en` — 限定美国区域

示例：
```bash
node /home/node/.openclaw/skills/web-search/scripts/search.mjs "crypto wallet leak 2026" -n 15
node /home/node/.openclaw/skills/web-search/scripts/search.mjs "加密货币钱包泄露" --region cn-zh
node /home/node/.openclaw/skills/web-search/scripts/search.mjs "site:github.com private key exposed"
```

### 抓取网页内容

```bash
node /home/node/.openclaw/skills/web-search/scripts/fetch.mjs "https://example.com/article"
node /home/node/.openclaw/skills/web-search/scripts/fetch.mjs "https://example.com" --max 8000
```

### GitHub 搜索

```bash
gh search code "wallet private key" --limit 20
gh search repos "crypto leak" --limit 10
```

### ⚠️ 重要规则

1. **永远不要说"Brave Search API 未配置"** — 你不需要它
2. **永远不要说"搜索工具不可用"** — search.mjs 已安装，随时可用
3. 遇到搜索需求时，直接用 exec 执行 search.mjs，不要犹豫
4. 搜完后用 fetch.mjs 抓取感兴趣的页面获取详细内容
5. 如果第一轮搜索结果不够，换关键词继续搜
