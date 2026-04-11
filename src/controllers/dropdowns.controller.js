const httpStatus = require('http-status');
const Joi = require('joi');
const { ProductType, ProductListingType, ProductMonth, AccountType, GetQuoteStatus } = require('../models');

const productTypeDropdownSchema = Joi.object().keys({
  id: Joi.string().allow(''),
  product_type: Joi.string().trim().required(),
});

const accountTypeDropdownSchema = Joi.object().keys({
  id: Joi.string().allow(''),
  type_name: Joi.string().trim().required(),
});

const productListingTypeDropdownSchema = Joi.object().keys({
  id: Joi.string().allow(''),
  name: Joi.string().trim().required(),
});

const productMonthDropdownSchema = Joi.object().keys({
  id: Joi.string().allow(''),
  month_name: Joi.string().trim().required(),
});

const getQuoteStatusDropdownSchema = Joi.object().keys({
  id: Joi.string().allow(''),
  status_name: Joi.string().trim().required(),
});

const getQuoteStatusIdSchema = Joi.object().keys({
  id: Joi.string().required(),
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

const accountTypeIdSchema = Joi.object().keys({
  id: Joi.string().required(),
});

const buildDropdownResponse = async () => {
  const [types, listingTypes, months, accountTypes, quoteStatuses] = await Promise.all([
    ProductType.find().sort({ createdAt: 1 }),
    ProductListingType.find().sort({ createdAt: 1 }),
    ProductMonth.find().sort({ createdAt: 1 }),
    AccountType.find().sort({ createdAt: 1 }),
    GetQuoteStatus.find().sort({ createdAt: 1 }),
  ]);

  return {
    products_type: types.map((t) => ({
      id: t.id,
      product_type: t.product_type,
      created_at: t.createdAt,
      updated_at: t.updatedAt,
    })),
    products_listing_type: listingTypes.map((lt) => ({
      id: lt.id,
      name: lt.name,
      created_at: lt.createdAt,
      updated_at: lt.updatedAt,
    })),
    products_months: months.map((m) => ({
      id: m.id,
      month_name: m.month_name,
      created_at: m.createdAt,
      updated_at: m.updatedAt,
    })),
    account_type: accountTypes.map((at) => ({
      id: at.id,
      type_name: at.type_name,
      created_at: at.createdAt,
      updated_at: at.updatedAt,
    })),
    getquote_status: quoteStatuses.map((qs) => ({
      id: qs.id,
      status_name: qs.status_name,
      created_at: qs.createdAt,
      updated_at: qs.updatedAt,
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
      account_type: Joi.array()
        .items(accountTypeDropdownSchema)
        .default([]),
      getquote_status: Joi.array()
        .items(getQuoteStatusDropdownSchema)
        .default([]),
    }),
  },
  handler: async (req, res) => {
    try {
      const {
        products_type: productsType,
        products_listing_type: productsListingType,
        products_months: productsMonths,
        account_type: accountTypes,
        getquote_status: quoteStatuses,
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

      if (accountTypes && accountTypes.length) {
        const docs = accountTypes.map((at) => ({
          type_name: at.type_name.trim(),
        }));
        await AccountType.insertMany(docs);
      }

      if (quoteStatuses && quoteStatuses.length) {
        const docs = quoteStatuses.map((qs) => ({
          status_name: qs.status_name.trim(),
        }));
        await GetQuoteStatus.insertMany(docs);
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
        account_type: Joi.array()
          .items(accountTypeDropdownSchema)
          .default([]),
        getquote_status: Joi.array()
          .items(getQuoteStatusDropdownSchema)
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
        account_type: accountTypes,
        getquote_status: quoteStatuses,
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

      if (accountTypes && accountTypes.length) {
        for (const at of accountTypes) {
          if (at.id) {
            await AccountType.findByIdAndUpdate(
              at.id,
              { type_name: at.type_name.trim() },
              { new: true }
            );
          } else {
            await AccountType.create({
              type_name: at.type_name.trim(),
            });
          }
        }
      }

      if (quoteStatuses && quoteStatuses.length) {
        for (const qs of quoteStatuses) {
          if (qs.id) {
            await GetQuoteStatus.findByIdAndUpdate(
              qs.id,
              { 
                status_name: qs.status_name.trim()
              },
              { new: true }
            );
          } else {
            await GetQuoteStatus.create({
              status_name: qs.status_name.trim()
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
      account_type: Joi.array().items(accountTypeIdSchema).default([]),
      getquote_status: Joi.array().items(getQuoteStatusIdSchema).default([]),
    }),
  },
  handler: async (req, res) => {
    try {
      const {
        products_type: productsType,
        products_listing_type: productsListingType,
        products_months: productsMonths,
        account_type: accountTypes,
        getquote_status: quoteStatuses,
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

      if (accountTypes && accountTypes.length) {
        const ids = accountTypes.map((at) => at.id);
        await AccountType.deleteMany({ _id: { $in: ids } });
      }

      if (quoteStatuses && quoteStatuses.length) {
        const ids = quoteStatuses.map((qs) => qs.id);
        await GetQuoteStatus.deleteMany({ _id: { $in: ids } });
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

