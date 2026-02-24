const Joi = require('joi');

const businessRegister = {
  body: Joi.object().keys({
    full_name: Joi.string().required(),
    business_name: Joi.string().required(),
    email: Joi.string().email().required(),
    number: Joi.string().pattern(/^[0-9]{10,15}$/).required(),
    alternate_number: Joi.string().pattern(/^[0-9]{10,15}$/).allow('', null).optional(),
    country: Joi.string().required(),
    otp: Joi.string().optional(),
  }),
};

const vendorLogin = {
  body: Joi.object().keys({
    number: Joi.string().pattern(/^[0-9]{10,15}$/).required(),
    otp: Joi.string().optional(),
  }),
};

module.exports = {
  businessRegister,
  vendorLogin,
};
