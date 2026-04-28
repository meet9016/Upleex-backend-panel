const httpStatus = require('http-status');
const Joi = require('joi');
const mongoose = require('mongoose');
const ServiceListingPlanPurchase = require('../models/serviceListingPlanPurchase.model');
const ServicePlan = require('../models/servicePlan.model');
const Service = require('../models/service.model');
const walletService = require('../services/wallet.service');
const moment = require('moment');

const createPurchase = {
  validation: {
    body: Joi.object().keys({
      plan_id: Joi.string().required(),
      service_ids: Joi.array().items(Joi.string().required()).min(1).required(),
    }),
  },
  handler: async (req, res) => {
    const vendor_id = req.user.id || req.user._id;
    const { plan_id, service_ids } = req.body;

    const plan = await ServicePlan.findById(plan_id);
    if (!plan) {
      return res.status(httpStatus.NOT_FOUND).json({ message: 'Plan not found' });
    }

    // Check for existing active purchase with remaining slots
    const now = new Date();
    const existingPurchase = await ServiceListingPlanPurchase.findOne({
      vendor_id,
      plan_name: plan.plan_name,
      expire_at: { $gt: now },
    });

    if (existingPurchase) {
      const currentServiceIds = (existingPurchase.service_ids || []).map(id => String(id));
      const newServiceIds = service_ids.filter(id => !currentServiceIds.includes(String(id)));
      const maxServices = existingPurchase.max_services || 0;
      const usedSlots = currentServiceIds.length;
      const remainingSlots = maxServices > 0 ? Math.max(0, maxServices - usedSlots) : Infinity;

      if (newServiceIds.length > 0 && newServiceIds.length <= remainingSlots) {
        // Free add — update the existing purchase with new service_ids
        const updatedServiceIds = [...existingPurchase.service_ids, ...newServiceIds];

        await ServiceListingPlanPurchase.findByIdAndUpdate(existingPurchase._id, {
          service_ids: updatedServiceIds,
        });

        // Update services status and expiry - plan starts after service expiry
        const servicesToUpdate = await Service.find({ _id: { $in: newServiceIds }, vendor_id });
        
        for (const service of servicesToUpdate) {
          let newExpiryDate;
          
          // Check if service has expiry date and is still valid
          if (service.expires_at && service.expires_at > new Date()) {
            // Plan starts after service expiry - Fixed 30-day counting
            const totalDays = existingPurchase.months * 30;
            const months30 = Math.floor(totalDays / 30);
            const remainingDays = totalDays % 30;
            
            newExpiryDate = new Date(service.expires_at);
            newExpiryDate.setMonth(newExpiryDate.getMonth() + months30);
            newExpiryDate.setDate(newExpiryDate.getDate() + remainingDays);
          } else if (service.listing_expires_at && service.listing_expires_at > new Date()) {
            // Extend from current listing expiry date - Fixed 30-day counting
            const totalDays = existingPurchase.months * 30;
            const months30 = Math.floor(totalDays / 30);
            const remainingDays = totalDays % 30;
            
            newExpiryDate = new Date(service.listing_expires_at);
            newExpiryDate.setMonth(newExpiryDate.getMonth() + months30);
            newExpiryDate.setDate(newExpiryDate.getDate() + remainingDays);
          } else {
            // If expired or no expiry, use existing purchase expiry
            newExpiryDate = existingPurchase.expire_at;
          }
          
          await Service.findByIdAndUpdate(service._id, {
            status: 'active',
            listing_expires_at: newExpiryDate,
            listing_fee_paid: true
          });
        }

        return res.status(200).json({
          success: true,
          message: `${newServiceIds.length} service(s) added to existing plan for free`,
        });
      }
    }

    // New purchase flow — charge the vendor
    const amount = plan.amount;

    // Check wallet balance
    const hasBalance = await walletService.hasSufficientBalance(vendor_id, amount);
    if (!hasBalance) {
      return res.status(httpStatus.BAD_REQUEST).json({
        message: `Insufficient wallet balance. Plan costs ₹${amount}.`
      });
    }

    // Deduct amount
    try {
      await walletService.deductMoneyFromWallet(
        vendor_id,
        amount,
        `Service Listing Plan - ${plan.plan_name}`,
        {
          purpose: 'service_plan_purchase',
          plan_id: plan_id,
        }
      );
    } catch (e) {
      return res.status(httpStatus.BAD_REQUEST).json({ message: 'Wallet deduction failed' });
    }

    const start = new Date();
    
    // Fixed 30-day counting: each month = 30 days
    const totalDays = plan.months * 30;
    const months30 = Math.floor(totalDays / 30);
    const remainingDays = totalDays % 30;
    
    const expire = new Date(start);
    expire.setMonth(expire.getMonth() + months30);
    expire.setDate(expire.getDate() + remainingDays);

    // Update services - plan starts after service expiry date
    const servicesToUpdate = await Service.find({ _id: { $in: service_ids }, vendor_id });
    
    for (const service of servicesToUpdate) {
      let planStartDate;
      let newExpiryDate;
      
      // Check if service has expiry date and is still valid
      if (service.expires_at && service.expires_at > new Date()) {
        // Plan starts after service expiry - Fixed 30-day counting
        const totalDays = plan.months * 30;
        const months30 = Math.floor(totalDays / 30);
        const remainingDays = totalDays % 30;
        
        planStartDate = new Date(service.expires_at);
        newExpiryDate = new Date(service.expires_at);
        newExpiryDate.setMonth(newExpiryDate.getMonth() + months30);
        newExpiryDate.setDate(newExpiryDate.getDate() + remainingDays);
      } else {
        // Service already expired or no expiry, start plan immediately - Fixed 30-day counting
        const totalDays = plan.months * 30;
        const months30 = Math.floor(totalDays / 30);
        const remainingDays = totalDays % 30;
        
        planStartDate = new Date();
        newExpiryDate = new Date();
        newExpiryDate.setMonth(newExpiryDate.getMonth() + months30);
        newExpiryDate.setDate(newExpiryDate.getDate() + remainingDays);
      }
      
      await Service.findByIdAndUpdate(service._id, {
        status: 'active',
        listing_expires_at: newExpiryDate,
        listing_fee_paid: true
      });
    }

    const purchase = await ServiceListingPlanPurchase.create({
      vendor_id,
      plan_id,
      plan_name: plan.plan_name,
      months: plan.months,
      amount,
      max_services: plan.max_services || 0,
      service_ids,
      start_at: start,
      expire_at: expire,
    });

    return res.status(201).json({
      success: true,
      message: 'Service plan activated successfully',
      data: purchase
    });
  },
};

const getAllPurchases = {
  handler: async (req, res) => {
    const vendor_id = req.user.id || req.user._id;
    const data = await ServiceListingPlanPurchase.find({ vendor_id })
      .populate('service_ids', 'service_name category_name image')
      .sort({ createdAt: -1 });
    
    // For each service in the purchase, add the plan_name and expire_at
    const formattedData = data.map(purchase => {
      const purchaseObj = purchase.toObject();
      purchaseObj.service_ids = purchaseObj.service_ids.map(service => ({
        ...service,
        active_plan_name: purchaseObj.plan_name,
        expires_at: purchaseObj.expire_at,
      }));
      return purchaseObj;
    });

    return res.status(200).json({ success: true, data: formattedData });
  },
};

module.exports = {
  createPurchase,
  getAllPurchases,
};
