const httpStatus = require('http-status');
const Joi = require('joi');
const ServicePriorityPlan = require('../models/servicePriorityPlan.model');

const createPlan = {
  validation: {
    body: Joi.object().keys({
      monthly_price: Joi.number().min(0).required(),
      yearly_price: Joi.number().min(0).required(),
      addon_price: Joi.number().min(0).default(129),
      status: Joi.string().valid('active', 'inactive').default('active'),
      is_popular: Joi.boolean().default(false),
      features: Joi.array().items(Joi.string()).default([]),
    }),
  },
  handler: async (req, res) => {
    const data = req.body;
    // If this plan is marked as popular, remove popular from all other plans
    if (data.is_popular) {
      await ServicePriorityPlan.updateMany({}, { is_popular: false });
    }
    const plan = await ServicePriorityPlan.create(data);
    res.status(httpStatus.CREATED).send({ success: true, data: plan });
  },
};

const getAllPlans = {
  handler: async (req, res) => {
    const data = await ServicePriorityPlan.find({}).sort({ createdAt: -1 });
    res.send({ success: true, data });
  },
};

const updatePlan = {
  validation: {
    body: Joi.object().keys({
      monthly_price: Joi.number().min(0),
      yearly_price: Joi.number().min(0),
      addon_price: Joi.number().min(0),
      status: Joi.string().valid('active', 'inactive'),
      is_popular: Joi.boolean(),
      features: Joi.array().items(Joi.string()),
    }),
  },
  handler: async (req, res) => {
    const { _id } = req.params;
    // If this plan is being marked as popular, remove popular from all other plans
    if (req.body.is_popular === true) {
      await ServicePriorityPlan.updateMany({ _id: { $ne: _id } }, { is_popular: false });
    }
    const plan = await ServicePriorityPlan.findByIdAndUpdate(_id, req.body, { new: true });
    res.send({ success: true, data: plan });
  },
};

const deletePlan = {
  handler: async (req, res) => {
    const { _id } = req.params;
    await ServicePriorityPlan.findByIdAndDelete(_id);
    res.send({ success: true, message: 'Plan deleted' });
  },
};

module.exports = { createPlan, getAllPlans, updatePlan, deletePlan };
