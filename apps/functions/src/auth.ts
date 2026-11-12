import { jwtVerify } from "jose";
import { AdoClient, AdoHttpError } from "@ghazdo/shared";

export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export interface Caller {
  userId: string;
  /** Client bound to the caller's delegated token; used for every permission decision. */
  viewer: AdoClient;
}

export interface AuthOptions {
  organization: string;
  extensionSecret: string;
  issuer?: string;
  audience?: string;
  fetchFn?: typeof fetch;
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Verifies the extension app token (HS256 signed with the extension secret) and binds it to the delegated
 * viewer token: both must resolve to the same Azure DevOps identity in the configured organization.
 */
export async function authenticate(headers: { get(name: string): string | null }, opts: AuthOptions): Promise<Caller> {
  const auth = headers.get("authorization") ?? "";
  const appToken = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim();
  const viewerToken = headers.get("x-ado-access-token")?.trim();
  if (!appToken || !viewerToken) throw new AuthError(401, "Missing credentials.");

  let nameid: string;
  try {
    const { payload } = await jwtVerify(appToken, new TextEncoder().encode(opts.extensionSecret), {
      algorithms: ["HS256"],
      issuer: opts.issuer,
      audience: opts.audience,
      clockTolerance: 60,
      requiredClaims: ["exp"],
    });
    nameid = String(payload.nameid ?? "");
  } catch {
    throw new AuthError(401, "Invalid app token.");
  }
  if (!GUID_RE.test(nameid)) throw new AuthError(401, "Invalid app token subject.");

  const viewer = new AdoClient({ organization: opts.organization, getToken: async () => viewerToken, fetchFn: opts.fetchFn, maxRetries: 1 });
  let connected: { id: string };
  try {
    connected = await viewer.getConnectionData();
  } catch (err) {
    if (err instanceof AdoHttpError && (err.status === 401 || err.status === 403)) throw new AuthError(401, "Invalid viewer token.");
    throw err;
  }
  if (connected.id.toLowerCase() !== nameid.toLowerCase()) throw new AuthError(401, "Token identity mismatch.");
  return { userId: nameid.toLowerCase(), viewer };
}
