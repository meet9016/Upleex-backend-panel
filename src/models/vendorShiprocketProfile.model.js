const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

/**
 * Vendor Shiprocket Profile Model
 * Stores vendor-specific Shiprocket pickup location details
 */
const vendorShiprocketProfileSchema = new mongoose.Schema(
  {
    vendor_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Pickup location name/code as registered in Shiprocket
    pickup_location_name: {
      type: String,
      required: true,
    },
    // Pickup location code returned by Shiprocket (if different from name)
    pickup_location_code: {
      type: String,
      default: '',
    },
    // Full address details
    address: {
      contact_person: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      address_line1: { type: String, default: '' },
      address_line2: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      pincode: { type: String, default: '' },
      country: { type: String, default: 'India' },
    },
    // Shiprocket status
    is_active: {
      type: Boolean,
      default: true,
    },
    // Raw response from Shiprocket
    shiprocket_response: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Last sync timestamp
    last_synced_at: {
      type: Date,
      default: null,
    },
    // Error if any during sync
    sync_error: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

vendorShiprocketProfileSchema.plugin(toJSON);

// Indexes
vendorShiprocketProfileSchema.index({ vendor_id: 1 });
vendorShiprocketProfileSchema.index({ pickup_location_name: 1 });

const VendorShiprocketProfile = mongoose.model('VendorShiprocketProfile', vendorShiprocketProfileSchema);

module.exports = VendorShiprocketProfile;
