const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Support both JSON file and Environment Variables
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log('Firebase Admin SDK initialized using JSON file');
} else if (process.env.FIREBASE_PROJECT_ID) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
  console.log('Firebase Admin SDK initialized using Environment Variables');
} else {
  console.warn('WARNING: Firebase Admin credentials not found. Set FIREBASE_PROJECT_ID in .env or place serviceAccountKey.json in src/config/');
}

module.exports = admin;
