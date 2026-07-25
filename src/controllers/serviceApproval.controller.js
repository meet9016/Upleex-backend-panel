const httpStatus = require('http-status');
const Joi = require('joi');
const { Service } = require('../models');
const VendorKyc = require('../models/vendor/vendorKyc.model');
const Vendor = require('../models/vendor/vendor.model');
const walletService = require('../services/wallet.service');

// Get all vendors with pending service count and services
const getAllVendors = {
  handler: async (req, res) => {
    try {
      const { page, limit, search } = req.query;
      const pageNum = Math.max(parseInt(page) || 1, 1);
      const limitNum = Math.min(Math.max(parseInt(limit) || 10, 1), 100);
      const skip = (pageNum - 1) * limitNum;

      // Step 1: Get ALL services
      const allServices = await Service.find({}).sort({ createdAt: -1 });
      const overallCount = allServices.length;

      // Step 2: Group services by vendor_id
      const allServicesByVendor = {};
      allServices.forEach(service => {
        const vid = service.vendor_id;
        if (!allServicesByVendor[vid]) allServicesByVendor[vid] = [];
        allServicesByVendor[vid].push(service);
      });

      const vendorIdsFromServices = Object.keys(allServicesByVendor);

      // Step 3: Get vendor info from VendorKyc and Vendor
      const [vendorKycs, vendorsFromModel] = await Promise.all([
        VendorKyc.find({
          $or: [
            { 'ContactDetails.vendor_id': { $in: vendorIdsFromServices } },
            { vendor_id: { $in: vendorIdsFromServices } }
          ]
        }),
        Vendor.find({
          $or: [
            { _id: { $in: vendorIdsFromServices } },
            { vendor_id: { $in: vendorIdsFromServices } }
          ]
        })
      ]);

      // Step 4: Create vendor info map
      const vendorInfoMap = {};
      vendorKycs.forEach(v => {
        const vid = v.ContactDetails?.vendor_id || v.vendor_id;
        if (vid) {
          vendorInfoMap[vid] = {
            _id: v._id,
            vendor_id: vid,
            full_name: v.ContactDetails?.full_name || '',
            business_name: v.Identity?.business_name || '',
            email: v.ContactDetails?.email || '',
            number: v.ContactDetails?.mobile || ''
          };
        }
      });

      vendorsFromModel.forEach(v => {
        const vid = String(v._id) || v.vendor_id;
        if (vid) {
          const existing = vendorInfoMap[vid] || {};
          vendorInfoMap[vid] = {
            _id: existing._id || v._id,
            vendor_id: vid,
            full_name: existing.full_name || v.full_name || '',
            business_name: existing.business_name || v.business_name || '',
            email: existing.email || v.email || '',
            number: existing.number || v.mobile || ''
          };
        }
      });

      // Step 5: Build vendor list with services
      let vendorList = [];
      vendorIdsFromServices.forEach(vid => {
        const vendorInfo = vendorInfoMap[vid] || {
          _id: vid,
          vendor_id: vid,
          full_name: 'Unknown Vendor',
          business_name: 'Unknown Business',
          email: '',
          number: ''
        };

        const services = allServicesByVendor[vid] || [];
        const pending = services.filter(s => s.approval_status === 'pending').length;
        const approved = services.filter(s => s.approval_status === 'approved').length;
        const rejected = services.filter(s => s.approval_status === 'rejected').length;

        vendorList.push({
          ...vendorInfo,
          pendingCount: pending,
          services,
          counts: { pending, approved, rejected }
        });
      });

      if (search) {
        const searchRegex = new RegExp(search, 'i');
        vendorList = vendorList.filter(v => 
          searchRegex.test(v.full_name) || searchRegex.test(v.business_name)
        );
      }

      // Sort vendors by number of services (descending)
      vendorList.sort((a, b) => (b.services?.length || 0) - (a.services?.length || 0));

      // Step 6: Apply pagination
      const total = vendorList.length;
      const paginatedVendors = vendorList.slice(skip, skip + limitNum);

      res.status(200).json({
        status: 200,
        data: paginatedVendors,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        overallCount
      });
    } catch (error) {
      console.error('❌ [getAllVendors] Error:', error);
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
        const isDemo = await walletService.isDemoVendor(service.vendor_id);
        if (!isDemo) {
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

      // Send notification to vendor
      try {
        const { sendNotificationToVendor } = require('../services/vendorNotification.service');
        if (newStatus === 'approved') {
          await sendNotificationToVendor(vendorId, 'Service Approved! ✅', `Your service "${updatedService.service_name}" has been approved.`, 'product_update', { serviceId: String(updatedService._id), status: 'approved' });
        } else if (newStatus === 'rejected') {
          await sendNotificationToVendor(vendorId, 'Service Rejected', `Your service "${updatedService.service_name}" has been rejected.`, 'product_update', { serviceId: String(updatedService._id), status: 'rejected' });
        }
      } catch (notifErr) {
        console.error('Vendor service notification error:', notifErr);
      }

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
        const isDemo = await walletService.isDemoVendor(service.vendor_id);
        if (isDemo) continue;

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

      // Send FCM notifications to vendors (background)
      const sendBulkServiceApproveNotifs = async () => {
        try {
          const { sendNotificationToVendor } = require('../services/vendorNotification.service');
          for (const s of services) {
            await sendNotificationToVendor(s.vendor_id, 'Service Approved! ✅', `Your service "${s.service_name}" has been approved.`, 'product_update', { serviceId: String(s._id), status: 'approved' });
          }
        } catch (e) { console.error('Bulk service approve notification error:', e); }
      };
      sendBulkServiceApproveNotifs();

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

      // Send FCM notifications to vendors (background)
      const sendBulkServiceRejectNotifs = async () => {
        try {
          const { sendNotificationToVendor } = require('../services/vendorNotification.service');
          const rejectedServices = await Service.find({ _id: { $in: service_ids } }, 'vendor_id service_name').lean();
          for (const s of rejectedServices) {
            await sendNotificationToVendor(s.vendor_id, 'Service Rejected', `Your service "${s.service_name}" has been rejected.`, 'product_update', { serviceId: String(s._id), status: 'rejected' });
          }
        } catch (e) { console.error('Bulk service reject notification error:', e); }
      };
      sendBulkServiceRejectNotifs();

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
