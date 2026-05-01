const httpStatus = require('http-status');
const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/ApiError');
const Vendor = require('../../models/vendor/vendor.model');
const { generateAuthTokens } = require('../../services/tokenService');
const { Otp } = require('../../models');
const { smsService } = require('../../services');

const businessRegister = catchAsync(async (req, res) => {
  const { full_name, business_name, email, number, alternate_number, country, city_id, otp, url } = req.body;

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

  const isOtpProvided = otp && otp.trim() !== '';

  if (!isOtpProvided) {
    const origin = req.get('origin') || '';
    const referer = req.get('referer') || '';

    // Check if the domain is allowed
    const allowedDomains = ['upleex.com', 'vendor.upleex.com'];
    const isFromWebsite =
      allowedDomains.some(domain =>
        url === domain ||
        origin.includes(domain) ||
        referer.includes(domain)
      );

    const isFromMobileApp = url && (url.includes('api/api/v1') || url.includes('web-login-register') && url !== '1upleex.com');

    const generatedOtp = (isFromWebsite && !isFromMobileApp)
      ? Math.floor(100000 + Math.random() * 900000).toString()
      : '123456';

    // Save/Update OTP in database
    await Otp.findOneAndUpdate(
      { phone: number },
      { otp: generatedOtp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
      { upsert: true, new: true }
    );

    // Send real OTP via SMS ONLY for the website
    const shouldSendSms = (isFromWebsite && !isFromMobileApp);
    if (shouldSendSms) {
      await smsService.sendOtp(number, generatedOtp);
    }

    return res.status(httpStatus.OK).json({
      status: 200,
      success: true,
      message: shouldSendSms ? 'OTP sent successfully' : 'Static OTP generated (123456)',
      data: [],
    });
  }

  // Verify OTP
  const otpRecord = await Otp.findOne({ phone: number, otp: otp });

  if (!otpRecord) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid or expired OTP');
  }

  // OTP is valid, delete it so it can't be reused
  await Otp.deleteOne({ _id: otpRecord._id });

  const vendor = await Vendor.create({
    full_name,
    business_name,
    email,
    number,
    alternate_number,
    country,
    city_id,
    isVerified: true,
  });
  const token = await generateAuthTokens(vendor, 'vendor');

  // Notify admin about new vendor
  try {
    const { sendAdminNotification } = require('../../services/adminNotification.service');
    await sendAdminNotification(
      'New Vendor Registered 🏪',
      `New vendor "${business_name}" (${full_name}) has registered and is awaiting KYC approval.`,
      'new_vendor',
      { vendorId: String(vendor._id), business_name, full_name }
    );
  } catch (e) { console.error('Admin notification error:', e); }

  res.status(httpStatus.CREATED).json({
    status: 200,
    success: true,
    message: 'Business registered successfully',
    data: {
      vendor: vendor,
      auth_token: token.access, // Use the same structure as vendorLogin
    },
  });
});

const vendorLogin = catchAsync(async (req, res) => {
  const { number, otp, url } = req.body;

  if (!number) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Mobile number is required');
  }
  const vendor = await Vendor.findOne({ number });

  if (!vendor) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Vendor not found with this mobile number');
  }

  const isOtpProvided = otp && otp.trim() !== '';

  if (!isOtpProvided) {
    const origin = req.get('origin') || '';
    const referer = req.get('referer') || '';

    // Check if the domain is allowed
    const allowedDomains = ['upleex.com', 'vendor.upleex.com'];
    const isFromWebsite =
      allowedDomains.some(domain =>
        url === domain ||
        origin.includes(domain) ||
        referer.includes(domain)
      );

    const isFromMobileApp = url && (url.includes('api/api/v1') || url.includes('web-login-register') && url !== '1upleex.com');

    const generatedOtp = (isFromWebsite && !isFromMobileApp)
      ? Math.floor(100000 + Math.random() * 900000).toString()
      : '123456';

    // Save/Update OTP in database
    await Otp.findOneAndUpdate(
      { phone: number },
      { otp: generatedOtp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
      { upsert: true, new: true }
    );

    // Send real OTP via SMS ONLY for the website
    const shouldSendSms = (isFromWebsite && !isFromMobileApp);
    if (shouldSendSms) {
      await smsService.sendOtp(number, generatedOtp);
    }

    return res.status(httpStatus.OK).json({
      status: 200,
      success: true,
      message: shouldSendSms ? 'OTP sent successfully' : 'Static OTP generated (123456)',
      data: [],
    });
  }

  // Verify OTP
  const otpRecord = await Otp.findOne({ phone: number, otp: otp });

  if (!otpRecord) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid or expired OTP');
  }

  // OTP is valid, delete it so it can't be reused
  await Otp.deleteOne({ _id: otpRecord._id });

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
