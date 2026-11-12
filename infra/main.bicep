// Optional shared backend for the GHAzDO dashboard: organization-wide scheduled collection and history.
// Browser-only mode needs none of this.
targetScope = 'resourceGroup'

@description('Short name used to derive resource names (lowercase letters and digits).')
@minLength(3)
@maxLength(11)
param baseName string = 'ghazdo'

param location string = resourceGroup().location

@description('Azure DevOps organization name (dev.azure.com/{organization}).')
param adoOrganization string

@description('Origins allowed to call the API, e.g. https://{publisher}.gallerycdn.vsassets.io')
param allowedOrigins array

@description('Extension certificate (Marketplace > Manage > Certificate). Leave empty to set the Key Vault secret later.')
@secure()
param extensionSecret string = ''

@description('Optional Azure Communication Services email connection string for the weekly digest.')
@secure()
param acsEmailConnectionString string = ''

@description('Verified sender address from the Azure Communication Services Email domain.')
param digestSenderAddress string = ''

@description('HMAC key for paging cursors. The default is regenerated on every deployment, which only invalidates in-flight cursors.')
@secure()
param cursorSigningKey string = base64('${newGuid()}${newGuid()}')

@description('Optional expected app token issuer/audience; leave empty to skip those checks.')
param appTokenIssuer string = ''
param appTokenAudience string = ''

@minValue(1)
@maxValue(32)
param collectorConcurrency int = 6

@description('Days to keep snapshot blobs (covers repositories that were deleted).')
param snapshotRetentionDays int = 370

param maximumInstanceCount int = 40

param tags object = {}

var suffix = uniqueString(resourceGroup().id, baseName)
var storageName = take('${baseName}st${suffix}', 24)
var deploymentContainer = 'app-package'
var appName = '${baseName}-func-${suffix}'

var roles = {
  blobDataOwner: 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
  queueDataContributor: '974c5e8b-45b9-4653-ba55-5f855dd0fb88'
  tableDataContributor: '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'
  keyVaultSecretsUser: '4633458b-17de-408a-b874-0445c86b69e6'
  monitoringMetricsPublisher: '3913510d-42f4-4e42-8a64-420c390055eb'
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${baseName}-id-${suffix}'
  location: location
  tags: tags
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${baseName}-log-${suffix}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${baseName}-ai-${suffix}'
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
    DisableLocalAuth: true
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  tags: tags
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    supportsHttpsTrafficOnly: true
    defaultToOAuthAuthentication: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource snapshotsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'snapshots'
  properties: { publicAccess: 'None' }
}

resource packageContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: deploymentContainer
  properties: { publicAccess: 'None' }
}

resource lifecycle 'Microsoft.Storage/storageAccounts/managementPolicies@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    policy: {
      rules: [
        {
          name: 'expire-snapshots'
          enabled: true
          type: 'Lifecycle'
          definition: {
            filters: {
              blobTypes: [ 'blockBlob' ]
              prefixMatch: [ 'snapshots/' ]
            }
            actions: {
              baseBlob: { delete: { daysAfterModificationGreaterThan: snapshotRetentionDays } }
            }
          }
        }
      ]
    }
  }
}

resource queueService 'Microsoft.Storage/storageAccounts/queueServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource collectQueue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-05-01' = {
  parent: queueService
  name: 'collect-repos'
}

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource tables 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = [
  for t in [ 'RepoState', 'DailyObservations', 'DashboardConfig', 'CollectionRuns' ]: {
    parent: tableService
    name: t
  }
]

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: take('${baseName}-kv-${suffix}', 24)
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
  }
}

resource extensionSecretValue 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(extensionSecret)) {
  parent: vault
  name: 'extension-secret'
  properties: { value: extensionSecret }
}

resource acsEmailSecretValue 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(acsEmailConnectionString)) {
  parent: vault
  name: 'acs-email-connection-string'
  properties: { value: acsEmailConnectionString }
}

resource cursorKeyValue 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'cursor-signing-key'
  properties: { value: cursorSigningKey }
}

resource storageRoles 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for r in [ roles.blobDataOwner, roles.queueDataContributor, roles.tableDataContributor ]: {
    name: guid(storage.id, identity.id, r)
    scope: storage
    properties: {
      roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', r)
      principalId: identity.properties.principalId
      principalType: 'ServicePrincipal'
    }
  }
]

resource vaultRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, identity.id, roles.keyVaultSecretsUser)
  scope: vault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.keyVaultSecretsUser)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource insightsRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(insights.id, identity.id, roles.monitoringMetricsPublisher)
  scope: insights
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.monitoringMetricsPublisher)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: '${baseName}-plan-${suffix}'
  location: location
  tags: tags
  kind: 'functionapp'
  sku: { name: 'FC1', tier: 'FlexConsumption' }
  properties: { reserved: true }
}

resource app 'Microsoft.Web/sites@2024-04-01' = {
  name: appName
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    keyVaultReferenceIdentity: identity.id
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}${deploymentContainer}'
          authentication: {
            type: 'UserAssignedIdentity'
            userAssignedIdentityResourceId: identity.id
          }
        }
      }
      scaleAndConcurrency: {
        maximumInstanceCount: maximumInstanceCount
        instanceMemoryMB: 2048
      }
      runtime: { name: 'node', version: '22' }
    }
    siteConfig: {
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      cors: { allowedOrigins: allowedOrigins }
      appSettings: [
        { name: 'AzureWebJobsStorage__accountName', value: storage.name }
        { name: 'AzureWebJobsStorage__credential', value: 'managedidentity' }
        { name: 'AzureWebJobsStorage__clientId', value: identity.properties.clientId }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
        { name: 'APPLICATIONINSIGHTS_AUTHENTICATION_STRING', value: 'ClientId=${identity.properties.clientId};Authorization=AAD' }
        { name: 'ADO_ORGANIZATION', value: adoOrganization }
        { name: 'STORAGE_ACCOUNT_NAME', value: storage.name }
        { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
        { name: 'EXTENSION_SECRET', value: '@Microsoft.KeyVault(VaultName=${vault.name};SecretName=extension-secret)' }
        { name: 'CURSOR_SIGNING_KEY', value: '@Microsoft.KeyVault(VaultName=${vault.name};SecretName=${cursorKeyValue.name})' }
        { name: 'ALLOWED_ORIGINS', value: join(allowedOrigins, ',') }
        { name: 'APP_TOKEN_ISSUER', value: appTokenIssuer }
        { name: 'APP_TOKEN_AUDIENCE', value: appTokenAudience }
        { name: 'COLLECTOR_CONCURRENCY', value: string(collectorConcurrency) }
        { name: 'ACS_EMAIL_CONNECTION_STRING', value: empty(acsEmailConnectionString) ? '' : '@Microsoft.KeyVault(VaultName=${vault.name};SecretName=acs-email-connection-string)' }
        { name: 'DIGEST_SENDER_ADDRESS', value: digestSenderAddress }
      ]
    }
  }
  dependsOn: [ storageRoles, vaultRole, insightsRole, collectQueue, tables, snapshotsContainer, packageContainer, acsEmailSecretValue ]
}

output functionAppName string = app.name
output backendUrl string = 'https://${app.properties.defaultHostName}'
output managedIdentityClientId string = identity.properties.clientId
output managedIdentityPrincipalId string = identity.properties.principalId
output keyVaultName string = vault.name
output storageAccountName string = storage.name
