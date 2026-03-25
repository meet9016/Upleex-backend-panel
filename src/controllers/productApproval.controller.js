const httpStatus = require('http-status');
const Joi = require('joi');
const { Product } = require('../models');
const VendorKyc = require('../models/vendor/vendorKyc.model');
const walletService = require('../services/wallet.service');

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
      const pending = products.filter(p => p.approval_status === 'pending').length;
      const approved = products.filter(p => p.approval_status === 'approved').length;
      const rejected = products.filter(p => p.approval_status === 'rejected').length;

      res.status(200).json({
        status: 200,
        data: { products, counts: { pending, approved, rejected } }
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
      
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      if (product.approval_status === 'approved') {
        return res.status(400).json({ message: 'Product is already approved' });
      }

      const newStatus = approval_status || 'approved';
      
      // If approving a paid product, deduct money from wallet
      if (newStatus === 'approved' && product.pricing_type === 'paid') {
        const hasBalance = await walletService.hasSufficientBalance(product.vendor_id, 10);
        
        if (!hasBalance) {
          return res.status(httpStatus.BAD_REQUEST).json({
            message: 'Vendor has insufficient wallet balance. Cannot approve paid listing.'
          });
        }
        
        try {
          await walletService.deductMoneyFromWallet(
            product.vendor_id,
            10,
            `Base (Paid listing) fee for approved product: ${product.product_name}`,
            {
              purpose: 'paid_listing_fee',
              product_name: product.product_name,
              product_id: product._id,
              category_id: product.category_id,
              sub_category_id: product.sub_category_id,
            }
          );
          console.log(`💰 Deducted ₹10 from vendor ${product.vendor_id} wallet for approved paid listing`);
        } catch (walletError) {
          console.error('Wallet deduction failed during approval:', walletError);
          return res.status(httpStatus.BAD_REQUEST).json({
            message: 'Failed to process wallet payment during approval. Please try again.'
          });
        }
      }
      
      // Update product approval status
      const updatedProduct = await Product.findByIdAndUpdate(
        productId,
        { approval_status: newStatus },
        { new: true }
      );

      const vendorId = updatedProduct.vendor_id;
      const pending = await Product.countDocuments({ vendor_id: vendorId, approval_status: 'pending' });
      const approved = await Product.countDocuments({ vendor_id: vendorId, approval_status: 'approved' });
      const rejected = await Product.countDocuments({ vendor_id: vendorId, approval_status: 'rejected' });

      const message = newStatus === 'approved' && product.pricing_type === 'paid'
        ? 'Product approved successfully. ₹10 deducted from vendor wallet.'
        : `Product ${newStatus} successfully`;

      res.status(200).json({
        status: 200,
        message: message,
        vendor_id: vendorId,
        counts: { pending, approved, rejected },
        data: updatedProduct
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

      // Get all products to be approved
      const products = await Product.find({ _id: { $in: product_ids } });
      
      // Check wallet balance for paid products and deduct money
      for (const product of products) {
        if (product.approval_status !== 'approved' && product.pricing_type === 'paid') {
          const hasBalance = await walletService.hasSufficientBalance(product.vendor_id, 10);
          
          if (!hasBalance) {
            return res.status(httpStatus.BAD_REQUEST).json({
              message: `Vendor ${product.vendor_name || product.vendor_id} has insufficient wallet balance for product: ${product.product_name}`
            });
          }
          
          try {
            await walletService.deductMoneyFromWallet(
              product.vendor_id,
              10,
              `Base (Paid listing) fee for approved product: ${product.product_name}`,
              {
                purpose: 'paid_listing_fee',
                product_name: product.product_name,
                product_id: product._id,
                category_id: product.category_id,
                sub_category_id: product.sub_category_id,
              }
            );
            console.log(`💰 Deducted ₹10 from vendor ${product.vendor_id} wallet for bulk approved paid listing`);
          } catch (walletError) {
            console.error('Wallet deduction failed during bulk approval:', walletError);
            return res.status(httpStatus.BAD_REQUEST).json({
              message: `Failed to process wallet payment for product: ${product.product_name}. Please try again.`
            });
          }
        }
      }

      // Update all products to approved
      await Product.updateMany(
        { _id: { $in: product_ids } },
        { $set: { approval_status: 'approved' } }
      );

      const vendors = await Product.find({ _id: { $in: product_ids } }, 'vendor_id').lean();
      const vendorIds = [...new Set(vendors.map(v => String(v.vendor_id || '')))].filter(Boolean);
      const countsByVendor = {};
      for (const vid of vendorIds) {
        const pending = await Product.countDocuments({ vendor_id: vid, approval_status: 'pending' });
        const approved = await Product.countDocuments({ vendor_id: vid, approval_status: 'approved' });
        const rejected = await Product.countDocuments({ vendor_id: vid, approval_status: 'rejected' });
        countsByVendor[vid] = { pending, approved, rejected };
      }

      const paidProductsCount = products.filter(p => p.pricing_type === 'paid').length;
      const message = paidProductsCount > 0 
        ? `${product_ids.length} products approved successfully. ₹${paidProductsCount * 10} total deducted from vendor wallets.`
        : `${product_ids.length} products approved successfully`;

      res.status(200).json({
        status: 200,
        message: message,
        countsByVendor
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

      const vendors = await Product.find({ _id: { $in: product_ids } }, 'vendor_id').lean();
      const vendorIds = [...new Set(vendors.map(v => String(v.vendor_id || '')))].filter(Boolean);
      const countsByVendor = {};
      for (const vid of vendorIds) {
        const pending = await Product.countDocuments({ vendor_id: vid, approval_status: 'pending' });
        const approved = await Product.countDocuments({ vendor_id: vid, approval_status: 'approved' });
        const rejected = await Product.countDocuments({ vendor_id: vid, approval_status: 'rejected' });
        countsByVendor[vid] = { pending, approved, rejected };
      }

      res.status(200).json({
        status: 200,
        message: `${product_ids.length} products rejected successfully`,
        countsByVendor
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
