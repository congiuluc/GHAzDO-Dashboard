# Shared backend

The optional backend collects alerts for the whole organization every hour and keeps shared history for up to 365 days.

## Architecture

| Resource | Purpose |
| --- | --- |
| **Function App** (Flex Consumption, Linux, Node 22) | Hourly coordinator, queue-driven repository collectors, daily retention, HTTP API for the extension |
| **User-assigned managed identity** | Calls Azure DevOps and accesses Storage, Key Vault and App Insights. No keys or connection strings. |
| **Storage account** (shared key disabled) | Snapshots (blobs, 370-day lifecycle), repository state and daily observations (tables), work queue |
| **Key Vault** (RBAC) | Extension secret, cursor signing key, and optional ACS email connection string |
| **Application Insights + Log Analytics** | Telemetry, local auth disabled |

All of it is defined in `infra/main.bicep`. Release packages include the compiled ARM template.

## Deploy

```powershell
az group create -n rg-ghazdo -l westeurope
az deployment group create -g rg-ghazdo -f infra/main.bicep `
  -p adoOrganization=contoso `
  -p allowedOrigins="['https://<publisher>.gallerycdn.vsassets.io']" `
  -p extensionSecret=$env:EXT_SECRET

az functionapp deployment source config-zip -g rg-ghazdo -n <functionAppName> --src functions.zip
```

`functions.zip` is attached to every release, or built with `npm run package:functions`.

### Optional weekly digest email

The digest runs every Monday at 09:00 UTC. Configure an Azure Communication Services Email resource and verify its sender domain/address first, then deploy with:

```powershell
az deployment group create -g rg-ghazdo -f infra/main.bicep `
  -p adoOrganization=contoso `
  -p allowedOrigins="['https://<publisher>.gallerycdn.vsassets.io']" `
  -p acsEmailConnectionString=$env:ACS_EMAIL_CONNECTION_STRING `
  -p digestSenderAddress='security@example.com'
```

In **Security dashboard → Settings**, configure up to 20 recipients. Addresses stay in the shared backend and are returned only to Project Collection Administrators. Messages contain aggregate counts and top-project risk scores, not alert titles, dismissal actors, or secret metadata. If recipients are configured without a verified sender and ACS connection, the timer reports an error instead of silently claiming delivery.

## Connect it

1. **Give the managed identity access to Azure DevOps.** Add the `managedIdentityClientId` output as a user in the organization, with read access to projects and repositories and *Advanced Security: Read alerts*.
2. **Set the extension secret.** This is the Marketplace extension certificate, used to validate the app tokens the extension sends. Pass it at deployment or set the `extension-secret` Key Vault secret later.
3. **Build the extension with the backend allowed.** Set `VITE_BACKEND_ALLOWLIST` (or the repository variable of the same name for CI builds) to the `backendUrl` origin.
4. **Point the dashboard at it.** In **Security dashboard → Settings**, set **Backend URL** to the `backendUrl` output and choose **Test connection**.

## App settings

| Setting | Purpose |
| --- | --- |
| `ADO_ORGANIZATION` | Organization to collect |
| `STORAGE_ACCOUNT_NAME`, `AZURE_CLIENT_ID` | Identity-based storage access |
| `EXTENSION_SECRET`, `CURSOR_SIGNING_KEY` | Key Vault references |
| `ALLOWED_ORIGINS` | CORS allowlist |
| `APP_TOKEN_ISSUER`, `APP_TOKEN_AUDIENCE` | Optional extra token checks |
| `COLLECTOR_CONCURRENCY` | Parallel repository collectors |
| `ACS_EMAIL_CONNECTION_STRING`, `DIGEST_SENDER_ADDRESS` | Optional weekly email delivery; set both only after verifying the sender in ACS Email |
