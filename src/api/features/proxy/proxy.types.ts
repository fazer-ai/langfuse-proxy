export interface ProxyRequestContext {
  traceId: string;
  sessionId?: string;
  userId?: string;
  langfuseTags?: string[];
  langfuseMetadata?: Record<string, string>;
  startTime: number;
  method: string;
  path: string;
  requestBody: string;
  contentType: string;
  responseContentType: string;
  isStreaming: boolean;
  statusCode: number;
  latencyMs: number;
  provider?: "openai" | "anthropic" | "gemini";
}

export interface ParsedResponse {
  model: string | null;
  content: string | null;
  /** Raw usage object from upstream — includes token detail breakdowns */
  usage: Record<string, unknown> | null;
  raw: unknown;
}
