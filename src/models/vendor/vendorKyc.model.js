const mongoose = require('mongoose');
const { toJSON } = require('../plugins');

const vendorKycSchema = new mongoose.Schema(
  {
    vendor_id: { type: String, default: '' },
    full_name: { type: String, default: '' },
    email: { type: String, default: '' },
    mobile: { type: String, default: '' },
    address: { type: String, default: '' },
    pincode: { type: String, default: '' },
    country_id: { type: String, default: '' },
    state_id: { type: String, default: '' },
    city_id: { type: String, default: '' },
    country_name: { type: String, default: '' },
    state_name: { type: String, default: '' },
    city_name: { type: String, default: '' },
    pancard_number: { type: String, default: '' },
    aadharcard_number: { type: String, default: '' },
    business_name: { type: String, default: '' },
    gst_number: { type: String, default: '' },
    account_holder_name: { type: String, default: '' },
    account_number: { type: String, default: '' },
    ifsc_code: { type: String, default: '' },
    account_type: { type: String, default: '' },
    business_logo_image: { type: String, default: '' },
    vendor_image: { type: String, default: '' },
    pancard_front_image: { type: String, default: '' },
    aadharcard_front_image: { type: String, default: '' },
    aadharcard_back_image: { type: String, default: '' },
    gst_certificate_image: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    approved_at: { type: Date },
  },
  {
    timestamps: true,
  }
);

vendorKycSchema.plugin(toJSON);

const VendorKyc = mongoose.model('VendorKyc', vendorKycSchema);
module.exports = VendorKyc;
