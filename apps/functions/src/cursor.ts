import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface CursorPayload {
  offset: number;
  user: string;
  query: string;
  exp: number;
}

export function queryHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("base64url");
}

function sign(key: string, body: string): string {
  return createHmac("sha256", key).update(body).digest("base64url");
}

export function encodeCursor(key: string, offset: number, user: string, query: string, ttlSeconds = 900, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ offset, user, query, exp: Math.floor(now / 1000) + ttlSeconds } satisfies CursorPayload)).toString("base64url");
  return `${body}.${sign(key, body)}`;
}

/** Returns the offset only when the cursor is authentic, unexpired and bound to the same user and query. */
export function decodeCursor(key: string, cursor: string, user: string, query: string, now = Date.now()): number | null {
  const [body, sig] = cursor.split(".");
  if (!body || !sig || cursor.length > 1024) return null;
  const expected = Buffer.from(sign(key, body));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as CursorPayload;
    if (p.user !== user || p.query !== query || p.exp * 1000 < now) return null;
    return Number.isInteger(p.offset) && p.offset >= 0 ? p.offset : null;
  } catch {
    return null;
  }
}
