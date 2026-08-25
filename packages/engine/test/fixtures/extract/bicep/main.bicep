param location string = resourceGroup().location

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: 'demostorage'
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
}

resource plan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: 'demoplan'
  location: location
}
