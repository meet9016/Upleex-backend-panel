const httpStatus = require('http-status');
const Joi = require('joi');
const Admin = require('../models/admin.model');
const { generateAuthTokens } = require('../services/tokenService');

const register = {
  validation: {
    body: Joi.object().keys({
      name: Joi.string().trim().required(),
      email: Joi.string().email().required(),
      phone: Joi.string().required(),
      password: Joi.string().min(6).required(),
      otp: Joi.string().allow(''),
    }),
  },
  handler: async (req, res) => {
    const { name, email, phone, password, otp } = req.body;

    const existing = await Admin.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      return res.status(httpStatus.BAD_REQUEST).json({ status: 400, message: 'Email or phone already registered' });
    }

    if (!otp) {
      return res.status(httpStatus.OK).json({ status: 200, message: 'OTP sent successfully', data: [] });
    }
    if (otp !== '123456') {
      return res.status(httpStatus.BAD_REQUEST).json({ status: 400, message: 'Invalid OTP' });
    }

    const admin = await Admin.create({ name, email, phone, password, isVerified: true });
    const token = await generateAuthTokens(admin, 'admin');
    return res.status(httpStatus.CREATED).json({
      status: 200,
      success: true,
      message: 'Admin registered successfully',
      data: { admin, token: token.access },
    });
  },
};

const sendOtp = {
  validation: {
    body: Joi.object().keys({
      email: Joi.string().email().allow(''),
      phone: Joi.string().allow(''),
    }),
  },
  handler: async (req, res) => {
    // Dummy OTP flow for now
    return res.status(httpStatus.OK).json({ status: 200, message: 'OTP sent successfully', data: [] });
  },
};

const verifyOtp = {
  validation: {
    body: Joi.object().keys({
      email: Joi.string().email().allow(''),
      phone: Joi.string().allow(''),
      otp: Joi.string().required(),
    }),
  },
  handler: async (req, res) => {
    const { otp } = req.body;
    if (otp !== '123456') {
      return res.status(httpStatus.BAD_REQUEST).json({ status: 400, message: 'Invalid OTP' });
    }
    return res.status(httpStatus.OK).json({ status: 200, message: 'OTP verified', data: [] });
  },
};

const login = {
  validation: {
    body: Joi.object().keys({
      email: Joi.string().email().required(),
      password: Joi.string().required(),
    }),
  },
  handler: async (req, res) => {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(httpStatus.UNAUTHORIZED).json({ status: 401, message: 'Invalid credentials' });
    }
    const ok = await admin.isPasswordMatch(password);
    if (!ok) {
      return res.status(httpStatus.UNAUTHORIZED).json({ status: 401, message: 'Invalid credentials' });
    }
    const token = await generateAuthTokens(admin, 'admin');
    return res.status(httpStatus.OK).json({
      status: 200,
      success: true,
      message: 'Login successful',
      data: { admin, token: token.access },
    });
  },
};

module.exports = {
  register,
  login,
  sendOtp,
  verifyOtp,
};

