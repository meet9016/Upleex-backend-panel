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
    }),
  },
  handler: async (req, res) => {
    const { name, email, phone, password } = req.body;

    const existing = await Admin.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      return res.status(httpStatus.BAD_REQUEST).json({ status: 400, message: 'Email or phone already registered' });
    }

    const admin = await Admin.create({ 
      name, 
      email, 
      phone, 
      password, 
      isVerified: true,
      permissions: [] // New admins start with no permissions
    });
    const token = await generateAuthTokens(admin, 'admin');
    return res.status(httpStatus.CREATED).json({
      status: 200,
      success: true,
      message: 'Admin registered successfully',
      data: { admin, token: token.access },
    });
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

const assignPermissions = {
  validation: {
    body: Joi.object().keys({
      email: Joi.string().email().required(),
      permissions: Joi.array().items(Joi.string()).required(),
    }),
  },
  handler: async (req, res) => {
    try {
      const { email, permissions } = req.body;
      
      const admin = await Admin.findOne({ email });
      if (!admin) {
        return res.status(httpStatus.NOT_FOUND).json({ 
          status: 404, 
          success: false,
          message: 'Admin not found' 
        });
      }
      
      admin.permissions = permissions;
      await admin.save();
      
      return res.status(httpStatus.OK).json({
        status: 200,
        success: true,
        message: 'Permissions assigned successfully',
        data: { 
          email: admin.email, 
          name: admin.name, 
          permissions: admin.permissions 
        },
      });
    } catch (error) {
      console.error('Error assigning permissions:', error);
      return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        status: 500,
        success: false,
        message: 'Failed to assign permissions'
      });
    }
  },
};

const getAvailablePages = {
  handler: async (req, res) => {
    try {
      const pages = [
        { name: 'dashboard', displayName: 'Dashboard' },
        { name: 'products', displayName: 'Products' },
        { name: 'categories', displayName: 'Categories' },
        { name: 'subcategories', displayName: 'Subcategories' },
        { name: 'blogs', displayName: 'Blogs' },
        { name: 'faqs', displayName: 'FAQs' },
        { name: 'admin-permissions', displayName: 'Admin Permissions' },
        { name: 'vendors', displayName: 'Vendors' },
        { name: 'users', displayName: 'Users' },
        { name: 'orders', displayName: 'Orders' },
        { name: 'reports', displayName: 'Reports' },
      ];
      return res.status(httpStatus.OK).json({
        status: 200,
        success: true,
        data: pages,
      });
    } catch (error) {
      console.error('Error getting available pages:', error);
      return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        status: 500,
        success: false,
        message: 'Failed to get available pages'
      });
    }
  },
};

const getAllAdmins = {
  handler: async (req, res) => {
    try {
      console.log('Getting all admins...');
      
      // Simple query without complex select
      const admins = await Admin.find({}, 'name email permissions');
      
      console.log('Found admins:', admins.length);
      
      // Format the response
      const formattedAdmins = admins.map(admin => ({
        name: admin.name,
        email: admin.email,
        permissions: admin.permissions || []
      }));
      
      return res.status(httpStatus.OK).json({
        status: 200,
        success: true,
        data: formattedAdmins,
      });
    } catch (error) {
      console.error('Error getting all admins:', error);
      console.error('Error stack:', error.stack);
      return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        status: 500,
        success: false,
        message: 'Failed to get admins',
        error: error.message
      });
    }
  },
};

const getMyPermissions = {
  handler: async (req, res) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(httpStatus.UNAUTHORIZED).json({
          status: 401,
          success: false,
          message: 'Authentication required'
        });
      }

      const admin = await Admin.findById(req.user.id).select('permissions');
      if (!admin) {
        return res.status(httpStatus.NOT_FOUND).json({
          status: 404,
          success: false,
          message: 'Admin not found'
        });
      }

      return res.status(httpStatus.OK).json({
        status: 200,
        success: true,
        data: { permissions: admin.permissions || [] },
      });
    } catch (error) {
      console.error('Error getting my permissions:', error);
      return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        status: 500,
        success: false,
        message: 'Failed to get permissions'
      });
    }
  },
};


module.exports = {
  register,
  login,
  assignPermissions,
  getAvailablePages,
  getAllAdmins,
  getMyPermissions,
};

