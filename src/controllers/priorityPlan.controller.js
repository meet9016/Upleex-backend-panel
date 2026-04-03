const httpStatus = require('http-status');
const Joi = require('joi');
const mongoose = require('mongoose');
const PriorityPlan = require('../models/priorityPlan.model');

const PriorityPlanPurchase = require('../models/priorityPlanPurchase.model');
const Product = require('../models/product.model');
const walletService = require('../services/wallet.service');
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


const purchasePriorityPlan = {
  validation: {
    body: Joi.object().keys({
      plan_id: Joi.string().required(),
      product_ids: Joi.array().items(Joi.string()).min(1).required(),
      price: Joi.number().required(),
    }),
  },
  handler: async (req, res) => {
    const { plan_id, product_ids, price } = req.body;
    const vendor_id = req.user.id || req.user._id;

    try {
      const plan = await PriorityPlan.findById(plan_id);
      if (!plan) {
        return res.status(httpStatus.NOT_FOUND).json({ success: false, message: 'Plan not found' });
      }

      // Check if any of these products are already priority
      const alreadyPriority = await Product.find({
        _id: { $in: product_ids },
        is_priority: true,
        priority_expiry: { $gt: new Date() }
      });

      if (alreadyPriority.length > 0) {
        const productNames = alreadyPriority.map(p => p.product_name).join(', ');
        return res.status(httpStatus.BAD_REQUEST).json({
          success: false,
          message: `The following products already have an active priority plan: ${productNames}`
        });
      }

      // Check for an existing active purchase for this plan
      const activePurchase = await PriorityPlanPurchase.findOne({
        vendor_id,
        plan_id,
        status: 'active',
        expire_at: { $gt: new Date() }
      });

      let expiryDate;
      let isNewPurchase = true;

      if (activePurchase && (activePurchase.product_ids.length + product_ids.length) <= activePurchase.total_slots) {
        // Reuse existing plan slots
        isNewPurchase = false;
        expiryDate = activePurchase.expire_at;

        // Update active purchase
        activePurchase.product_ids.push(...product_ids);
        await activePurchase.save();
      } else {
        // New purchase logic
        if (product_ids.length > plan.product_slots) {
          return res.status(httpStatus.BAD_REQUEST).json({
            success: false,
            message: `Plan only allows up to ${plan.product_slots} products`
          });
        }

        // Deduct money
        const description = `Priority Plan Purchase: ${plan.name}`;
        await walletService.deductMoneyFromWallet(vendor_id, price, description, {
          plan_id,
          plan_name: plan.name,
          type: 'priority_plan_purchase'
        });

        expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + 1);

        await PriorityPlanPurchase.create({
          vendor_id,
          plan_id,
          plan_name: plan.name,
          amount: price,
          total_slots: plan.product_slots,
          product_ids,
          expire_at: expiryDate,
        });
      }

      // Update products to be priority
      await Product.updateMany(
        { _id: { $in: product_ids }, vendor_id },
        {
          is_priority: true,
          priority_expiry: expiryDate
        }
      );

      return res.status(200).json({
        success: true,
        message: isNewPurchase ? 'Priority plan purchased and products updated' : 'Products added to your existing priority plan',
        expiry: expiryDate
      });
    } catch (error) {
      console.error('Priority plan purchase error:', error);
      return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message || 'Purchase failed'
      });
    }
  },
};

const getVendorPriorityPurchases = {
  handler: async (req, res) => {
    const vendor_id = req.user.id || req.user._id;
    const purchases = await PriorityPlanPurchase.find({
      vendor_id,
      status: 'active',
      expire_at: { $gt: new Date() }
    });
    return res.status(200).json({ success: true, data: purchases });
  },
};

module.exports = {
  createPriorityPlan,
  getAllPriorityPlans,
  updatePriorityPlan,
  deletePriorityPlan,
  purchasePriorityPlan,
  getVendorPriorityPurchases,
};
