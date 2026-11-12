# Data and history

Alerts always come from the Azure DevOps Advanced Security REST API. What changes between modes is **who collects** them and **where history is kept**.

| Mode | Collection | History | Visible to |
| --- | --- | --- | --- |
| **Browser-only** (default) | In each user's browser, with their own token | IndexedDB, per organization and user | That user |
| **Browser + per-user history in Azure DevOps** | Same as above | Daily summaries in User-scoped extension data; IndexedDB becomes a cache | That user, on any browser |
| **Shared backend** | Azure Functions, hourly, with a managed identity | Azure Storage, up to 365 days | Everyone, filtered to what they can read |

## Browser-only

Nothing to deploy. Select **Collect now** in the dashboard to fetch alerts. History builds up only on days a user collects, so trends have gaps when no collection ran. Gaps are shaded as partial data.

## Per-user history in Azure DevOps

1. An organization admin opens **Security dashboard → Settings** and enables **Allow users to save history in Azure DevOps**.
2. Each user opts in from the same tab.

Only daily counts are saved (no alert details). Writes use optimistic concurrency, so two open tabs merge instead of overwriting each other. Users can purge their saved history at any time.

## Shared backend

Recommended when you want complete, organization-wide history and fast first loads. See [Shared backend](#/backend).

## Settings reference

| Setting | Default | Who |
| --- | --- | --- |
| **Backend URL** | empty (browser-only) | Organization admin. Must match the build-time allowlist. |
| **Max history days** | 90 (1–365) | Organization admin |
| **Allow users to save history in Azure DevOps** | off | Organization admin |
| **Save my history in Azure DevOps** | off | Each user |
| **Remediation SLA** | Critical 7, high 30, medium 90 days | Organization admin |
| **Weekly digest recipients** | none | Organization admin; shared backend only |

## What is stored

Only an allowlist of alert metadata: IDs, title, rule or package, severity, state, type, dates, project and repository. Dismissal reason and the dismisser's display name may also be retained; dismissal comments and identity IDs are not. **Secret values, code snippets and file paths are never stored**, in any mode.
