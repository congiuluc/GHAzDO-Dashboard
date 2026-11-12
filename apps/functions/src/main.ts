import { app, output, type HttpRequest, type InvocationContext } from "@azure/functions";
import { DefaultAzureCredential, ManagedIdentityCredential, type TokenCredential } from "@azure/identity";
import { AdoClient } from "@ghazdo/shared";
import { authenticate, AuthError } from "./auth.js";
import { AzureStore } from "./azureStore.js";
import { collectOne, parseCollectMessage, planRun, runRetention } from "./collector.js";
import { loadCollectorConfig, loadConfig, type BackendConfig } from "./config.js";
import { corsHeaders, errorResponse, json, readJson } from "./http.js";
import { getAlerts, getConfig, getDashboard, isAdmin, putConfig, type ServiceDeps } from "./service.js";
import type { Store } from "./store.js";

const ADO_RESOURCE_SCOPE = "499b84ac-1321-427f-aa17-267ca6975798/.default";
const QUEUE = "collect-repos";

let credential: TokenCredential | undefined;
let store: Store | undefined;

function getCredential(clientId?: string): TokenCredential {
  credential ??= clientId ? new ManagedIdentityCredential({ clientId }) : new DefaultAzureCredential();
  return credential;
}

function getStore(cfg: { storageAccountName?: string; storageConnectionString?: string; managedIdentityClientId?: string }): Store {
  store ??= new AzureStore({
    accountName: cfg.storageAccountName,
    connectionString: cfg.storageConnectionString,
    credential: cfg.storageConnectionString ? undefined : getCredential(cfg.managedIdentityClientId),
  });
  return store;
}

function collectorClient(): AdoClient {
  const cfg = loadCollectorConfig();
  const cred = getCredential(cfg.managedIdentityClientId);
  return new AdoClient({
    organization: cfg.organization,
    getToken: async () => {
      const t = await cred.getToken(ADO_RESOURCE_SCOPE);
      if (!t) throw new Error("Could not acquire an Azure DevOps token for the managed identity.");
      return t.token;
    },
  });
}

const queueOutput = output.storageQueue({ queueName: QUEUE, connection: "AzureWebJobsStorage" });

type Handler = (req: HttpRequest, ctx: InvocationContext, cfg: BackendConfig, deps: ServiceDeps, headers: Record<string, string>) => Promise<unknown>;

function route(name: string, methods: ("GET" | "POST" | "PUT")[], handler: Handler, extra: { queue?: boolean } = {}) {
  app.http(name, {
    route: name.replace(/^api-/, "").replace(/-/g, "/"),
    methods: [...methods, "OPTIONS"],
    authLevel: "anonymous",
    extraOutputs: extra.queue ? [queueOutput] : [],
    handler: async (req, ctx) => {
      let headers: Record<string, string> = { "Cache-Control": "no-store" };
      try {
        const cfg = loadConfig();
        headers = corsHeaders(req.headers.get("origin"), cfg.allowedOrigins);
        if (req.method === "OPTIONS") return { status: 204, headers };
        const deps: ServiceDeps = { store: getStore(cfg), organization: cfg.organization, cursorKey: cfg.cursorKey };
        return json(200, await handler(req, ctx, cfg, deps, headers), headers);
      } catch (err) {
        return errorResponse(err, headers, (m) => ctx.error(m));
      }
    },
  });
}

const auth = (req: HttpRequest, cfg: BackendConfig) =>
  authenticate(req.headers, { organization: cfg.organization, extensionSecret: cfg.extensionSecret, issuer: cfg.issuer, audience: cfg.audience });

route("health", ["GET"], async (_req, _ctx, cfg) => ({ status: "ok", organization: cfg.organization }));

route("me", ["GET"], async (req, _ctx, cfg) => {
  const caller = await auth(req, cfg);
  return { userId: caller.userId, isCollectionAdmin: await isAdmin(caller) };
});

route("config", ["GET", "PUT"], async (req, _ctx, cfg, deps) => {
  const caller = await auth(req, cfg);
  if (req.method === "PUT") return putConfig(deps, caller, await readJson(req));
  return getConfig(deps);
});

route("dashboard", ["POST"], async (req, _ctx, cfg, deps) => getDashboard(deps, await auth(req, cfg), await readJson(req)));

route("alerts", ["POST"], async (req, _ctx, cfg, deps) => getAlerts(deps, await auth(req, cfg), await readJson(req)));

route(
  "collect",
  ["POST"],
  async (req, ctx, cfg, deps) => {
    const caller = await auth(req, cfg);
    if (!(await isAdmin(caller))) throw new AuthError(403, "Only Project Collection Administrators can start a collection.");
    const messages = await planRun(collectorClient(), deps.store, "manual");
    ctx.extraOutputs.set(queueOutput, messages);
    return { queued: messages.length };
  },
  { queue: true },
);

app.timer("collectCoordinator", {
  schedule: "0 5 * * * *",
  extraOutputs: [queueOutput],
  handler: async (_timer, ctx) => {
    const cfg = loadCollectorConfig();
    const messages = await planRun(collectorClient(), getStore(cfg), "timer");
    ctx.extraOutputs.set(queueOutput, messages);
    ctx.log(`Queued ${messages.length} repositories for collection.`);
  },
});

app.storageQueue("collectWorker", {
  queueName: QUEUE,
  connection: "AzureWebJobsStorage",
  handler: async (message, ctx) => {
    const msg = parseCollectMessage(message);
    if (!msg) {
      ctx.warn("Discarding malformed collection message.");
      return;
    }
    await collectOne(collectorClient(), getStore(loadCollectorConfig()), msg);
  },
});

app.timer("retention", {
  schedule: "0 30 2 * * *",
  handler: async (_timer, ctx) => {
    const result = await runRetention(getStore(loadCollectorConfig()));
    ctx.log(`Retention removed ${result.observations} observations and ${result.snapshots} snapshots.`);
  },
});
