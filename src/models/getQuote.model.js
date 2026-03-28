const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const STATUS = {
  PENDING: 'pending',
  APPROVAL: 'approval',
  REJECT: 'reject',
  COMPLETE: 'complete',
  SUCCESSFUL: 'successful',
  DELIVERY: 'delivery',
};

const getQuoteSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product', // make sure Product model exists
      required: true,
    },

    delivery_date: {
      type: Date,
    },

    number_of_days: {
      type: Number,
      min: 0,
    },

    months_id: {
      type: String,
    },

    qty: {
      type: Number,
      min: 1,
    //   default: 1,
    },

    note: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    
    calculated_price: {
      type: Number,
      default: 0,
    },
    
    price_details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    
     status: {
      type: String,
      enum: Object.values(STATUS),
      default: STATUS.PENDING,
      index: true,
    },
    start_date: {
      type: Date,
    },
    end_date: {
      type: Date,
    },
    start_time: {
      type: String,
      trim: true,
    },
    end_time: {
      type: String,
      trim: true,
    },
    upload_image: {
      type: String,
    },
    upload_video: {
      type: String,
    },
    return_image: {
      type: String,
    },
    return_video: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

getQuoteSchema.plugin(toJSON);

const GetQuote = mongoose.model('GetQuote', getQuoteSchema);

module.exports = GetQuote;
