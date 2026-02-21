const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const monthPriceSchema = new mongoose.Schema(
  {
    month_price: String,
    month_cancel_price: String,
    months_id: String,
    product_months_id: String,
  },
  { _id: false }
);

const imageSchema = new mongoose.Schema(
  {
    product_image_id: String,
    image: String,
  },
  { _id: false }
);

const productDetailSchema = new mongoose.Schema(
  {
    specification_id: String,
    specification: String,
    detail: String,
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    product_id: {
      type: String,
    },
    category_id: {
      type: String,
      required: true,
    },
    sub_category_id: {
      type: String,
      required: true,
    },
    product_type_id: {
      type: String,
      required: true,
    },
    product_listing_type_id: {
      type: String,
      required: true,
    },
    product_name: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: String,
      required: true,
    },
    cancel_price: {
      type: String,
    },
    description: {
      type: String,
    },
    product_main_image: {
      type: String,
    },
    category_name: {
      type: String,
    },
    sub_category_name: {
      type: String,
    },
    no: {
      type: String,
    },
    product_type_name: {
      type: String,
    },
    product_listing_type_name: {
      type: String,
    },
    vendor_id: {
      type: String,
    },
    vendor_name: {
      type: String,
    },
    vendor_image: {
      type: String,
    },
    month_arr: {
      type: [monthPriceSchema],
      default: [],
    },
    images: {
      type: [imageSchema],
      default: [],
    },
    product_details: {
      type: [productDetailSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

productSchema.plugin(toJSON);

const Product = mongoose.model('Product', productSchema);

module.exports = Product;

