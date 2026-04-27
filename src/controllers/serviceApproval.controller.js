const httpStatus = require('http-status');
const Joi = require('joi');
const { Service } = require('../models');
const VendorKyc = require('../models/vendor/vendorKyc.model');
const Vendor = require('../models/vendor/vendor.model');
const walletService = require('../services/wallet.service');

// Get all vendors with pending service count
const getAllVendors = {
  handler: async (req, res) => {
    try {
      const { page, limit } = req.query;
      const pageNum = Math.max(parseInt(page) || 1, 1);
      const limitNum = Math.min(Math.max(parseInt(limit) || 10, 1), 100);
      const skip = (pageNum - 1) * limitNum;

      // Only fetch vendors who can provide services (vendor_type: 'service' or 'both')
      const eligibleVendors = await Vendor.find(
        { vendor_type: { $in: ['service', 'both'] } },
        { _id: 1 }
      ).lean();
      const eligibleVendorIds = eligibleVendors.map(v => String(v._id));

      const total = await VendorKyc.countDocuments({
        'ContactDetails.vendor_id': { $in: eligibleVendorIds }
      });

      const vendors = await VendorKyc.find({
        'ContactDetails.vendor_id': { $in: eligibleVendorIds }
      }).skip(skip).limit(limitNum);

      const vendorsWithCount = await Promise.all(
        vendors.map(async (vendor) => {
          const vendorId = vendor.ContactDetails?.vendor_id || '';
          const pendingCount = await Service.countDocuments({
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
        data: vendorsWithCount,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum)
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Get services by vendor ID
const getVendorServices = {
  handler: async (req, res) => {
    try {
      const { vendorId } = req.params;
      const services = await Service.find({ vendor_id: vendorId }).sort({ createdAt: -1 });
      const pending = services.filter(s => s.approval_status === 'pending').length;
      const approved = services.filter(s => s.approval_status === 'approved').length;
      const rejected = services.filter(s => s.approval_status === 'rejected').length;

      res.status(200).json({
        status: 200,
        data: { services, counts: { pending, approved, rejected } }
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Approve single service
const approveService = {
  validation: {
    body: Joi.object().keys({
      approval_status: Joi.string().valid('approved', 'rejected', 'pending').optional(),
      rejection_reason: Joi.string().allow('').optional()
    })
  },
  handler: async (req, res) => {
    try {
      const { serviceId } = req.params;
      const { approval_status } = req.body;
      
      const service = await Service.findById(serviceId);
      if (!service) {
        return res.status(404).json({ message: 'Service not found' });
      }

      const newStatus = approval_status || 'approved';

      // If already approved, avoid double deduction
      if (service.approval_status === 'approved' && newStatus === 'approved') {
        return res.status(400).json({ message: 'Service is already approved' });
      }

      // Deduct ₹29 on approval
      if (newStatus === 'approved') {
        const hasBalance = await walletService.hasSufficientBalance(service.vendor_id, 29);
        if (!hasBalance) {
          return res.status(httpStatus.BAD_REQUEST).json({
            message: 'Vendor has insufficient wallet balance for Service Listing Fee (₹29).'
          });
        }

        try {
          await walletService.deductMoneyFromWallet(
            service.vendor_id,
            29,
            `Listing fee for approved service: ${service.service_name}`,
            {
              purpose: 'service_listing_fee',
              service_name: service.service_name,
              service_id: service._id,
            }
          );
        } catch (walletError) {
          return res.status(httpStatus.BAD_REQUEST).json({
            message: 'Failed to process wallet payment for Service approval.'
          });
        }
      }

      const updatedService = await Service.findByIdAndUpdate(
        serviceId,
        { approval_status: newStatus },
        { new: true }
      );

      const vendorId = updatedService.vendor_id;
      const pending = await Service.countDocuments({ vendor_id: vendorId, approval_status: 'pending' });
      const approved = await Service.countDocuments({ vendor_id: vendorId, approval_status: 'approved' });
      const rejected = await Service.countDocuments({ vendor_id: vendorId, approval_status: 'rejected' });

      const message = newStatus === 'approved' 
        ? 'Service approved successfully. ₹29 deducted from vendor wallet.'
        : `Service ${newStatus} successfully`;

      res.status(200).json({
        status: 200,
        message: message,
        vendor_id: vendorId,
        counts: { pending, approved, rejected },
        data: updatedService
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Bulk approve services
const bulkApproveServices = {
  validation: {
    body: Joi.object().keys({
      service_ids: Joi.array().items(Joi.string().required()).min(1).required()
    })
  },
  handler: async (req, res) => {
    try {
      const { service_ids } = req.body;

      // Check balance for all to-be-approved services
      const services = await Service.find({ _id: { $in: service_ids }, approval_status: { $ne: 'approved' } });
      for (const service of services) {
        const hasBalance = await walletService.hasSufficientBalance(service.vendor_id, 29);
        if (!hasBalance) {
          return res.status(httpStatus.BAD_REQUEST).json({
            message: `Vendor for service "${service.service_name}" has insufficient wallet balance (₹29 required).`
          });
        }
        
        try {
          await walletService.deductMoneyFromWallet(
            service.vendor_id,
            29,
            `Listing fee for approved service: ${service.service_name}`,
            {
              purpose: 'service_listing_fee',
              service_name: service.service_name,
              service_id: service._id,
            }
          );
        } catch (walletError) {
          return res.status(httpStatus.BAD_REQUEST).json({
            message: `Failed to process wallet payment for service "${service.service_name}".`
          });
        }
      }

      await Service.updateMany(
        { _id: { $in: service_ids } },
        { $set: { approval_status: 'approved' } }
      );

      const vendors = await Service.find({ _id: { $in: service_ids } }, 'vendor_id').lean();
      const vendorIds = [...new Set(vendors.map(v => String(v.vendor_id || '')))].filter(Boolean);
      const countsByVendor = {};
      for (const vid of vendorIds) {
        const pending = await Service.countDocuments({ vendor_id: vid, approval_status: 'pending' });
        const approved = await Service.countDocuments({ vendor_id: vid, approval_status: 'approved' });
        const rejected = await Service.countDocuments({ vendor_id: vid, approval_status: 'rejected' });
        countsByVendor[vid] = { pending, approved, rejected };
      }

      res.status(200).json({
        status: 200,
        message: `${service_ids.length} services approved successfully`,
        countsByVendor
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Bulk reject services
const bulkRejectServices = {
  validation: {
    body: Joi.object().keys({
      service_ids: Joi.array().items(Joi.string().required()).min(1).required()
    })
  },
  handler: async (req, res) => {
    try {
      const { service_ids } = req.body;

      await Service.updateMany(
        { _id: { $in: service_ids } },
        { $set: { approval_status: 'rejected' } }
      );

      const vendors = await Service.find({ _id: { $in: service_ids } }, 'vendor_id').lean();
      const vendorIds = [...new Set(vendors.map(v => String(v.vendor_id || '')))].filter(Boolean);
      const countsByVendor = {};
      for (const vid of vendorIds) {
        const pending = await Service.countDocuments({ vendor_id: vid, approval_status: 'pending' });
        const approved = await Service.countDocuments({ vendor_id: vid, approval_status: 'approved' });
        const rejected = await Service.countDocuments({ vendor_id: vid, approval_status: 'rejected' });
        countsByVendor[vid] = { pending, approved, rejected };
      }

      res.status(200).json({
        status: 200,
        message: `${service_ids.length} services rejected successfully`,
        countsByVendor
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

module.exports = {
  getAllVendors,
  getVendorServices,
  approveService,
  bulkApproveServices,
  bulkRejectServices
};
