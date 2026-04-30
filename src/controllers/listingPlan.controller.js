const httpStatus = require('http-status');
const Joi = require('joi');
const mongoose = require('mongoose');
const ListingPlan = require('../models/listingPlan.model');

const createPlan = {
  validation: {
    body: Joi.object().keys({
      plan_type: Joi.string().trim().required(),
      months: Joi.number().integer().min(1).required(),
      max_products: Joi.number().integer().min(1).required(),
      amount: Joi.number().min(0).required(),
      status: Joi.string().valid('active', 'inactive').default('active'),
      popular: Joi.boolean().default(false),
      features: Joi.array().items(Joi.string()).default([]),
    }),
  },
  handler: async (req, res) => {
    const data = req.body;
    data.plan_type = String(data.plan_type || '').trim().toLowerCase();
    const exists = await ListingPlan.findOne({ plan_type: data.plan_type });
    if (exists) {
      return res.status(httpStatus.BAD_REQUEST).json({ message: 'Plan type already exists' });
    }
    
    // If this plan is marked as popular, remove popular from all other plans
    if (data.popular) {
      await ListingPlan.updateMany({}, { popular: false });
    }
    
    const plan = await ListingPlan.create(data);
    return res.status(201).json({ success: true, message: 'Plan created', data: plan });
  },
};

const getAllPlans = {
  validation: {
    query: Joi.object().keys({
      status: Joi.string().valid('active', 'inactive').allow(''),
      search: Joi.string().allow(''),
      page: Joi.number().integer().min(1),
      limit: Joi.number().integer().min(1).max(200),
    }),
  },
  handler: async (req, res) => {
    const { status, search } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 50;
    const skip = (page - 1) * limit;
    const query = {};
    if (status) query.status = status;
    if (search && String(search).trim() !== '') {
      query.plan_type = new RegExp(String(search).trim(), 'i');
    }
    const total = await ListingPlan.countDocuments(query);
    let q = ListingPlan.find(query).sort({ createdAt: -1 });
    if (limit) q = q.skip(skip).limit(limit);
    const data = await q;
    return res.status(200).json({
      success: true,
      total,
      page: limit ? page : 1,
      limit: limit || total,
      totalPages: limit ? Math.ceil(total / limit) : 1,
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
    const plan = await ListingPlan.findById(_id);
    if (!plan) return res.status(httpStatus.NOT_FOUND).json({ message: 'Not found' });
    return res.status(200).json({ success: true, data: plan });
  },
};

const updatePlan = {
  validation: {
    body: Joi.object()
      .keys({
        plan_type: Joi.string().trim(),
        months: Joi.number().integer().min(1),
        max_products: Joi.number().integer().min(1),
        amount: Joi.number().min(0),
        status: Joi.string().valid('active', 'inactive'),
        popular: Joi.boolean(),
        features: Joi.array().items(Joi.string()),
      })
      .prefs({ convert: true }),
  },
  handler: async (req, res) => {
    const { _id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid id' });
    }
    const body = req.body;
    if (body.plan_type) {
      body.plan_type = String(body.plan_type || '').trim().toLowerCase();
      const dup = await ListingPlan.findOne({ _id: { $ne: _id }, plan_type: body.plan_type });
      if (dup) return res.status(httpStatus.BAD_REQUEST).json({ message: 'Plan type already exists' });
    }
    
    // If this plan is being marked as popular, remove popular from all other plans
    if (body.popular === true) {
      await ListingPlan.updateMany({ _id: { $ne: _id } }, { popular: false });
    }
    
    const updated = await ListingPlan.findByIdAndUpdate(_id, body, { new: true });
    return res.status(200).json({ success: true, message: 'Plan updated', data: updated });
  },
};

const deletePlan = {
  handler: async (req, res) => {
    const { _id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid id' });
    }
    await ListingPlan.findByIdAndDelete(_id);
    return res.send({ message: 'Plan deleted successfully' });
  },
};

module.exports = {
  createPlan,
  getAllPlans,
  getPlanById,
  updatePlan,
  deletePlan,
};
