const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const Joi = require('joi');
const { Category, SubCategory, Product } = require('../models');
const { handlePagination } = require('../utils/helper');
const {
  uploadToExternalService,
  updateFileOnExternalService,
  deleteFileFromExternalService,
} = require('../utils/fileUpload');
const mongoose = require('mongoose');
const createCategory = {
  validation: {
    body: Joi.object().keys({
      categories_name: Joi.string().trim().required(),
      image: Joi.string().allow(),
    }),
  },
  handler: async (req, res) => {
    try {
      const { categories_name } = req.body;

      const categoryExist = await Category.findOne({ categories_name: categories_name.trim() });

      if (categoryExist) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Category with this categories_name already exists' });
      }

      let imageUrl = req.body.image || '';
      if (req.file) {
        imageUrl = await uploadToExternalService(req.file, 'categories_image');
      }

      const category = await Category.create({
        ...req.body,
        image: imageUrl,
      });

      return res.status(201).json({
        success: true,
        message: 'Category created successfully!',
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
      
      // Build search query
      let query = {};
      
      // Add search functionality
      if (req.query.search) {
        const searchRegex = new RegExp(req.query.search, 'i');
        query = {
          $or: [
            { categories_name: searchRegex },
            { name: searchRegex }
          ]
        };
      }

      // Add status filter if needed
      // if (req.query.status) {
      //   query.status = req.query.status;
      // }

      // Add date filters if needed
      if (req.query.date_from || req.query.date_to) {
        query.createdAt = {};
        if (req.query.date_from) {
          query.createdAt.$gte = new Date(req.query.date_from);
        }
        if (req.query.date_to) {
          query.createdAt.$lte = new Date(req.query.date_to);
        }
      }

      const total = await Category.countDocuments(query);
      const categories = await Category.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const transformedData = await Promise.all(
        categories.map(async (cat) => {
          const catId = cat.id || cat._id;

          // Fetch approved product count for this category
          const productCount = await Product.countDocuments({ 
            category_id: String(catId),
            approval_status: 'approved'
          });

          // Fetch subcategories for this category
          const subcategories = await SubCategory.find({ categoryId: catId });

          return {
            categories_id: String(catId),
            categories_name: cat.categories_name || cat.name || '',
            image: cat.image || '',
            product_count: String(productCount),
            created_at: cat.createdAt,
            updated_at: cat.updatedAt,
            subcategories: subcategories.map((sub) => ({
              subcategory_id: String(sub.id || sub._id),
              subcategory_name: sub.name || sub.subcategory_name || '',
              image: sub.image || '',
            })),
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
      const { _id } = req.params;

      const category = await Category.findById(_id);

      if (!category) {
        return res.status(404).json({ message: 'Category not found' });
      }

      const catId = category.id || category._id;

      // Fetch approved product count for this category
      const productCount = await Product.countDocuments({ 
        category_id: String(catId),
        approval_status: 'approved'
      });

      // Fetch subcategories for this category
      const subcategories = await SubCategory.find({ categoryId: catId });

      res.status(200).json({
        categories_id: String(catId),
        categories_name: category.categories_name || category.name || '',
        image: category.image || '',
        product_count: String(productCount),
        subcategories: subcategories.map((sub) => ({
          subcategory_id: String(sub.id || sub._id),
          subcategory_name: sub.name || sub.subcategory_name || '',
          image: sub.image || '',
        })),
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const updateCategory = {
  validation: {
    body: Joi.object()
      .keys({
        categories_name: Joi.string().trim().required(),
        image: Joi.string().allow(),
      })
      .prefs({ convert: true }),
  },
  handler: async (req, res) => {
    const { _id } = req.params;

    const categoryExist = await Category.findById(_id);

    if (!categoryExist) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Category does not exist');
    }

    if (req.body.categories_name && req.body.categories_name !== categoryExist.categories_name) {
      const samecategories_nameCategory = await Category.findOne({
        categories_name: req.body.categories_name.trim(),
        _id: { $ne: _id },
      });
      if (samecategories_nameCategory) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Category with this categories_name already exists' });
      }
    }

    let imageUrl = req.body.image || categoryExist.image || '';
    if (req.file) {
      if (categoryExist.image) {
        imageUrl = await updateFileOnExternalService(
          categoryExist.image,
          req.file
        );
      } else {
        imageUrl = await uploadToExternalService(req.file, 'categories_image');
      }
    }

    const updateData = {
      ...req.body,
      image: imageUrl,
    };

    const category = await Category.findByIdAndUpdate(_id, updateData, {
      new: true,
    });

    res.send({
      success: true,
      message: 'Category updated successfully!',
      data: category,
    });
  },
};

const deleteCategory = {
  handler: async (req, res) => {
    const { _id } = req.params;

    const categoryExist = await Category.findById(_id);

    if (!categoryExist) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Category does not exist');
    }

    if (categoryExist.image) {
      await deleteFileFromExternalService(categoryExist.image);
    }

    await Category.findByIdAndDelete(_id);

    res.send({ message: 'Category deleted successfully' });
  },
};

const bulkDeleteCategories = {  
  handler: async (req, res) => {
    const { ids } = req.body;

    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));

    const categories = await Category.find({ _id: { $in: objectIds } });

    for (const category of categories) {
      if (category.image) {
        await deleteFileFromExternalService(category.image);
      } else {
         await deleteFileFromExternalService(category.image);
       }
    }

    await Category.deleteMany({ _id: { $in: objectIds } });

    res.send({ message: 'Categories deleted successfully' });
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
