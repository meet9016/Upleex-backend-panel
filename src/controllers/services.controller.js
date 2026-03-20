const httpStatus = require('http-status');
const Joi = require('joi');
const mongoose = require('mongoose');
const { Service, ServiceCategory } = require('../models');
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

      const service = await Service.create(data);

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
      const { search, category_id, status, sortBy, order } = req.query;
      const query = {};

      if (req.user && req.user.userType === 'vendor') {
        query.vendor_id = req.user.id || req.user._id;
      } else {
        query.approval_status = 'approved';
      }

      if (search && search.trim() !== '') {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [
          { service_name: searchRegex },
          { description: searchRegex },
          { category_name: searchRegex },
        ];
      }

      if (category_id) {
        query.category_id = category_id;
      }

      if (status) {
        query.status = status;
      }

      let sort = { createdAt: -1 };
      if (sortBy) {
        sort = { [sortBy]: order === 'desc' ? -1 : 1 };
      }

      const services = await Service.find(query).sort(sort);

      return res.status(200).json({
        success: true,
        data: services,
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
      const service = await Service.findById(id);

      if (!service) {
        return res.status(404).json({ message: 'Service not found' });
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
