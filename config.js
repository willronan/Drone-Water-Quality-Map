// Configuration for GitHub Pages deployment.
// Copy this file to 'config.js' and fill in the values.
//
// IMPORTANT:
// - Do NOT commit secrets (subscription keys, connection strings) to a public repo.
// - Preferred approach: use Azure Functions to (1) read Table Storage and (2) mint Azure Maps tokens.
//   Then this static site only talks to your function endpoints.

window.APP_CONFIG = {
  // 1) Data API: HTTP endpoint that returns JSON rows from your Table Storage.
  // Example: "https://<your-func-app>.azurewebsites.net/api/GetDroneData?days=7"
  DATA_API_URL: "https://YOUR-FUNCTION-APP.azurewebsites.net/api/GetDroneData",

  // 2) Azure Maps authentication:
  // Preferred: Microsoft Entra token brokered by your backend (Azure Function/App Service with Managed Identity).
  // Fill these in if you implement the token endpoint.
  AZURE_MAPS_CLIENT_ID: "YOUR-AZURE-MAPS-CLIENT-ID-GUID",
  MAP_TOKEN_URL: "https://YOUR-FUNCTION-APP.azurewebsites.net/api/GetAzureMapsToken",

  // Not recommended for public repos / public sites:
  AZURE_MAPS_SUBSCRIPTION_KEY: "99FXwvp3sLhLM5Iw0VrcddGR0mzusEO57dyFRDKYafCpeHMDrxQuJQQJ99CBAC8vTInE4gDzAAAgAZMP48y9"
};
