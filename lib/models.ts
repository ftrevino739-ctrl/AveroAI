export type ProviderId = "openai" | "anthropic" | "google" | "openrouter" | "custom" | "community";
export type ModelInfo = { id:string; name:string; provider:string; providerId:ProviderId; description:string; category:"Frontier"|"Fast"|"Open"; context:string };
export const models: ModelInfo[] = [
  {id:"gpt-4o",name:"GPT-4o",provider:"OpenAI",providerId:"openai",description:"Versatile multimodal assistant",category:"Frontier",context:"128K"},
  {id:"claude-sonnet-4-5",name:"Claude Sonnet 4.5",provider:"Anthropic",providerId:"anthropic",description:"Writing, analysis and coding",category:"Frontier",context:"200K"},
  {id:"gemini-2.5-flash",name:"Gemini 2.5 Flash",provider:"Google",providerId:"google",description:"Fast multimodal reasoning",category:"Fast",context:"1M"},
  {id:"deepseek/deepseek-chat",name:"DeepSeek Chat",provider:"OpenRouter",providerId:"openrouter",description:"General reasoning and coding",category:"Open",context:"Provider dependent"},
  {id:"qwen/qwen3-32b",name:"Qwen 3 32B",provider:"OpenRouter",providerId:"openrouter",description:"Open-weight reasoning and code",category:"Open",context:"Provider dependent"},
  {id:"x-ai/grok-3-mini",name:"Grok 3 Mini",provider:"OpenRouter",providerId:"openrouter",description:"Fast reasoning",category:"Fast",context:"Provider dependent"}
];
