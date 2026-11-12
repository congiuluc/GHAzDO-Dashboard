import { assertOrganization, trimTrailingSlashes } from "@ghazdo/shared";

export interface BackendConfig {
  organization: string;
  extensionSecret: string;
  cursorKey: string;
  allowedOrigins: string[];
  issuer?: string;
  audience?: string;
  collectorConcurrency: number;
  storageAccountName?: string;
  storageConnectionString?: string;
  managedIdentityClientId?: string;
  emailConnectionString?: string;
  emailSenderAddress?: string;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name]?.trim();
  if (!v) throw new Error(`Missing required setting ${name}.`);
  return v;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  const cursorKey = required(env, "CURSOR_SIGNING_KEY");
  if (cursorKey.length < 32) throw new Error("CURSOR_SIGNING_KEY must be at least 32 characters.");
  return {
    organization: assertOrganization(required(env, "ADO_ORGANIZATION")),
    extensionSecret: required(env, "EXTENSION_SECRET"),
    cursorKey,
    allowedOrigins: (env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((o) => trimTrailingSlashes(o.trim()).toLowerCase())
      .filter((o) => o.startsWith("https://")),
    issuer: env.APP_TOKEN_ISSUER?.trim() || undefined,
    audience: env.APP_TOKEN_AUDIENCE?.trim() || undefined,
    collectorConcurrency: Math.min(Math.max(Number(env.COLLECTOR_CONCURRENCY) || 6, 1), 32),
    storageAccountName: env.STORAGE_ACCOUNT_NAME?.trim() || undefined,
    storageConnectionString: env.STORAGE_CONNECTION_STRING?.trim() || undefined,
    managedIdentityClientId: env.AZURE_CLIENT_ID?.trim() || undefined,
    emailConnectionString: env.ACS_EMAIL_CONNECTION_STRING?.trim() || undefined,
    emailSenderAddress: env.DIGEST_SENDER_ADDRESS?.trim() || undefined,
  };
}

/** Collector-only settings (timer/queue functions don't need the extension secret). */
export function loadCollectorConfig(env: NodeJS.ProcessEnv = process.env): Pick<
  BackendConfig,
  "organization" | "collectorConcurrency" | "storageAccountName" | "storageConnectionString" | "managedIdentityClientId" | "emailConnectionString" | "emailSenderAddress"
> {
  return {
    organization: assertOrganization(required(env, "ADO_ORGANIZATION")),
    collectorConcurrency: Math.min(Math.max(Number(env.COLLECTOR_CONCURRENCY) || 6, 1), 32),
    storageAccountName: env.STORAGE_ACCOUNT_NAME?.trim() || undefined,
    storageConnectionString: env.STORAGE_CONNECTION_STRING?.trim() || undefined,
    managedIdentityClientId: env.AZURE_CLIENT_ID?.trim() || undefined,
    emailConnectionString: env.ACS_EMAIL_CONNECTION_STRING?.trim() || undefined,
    emailSenderAddress: env.DIGEST_SENDER_ADDRESS?.trim() || undefined,
  };
}
