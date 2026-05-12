# Phoenix

**面向 LLM Agent 的自愈式浏览器自动化。**

基于 Playwright 的 MCP 服务器，选择器失效时自动修复，无需人工维护。

```
选择器失败 → 缓存查找 (0ms) → 语义+视觉匹配 (50ms) → LLM 修复 (2s) → 重试
```

95%+ 的修复在 Tier 1/2 完成，零 LLM 调用成本。

## Phoenix vs 同类方案

| 特性 | Playwright MCP | Browser Use | **Phoenix** |
| ---- | -------------- | ----------- | ----------- |
| 选择器失效 → 自动修复 | 无 | 仅 LLM | **三层 (缓存→语义→LLM)** |
| 单次修复成本 | 人工 | ~$0.01 | **$0 (Tier 1+2)** |
| 修复速度 | N/A | ~2s | **0-50ms (Tier 1+2)** |
| 确定性修复 | N/A | 否 (LLM 猜测) | **是 (结构化分析)** |
| 视觉指纹 | 无 | 无 | **有** |
| 动态权重 | 无 | 无 | **有 (按元素类型自适应)** |
| 权重自进化 | 无 | 无 | **有 (按域名学习)** |
| 得分碰撞处理 | 无 | 无 | **有 (空间锚点裁决)** |
| 动作后验证 | 无 | 无 | **有 (失败自动回滚缓存)** |
| 安全防护 (注入/脱敏) | 无 | 无 | **有 (清洗层)** |
| 高并发 | 无 | 无 | **有 (队列+互斥+TTL)** |

## 快速开始

```bash
npm install -g phoenix-mcp
phoenix
```

或直接 `npx phoenix-mcp`，服务以 stdio 方式启动。

### 接入方式

**Claude Desktop** — 写入 `~/Library/Application Support/Claude/claude_desktop_config.json`：

```json
{ "mcpServers": { "phoenix": { "command": "npx", "args": ["-y", "phoenix-mcp"] } } }
```

**Cursor** — 写入 `.cursor/mcp.json`：

```json
{ "mcpServers": { "phoenix": { "command": "npx", "args": ["-y", "phoenix-mcp"] } } }
```

**Claude Code**：

```bash
claude mcp add phoenix -- npx -y phoenix-mcp
```

### LLM 配置（可选）

Tier 1（缓存）和 Tier 2（语义匹配）完全确定性，无需 LLM。LLM 仅作为 Tier 3 最后手段。

```bash
export LLM_PROVIDER=openai      # openai | claude | gemini
export LLM_API_KEY=sk-...
export LLM_BASE_URL=https://api.deepseek.com  # 可选自定义端点
export LLM_MODEL=deepseek-v4-pro               # 可选模型名
```

## MCP 工具

| 工具 | 说明 |
| ---- | ---- |
| `session_create` / `session_close` | 会话管理 |
| `navigate` / `click` / `type` / `extract` | 核心浏览器操作 |
| `screenshot` / `evaluate` / `scroll` / `wait` | 页面交互 |
| `get_page_info` | 获取 URL、标题、HTML |
| `smart_wait` | DOM 稳定性 / 自定义条件 / 元素数量等待 |
| `infinite_scroll` | 自动滚动 + 新内容检测 |
| `shadow_extract` | Shadow DOM 穿透提取 |
| `switch_frame` | iframe 切换 |
| `spa_monitor` | SPA 路由变化监听 |
| `self_healing_run` | 带自动重试+自愈的执行 |
| `pool_stats` | 池利用率、队列深度、错误率 |

## 自愈引擎

### 三层修复流水线

| 层级 | 方法 | 速度 | 成本 | 触发条件 |
| ---- | ---- | ---- | ---- | -------- |
| 1 | 修复缓存 | ~0ms | $0 | 相同失败模式已修复过 |
| 2 | 语义+视觉匹配 | ~50ms | $0 | 新失败，DOM 信号清晰 |
| 3 | LLM 分析 | ~2s | ~$0.01 | DOM 信号模糊 |

### Tier 2：语义+视觉匹配

单次 DOM 遍历同时提取两种指纹：

- **语义**（权重 0.65）：文本、标签、角色、行为、属性、结构、上下文
- **视觉**（权重 0.35）：相对位置、大小、形状、颜色、父元素布局
- 融合评分：`语义 × 0.65 + 视觉 × 0.35`

### 动态权重

权重按元素类型自动调整：

- **按钮**：文本 4.5，行为 3.0（文本是主要标识）
- **输入框**：placeholder 4.5，属性 4.0（placeholder 最稳定）
- **链接**：href 3.5，文本 4.0
- **提交**：submit 4.0，上下文 2.5

### 得分碰撞检测

当 top-2 分数差距 < 0.05 时，三级裁决依次触发：

1. 视觉分数差异
2. 稳定属性优先（data-testid > id > aria-label）
3. **空间锚点** — 到最近地标（header/nav/main/footer）的距离，解决无限滚动列表中相同结构元素的区分问题

### 权重自进化

当 Tier 3 (LLM) 成功但 Tier 2 失败时：

1. 识别**判别信号** — 正确元素与错误元素差距最大的特征
2. 该信号权重获得 1.5 倍额外提升（如 `aria-label` 是决胜因素）
3. 按域名独立存储，持久化到磁盘，1% 衰减防止过拟合
4. 失败率超过 2:1 自动重置

### 动作后验证

自愈动作执行后，验证页面是否真正发生变化：

- 对比前后页面状态（URL + 内容哈希）
- 未检测到变化 → 失效缓存条目，触发更高级别修复
- 仅对"成功不等于正确"的操作生效（navigate、submit、redirect）

### 缓存一致性

- TTL：每条缓存 7 天过期，验证成功自动续期
- 连续失败追踪：3 次验证失败 → 自动淘汰
- 防止污染缓存永久固化

### CSS 隐藏元素过滤

跳过通过以下方式隐藏的元素：`display:none`、`visibility:hidden`、`opacity:0`、`transform:scale(0)`、`clip-path:inset(100%)`

### 安全：清洗层

DOM 传给 LLM 前的安全清洗：

- **防注入**：移除 HTML 注释、`<script>`/`<style>` 块、内联事件处理器、`data:`/`javascript:` URI、超长不透明字符串
- **PII 脱敏**：正则替换邮箱、手机号、信用卡、身份证号、IP、JWT、API Key
- **输出校验**：拒绝含可执行代码的 LLM 响应，强制 JSON 格式

### Token 效率

```
100 次选择器失败的典型会话：

Tier 1 (缓存):     ~60 次修复  →  0 token    →  $0.00
Tier 2 (语义):     ~35 次修复  →  0 token    →  $0.00
Tier 3 (LLM):       ~5 次修复  →  ~2K token  →  ~$0.05
                                              ─────────
无 Phoenix:        100 次修复  →  ~40K token →  ~$0.80
有 Phoenix:        100 次修复  →  ~2K token  →  ~$0.05  (节省 94%)
```

## 演示

```bash
git clone https://github.com/nicepkg/phoenix.git
cd phoenix && npm install && npm run build
npx tsx test/phase3-test.ts    # 23 个自愈测试
npx tsx test/phase4-test.ts    # 15 个并发测试
```

### 示例：选择器失效并自愈

```
输入:  self_healing_run click ".old-button-class"
意图:  "页面上的目标按钮"

第 1 次: 失败 — 选择器未找到
  → Tier 2: 扫描 DOM...
  → 匹配: #target-btn (语义: 0.58, 视觉: 0.31, 融合: 0.49)
  → 自愈: .old-button-class → #target-btn
  → 缓存修复规则

第 2 次: 成功 — 点击 #target-btn
  → 动作后验证: 页面已变化 ✓
  → 缓存条目验证通过，TTL 续期

结果: 2 次尝试，0 次 LLM 调用，~100ms
```

## 架构

```
src/
├── browser/
│   ├── pool.ts              — 浏览器池（TTL、队列、健康检查）
│   ├── context.ts           — 会话封装
│   ├── task-queue.ts        — 背压队列
│   ├── session-mutex.ts     — 会话级互斥锁
│   └── metrics.ts           — 并发指标
├── mcp/
│   ├── server.ts            — MCP 服务端（19 个工具）
│   └── tools/               — 工具实现
├── healing/
│   ├── detector.ts          — 错误分类
│   ├── diagnoser.ts         — 规则 + LLM 诊断
│   ├── executor.ts          — 修复循环 + 动作后验证
│   ├── sanitizer.ts         — 防注入 + PII 脱敏
│   ├── anti-bot.ts          — 反爬检测
│   ├── llm-provider.ts      — LLM 抽象层（OpenAI/Claude/Gemini）
│   └── semantic/
│       ├── fingerprint.ts   — 语义指纹（CSS 隐藏感知）
│       ├── matcher.ts       — 动态权重评分引擎
│       ├── visual-anchor.ts — 视觉指纹
│       ├── repair-cache.ts  — 缓存（TTL + 验证追踪）
│       ├── weight-store.ts  — 按域名权重自进化
│       └── healer.ts        — 三层修复器 + 空间锚点裁决
└── index.ts                 — 入口
```

## 开发

```bash
git clone https://github.com/nicepkg/phoenix.git
cd phoenix && npm install && npm run build
npm run dev        # 监听模式
```

## 技术栈

- TypeScript, Playwright, @modelcontextprotocol/sdk, Zod
- LLM：OpenAI 兼容 API / Claude / Gemini（可选）

## 协议

MIT
