# Data and history

Alerts always come from the Azure DevOps Advanced Security REST API. What changes between modes is **who collects** them and **where history is kept**.

| Mode | Collection | History | Visible to |
| --- | --- | --- | --- |
| **Browser-only** (default) | In each user's browser, with their own token | IndexedDB, per organization and user | That user |
| **Browser + per-user history in Azure DevOps** | Same as above | Daily summaries in User-scoped extension data; IndexedDB becomes a cache | That user, on any browser |
| **Shared backend** | Azure Functions, hourly, with a managed identity | Azure Storage, up to 365 days | Everyone, filtered to what they can read |

## Browser-only

Nothing to deploy. History builds up from the days a user opens the dashboard, so trends have gaps when nobody looked. Gaps are shaded as partial data.

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

## What is stored

Only an allowlist of alert metadata: IDs, title, rule or package, severity, state, type, dates, project and repository. **Secret values, code snippets and file paths are never stored**, in any mode.
