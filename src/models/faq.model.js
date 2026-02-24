const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const faqSchema = mongoose.Schema(
  {
    question: {
      type: String,
      required: true,
      trim: true,
    },
    answer: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

faqSchema.plugin(toJSON);

const FAQ = mongoose.model('FAQ', faqSchema);

module.exports = FAQ;

