const httpStatus = require('http-status');
const Joi = require('joi');
const mongoose = require('mongoose');
const {
  GetQuote,
} = require('../models');

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

      // Create directly using FAQ model
      const faq = await GetQuote.create({
        ...data,
        status: data.status || 'pending',
      });

      return res.status(httpStatus.CREATED).json({
        message: 'Get Quote created successfully',
        data: faq,
      });
    } catch (error) {
      return res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

module.exports = {
  createGetQuote,
};
