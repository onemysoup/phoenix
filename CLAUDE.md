# Phoenix

MCP-based high-concurrency self-healing browser agent system.

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
| `spa_monitor` | Phase 2 | SPA route change monitoring |
| `self_healing_run` | Phase 3 | Execute action with auto-healing (diagnose → fix → retry) |
| `pool_stats` | Phase 4 | Pool utilization, queue depth, error rate, latency |

## Self-Healing Engine (Phase 3) — Core Innovation

**Three-tier deterministic healing (not LLM guessing):**

```
execute → fail → classify error → [Tier 1] cache lookup → [Tier 2] semantic match → [Tier 3] LLM → retry
```

| Tier | Method | Speed | Cost | Accuracy |
|------|--------|-------|------|----------|
| 1 | Repair Cache | ~0ms | $0 | Exact (past fixes) |
| 2 | Semantic Matching | ~50ms | $0 | High (DOM fingerprint scoring) |
| 3 | LLM Analysis | ~2s | ~$0.01 | High (last resort) |

**Semantic Matching** — the core innovation:
- Extract "semantic fingerprints" from DOM elements (text, role, behavior, structure, context)
- Score every element against a semantic query (what we're looking for, not where)
- Deterministic, reproducible, no LLM dependency
- Survives page redesigns because it matches meaning, not syntax

**Multi-Dimensional Matching** — Tier 2 combines two fingerprint types:
- **Semantic** (weight 0.65): text, tag, role, behavior, attributes, structure, context
- **Visual** (weight 0.35): relative position, size, shape, color, parent layout
- Single DOM pass extracts both fingerprints simultaneously
- Combined score: `semantic × 0.65 + visual × 0.35`
- Visual features are stable even when DOM classes/IDs change

**Dynamic Weighting** — context-aware scoring:

- Weights adjust based on element type (button vs input vs link vs submit)
- Button: text weight 4.5 (primary identifier), behavior weight 3.0
- Input: placeholder weight 4.5 (most stable), attributes weight 4.0
- Link: href weight 3.5, text weight 4.0
- Submit: submit weight 4.0, context weight 2.5

**Score Collision Detection** — tiebreaker when top matches are close:

- If top-2 scores differ by < 0.05, apply tiebreakers
- Tiebreakers: prefer stable attributes (data-testid > id > aria-label), fewer classes, shallower DOM depth
- Prevents fragile selectors from winning over robust ones

**Weight Self-Evolution** — learning from Tier 3 (LLM) repairs:

- When LLM succeeds but Tier 2 failed, analyze why: which signals were stronger for the correct element but had low weight?
- Adjust per-domain weights (learning rate: 10%, max adjustment: 2.0)
- Persist learned weights to disk (survives restarts)
- Slow decay (1%) prevents overfitting to single examples
- Auto-reset if failure rate exceeds 2:1 ratio after adjustment

**Feedback Loop** — self-evolving behavior:

- Tier 3 (LLM) successful repairs are cached into Tier 1
- Cache persists to disk via `repair-cache.ts`
- Same failure pattern resolved instantly on subsequent occurrences

**LLM Provider Config (env vars):**
- `LLM_PROVIDER` — "openai" | "claude" | "gemini" (default: "openai")
- `LLM_API_KEY` — API key
- `LLM_BASE_URL` — Custom endpoint (for DeepSeek, Ollama, etc.)
- `LLM_MODEL` — Model name

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

## Tech Stack

- TypeScript, Playwright, @modelcontextprotocol/sdk, Zod
- LLM: OpenAI-compatible API / Claude / Gemini (any provider)
