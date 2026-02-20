const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const blogsSchema = mongoose.Schema(
  {
    exam_name: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
    },
    sort_description: {
      type: String,
      required: true,
    },
    long_description: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    image: {
      type: String,
      // required: true,
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
  },
  {
    timestamps: true,
  }
);

// add plugin that converts mongoose to json
blogsSchema.plugin(toJSON);

/**
 * @typedef Blogs
 */
const Blogs = mongoose.model('Blogs', blogsSchema);

module.exports = Blogs;
