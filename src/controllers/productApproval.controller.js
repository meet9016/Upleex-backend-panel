const httpStatus = require('http-status');
const Joi = require('joi');
const { Product, ProductMonth, ProductType, Category, SubCategory } = require('../models');
const VendorKyc = require('../models/vendor/vendorKyc.model');
const Vendor = require('../models/vendor/vendor.model');
const walletService = require('../services/wallet.service');
const { sendProductApprovalEmail } = require('../services/email.service');

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
  validation: {
    body: Joi.object().keys({
      approval_status: Joi.string().valid('approved', 'rejected', 'pending').optional(),
      rejection_reason: Joi.string().allow('').optional()
    })
  },
  handler: async (req, res) => {
    try {
      const { productId } = req.params;
      const { approval_status, rejection_reason } = req.body;
      
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      const newStatus = approval_status || 'approved';
      
      // If the product is already approved and we are trying to approve it again, return early
      if (product.approval_status === 'approved' && newStatus === 'approved') {
        return res.status(400).json({ message: 'Product is already approved' });
      }

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
        } catch (walletError) {
          return res.status(httpStatus.BAD_REQUEST).json({
            message: 'Failed to process wallet payment during approval. Please try again.'
          });
        }
      }
      
      // Update product approval status
      let updateData = { 
        approval_status: newStatus,
        rejection_reason: newStatus === 'rejected' ? (rejection_reason || '') : ''
      };

      // If approving a free product, set free listing expiry (30 days from now)
      if (newStatus === 'approved' && product.pricing_type === 'free') {
        const freeExpiryDate = new Date();
        freeExpiryDate.setDate(freeExpiryDate.getDate() + 30); // 30 days free listing
        
        updateData.expires_at = freeExpiryDate;
        updateData.free_listing_expires_at = freeExpiryDate;
        updateData.free_listing_remaining_days = 30;
      }

      const updatedProduct = await Product.findByIdAndUpdate(
        productId,
        updateData,
        { new: true }
      );

      // Send email notification to vendor
      let vendorEmail = '';
      let vendorName = 'Vendor';
      try {
        
        // 1. Primary source: Vendor model
        let vendorDoc = await Vendor.findById(updatedProduct.vendor_id);
        if (vendorDoc) {
          vendorEmail = vendorDoc.email;
          vendorName = vendorDoc.full_name || 'Vendor';
        } else {
          vendorDoc = await Vendor.findOne({ vendor_id: updatedProduct.vendor_id });
          if (vendorDoc) {
            vendorEmail = vendorDoc.email;
            vendorName = vendorDoc.full_name || 'Vendor';
          }
        }

        // 2. Secondary source / Fallback: VendorKyc
        if (!vendorEmail) {
          let kycDoc = await VendorKyc.findOne({ 'ContactDetails.vendor_id': updatedProduct.vendor_id });
          if (!kycDoc) {
            kycDoc = await VendorKyc.findOne({ vendor_id: updatedProduct.vendor_id });
          }

          if (kycDoc && kycDoc.ContactDetails && kycDoc.ContactDetails.email) {
            vendorEmail = kycDoc.ContactDetails.email;
            vendorName = vendorName === 'Vendor' ? (kycDoc.ContactDetails.full_name || 'Vendor') : vendorName;
          }
        }
        
        if (vendorEmail) {
          // If rejection reason is missing, provide a professional default
          const finalReason = (newStatus === 'rejected' && (!rejection_reason || rejection_reason.trim() === ''))
            ? 'Product does not meet our quality standards or guidelines.'
            : rejection_reason;

          await sendProductApprovalEmail(
            vendorEmail,
            vendorName,
            updatedProduct.product_name,
            newStatus,
            finalReason || '',
            {
              image: updatedProduct.product_main_image,
              category: updatedProduct.category_name,
              price: updatedProduct.price,
              sku: updatedProduct.sku
            }
          );
        } else {
          console.warn(`CRITICAL WARNING: No email found for vendor_id: "${updatedProduct.vendor_id}" in Vendor or VendorKyc!`);
        }
      } catch (emailError) {
        console.error('ERROR in email notification logic:', emailError);
      }

      const vendorId = updatedProduct.vendor_id;
      const pending = await Product.countDocuments({ vendor_id: vendorId, approval_status: 'pending' });
      const approved = await Product.countDocuments({ vendor_id: vendorId, approval_status: 'approved' });
      const rejected = await Product.countDocuments({ vendor_id: vendorId, approval_status: 'rejected' });

      // Send FCM notification to vendor
      try {
        const { sendNotificationToVendor } = require('../services/vendorNotification.service');
        if (newStatus === 'approved') {
          await sendNotificationToVendor(vendorId, 'Product Approved! ✅', `Your product "${updatedProduct.product_name}" has been approved.`, 'product_update', { productId: String(updatedProduct._id), status: 'approved' });
        } else if (newStatus === 'rejected') {
          await sendNotificationToVendor(vendorId, 'Product Rejected', `Your product "${updatedProduct.product_name}" has been rejected.`, 'product_update', { productId: String(updatedProduct._id), status: 'rejected' });
        }
      } catch (notifErr) {
        console.error('Vendor notification error:', notifErr);
      }

      const message = newStatus === 'approved' && product.pricing_type === 'paid'
        ? 'Product approved successfully. ₹10 deducted from vendor wallet.'
        : `Product ${newStatus} successfully`;

      res.status(200).json({
        status: 200,
        message: message,
        vendor_id: vendorId,
        vendor_email: vendorEmail,
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
          } catch (walletError) {
            return res.status(httpStatus.BAD_REQUEST).json({
              message: `Failed to process wallet payment for product: ${product.product_name}. Please try again.`
            });
          }
        }
      }

      // Update all products to approved
      await Product.updateMany(
        { _id: { $in: product_ids } },
        { $set: { approval_status: 'approved', rejection_reason: '' } }
      );

      // Send email notifications (background-ish)
      const sendEmails = async () => {
        try {
          const approvedProducts = await Product.find({ _id: { $in: product_ids } });
          const vendorIds = [...new Set(approvedProducts.map(p => p.vendor_id))];
          
          // Fetch vendors from both models for robustness
          const [vendors, kycs] = await Promise.all([
            Vendor.find({ _id: { $in: vendorIds } }),
            VendorKyc.find({
              $or: [
                { 'ContactDetails.vendor_id': { $in: vendorIds } },
                { 'vendor_id': { $in: vendorIds } }
              ]
            })
          ]);
          
          const vendorMap = {};
          
          // Kyc as fallback
          kycs.forEach(v => {
            const vid = v.ContactDetails?.vendor_id || v.vendor_id;
            if (vid) {
              vendorMap[vid] = {
                email: v.ContactDetails?.email,
                name: v.ContactDetails?.full_name || 'Vendor'
              };
            }
          });

          // Vendor model takes precedence
          vendors.forEach(v => {
            vendorMap[v._id.toString()] = {
              email: v.email,
              name: v.full_name || 'Vendor'
            };
          });
  
          for (const product of approvedProducts) {
            const vendorInfo = vendorMap[product.vendor_id];
            if (vendorInfo && vendorInfo.email) {
              await sendProductApprovalEmail(
                vendorInfo.email,
                vendorInfo.name,
                product.product_name,
                'approved',
                '',
                {
                  image: product.product_main_image,
                  category: product.category_name,
                  price: product.price,
                  sku: product.sku
                }
              );
            } else {
              console.warn(`Could not find vendor email for product ${product._id} (vendor_id: ${product.vendor_id})`);
            }
          }
        } catch (emailError) {
          console.error('Error sending bulk approval emails:', emailError);
        }
      };
      sendEmails(); // Run in background

      // Send FCM notifications to vendors (background)
      const sendBulkApproveNotifications = async () => {
        try {
          const { sendNotificationToVendor } = require('../services/vendorNotification.service');
          for (const p of products) {
            await sendNotificationToVendor(p.vendor_id, 'Product Approved! ✅', `Your product "${p.product_name}" has been approved.`, 'product_update', { productId: String(p._id), status: 'approved' });
          }
        } catch (e) { console.error('Bulk approve notification error:', e); }
      };
      sendBulkApproveNotifications();

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
      product_ids: Joi.array().items(Joi.string().required()).min(1).required(),
      rejection_reason: Joi.string().allow('').optional()
    })
  },
  handler: async (req, res) => {
    try {
      const { product_ids, rejection_reason } = req.body;

      await Product.updateMany(
        { _id: { $in: product_ids } },
        { $set: { approval_status: 'rejected', rejection_reason: rejection_reason || '' } }
      );

      // Send email notifications (background-ish)
      const sendEmails = async () => {
        try {
          const rejectedProducts = await Product.find({ _id: { $in: product_ids } });
          const vendorIds = [...new Set(rejectedProducts.map(p => p.vendor_id))];
          
          // Fetch vendors from both models for robustness
          const [vendors, kycs] = await Promise.all([
            Vendor.find({ _id: { $in: vendorIds } }),
            VendorKyc.find({
              $or: [
                { 'ContactDetails.vendor_id': { $in: vendorIds } },
                { 'vendor_id': { $in: vendorIds } }
              ]
            })
          ]);
          
          const vendorMap = {};
          
          // Kyc as fallback
          kycs.forEach(v => {
            const vid = v.ContactDetails?.vendor_id || v.vendor_id;
            if (vid) {
              vendorMap[vid] = {
                email: v.ContactDetails?.email,
                name: v.ContactDetails?.full_name || 'Vendor'
              };
            }
          });

          // Vendor model takes precedence
          vendors.forEach(v => {
            vendorMap[v._id.toString()] = {
              email: v.email,
              name: v.full_name || 'Vendor'
            };
          });
 
          for (const product of rejectedProducts) {
            const vendorInfo = vendorMap[product.vendor_id];
            if (vendorInfo && vendorInfo.email) {
              const vendorEmail = vendorInfo.email;
              
              // If rejection reason is missing, provide a professional default
              const finalReason = (!rejection_reason || rejection_reason.trim() === '')
                ? 'Product does not meet our quality standards or guidelines.'
                : rejection_reason;

            await sendProductApprovalEmail(
                vendorEmail,
                vendorInfo.name,
                product.product_name,
                'rejected',
                finalReason || '',
                {
                  image: product.product_main_image,
                  category: product.category_name,
                  price: product.price,
                  sku: product.sku
                }
              );
            } else {
              console.warn(`Could not find vendor email for product ${product._id} (vendor_id: ${product.vendor_id})`);
            }
          }
        } catch (emailError) {
          console.error('Error sending bulk rejection emails:', emailError);
        }
      };
      sendEmails(); // Run in background

      // Send FCM notifications to vendors (background)
      const sendBulkRejectNotifications = async () => {
        try {
          const { sendNotificationToVendor } = require('../services/vendorNotification.service');
          const rejectedProducts = await Product.find({ _id: { $in: product_ids } }, 'vendor_id product_name').lean();
          for (const p of rejectedProducts) {
            await sendNotificationToVendor(p.vendor_id, 'Product Rejected', `Your product "${p.product_name}" has been rejected.`, 'product_update', { productId: String(p._id), status: 'rejected' });
          }
        } catch (e) { console.error('Bulk reject notification error:', e); }
      };
      sendBulkRejectNotifications();

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
