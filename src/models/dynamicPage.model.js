const mongoose = require('mongoose');

const dynamicPageSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * @typedef DynamicPage
 */
const DynamicPage = mongoose.model('DynamicPage', dynamicPageSchema);

module.exports = DynamicPage;
