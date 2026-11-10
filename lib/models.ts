export type ProviderId = "venice";

export type ModelInfo = {
  id: string;
  name: string;
  provider: string;
  providerId: ProviderId;
  description: string;
  category: "Frontier" | "Fast" | "Open";
  context: string;
  contextTokens: number;
  uncensored: boolean;
  traits: string[];
  deprecated?: boolean;
  deprecation?: {
    date?: string;
    removesAt?: string;
    replacementModelId?: string;
    autoRemap?: boolean;
  };
  inputPrice?: number;
  outputPrice?: number;
  maxCompletionTokens?: number;
  privacy?: string;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
  supportsFunctionCalling?: boolean;
  supportsWebSearch?: boolean;
  supportsE2EE?: boolean;
  supportsVideoInput?: boolean;
  supportsAudioInput?: boolean;
};
