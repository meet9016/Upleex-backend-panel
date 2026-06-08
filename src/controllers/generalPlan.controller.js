const httpStatus = require('http-status');
const Joi = require('joi');
const mongoose = require('mongoose');
const GeneralPlan = require('../models/generalPlan.model');

const createPlan = {
  validation: {
    body: Joi.object().keys({
      plan_type: Joi.string().trim().required(),
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
    const exists = await GeneralPlan.findOne({ plan_type: data.plan_type });
    if (exists) {
      return res.status(httpStatus.BAD_REQUEST).json({ message: 'Plan type already exists' });
    }
    
    // If this plan is marked as popular, remove popular from all other plans
    if (data.popular) {
      await GeneralPlan.updateMany({}, { popular: false });
    }
    
    const plan = await GeneralPlan.create(data);
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
    const total = await GeneralPlan.countDocuments(query);
    let q = GeneralPlan.find(query).sort({ createdAt: -1 });
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
    const plan = await GeneralPlan.findById(_id);
    if (!plan) return res.status(httpStatus.NOT_FOUND).json({ message: 'Not found' });
    return res.status(200).json({ success: true, data: plan });
  },
};

const updatePlan = {
  validation: {
    body: Joi.object()
      .keys({
        plan_type: Joi.string().trim(),
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
      const dup = await GeneralPlan.findOne({ _id: { $ne: _id }, plan_type: body.plan_type });
      if (dup) return res.status(httpStatus.BAD_REQUEST).json({ message: 'Plan type already exists' });
    }
    
    // If this plan is being marked as popular, remove popular from all other plans
    if (body.popular === true) {
      await GeneralPlan.updateMany({ _id: { $ne: _id } }, { popular: false });
    }
    
    const updated = await GeneralPlan.findByIdAndUpdate(_id, body, { new: true });
    return res.status(200).json({ success: true, message: 'Plan updated', data: updated });
  },
};

const deletePlan = {
  handler: async (req, res) => {
    const { _id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid id' });
    }
    await GeneralPlan.findByIdAndDelete(_id);
    return res.send({ message: 'Plan deleted successfully' });
  },
};

const purchaseGeneralPlan = {
  validation: {
    body: Joi.object().keys({
      plan_id: Joi.string().required(),
      product_ids: Joi.array().items(Joi.string()).optional().default([]),
      is_refill: Joi.boolean().default(false),
      purchase_id: Joi.string().allow('', null),
    }),
  },
  handler: async (req, res) => {
    const { plan_id, is_refill, purchase_id } = req.body;
    let product_ids = req.body.product_ids || [];
    const vendor_id = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(plan_id)) {
      return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid plan id' });
    }

    const GeneralPlanPurchase = require('../models/generalPlanPurchase.model');
    const plan = await GeneralPlan.findById(plan_id);

    if (is_refill && purchase_id) {
      if (!mongoose.Types.ObjectId.isValid(purchase_id)) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid purchase id' });
      }

      const existingPurchase = await GeneralPlanPurchase.findById(purchase_id);
      if (!existingPurchase) {
        return res.status(httpStatus.NOT_FOUND).json({ message: 'Purchase record not found' });
      }

      if (existingPurchase.status !== 'active') {
        return res.status(httpStatus.BAD_REQUEST).json({ message: 'Cannot refill an inactive plan' });
      }

      const totalNewProducts = (existingPurchase.product_ids || []).length + product_ids.length;
      if (totalNewProducts > existingPurchase.max_products) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: `Cannot exceed the maximum limit of ${existingPurchase.max_products} products.` });
      }

      existingPurchase.product_ids.push(...product_ids);
      await existingPurchase.save();

      return res.status(200).json({ success: true, message: 'Products added to your plan successfully!', data: existingPurchase });
    }

    if (!plan || plan.status !== 'active') {
      return res.status(httpStatus.NOT_FOUND).json({ message: 'Plan not found or inactive' });
    }

    if (product_ids.length > plan.max_products) {
      return res.status(httpStatus.BAD_REQUEST).json({ message: `Cannot select more than ${plan.max_products} products for this plan.` });
    }

    const gstAmount = plan.amount * 0.18;
    const totalPayable = plan.amount + gstAmount;

    // Check wallet balance
    const Wallet = require('../models/wallet.model');
    const wallet = await Wallet.findOne({ vendor_id });
    
    if (!wallet) {
      return res.status(httpStatus.BAD_REQUEST).json({ message: 'Wallet not found. Please add money to your wallet.' });
    }

    if (wallet.balance < totalPayable) {
      return res.status(httpStatus.BAD_REQUEST).json({ message: 'Insufficient wallet balance' });
    }

    // Generate transaction ID
    const transactionId = `WLT${Date.now().toString().slice(-6)}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Deduct money
    wallet.deductMoney(totalPayable, transactionId, `Purchased General Plan: ${plan.plan_type}`, {
      purpose: 'general_plan_purchase',
      plan_id: plan._id
    });
    await wallet.save();

    const purchase = await GeneralPlanPurchase.create({
      vendor_id,
      plan_id: plan._id,
      plan_type: plan.plan_type,
      max_products: plan.max_products,
      amount: totalPayable,
      product_ids,
    });

    return res.status(200).json({ success: true, message: 'General plan purchased successfully!', data: purchase });
  },
};

const getVendorPurchases = {
  handler: async (req, res) => {
    const vendor_id = req.user._id;
    const GeneralPlanPurchase = require('../models/generalPlanPurchase.model');
    
    // We populate product_ids to get their names etc.
    const purchases = await GeneralPlanPurchase.find({ vendor_id })
      .populate({
        path: 'product_ids',
        select: 'product_name category_name sub_category_name product_type_name',
      })
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, data: purchases });
  },
};

module.exports = {
  createPlan,
  getAllPlans,
  getPlanById,
  updatePlan,
  deletePlan,
  purchaseGeneralPlan,
  getVendorPurchases,
};
