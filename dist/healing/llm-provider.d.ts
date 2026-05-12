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
export interface LLMMessage {
    role: "system" | "user" | "assistant";
    content: string;
}
export interface LLMResponse {
    content: string;
    usage?: {
        input: number;
        output: number;
    };
}
export interface LLMProvider {
    readonly name: string;
    chat(messages: LLMMessage[], options?: {
        temperature?: number;
        maxTokens?: number;
    }): Promise<LLMResponse>;
}
export declare function createLLMProvider(): LLMProvider;
