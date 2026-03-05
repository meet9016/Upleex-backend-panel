const httpStatus = require('http-status');
const Joi = require('joi');
const mongoose = require('mongoose');
const PriorityPlan = require('../models/priorityPlan.model');

const createPriorityPlan = {
  validation: {
    body: Joi.object().keys({
      name: Joi.string().trim().required(),
      monthly_price: Joi.number().min(0).required(),
      yearly_price: Joi.number().min(0).required(),
      product_slots: Joi.number().integer().min(1).required(),
      status: Joi.string().valid('active', 'inactive').default('active'),
      description: Joi.string().allow(''),
      addon_available_for_yearly: Joi.boolean().default(false),
      addon_price_per_year: Joi.number().min(0).default(0),
      addon_max_slots: Joi.number().integer().min(0).default(0),
      is_popular: Joi.boolean().default(false),
    }),
  },
  handler: async (req, res) => {
    const data = req.body;
    const exists = await PriorityPlan.findOne({ name: data.name.trim() });
    if (exists) return res.status(httpStatus.BAD_REQUEST).json({ message: 'Priority plan with this name already exists' });
    
    // If this plan is marked as popular, remove popular from all other plans
    if (data.is_popular) {
      await PriorityPlan.updateMany({}, { is_popular: false });
    }
    
    const plan = await PriorityPlan.create(data);
    return res.status(201).json({ success: true, message: 'Priority plan created', data: plan });
  },
};

const getAllPriorityPlans = {
  validation: {
    query: Joi.object().keys({
      status: Joi.string().allow(''),
    }),
  },
  handler: async (req, res) => {
    const { status } = req.query;
    const query = {};
    if (status) query.status = status;
    const data = await PriorityPlan.find(query).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data });
  },
};

const updatePriorityPlan = {
  validation: {
    body: Joi.object().keys({
      name: Joi.string().trim(),
      monthly_price: Joi.number().min(0),
      yearly_price: Joi.number().min(0),
      product_slots: Joi.number().integer().min(1),
      status: Joi.string().valid('active', 'inactive'),
      description: Joi.string().allow(''),
      addon_available_for_yearly: Joi.boolean(),
      addon_price_per_year: Joi.number().min(0),
      addon_max_slots: Joi.number().integer().min(0),
      is_popular: Joi.boolean(),
    }),
  },
  handler: async (req, res) => {
    const { _id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid id' });
    }
    const body = req.body;
    if (body.name) {
      const dup = await PriorityPlan.findOne({ _id: { $ne: _id }, name: body.name.trim() });
      if (dup) return res.status(httpStatus.BAD_REQUEST).json({ message: 'Priority plan with this name already exists' });
    }
    
    // If this plan is being marked as popular, remove popular from all other plans
    if (body.is_popular === true) {
      await PriorityPlan.updateMany({ _id: { $ne: _id } }, { is_popular: false });
    }
    
    const updated = await PriorityPlan.findByIdAndUpdate(_id, body, { new: true });
    return res.status(200).json({ success: true, message: 'Priority plan updated', data: updated });
  },
};

const deletePriorityPlan = {
  handler: async (req, res) => {
    const { _id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid id' });
    }
    await PriorityPlan.findByIdAndDelete(_id);
    return res.send({ message: 'Priority plan deleted successfully' });
  },
};

module.exports = {
  createPriorityPlan,
  getAllPriorityPlans,
  updatePriorityPlan,
  deletePriorityPlan,
};
