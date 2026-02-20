const Joi = require('joi');
const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');

const validate = (schema) => (req, res, next) => {
  const validSchema = pick(schema, ['params', 'query', 'body']);
  const object = pick(req, Object.keys(validSchema));

  const { value, error } = Joi.compile(validSchema)
    .prefs({
      errors: { label: 'key' },
      abortEarly: false
    })
    .validate(object, {
      allowUnknown: false,
      stripUnknown: false,
      convert: true,
      presence: 'optional'
    });

  if (error) {
    const errorMessage = error.details.map((details) => details.message).join(', ');
    return next(new ApiError(httpStatus.BAD_REQUEST, errorMessage));
  }

  // Explicitly preserve the options array
  if (req.body.options && Array.isArray(req.body.options)) {
    value.body.options = req.body.options;
  }

  Object.assign(req, value);

  return next();
};

module.exports = validate;