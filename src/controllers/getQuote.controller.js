const httpStatus = require('http-status');
const Joi = require('joi');
const mongoose = require('mongoose');
const {
  GetQuote,
  Product,
} = require('../models');
const { handlePagination } = require('../utils/helper');

const createGetQuote = {
  validation: {
    body: Joi.object().keys({
      product_id: Joi.string().required(),
      delivery_date: Joi.date().optional(),
      number_of_days: Joi.number().min(0).optional(),
      months_id: Joi.string().optional(),
      qty: Joi.number().optional(),
      note: Joi.string().allow('').optional(),
      status: Joi.string()
        .valid('pending', 'approval', 'reject', 'complete')
        .optional(),
    }),
  },

  handler: async (req, res) => {
    try {
      const data = req.body;

      const quote = await GetQuote.create({
        ...data,
        status: data.status || 'pending',
      });

      return res.status(httpStatus.CREATED).json({
        success: true,
        message: 'Get Quote created successfully',
        data: quote,
      });
    } catch (error) {
      return res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const getAllQuotes = {
  handler: async (req, res) => {
    try {
      const { status, search } = req.query;
      const query = {};
      if (status) {
        query.status = status;
      }

      // Search by note or status
      if (search) {
        query.$or = [
          { note: { $regex: search, $options: 'i' } },
          { status: { $regex: search, $options: 'i' } },
        ];
      }

      const originalJson = res.json.bind(res);
      res.json = async (payload) => {
        if (payload && Array.isArray(payload.data)) {
          const productIds = payload.data.map((q) => q.product_id).filter((id) => !!id);
          const products = await Product.find({ _id: { $in: productIds } });
          const productMap = {};
          products.forEach((p) => {
            productMap[p._id.toString()] = p;
          });

          payload.data = payload.data.map((quote) => {
            const json = quote.toJSON ? quote.toJSON() : quote;
            if (json.product_id && productMap[json.product_id]) {
              json.product_id = productMap[json.product_id];
            }
            return json;
          });
        }
        return originalJson(payload);
      };

      await handlePagination(GetQuote, req, res, query, { createdAt: -1 });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const getQuoteById = {
  handler: async (req, res) => {
    try {
      const { _id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid quote id' });
      }

      const quote = await GetQuote.findById(_id);

      if (!quote) {
        return res.status(httpStatus.NOT_FOUND).json({ message: 'Quote not found' });
      }

      const data = quote.toJSON();

      if (data.product_id) {
        const product = await Product.findById(data.product_id);
        if (product) {
          data.product_id = product;
        }
      }

      res.status(httpStatus.OK).json({
        success: true,
        data: data,
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const updateQuote = {
  validation: {
    body: Joi.object().keys({
      product_id: Joi.string().optional(),
      delivery_date: Joi.date().optional(),
      number_of_days: Joi.number().min(0).optional(),
      months_id: Joi.string().optional(),
      qty: Joi.number().optional(),
      note: Joi.string().allow('').optional(),
      status: Joi.string()
        .valid('pending', 'approval', 'reject', 'complete')
        .optional(),
    }),
  },
  handler: async (req, res) => {
    try {
      const { _id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid quote id' });
      }

      const quote = await GetQuote.findByIdAndUpdate(_id, req.body, { new: true }).populate('product_id');

      if (!quote) {
        return res.status(httpStatus.NOT_FOUND).json({ message: 'Quote not found' });
      }

      res.status(httpStatus.OK).json({
        success: true,
        message: 'Quote updated successfully',
        data: quote.toJSON(),
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const deleteQuote = {
  handler: async (req, res) => {
    try {
      const { _id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid quote id' });
      }

      const quote = await GetQuote.findByIdAndDelete(_id);

      if (!quote) {
        return res.status(httpStatus.NOT_FOUND).json({ message: 'Quote not found' });
      }

      res.status(httpStatus.OK).json({
        success: true,
        message: 'Quote deleted successfully',
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

module.exports = {
  createGetQuote,
  getAllQuotes,
  getQuoteById,
  updateQuote,
  deleteQuote,
};
