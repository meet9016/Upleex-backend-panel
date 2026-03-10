const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const wishlistSchema = new mongoose.Schema(
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
  },
  {
    timestamps: true,
  }
);

// Create compound index to prevent duplicate entries
wishlistSchema.index({ user_id: 1, product_id: 1 }, { unique: true });

wishlistSchema.plugin(toJSON);

const Wishlist = mongoose.model('Wishlist', wishlistSchema);

module.exports = Wishlist;