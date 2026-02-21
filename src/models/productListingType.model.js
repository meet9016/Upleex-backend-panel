const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const productListingTypeSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

productListingTypeSchema.plugin(toJSON);

const ProductListingType = mongoose.model(
  'ProductListingType',
  productListingTypeSchema
);

module.exports = ProductListingType;

