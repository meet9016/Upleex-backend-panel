const httpStatus = require('http-status');
const Joi = require('joi');
const mongoose = require('mongoose');
const {
  Product,
  ProductType,
  ProductListingType,
  ProductMonth,
} = require('../models');
const { handlePagination } = require('../utils/helper');

const productDetailSchema = Joi.object().keys({
  specification_id: Joi.string().allow(''),
  specification: Joi.string().allow(''),
  detail: Joi.string().allow(''),
});

const productImageSchema = Joi.object().keys({
  product_image_id: Joi.string().allow(''),
  image: Joi.string().allow(''),
});

const monthPriceSchema = Joi.object().keys({
  month_price: Joi.string().allow(''),
  month_cancel_price: Joi.string().allow(''),
  months_id: Joi.string().allow(''),
  product_months_id: Joi.string().allow(''),
});

const productTypeDropdownSchema = Joi.object().keys({
  id: Joi.string().allow(''),
  product_type: Joi.string().trim().required(),
});

const productListingTypeDropdownSchema = Joi.object().keys({
  id: Joi.string().allow(''),
  name: Joi.string().trim().required(),
});

const productMonthDropdownSchema = Joi.object().keys({
  id: Joi.string().allow(''),
  month_name: Joi.string().trim().required(),
});

const productTypeIdSchema = Joi.object().keys({
  id: Joi.string().required(),
});

const productListingTypeIdSchema = Joi.object().keys({
  id: Joi.string().required(),
});

const productMonthIdSchema = Joi.object().keys({
  id: Joi.string().required(),
});

const createProduct = {
  validation: {
    body: Joi.object().keys({
      product_id: Joi.string().allow(''),
      category_id: Joi.string().required(),
      sub_category_id: Joi.string().required(),
      product_type_id: Joi.string().required(),
      product_listing_type_id: Joi.string().required(),
      product_name: Joi.string().trim().required(),
      price: Joi.string().required(),
      cancel_price: Joi.string().allow(''),
      description: Joi.string().allow(''),
      product_main_image: Joi.string().allow(''),
      category_name: Joi.string().allow(''),
      sub_category_name: Joi.string().allow(''),
      no: Joi.string().allow(''),
      product_type_name: Joi.string().allow(''),
      product_listing_type_name: Joi.string().allow(''),
      vendor_id: Joi.string().allow(''),
      vendor_name: Joi.string().allow(''),
      vendor_image: Joi.string().allow(''),
      month_arr: Joi.array().items(monthPriceSchema).default([]),
      images: Joi.array().items(productImageSchema).default([]),
      product_details: Joi.array().items(productDetailSchema).default([]),
    }),
  },
  handler: async (req, res) => {
    try {
      const data = req.body;

      const existing = await Product.findOne({
        product_name: data.product_name,
        category_id: data.category_id,
        sub_category_id: data.sub_category_id,
      });

      if (existing) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Product with this name already exists' });
      }

      const product = await Product.create(data);

      if (!product.product_id) {
        product.product_id = product.id;
        await product.save();
      }

      return res.status(201).json({
        success: true,
        message: 'Product created successfully',
        product,
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const getAllProducts = {
  handler: async (req, res) => {
    const { category_id, sub_category_id, product_type_id, product_listing_type_id } =
      req.query;
    const query = {};

    if (category_id) {
      query.category_id = category_id;
    }
    if (sub_category_id) {
      query.sub_category_id = sub_category_id;
    }
    if (product_type_id) {
      query.product_type_id = product_type_id;
    }
    if (product_listing_type_id) {
      query.product_listing_type_id = product_listing_type_id;
    }

    await handlePagination(Product, req, res, query, { createdAt: -1 });
  },
};

const getProductById = {
  handler: async (req, res) => {
    try {
      const { _id } = req.params;

      let product;

      if (mongoose.Types.ObjectId.isValid(_id)) {
        product = await Product.findById(_id);
      } else {
        product = await Product.findOne({ product_id: _id });
      }

      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      res.status(200).json(product);
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const updateProduct = {
  validation: {
    body: Joi.object()
      .keys({
        product_id: Joi.string().allow(''),
        category_id: Joi.string().required(),
        sub_category_id: Joi.string().required(),
        product_type_id: Joi.string().required(),
        product_listing_type_id: Joi.string().required(),
        product_name: Joi.string().trim().required(),
        price: Joi.string().required(),
        cancel_price: Joi.string().allow(''),
        description: Joi.string().allow(''),
        product_main_image: Joi.string().allow(''),
        category_name: Joi.string().allow(''),
        sub_category_name: Joi.string().allow(''),
        no: Joi.string().allow(''),
        product_type_name: Joi.string().allow(''),
        product_listing_type_name: Joi.string().allow(''),
        vendor_id: Joi.string().allow(''),
        vendor_name: Joi.string().allow(''),
        vendor_image: Joi.string().allow(''),
        month_arr: Joi.array().items(monthPriceSchema).default([]),
        images: Joi.array().items(productImageSchema).default([]),
        product_details: Joi.array().items(productDetailSchema).default([]),
      })
      .prefs({ convert: true }),
  },
  handler: async (req, res) => {
    try {
      const { _id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Invalid product id' });
      }

      const existing = await Product.findById(_id);

      if (!existing) {
        return res.status(404).json({ message: 'Product not found' });
      }

      const duplicate = await Product.findOne({
        _id: { $ne: _id },
        product_name: req.body.product_name,
        category_id: req.body.category_id,
        sub_category_id: req.body.sub_category_id,
      });

      if (duplicate) {
        return res.status(httpStatus.BAD_REQUEST).json({
          message: 'Product with this name already exists',
        });
      }

      const updateData = {
        ...req.body,
      };

      const product = await Product.findByIdAndUpdate(_id, updateData, {
        new: true,
      });

      return res.send({
        success: true,
        message: 'Product updated successfully',
        data: product,
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const deleteProduct = {
  handler: async (req, res) => {
    try {
      const { _id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Invalid product id' });
      }

      const existing = await Product.findById(_id);

      if (!existing) {
        return res.status(404).json({ message: 'Product not found' });
      }

      await Product.findByIdAndDelete(_id);

      res.send({ message: 'Product deleted successfully' });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const buildDropdownResponse = async () => {
  const [types, listingTypes, months] = await Promise.all([
    ProductType.find().sort({ createdAt: 1 }),
    ProductListingType.find().sort({ createdAt: 1 }),
    ProductMonth.find().sort({ createdAt: 1 }),
  ]);

  return {
    products_type: types.map((t) => ({
      id: t.id,
      product_type: t.product_type,
    })),
    products_listing_type: listingTypes.map((lt) => ({
      id: lt.id,
      name: lt.name,
    })),
    products_months: months.map((m) => ({
      id: m.id,
      month_name: m.month_name,
    })),
  };
};

const getProductDropdowns = {
  handler: async (req, res) => {
    try {
      const data = await buildDropdownResponse();
      res.status(200).json(data);
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const createProductDropdowns = {
  validation: {
    body: Joi.object().keys({
      products_type: Joi.array()
        .items(productTypeDropdownSchema)
        .default([]),
      products_listing_type: Joi.array()
        .items(productListingTypeDropdownSchema)
        .default([]),
      products_months: Joi.array()
        .items(productMonthDropdownSchema)
        .default([]),
    }),
  },
  handler: async (req, res) => {
    try {
      const {
        products_type: productsType,
        products_listing_type: productsListingType,
        products_months: productsMonths,
      } = req.body;

      if (productsType && productsType.length) {
        const docs = productsType.map((t) => ({
          product_type: t.product_type.trim(),
        }));
        await ProductType.insertMany(docs);
      }

      if (productsListingType && productsListingType.length) {
        const docs = productsListingType.map((lt) => ({
          name: lt.name.trim(),
        }));
        await ProductListingType.insertMany(docs);
      }

      if (productsMonths && productsMonths.length) {
        const docs = productsMonths.map((m) => ({
          month_name: m.month_name.trim(),
        }));
        await ProductMonth.insertMany(docs);
      }

      const data = await buildDropdownResponse();

      return res.status(201).json({
        success: true,
        message: 'Product dropdowns created successfully',
        ...data,
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const updateProductDropdowns = {
  validation: {
    body: Joi.object()
      .keys({
        products_type: Joi.array()
          .items(productTypeDropdownSchema)
          .default([]),
        products_listing_type: Joi.array()
          .items(productListingTypeDropdownSchema)
          .default([]),
        products_months: Joi.array()
          .items(productMonthDropdownSchema)
          .default([]),
      })
      .prefs({ convert: true }),
  },
  handler: async (req, res) => {
    try {
      const {
        products_type: productsType,
        products_listing_type: productsListingType,
        products_months: productsMonths,
      } = req.body;

      if (productsType && productsType.length) {
        for (const t of productsType) {
          if (t.id) {
            await ProductType.findByIdAndUpdate(
              t.id,
              { product_type: t.product_type.trim() },
              { new: true }
            );
          } else {
            await ProductType.create({
              product_type: t.product_type.trim(),
            });
          }
        }
      }

      if (productsListingType && productsListingType.length) {
        for (const lt of productsListingType) {
          if (lt.id) {
            await ProductListingType.findByIdAndUpdate(
              lt.id,
              { name: lt.name.trim() },
              { new: true }
            );
          } else {
            await ProductListingType.create({
              name: lt.name.trim(),
            });
          }
        }
      }

      if (productsMonths && productsMonths.length) {
        for (const m of productsMonths) {
          if (m.id) {
            await ProductMonth.findByIdAndUpdate(
              m.id,
              { month_name: m.month_name.trim() },
              { new: true }
            );
          } else {
            await ProductMonth.create({
              month_name: m.month_name.trim(),
            });
          }
        }
      }

      const data = await buildDropdownResponse();

      return res.send({
        success: true,
        message: 'Product dropdowns updated successfully',
        ...data,
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const deleteProductDropdowns = {
  validation: {
    body: Joi.object().keys({
      products_type: Joi.array().items(productTypeIdSchema).default([]),
      products_listing_type: Joi.array()
        .items(productListingTypeIdSchema)
        .default([]),
      products_months: Joi.array().items(productMonthIdSchema).default([]),
    }),
  },
  handler: async (req, res) => {
    try {
      const {
        products_type: productsType,
        products_listing_type: productsListingType,
        products_months: productsMonths,
      } = req.body;

      if (productsType && productsType.length) {
        const ids = productsType.map((t) => t.id);
        await ProductType.deleteMany({ _id: { $in: ids } });
      }

      if (productsListingType && productsListingType.length) {
        const ids = productsListingType.map((lt) => lt.id);
        await ProductListingType.deleteMany({ _id: { $in: ids } });
      }

      if (productsMonths && productsMonths.length) {
        const ids = productsMonths.map((m) => m.id);
        await ProductMonth.deleteMany({ _id: { $in: ids } });
      }

      const data = await buildDropdownResponse();

      return res.send({
        success: true,
        message: 'Product dropdowns deleted successfully',
        ...data,
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};


module.exports = {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  getProductDropdowns,
  createProductDropdowns,
  updateProductDropdowns,
  deleteProductDropdowns,
};
