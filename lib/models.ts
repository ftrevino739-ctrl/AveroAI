export type ProviderId = "local";

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
  privacy?: string;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
  supportsFunctionCalling?: boolean;
  supportsWebSearch?: boolean;
  supportsE2EE?: boolean;
  supportsVideoInput?: boolean;
  supportsAudioInput?: boolean;
};
