import { Buffer } from "node:buffer";
import crypto from "node:crypto";

export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare against self to keep constant time, then return false
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function jsonError(
  message: string,
  type: string,
  code: string,
  status: number,
): Response {
  return new Response(JSON.stringify({ error: { message, type, code } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
