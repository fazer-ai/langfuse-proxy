export interface ProxyRequestContext {
  traceId: string;
  startTime: number;
  method: string;
  path: string;
  requestBody: string;
  contentType: string;
  isStreaming: boolean;
  statusCode: number;
  latencyMs: number;
}

export interface ParsedResponse {
  model: string | null;
  content: string | null;
  /** Raw usage object from upstream — includes token detail breakdowns */
  usage: Record<string, unknown> | null;
  raw: unknown;
}
