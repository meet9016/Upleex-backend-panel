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
      description: Joi.string().allow(''),
      is_popular: Joi.boolean().default(false),
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
      description: Joi.string().allow(''),
      is_popular: Joi.boolean(),
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

      // 2. Fetch Product (Check if it has priority plan)
      const product = await Product.findById(product_id).session(session);
      if (!product) {
        throw new Error('Product not found');
      }

      if (!product.is_priority) {
        throw new Error('Booster Plan is only available for products with an active Priority Plan');
      }

      // 3. Deduct from Wallet
      const wallet = await Wallet.findOne({ vendor_id }).session(session);
      if (!wallet || wallet.wallet_balance < plan.price) {
        throw new Error('Insufficient wallet balance');
      }

      await walletService.deductMoneyFromWallet(vendor_id, plan.price, `Purchase of ${plan.name} for product: ${product.product_name}`);

      // 4. Update Product Boost Status
      const startDate = new Date();
      const expiryDate = new Date();
      expiryDate.setDate(startDate.getDate() + plan.days);

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
    }),
  },
  handler: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { plan_id } = req.body;
      const vendor_id = req.user.id || req.user._id;

      // 1. Fetch Plan
      const plan = await RentalBoostPlan.findById(plan_id).session(session);
      if (!plan || plan.status !== 'active') {
        throw new Error('Boost plan not found or inactive');
      }

      // 2. Fetch Priority Products (That are not already boosted or have expired boost)
      const now = new Date();
      const priorityProducts = await Product.find({
        vendor_id: vendor_id,
        is_priority: true,
        $or: [
          { is_boosted: { $ne: true } },
          { boost_expiry: { $lte: now } }
        ]
      }).session(session);

      if (priorityProducts.length === 0) {
        throw new Error('No priority products found to boost');
      }

      // 3. Check for existing active Booster Plan for this vendor
      const activePurchase = await RentalBoostPlanPurchase.findOne({
        vendor_id: new mongoose.Types.ObjectId(vendor_id),
        expiry_date: { $gt: now },
        payment_status: 'completed'
      }).sort({ expiry_date: -1 }).session(session);

      let totalPrice = plan.price;
      let expiryDate = new Date();
      expiryDate.setDate(now.getDate() + plan.days);
      const isFreeAddition = !!activePurchase;

      if (isFreeAddition) {
        totalPrice = 0; // FREE addition to existing active booster period
        expiryDate = activePurchase.expiry_date; // Synchronize expiry
      }

      // 4. Check Wallet (only if not free)
      if (totalPrice > 0) {
        const wallet = await Wallet.findOne({ vendor_id }).session(session);
        if (!wallet || wallet.wallet_balance < totalPrice) {
          throw new Error(`Insufficient wallet balance. Total required: ₹${totalPrice}`);
        }
        // Deduct Money
        await walletService.deductMoneyFromWallet(vendor_id, totalPrice, `Bulk Boost for ${priorityProducts.length} products using ${plan.name} (Flat Fee)`);
      }

      // 5. Update All Products
      const startDate = now;
      const productIds = priorityProducts.map(p => p._id);

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

      // 6. Create Purchase Records (only for products that were not already boosted or need record update)
      // For simplicity, we create records for all products being updated in this bulk action
      const perProductPrice = isFreeAddition ? 0 : (plan.price / priorityProducts.length).toFixed(2);
      const purchaseRecords = priorityProducts.map(product => ({
        vendor_id: new mongoose.Types.ObjectId(vendor_id),
        vendor_name: req.user.name || 'Vendor',
        product_id: product._id,
        product_name: product.product_name,
        rental_boost_plan_id: plan._id,
        plan_name: plan.name,
        price: perProductPrice,
        days: isFreeAddition ? Math.ceil((expiryDate - startDate) / (1000 * 60 * 60 * 24)) : plan.days,
        payment_status: 'completed',
        start_date: startDate,
        expiry_date: expiryDate,
        transaction_id: isFreeAddition ? `RB-FREE-${Date.now()}` : `RB-BULK-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      }));

      await RentalBoostPlanPurchase.insertMany(purchaseRecords, { session });

      await session.commitTransaction();
      res.status(httpStatus.OK).send({
        success: true,
        message: `Boosted ${priorityProducts.length} priority products successfully!`,
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
