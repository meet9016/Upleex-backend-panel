const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const monthPriceSchema = new mongoose.Schema(
  {
    month_name: String,
    price: String,
    cancel_price: String,
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
    specification_id: { type: String, default: '' },
    specification: { type: String, default: '' },
    detail: { type: String, default: '' },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    product_id: {
      type: String,
    },
    category_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    sub_category_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubCategory',
      required: true,
    },
    product_type_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductType',
      required: true,
    },
    product_listing_type_id: {
      type: String,
      // required: true,
    },
    product_name: {
      type: String,
      required: true,
      trim: true,
    },
    sku: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      index: true,
    },
    price: {
      type: String,
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
      required: true
    },
    vendor_name: {
      type: String,
      required: true
    },
    // vendor_image: {
    //   type: String,
    // },
    pricing_type: {
      type: String,
      enum: ['free', 'paid'],
      default: 'paid', // Default to free
      index: true,
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
    status: {
      type: String,
      enum: ['active', 'draft', 'inactive'],
      default: 'active',
      index: true,
    },
    approval_status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    rejection_reason: {
      type: String,
      default: '',
    },
    expires_at: {
      type: Date,
    },
    is_new: {
      type: Boolean,
      default: false,
      index: true,
    },
    deposit_amount: {
      type: String,
      default: '0',
    },
    available_quantity: {
      type: Number,
      default: 1,
      min: 0,
    },
    is_out_of_stock: {
      type: Boolean,
      default: false,
      index: true,
    },
    is_visible: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

productSchema.plugin(toJSON);

// Pre-save hook to convert empty strings to null for ObjectId fields
productSchema.pre('save', function(next) {
  if (this.product_listing_type_id === '') {
    this.product_listing_type_id = null;
  }
  if (this.category_id === '') {
    this.category_id = null;
  }
  if (this.sub_category_id === '') {
    this.sub_category_id = null;
  }
  if (this.product_type_id === '') {
    this.product_type_id = null;
  }
  next();
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
