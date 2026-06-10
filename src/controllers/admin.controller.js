const httpStatus = require('http-status');
const Joi = require('joi');
const Admin = require('../models/admin.model');
const { Category, SubCategory } = require('../models');
const { generateAuthTokens } = require('../services/tokenService');
const {
  normalizeSeoLookupKey,
  csvTextToMetadataJson,
  saveMetadataJson,
  readMetadataJson,
  toSeoContent,
  METADATA_JSON_PATH,
} = require('../utils/metadataCsv');

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
      return res.status(httpStatus.BAD_REQUEST).json({ status: 400, message: 'Invalid credentials' });
    }
    const ok = await admin.isPasswordMatch(password);
    if (!ok) {
      return res.status(httpStatus.BAD_REQUEST).json({ status: 400, message: 'Invalid credentials' });
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
        {name: 'dropdowns', displayName: 'Dropdowns' },
        {name: 'quotes', displayName: 'Quotes' },
        {name: 'contact-us', displayName: 'Contact Us' },
        {name: 'vendor-wallets', displayName: 'Vendor Wallets' },
        {name: 'vendor-payments', displayName: 'Vendor Payments' },
        {name: 'metadata', displayName: 'Metadata' },
        {name: 'dynamic-component', displayName: 'Dynamic Component' },
      ];
      return res.status(httpStatus.OK).json({
        status: 200,
        success: true,
        data: pages,
      });
    } catch (error) {
      return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        status: 500,
        success: false,
        message: 'Failed to get available pages'
      });
    }
  },
};

const uploadMetadataCsv = {
  handler: async (req, res) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(httpStatus.BAD_REQUEST).json({
          status: 400,
          success: false,
          message: 'CSV file is required',
        });
      }

      const csvText = req.file.buffer.toString('utf8');
      const metadataJson = csvTextToMetadataJson(csvText, req.file.originalname || 'upload.csv');
      const jsonPath = saveMetadataJson(metadataJson);

      if (!metadataJson.entries.length) {
        return res.status(httpStatus.BAD_REQUEST).json({
          status: 400,
          success: false,
          message: 'CSV is empty or invalid',
        });
      }

      const categories = await Category.find({}, '_id categories_name');
      const subCategories = await SubCategory.find({}, '_id name categoryId');

      const categoryMap = new Map(
        categories.map((item) => [normalizeSeoLookupKey(item.categories_name), item])
      );
      const subCategoryMap = new Map(
        subCategories.map((item) => [normalizeSeoLookupKey(item.name), item])
      );

      const stats = {
        totalRows: metadataJson.entries.length,
        updatedCategories: 0,
        updatedSubCategories: 0,
        skippedRows: 0,
        jsonPath,
        jsonFile: 'category-seo-metadata.json',
      };
      const unmatched = [];

      for (const entry of metadataJson.entries) {
        const categoryName = entry.category || '';
        const subCategoryName = entry.sub_category || '';
        const seoContent = toSeoContent(entry);

        const normalizedSub = normalizeSeoLookupKey(subCategoryName);
        const normalizedCategory = normalizeSeoLookupKey(categoryName);

        if (normalizedSub && subCategoryMap.has(normalizedSub)) {
          const subCategory = subCategoryMap.get(normalizedSub);
          await SubCategory.updateOne(
            { _id: subCategory._id },
            { $set: { seo_content: seoContent } }
          );
          stats.updatedSubCategories += 1;
          continue;
        }

        if (!subCategoryName && normalizedCategory && categoryMap.has(normalizedCategory)) {
          const category = categoryMap.get(normalizedCategory);
          await Category.updateOne(
            { _id: category._id },
            { $set: { seo_content: seoContent } }
          );
          stats.updatedCategories += 1;
          continue;
        }

        stats.skippedRows += 1;
        if (unmatched.length < 50) {
          unmatched.push({
            category: categoryName,
            subCategory: subCategoryName,
            coreKeyword: entry.core_keyword || '',
          });
        }
      }

      return res.status(httpStatus.OK).json({
        status: 200,
        success: true,
        message: 'Metadata CSV converted to JSON and applied successfully',
        data: {
          ...stats,
          unmatched,
          generatedAt: metadataJson.generated_at,
        },
      });
    } catch (error) {
      return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        status: 500,
        success: false,
        message: 'Failed to process metadata CSV',
        error: error.message,
      });
    }
  },
};

const getMetadataJson = {
  handler: async (req, res) => {
    try {
      const json = readMetadataJson();
      if (!json) {
        return res.status(httpStatus.NOT_FOUND).json({
          status: 404,
          success: false,
          message: 'Metadata JSON not found. Upload CSV first.',
        });
      }

      return res.status(httpStatus.OK).json({
        status: 200,
        success: true,
        data: {
          path: METADATA_JSON_PATH,
          file: 'category-seo-metadata.json',
          ...json,
        },
      });
    } catch (error) {
      return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        status: 500,
        success: false,
        message: 'Failed to read metadata JSON',
        error: error.message,
      });
    }
  },
};

const getAllAdmins = {
  handler: async (req, res) => {
    try {      
      // Simple query without complex select
      const admins = await Admin.find({}, 'name email permissions');
      
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
  uploadMetadataCsv,
  getMetadataJson,
};

