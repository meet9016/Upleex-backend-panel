const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const bannerSchema = mongoose.Schema(
  {
    title: {
      type: String,
    },
    subtitle: {
      type: String,
    },
    description: {
      type: String,
    },
    image: {
      type: String,
      required: true,
    },
    color: {
      type: String,
    },
    link: {
      type: String,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

// add plugin that converts mongoose to json
bannerSchema.plugin(toJSON);

/**
 * @typedef Banner
 */
const Banner = mongoose.model('Banner', bannerSchema);

module.exports = Banner;
