const mongoose = require('mongoose');

const appVersionSchema = new mongoose.Schema(
  {
    android_version_code: { type: String, default: '1.0.0' },
    ios_version_code: { type: String, default: '1.0.0' },
    android_version_type: { type: String, default: 'optional' },
    ios_version_type: { type: String, default: 'optional' },
    play_store_link: { type: String, default: '' },
    app_store_link: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AppVersion', appVersionSchema);
