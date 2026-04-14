const httpStatus = require('http-status');
const Joi = require('joi');
const mongoose = require('mongoose');
const ServicePlan = require('../models/servicePlan.model');

const createPlan = {
  validation: {
    body: Joi.object().keys({
      plan_name: Joi.string().trim().required(),
      months: Joi.number().integer().min(1).required(),
      amount: Joi.number().min(0).required(),
      max_services: Joi.number().integer().min(0).default(0),
      status: Joi.string().valid('active', 'inactive').default('active'),
    }),
  },
  handler: async (req, res) => {
    const data = req.body;
    data.plan_name = String(data.plan_name || '').trim().toLowerCase();
    const exists = await ServicePlan.findOne({ plan_name: data.plan_name });
    if (exists) {
      return res.status(httpStatus.BAD_REQUEST).json({ message: 'Plan name already exists' });
    }
    
    const plan = await ServicePlan.create(data);
    return res.status(201).json({ success: true, message: 'Service plan created', data: plan });
  },
};

const getAllPlans = {
  validation: {
    query: Joi.object().keys({
      status: Joi.string().valid('active', 'inactive').allow(''),
      search: Joi.string().allow(''),
    }),
  },
  handler: async (req, res) => {
    const { status, search } = req.query;
    const query = {};
    if (status) query.status = status;
    if (search && String(search).trim() !== '') {
      query.plan_name = new RegExp(String(search).trim(), 'i');
    }
    const data = await ServicePlan.find(query).sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      data,
    });
  },
};

const getPlanById = {
  handler: async (req, res) => {
    const { _id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid id' });
    }
    const plan = await ServicePlan.findById(_id);
    if (!plan) return res.status(httpStatus.NOT_FOUND).json({ message: 'Not found' });
    return res.status(200).json({ success: true, data: plan });
  },
};

const updatePlan = {
  validation: {
    body: Joi.object()
      .keys({
        plan_name: Joi.string().trim(),
        months: Joi.number().integer().min(1),
        amount: Joi.number().min(0),
        max_services: Joi.number().integer().min(0),
        status: Joi.string().valid('active', 'inactive'),
      })
      .prefs({ convert: true }),
  },
  handler: async (req, res) => {
    const { _id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid id' });
    }
    const body = req.body;
    if (body.plan_name) {
      body.plan_name = String(body.plan_name || '').trim().toLowerCase();
      const dup = await ServicePlan.findOne({ _id: { $ne: _id }, plan_name: body.plan_name });
      if (dup) return res.status(httpStatus.BAD_REQUEST).json({ message: 'Plan name already exists' });
    }
    
    const updated = await ServicePlan.findByIdAndUpdate(_id, body, { new: true });
    return res.status(200).json({ success: true, message: 'Service plan updated', data: updated });
  },
};

const deletePlan = {
  handler: async (req, res) => {
    const { _id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid id' });
    }
    await ServicePlan.findByIdAndDelete(_id);
    return res.send({ message: 'Service plan deleted successfully' });
  },
};

module.exports = {
  createPlan,
  getAllPlans,
  getPlanById,
  updatePlan,
  deletePlan,
};
