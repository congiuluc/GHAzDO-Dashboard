# Filters and drill-down

Every view can be narrowed to a project and/or repository, and every chart leads to the alerts behind it.

## Filter bar

| Filter | Notes |
| --- | --- |
| **Projects** | Organization dashboard only. Multi-select. |
| **Repositories** | Multi-select. The list follows the selected projects. |
| **Type** | Code, dependency, secret. |
| **Severity** | Critical, high, medium, low, unknown. |
| **State** | Active, fixed, dismissed. |
| **Period** | 7, 14, 30, 60 or 90 days for trends and weekly charts. |
| **Search** | Matches alert title, rule, tool, package, secret type, advisory or alert ID. |

Active filters appear as removable chips with **Clear all**. A breadcrumb (organization → project → repository) lets you step back up.

## Drill-down

- Click a **project** in *Riskiest projects* or the heatmap to filter to it.
- Click a **repository** anywhere (lists, heatmap, alert rows) to filter to that project and repository.
- Click a **severity, type or state** slice to open the *Alerts* tab with that filter.
- Click a **heatmap cell** to see the active alerts of that severity for that project or repository.
- Click a **rule, package, ecosystem, advisory or secret type** to list its active alerts.
- Click a **KPI** to open the matching alert list.

## Shareable links

Filters and the selected tab are stored in the URL, for example:

```text
…/_apps/hub/<publisher>.ghazdo-dashboard.ghazdo-hub#project=<id>&repo=<id>&type=secret&tab=alerts
```

Copy the browser URL to share a view. Recipients see only what their own permissions allow.
