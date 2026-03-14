const httpStatus = require('http-status');
const Joi = require('joi');
const { Product } = require('../models');
const VendorKyc = require('../models/vendor/vendorKyc.model');

// Get all vendors with pending product count
const getAllVendors = {
  handler: async (req, res) => {
    try {
      const vendors = await VendorKyc.find({});

      const vendorsWithCount = await Promise.all(
        vendors.map(async (vendor) => {
          const vendorId = vendor.ContactDetails?.vendor_id || '';
          const pendingCount = await Product.countDocuments({
            vendor_id: vendorId,
            approval_status: 'pending'
          });
          
          return {
            _id: vendor._id,
            vendor_id: vendorId,
            full_name: vendor.ContactDetails?.full_name || '',
            business_name: vendor.Identity?.business_name || '',
            email: vendor.ContactDetails?.email || '',
            number: vendor.ContactDetails?.mobile || '',
            pendingCount
          };
        })
      );

      res.status(200).json({
        status: 200,
        data: vendorsWithCount
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Get products by vendor ID
const getVendorProducts = {
  handler: async (req, res) => {
    try {
      const { vendorId } = req.params;
      
      const products = await Product.find({ vendor_id: vendorId }).sort({ createdAt: -1 });

      res.status(200).json({
        status: 200,
        data: products
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Approve single product
const approveProduct = {
  handler: async (req, res) => {
    try {
      const { productId } = req.params;
      const { approval_status } = req.body;
      
      const product = await Product.findByIdAndUpdate(
        productId,
        { approval_status: approval_status || 'approved' },
        { new: true }
      );

      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      res.status(200).json({
        status: 200,
        message: 'Product approved successfully',
        data: product
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Bulk approve products
const bulkApproveProducts = {
  validation: {
    body: Joi.object().keys({
      product_ids: Joi.array().items(Joi.string().required()).min(1).required()
    })
  },
  handler: async (req, res) => {
    try {
      const { product_ids } = req.body;

      await Product.updateMany(
        { _id: { $in: product_ids } },
        { $set: { approval_status: 'approved' } }
      );

      res.status(200).json({
        status: 200,
        message: `${product_ids.length} products approved successfully`
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};



// Bulk reject products
const bulkRejectProducts = {
  validation: {
    body: Joi.object().keys({
      product_ids: Joi.array().items(Joi.string().required()).min(1).required()
    })
  },
  handler: async (req, res) => {
    try {
      const { product_ids } = req.body;

      await Product.updateMany(
        { _id: { $in: product_ids } },
        { $set: { approval_status: 'rejected' } }
      );

      res.status(200).json({
        status: 200,
        message: `${product_ids.length} products rejected successfully`
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

module.exports = {
  getAllVendors,
  getVendorProducts,
  approveProduct,
  bulkApproveProducts,
  bulkRejectProducts
};
