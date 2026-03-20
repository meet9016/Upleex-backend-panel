const mongoose = require('mongoose');
const { toJSON } = require('../plugins');

const vendorKycSchema = new mongoose.Schema(
  {
    ContactDetails: {
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
    },
    Identity: {
      pancard_number: { type: String, default: '' },
      aadharcard_number: { type: String, default: '' },
      business_name: { type: String, default: '' },
      gst_number: { type: String, default: '' },
    },
    Bank: {
      account_holder_name: { type: String, default: '' },
      account_number: { type: String, default: '' },
      ifsc_code: { type: String, default: '' },
      account_type: { type: String, default: '' },
    },
    Documents: {
      business_logo_image: { type: String, default: '' },
      vendor_image: { type: String, default: '' },
      pancard_front_image: { type: String, default: '' },
      aadharcard_front_image: { type: String, default: '' },
      aadharcard_back_image: { type: String, default: '' },
      gst_certificate_image: { type: String, default: '' },
    },
    Declaration: {
      terms_conditions: { type: Boolean, default: false },
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    completed_pages: { type: [String], default: [] },
    vendor_type: { type: String, default: 'both' },
    approved_at: { type: Date },
  },
  {
    timestamps: true,
  }
);

vendorKycSchema.options.toJSON = {
  transform: (doc, ret) => {
    const contact = ret.ContactDetails || {};

    // Extract metadata
    const id = ret._id ? ret._id.toString() : ret.id;
    const createdAt = ret.createdAt;
    const updatedAt = ret.updatedAt;
    const approved_at = ret.approved_at;

    // Return structured object with id at root
    return {
      id,
      ContactDetails: contact,
      Identity: ret.Identity || {},
      Bank: ret.Bank || {},
      Documents: ret.Documents || {},
      Declaration: ret.Declaration || {},
      status: ret.status || 'pending',
      completed_pages: ret.completed_pages || [],
      vendor_type: ret.vendor_type || 'both',
      createdAt,
      updatedAt,
      approved_at,
    };
  },
};

const VendorKyc = mongoose.model('VendorKyc', vendorKycSchema);
module.exports = VendorKyc;
