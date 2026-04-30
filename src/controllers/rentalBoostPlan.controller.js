const httpStatus = require('http-status');
const Joi = require('joi');
const mongoose = require('mongoose');
const RentalBoostPlan = require('../models/rentalBoostPlan.model');
const RentalBoostPlanPurchase = require('../models/rentalBoostPlanPurchase.model');
const { Product, Wallet } = require('../models');
const VendorKyc = require('../models/vendor/vendorKyc.model');
const walletService = require('../services/wallet.service');

const createRentalBoostPlan = {
  validation: {
    body: Joi.object().keys({
      name: Joi.string().allow(''),
      days: Joi.number().integer().min(1).required(),
      price: Joi.number().min(0).required(),
      status: Joi.string().valid('active', 'inactive').default('active'),
      is_popular: Joi.boolean().default(false),
      features: Joi.array().items(Joi.string()).default([]),
    }),
  },
  handler: async (req, res) => {
    try {
      const plan = await RentalBoostPlan.create(req.body);
      res.status(httpStatus.CREATED).send({ success: true, message: 'Rental boost plan created successfully', data: plan });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).send({ success: false, message: error.message });
    }
  },
};

const getAllRentalBoostPlans = {
  validation: {
    query: Joi.object().keys({
      status: Joi.string().valid('active', 'inactive'),
    }),
  },
  handler: async (req, res) => {
    try {
      const plans = await RentalBoostPlan.find(req.query);
      res.status(httpStatus.OK).send({ success: true, data: plans });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).send({ success: false, message: error.message });
    }
  },
};

const updateRentalBoostPlan = {
  validation: {
    params: Joi.object().keys({
      _id: Joi.string().required(),
    }),
    body: Joi.object().keys({
      name: Joi.string().allow(''),
      days: Joi.number().integer().min(1),
      price: Joi.number().min(0),
      status: Joi.string().valid('active', 'inactive'),
      is_popular: Joi.boolean(),
      features: Joi.array().items(Joi.string()),
    }),
  },
  handler: async (req, res) => {
    try {
      const plan = await RentalBoostPlan.findByIdAndUpdate(req.params._id, req.body, { new: true });
      if (!plan) return res.status(httpStatus.NOT_FOUND).send({ success: false, message: 'Plan not found' });
      res.status(httpStatus.OK).send({ success: true, message: 'Rental boost plan updated successfully', data: plan });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).send({ success: false, message: error.message });
    }
  },
};

const deleteRentalBoostPlan = {
  handler: async (req, res) => {
    try {
      const plan = await RentalBoostPlan.findByIdAndDelete(req.params._id);
      if (!plan) return res.status(httpStatus.NOT_FOUND).send({ success: false, message: 'Plan not found' });
      res.status(httpStatus.OK).send({ success: true, message: 'Rental boost plan deleted successfully' });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).send({ success: false, message: error.message });
    }
  },
};

const purchaseRentalBoostPlan = {
  validation: {
    body: Joi.object().keys({
      plan_id: Joi.string().required(),
      product_id: Joi.string().required(),
    }),
  },
  handler: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { plan_id, product_id } = req.body;
      const vendor_id = req.user.id || req.user._id;

      // 1. Fetch Plan
      const plan = await RentalBoostPlan.findById(plan_id).session(session);
      if (!plan || plan.status !== 'active') {
        throw new Error('Boost plan not found or inactive');
      }

      // 2. Fetch Product (Any product - no priority check required)
      const product = await Product.findById(product_id).session(session);
      if (!product) {
        throw new Error('Product not found');
      }

      // 3. Deduct from Wallet
      const wallet = await Wallet.findOne({ vendor_id }).session(session);
      if (!wallet || wallet.wallet_balance < plan.price) {
        throw new Error('Insufficient wallet balance');
      }

      await walletService.deductMoneyFromWallet(vendor_id, plan.price, `Purchase of ${plan.name} for product: ${product.product_name}`);

      // 4. Update Product Boost Status
      // Fixed 30-day counting: each month = 30 days
      const startDate = new Date();
      const totalDays = plan.days;
      const months30 = Math.floor(totalDays / 30);
      const remainingDays = totalDays % 30;
      
      const expiryDate = new Date(startDate);
      expiryDate.setMonth(expiryDate.getMonth() + months30);
      expiryDate.setDate(expiryDate.getDate() + remainingDays);

      product.is_boosted = true;
      product.boost_expiry = expiryDate;
      await product.save({ session });

      // 5. Create Purchase Record
      const purchase = await RentalBoostPlanPurchase.create([{
        vendor_id: new mongoose.Types.ObjectId(vendor_id),
        vendor_name: req.user.name || 'Vendor',
        product_id: new mongoose.Types.ObjectId(product_id),
        product_name: product.product_name,
        rental_boost_plan_id: plan._id,
        plan_name: plan.name,
        price: plan.price,
        days: plan.days,
        payment_status: 'completed',
        start_date: startDate,
        expiry_date: expiryDate,
        transaction_id: `RB-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      }], { session });

      await session.commitTransaction();
      res.status(httpStatus.OK).send({
        success: true,
        message: `Plan ${plan.name} applied to ${product.product_name} successfully!`,
        data: purchase[0]
      });
    } catch (error) {
      await session.abortTransaction();
      res.status(httpStatus.BAD_REQUEST).send({ success: false, message: error.message });
    } finally {
      session.endSession();
    }
  },
};

const purchaseBulkRentalBoostPlan = {
  validation: {
    body: Joi.object().keys({
      plan_id: Joi.string().required(),
      product_ids: Joi.array().items(Joi.string()).min(1).required(),
    }),
  },
  handler: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { plan_id, product_ids } = req.body;
      const vendor_id = req.user.id || req.user._id;

      // 1. Fetch Plan
      const plan = await RentalBoostPlan.findById(plan_id).session(session);
      if (!plan || plan.status !== 'active') {
        throw new Error('Boost plan not found or inactive');
      }

      // 2. Fetch Selected Products
      const allProducts = await Product.find({
        _id: { $in: product_ids },
        vendor_id: vendor_id
      }).session(session);

      if (allProducts.length === 0) {
        throw new Error('No valid products found');
      }

      if (allProducts.length !== product_ids.length) {
        throw new Error('Some products not found or not owned by you');
      }

      // 3. Calculate total price: PER PRODUCT pricing
      const totalPrice = plan.price * allProducts.length;
      
      // Fixed 30-day counting for bulk as well
      const now = new Date();
      const totalDays = plan.days;
      const months30 = Math.floor(totalDays / 30);
      const remainingDays = totalDays % 30;
      
      let expiryDate = new Date(now);
      expiryDate.setMonth(expiryDate.getMonth() + months30);
      expiryDate.setDate(expiryDate.getDate() + remainingDays);

      // 4. Check Wallet
      const wallet = await Wallet.findOne({ vendor_id }).session(session);
      if (!wallet || wallet.wallet_balance < totalPrice) {
        throw new Error(`Insufficient wallet balance. Total required: ₹${totalPrice} for ${allProducts.length} products`);
      }
      
      // Deduct Money
      await walletService.deductMoneyFromWallet(vendor_id, totalPrice, `Bulk Boost for ${allProducts.length} products using ${plan.name} (₹${plan.price} per product)`);

      // 5. Update All Products
      const startDate = now;
      const productIds = allProducts.map(p => p._id);

      await Product.updateMany(
        { _id: { $in: productIds } },
        {
          $set: {
            is_boosted: true,
            boost_expiry: expiryDate
          }
        },
        { session }
      );

      // 6. Create Purchase Records for each product
      const purchaseRecords = allProducts.map(product => ({
        vendor_id: new mongoose.Types.ObjectId(vendor_id),
        vendor_name: req.user.name || 'Vendor',
        product_id: product._id,
        product_name: product.product_name,
        rental_boost_plan_id: plan._id,
        plan_name: plan.name,
        price: plan.price, // Full price per product
        days: plan.days,
        payment_status: 'completed',
        start_date: startDate,
        expiry_date: expiryDate,
        transaction_id: `RB-BULK-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      }));

      await RentalBoostPlanPurchase.insertMany(purchaseRecords, { session });

      await session.commitTransaction();
      res.status(httpStatus.OK).send({
        success: true,
        message: `Boosted ${allProducts.length} products successfully! ₹${totalPrice} charged (₹${plan.price} per product).`,
      });
    } catch (error) {
      await session.abortTransaction();
      res.status(httpStatus.BAD_REQUEST).send({ success: false, message: error.message });
    } finally {
      session.endSession();
    }
  },
};

const getVendorRentalBoostPurchases = {
  handler: async (req, res) => {
    try {
      const vendor_id = req.user.id || req.user._id;
      const purchases = await RentalBoostPlanPurchase.find({ vendor_id: new mongoose.Types.ObjectId(vendor_id) })
        .populate('product_id', 'product_name category_name sub_category_name product_type_name expires_at boost_expiry')
        .populate('rental_boost_plan_id', 'name days price')
        .sort({ createdAt: -1 });
      res.status(httpStatus.OK).send({ success: true, data: purchases });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).send({ success: false, message: error.message });
    }
  },
};

const getAllRentalBoostPurchases = {
  handler: async (req, res) => {
    try {
      const purchases = await RentalBoostPlanPurchase.find()
        .populate('product_id', 'product_name category_name sub_category_name expires_at boost_expiry')
        .populate('rental_boost_plan_id', 'name days price')
        .sort({ createdAt: -1 });

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
        const plan = obj.rental_boost_plan_id;
        const resolvedPlanName = obj.plan_name || (plan?.name ? `${plan.name}` : '') || (obj.days ? `${obj.days}-Day Boost` : 'Rental Boost');
        return {
          ...obj,
          vendor_name: vendorMap[String(d.vendor_id)] || 'Unknown Vendor',
          plan_name: resolvedPlanName,
          amount: obj.price, // booster uses 'price', map to 'amount' for frontend consistency
        };
      });

      res.status(httpStatus.OK).send({ success: true, data: enriched });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).send({ success: false, message: error.message });
    }
  },
};

module.exports = {
  createRentalBoostPlan,
  getAllRentalBoostPlans,
  updateRentalBoostPlan,
  deleteRentalBoostPlan,
  purchaseRentalBoostPlan,
  purchaseBulkRentalBoostPlan,
  getVendorRentalBoostPurchases,
  getAllRentalBoostPurchases,
};
