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
      maxlength: 5000,
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
    razorpay_payment_link: {
      type: String,
    },
    razorpay_payment_id: {
      type: String,
    },
    razorpay_order_id: {
      type: String,
    },
    razorpay_signature: {
      type: String,
    },
    payment_status: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
      default: 'pending',
    },
    isNew: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

getQuoteSchema.plugin(toJSON);

// auto mark quote as old after 24 hours
// getQuoteSchema.pre('findOne', function() {
//   const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
//   const now = new Date();
  
//   this.exec = async function() {
//     const result = await this.model.collection.findOne(this.getFilter());
//     if (result && result.createdAt) {
//       const createdTime = new Date(result.createdAt).getTime();
//       const timePassed = now.getTime() - createdTime;
      
//       if (timePassed > TWENTY_FOUR_HOURS && result.isNew === true) {
//         await this.model.updateOne(
//           { _id: result._id },
//           { isNew: false }
//         );
//       }
//     }
//     return result;
//   };
// });

// ORRRRR  -----> Add a virtual field or method to check if quote is new
// getQuoteSchema.methods.canShowAsNew = function() {
//   const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
//   const createdTime = new Date(this.createdAt).getTime();
//   const now = new Date().getTime();
//   const timePassed = now - createdTime;
//   return this.isNew === true && timePassed <= TWENTY_FOUR_HOURS;
// };

const GetQuote = mongoose.model('GetQuote', getQuoteSchema);

module.exports = GetQuote;
