import type { HttpRequest, HttpResponseInit } from "@azure/functions";
import { AdoHttpError } from "@ghazdo/shared";
import { AuthError } from "./auth.js";
import { BadRequestError } from "./service.js";

const MAX_BODY = 64 * 1024;

export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const base: Record<string, string> = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
  };
  if (origin && allowed.includes(origin.toLowerCase().replace(/\/+$/, ""))) {
    base["Access-Control-Allow-Origin"] = origin;
    base["Access-Control-Allow-Headers"] = "Authorization, Content-Type, X-ADO-Access-Token";
    base["Access-Control-Allow-Methods"] = "GET, POST, PUT, OPTIONS";
    base["Access-Control-Max-Age"] = "600";
  }
  return base;
}

export async function readJson(req: HttpRequest): Promise<unknown> {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new BadRequestError("Request body too large.");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequestError("Invalid JSON.");
  }
}

export function json(status: number, body: unknown, headers: Record<string, string>): HttpResponseInit {
  return { status, jsonBody: body, headers: { ...headers, "Content-Type": "application/json" } };
}

/** Maps errors to safe responses; internal details are logged, never returned. */
export function errorResponse(err: unknown, headers: Record<string, string>, log: (msg: string) => void): HttpResponseInit {
  if (err instanceof AuthError) return json(err.status, { error: err.message }, headers);
  if (err instanceof BadRequestError) return json(400, { error: err.message }, headers);
  if (err instanceof AdoHttpError && err.status === 429) return json(503, { error: "Azure DevOps is throttling requests. Try again shortly." }, headers);
  log(`Unhandled error: ${(err as Error)?.stack ?? String(err)}`);
  return json(500, { error: "Internal error." }, headers);
}
