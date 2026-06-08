const mongoose = require('mongoose');

const generalPlanPurchaseSchema = mongoose.Schema(
  {
    vendor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
    },
    plan_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GeneralPlan',
      required: true,
    },
    plan_type: {
      type: String,
      required: true,
    },
    max_products: {
      type: Number,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    product_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
    ],
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled'],
      default: 'active',
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    expire_at: {
      type: Date,
      default: function () {
        // Let's say general plan lasts for 30 days
        const date = new Date();
        date.setDate(date.getDate() + 30);
        return date;
      },
    },
  },
  {
    timestamps: true,
  }
);

const GeneralPlanPurchase = mongoose.model('GeneralPlanPurchase', generalPlanPurchaseSchema);

module.exports = GeneralPlanPurchase;
