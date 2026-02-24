const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const STATUS = {
  PENDING: 'pending',
  APPROVAL: 'approval',
  REJECT: 'reject',
  COMPLETE: 'complete',
};

const getQuoteSchema = new mongoose.Schema(
  {
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
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Month', // change according to your model name
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
     status: {
      type: String,
      enum: Object.values(STATUS),
      default: STATUS.PENDING,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

getQuoteSchema.plugin(toJSON);

const GetQuote = mongoose.model('GetQuote', getQuoteSchema);

module.exports = GetQuote;