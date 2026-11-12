# FAQ and limitations

### Why is my trend chart shaded?

In browser-only mode history only exists for days on which someone opened the dashboard. Days with incomplete data are shaded. Enable [per-user history](#/data-modes) to keep your own history across browsers, or deploy the [shared backend](#/backend) for complete organization history.

### Why do colleagues see different numbers?

In browser modes each user collects with their own permissions. Someone without access to a repository will not see its alerts.

### A widget says *Not collected yet*

Widgets only read data that was already collected. Open the Security dashboard (or the project's *Advanced Security* page in the left menu) and select **Collect now**, or connect the shared backend.

### Repositories are current, but alerts are missing after collection

The dashboard fetches each secret-confidence level separately, without branch filters, while retaining all-branch collection for other alert types. If alerts are missing, clear the dashboard filters, select **Collect now**, and check Data freshness and any collection warnings. Verify that the same repository shows alerts in the built-in Azure DevOps Advanced Security page and that you have *Advanced Security: Read alerts* permission.

If you use the shared backend, rebuild and redeploy the Functions package as well; its collector uses the same API client.

### Can I use it on Azure DevOps Server?

No. The extension targets Azure DevOps Services, where GitHub Advanced Security for Azure DevOps is available.

### Does it show secret values?

No. Secret values, code snippets and file paths are never fetched into storage or displayed.

## Not yet verified against a live organization

These parts are implemented from documentation and covered by tests, but have not been exercised end-to-end:

- The `iss` and `aud` values of extension app tokens. `APP_TOKEN_ISSUER` and `APP_TOKEN_AUDIENCE` are optional and skipped when empty.
- The Graph-based Project Collection Administrators check.
- The error shape for extension-data `__etag` conflicts (detection matches 409/412 and `InvalidDocumentVersion`).
- The widget-to-hub deep link format and how the organization navigation and Organization settings entries render.

Please open an issue if you see different behavior.
