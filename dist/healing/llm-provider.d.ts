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
