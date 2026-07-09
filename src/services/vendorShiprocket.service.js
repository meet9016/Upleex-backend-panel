const Vendor = require('../models/vendor/vendor.model');
const VendorKyc = require('../models/vendor/vendorKyc.model');
const VendorShiprocketProfile = require('../models/vendorShiprocketProfile.model');
const shiprocketService = require('./shiprocket.service');

/**
 * Create or update vendor's pickup location in Shiprocket
 * @param {string} vendorId - Vendor ID
 * @returns {Promise<Object>} - Created/Updated profile
 */
const syncVendorPickupLocation = async (vendorId) => {
  console.log(`\n[VendorShiprocket] Syncing pickup location for vendor: ${vendorId}`);

  try {
    // Get vendor details
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      throw new Error('Vendor not found');
    }

    // Get vendor KYC details
    const vendorKyc = await VendorKyc.findOne({ 'ContactDetails.vendor_id': vendorId });
    if (!vendorKyc) {
      throw new Error('Vendor KYC not found');
    }

    const contact = vendorKyc.ContactDetails || {};
    const identity = vendorKyc.Identity || {};

    // Generate unique pickup location name
    // Format: VENDOR_<first 8 chars of vendorId>_<timestamp>
    const pickupLocationName = `VENDOR_${String(vendorId).substring(0, 8).toUpperCase()}`;

    // Build pickup location data for Shiprocket
    const pickupData = {
      pickup_location: pickupLocationName,
      name: contact.full_name || vendor.full_name || 'Vendor',
      email: contact.email || vendor.email || 'vendor@upleex.com',
      phone: contact.mobile || vendor.number || '9999999999',
      address: contact.address || 'Address not provided',
      address_2: '',
      city: contact.city_name || '',
      state: contact.state_name || '',
      country: contact.country_name || 'India',
      pin_code: contact.pincode || '',
      gst_number: identity.gst_number || '',
    };

    console.log('[VendorShiprocket] Pickup data:', JSON.stringify(pickupData, null, 2));

    // Check if profile already exists
    let existingProfile = await VendorShiprocketProfile.findOne({ vendor_id: vendorId });

    if (existingProfile) {
      // Update existing profile
      console.log('[VendorShiprocket] Updating existing profile...');
      
      try {
        // Try to update in Shiprocket (might fail if location doesn't exist)
        const shiprocketRes = await shiprocketService.createPickupLocation(pickupData);
        
        existingProfile.pickup_location_name = pickupLocationName;
        existingProfile.address = {
          contact_person: contact.full_name || vendor.full_name,
          email: contact.email || vendor.email,
          phone: contact.mobile || vendor.number,
          address_line1: contact.address,
          address_line2: '',
          city: contact.city_name,
          state: contact.state_name,
          pincode: contact.pincode,
          country: contact.country_name || 'India',
        };
        existingProfile.shiprocket_response = shiprocketRes;
        existingProfile.last_synced_at = new Date();
        existingProfile.sync_error = '';
        
        await existingProfile.save();
        console.log('[VendorShiprocket] ✅ Profile updated successfully');
        
        return existingProfile;
      } catch (updateErr) {
        console.log('[VendorShiprocket] ⚠️ Update failed, will create new:', updateErr.message);
        // If update fails, we'll create new below
      }
    }

    // Create new pickup location in Shiprocket
    console.log('[VendorShiprocket] Creating new pickup location...');
    const shiprocketRes = await shiprocketService.createPickupLocation(pickupData);

    // Create or update profile in database
    const profileData = {
      vendor_id: vendorId,
      pickup_location_name: pickupLocationName,
      pickup_location_code: shiprocketRes?.data?.pickup_location || pickupLocationName,
      address: {
        contact_person: contact.full_name || vendor.full_name,
        email: contact.email || vendor.email,
        phone: contact.mobile || vendor.number,
        address_line1: contact.address,
        address_line2: '',
        city: contact.city_name,
        state: contact.state_name,
        pincode: contact.pincode,
        country: contact.country_name || 'India',
      },
      is_active: true,
      shiprocket_response: shiprocketRes,
      last_synced_at: new Date(),
      sync_error: '',
    };

    const profile = await VendorShiprocketProfile.findOneAndUpdate(
      { vendor_id: vendorId },
      profileData,
      { upsert: true, new: true }
    );

    console.log('[VendorShiprocket] ✅ Pickup location created successfully');
    console.log(`[VendorShiprocket]   Location Name: ${pickupLocationName}`);
    console.log(`[VendorShiprocket]   Pincode: ${contact.pincode}`);

    return profile;
  } catch (error) {
    console.error('[VendorShiprocket] ❌ Sync failed:', error.message);

    // Store error in profile
    await VendorShiprocketProfile.findOneAndUpdate(
      { vendor_id: vendorId },
      {
        sync_error: error.message,
        last_synced_at: new Date(),
      },
      { upsert: true }
    );

    throw error;
  }
};

/**
 * Get vendor's pickup location name
 * @param {string} vendorId - Vendor ID
 * @returns {Promise<string>} - Pickup location name or default
 */
const getVendorPickupLocation = async (vendorId) => {
  const profile = await VendorShiprocketProfile.findOne({ 
    vendor_id: vendorId, 
    is_active: true 
  });
  
  return profile?.pickup_location_name || null;
};

/**
 * Get all vendor pickup profiles (for admin)
 * @returns {Promise<Array>}
 */
const getAllVendorPickupProfiles = async () => {
  return VendorShiprocketProfile.find({})
    .populate('vendor_id', 'full_name business_name email number')
    .sort({ createdAt: -1 });
};

module.exports = {
  syncVendorPickupLocation,
  getVendorPickupLocation,
  getAllVendorPickupProfiles,
};
