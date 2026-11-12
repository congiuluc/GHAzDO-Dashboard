# Dashboards

The extension adds two hubs. Both share the same tabs, filters and drill-down; the project dashboard is simply locked to one project.

| Hub | Location | Scope |
| --- | --- | --- |
| **Security dashboard** | Organization → *Advanced Security* | Every project and repository you can read. Includes the **Settings** tab for organization admins. |
| **Advanced Security overview** | Project → *Repos* | The current project. The project filter is hidden; repository filters and drill-down still work. |

## Guided tour

The first time you open each dashboard, a short tour walks through the header actions, filters, breadcrumb, key numbers, drill-down, data freshness and tabs. Use **Next** and **Back** to move between steps. Select **Skip tour**, close the bubble, or press **Esc** to stop. Select **Take the tour** in the header to replay it at any time.

The organization and project tours are tracked separately in your browser's local storage, so clearing site data will show the tour again.

## Overview tab

The landing view combines all alert types.

- **KPIs:** open alerts, critical + high open, new and fixed in the last 7 days (with the change against the previous 7 days).
- **Open alerts by severity**, **by type** (code, dependencies, secrets) and **alerts by state**.
- **Open alerts trend** and **alerts by state over time** for the selected period. Shaded days have partial data.
- **Riskiest projects** and **riskiest repositories**, ranked by a weighted score: critical 10, high 5, medium 2, low 1.
- **Severity heatmap** by project (organization) or by repository (project or a single project selected).
- **New vs fixed per week**, **mean time to fix** and **open alert age**.
- **Oldest critical and high alerts**, with a direct link to each alert.
- **Data freshness**: when data was last collected and how many repositories are current.

## Code scanning tab

- **Top code scanning rules** and **code scanning tools** (for example CodeQL).
- Severity, trend and age for code alerts only.

## Dependencies tab

- **Most vulnerable packages**, with the number of affected repositories.
- **Ecosystems** (npm, NuGet, Maven, pip and others) and **top advisories** (CVE / GHSA IDs).
- **Fix availability**: how many open alerts already have a patched version.

Ecosystem and advisory panels show *not reported* when the alert API does not return those fields.

## Secrets tab

- **Open secrets** count, with **secret validity** where the scanner reports it.
- **Open secret age**, highlighting secrets exposed for more than 7 days.
- **Repositories with exposed secrets** and **secret types**.
- **Secrets detected vs closed per week**.

Secret values are never fetched or stored; only the secret type and alert metadata are shown.

## Coverage tab

- **Repository coverage**: for each repository, whether code, dependency and secret scanning report data.
- **Where data comes from**: browser, per-user history or shared backend.

## Alerts tab

A sortable, paged table of the alerts matching the current filters, with links to the alert in Azure Repos. Project and repository names in each row are drill-down links.

## Settings tab

Organization dashboard only, visible to Project Collection Administrators. See [Data and history](#/data-modes).
