const httpStatus = require('http-status');
const Joi = require('joi');
const { Service } = require('../models');
const VendorKyc = require('../models/vendor/vendorKyc.model');

// Get all vendors with pending service count
const getAllVendors = {
  handler: async (req, res) => {
    try {
      const vendors = await VendorKyc.find({});

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
        data: vendorsWithCount
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
  handler: async (req, res) => {
    try {
      const { serviceId } = req.params;
      const { approval_status } = req.body;
      
      const service = await Service.findByIdAndUpdate(
        serviceId,
        { approval_status: approval_status || 'approved' },
        { new: true }
      );

      if (!service) {
        return res.status(404).json({ message: 'Service not found' });
      }

      const vendorId = service.vendor_id;
      const pending = await Service.countDocuments({ vendor_id: vendorId, approval_status: 'pending' });
      const approved = await Service.countDocuments({ vendor_id: vendorId, approval_status: 'approved' });
      const rejected = await Service.countDocuments({ vendor_id: vendorId, approval_status: 'rejected' });

      res.status(200).json({
        status: 200,
        message: 'Service status updated',
        vendor_id: vendorId,
        counts: { pending, approved, rejected },
        data: service
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
