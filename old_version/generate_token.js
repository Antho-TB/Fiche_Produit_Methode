const { google } = require('googleapis');

// Configure le client OAuth2
const oauth2Client = new google.auth.OAuth2(
  "VOTRE_CLIENT_ID.apps.googleusercontent.com",
  "VOTRE_CLIENT_SECRET",
  "http://localhost"
);

// Génère l'URL d'autorisation
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: [
      'https://www.googleapis.com/auth/gmail.readonly', 
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/calendar' // Au cas où
  ],
  prompt: 'consent'
});

console.log('URL_A_OUVRIR:' + authUrl);
