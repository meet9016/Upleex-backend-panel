const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const Joi = require('joi');
const mongoose = require('mongoose');
const { Category, SubCategory } = require('../models');
const { handlePagination } = require('../utils/helper');
const {
  uploadToExternalService,
  updateFileOnExternalService,
  deleteFileFromExternalService,
} = require('../utils/fileUpload');

const createSubCategory = {
  validation: {
    body: Joi.object().keys({
      id: Joi.string().required(),
      name: Joi.string().trim().required(),
      image: Joi.string().allow(),
    }),
  },
  handler: async (req, res) => {
    try {
      const { id, name } = req.body;

      const category = await Category.findById(id);

      if (!category) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Category not found for this id' });
      }

      const subCategoryExist = await SubCategory.findOne({
        categoryId: id,
        name: name.trim(),
      });

      if (subCategoryExist) {
        return res.status(httpStatus.BAD_REQUEST).json({
          message: 'Subcategory with this name already exists for this category',
        });
      }

      let imageUrl = req.body.image || '';
      if (req.file) {
        imageUrl = await uploadToExternalService(req.file, 'categories_image');
      }

      const subCategory = await SubCategory.create({
        categoryId: id,
        name: req.body.name,
        image: imageUrl,
      });

      return res.status(201).json({
        success: true,
        message: 'Subcategory created successfully!',
        subCategory: {
          id: subCategory.id,
          categoryId: subCategory.categoryId,
          name: subCategory.name,
          image: subCategory.image,
        },
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const getAllSubCategories = {
  handler: async (req, res) => {
    const { categoryId } = req.query;
    const query = {};

    if (categoryId) {
      query.categoryId = categoryId;
    }

    const originalJson = res.json.bind(res);

    res.json = (payload) => {
      if (payload && Array.isArray(payload.data)) {
        payload.data = payload.data.map((item) => ({
          id: item.id,
          categoryId: item.categoryId,
          name: item.name,
          image: item.image,
        }));
      }
      return originalJson(payload);
    };

    await handlePagination(SubCategory, req, res, query);
  },
};

const getSubCategoryById = {
  handler: async (req, res) => {
    try {
      const { _id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Invalid subcategory id' });
      }

      const subCategory = await SubCategory.findById(_id);
      if (!subCategory) {
        return res.status(404).json({ message: 'Subcategory not found' });
      }

      res.status(200).json({
        id: subCategory.id,
        categoryId: subCategory.categoryId,
        name: subCategory.name,
        image: subCategory.image,
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const updateSubCategory = {
  validation: {
    body: Joi.object()
      .keys({
        id: Joi.string().required(),
        name: Joi.string().trim().required(),
        image: Joi.string().allow(),
      })
      .prefs({ convert: true }),
  },
  handler: async (req, res) => {
    try {
      const { _id } = req.params;
      const { id, name } = req.body;

      if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Invalid subcategory id' });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Invalid category id' });
      }

      const subCategoryExist = await SubCategory.findById(_id);

      if (!subCategoryExist) {
        return res
          .status(httpStatus.NOT_FOUND)
          .json({ message: 'Subcategory does not exist' });
      }

      const category = await Category.findById(id);

      if (!category) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Category not found for this id' });
      }

      const duplicate = await SubCategory.findOne({
        _id: { $ne: _id },
        categoryId: id,
        name: name.trim(),
      });

      if (duplicate) {
        return res.status(httpStatus.BAD_REQUEST).json({
          message: 'Subcategory with this name already exists for this category',
        });
      }

      let imageUrl = req.body.image || subCategoryExist.image || '';
      if (req.file) {
        if (subCategoryExist.image) {
          imageUrl = await updateFileOnExternalService(
            subCategoryExist.image,
            req.file
          );
        } else {
          imageUrl = await uploadToExternalService(req.file, 'categories_image');
        }
      }

      const updateData = {
        categoryId: id,
        name: req.body.name,
        image: imageUrl,
      };

      const subCategory = await SubCategory.findByIdAndUpdate(
        _id,
        updateData,
        {
          new: true,
        }
      );

      if (!subCategory) {
        return res
          .status(httpStatus.NOT_FOUND)
          .json({ message: 'Subcategory does not exist' });
      }

      res.send({
        success: true,
        message: 'Subcategory updated successfully!',
        data: {
          id: subCategory.id,
          categoryId: subCategory.categoryId,
          name: subCategory.name,
          image: subCategory.image,
        },
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const deleteSubCategory = {
  handler: async (req, res) => {
    const { _id } = req.params;

    const subCategoryExist = await SubCategory.findById(_id);

    if (!subCategoryExist) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Subcategory does not exist');
    }

    if (subCategoryExist.image) {
      await deleteFileFromExternalService(subCategoryExist.image);
    }

    await SubCategory.findByIdAndDelete(_id);

    res.send({ message: 'Subcategory deleted successfully' });
  },
};

module.exports = {
  createSubCategory,
  getAllSubCategories,
  getSubCategoryById,
  updateSubCategory,
  deleteSubCategory,
};
