const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const productTypeSchema = mongoose.Schema(
  {
    product_type: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

productTypeSchema.plugin(toJSON);

const ProductType = mongoose.model('ProductType', productTypeSchema);

module.exports = ProductType;

