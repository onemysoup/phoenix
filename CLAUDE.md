# Phoenix

MCP-based single-process browser automation server with selector-healing support. It is not a distributed browser-agent platform: browser contexts, queueing, audit data, and repair state are process-local.

## Architecture

```
phoenix/
├── src/
│   ├── browser/
│   │   ├── pool.ts              — Browser pool with TTL, queue, health checks
│   │   ├── context.ts           — Single browser session wrapper
│   │   ├── task-queue.ts        — Backpressure queue for concurrent requests
│   │   ├── session-mutex.ts     — Per-session operation serialization
│   │   └── metrics.ts           — Concurrency metrics & observability
│   ├── mcp/
│   │   ├── server.ts            — MCP Server, registers all tools
│   │   └── tools/
│   │       ├── navigate.ts      — Navigate to URL
│   │       ├── click.ts         — Click element by CSS
│   │       ├── type.ts          — Type text, optionally submit
│   │       ├── extract.ts       — Extract data from elements
│   │       ├── screenshot.ts    — Take page screenshot
│   │       ├── evaluate.ts      — Execute JS in page
│   │       ├── scroll.ts        — Scroll up/down/toBottom
│   │       ├── wait.ts          — Wait for selector/network/load/timeout
│   │       ├── smart-wait.ts    — Smart wait: DOM stable / condition / element count
│   │       ├── infinite-scroll.ts — Auto-scroll with new content detection
│   │       ├── shadow-dom.ts    — Shadow DOM piercing extract
│   │       ├── iframe.ts        — iframe switching
│   │       ├── frame-evaluate.ts — Execute JS in selected iframe
│   │       ├── frame-extract.ts — Extract text in selected iframe
│   │       └── spa-monitor.ts   — SPA route change monitoring
│   ├── healing/
│   │   ├── detector.ts          — Failure detection & classification
│   │   ├── diagnoser.ts         — Rule-based & LLM-based diagnosis
│   │   ├── executor.ts          — Healing execution loop (three-tier)
│   │   ├── anti-bot.ts          — Anti-bot detection & handling
│   │   ├── llm-provider.ts      — LLM abstraction (OpenAI/Claude/Gemini)
│   │   ├── semantic/
│   │   │   ├── fingerprint.ts   — Semantic Fingerprint extraction
│   │   │   ├── matcher.ts       — Deterministic element matching (scoring)
│   │   │   ├── repair-cache.ts  — Repair rule cache (zero-cost reuse)
│   │   │   ├── visual-anchor.ts — Visual fingerprint (position, size, color, shape)
│   │   │   ├── weight-store.ts  — Per-domain weight self-evolution
│   │   │   └── healer.ts        — Three-tier healer (cache→semantic+visual→LLM)
│   │   └── index.ts
│   ├── security/
│   │   └── url-policy.ts        — Navigation URL input policy
│   ├── observability/
│   │   └── audit-log.ts         — Bounded in-memory audit events
│   └── index.ts                 — Entry point
```

## Build & Run

```bash
npm install
npm run build          # Compile TypeScript
npm start              # Start MCP server (stdio transport)
npm run dev            # Watch mode
```

## MCP Tools

| Tool | Category | Description |
|------|----------|-------------|
| `session_create` | Session | Create a new browser session |
| `session_close` | Session | Close a session |
| `navigate` | Built-in | Navigate to URL |
| `click` | Built-in | Click element |
| `type` | Built-in | Type text |
| `extract` | Built-in | Extract data from elements |
| `screenshot` | Built-in | Take screenshot |
| `evaluate` | Built-in | Execute JS |
| `scroll` | Built-in | Scroll page |
| `wait` | Built-in | Wait for condition |
| `get_page_info` | Built-in | Get URL/title/HTML |
| `smart_wait` | Phase 2 | DOM stability / custom condition wait |
| `infinite_scroll` | Phase 2 | Auto-scroll + content detection |
| `shadow_extract` | Phase 2 | Shadow DOM piercing extract |
| `switch_frame` | Phase 2 | iframe switching |
| `frame_evaluate` | Phase 2 | Execute JavaScript in selected iframe |
| `frame_extract` | Phase 2 | Extract text in selected iframe |
| `spa_monitor` | Phase 2 | SPA route change monitoring |
| `self_healing_run` | Phase 3 | Execute action with auto-healing (diagnose → fix → retry) |
| `pool_stats` | Phase 4 | Pool utilization, queue depth, error rate, latency |
| `audit_events` | Observability | Bounded in-memory operation audit events; trusted local deployments only |

## Self-Healing Engine (Phase 3) — Core Innovation

**Three-tier deterministic healing (not LLM guessing):**

```
execute → fail → classify error → [Tier 1] cache lookup → [Tier 2] semantic match → [Tier 3] LLM → retry
```

| Tier | Method | Cost | Condition |
|------|--------|------|-----------|
| 1 | Repair Cache | No LLM call | A validated rule exists for the domain and original selector |
| 2 | DOM candidate matching | No LLM call | Cache misses and a candidate reaches the configured confidence |
| 3 | LLM Analysis | Provider-dependent | Deterministic matching does not produce a usable candidate and an LLM is configured |

**Semantic Matching**:
- Extract "semantic fingerprints" from DOM elements (text, role, behavior, structure, context)
- Score every element against a semantic query (what we're looking for, not where)
- Deterministic, reproducible, no LLM dependency
- Can help with DOM-level changes, but it is a heuristic rather than a correctness guarantee

**Visual reference support**:
- The cache can retain a visual artifact from a previously successful repair.
- When such an artifact exists, it contributes relative position, size, parent position, shape, and color to candidate ordering.
- It is not screenshot/image understanding and should not be described as a cross-template visual matcher.

**Dynamic Weighting** — context-aware scoring:

- Weights adjust based on element type (button vs input vs link vs submit)
- Button: text weight 4.5 (primary identifier), behavior weight 3.0
- Input: placeholder weight 4.5 (most stable), attributes weight 4.0
- Link: href weight 3.5, text weight 4.0
- Submit: submit weight 4.0, context weight 2.5

**Score Collision Detection** — tiebreaker when top matches are close:

- If top-2 scores differ by < 0.05, apply tiebreakers
- Tiebreakers consider visual-reference score (when available), stable attributes, and spatial signals.
- It reduces ambiguity but does not eliminate the risk of selecting a semantically similar element.

**Weight Self-Evolution** — learning from Tier 3 (LLM) repairs:

- When LLM succeeds but Tier 2 failed, analyze why: which signals were stronger for the correct element but had low weight?
- Adjust per-domain weights (learning rate: 10%, max adjustment: 2.0)
- Persist learned weights to the local state directory (survives restarts of the same deployment)
- Slow decay (1%) prevents overfitting to single examples
- Auto-reset if failure rate exceeds 2:1 ratio after adjustment

**Feedback Loop** — self-evolving behavior:

- A repaired selector is cached only after the action succeeds; verification failures do not create a new rule.
- Cache persists in the local state directory via `repair-cache.ts`.
- A cache hit avoids another LLM call, but selector resolution and action verification still run and can fail as the page changes.

**LLM Provider Config (env vars):**
- `LLM_PROVIDER` — "openai" | "claude" | "gemini" (default: "openai")
- `LLM_API_KEY` — API key
- `LLM_BASE_URL` — Custom endpoint (for DeepSeek, Ollama, etc.)
- `LLM_MODEL` — Model name
- `PHOENIX_LLM_TIMEOUT_MS` — request timeout in milliseconds (default: 30000)

**Local repair state:**
- Default directory: `.phoenix/` under the process working directory.
- Override with `PHOENIX_STATE_DIR`.
- This storage has no cross-process synchronization or tenant isolation.

**Safety boundaries:**
- Navigation accepts only absolute HTTP(S) URLs; by default it rejects private IPv4/IPv6 ranges, `.local`, common metadata hosts, and embedded URL credentials.
- Set `PHOENIX_ALLOW_PRIVATE_NETWORK=true` only for trusted local development. DNS rebinding remains the responsibility of egress policy/proxy in production.
- CAPTCHA solving and proxy rotation are not implemented. Detected CAPTCHA is returned as an unsupported failure for caller or human handling.

## High Concurrency (Phase 4)

**Task Queue** (`task-queue.ts`):
- Pool full → requests queue instead of error
- Configurable queue depth (default: 20) and timeout (default: 30s)
- FIFO order, auto-discard on timeout

**Session Mutex** (`session-mutex.ts`):
- Same session → operations serialize (no racing)
- Different sessions → fully parallel
- Promise chain: each op waits for previous to finish

**Session TTL** (`pool.ts`):
- Idle sessions auto-close after 10 minutes (configurable)
- Cleanup sweep every 60 seconds
- Prevents leaked sessions from filling the pool

**UUID Session IDs** (`server.ts`):
- `crypto.randomUUID()` instead of `Date.now()`
- No collision under concurrent creation

**Metrics** (`metrics.ts`):
- Active sessions, total operations, error rate
- Average latency, pool utilization, uptime
- Exposed via `pool_stats` MCP tool

**Audit log** (`observability/audit-log.ts`):
- Stores a bounded in-memory record of wrapped browser operations, including duration, outcome, and error text.
- Exposed via `audit_events`; do not expose this tool to untrusted tenants because error text can contain page or selector details.

## Tech Stack

- TypeScript, Playwright, @modelcontextprotocol/sdk, Zod
- LLM: OpenAI-compatible API / Claude / Gemini (any provider)
