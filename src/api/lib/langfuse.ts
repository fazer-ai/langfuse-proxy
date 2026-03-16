import { Langfuse } from "langfuse";
import config from "@/config";

let client: Langfuse | null = null;

export function getLangfuseClient(): Langfuse | null {
  if (!config.langfusePublicKey || !config.langfuseSecretKey) return null;
  if (!client) {
    client = new Langfuse({
      baseUrl: config.langfuseBaseUrl || undefined,
      publicKey: config.langfusePublicKey,
      secretKey: config.langfuseSecretKey,
    });
  }
  return client;
}

export async function shutdownLangfuse() {
  if (client) await client.shutdownAsync();
}
