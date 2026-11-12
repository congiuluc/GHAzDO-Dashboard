# Dashboard widgets

Add the widgets to any Azure DevOps project dashboard: **Edit → Add a widget**, then search for *Advanced Security*.

| Widget | Shows | Sizes |
| --- | --- | --- |
| **Advanced Security summary** | Open alerts, critical + high, new and fixed in 7 days | 2×1, 2×2 |
| **Advanced Security by severity** | Open alerts per severity | 2×2, 3×2 |
| **Advanced Security top repositories** | Riskiest repositories by weighted score | 2×2, 3×2, 3×3 |
| **Advanced Security exposed secrets** | Open secrets exposed for more than 7 days, top repositories | 2×2, 3×2 |

## Configuration

| Setting | Options |
| --- | --- |
| **Show alerts from** | *This project* or *All projects I can access* |
| **Repositories** | Empty for all, or specific repositories |
| **Alert types** | Code, dependency, secret. Ignored by the exposed secrets widget. |

## Behavior

- Widgets read data that was already collected by the hubs (browser mode) or by the [shared backend](#/backend). If nothing has been collected yet, they show *Not collected yet*; open a hub once to fill the cache.
- Clicking the title or a value opens the matching hub with the same filters applied.
- The footer shows when data was last updated and flags partial data.
