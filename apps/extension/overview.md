# Advanced Security Dashboard

One place to see **GitHub Advanced Security for Azure DevOps** alerts across every project and repository in your organization.

## Highlights

- **Organization dashboard** under *Advanced Security → Security dashboard*, and a **project dashboard** under *Advanced Security* in each project's left menu (after Artifacts).
- **Code scanning, dependency scanning and secret scanning** in one view, with a dedicated tab for each.
- **Filter and drill down everywhere**: by project, repository, alert type, severity, state, period and text. Every chart, bar and table row narrows the view, and the URL keeps the filters so a view can be shared.
- **History and trends**: open alerts over time, new vs fixed per week, time to fix, alert age, and secret exposure age.
- **Coverage**: which repositories have code, dependency and secret scanning enabled.
- **Dashboard widgets**: summary, severity, top repositories and exposed secrets.

## How data is collected

| Mode | Where data lives | History |
| --- | --- | --- |
| Browser-only (default) | Each user's browser (IndexedDB), using that user's own permissions | Per user. Optionally saved to the user's private Azure DevOps extension data so it follows them across browsers. |
| Shared backend (optional) | An Azure Function App and Storage account you deploy | Organization-wide, shared, collected on a schedule |

Users only ever see alerts for repositories they are allowed to read.

Secret values, code snippets and file locations are never stored.

## Permissions

`vso.advsec` (read alerts), `vso.project`, `vso.code`, `vso.graph` (admin check for settings) and `vso.extension.data_write` (settings and optional per-user history).
