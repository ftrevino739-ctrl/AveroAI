export type ProviderId = "venice";
export type ModelInfo = {
  id: string;
  name: string;
  provider: string;
  providerId: ProviderId;
  description: string;
  category: "Frontier" | "Fast" | "Open";
  context: string;
  uncensored: boolean;
  deprecated?: boolean;
  inputPrice?: number;
  outputPrice?: number;
  maxCompletionTokens?: number;
  privacy?: string;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
  supportsFunctionCalling?: boolean;
};
