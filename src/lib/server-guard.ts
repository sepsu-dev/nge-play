import { headers } from "next/headers";
import { isIP } from "node:net";

/**
 * Guard untuk Server Actions yang memanggil layanan eksternal (YouTube, lrclib).
 * In-memory per instance — cukup untuk single-node; pakai Redis/edge limiter
 * kalau deploy multi-instance.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 20_000;

export function takeRateLimit(
  key: string,
  limit: number,
  windowMs = 60_000,
  now = Date.now()
): boolean {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_KEYS) buckets.clear();
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function sanitizeIp(raw: unknown): string {
  const ip = typeof raw === "string" ? raw.trim() : "";
  return isIP(ip) ? ip : "";
}

export async function getClientIp(): Promise<string> {
  try {
    const h = await headers();
    const forwarded = (h.get("x-forwarded-for") || "").split(",")[0] || "";
    return sanitizeIp(
      h.get("cf-connecting-ip") || h.get("x-real-ip") || forwarded
    );
  } catch {
    return "";
  }
}
