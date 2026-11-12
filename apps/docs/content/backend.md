# Shared backend

The optional backend collects alerts for the whole organization every hour and keeps shared history for up to 365 days.

## Architecture

![Shared backend architecture: the extension calls a Function App over HTTPS; the Function App uses a user-assigned managed identity for Azure DevOps, Storage, Key Vault and Application Insights, with optional ACS Email for the weekly digest.](./images/backend-architecture.svg)

| Resource | Purpose |
| --- | --- |
| **Function App** (Flex Consumption, Linux, Node 22) | Hourly coordinator, queue-driven repository collectors, daily retention, HTTP API for the extension |
| **User-assigned managed identity** | Calls Azure DevOps and accesses Storage, Key Vault and App Insights without keys. The only connection string is the optional ACS Email one, kept in Key Vault. |
| **Storage account** (shared key disabled) | Snapshots (blobs, 370-day lifecycle), repository state and daily observations (tables), work queue |
| **Key Vault** (RBAC) | Extension secret, cursor signing key, and optional ACS email connection string |
| **Application Insights + Log Analytics** | Telemetry, local auth disabled |

All of it is defined in `infra/main.bicep`. Release packages include the compiled ARM template.

### Functions

| Function | Trigger | What it does |
| --- | --- | --- |
| `health`, `me`, `config`, `dashboard`, `alerts`, `collect` | HTTP, `/api/<name>` | Extension API. Every route except `health` authenticates the caller. |
| `collectCoordinator` | Timer, every hour at :05 | Lists projects and repositories, then queues one message per repository |
| `collectWorker` | Queue `collect-repos` | Collects one repository and publishes the result |
| `retention` | Timer, daily at 02:30 UTC | Deletes history and old snapshots past **Max history days** |
| `weeklyDigest` | Timer, Mondays at 09:00 UTC | Emails aggregate counts when recipients are configured |

### Data model

| Store | Contents |
| --- | --- |
| Blob `snapshots/{projectId}/{repositoryId}/{runId}.json.gz` | Immutable, gzip-compressed alert snapshot for one repository and run |
| Table `RepoState` | One row per repository: pointer to the current snapshot, last attempt, last status and error |
| Table `DailyObservations` | One row per repository per day with the counts used for trends |
| Table `DashboardConfig` | Max history days, remediation SLA and digest recipients |
| Table `CollectionRuns` | Run log: run ID, start time, trigger (`timer` or `manual`) and repository count |
| Queue `collect-repos` | Work items for repository collectors |

Snapshots store the same alert allowlist as the other modes; secret values, code snippets and file paths are never stored. See [What is stored](#/data-modes#what-is-stored).

## Collection flow

![Collection flow: trigger, plan the run, fan out to the queue, collect each repository, then publish success or keep the previous snapshot on failure. Retention and the weekly digest run on their own schedules.](./images/backend-collection-flow.svg)

1. **Trigger.** The hourly timer, or a Project Collection Administrator selecting **Collect now** (`POST /api/collect`), starts a run.
2. **Plan.** Using the managed identity, the coordinator lists every project and repository it can see, removes repositories that no longer exist from `RepoState`, and records the run in `CollectionRuns`.
3. **Fan out.** One queue message per repository. Workers validate message IDs and drop malformed messages.
4. **Collect.** Each worker checks Advanced Security enablement, then lists the repository's alerts. The queue processes 8 messages per batch, retries a message up to 3 times, and each invocation times out after 10 minutes.
5. **Publish.** A successful result (`ok` or `disabled`) is written to a new snapshot blob first; only then does the `RepoState` pointer move to it, and today's `DailyObservations` row is merged. Readers never see a half-written repository.
6. **Failure.** A `denied`, `notFound` or `failed` result keeps the previous pointer and records the status and error. The dashboard shows that repository's last good data as stale, never as zero alerts. One failing repository does not affect the others.

**Retention** removes observations older than **Max history days** and every snapshot blob past that cutoff except each repository's current one. A storage lifecycle rule deletes any blob older than 370 days as a backstop.

**Weekly digest** aggregates the latest snapshots for the whole organization over 7 days and sends counts and top-project risk scores. It is skipped when there are no recipients, and fails visibly if recipients exist but ACS Email or the sender is not configured.

The backend only reads alerts. It never changes alert state in Azure DevOps.

## Request flow

![Request flow: the extension sends an app token and the user's token; the API verifies the app token, checks the user token belongs to the same identity, determines which repositories the user can read with their own token, then aggregates only those.](./images/backend-request-flow.svg)

Every authenticated request carries two tokens: the extension **app token** (`Authorization: Bearer`) and the user's **Azure DevOps access token** (`X-ADO-Access-Token`).

1. **Verify the app token.** HS256 signature with the extension secret, expiry, and the optional issuer and audience.
2. **Bind the user token.** The API calls Azure DevOps connection data with the user's token. The returned identity must equal the app token's subject, otherwise the request fails with `401`.
3. **Resolve access.** With the user's own token, the API lists projects and repositories and probes the Advanced Security alerts endpoint for each collected repository (8 in parallel). Repositories the user cannot read are excluded; ones that cannot be checked are reported as *unverified*. Nothing is cached across requests.
4. **Aggregate.** Only allowed repositories' snapshots and history are loaded and aggregated with the requested filters and remediation SLA.

Endpoint rules:

| Endpoint | Method | Access |
| --- | --- | --- |
| `/api/health` | GET | Anonymous. Returns status and organization name only. |
| `/api/me` | GET | Signed-in user. Returns user ID and whether they are a Project Collection Administrator. |
| `/api/dashboard` | POST | Signed-in user. Aggregates for the organization or one project. |
| `/api/alerts` | POST | Signed-in user. Pages of up to 200 alerts. The next-page cursor is HMAC-signed, bound to the user and query, and valid for 15 minutes. |
| `/api/config` | GET, PUT | GET for any signed-in user (recipient addresses only for administrators). PUT for Project Collection Administrators. |
| `/api/collect` | POST | Project Collection Administrators |

Requests from origins outside `ALLOWED_ORIGINS` get no CORS headers, bodies over 64 KB are rejected, and errors map to `400`, `401`/`403`, `503` when Azure DevOps throttles, or `500` without internal details.

## Deploy

```powershell
az group create -n rg-ghazdo -l westeurope
az deployment group create -g rg-ghazdo -f infra/main.bicep `
  -p adoOrganization=contoso `
  -p allowedOrigins="['https://<publisher>.gallerycdn.vsassets.io']" `
  -p extensionSecret=$env:EXT_SECRET

az functionapp deployment source config-zip -g rg-ghazdo -n <functionAppName> --src functions.zip
```

`functions.zip` is attached to every release, or built with `npm run package:functions`.

### Optional weekly digest email

The digest runs every Monday at 09:00 UTC. Configure an Azure Communication Services Email resource and verify its sender domain/address first, then deploy with:

```powershell
az deployment group create -g rg-ghazdo -f infra/main.bicep `
  -p adoOrganization=contoso `
  -p allowedOrigins="['https://<publisher>.gallerycdn.vsassets.io']" `
  -p acsEmailConnectionString=$env:ACS_EMAIL_CONNECTION_STRING `
  -p digestSenderAddress='security@example.com'
```

In **Security dashboard → Settings**, configure up to 20 recipients. Addresses stay in the shared backend and are returned only to Project Collection Administrators. Messages contain aggregate counts and top-project risk scores, not alert titles, dismissal actors, or secret metadata. If recipients are configured without a verified sender and ACS connection, the timer reports an error instead of silently claiming delivery.

## Connect it

1. **Give the managed identity access to Azure DevOps.** Add the `managedIdentityClientId` output as a user in the organization, with read access to projects and repositories and *Advanced Security: Read alerts*.
2. **Set the extension secret.** This is the Marketplace extension certificate, used to validate the app tokens the extension sends. Pass it at deployment or set the `extension-secret` Key Vault secret later.
3. **Build the extension with the backend allowed.** Set `VITE_BACKEND_ALLOWLIST` (or the repository variable of the same name for CI builds) to the `backendUrl` origin.
4. **Point the dashboard at it.** In **Security dashboard → Settings**, set **Backend URL** to the `backendUrl` output and choose **Test connection**.

## App settings

| Setting | Purpose |
| --- | --- |
| `ADO_ORGANIZATION` | Organization to collect |
| `STORAGE_ACCOUNT_NAME`, `AZURE_CLIENT_ID` | Identity-based storage access |
| `EXTENSION_SECRET`, `CURSOR_SIGNING_KEY` | Key Vault references |
| `ALLOWED_ORIGINS` | CORS allowlist |
| `APP_TOKEN_ISSUER`, `APP_TOKEN_AUDIENCE` | Optional extra token checks |
| `COLLECTOR_CONCURRENCY` | Parallel repository collectors |
| `ACS_EMAIL_CONNECTION_STRING`, `DIGEST_SENDER_ADDRESS` | Optional weekly email delivery; set both only after verifying the sender in ACS Email |
