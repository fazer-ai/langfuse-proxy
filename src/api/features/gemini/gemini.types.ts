export interface GeminiPart {
  text?: string;
}

export interface GeminiContent {
  parts: GeminiPart[];
  role: string;
}

export interface GeminiCandidate {
  content: GeminiContent;
  finishReason: string;
}

export interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
  cachedContentTokenCount?: number;
  thoughtsTokenCount?: number;
}

export interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  modelVersion?: string;
  responseId?: string;
}
