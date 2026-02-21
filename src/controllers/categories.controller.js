const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const Joi = require('joi');
const { Category } = require('../models');
const { handlePagination } = require('../utils/helper');
const {
  uploadToExternalService,
  updateFileOnExternalService,
  deleteFileFromExternalService,
} = require('../utils/fileUpload');

const createCategory = {
  validation: {
    body: Joi.object().keys({
      name: Joi.string().trim().required(),
      image: Joi.string().allow(),
    }),
  },
  handler: async (req, res) => {
    try {
      const { name } = req.body;

      const categoryExist = await Category.findOne({ name: name.trim() });

      if (categoryExist) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Category with this name already exists' });
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
    await handlePagination(Category, req, res);
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

      res.status(200).json(category);
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const updateCategory = {
  validation: {
    body: Joi.object()
      .keys({
        name: Joi.string().trim().required(),
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

    if (req.body.name && req.body.name !== categoryExist.name) {
      const sameNameCategory = await Category.findOne({
        name: req.body.name.trim(),
        _id: { $ne: _id },
      });
      if (sameNameCategory) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Category with this name already exists' });
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

module.exports = {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
};
