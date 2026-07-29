# Phoenix

**Self-healing browser automation for LLM agents.** | [中文版](README_zh.md)

An MCP server that controls browsers via Playwright and automatically fixes broken selectors when pages change.

```
Selector fails → Cache → Semantic match → optional visual-reference match → LLM fallback → Retry
```

Repair accuracy and latency are workload-dependent; this repository does not publish a benchmark claim.

## Quick Start

```bash
npm install -g phoenix-mcp
phoenix-mcp
```

Or `npx phoenix-mcp`. Server starts on stdio, ready for MCP clients.

### Integration

**Claude Desktop** — add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{ "mcpServers": { "phoenix": { "command": "npx", "args": ["-y", "phoenix-mcp"] } } }
```

**Cursor** — add to `.cursor/mcp.json`:

```json
{ "mcpServers": { "phoenix": { "command": "npx", "args": ["-y", "phoenix-mcp"] } } }
```

**Claude Code**:

```bash
claude mcp add phoenix -- npx -y phoenix-mcp
```

### LLM Configuration (Optional)

Tier 1 (cache) and Tier 2 (semantic matching) are fully deterministic — no LLM needed. LLM is only used as Tier 3 last resort.

```bash
export LLM_PROVIDER=openai      # openai | claude | gemini
export LLM_API_KEY=sk-...
export LLM_BASE_URL=https://api.deepseek.com/v1  # optional OpenAI-compatible endpoint
export LLM_MODEL=your-model-id                   # optional
```

Alternatively, copy `.env.example` to `.env` and fill in a local secret. The
real `.env` file is ignored by Git.

Run `npm run test:llm` to exercise a real Tier-3 repair after configuring a
provider. It is intentionally excluded from `npm test` because it incurs API
cost and needs local credentials.

`npm test` includes an offline OpenAI-compatible provider contract test; it
verifies the `/chat/completions` path, Bearer authentication, request payload,
and non-2xx error propagation without using a real key.

LLM calls use bounded retries for transient network/429/5xx failures and a
process-local circuit breaker. Configure `PHOENIX_LLM_MAX_RETRIES`,
`PHOENIX_LLM_RETRY_BASE_MS`, `PHOENIX_LLM_CIRCUIT_FAILURE_THRESHOLD`, and
`PHOENIX_LLM_CIRCUIT_RESET_MS` as needed. The `metrics_prometheus` MCP tool
exports Prometheus-compatible browser, MCP, and LLM resilience metrics.

## MCP Tools

| Tool | Description |
|------|-------------|
| `session_create` / `session_close` | Session management |
| `navigate` / `click` / `type` / `extract` | Core browser actions |
| `screenshot` / `evaluate` / `scroll` / `wait` | Page interaction |
| `get_page_info` | Get URL, title, HTML |
| `smart_wait` | DOM stability / custom condition / element count |
| `infinite_scroll` | Auto-scroll with new content detection |
| `shadow_extract` | Shadow DOM piercing extract |
| `switch_frame` | iframe switching |
| `frame_evaluate` / `frame_extract` | Execute or extract inside the selected iframe |
| `spa_monitor` | SPA route change monitoring |
| `self_healing_run` | Execute with automatic retry + healing |
| `pool_stats` | Pool utilization, queue depth, error rate |
| `health` | MCP readiness and browser-pool connection state |

For `self_healing_run`, pass `expectedUrl`, `expectedSelector`, or `expectedText` for an explicit post-action assertion. This is strongly recommended for healed clicks because a page-state change alone does not prove that the intended control was activated.
| `audit_events` | Bounded recent operation audit events (trusted local deployments) |

## Self-Healing Engine

### Three-Tier Pipeline

| Tier | Method | Speed | Cost | Trigger |
| ---- | ------ | ----- | ---- | ------- |
| 1 | Repair Cache | local lookup | $0 | Same selector/domain has a validated repair |
| 2 | Semantic Matching | DOM-dependent | $0 | New failure with usable DOM signals |
| 3 | LLM Analysis | provider-dependent | provider-dependent | Deterministic repair did not find a candidate |

### Tier 2: Semantic + Visual Matching

Single DOM pass extracts two fingerprint types:

- **Semantic** (weight 0.65): text, tag, role, behavior, attributes, structure, context
- **Visual** (weight 0.35): relative position, size, shape, color, parent layout
- Combined: `semantic x 0.65 + visual x 0.35`

### Dynamic Weighting

Weights adapt to element type:

- **Button**: text 4.5, behavior 3.0 (text is the primary identifier)
- **Input**: placeholder 4.5, attributes 4.0 (placeholder is most stable)
- **Link**: href 3.5, text 4.0
- **Submit**: submit 4.0, context 2.5

### Score Collision Detection

When top-2 scores differ by < 0.05, three tiebreakers fire in order:

1. Visual score difference
2. Stable attributes (data-testid > id > aria-label)
3. **Spatial anchor** — distance to nearest landmark (header/nav/main/footer), resolves identical elements in infinite scroll lists

### Weight Self-Evolution

When Tier 3 (LLM) succeeds but Tier 2 failed:

1. Identify the **discriminator signal** — the feature with the largest gap between correct and wrong elements
2. Boost that signal's weight by 1.5x (e.g., if `aria-label` was the key difference)
3. Per-domain, persists to disk, 1% decay prevents overfitting
4. Auto-resets if failure rate exceeds 2:1 after adjustment

### Post-Action Verification

After a healed action, verify the page actually changed:

- Captures before/after page state (URL + content hash)
- If no change detected: invalidate cache entry, retry with higher-tier healing
- Only triggers for actions where "success" doesn't guarantee correctness (navigate, submit, redirect)

### Cache Sanitization

- TTL: 7-day expiration per entry, extended on successful verification
- Consecutive fail tracking: 3 failed verifications → auto-evict
- Prevents poisoned cache entries from persisting

### CSS-Hidden Element Filtering

Skips elements hidden via: `display:none`, `visibility:hidden`, `opacity:0`, `transform:scale(0)`, `clip-path:inset(100%)`

### Security: Sanitizer Layer

Before sending DOM to LLM:

- **Anti-injection**: strips HTML comments, `<script>`/`<style>` blocks, inline event handlers, `data:`/`javascript:` URIs, long opaque strings
- **PII redaction**: masks emails, phone numbers, credit cards, SSNs, IPs, JWTs, API keys
- **Output validation**: rejects LLM responses containing executable code, enforces JSON-only format

### Navigation and Provider Safety

- Browser navigation accepts only HTTP(S) targets and rejects obvious private-network and cloud-metadata targets by default. The same policy is enforced for browser-context requests, including redirects and page subresources.
- For trusted local development only, set `PHOENIX_ALLOW_PRIVATE_NETWORK=true`.
- LLM requests have a 30-second default timeout; override it with `PHOENIX_LLM_TIMEOUT_MS`.
- `type`, `extract`, `wait_for`, and `navigate` apply action-specific verification after a healed selector is used. `click` falls back to conservative URL/content-change verification because it has no universal postcondition.
- CAPTCHA solving and proxy rotation are intentionally not implemented. Detected CAPTCHA returns a failed operation for human or caller-managed handling.

### Local State

Validated repair rules and learned per-domain weights persist under `.phoenix/` by default. Set `PHOENIX_STATE_DIR` to use another local state directory; treat it as application state and do not share it across untrusted tenants.

### Token Efficiency

```
100 selector failures in a session:

Tier 1 (Cache):     ~60 repairs  →  0 tokens   →  $0.00
Tier 2 (Semantic):  ~35 repairs  →  0 tokens   →  $0.00
Tier 3 (LLM):       ~5 repairs  →  ~2K tokens  →  ~$0.05
                                                ─────────
Without Phoenix:    100 repairs  →  ~40K tokens →  ~$0.80
With Phoenix:       100 repairs  →  ~2K tokens  →  ~$0.05  (94% savings)
```

## Demo

```bash
git clone https://github.com/nicepkg/phoenix.git
cd phoenix && npm install && npm run build
npx tsx test/phase3-test.ts    # 23 self-healing tests
npx tsx test/phase4-test.ts    # 15 concurrency tests
```

### Example: Selector Breaks and Self-Heals

```
Input:  self_healing_run click ".old-button-class"
Intent: "the target button on the page"

Attempt 1: FAIL — selector not found
  → Tier 2: Scanning DOM...
  → Found: #target-btn (semantic: 0.58, visual: 0.31, combined: 0.49)
  → Healed: .old-button-class → #target-btn
  → Cached for instant reuse

Attempt 2: SUCCESS — clicked #target-btn
  → Post-action verification: page changed ✓
  → Cache entry verified, TTL extended

Result: 2 attempts, 0 LLM calls, ~100ms
```

## Architecture

```
src/
├── browser/
│   ├── pool.ts              — Browser pool with TTL, queue, health checks
│   ├── context.ts           — Session wrapper
│   ├── task-queue.ts        — Backpressure queue for concurrent requests
│   ├── session-mutex.ts     — Per-session operation serialization
│   └── metrics.ts           — Concurrency metrics
├── mcp/
│   ├── server.ts            — MCP Server (19 tools)
│   └── tools/               — Tool implementations
├── healing/
│   ├── detector.ts          — Error classification
│   ├── diagnoser.ts         — Rule-based + LLM diagnosis
│   ├── executor.ts          — Healing loop + post-action verification
│   ├── sanitizer.ts         — Anti-injection + PII redaction
│   ├── anti-bot.ts          — Anti-bot detection
│   ├── llm-provider.ts      — LLM abstraction (OpenAI/Claude/Gemini)
│   └── semantic/
│       ├── fingerprint.ts   — Semantic fingerprint (CSS-hidden aware)
│       ├── matcher.ts       — Dynamic-weight scoring engine
│       ├── visual-anchor.ts — Visual fingerprint
│       ├── repair-cache.ts  — Cache with TTL + verification tracking
│       ├── weight-store.ts  — Per-domain weight self-evolution
│       └── healer.ts        — Three-tier healer + spatial anchor tiebreaker
└── index.ts                 — Entry point
```

## Development

```bash
git clone https://github.com/nicepkg/phoenix.git
cd phoenix && npm install && npm run build
npm run dev        # watch mode
```

## Tech Stack

- TypeScript, Playwright, @modelcontextprotocol/sdk, Zod
- LLM: OpenAI-compatible API / Claude / Gemini (optional)

## License

MIT
