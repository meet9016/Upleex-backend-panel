const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const cartSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    qty: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    status: {
      type: String,
      enum: ['active', 'ordered', 'deleted'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

cartSchema.plugin(toJSON);

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;
