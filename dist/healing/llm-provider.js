/**
 * LLM Provider Abstraction
 *
 * Supports any OpenAI-compatible API (OpenAI, DeepSeek, Qwen, Ollama, etc.)
 * plus native Claude API and Gemini API.
 *
 * Configuration via environment variables:
 *   LLM_PROVIDER    — "openai" | "claude" | "gemini" (default: "openai")
 *   LLM_API_KEY     — API key
 *   LLM_BASE_URL    — API base URL (for OpenAI-compatible endpoints)
 *   LLM_MODEL       — Model name (default: "gpt-4o")
 */
// ========== OpenAI-compatible provider ==========
class OpenAICompatibleProvider {
    name;
    baseUrl;
    apiKey;
    model;
    constructor(config) {
        this.name = "openai-compatible";
        this.baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
        this.apiKey = config.apiKey;
        this.model = config.model ?? "gpt-4o";
    }
    async chat(messages, options) {
        const resp = await fetch(`${this.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: this.model,
                messages,
                temperature: options?.temperature ?? 0.2,
                max_tokens: options?.maxTokens ?? 2048,
            }),
        });
        if (!resp.ok) {
            const body = await resp.text();
            throw new Error(`LLM API error (${resp.status}): ${body}`);
        }
        const data = await resp.json();
        return {
            content: data.choices[0]?.message?.content ?? "",
            usage: data.usage ? { input: data.usage.prompt_tokens, output: data.usage.completion_tokens } : undefined,
        };
    }
}
// ========== Claude (Anthropic) provider ==========
class ClaudeProvider {
    name = "claude";
    apiKey;
    model;
    baseUrl;
    constructor(config) {
        this.apiKey = config.apiKey;
        this.model = config.model ?? "claude-sonnet-4-20250514";
        this.baseUrl = (config.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "");
    }
    async chat(messages, options) {
        // Extract system message
        const systemMsg = messages.find((m) => m.role === "system")?.content ?? "";
        const nonSystemMsgs = messages.filter((m) => m.role !== "system");
        const resp = await fetch(`${this.baseUrl}/v1/messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": this.apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: this.model,
                system: systemMsg,
                messages: nonSystemMsgs.map((m) => ({ role: m.role, content: m.content })),
                max_tokens: options?.maxTokens ?? 2048,
                temperature: options?.temperature ?? 0.2,
            }),
        });
        if (!resp.ok) {
            const body = await resp.text();
            throw new Error(`Claude API error (${resp.status}): ${body}`);
        }
        const data = await resp.json();
        return {
            content: data.content?.[0]?.text ?? "",
            usage: data.usage ? { input: data.usage.input_tokens, output: data.usage.output_tokens } : undefined,
        };
    }
}
// ========== Gemini provider ==========
class GeminiProvider {
    name = "gemini";
    apiKey;
    model;
    constructor(config) {
        this.apiKey = config.apiKey;
        this.model = config.model ?? "gemini-2.0-flash";
    }
    async chat(messages, options) {
        // Convert messages to Gemini format
        const systemMsg = messages.find((m) => m.role === "system")?.content;
        const contents = messages
            .filter((m) => m.role !== "system")
            .map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
        }));
        const body = {
            contents,
            generationConfig: {
                temperature: options?.temperature ?? 0.2,
                maxOutputTokens: options?.maxTokens ?? 2048,
            },
        };
        if (systemMsg) {
            body.systemInstruction = { parts: [{ text: systemMsg }] };
        }
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`Gemini API error (${resp.status}): ${text}`);
        }
        const data = await resp.json();
        return {
            content: data.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
        };
    }
}
// ========== Factory ==========
export function createLLMProvider() {
    const provider = (process.env.LLM_PROVIDER ?? "openai").toLowerCase();
    const apiKey = process.env.LLM_API_KEY;
    if (!apiKey)
        throw new Error("LLM_API_KEY environment variable is required");
    const model = process.env.LLM_MODEL;
    const baseUrl = process.env.LLM_BASE_URL;
    switch (provider) {
        case "claude":
            return new ClaudeProvider({ apiKey, model, baseUrl });
        case "gemini":
            return new GeminiProvider({ apiKey, model });
        case "openai":
        default:
            return new OpenAICompatibleProvider({ apiKey, model, baseUrl });
    }
}
//# sourceMappingURL=llm-provider.js.map