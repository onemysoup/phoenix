import assert from "node:assert/strict";

const originalFetch = globalThis.fetch;
const originalEnv = {
  provider: process.env.LLM_PROVIDER,
  apiKey: process.env.LLM_API_KEY,
  baseUrl: process.env.LLM_BASE_URL,
  model: process.env.LLM_MODEL,
};

try {
  process.env.LLM_PROVIDER = "openai";
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_BASE_URL = "https://gateway.example/v1/";
  process.env.LLM_MODEL = "test-model";

  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({
      choices: [{ message: { content: "{\"newSelector\":\"#target\"}" } }],
      usage: { prompt_tokens: 12, completion_tokens: 4 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const { createLLMProvider } = await import("../src/healing/llm-provider.js");
  const provider = createLLMProvider();
  const response = await provider.chat([{ role: "user", content: "repair this selector" }], { temperature: 0.1, maxTokens: 128 });

  assert.equal(provider.name, "openai-compatible");
  assert.equal(response.content, "{\"newSelector\":\"#target\"}");
  assert.deepEqual(response.usage, { input: 12, output: 4 });
  assert.equal(calls[0].url, "https://gateway.example/v1/chat/completions");
  assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, "Bearer test-key");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    model: "test-model",
    messages: [{ role: "user", content: "repair this selector" }],
    temperature: 0.1,
    max_tokens: 128,
  });

  globalThis.fetch = async () => new Response("provider unavailable", { status: 503 });
  await assert.rejects(
    () => provider.chat([{ role: "user", content: "retry" }]),
    /LLM API error \(503\): provider unavailable/,
  );

  console.log("OpenAI-compatible LLM provider contract tests passed");
} finally {
  globalThis.fetch = originalFetch;
  process.env.LLM_PROVIDER = originalEnv.provider;
  process.env.LLM_API_KEY = originalEnv.apiKey;
  process.env.LLM_BASE_URL = originalEnv.baseUrl;
  process.env.LLM_MODEL = originalEnv.model;
}
