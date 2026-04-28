const httpStatus = require('http-status');
const Joi = require('joi');
const moment = require('moment');
const ServicePriorityPlan = require('../models/servicePriorityPlan.model');
const ServicePriorityPlanPurchase = require('../models/servicePriorityPlanPurchase.model');
const Service = require('../models/service.model');
const walletService = require('../services/wallet.service');

const createPurchase = {
  validation: {
    body: Joi.object().keys({
      plan_id: Joi.string().required(),
      duration: Joi.string().valid('monthly', 'yearly').required(),
      has_duration_addon: Joi.boolean().default(false),
    }),
  },
  handler: async (req, res) => {
    try {
      const vendor_id = req.user.id || req.user._id;
      const { plan_id, duration, has_duration_addon } = req.body;

      const plan = await ServicePriorityPlan.findById(plan_id);
      if (!plan) return res.status(httpStatus.NOT_FOUND).json({ message: 'Plan not found' });

      let amount = duration === 'monthly' ? plan.monthly_price : plan.yearly_price;
      let addonAmount = 0;
      let months = duration === 'monthly' ? 1 : 12;

      if (has_duration_addon && duration === 'yearly') {
        addonAmount = plan.addon_price || 129;
        amount += addonAmount;
      }

      const hasBalance = await walletService.hasSufficientBalance(vendor_id, amount);
      if (!hasBalance) return res.status(httpStatus.BAD_REQUEST).json({ message: 'Insufficient wallet balance.' });

      // Get all vendor's approved services
      const vendorServices = await Service.find({ 
        vendor_id, 
        approval_status: 'approved',
        status: 'active'
      });

      if (vendorServices.length === 0) {
        return res.status(httpStatus.BAD_REQUEST).json({ 
          message: 'No approved services found. Please add and get approval for services first.' 
        });
      }

      await walletService.deductMoneyFromWallet(
        vendor_id,
        amount,
        `Service Priority Plan - ${duration}${has_duration_addon ? ' + Annual Benefit' : ''}`,
        { purpose: 'service_priority_purchase', plan_id }
      );

      const start = new Date();
      
      // Fixed 30-day counting: each month = 30 days
      const totalDays = months * 30;
      const months30 = Math.floor(totalDays / 30);
      const remainingDays = totalDays % 30;
      
      const expire = new Date(start);
      expire.setMonth(expire.getMonth() + months30);
      expire.setDate(expire.getDate() + remainingDays);

      // Update all vendor services with priority status
      const updateResult = await Service.updateMany(
        { 
          vendor_id, 
          approval_status: 'approved',
          status: 'active'
        },
        { 
          $set: { 
            is_priority: true, 
            priority_expires_at: expire 
          } 
        }
      );

      // Create purchase record with service IDs
      const serviceIds = vendorServices.map(service => service._id);
      const purchase = await ServicePriorityPlanPurchase.create({
        vendor_id,
        plan_id,
        plan_name: `Priority ${duration.charAt(0).toUpperCase() + duration.slice(1)}`,
        months,
        amount,
        service_ids: serviceIds, // Store all affected service IDs
        has_duration_addon,
        addon_amount: addonAmount,
        start_at: start,
        expire_at: expire,
      });

      res.status(201).json({ 
        success: true, 
        message: `Priority activated for ${vendorServices.length} services until ${moment(expire).format('DD/MM/YYYY')}!`, 
        data: {
          ...purchase.toObject(),
          affected_services_count: vendorServices.length,
          service_names: vendorServices.map(s => s.service_name)
        }
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ 
        message: error.message || 'Failed to purchase priority plan' 
      });
    }
  },
};

const getAllPurchases = {
  handler: async (req, res) => {
    try {
      const vendor_id = req.user.id || req.user._id;
      const purchases = await ServicePriorityPlanPurchase.find({ vendor_id })
        .populate('service_ids', 'service_name image is_priority priority_expires_at')
        .populate('plan_id', 'monthly_price yearly_price')
        .sort({ createdAt: -1 });

      // Enhance purchase data with current status
      const enhancedPurchases = purchases.map(purchase => {
        const now = new Date();
        const isActive = purchase.expire_at > now;
        const daysRemaining = isActive ? Math.ceil((purchase.expire_at - now) / (1000 * 60 * 60 * 24)) : 0;
        
        return {
          ...purchase.toObject(),
          is_active: isActive,
          days_remaining: daysRemaining,
          status: isActive ? 'active' : 'expired',
          affected_services_count: purchase.service_ids ? purchase.service_ids.length : 0
        };
      });

      res.status(200).json({ success: true, data: enhancedPurchases });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ 
        message: error.message || 'Failed to fetch purchase history' 
      });
    }
  },
};

// Fix existing purchases with empty service_ids
const fixExistingPurchases = {
  handler: async (req, res) => {
    try {
      const vendor_id = req.user.id || req.user._id;
      
      // Find purchases with empty service_ids that are still active
      const emptyPurchases = await ServicePriorityPlanPurchase.find({
        vendor_id,
        service_ids: { $size: 0 },
        expire_at: { $gt: new Date() }
      });

      let fixedCount = 0;
      for (const purchase of emptyPurchases) {
        // Find services that should have priority based on the purchase period
        const services = await Service.find({
          vendor_id,
          approval_status: 'approved',
          status: 'active',
          is_priority: true,
          priority_expires_at: purchase.expire_at
        });

        if (services.length > 0) {
          // Update the purchase with service IDs
          await ServicePriorityPlanPurchase.findByIdAndUpdate(purchase._id, {
            service_ids: services.map(s => s._id)
          });
          fixedCount++;
        }
      }

      res.status(200).json({ 
        success: true, 
        message: `Fixed ${fixedCount} purchase records`,
        fixed_purchases: fixedCount
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ 
        message: error.message || 'Failed to fix purchase records' 
      });
    }
  },
};

module.exports = { createPurchase, getAllPurchases, fixExistingPurchases };
