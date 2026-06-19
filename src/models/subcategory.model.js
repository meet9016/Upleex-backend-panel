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
    hsnCodes: [{
      materialType: { type: String, trim: true },
      code: { type: String, trim: true }
    }],
    gst: {
      type: Number,
      default: 0,
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
    slug: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

subCategorySchema.plugin(toJSON);

// Helper to generate a URL-friendly slug
const generateSlug = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ''); 
};

// Pre-save hook to generate slug
subCategorySchema.pre('save', async function(next) {
  // Generate unique slug
  if (this.isModified('name') || !this.slug) {
    let baseSlug = generateSlug(this.name);
    let uniqueSlug = baseSlug;
    let counter = 1;

    const SubCategoryModel = this.constructor;
    while (true) {
      const existingSubCategory = await SubCategoryModel.findOne({ slug: uniqueSlug });
      if (!existingSubCategory || existingSubCategory._id.equals(this._id)) {
        break;
      }
      uniqueSlug = `${baseSlug}${counter}`;
      counter++;
    }
    this.slug = uniqueSlug;
  }
  next();
});

const SubCategory = mongoose.model('SubCategory', subCategorySchema);

module.exports = SubCategory;


