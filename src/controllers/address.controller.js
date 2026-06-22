const httpStatus = require('http-status');
const { Address } = require('../models');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');

const addAddress = catchAsync(async (req, res) => {
  if (!req.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
  }

  const { name, phone, alternate_phone, address_line1, address_line2, city, state, pincode, country, is_default } = req.body;

  if (is_default) {
    // Set other addresses of this user to not default
    await Address.updateMany({ user_id: req.user.id }, { is_default: false });
  }

  // Check if this is the first address, if so, set it as default
  const addressCount = await Address.countDocuments({ user_id: req.user.id });
  const finalIsDefault = addressCount === 0 ? true : !!is_default;

  const address = await Address.create({
    user_id: req.user.id,
    name,
    phone,
    alternate_phone: alternate_phone || '',
    address_line1,
    address_line2: address_line2 || '',
    city,
    state,
    pincode,
    country: country || 'India',
    is_default: finalIsDefault,
  });

  res.status(httpStatus.CREATED).send({
    status: 201,
    success: true,
    message: 'Address added successfully',
    data: address,
  });
});

const listAddresses = catchAsync(async (req, res) => {
  if (!req.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
  }

  const addresses = await Address.find({ user_id: req.user.id }).sort({ is_default: -1, createdAt: -1 });

  res.status(httpStatus.OK).send({
    status: 200,
    success: true,
    message: 'Addresses fetched successfully',
    data: addresses,
  });
});

const updateAddress = catchAsync(async (req, res) => {
  if (!req.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
  }

  const { id } = req.body; // Accept address ID in body as well
  const addressId = id || req.params.id;

  if (!addressId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Address ID is required');
  }

  const { name, phone, alternate_phone, address_line1, address_line2, city, state, pincode, country, is_default } = req.body;

  const address = await Address.findOne({ _id: addressId, user_id: req.user.id });
  if (!address) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Address not found');
  }

  if (is_default) {
    await Address.updateMany({ user_id: req.user.id }, { is_default: false });
  }

  address.name = name !== undefined ? name : address.name;
  address.phone = phone !== undefined ? phone : address.phone;
  address.alternate_phone = alternate_phone !== undefined ? alternate_phone : address.alternate_phone;
  address.address_line1 = address_line1 !== undefined ? address_line1 : address.address_line1;
  address.address_line2 = address_line2 !== undefined ? address_line2 : address.address_line2;
  address.city = city !== undefined ? city : address.city;
  address.state = state !== undefined ? state : address.state;
  address.pincode = pincode !== undefined ? pincode : address.pincode;
  address.country = country !== undefined ? country : address.country;
  address.is_default = is_default !== undefined ? !!is_default : address.is_default;

  await address.save();

  res.status(httpStatus.OK).send({
    status: 200,
    success: true,
    message: 'Address updated successfully',
    data: address,
  });
});

const deleteAddress = catchAsync(async (req, res) => {
  if (!req.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
  }

  const { address_id } = req.body; // Check in body first for compatibility
  const addressId = address_id || req.params.id;

  if (!addressId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Address ID is required');
  }

  const address = await Address.findOne({ _id: addressId, user_id: req.user.id });
  if (!address) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Address not found');
  }

  const wasDefault = address.is_default;
  await Address.deleteOne({ _id: addressId });

  // If we deleted the default address, set another one as default
  if (wasDefault) {
    const anotherAddress = await Address.findOne({ user_id: req.user.id });
    if (anotherAddress) {
      anotherAddress.is_default = true;
      await anotherAddress.save();
    }
  }

  res.status(httpStatus.OK).send({
    status: 200,
    success: true,
    message: 'Address deleted successfully',
    data: { id: addressId },
  });
});

const setDefaultAddress = catchAsync(async (req, res) => {
  if (!req.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
  }

  const { address_id } = req.body;
  const addressId = address_id || req.params.id;

  if (!addressId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Address ID is required');
  }

  const address = await Address.findOne({ _id: addressId, user_id: req.user.id });
  if (!address) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Address not found');
  }

  await Address.updateMany({ user_id: req.user.id }, { is_default: false });
  address.is_default = true;
  await address.save();

  res.status(httpStatus.OK).send({
    status: 200,
    success: true,
    message: 'Address set as default successfully',
    data: address,
  });
});

module.exports = {
  addAddress,
  listAddresses,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
};
