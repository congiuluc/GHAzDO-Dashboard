# CI, releases and Pages

Three GitHub Actions workflows live in `.github/workflows`.

| Workflow | Trigger | Does |
| --- | --- | --- |
| `ci.yml` | Push to `main`, pull requests, manual | Typecheck, lint, test, build, compile Bicep, package the VSIX and Functions zip, upload them as a build artifact |
| `release.yml` | Push of a `v*.*.*` tag, or manual with a version | Validates, packages with the tag version, creates a GitHub release with the assets, optionally publishes to the Marketplace, then redeploys these docs |
| `pages.yml` | Push to `main` touching docs, manual, or called by `release.yml` | Builds `apps/docs` and deploys it to GitHub Pages |

## One-time setup

1. **Pages:** *Settings → Pages → Build and deployment → Source: GitHub Actions*.
2. **Repository variables** (*Settings → Secrets and variables → Actions → Variables*):

| Variable | Required | Purpose |
| --- | --- | --- |
| `MARKETPLACE_PUBLISHER` | For releases | Publisher ID written into the VSIX manifest |
| `VITE_BACKEND_ALLOWLIST` | No | Comma-separated backend origins compiled into the extension |
| `PUBLISH_TO_MARKETPLACE` | No | `true` to publish releases to the Marketplace |
| `MARKETPLACE_SHARE_WITH` | No | Space-separated organizations to share the private extension with |

3. **Secret** (only when publishing): `MARKETPLACE_PAT`, a token with the *Marketplace (Publish)* scope, created by an identity that can publish extensions for the publisher configured in `MARKETPLACE_PUBLISHER`. That variable must match the publisher that owns the existing extension. The publish job runs in the `marketplace` environment, so you can add required reviewers to it.

## Cutting a release

```powershell
git tag v0.0.1
git push origin v0.0.1
```

Or run **Release** manually from the *Actions* tab with version `0.0.1` for the initial release; it creates the tag on the selected commit.

Versions must be `major.minor.patch` numbers, because the Marketplace does not accept pre-release labels. Each release contains:

- `<publisher>.ghazdo-security-dashboard-<version>.vsix`
- `functions.zip`
- `main.json` (compiled ARM template for the backend)
- `SHA256SUMS.txt`

> Releases created by the workflow token do not trigger other workflows, so `release.yml` calls `pages.yml` directly to refresh the docs with the new version number.

## Marketplace publishing errors

If publishing says the extension is new and then says it already exists, `tfx` may have hidden an error while looking up the existing extension. After a publish failure, the workflow performs a read-only lookup and shows any lookup error. A lookup failure can also be expected for a first-time publication.

To diagnose an already-created release without starting another run, replace `YOUR_PUBLISHER_ID` below and enter the same PAT at the hidden prompt:

```powershell
npx --yes tfx-cli@0.24.2 extension show --publisher YOUR_PUBLISHER_ID --extension-id ghazdo-security-dashboard
```

Do not include the PAT in the command or share it with the lookup output.

For an existing extension, check that the PAT belongs to an identity with access to the correct Marketplace publisher and has the *Marketplace (Publish)* scope. If the GitHub release was already created, re-run the failed Marketplace job rather than creating the release again. Re-runs use the workflow from the original commit, so newer diagnostics only apply to new runs.
