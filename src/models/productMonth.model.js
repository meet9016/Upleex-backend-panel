const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const productMonthSchema = mongoose.Schema(
  {
    month_name: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

productMonthSchema.plugin(toJSON);

const ProductMonth = mongoose.model('ProductMonth', productMonthSchema);

module.exports = ProductMonth;

