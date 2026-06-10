const httpStatus = require('http-status');
const Joi = require('joi');
const mongoose = require('mongoose');
const PriorityPlan = require('../models/priorityPlan.model');

const PriorityPlanPurchase = require('../models/priorityPlanPurchase.model');
const ListingPlanPurchase = require('../models/listingPlanPurchase.model');
const Product = require('../models/product.model');
const VendorKyc = require('../models/vendor/vendorKyc.model');
const Vendor = require('../models/vendor/vendor.model');
const walletService = require('../services/wallet.service');
const emailService = require('../services/email.service');
const createPriorityPlan = {
  validation: {
    body: Joi.object().keys({
      name: Joi.string().trim().required(),
      monthly_price: Joi.number().min(0).required(),
      yearly_price: Joi.number().min(0).required(),
      product_slots: Joi.number().integer().min(1).required(),
      status: Joi.string().valid('active', 'inactive').default('active'),
      is_popular: Joi.boolean().default(false),
      addon_available_for_yearly: Joi.boolean().default(true),
      addon_price_per_year: Joi.number().min(0).default(0),
      addon_max_slots: Joi.number().integer().min(0).default(0),
      unlimited_amount_monthly: Joi.number().min(0).default(0),
      extra_product_price_monthly: Joi.number().min(0).default(0),
      unlimited_amount_yearly: Joi.number().min(0).default(0),
      extra_product_price_yearly: Joi.number().min(0).default(0),
      free_listing: Joi.boolean().default(false),
      features: Joi.array().items(Joi.string()).default([]),
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
    let data = await PriorityPlan.find(query).sort({ createdAt: -1 });

    // If vendor is authenticated, fetch their active priority purchases
    let allActivePurchases = [];
    if (req.user && (req.user.id || req.user._id)) {
      const vendor_id = req.user.id || req.user._id;
      allActivePurchases = await PriorityPlanPurchase.find({
        vendor_id,
        status: 'active',
        expire_at: { $gt: new Date() }
      });
    }

    // For each plan, set free_listing to true for Basic/Standard, dynamic for others based ONLY on purchases for that plan
    data = data.map(plan => {
      const planObj = plan.toObject();
      const name = (planObj.name || '').toLowerCase();
      
      if (name === 'basic' || name === 'standard') {
        return {
          ...planObj,
          free_listing: true,
          is_unlimited: false,
          is_extra_per_product: false,
          is_monthly_extra: false,
          is_monthly_unlimited: false,
          is_yearly_extra: false,
          is_yearly_unlimited: false,
        };
      }
      
      // Calculate used slots specifically for THIS plan
      const planPurchases = allActivePurchases.filter(p => String(p.plan_id) === String(planObj._id));
      const usedSlotsForThisPlan = planPurchases.reduce((sum, p) =>
        sum + (p.product_ids?.length || 0) + (p.addon_product_ids?.length || 0), 0);

      // Aggregate purchase flags from active purchases of this plan
      const is_unlimited = planPurchases.some(p => p.is_unlimited);
      const is_extra_per_product = planPurchases.some(p => p.is_extra_per_product);
      const is_monthly_extra = planPurchases.some(p => p.is_monthly_extra);
      const is_monthly_unlimited = planPurchases.some(p => p.is_monthly_unlimited);
      const is_yearly_extra = planPurchases.some(p => p.is_yearly_extra);
      const is_yearly_unlimited = planPurchases.some(p => p.is_yearly_unlimited);

      return {
        ...planObj,
        free_listing: usedSlotsForThisPlan < (plan.product_slots || 0),
        is_unlimited,
        is_extra_per_product,
        is_monthly_extra,
        is_monthly_unlimited,
        is_yearly_extra,
        is_yearly_unlimited,
      };
    });

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
      is_popular: Joi.boolean(),
      addon_available_for_yearly: Joi.boolean(),
      addon_price_per_year: Joi.number().min(0),
      addon_max_slots: Joi.number().integer().min(0),
      unlimited_amount_monthly: Joi.number().min(0),
      extra_product_price_monthly: Joi.number().min(0),
      unlimited_amount_yearly: Joi.number().min(0),
      extra_product_price_yearly: Joi.number().min(0),
      free_listing: Joi.boolean(),
      features: Joi.array().items(Joi.string()),
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
      product_ids: Joi.array().items(Joi.string()).required().min(1).required(),
      price: Joi.number().optional(),
      plan_duration: Joi.string().valid('monthly', 'yearly').default('monthly'),
      is_addon_purchased: Joi.boolean().default(false),
      addon_product_ids: Joi.array().items(Joi.string()).default([]),
      is_unlimited: Joi.boolean(),
      is_extra_per_product: Joi.boolean(),
    }),
  },
  handler: async (req, res) => {
    const vendor_id = req.user.id || req.user._id;
    let { plan_id, is_unlimited, is_extra_per_product, plan_duration } = req.body;
    const { product_ids } = req.body;

    try {
      const plan = await PriorityPlan.findById(plan_id);
      if (!plan) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid plan selection' });
      }

      // 1. Check for active purchases of this plan and duration that are not expired
      const activePurchases = await PriorityPlanPurchase.find({
        vendor_id,
        plan_id,
        plan_duration,
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
          message: 'All selected products are already part of your active priority plans',
          data: activePurchases[0]
        });
      }

      // 4. Calculate Final Amount
      let finalAmount = plan_duration === "monthly" ? plan.monthly_price : plan.yearly_price;
      const extraPrice = plan_duration === "monthly" ? plan.extra_product_price_monthly : plan.extra_product_price_yearly;
      const unlimitedAmt = plan_duration === "monthly" ? plan.unlimited_amount_monthly : plan.unlimited_amount_yearly;
      let purchaseToUpdate = null;

      if (activeUnlimited) {
        finalAmount = 0;
        purchaseToUpdate = activeUnlimited;
      } else if (is_unlimited) {
        finalAmount = unlimitedAmt || 0;
      } else {
        // Check if plan is Basic or Standard (free refills for duration)
        const isBasicOrStandard = (plan.name?.toLowerCase() === 'basic' || plan.name?.toLowerCase() === 'standard');

        // Check remaining slots across all active purchases of this plan and duration
        const totalAvailableSlots = activePurchases.reduce((acc, p) => {
          const remaining = (p.total_slots || 0) - (p.product_ids || []).length;
          return acc + Math.max(0, remaining);
        }, 0);

        if (isBasicOrStandard && activePurchases.length > 0) {
          finalAmount = 0;
          purchaseToUpdate = activePurchases[0];
        } else if (trulyNewProductIds.length <= totalAvailableSlots) {
          finalAmount = 0;
          purchaseToUpdate = activePurchases.find(
            p => Math.max(0, (p.total_slots || 0) - (p.product_ids || []).length) >= trulyNewProductIds.length
          ) || activePurchases[0];
        } else if (is_extra_per_product) {
          const extraProducts = Math.max(0, trulyNewProductIds.length - totalAvailableSlots);
          finalAmount = extraProducts * (extraPrice || 0);
          purchaseToUpdate = activePurchases[0] || null;
        } else {
          finalAmount = plan_duration === "monthly" ? plan.monthly_price : plan.yearly_price;
        }
      }

      const gstAmount = finalAmount > 0 ? Number((finalAmount * 0.18).toFixed(2)) : 0;
      const totalAmountWithGst = Number((finalAmount + gstAmount).toFixed(2));

      if (purchaseToUpdate && finalAmount === 0) {
        purchaseToUpdate.product_ids.push(...trulyNewProductIds);
        await purchaseToUpdate.save();

        await Product.updateMany(
          { _id: { $in: trulyNewProductIds }, vendor_id },
          { is_priority: true, priority_expiry: purchaseToUpdate.expire_at }
        );

        return res.status(200).json({
          success: true,
          message: 'Products added to your existing priority plan successfully',
          data: purchaseToUpdate
        });
      }

      // Check wallet balance (skip for demo vendor)
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
            `Priority Plan: ${is_unlimited ? 'Unlimited Priority' : (activePurchases.length > 0 ? 'Extra Products' : 'New Subscription')} (Includes 18% GST)`,
            { purpose: 'priority_plan_purchase', is_unlimited, base_amount: finalAmount, gst_amount: gstAmount }
          );
        }
      }

      const start = new Date();

      // Fixed 30-day counting: each month = 30 days
      let totalDays = 30; // monthly
      if (plan_duration === "yearly") {
        totalDays = 12 * 30;
      }
      const months30 = Math.floor(totalDays / 30);
      const remainingDays = totalDays % 30;

      const commonExpire = new Date(start);
      commonExpire.setMonth(commonExpire.getMonth() + months30);
      commonExpire.setDate(commonExpire.getDate() + remainingDays);

      if (purchaseToUpdate) {
        purchaseToUpdate.product_ids.push(...trulyNewProductIds);
        if (is_unlimited !== undefined) {
          purchaseToUpdate.is_unlimited = is_unlimited;
          if (plan_duration === "monthly") purchaseToUpdate.is_monthly_unlimited = is_unlimited;
          if (plan_duration === "yearly") purchaseToUpdate.is_yearly_unlimited = is_unlimited;
        }
        if (is_extra_per_product !== undefined) {
          purchaseToUpdate.is_extra_per_product = is_extra_per_product;
          if (plan_duration === "monthly") purchaseToUpdate.is_monthly_extra = is_extra_per_product;
          if (plan_duration === "yearly") purchaseToUpdate.is_yearly_extra = is_extra_per_product;
        }
        await purchaseToUpdate.save();

        await Product.updateMany(
          { _id: { $in: trulyNewProductIds }, vendor_id },
          { is_priority: true, priority_expiry: purchaseToUpdate.expire_at }
        );

        const updatedBalance = await walletService.getWalletBalance(vendor_id);

        try {
          const vendor = await Vendor.findById(vendor_id);
          if (vendor && vendor.email) {
            await emailService.sendPurchaseConfirmationEmail(
              vendor.email,
              vendor.full_name || vendor.business_name || 'Vendor',
              `Priority Plan - ${plan.name} (${plan_duration.charAt(0).toUpperCase() + plan_duration.slice(1)})`,
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
        // Calculate total products for free_listing
        const allActivePurchases = await PriorityPlanPurchase.find({
          vendor_id,
          status: 'active',
          expire_at: { $gt: new Date() }
        });

        const totalUsedProducts = allActivePurchases.reduce((sum, p) =>
          sum + (p.product_ids?.length || 0) + (p.addon_product_ids?.length || 0), 0);

        const totalProductsAfter = totalUsedProducts + trulyNewProductIds.length;

        const purchase = await PriorityPlanPurchase.create({
          vendor_id,
          plan_id,
          plan_name: plan.name,
          amount: finalAmount,
          total_slots: plan.product_slots,
          product_ids: trulyNewProductIds,
          start_at: start,
          expire_at: commonExpire,
          plan_duration,
          is_unlimited: !!is_unlimited,
          is_extra_per_product: !!is_extra_per_product,
          is_monthly_extra: plan_duration === "monthly" && !!is_extra_per_product,
          is_monthly_unlimited: plan_duration === "monthly" && !!is_unlimited,
          is_yearly_extra: plan_duration === "yearly" && !!is_extra_per_product,
          is_yearly_unlimited: plan_duration === "yearly" && !!is_unlimited,
          gst_amount: gstAmount,
          total_amount: totalAmountWithGst,
          free_listing: (plan.name.toLowerCase() === 'basic' || plan.name.toLowerCase() === 'standard') ? true : !(totalProductsAfter >= plan.product_slots && !is_unlimited && !is_extra_per_product)
        });

        await Product.updateMany(
          { _id: { $in: trulyNewProductIds }, vendor_id },
          { is_priority: true, priority_expiry: purchase.expire_at }
        );

        const updatedBalance = await walletService.getWalletBalance(vendor_id);

        try {
          const vendor = await Vendor.findById(vendor_id);
          if (vendor && vendor.email) {
            await emailService.sendPurchaseConfirmationEmail(
              vendor.email,
              vendor.full_name || vendor.business_name || 'Vendor',
              `Priority Plan - ${plan.name} (${plan_duration.charAt(0).toUpperCase() + plan_duration.slice(1)})`,
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
    } catch (error) {
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
    const { filter_rent_sell } = req.query;

    let purchases = await PriorityPlanPurchase.find({
      vendor_id,
      status: 'active',
      expire_at: { $gt: new Date() }
    }).populate('product_ids', 'product_name category_name sub_category_name product_type_name expires_at priority_expiry').populate('addon_product_ids', 'product_name category_name sub_category_name product_type_name expires_at');

    if (filter_rent_sell) {
      const targetProductType = filter_rent_sell === '1' ? 'Rent' : 'Sell';

      purchases = purchases.map(purchase => {
        const obj = purchase.toObject();

        obj.product_ids = obj.product_ids.filter(product =>
          product && String(product.product_type_name).toLowerCase() === targetProductType.toLowerCase()
        );

        obj.addon_product_ids = obj.addon_product_ids.filter(product =>
          product && String(product.product_type_name).toLowerCase() === targetProductType.toLowerCase()
        );

        return obj;
      });
    }

    let total = 0;
    purchases.forEach(purchase => {
      total += (purchase.product_ids?.length || 0) + (purchase.addon_product_ids?.length || 0);
    });

    return res.status(200).json({ success: true, data: purchases, total });
  },
};

const getAllPriorityPurchases = {
  handler: async (req, res) => {
    const purchases = await PriorityPlanPurchase.find().populate('product_ids', 'product_name category_name sub_category_name expires_at priority_expiry').sort({ createdAt: -1 });

    const vendorIds = [...new Set(purchases.map((d) => d.vendor_id).filter(Boolean))];
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

    const enriched = purchases.map((d) => {
      const obj = d.toObject ? d.toObject() : d;
      const vendorData = vendorMap[String(d.vendor_id)] || { vendor_name: '', business_name: '' };
      return { ...obj, vendor_name: vendorData.vendor_name, business_name: vendorData.business_name };
    });

    return res.status(200).json({ success: true, data: enriched });
  },
};

module.exports = {
  createPriorityPlan,
  getAllPriorityPlans,
  updatePriorityPlan,
  deletePriorityPlan,
  purchasePriorityPlan,
  getVendorPriorityPurchases,
  getAllPriorityPurchases,
};
