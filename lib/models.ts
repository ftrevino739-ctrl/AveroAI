export type ProviderId = "openai" | "anthropic" | "google" | "openrouter" | "custom";

export const models = [
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", providerId: "openai" as ProviderId, description: "Versatile · Multimodal" },
  { id: "claude-sonnet-4-5", name: "Claude Sonnet", provider: "Anthropic", providerId: "anthropic" as ProviderId, description: "Reasoning · Writing" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "Google", providerId: "google" as ProviderId, description: "Fast · Multimodal" },
  { id: "deepseek-chat", name: "DeepSeek Chat", provider: "OpenRouter", providerId: "openrouter" as ProviderId, description: "Coding · Analysis" },
  { id: "qwen/qwen3-32b", name: "Qwen 3", provider: "OpenRouter", providerId: "openrouter" as ProviderId, description: "Reasoning · Coding" },
  { id: "x-ai/grok-3-mini", name: "Grok Mini", provider: "OpenRouter", providerId: "openrouter" as ProviderId, description: "Fast · General" }
];

export function providerReady(provider: ProviderId) {
  if (provider === "openai") return Boolean(process.env.OPENAI_API_KEY);
  if (provider === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY);
  if (provider === "google") return Boolean(process.env.GOOGLE_API_KEY);
  if (provider === "openrouter") return Boolean(process.env.OPENROUTER_API_KEY);
  return Boolean(process.env.CUSTOM_API_KEY && process.env.CUSTOM_BASE_URL);
}
