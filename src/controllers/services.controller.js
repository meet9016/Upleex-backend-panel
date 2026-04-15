const httpStatus = require('http-status');
const Joi = require('joi');
const mongoose = require('mongoose');
const Service = require('../models/service.model');
const ServiceCategory = require('../models/serviceCategory.model');
const VendorKyc = require('../models/vendor/vendorKyc.model');
const ServicePriorityPlanPurchase = require('../models/servicePriorityPlanPurchase.model');

const { uploadToExternalService, updateFileOnExternalService, deleteFileFromExternalService } = require('../utils/fileUpload');
const catchAsync = require('../utils/catchAsync');

const createService = {
  validation: {
    body: Joi.object().keys({
      service_name: Joi.string().required(),
      category_id: Joi.string().required(),
      price: Joi.string().required(),
      duration: Joi.string().allow(''),
      description: Joi.string().allow(''),
      billing_type: Joi.string().valid('day', 'month', 'hourly').allow(''),
      location: Joi.string().allow(''),
      sub_images: Joi.array().items(Joi.string()).allow(null),
    }).prefs({ convert: true }),
  },
  handler: async (req, res) => {
    try {
      const data = req.body;

      if (req.user) {
        data.vendor_id = req.user.id || req.user._id || '';
        data.vendor_name = req.user.name || '';
      }

      if (!data.vendor_id) {
        return res.status(401).json({ message: 'Vendor authentication required' });
      }

      if (data.category_id) {
        const catDoc = await ServiceCategory.findById(data.category_id);
        if (catDoc) {
          data.category_name = catDoc.name;
        }
      }

      const files = req.files || {};
      const imageFile = files['image'] && files['image'][0];
      if (imageFile) {
        data.image = await uploadToExternalService(imageFile, 'service_images');
      }

      // Handle sub_images
      if (files['sub_images']) {
        const subImageFiles = files['sub_images'].slice(0, 4);
        data.sub_images = await Promise.all(
          subImageFiles.map(file => uploadToExternalService(file, 'service_sub_images'))
        );
      }

      const existing = await Service.findOne({
        service_name: data.service_name,
        category_id: data.category_id,
        vendor_id: data.vendor_id,
      });

      if (existing) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: 'Service with this name already exists' });
      }

      data.status = 'active';
      data.approval_status = 'pending';
      
      // Set initial service expiry (1 month from creation for ₹29 service fee)
      const moment = require('moment');
      data.expires_at = moment().add(1, 'month').toDate();
      data.service_fee_paid = true;
      
      // Set initial listing expiry (1 month from creation for ₹29 listing fee)
      data.listing_expires_at = moment().add(1, 'month').toDate();
      data.listing_fee_paid = true;

      const service = await Service.create(data);

      // Check if vendor has active priority plan and apply it to new service
      const activePriorityPlan = await ServicePriorityPlanPurchase.findOne({
        vendor_id: data.vendor_id,
        expire_at: { $gt: new Date() }
      }).sort({ createdAt: -1 });

      if (activePriorityPlan) {
        // Apply priority to the new service
        await Service.findByIdAndUpdate(service._id, {
          is_priority: true,
          priority_expires_at: activePriorityPlan.expire_at
        });

        // Add service ID to the priority plan purchase record
        await ServicePriorityPlanPurchase.findByIdAndUpdate(activePriorityPlan._id, {
          $addToSet: { service_ids: service._id }
        });

        console.log(`Applied priority plan to new service: ${service.service_name}`);
      }

      return res.status(200).json({
        status: 200,
        message: 'Service created successfully',
        data: service,
      });
    } catch (error) {
      console.error('Create service error:', error);
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const getAllServices = {
  handler: async (req, res) => {
    try {
      const { search, category_id, status, sortBy, order, city } = req.query;
      const query = {};

      // First, update expired priority plans
      const now = new Date();
      await Service.updateMany(
        {
          is_priority: true,
          priority_expires_at: { $lt: now }
        },
        {
          $set: { is_priority: false }
        }
      );

      // Move expired services to draft status
      await Service.updateMany(
        {
          expires_at: { $lt: now },
          status: { $in: ['active', 'inactive'] }
        },
        {
          $set: { status: 'draft' }
        }
      );

      // Hide expired listing services (set status to inactive)
      await Service.updateMany(
        {
          listing_expires_at: { $lt: now },
          status: 'active'
        },
        {
          $set: { status: 'inactive' }
        }
      );

      if (req.user && req.user.userType === 'vendor') {
        query.vendor_id = req.user.id || req.user._id;
        // For vendors, show all their services regardless of listing expiry
      } else {
        query.approval_status = 'approved';
        // For public, only show services with active listings
        query.$or = [
          { listing_expires_at: { $gt: now } },
          { listing_expires_at: { $exists: false } } // For backward compatibility
        ];
      }

      if (city) {
        const raw = String(city).trim();
        const parts = raw.split('-');
        const cityName = parts.length > 1 ? parts[parts.length - 1] : raw;
        const cityNameRegex = new RegExp(String(cityName).trim(), 'i');
        const vendors = await VendorKyc.find(
          {
            $or: [
              { 'ContactDetails.city_id': raw },
              { 'ContactDetails.city_id': { $regex: cityNameRegex } },
              { 'ContactDetails.city_name': cityNameRegex },
            ],
          },
          { 'ContactDetails.vendor_id': 1 }
        );
        const vendorIds = vendors.map(v => v.ContactDetails.vendor_id).filter(Boolean);
        if (vendorIds.length > 0) {
          if (query.vendor_id && query.vendor_id.$in) {
            query.vendor_id = { $in: query.vendor_id.$in.filter(id => vendorIds.includes(id)) };
          } else if (query.vendor_id) {
            query.vendor_id = vendorIds.includes(query.vendor_id) ? query.vendor_id : null;
          } else {
            query.vendor_id = { $in: vendorIds };
          }
        } else {
          query._id = null;
        }
      }

      if (search && search.trim() !== '') {
        const searchRegex = new RegExp(search.trim(), 'i');
        const searchQuery = [
          { service_name: searchRegex },
          { description: searchRegex },
          { category_name: searchRegex },
        ];
        
        if (query.$or) {
          query.$and = [{ $or: query.$or }, { $or: searchQuery }];
          delete query.$or;
        } else {
          query.$or = searchQuery;
        }
      }

      if (category_id) {
        query.category_id = category_id;
      }

      if (status) {
        query.status = status;
      }

      // Ensure proper sorting - priority services first, then by creation date
      let sort = { is_priority: -1, createdAt: -1 };
      if (sortBy) {
        // Always maintain priority sorting as primary, then apply custom sort
        sort = { is_priority: -1, [sortBy]: order === 'desc' ? -1 : 1, createdAt: -1 };
      }

      const services = await Service.find(query).sort(sort);

      // Debug log to verify priority sorting
      console.log(`Found ${services.length} services. Priority services: ${services.filter(s => s.is_priority).length}`);
      if (services.length > 0) {
        console.log('First 3 services priority status:', services.slice(0, 3).map(s => ({ name: s.service_name, is_priority: s.is_priority })));
      }

      // Enrich with vendor KYC details
      const vendorIds = [...new Set(services.map((s) => s.vendor_id).filter((id) => !!id))];
      let vendorMap = {};
      if (vendorIds.length) {
        const kycs = await VendorKyc.find({ 'ContactDetails.vendor_id': { $in: vendorIds } }, { 
          'ContactDetails.vendor_id': 1, 
          'ContactDetails.city_id': 1, 
          'ContactDetails.city_name': 1, 
          'ContactDetails.full_name': 1, 
          'ContactDetails.address': 1,
          'Identity.business_name': 1 
        });
        kycs.forEach((k) => {
          const contact = k.ContactDetails || {};
          const identity = k.Identity || {};
          vendorMap[String(contact.vendor_id)] = {
            city_id: contact.city_id || '',
            city_name: contact.city_name || '',
            vendor_name: (identity.business_name || contact.full_name || ''),
            vendor_address: contact.address || '',
          };
        });
      }

      const normalized = services.map((s) => {
        const v = vendorMap[String(s.vendor_id)] || {};
        return {
          ...s.toObject(),
          vendor_city_id: v.city_id || '',
          vendor_city_name: v.city_name || '',
          vendor_address: v.vendor_address || '',
          vendor_name: s.vendor_name || v.vendor_name || '',
        };
      });

      return res.status(200).json({
        success: true,
        data: normalized,
      });
    } catch (error) {
      console.error('Get all services error:', error);
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const getServiceById = {
  handler: async (req, res) => {
    try {
      const { id } = req.params;
      let service = await Service.findById(id);

      if (!service) {
        return res.status(404).json({ message: 'Service not found' });
      }

      service = service.toObject();

      if (service.vendor_id) {
        const vendorKyc = await VendorKyc.findOne(
          { 'ContactDetails.vendor_id': service.vendor_id },
          {
            'ContactDetails.city_id': 1,
            'ContactDetails.city_name': 1,
            'ContactDetails.full_name': 1,
            'ContactDetails.address': 1,
            'ContactDetails.mobile': 1,
            'Identity.business_name': 1,
          }
        );

        if (vendorKyc) {
          const contact = vendorKyc.ContactDetails || {};
          const identity = vendorKyc.Identity || {};

          service.vendor_city_id = contact.city_id || '';
          service.vendor_city_name = contact.city_name || '';
          service.vendor_address = contact.address || '';
          service.vendor_phone = contact.mobile || '';
          service.vendor_name = identity.business_name || contact.full_name || service.vendor_name;
        }
      }

      res.status(200).json({ status: 200, data: service });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const updateService = {
  validation: {
    body: Joi.object().keys({
      service_name: Joi.string().required(),
      category_id: Joi.string().required(),
      price: Joi.string().required(),
      duration: Joi.string().allow(''),
      description: Joi.string().allow(''),
      billing_type: Joi.string().valid('day', 'month', 'hourly').allow(''),
      location: Joi.string().allow(''),
      existing_sub_images: Joi.alternatives().try(Joi.array().items(Joi.string()), Joi.string()).allow('').default([]),
    }).prefs({ convert: true }),
  },
  handler: async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await Service.findById(id);

      if (!existing) {
        return res.status(404).json({ message: 'Service not found' });
      }

      if (req.user && existing.vendor_id && existing.vendor_id !== req.user.id) {
        return res.status(httpStatus.FORBIDDEN).json({ message: 'You do not have permission to update this service' });
      }

      const body = req.body;
      if (body.category_id) {
        const catDoc = await ServiceCategory.findById(body.category_id);
        if (catDoc) {
          body.category_name = catDoc.name;
        }
      }

      const files = req.files || {};
      const imageFile = files['image'] && files['image'][0];
      if (imageFile) {
        if (existing.image) {
          body.image = await updateFileOnExternalService(existing.image, imageFile);
        } else {
          body.image = await uploadToExternalService(imageFile, 'service_images');
        }
      }

      // Handle sub_images in update
      let subImages = [];
      if (body.existing_sub_images) {
        subImages = Array.isArray(body.existing_sub_images)
          ? body.existing_sub_images
          : [body.existing_sub_images];
      }

      if (files['sub_images']) {
        const remainingSlots = 4 - subImages.length;
        if (remainingSlots > 0) {
          const subImageFiles = files['sub_images'].slice(0, remainingSlots);
          const newSubImages = await Promise.all(
            subImageFiles.map(file => uploadToExternalService(file, 'service_sub_images'))
          );
          subImages = [...subImages, ...newSubImages];
        }
      }

      // Always update sub_images if provided or files were uploaded
      // This allows clearing all sub_images as well
      if (req.body.existing_sub_images !== undefined || files['sub_images']) {
        body.sub_images = subImages.slice(0, 4);
      }

      const service = await Service.findByIdAndUpdate(id, body, { new: true });

      return res.status(200).json({
        status: 200,
        message: 'Service updated successfully',
        data: service,
      });
    } catch (error) {
      console.error('Update service error:', error);
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const deleteService = {
  handler: async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await Service.findById(id);

      if (!existing) {
        return res.status(404).json({ message: 'Service not found' });
      }

      if (req.user && existing.vendor_id && existing.vendor_id !== req.user.id) {
        return res.status(httpStatus.FORBIDDEN).json({ message: 'You do not have permission to delete this service' });
      }

      if (existing.image) {
        await deleteFileFromExternalService(existing.image);
      }

      await Service.findByIdAndDelete(id);

      res.status(200).json({ status: 200, message: 'Service deleted successfully' });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

module.exports = {
  createService,
  getAllServices,
  getServiceById,
  updateService,
  deleteService,
};
