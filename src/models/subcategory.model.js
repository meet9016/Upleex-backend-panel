const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const subCategorySchema = mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
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

subCategorySchema.plugin(toJSON);

const SubCategory = mongoose.model('SubCategory', subCategorySchema);

module.exports = SubCategory;

