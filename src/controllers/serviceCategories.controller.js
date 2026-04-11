const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const Joi = require('joi');
const { ServiceCategory, Service } = require('../models');
const {
  uploadToExternalService,
  updateFileOnExternalService,
  deleteFileFromExternalService,
} = require('../utils/fileUpload');
const mongoose = require('mongoose');

const createCategory = {
  validation: {
    body: Joi.object().keys({
      name: Joi.string().trim().required(),
      image: Joi.string().allow(''),
    }),
  },
  handler: async (req, res) => {
    try {
      const { name } = req.body;

      const categoryExist = await ServiceCategory.findOne({ name: name.trim() });

      if (categoryExist) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Service Category with this name already exists' });
      }

      let imageUrl = req.body.image || '';
      if (req.file) {
        imageUrl = await uploadToExternalService(req.file, 'service_categories');
      }

      const category = await ServiceCategory.create({
        ...req.body,
        image: imageUrl,
      });

      return res.status(201).json({
        success: true,
        message: 'Service Category created successfully!',
        category,
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const getAllCategories = {
  handler: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = req.query.limit ? parseInt(req.query.limit) : 100;
      const skip = (page - 1) * limit;
      const { city } = req.query;
      
      let query = {};
      
      if (req.query.search) {
        const searchRegex = new RegExp(req.query.search, 'i');
        query = { name: searchRegex };
      }

      const total = await ServiceCategory.countDocuments(query);
      const categories = await ServiceCategory.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const transformedData = await Promise.all(
        categories.map(async (cat) => {
          const catId = cat.id || cat._id;
          
          // Build service count query
          const serviceQuery = { 
            category_id: String(catId),
            approval_status: 'approved'
          };

          // If city is provided, filter by city
          if (city) {
            const VendorKyc = require('../models').VendorKyc;
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
              serviceQuery.vendor_id = { $in: vendorIds };
            } else {
              // If no vendors in this city, return 0 count
              return {
                categories_id: String(catId),
                categories_name: cat.name,
                image: cat.image || '',
                service_count: '0',
                created_at: cat.createdAt,
                updated_at: cat.updatedAt,
              };
            }
          }

          const serviceCount = await Service.countDocuments(serviceQuery);

          return {
            categories_id: String(catId),
            categories_name: cat.name,
            image: cat.image || '',
            service_count: String(serviceCount),
            created_at: cat.createdAt,
            updated_at: cat.updatedAt,
          };
        })
      );

      res.status(200).json({
        success: true,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data: transformedData,
      });
    } catch (error) {
      res.status(500).json({ 
        success: false,
        message: error.message 
      });
    }
  },
};

const getCategoryById = {
  handler: async (req, res) => {
    try {
      const { id } = req.params;
      const category = await ServiceCategory.findById(id);

      if (!category) {
        return res.status(404).json({ message: 'Service Category not found' });
      }

      res.status(200).json({
        success: true,
        data: category,
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const updateCategory = {
  validation: {
    body: Joi.object().keys({
      name: Joi.string().trim().required(),
      image: Joi.string().allow(''),
    }),
  },
  handler: async (req, res) => {
    try {
      const { id } = req.params;
      const categoryExist = await ServiceCategory.findById(id);

      if (!categoryExist) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Service Category does not exist');
      }

      if (req.body.name && req.body.name !== categoryExist.name) {
        const sameNameCategory = await ServiceCategory.findOne({
          name: req.body.name.trim(),
          _id: { $ne: id },
        });
        if (sameNameCategory) {
          return res
            .status(httpStatus.BAD_REQUEST)
            .json({ message: 'Service Category with this name already exists' });
        }
      }

      let imageUrl = req.body.image || categoryExist.image || '';
      if (req.file) {
        if (categoryExist.image) {
          imageUrl = await updateFileOnExternalService(categoryExist.image, req.file);
        } else {
          imageUrl = await uploadToExternalService(req.file, 'service_categories');
        }
      }

      const updateData = {
        ...req.body,
        image: imageUrl,
      };

      const category = await ServiceCategory.findByIdAndUpdate(id, updateData, { new: true });

      res.send({
        success: true,
        message: 'Service Category updated successfully!',
        data: category,
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const deleteCategory = {
  handler: async (req, res) => {
    try {
      const { id } = req.params;
      const categoryExist = await ServiceCategory.findById(id);

      if (!categoryExist) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Service Category does not exist');
      }

      if (categoryExist.image) {
        await deleteFileFromExternalService(categoryExist.image);
      }

      await ServiceCategory.findByIdAndDelete(id);

      res.send({ message: 'Service Category deleted successfully' });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const bulkDeleteCategories = {  
  handler: async (req, res) => {
    try {
      const { ids } = req.body;
      const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
      const categories = await ServiceCategory.find({ _id: { $in: objectIds } });

      for (const category of categories) {
        if (category.image) {
          await deleteFileFromExternalService(category.image);
        }
      }

      await ServiceCategory.deleteMany({ _id: { $in: objectIds } });

      res.send({ message: 'Service Categories deleted successfully' });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

module.exports = {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  bulkDeleteCategories
};
