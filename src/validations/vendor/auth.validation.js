const Joi = require('joi');

const businessRegister = {
  body: Joi.object().keys({
    full_name: Joi.string().required(),
    business_name: Joi.string().required(),
    email: Joi.string().email().custom((value, helpers) => {
      if (!value.endsWith('@gmail.com')) {
        return helpers.message('Email must be a @gmail.com address');
      }
      return value;
    }).required(),
    number: Joi.string().pattern(/^[0-9]{10,15}$/).required(),
    alternate_number: Joi.string().pattern(/^[0-9]{10,15}$/).allow('', null).optional(),
    country: Joi.string().required(),
    city_id: Joi.string().optional(),
    otp: Joi.string().optional(),
    url: Joi.string().optional(),
  }),
};

const vendorLogin = {
  body: Joi.object().keys({
    number: Joi.string().pattern(/^[0-9]{10,15}$/).required(),
    otp: Joi.string().optional(),
    url: Joi.string().optional(),
    gst_number: Joi.string().trim().uppercase().max(15).pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/).allow('').optional().messages({
      'string.pattern.base': 'GST number must be a valid 15-character GSTIN',
    }),
  }),
};

module.exports = {
  businessRegister,
  vendorLogin,
};
