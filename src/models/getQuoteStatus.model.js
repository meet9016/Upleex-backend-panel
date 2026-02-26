const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const getQuoteStatusSchema = new mongoose.Schema(
  {
    status_name: {
      type: String,
      required: true,
      trim: true,
    }
  },
  {
    timestamps: true,
  }
);

getQuoteStatusSchema.plugin(toJSON);

const GetQuoteStatus = mongoose.model('GetQuoteStatus', getQuoteStatusSchema);

module.exports = GetQuoteStatus;
