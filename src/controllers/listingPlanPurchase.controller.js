const httpStatus = require('http-status');
const Joi = require('joi');
const mongoose = require('mongoose');
const ListingPlanPurchase = require('../models/listingPlanPurchase.model');
const ListingPlan = require('../models/listingPlan.model');
const { Product } = require('../models');
const VendorKyc = require('../models/vendor/vendorKyc.model');
const Vendor = require('../models/vendor/vendor.model');
const walletService = require('../services/wallet.service');
const emailService = require('../services/email.service');
const moment = require('moment');

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
      is_unlimited: Joi.boolean(),
      is_extra_per_product: Joi.boolean(),
    }),
  },
  handler: async (req, res) => {
    let { vendor_id } = req.body;
    if (!vendor_id && req.user) {
      vendor_id = req.user.id || req.user._id;
    }
    let { plan_type, plan_id, is_unlimited, is_extra_per_product } = req.body;
    const { product_ids } = req.body;
    plan_type = String(plan_type || '').trim().toLowerCase();
    let { months, max_products, amount, start_at, expire_at } = req.body;
    
    let def = null;
    if (plan_type !== 'custom') {
      try {
        if (plan_id) {
          def = await ListingPlan.findOne({ _id: plan_id, status: 'active' });
          if (def && !plan_type) plan_type = String(def.plan_type || '').toLowerCase();
        }
        if (!def && plan_type) {
          def = await ListingPlan.findOne({ plan_type: plan_type, status: 'active' });
        }
      } catch (e) { }
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

    // 1. Check for active purchases of this type that are not expired
    const activePurchases = await ListingPlanPurchase.find({
      vendor_id,
      plan_type,
      expire_at: { $gt: new Date() }
    });

    const activeUnlimited = activePurchases.find(p => p.is_unlimited);

    // 2. Identify truly new products (filter out those already in some active plan of this type)
    const allCurrentlyAssignedIds = activePurchases.flatMap(p => p.product_ids.map(id => String(id)));
    const trulyNewProductIds = product_ids.filter(pid => !allCurrentlyAssignedIds.includes(String(pid)));

    // 3. If no new products are being added, just return success
    if (trulyNewProductIds.length === 0 && activePurchases.length > 0) {
      return res.status(200).json({
        success: true,
        message: 'All selected products are already part of your active listing plans',
        data: activePurchases[0]
      });
    }

    // 4. Calculate Final Price and handle Unlimited/Extra logic
    let finalAmount = amount;
    let purchaseToUpdate = null;

    if (activeUnlimited) {
      // If already has unlimited, no more charges for this plan type
      finalAmount = 0;
      purchaseToUpdate = activeUnlimited;
    } else if (is_unlimited) {
      // Purchasing unlimited option
      finalAmount = def?.unlimited_amount || 0;
    } else {
      // Check remaining slots across all active purchases of this plan type
      const totalAvailableSlots = activePurchases.reduce((acc, p) => {
        const remaining = (p.max_products || 0) - (p.product_ids || []).length;
        return acc + Math.max(0, remaining);
      }, 0);

      if (trulyNewProductIds.length <= totalAvailableSlots) {
        // Fits within existing slots — FREE, no charge
        finalAmount = 0;
        purchaseToUpdate = activePurchases.find(
          p => Math.max(0, (p.max_products || 0) - (p.product_ids || []).length) >= trulyNewProductIds.length
        ) || activePurchases[0];
      } else if (is_extra_per_product) {
        // Exceeds slots — charge per extra product
        const extraProducts = Math.max(0, trulyNewProductIds.length - totalAvailableSlots);
        finalAmount = extraProducts * (def?.extra_product_price || 0);
        purchaseToUpdate = activePurchases[0] || null;
      } else {
        // New bundle purchase — charge full plan amount
        finalAmount = def?.amount || 0;
      }
    }

    const gstAmount = finalAmount > 0 ? Number((finalAmount * 0.18).toFixed(2)) : 0;
    const totalAmountWithGst = Number((finalAmount + gstAmount).toFixed(2));

    if (purchaseToUpdate && finalAmount === 0) {
      // Just update existing purchase
      purchaseToUpdate.product_ids.push(...trulyNewProductIds);
      await purchaseToUpdate.save();

      // Update product expiry
      const productsToUpdate = await Product.find({ _id: { $in: trulyNewProductIds }, vendor_id });
      const bulkOps = productsToUpdate.map(product => {
        let updateData = { $set: { status: 'active', expires_at: purchaseToUpdate.expire_at } };
        return { updateOne: { filter: { _id: product._id }, update: updateData } };
      });
      if (bulkOps.length > 0) await Product.bulkWrite(bulkOps);

      return res.status(200).json({
        success: true,
        message: 'Products added to your existing listing plan successfully',
        data: purchaseToUpdate
      });
    }

    // Check wallet balance and deduct (skip for demo vendor)
    const isDemo = await walletService.isDemoVendor(vendor_id);
    if (!isDemo) {
      const hasBalance = await walletService.hasSufficientBalance(vendor_id, totalAmountWithGst);
      if (!hasBalance) {
        return res.status(httpStatus.BAD_REQUEST).json({
          message: `Insufficient wallet balance. Total charge including 18% GST is ₹${totalAmountWithGst} (Base: ₹${finalAmount} + GST: ₹${gstAmount}). Please add money.`
        });
      }

      if (totalAmountWithGst > 0) {
        await walletService.deductMoneyFromWallet(
          vendor_id,
          totalAmountWithGst,
          `${plan_type} plan: ${is_unlimited ? 'Unlimited Listing' : (activePurchases.length > 0 ? 'Extra Products' : 'New Subscription')} (Includes 18% GST)`,
          { purpose: 'plan_purchase', plan_type, is_unlimited, base_amount: finalAmount, gst_amount: gstAmount }
        );
      }
    }

    const start = start_at ? moment(start_at).toDate() : new Date();
    
    // Fixed 30-day counting: each month = 30 days
    const totalDays = months * 30;
    const months30 = Math.floor(totalDays / 30);
    const remainingDays = totalDays % 30;
    
    const commonExpire = new Date(start);
    commonExpire.setMonth(commonExpire.getMonth() + months30);
    commonExpire.setDate(commonExpire.getDate() + remainingDays);

    if (purchaseToUpdate) {
      // Adding extra products or upgrading to unlimited on existing plan
      purchaseToUpdate.product_ids.push(...trulyNewProductIds);
      if (is_unlimited !== undefined) purchaseToUpdate.is_unlimited = is_unlimited;
      if (is_extra_per_product !== undefined) purchaseToUpdate.is_extra_per_product = is_extra_per_product;
      await purchaseToUpdate.save();

      // Update products
      const productsToUpdate = await Product.find({ _id: { $in: trulyNewProductIds }, vendor_id });
      const bulkOps = productsToUpdate.map(product => ({
        updateOne: { filter: { _id: product._id }, update: { $set: { status: 'active', expires_at: purchaseToUpdate.expire_at } } }
      }));
      if (bulkOps.length > 0) await Product.bulkWrite(bulkOps);

      // Get updated wallet balance
      const updatedBalance = await walletService.getWalletBalance(vendor_id);

      try {
        const vendor = await Vendor.findById(vendor_id);
        if (vendor && vendor.email) {
          await emailService.sendPurchaseConfirmationEmail(
            vendor.email,
            vendor.full_name || vendor.business_name || 'Vendor',
            `${String(plan_type).toUpperCase()} Listing Plan`,
            'Plan Subscription Update',
            purchaseToUpdate._id.toString()
          );
        }
      } catch (err) {
        console.error('Email send failed:', err);
      }

      return res.status(200).json({ 
        success: true, 
        message: 'Plan updated successfully', 
        data: { ...purchaseToUpdate.toObject(), wallet_balance: updatedBalance } 
      });
    } else {
      // Create new purchase
      const purchase = await ListingPlanPurchase.create({
        vendor_id,
        plan_type,
        months,
        max_products,
        amount: finalAmount,
        product_ids: trulyNewProductIds,
        start_at: start,
        expire_at: expire_at ? new Date(expire_at) : commonExpire,
        is_unlimited: !!is_unlimited,
        is_extra_per_product: !!is_extra_per_product,
        gst_amount: gstAmount,
        total_amount: totalAmountWithGst,
      });

      // Update products
      const productsToUpdate = await Product.find({ _id: { $in: trulyNewProductIds }, vendor_id });
      const bulkOps = productsToUpdate.map(product => ({
        updateOne: { filter: { _id: product._id }, update: { $set: { status: 'active', expires_at: purchase.expire_at } } }
      }));
      if (bulkOps.length > 0) await Product.bulkWrite(bulkOps);

      // Get updated wallet balance
      const updatedBalance = await walletService.getWalletBalance(vendor_id);

      try {
        const vendor = await Vendor.findById(vendor_id);
        if (vendor && vendor.email) {
          await emailService.sendPurchaseConfirmationEmail(
            vendor.email,
            vendor.full_name || vendor.business_name || 'Vendor',
            `${String(plan_type).toUpperCase()} Listing Plan`,
            'Plan Subscription',
            purchase._id.toString()
          );
        }
      } catch (err) {
        console.error('Email send failed:', err);
      }

      return res.status(201).json({ 
        success: true, 
        message: 'Plan activated successfully', 
        data: { ...purchase.toObject(), wallet_balance: updatedBalance } 
      });
    }
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
      filter_rent_sell: Joi.string().allow(''),
    }),
  },
  handler: async (req, res) => {
    const { vendor_id, plan_type, amount, start_month, expire_month, q: searchText, filter_rent_sell } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const query = {};

    // Auto-filter by logged-in vendor if applicable
    if (req.user && req.user.userType === 'vendor') {
      query.vendor_id = req.user.id || req.user._id;
    } else if (vendor_id) {
      query.vendor_id = vendor_id;
    }
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

    let mongo = ListingPlanPurchase.find(query).populate('product_ids', 'product_name category_name sub_category_name product_type_name expires_at').sort({ createdAt: -1 });
    let allData = await mongo;

    const vendorIds = [...new Set(allData.map((d) => d.vendor_id).filter(Boolean))];
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
        vendorMap[vid] = { vendor_name: full || '', business_name: business || '' };
      });
    }

    let enriched = allData.map((d) => {
      const obj = d.toObject ? d.toObject() : d;
      const vendorData = vendorMap[String(d.vendor_id)] || { vendor_name: '', business_name: '' };
      return { ...obj, vendor_name: vendorData.vendor_name, business_name: vendorData.business_name };
    });

    if (filter_rent_sell) {
      const targetProductType = filter_rent_sell === '1' ? 'Rent' : 'Sell';
      
      enriched = enriched.map(purchase => {
        purchase.product_ids = purchase.product_ids.filter(product => 
          product && String(product.product_type_name).toLowerCase() === targetProductType.toLowerCase()
        );
        return purchase;
      });
    }

    if (searchText) {
      const s = String(searchText).toLowerCase();
      enriched = enriched.filter((e) => (e.vendor_name || '').toLowerCase().includes(s));
    }

    const total = enriched.length;
    
    let totalCount = 0;
    enriched.forEach(purchase => {
      totalCount += purchase.product_ids?.length || 0;
    });

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
      totalCount,
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
      } catch (e) { }
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
          }
        }
      );
    }
    return res.status(200).json({ status: 200, message: 'Updated', data: updated });
  },
};

const getVendorListingPurchases = {
  handler: async (req, res) => {
    const vendor_id = req.user.id || req.user._id;
    const { filter_rent_sell } = req.query;

    let purchases = await ListingPlanPurchase.find({
      vendor_id,
      expire_at: { $gt: new Date() }
    })
      .populate('product_ids', 'product_name category_name sub_category_name product_type_name expires_at')
      .sort({ createdAt: -1 });

    if (filter_rent_sell) {
      const targetProductType = filter_rent_sell === '1' ? 'Rent' : 'Sell';

      purchases = purchases.map(purchase => {
        const obj = purchase.toObject();
        obj.product_ids = (obj.product_ids || []).filter(product =>
          product && String(product.product_type_name).toLowerCase() === targetProductType.toLowerCase()
        );
        return obj;
      });
    }

    let total = 0;
    purchases.forEach(purchase => {
      total += purchase.product_ids?.length || 0;
    });

    return res.status(200).json({ success: true, data: purchases, total });
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
      let data = plans;

      if (!plans || !plans.length) {
        data = fallbackPlanOptions;
      }

      // If user is logged in, calculate free listing availability
      if (req.user && (req.user.id || req.user._id)) {
        const vendor_id = req.user.id || req.user._id;
        
        // Fetch all active purchases for this vendor to calculate usage
        const activePurchases = await ListingPlanPurchase.find({
          vendor_id,
          expire_at: { $gt: new Date() }
        });

        data = data.map(plan => {
          const planObj = plan.toObject ? plan.toObject() : { ...plan };
          
          // Check for any active unlimited purchase for this plan type
          const hasUnlimited = activePurchases.some(p => p.plan_type === planObj.plan_type && p.is_unlimited);
          
          if (hasUnlimited) {
            planObj.free_listing = true;
          } else {
            // Count how many products are currently listed under this specific plan type
            const planPurchases = activePurchases.filter(p => p.plan_type === planObj.plan_type);
            const usedProductsCount = planPurchases.reduce((acc, p) => acc + (p.product_ids?.length || 0), 0);
            
            // If used products count is greater than or equal to max_products, set free_listing to false
            planObj.free_listing = usedProductsCount < (planObj.max_products || 0);
          }
          
          return planObj;
        });
      }

      return res.status(200).json({ success: true, data });
    } catch (e) {
      return res.status(200).json({ success: true, data: fallbackPlanOptions });
    }
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
  getVendorListingPurchases,
};
