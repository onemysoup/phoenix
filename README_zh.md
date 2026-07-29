# Phoenix

**面向 LLM Agent 的自愈式浏览器自动化。**

基于 Playwright 的 MCP 服务器。对于 `self_healing_run` 中的选择器失败，它会依次尝试缓存、确定性 DOM 候选匹配和可选 LLM fallback；低置信度或缺少业务后置条件时，调用方仍应介入确认。

```
选择器失败 → 缓存查找 → DOM 候选匹配（可选视觉引用） → 可选 LLM fallback → 重试/验证
```

## 快速开始

```bash
npm install -g phoenix-mcp
phoenix-mcp
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
export LLM_BASE_URL=https://api.deepseek.com/v1  # 可选 OpenAI-compatible 端点
export LLM_MODEL=your-model-id                   # 可选模型名
export PHOENIX_LLM_TIMEOUT_MS=30000             # 可选，请求超时（毫秒）
```

也可以将 `.env.example` 复制为 `.env` 后填入本地密钥；真实 `.env` 已被 Git 忽略。

配置 Provider 后可运行 `npm run test:llm` 验证真实 Tier-3 修复。该测试会产生 API
费用且依赖本地密钥，因此不会纳入默认 `npm test`。

默认 `npm test` 包含离线 OpenAI-compatible Provider 合约测试：无需真实密钥，覆盖
`/chat/completions` 路径、Bearer 鉴权、请求负载及非 2xx 错误传递。

LLM 调用会对网络错误、429 和 5xx 进行有界重试，并提供进程内熔断器。可通过
`PHOENIX_LLM_MAX_RETRIES`、`PHOENIX_LLM_RETRY_BASE_MS`、
`PHOENIX_LLM_CIRCUIT_FAILURE_THRESHOLD`、`PHOENIX_LLM_CIRCUIT_RESET_MS` 配置。
`metrics_prometheus` MCP 工具可导出 Prometheus 兼容的浏览器、MCP 与 LLM 韧性指标。

### 状态目录

修复缓存和按域名的权重会写入本地状态目录，默认是当前工作目录的 `.phoenix/`；可用 `PHOENIX_STATE_DIR` 覆盖。该状态不具备多租户隔离或跨进程协调能力；共享部署中请为租户分配独立目录或使用外部存储。

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
| `frame_evaluate` / `frame_extract` | 在当前选中的 iframe 内执行脚本或提取文本 |
| `spa_monitor` | SPA 路由变化监听 |
| `self_healing_run` | 带自动重试+自愈的执行 |
| `health` | MCP 就绪状态与浏览器池连接状态 |
| `pool_stats` | 池利用率、队列深度、错误率 |
| `audit_events` | 查询有上限的近期操作审计事件（仅可信本地部署） |

## 自愈引擎

### 三层修复流水线

| 层级 | 方法 | 成本 | 触发条件 |
| ---- | ---- | ---- | -------- |
| 1 | 修复缓存 | 无 LLM 调用 | 相同域名和原 selector 已有可用修复规则 |
| 2 | DOM 候选匹配 | 无 LLM 调用 | 缓存未命中且页面可枚举候选元素 |
| 3 | LLM 分析 | 取决于 provider | 确定性匹配没有足够置信度且已配置 LLM |

### Tier 2：DOM 候选匹配与视觉引用

匹配器使用文本、标签、角色、行为和属性等 DOM 信号生成候选并排序。若缓存中保存了上次成功修复的视觉工件，候选会额外与该历史工件比较相对位置、尺寸、父容器、形状与颜色；这不是截图理解，也不保证能跨页面模板匹配。

- **DOM 信号**：文本、标签、角色、行为、属性、结构、上下文
- **视觉引用（可选）**：仅在存在历史 repair artifact 时参与候选排序

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
3. 按域名维护权重；默认写入本地 `.phoenix/weights.json`
4. 失败率超过 2:1 自动重置

### 动作后验证

使用修复后的 selector 成功执行时，会按动作类型做有限验证：

- `navigate` 验证最终 URL；`type` 验证输入值；`extract` 验证 selector 可解析；`wait_for` 验证可见。
- 对带有导航/提交意图的 `click`，使用 URL 或页面文本变化作为保守兜底；它不是业务正确性的通用证明。
- 验证失败不会写入新缓存，并会累计旧缓存规则的失败次数。

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

### 导航与反自动化边界

- 导航只接受绝对 HTTP(S) URL，默认阻止私网 IPv4/IPv6、`.local` 和常见云 metadata 域，并拒绝 URL 内嵌凭证。请求路由还会检查 DNS 解析结果；开发本地站点时可显式设置 `PHOENIX_ALLOW_PRIVATE_NETWORK=true`。
- 这是单机防御纵深，不是 DNS rebind 或多租户场景下完整的网络出口边界；浏览器使用独立解析器，生产部署仍应使用 egress proxy / 网络策略。
- CAPTCHA 求解和代理轮换未实现。检测到 CAPTCHA 时，`self_healing_run` 会返回失败记录，交由调用方或人工处理。

## 演示

```bash
git clone https://github.com/onemysoup/phoenix.git
cd phoenix && npm install && npm run build
npm test
```

### 示例：选择器失效并自愈

```
输入:  self_healing_run click ".old-button-class"
意图:  "页面上的目标按钮"

第 1 次: 失败 — 选择器未找到
  → Tier 2: 扫描 DOM...
  → 候选: #target-btn（具体分数依页面与缓存工件而变化）
  → 自愈: .old-button-class → #target-btn
  → 缓存修复规则

第 2 次: 成功 — 点击 #target-btn
  → 动作后验证: 页面已变化 ✓
  → 缓存条目验证通过，TTL 续期

结果: 修复是否成功取决于候选置信度和动作后置条件；应以项目评测数据而非固定延迟或成功率判断。
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
│   ├── server.ts            — MCP 服务端
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
│       ├── visual-anchor.ts — 历史视觉工件辅助排序
│       ├── repair-cache.ts  — 缓存（TTL + 验证追踪）
│       ├── weight-store.ts  — 按域名权重自进化
│       └── healer.ts        — 三层修复器 + 空间锚点裁决
├── security/
│   └── url-policy.ts        — 导航 URL 输入校验
├── observability/
│   └── audit-log.ts         — 有界内存审计事件
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
