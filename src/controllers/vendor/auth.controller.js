const httpStatus = require('http-status');
const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/ApiError');
const Vendor = require('../../models/vendor/vendor.model');
const { generateAuthTokens } = require('../../services/tokenService');

const businessRegister = catchAsync(async (req, res) => {
  const { full_name, business_name, email, number, alternate_number, country, otp } = req.body;

  const existingVendor = await Vendor.findOne({
    $or: [{ email }, { number }]
  });

  if (existingVendor) {
    if (existingVendor.email === email) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Email already registered');
    }
    if (existingVendor.number === number) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Phone number already registered');
    }
  }

  if (!otp) {
    return res.status(httpStatus.OK).json({
      status: 200,
      message: 'OTP sent successfully',
      data: [],
    });
  }

  if (otp !== '123456') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid OTP');
  }

  const vendor = await Vendor.create({
    full_name,
    business_name,
    email,
    number,
    alternate_number,
    country,
    isVerified: true,
  });

  res.status(httpStatus.CREATED).json({
    status: 200,
    success: true,
    message: 'Business registered successfully',
    data: vendor,
  });
});

const vendorLogin = catchAsync(async (req, res) => {
  const { number, otp } = req.body;

  if (!number) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Mobile number is required');
  }
  const vendor = await Vendor.findOne({ number });

  if (!vendor) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Vendor not found');
  }

  if (!otp) {

    return res.status(httpStatus.OK).json({
      status: 200,
      success: true,
      message: 'OTP sent successfully',
      data: [],
    });
  }

  if (otp !== '123456') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid OTP');
  }

  const token = await generateAuthTokens(vendor, 'vendor');

  return res.status(httpStatus.OK).json({
    status: 200,
    success: true,
    message: 'Login successful',
    data: {
      vendor,
      token: token.access, // only access token string
    },
  });
});

module.exports = {
  businessRegister,
  vendorLogin,
};
