const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const rentalBoostPlanPurchaseSchema = new mongoose.Schema(
  {
    vendor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    vendor_name: { type: String, required: true },
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    product_name: { type: String, required: true },
    rental_boost_plan_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RentalBoostPlan',
      required: true,
    },
    plan_name: { type: String, required: false, default: '' },
    price: { type: Number, required: true },
    days: { type: Number, required: true },
    payment_status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
    },
    transaction_id: { type: String, default: '' },
    start_date: { type: Date },
    expiry_date: { type: Date },
  },
  { timestamps: true }
);

rentalBoostPlanPurchaseSchema.plugin(toJSON);

const RentalBoostPlanPurchase = mongoose.model(
  'RentalBoostPlanPurchase',
  rentalBoostPlanPurchaseSchema
);
module.exports = RentalBoostPlanPurchase;
