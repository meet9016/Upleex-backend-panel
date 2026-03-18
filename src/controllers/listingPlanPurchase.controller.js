const httpStatus = require('http-status');
const Joi = require('joi');
const mongoose = require('mongoose');
const ListingPlanPurchase = require('../models/listingPlanPurchase.model');
const ListingPlan = require('../models/listingPlan.model');
const { Product } = require('../models');
const VendorKyc = require('../models/vendor/vendorKyc.model');

const fallbackPlanOptions = [
  { plan_type: 'basic', months: 2, max_products: 1, amount: 39 },
  { plan_type: 'standard', months: 5, max_products: 3, amount: 59 },
  { plan_type: 'premium', months: 12, max_products: 7, amount: 109 },
];

const createPurchase = {
  validation: {
    body: Joi.object().keys({
      vendor_id: Joi.string().allow(''),
      plan_type: Joi.string().trim().allow(''),
      plan_id: Joi.string().allow(''),
      months: Joi.number().integer().min(1),
      max_products: Joi.number().integer().min(1),
      amount: Joi.number().min(0),
      product_ids: Joi.array().items(Joi.string().required()).min(1).required(),
      start_at: Joi.date(),
      expire_at: Joi.date(),
    }),
  },
  handler: async (req, res) => {
    let { vendor_id } = req.body;
    if (!vendor_id && req.user) {
      vendor_id = req.user.id || req.user._id;
    }
    let { plan_type, plan_id } = req.body;
    const { product_ids } = req.body;
    plan_type = String(plan_type || '').trim().toLowerCase();
    let { months, max_products, amount, start_at, expire_at } = req.body;
    if (plan_type !== 'custom') {
      let def = null;
      try {
        if (plan_id) {
          def = await ListingPlan.findOne({ _id: plan_id, status: 'active' });
          if (def && !plan_type) plan_type = String(def.plan_type || '').toLowerCase();
        }
        if (!def && plan_type) {
          def = await ListingPlan.findOne({ plan_type: plan_type, status: 'active' });
        }
      } catch (e) {}
      if (!def) {
        def = fallbackPlanOptions.find((p) => p.plan_type === plan_type);
      }
      if (!def) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid plan selection' });
      }
      if (def) {
        months = def.months;
        max_products = def.max_products;
        amount = def.amount;
      }
    }
    // Ensure we don't exceed max_products limit, but allow all products if max_products is sufficient
    const assignIds = max_products && max_products < product_ids.length 
      ? product_ids.slice(0, max_products) 
      : product_ids;
    const start = start_at ? new Date(start_at) : new Date();
    const expire = expire_at ? new Date(expire_at) : new Date(start);
    if (!expire_at) {
      expire.setMonth(expire.getMonth() + (months || 1));
    }
    const purchase = await ListingPlanPurchase.create({
      vendor_id,
      plan_type,
      months,
      max_products,
      amount,
      product_ids: assignIds,
      start_at: start,
      expire_at: expire,
    });
    await Product.updateMany(
      { _id: { $in: assignIds }, vendor_id },
      { 
        $set: { 
          status: 'active', 
          expires_at: expire,
          // approval_status:  'approved' // Ensure products are approved when activated
        } 
      }
    );
    return res.status(201).json({ status: 201, message: 'Plan purchase created', data: purchase });
  },
};

const getAllPurchases = {
  validation: {
    query: Joi.object().keys({
      vendor_id: Joi.string().allow(''),
      plan_type: Joi.string().allow(''),
      amount: Joi.number(),
      start_month: Joi.string().pattern(/^\d{4}-\d{2}(?:-\d{2})?$/).allow(''),
      expire_month: Joi.string().pattern(/^\d{4}-\d{2}(?:-\d{2})?$/).allow(''),
      q: Joi.string().allow(''),
      page: Joi.number().integer().min(1),
      limit: Joi.number().integer().min(1).max(200),
    }),
  },
  handler: async (req, res) => {
    const { vendor_id, plan_type, amount, start_month, expire_month, q: searchText } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const query = {};
    
    if (vendor_id) query.vendor_id = vendor_id;
    if (plan_type) query.plan_type = plan_type;
    if (amount) {
      query.amount = { $eq: Number(amount) };
    }
    
    // Handle date filters - using OR condition to show purchases that either start in start_month OR expire in expire_month
    const dateConditions = [];
    
    // Condition 1: Purchases that started in start_month
    if (start_month) {
      const sm = String(start_month).slice(0, 7); // YYYY-MM
      const startOfMonth = new Date(`${sm}-01`);
      startOfMonth.setHours(0, 0, 0, 0);
      const endOfMonth = new Date(startOfMonth);
      endOfMonth.setMonth(endOfMonth.getMonth() + 1);
      endOfMonth.setDate(0);
      endOfMonth.setHours(23, 59, 59, 999);
      dateConditions.push({ start_at: { $gte: startOfMonth, $lte: endOfMonth } });
    }

    // Condition 2: Purchases that expire in expire_month
    if (expire_month) {
      const em = String(expire_month).slice(0, 7); // YYYY-MM
      const startOfMonth = new Date(`${em}-01`);
      startOfMonth.setHours(0, 0, 0, 0);
      const endOfMonth = new Date(startOfMonth);
      endOfMonth.setMonth(endOfMonth.getMonth() + 1);
      endOfMonth.setDate(0);
      endOfMonth.setHours(23, 59, 59, 999);
      dateConditions.push({ expire_at: { $gte: startOfMonth, $lte: endOfMonth } });
    }
    
    // Apply OR condition if we have any date filters
    if (dateConditions.length > 0) {
      query.$or = dateConditions;
    }

    let mongo = ListingPlanPurchase.find(query).sort({ createdAt: -1 });
    let data;
    if (searchText) {
      data = await mongo;
    } else {
      if (limit) mongo = mongo.skip((page - 1) * limit).limit(limit);
      data = await mongo;
    }

    const vendorIds = [...new Set(data.map((d) => d.vendor_id).filter(Boolean))];
    let vendorMap = {};
    if (vendorIds.length) {
      const kycs = await VendorKyc.find(
        { 'ContactDetails.vendor_id': { $in: vendorIds } },
        { 'ContactDetails.vendor_id': 1, 'ContactDetails.full_name': 1, 'Identity.business_name': 1 }
      ).lean();
      kycs.forEach((k) => {
        const vid = (k?.ContactDetails?.vendor_id || '').toString();
        const business = k?.Identity?.business_name || '';
        const full = k?.ContactDetails?.full_name || '';
        vendorMap[vid] = business || full || '';
      });
    }

    let enriched = data.map((d) => {
      const obj = d.toObject ? d.toObject() : d;
      return { ...obj, vendor_name: vendorMap[String(d.vendor_id)] || '' };
    });

    if (searchText) {
      const s = String(searchText).toLowerCase();
      enriched = enriched.filter((e) => (e.vendor_name || '').toLowerCase().includes(s));
    }

    const total = searchText ? enriched.length : await ListingPlanPurchase.countDocuments(query);
    let paged = enriched;
    if (limit) {
      const startIdx = (page - 1) * limit;
      paged = enriched.slice(startIdx, startIdx + limit);
    }

    res.status(200).json({
      success: true,
      total,
      page: limit ? page : 1,
      limit: limit || total,
      totalPages: limit ? Math.ceil(total / limit) : 1,
      data: paged,
    });
  },
};

const getPurchaseById = {
  handler: async (req, res) => {
    const { _id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid id' });
    }
    const doc = await ListingPlanPurchase.findById(_id);
    if (!doc) {
      return res.status(httpStatus.NOT_FOUND).json({ message: 'Not found' });
    }
    return res.status(200).json({ status: 200, data: doc });
  },
};

const updatePurchase = {
  validation: {
    body: Joi.object()
      .keys({
        plan_type: Joi.string().trim(),
        months: Joi.number().integer().min(1),
        max_products: Joi.number().integer().min(1),
        amount: Joi.number().min(0),
        product_ids: Joi.array().items(Joi.string().required()).min(1),
        start_at: Joi.date(),
        expire_at: Joi.date(),
      })
      .prefs({ convert: true }),
  },
  handler: async (req, res) => {
    const { _id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid id' });
    }
    const doc = await ListingPlanPurchase.findById(_id);
    if (!doc) {
      return res.status(httpStatus.NOT_FOUND).json({ message: 'Not found' });
    }
    const body = req.body;
    if (body.plan_type) {
      body.plan_type = String(body.plan_type || '').trim().toLowerCase();
    }
    if (body.plan_type && body.plan_type !== 'custom') {
      let def = null;
      try {
        def = await ListingPlan.findOne({ plan_type: body.plan_type, status: 'active' });
      } catch (e) {}
      if (!def) {
        def = fallbackPlanOptions.find((p) => p.plan_type === body.plan_type);
      }
      if (def) {
        if (!body.months) body.months = def.months;
        if (!body.max_products) body.max_products = def.max_products;
        if (!body.amount) body.amount = def.amount;
      }
    }
    if (body.product_ids && body.product_ids.length && body.max_products) {
      // Only limit if max_products is less than the number of products being assigned
      if (body.max_products < body.product_ids.length) {
        body.product_ids = body.product_ids.slice(0, body.max_products);
      }
    }
    const updated = await ListingPlanPurchase.findByIdAndUpdate(_id, body, { new: true });
    if (updated && updated.product_ids && updated.product_ids.length) {
      const expire = updated.expire_at || new Date();
      await Product.updateMany(
        { _id: { $in: updated.product_ids }, vendor_id: updated.vendor_id },
        { 
          $set: { 
            status: 'active', 
            expires_at: expire,
            // approval_status: 'approved' // Ensure products are approved when activated
          } 
        }
      );
    }
    return res.status(200).json({ status: 200, message: 'Updated', data: updated });
  },
};

const deletePurchase = {
  handler: async (req, res) => {
    const { _id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid id' });
    }
    const existing = await ListingPlanPurchase.findById(_id);
    if (!existing) {
      return res.status(httpStatus.NOT_FOUND).json({ message: 'Not found' });
    }
    await ListingPlanPurchase.findByIdAndDelete(_id);
    return res.send({ message: 'Deleted successfully' });
  },
};

const getPlanOptions = {
  handler: async (req, res) => {
    try {
      const plans = await ListingPlan.find({ status: 'active' }).sort({ amount: 1 });
      if (plans && plans.length) {
        return res.status(200).json({ success: true, data: plans });
      }
    } catch (e) {}
    return res.status(200).json({ success: true, data: fallbackPlanOptions });
  },
};

const customPlanRequest = {
  validation: {
    body: Joi.object().keys({
      mobile: Joi.string().pattern(/^[0-9]{8,15}$/).required(),
      product_ids: Joi.array().items(Joi.string()).default([]),
    }),
  },
  handler: async (req, res) => {
    try {
      const { mobile, product_ids } = req.body;
      const vendorId = (req.user && (req.user.id || req.user._id)) || '';
      const lines = [
        'New Custom Plan Request',
        `Vendor ID: ${vendorId}`,
        `Mobile: ${mobile}`,
        `Product IDs: ${Array.isArray(product_ids) ? product_ids.join(', ') : ''}`,
      ].join('\n');
      // Try to email admin if configured
      try {
        const { sendEmail } = require('../services/email.service');
        const config = require('../config/config');
        await sendEmail(config.email.from, 'Custom Plan Request', lines);
      } catch (e) {
        // no-op if email not configured
      }
      return res.status(200).json({ success: true, message: 'Custom plan request sent to admin' });
    } catch (e) {
      return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: e.message });
    }
  },
};

module.exports = {
  createPurchase,
  getAllPurchases,
  getPurchaseById,
  updatePurchase,
  deletePurchase,
  getPlanOptions,
  customPlanRequest,
};