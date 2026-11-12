using './main.bicep'

param baseName = 'ghazdo'
param adoOrganization = 'contoso'
param allowedOrigins = [
  'https://REPLACE-WITH-PUBLISHER.gallerycdn.vsassets.io'
]
// Supply at deployment time instead of committing it, e.g.:
//   az deployment group create ... --parameters main.bicepparam extensionSecret=$EXT_SECRET
param extensionSecret = ''
