const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const seoBulletSchema = {
  label: { type: String, default: '' },
  text: { type: String, default: '' },
  plain: { type: Boolean, default: false },
};

const seoSectionSchema = {
  heading: { type: String, default: '' },
  heading_level: { type: String, enum: ['h2', 'h3'], default: 'h2' },
  bullets: [seoBulletSchema],
  // legacy
  h2: { type: String, default: '' },
  paragraphs: [{ type: String }],
};

const seoFaqSchema = {
  question: { type: String, default: '' },
  answer: { type: String, default: '' },
};

const categorySchema = mongoose.Schema(
  {
    categories_name: {
      type: String,
      required: true,
      trim: true,
    },
    image: {
      type: String,
    },
    seo_content: {
      meta_title: { type: String, default: '' },
      meta_description: { type: String, default: '' },
      core_keyword: { type: String, default: '' },
      secondary_keywords: { type: String, default: '' },
      image_alt: { type: String, default: '' },
      image_title: { type: String, default: '' },
      anchor_tags: [{ type: String }],
      faqs: [seoFaqSchema],
      hero_title: { type: String, default: '' },
      hero_text: { type: String, default: '' },
      intro_heading: { type: String, default: '' },
      intro_paragraphs: [{ type: String }],
      intro_text: { type: String, default: '' },
      sections: [seoSectionSchema],
      main_text: { type: String, default: '' },
      sub_text: { type: String, default: '' },
    },
  },
  {
    timestamps: true,
  }
);

categorySchema.plugin(toJSON);

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;
