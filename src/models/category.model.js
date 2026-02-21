const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const categorySchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    image: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

categorySchema.plugin(toJSON);

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;

