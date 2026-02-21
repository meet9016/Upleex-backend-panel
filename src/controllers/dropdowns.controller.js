const httpStatus = require('http-status');
const Joi = require('joi');
const { ProductType, ProductListingType, ProductMonth } = require('../models');

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

const getDropdowns = {
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

const createDropdowns = {
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
        message: 'Dropdowns created successfully',
        ...data,
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const updateDropdowns = {
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
        message: 'Dropdowns updated successfully',
        ...data,
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const deleteDropdowns = {
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
        message: 'Dropdowns deleted successfully',
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
  getDropdowns,
  createDropdowns,
  updateDropdowns,
  deleteDropdowns,
};

