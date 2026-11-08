export type ProviderId = "venice";
export type ModelInfo = {
  id: string; name: string; provider: string; providerId: ProviderId;
  description: string; category: "Frontier" | "Fast" | "Open"; context: string;
  uncensored?: boolean; deprecated?: boolean; inputPrice?: number; outputPrice?: number;
};
export const models: ModelInfo[] = [
  {id:"deepseek-v4-1-flash-uncensored",name:"DeepSeek V4.1 Flash Uncensored",provider:"Venice AI",providerId:"venice",description:"Uncensored · Reasoning · Vision · Code",category:"Fast",context:"1M",uncensored:true},
  {id:"kimi-k2-5",name:"Kimi K2.5",provider:"Venice AI",providerId:"venice",description:"Reasoning · Vision · Code · Retiring",category:"Frontier",context:"256K",deprecated:true},
  {id:"claude-fable-5-1",name:"Claude Fable 5.1",provider:"Venice AI",providerId:"venice",description:"Reasoning · Vision · Code",category:"Frontier",context:"1M"},
  {id:"z-ai-glm-5-3-flash",name:"GLM 5.3 Flash",provider:"Venice AI",providerId:"venice",description:"Fast · Reasoning · Vision · Code",category:"Fast",context:"1049K"},
  {id:"grok-4-6",name:"Grok 4.6",provider:"Venice AI",providerId:"venice",description:"Reasoning · Vision · Code",category:"Frontier",context:"500K"},
  {id:"deepseek-v4-1-flash-1017-uncensored",name:"DeepSeek V4.1 Flash (1017) Uncensored",provider:"Venice AI",providerId:"venice",description:"Uncensored · Reasoning · Vision · Code",category:"Fast",context:"1M",uncensored:true},
  {id:"claude-opus-5",name:"Claude Opus 5",provider:"Venice AI",providerId:"venice",description:"Reasoning · Vision · Code",category:"Frontier",context:"1M"},
  {id:"claude-sonnet-5",name:"Claude Sonnet 5",provider:"Venice AI",providerId:"venice",description:"Reasoning · Vision · Code",category:"Frontier",context:"1M"},
  {id:"kimi-k3",name:"Kimi K3",provider:"Venice AI",providerId:"venice",description:"Reasoning · Vision · Code",category:"Frontier",context:"1M"},
  {id:"grok-4-3",name:"Grok 4.3",provider:"Venice AI",providerId:"venice",description:"Reasoning · Vision",category:"Frontier",context:"1M"},
  {id:"claude-opus-4-7",name:"Claude Opus 4.7",provider:"Venice AI",providerId:"venice",description:"Reasoning · Vision · Code",category:"Frontier",context:"1M"},
  {id:"claude-sonnet-4-6",name:"Claude Sonnet 4.6",provider:"Venice AI",providerId:"venice",description:"Reasoning · Vision · Code",category:"Frontier",context:"1M"}
];