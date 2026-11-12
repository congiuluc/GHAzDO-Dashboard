# Development

Requires Node 20 or later (CI uses Node 22).

## Repository layout

| Path | Contents |
| --- | --- |
| `packages/shared` | Alert normalization, ADO client and collector, filters, aggregation |
| `apps/extension` | React 18 + Vite extension built with [azure-devops-ui](https://developer.microsoft.com/en-us/azure-devops/develop/extensions) (Formula Design System): hubs, widgets, widget configuration, `vss-extension.json` |
| `apps/functions` | Optional Azure Functions v4 backend |
| `apps/docs` | This documentation site (Fluent UI React v9) |
| `infra` | Bicep for the backend |
| `.github/workflows` | CI, release and Pages workflows |

## Common commands

```powershell
npm ci
npm run validate                          # typecheck, lint, test, build
npm run dev --workspace apps/extension    # extension with sample data
npm run dev --workspace apps/docs         # this site
npm run package:vsix                      # out/*.vsix
npm run package:functions                 # apps/functions/functions.zip
npm run bicep:build                       # infra/out/main.json
```

## Sample data

Outside Azure DevOps the extension runs on built-in fixture data, so you can work on the UI without an organization:

- `http://localhost:5173/hub.html`: organization dashboard
- `http://localhost:5173/project-hub.html`: project dashboard
- `http://localhost:5173/widget.html?kind=secrets`: a widget (`kpi`, `severity`, `top-repos`, `secrets`)

## Extension UI

The extension uses `azure-devops-ui` components (Page, Header, Card, Table, Dropdown, TabBar, MessageCard, and so on) so it looks native in Azure DevOps and follows the host theme, including dark mode.

- `azure-devops-ui` declares a React 16 peer dependency, so the extension stays on React 18. The docs site uses React 19.
- The root `.npmrc` sets `legacy-peer-deps=true` so the peer range doesn't block installs.
- `apps/extension/vite.config.ts` aliases `react` and `react-dom` to the extension's own copy, and `tsconfig.json` maps the React 18 types the same way. This avoids mixing React versions in the workspace.
- `css.lightningcss.errorRecovery` is enabled because some `azure-devops-ui` CSS contains media queries the Vite CSS minifier rejects.

## Editing these docs

Pages are markdown files in `apps/docs/content`, listed in `apps/docs/src/pages.ts`. Link between pages with `#/<page-id>`.
