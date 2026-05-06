const httpStatus = require('http-status');
const Joi = require('joi');
const mongoose = require('mongoose');
const PriorityPlan = require('../models/priorityPlan.model');

const PriorityPlanPurchase = require('../models/priorityPlanPurchase.model');
const ListingPlanPurchase = require('../models/listingPlanPurchase.model');
const Product = require('../models/product.model');
const VendorKyc = require('../models/vendor/vendorKyc.model');
const walletService = require('../services/wallet.service');
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
      is_popular: Joi.boolean(),
      addon_available_for_yearly: Joi.boolean(),
      addon_price_per_year: Joi.number().min(0),
      addon_max_slots: Joi.number().integer().min(0),
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
      product_ids: Joi.array().items(Joi.string()).default([]),
      price: Joi.number().required(),
      plan_duration: Joi.string().valid('monthly', 'yearly').default('monthly'),
      is_addon_purchased: Joi.boolean().default(false),
      addon_product_ids: Joi.array().items(Joi.string()).default([]),
      is_refill: Joi.boolean().default(false),
      purchase_id: Joi.string().allow(''),
    }),
  },
  handler: async (req, res) => {
    const { plan_id, product_ids, price, plan_duration, is_addon_purchased, addon_product_ids, is_refill, purchase_id } = req.body;
    const vendor_id = req.user.id || req.user._id;

    try {
      const plan = await PriorityPlan.findById(plan_id);
      if (!plan) {
        return res.status(httpStatus.NOT_FOUND).json({ success: false, message: 'Plan not found' });
      }

      // Check for all active purchases for this plan type
      const activePurchases = await PriorityPlanPurchase.find({
        vendor_id,
        plan_id,
        status: 'active',
        expire_at: { $gt: new Date() }
      });

      let finalExpiryDate = new Date();
      // Fixed 30-day counting: each month = 30 days
      if (plan_duration === 'yearly') {
        // 12 months * 30 days = 360 days
        const totalDays = 12 * 30;
        const months30 = Math.floor(totalDays / 30);
        const remainingDays = totalDays % 30;
        
        finalExpiryDate.setMonth(finalExpiryDate.getMonth() + months30);
        finalExpiryDate.setDate(finalExpiryDate.getDate() + remainingDays);
      } else {
        // 1 month = 30 days
        const totalDays = 1 * 30;
        const months30 = Math.floor(totalDays / 30);
        const remainingDays = totalDays % 30;
        
        finalExpiryDate.setMonth(finalExpiryDate.getMonth() + months30);
        finalExpiryDate.setDate(finalExpiryDate.getDate() + remainingDays);
      }

      // Only update if it's an explicit refill OR if it's an upgrade (adding addon to a yearly plan that doesn't have it)
      const existingYearlyWithoutAddon = activePurchases.find(p => p.plan_duration === 'yearly' && !p.is_addon_purchased);

      if ((is_refill && purchase_id) || (is_addon_purchased && existingYearlyWithoutAddon)) {
        const pId = purchase_id || existingYearlyWithoutAddon?._id;
        const purchase = await PriorityPlanPurchase.findById(pId);
        if (!purchase) return res.status(httpStatus.NOT_FOUND).json({ success: false, message: 'Purchase record not found' });

        // Update expiry to newest extension if it's a new yearly purchase being treated as upgrade
        if (is_addon_purchased && !purchase.is_addon_purchased) {
          purchase.is_addon_purchased = true;
          purchase.addon_max_slots = plan.addon_max_slots;
          purchase.expire_at = finalExpiryDate; // Upgrade to full year from now
        }

        // Handle Addon Refill
        if (addon_product_ids && addon_product_ids.length > 0) {
          const currentAddonIds = (purchase.addon_product_ids || []).map(id => id.toString());
          const newAddonIds = addon_product_ids.filter(id => !currentAddonIds.includes(id.toString()));

          if (newAddonIds.length > 0) {
            const totalPlanned = currentAddonIds.length + newAddonIds.length;
            if (totalPlanned > (purchase.addon_max_slots || 0)) {
              return res.status(httpStatus.BAD_REQUEST).json({ success: false, message: `Addon slots exceeded. Max: ${purchase.addon_max_slots}` });
            }

            purchase.addon_product_ids.push(...newAddonIds);
            await purchase.save();

            // Update Products
            await Product.updateMany(
              { _id: { $in: newAddonIds }, vendor_id },
              { status: 'active', expires_at: purchase.expire_at }
            );

            // Sync with ListingPlanPurchase (Find existing addon record to avoid duplicates)
            let listingPurchase = await ListingPlanPurchase.findOne({
              vendor_id,
              plan_type: 'Priority Addon',
              priority_purchase_id: purchase._id
            });

            if (listingPurchase) {
              // Update existing
              await ListingPlanPurchase.updateOne(
                { _id: listingPurchase._id },
                {
                  $addToSet: { product_ids: { $each: newAddonIds } },
                  $set: {
                    priority_purchase_id: purchase._id, // Ensure it's linked now
                    expire_at: purchase.expire_at
                  }
                }
              );
            } else {
              // Create new only if absolutely none found
              await ListingPlanPurchase.create({
                vendor_id,
                plan_type: 'Priority Addon',
                months: 12,
                max_products: purchase.addon_max_slots,
                amount: 0,
                product_ids: newAddonIds,
                start_at: new Date(),
                expire_at: purchase.expire_at,
                priority_purchase_id: purchase._id
              });
            }
          }
        }

        // Handle Priority Refill
        if (product_ids && product_ids.length > 0) {
          const currentPriorityIds = (purchase.product_ids || []).map(id => id.toString());
          const newPriorityIds = product_ids.filter(id => !currentPriorityIds.includes(id.toString()));

          if (newPriorityIds.length > 0) {
            const totalPlanned = currentPriorityIds.length + newPriorityIds.length;
            if (totalPlanned > purchase.total_slots) {
              return res.status(httpStatus.BAD_REQUEST).json({ success: false, message: `Priority slots exceeded. Max: ${purchase.total_slots}` });
            }

            purchase.product_ids.push(...newPriorityIds);
            await purchase.save();

            await Product.updateMany(
              { _id: { $in: newPriorityIds }, vendor_id },
              { is_priority: true, priority_expiry: purchase.expire_at }
            );
          }
        }

        return res.status(200).json({ success: true, message: 'Priority Plan updated successfully', expiry: purchase.expire_at });
      }

      // If we got here, it's a NEW purchase (no existing compatible plan found or not a refill)
      if (product_ids.length > plan.product_slots) {
        return res.status(httpStatus.BAD_REQUEST).json({
          success: false,
          message: `Plan only allows up to ${plan.product_slots} products`
        });
      }

      // Deduct money from wallet if price > 0
      if (price > 0) {
        const description = `Priority Plan Purchase: ${plan.name} (${plan_duration})`;
        await walletService.deductMoneyFromWallet(vendor_id, price, description, {
          plan_id,
          plan_name: plan.name,
          type: 'priority_plan_purchase'
        });
      }

      const purchaseData = {
        vendor_id,
        plan_id,
        plan_name: plan.name,
        amount: price,
        total_slots: plan.product_slots,
        product_ids,
        expire_at: finalExpiryDate,
        plan_duration: plan_duration || 'monthly',
        is_addon_purchased: !!is_addon_purchased,
        addon_max_slots: is_addon_purchased ? plan.addon_max_slots : 0,
      };

      if (is_addon_purchased && addon_product_ids && addon_product_ids.length) {
        purchaseData.addon_product_ids = addon_product_ids;
      }

      const newPurchase = await PriorityPlanPurchase.create(purchaseData);

      // Update products to be priority
      await Product.updateMany(
        { _id: { $in: product_ids }, vendor_id },
        {
          is_priority: true,
          priority_expiry: finalExpiryDate
        }
      );

      // If addon was purchased, update listing expiry and create listing purchase record
      if (is_addon_purchased && addon_product_ids && addon_product_ids.length) {
        await Product.updateMany(
          { _id: { $in: addon_product_ids }, vendor_id },
          {
            status: 'active',
            expires_at: finalExpiryDate
          }
        );

        await ListingPlanPurchase.create({
          vendor_id,
          plan_type: 'Priority Addon',
          months: 12,
          max_products: plan.addon_max_slots,
          amount: 0,
          product_ids: addon_product_ids,
          start_at: new Date(),
          expire_at: finalExpiryDate,
          priority_purchase_id: newPurchase._id
        });
      }

      return res.status(200).json({
        success: true,
        message: is_addon_purchased ? 'Priority Plan & Annual Benefit activated successfully!' : 'Priority plan purchased successfully',
        expiry: finalExpiryDate
      });
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
        vendorMap[vid] = business || full || '';
      });
    }

    const enriched = purchases.map((d) => {
      const obj = d.toObject ? d.toObject() : d;
      return { ...obj, vendor_name: vendorMap[String(d.vendor_id)] || 'Unknown Vendor' };
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
