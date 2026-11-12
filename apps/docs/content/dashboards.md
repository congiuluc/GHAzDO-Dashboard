# Dashboards

The extension provides organization-wide and project dashboards. The organization dashboard is also available from Organization settings. Both scopes share the same tabs, filters and drill-down; the project dashboard is simply locked to one project.

| Hub | Location | Scope |
| --- | --- | --- |
| **Security dashboard** | Organization → *Advanced Security* | Every project and repository you can read. Includes the **Settings** tab for organization admins. |
| **Advanced Security dashboard** | Organization settings → *Extensions* section in the left navigation | The same organization-wide dashboard, subject to access to Organization settings. |
| **Security dashboard** (project) | Project → *Advanced Security* (left menu, after Artifacts) | The current project. The project filter is hidden; repository filters and drill-down still work. |

## Screenshots

These screenshots use the extension's sample data and show the organization dashboard.

![Organization dashboard overview with alert metrics, severity charts, trends and repository freshness.](./images/organization-overview.png)

## Guided tour

Every tab has its own short tour. The first time you open a tab, its tour starts automatically: the Overview tour walks through the header actions, filters, breadcrumb, key numbers, drill-down, data freshness and tabs, while the Code scanning, Dependencies, Secrets, Coverage, Alerts and Settings tours explain that tab's panels and actions. Each step dims the rest of the page and outlines the area being described, following it as the page scrolls. While the tour is running the dashboard does not respond to clicks. Use **Next** and **Back** to move between steps. Select **Skip tour**, close the bubble, or press **Esc** to stop. Select **Tour: _tab name_** in the header to replay the tour for the selected tab at any time.

Tours are tracked per tab and separately for the organization and project dashboards in your browser's local storage, so clearing site data will show them again.

## Overview tab

The landing view combines all alert types.

- **KPIs:** open alerts, critical + high open, new and fixed in the last 7 days (with the change against the previous 7 days).
- **Open alerts by severity**, **by type** (code, dependencies, secrets) and **alerts by state**.
- **Open alerts trend** and **alerts by state over time** for the selected period. Shaded days have partial data.
- **Riskiest projects** and **riskiest repositories**, ranked by a weighted score: critical 10, high 5, medium 2, low 1.
- **Severity heatmap** by project (organization) or by repository (project or a single project selected).
- **New vs fixed per week**, **mean time to fix** and **open alert age**.
- **Remediation SLA**: overdue and eligible alerts by severity; defaults are critical 7 days, high 30, medium 90. Unknown first-seen dates are excluded from eligibility.
- **Dismissal analysis**: dismissal reasons and display names where the alert API reports them.
- **Scanner coverage trend**, showing how many repositories reported each enabled scanner over time.
- **Dependency upgrade impact**, grouping open dependency alerts by package and fixed version.
- **Oldest critical and high alerts**, with a direct link to each alert.
- **Data freshness**: when data was last collected and how many repositories are current.

## Saved views, work items and exports

- **Saved views** are private to the current browser profile and Azure DevOps user. Shareable links preserve the current filters and dashboard tab.
- In the **Alerts** tab, select one or more rows and choose **Create Task** to create one Azure Boards Task per project. The action requires `vso.work_write`, asks for confirmation, and reports partial failures.
- **Export CSV** includes up to 50,000 alerts; if more match, the dashboard warns you to refine the filters. **Print / Save PDF** opens the browser's print dialog with a report of current filtered metrics. **Export PowerPoint** downloads a four-slide posture summary.
- Dashboard widgets include overdue SLAs, mean time to fix, alert age, weekly new vs fixed, severity heatmap, and scanner coverage in addition to summary, severity, repository risk, and exposed-secret widgets.

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

![Secrets dashboard with exposure age, affected repositories and secret types. The screenshot contains sample data, not secret values.](./images/secrets-dashboard.png)

## Coverage tab

- **Repository coverage**: for each repository, whether code, dependency and secret scanning report data.
- **Where data comes from**: browser, per-user history or shared backend.

## Alerts tab

A sortable, paged table of the alerts matching the current filters, with links to the alert in Azure Repos. Project and repository names in each row are drill-down links.

**Branch / ref** shows the Git ref reported for the retained alert, when available. Branch names omit the `refs/heads/` prefix; other refs are shown in full. **Not reported** means the retained alert has no ref. An alert can affect other branches, so this is not a complete branch list. CSV exports retain the full `gitRef`.

![Alerts table with severity, alert type, project and repository, branch or ref, state, details and first-seen date. Uses sample data.](./images/alerts-table.png)

## Settings tab

Organization dashboard only, visible to Project Collection Administrators. SLA thresholds can be disabled with `0`. The optional weekly digest runs Mondays at 09:00 UTC and sends aggregate metrics only. It requires a shared backend, Azure Communication Services Email, and a verified sender address. Recipient addresses are held by the backend and are not returned to non-admin users. See [Data and history](#/data-modes) and [Shared backend](#/backend).
