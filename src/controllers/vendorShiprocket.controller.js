const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const VendorShiprocketProfile = require('../models/vendorShiprocketProfile.model');
const VendorKyc = require('../models/vendor/vendorKyc.model');
const Vendor = require('../models/vendor/vendor.model');
const shiprocketService = require('../services/shiprocket.service');

/**
 * Create or Update Vendor's Shiprocket Pickup Location
 * This will register the pickup location in Shiprocket and store in DB
 */
const upsertVendorPickupLocation = catchAsync(async (req, res) => {
  const vendorId = req.user.id || req.user._id;

  if (!vendorId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Vendor not authenticated');
  }

  const { pickup_location_name, address } = req.body;

  // Validate required fields
  if (!pickup_location_name || !address) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Pickup location name and address are required');
  }

  const { contact_person, email, phone, address_line1, city, state, pincode, country } = address;

  if (!address_line1 || !city || !state || !pincode) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Address line1, city, state, and pincode are required');
  }

  // Generate unique pickup location name for vendor (max 30 chars, alphanumeric)
  const vendorShortId = String(vendorId).substring(0, 6).toUpperCase();
  const sanitizedLocationName = String(pickup_location_name).replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
  const finalLocationName = sanitizedLocationName ? `${sanitizedLocationName}_${vendorShortId}` : `VendorPickup_${vendorShortId}`;

  console.log(`[VendorShiprocket] Creating pickup location for vendor ${vendorId}: ${finalLocationName}`);

  try {
    // Create pickup location in Shiprocket
    const shiprocketPayload = {
      pickup_location: finalLocationName,
      name: contact_person || 'Vendor',
      email: email ,
      phone: phone ,
      address: address_line1,
      address_2: address.address_line2 || '',
      city: city,
      state: state,
      country: country || 'India',
      pin_code: pincode,
    };

    const shiprocketResponse = await shiprocketService.createPickupLocation(shiprocketPayload);

    // Save to database
    const existingProfile = await VendorShiprocketProfile.findOne({ vendor_id: vendorId });

    if (existingProfile) {
      // Update existing
      existingProfile.pickup_location_name = finalLocationName;
      existingProfile.pickup_location_code = shiprocketResponse?.pickup_location_code || finalLocationName;
      existingProfile.address = address;
      existingProfile.is_active = true;
      existingProfile.shiprocket_response = shiprocketResponse;
      existingProfile.last_synced_at = new Date();
      existingProfile.sync_error = '';
      await existingProfile.save();

      res.status(httpStatus.OK).send({
        status: 200,
        success: true,
        message: 'Pickup location updated successfully',
        data: existingProfile,
      });
    } else {
      // Create new
      const newProfile = await VendorShiprocketProfile.create({
        vendor_id: vendorId,
        pickup_location_name: finalLocationName,
        pickup_location_code: shiprocketResponse?.pickup_location_code || finalLocationName,
        address: address,
        is_active: true,
        shiprocket_response: shiprocketResponse,
        last_synced_at: new Date(),
      });

      res.status(httpStatus.CREATED).send({
        status: 201,
        success: true,
        message: 'Pickup location created successfully',
        data: newProfile,
      });
    }
  } catch (error) {
    console.error('[VendorShiprocket] Error creating pickup location:', error.message);

    // Save error to profile
    await VendorShiprocketProfile.findOneAndUpdate(
      { vendor_id: vendorId },
      {
        $set: {
          sync_error: error.message,
          last_synced_at: new Date(),
        },
      },
      { upsert: true }
    );

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Failed to create pickup location: ${error.message}`);
  }
});

/**
 * Get Vendor's Shiprocket Profile
 */
const getVendorProfile = catchAsync(async (req, res) => {
  const vendorId = req.user.id || req.user._id;

  if (!vendorId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Vendor not authenticated');
  }

  const profile = await VendorShiprocketProfile.findOne({ vendor_id: vendorId });

  if (!profile) {
    // Return default response with suggestion to create
    return res.status(httpStatus.OK).send({
      status: 200,
      success: true,
      message: 'No Shiprocket profile found. Please create one.',
      data: {
        has_profile: false,
        profile: null,
      },
    });
  }

  res.status(httpStatus.OK).send({
    status: 200,
    success: true,
    message: 'Profile fetched successfully',
    data: {
      has_profile: true,
      profile: profile,
    },
  });
});

/**
 * Sync Vendor KYC Address to Shiprocket
 * Auto-create pickup location from KYC data
 */
const syncFromKyc = catchAsync(async (req, res) => {
  const vendorId = req.user.id || req.user._id;

  if (!vendorId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Vendor not authenticated');
  }

  // Get Vendor KYC details
  const vendorKyc = await VendorKyc.findOne({ 'ContactDetails.vendor_id': vendorId });

  if (!vendorKyc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Vendor KYC not found. Please complete KYC first.');
  }

  const vendor = await Vendor.findById(vendorId);
  const contact = vendorKyc.ContactDetails;
  
  // PRIORITY: PickupAddress > ContactDetails
  const hasPickupAddress = vendorKyc.PickupAddress?.address || vendorKyc.PickupAddress?.pincode;
  const sourceAddress = hasPickupAddress ? vendorKyc.PickupAddress : contact;
  
  const businessName = vendor?.business_name || vendor?.businessName || sourceAddress?.full_name || sourceAddress?.contact_person || 'Vendor';

  // Prepare address from KYC
  const pickupData = {
    pickup_location_name: businessName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20),
    address: {
      contact_person: sourceAddress?.contact_person || sourceAddress?.full_name || 'Vendor',
      email: sourceAddress?.email || vendor?.email || 'vendor@upleex.com',
      phone: sourceAddress?.phone || sourceAddress?.mobile || '9999999999',
      address_line1: sourceAddress?.address || 'Address',
      address_line2: '',
      city: sourceAddress?.city_name || '',
      state: sourceAddress?.state_name || '',
      pincode: sourceAddress?.pincode || '',
      country: sourceAddress?.country_name || 'India',
    },
  };

  // Call the upsert function
  req.body = pickupData;
  return upsertVendorPickupLocation(req, res);
});

/**
 * Get all pickup locations (Admin)
 */
const getAllPickupLocations = catchAsync(async (req, res) => {
  const profiles = await VendorShiprocketProfile.find({})
    .sort({ createdAt: -1 });

  res.status(httpStatus.OK).send({
    status: 200,
    success: true,
    message: 'Pickup locations fetched successfully',
    data: profiles,
  });
});

module.exports = {
  upsertVendorPickupLocation,
  getVendorProfile,
  syncFromKyc,
  getAllPickupLocations,
};
