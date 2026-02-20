const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const questionSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    tag:{
      type: String,
      required: true,
    },
    rating: {
      type: Number,
      // required: true,
    },
    total_reviews: {
      type: Number,
      // required: true,
    },
    features: {
      type: [String],
      // required: true,
    },
    sort_description: {
      type: String,
      // required: true,
    },
    description: {
      type: String,
      // required: true,
    },
    price: {
      type: Number
    },
    // duration: {
    //   type: String,
    //   required: true,
    // },
  },
  {
    timestamps: true,
  }
);

// add plugin that converts mongoose to json
questionSchema.plugin(toJSON);

/**
 * @typedef Question
 */
const Question = mongoose.model('Question', questionSchema);

module.exports = Question;
