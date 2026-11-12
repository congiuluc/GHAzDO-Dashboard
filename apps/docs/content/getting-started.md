# Getting started

Advanced Security Dashboard is a private Azure DevOps Services extension. You build it from this repository (or download a release), upload it under your own Marketplace publisher, and install it into your organization.

## Prerequisites

- An Azure DevOps Services organization with **GitHub Advanced Security for Azure DevOps** enabled on at least one repository.
- A [Visual Studio Marketplace publisher](https://learn.microsoft.com/azure/devops/extend/publish/overview) you can upload private extensions to.
- To view alerts, users need the *Advanced Security: Read alerts* permission on the repositories. The dashboard never shows more than a user can already see.

## 1. Get the package

**From a release.** Download `ghazdo-dashboard-<version>.vsix` from the repository's *Releases* page. Release packages are built with the publisher ID configured in the repository variable `MARKETPLACE_PUBLISHER`.

**From source.**

```powershell
npm ci
# Replace REPLACE-WITH-PUBLISHER in apps/extension/vss-extension.json first
npm run package:vsix      # writes out/<publisher>.ghazdo-dashboard-<version>.vsix
```

If you plan to use the [shared backend](#/backend), set its origin before building:

```powershell
$env:VITE_BACKEND_ALLOWLIST = "https://ghazdo-func-xxxx.azurewebsites.net"
```

## 2. Upload and share

1. Open the [Marketplace publishing portal](https://marketplace.visualstudio.com/manage) and choose **New extension → Azure DevOps**.
2. Upload the `.vsix`. Keep it **private**.
3. Choose **Share** and add your organization.

## 3. Install

1. In Azure DevOps, open **Organization settings → Extensions → Shared**.
2. Select **Advanced Security Dashboard** and choose **Install**.
3. Accept the requested scopes (read Advanced Security alerts, projects, code and graph, and write extension data).

## 4. Open the dashboards

| Where | What |
| --- | --- |
| Organization home → **Advanced Security → Security dashboard** | All projects you can read |
| Any project → **Advanced Security** (left menu, after Artifacts) | That project only |
| Any dashboard → **Edit → Add a widget** → search *Advanced Security* | The four widgets |

The first time you open a dashboard it collects alerts in your browser, which can take a minute for large organizations. Later visits use the local cache and refresh in the background.

> **Next:** take the [dashboard tour](#/dashboards), or let an organization admin review [data and history options](#/data-modes).
